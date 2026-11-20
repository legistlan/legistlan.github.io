// Visor de los grafos semánticos (grafos.qmd). Lee grafos/datos/indice.json y un JSON por grafo
// (grafo/exporta.py) y los dibuja en un canvas con D3: acercar, mover, pasar el cursor, elegir un nodo
// para ver sus vecinos, apagar grupos y buscar por título.
(function () {
  const BASE = "grafos/datos/";
  const LADO = 4095;
  const raiz = document.getElementById("visor");
  if (!raiz) return;

  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  const plano = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const miles = (n) => n.toLocaleString("es-MX");

  // --- armazón ---
  const barra = el("div", "visor-barra");
  const selector = el("select");
  selector.setAttribute("aria-label", "Grafo");
  const busca = el("input");
  busca.type = "search";
  busca.placeholder = "Buscar en los títulos…";
  busca.setAttribute("aria-label", "Buscar en los títulos");
  const reinicia = el("button", null, "Vista completa");
  reinicia.type = "button";
  barra.append(selector, busca, reinicia);

  const cuerpo = el("div", "visor-cuerpo");
  const lienzo = el("div", "visor-lienzo");
  const canvas = el("canvas");
  const globo = el("div", "visor-globo");
  globo.hidden = true;
  const aviso = el("div", "visor-aviso", "Cargando…");
  lienzo.append(canvas, globo, aviso);
  const panel = el("div", "visor-panel");
  const ficha = el("div", "visor-ficha");
  const leyenda = el("div", "visor-leyenda");
  const detalle = el("div", "visor-detalle");
  panel.append(ficha, leyenda, detalle);
  cuerpo.append(lienzo, panel);
  raiz.append(barra, cuerpo);

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let G = null;             // grafo cargado
  let T = d3.zoomIdentity;  // transformación actual
  let elegido = -1, encima = -1;
  let hallados = null;      // Uint8Array con los nodos que coinciden con la búsqueda
  let pendiente = false;

  const escala = () => Math.min(W, H) / LADO;
  const px = (i) => T.applyX(G.x[i] * escala() + (W - LADO * escala()) / 2);
  const py = (i) => T.applyY((LADO - G.y[i]) * escala() + (H - LADO * escala()) / 2);

  function mide() {
    dpr = window.devicePixelRatio || 1;
    W = lienzo.clientWidth;
    H = lienzo.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    pinta();
  }

  function pinta() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; dibuja(); });
  }

  function dibuja() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!G) return;
    const n = G.x.length, k = T.k;
    const X = new Float32Array(n), Y = new Float32Array(n);
    const ve = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      X[i] = px(i); Y[i] = py(i);
      ve[i] = !G.oculto[G.g[i]] && X[i] > -5 && X[i] < W + 5 && Y[i] > -5 && Y[i] < H + 5 ? 1 : 0;
    }
    // aristas: sólo cuando caben (grafo chico o vista acercada)
    let visibles = 0;
    for (let i = 0; i < n; i++) visibles += ve[i];
    if (visibles <= 9000) {
      ctx.strokeStyle = "rgba(60,60,58,0.16)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let j = 0; j < G.e.length; j += 2) {
        const a = G.e[j], b = G.e[j + 1];
        if (!(ve[a] || ve[b]) || G.oculto[G.g[a]] || G.oculto[G.g[b]]) continue;
        ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[b], Y[b]);
      }
      ctx.stroke();
    }
    const r = Math.max(1.1, Math.min(6, 1.1 * Math.sqrt(k) * (n < 5000 ? 1.8 : 1)));
    const atenua = hallados !== null;
    for (let pasada = 0; pasada < (atenua ? 2 : 1); pasada++) {
      for (let g = G.grupos.length - 1; g >= 0; g--) {
        if (G.oculto[g]) continue;
        ctx.fillStyle = G.grupos[g].color;
        ctx.globalAlpha = atenua && pasada === 0 ? 0.12 : 0.85;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (!ve[i] || G.g[i] !== g) continue;
          if (atenua && (pasada === 1) !== (hallados[i] === 1)) continue;
          const rr = atenua && pasada === 1 ? r + 1 : r;
          if (rr < 2) ctx.rect(X[i] - rr, Y[i] - rr, 2 * rr, 2 * rr);
          else { ctx.moveTo(X[i] + rr, Y[i]); ctx.arc(X[i], Y[i], rr, 0, 6.2832); }
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (elegido >= 0) {
      ctx.strokeStyle = "#0b0b0b";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const v of G.vec[elegido]) { ctx.moveTo(X[elegido], Y[elegido]); ctx.lineTo(X[v], Y[v]); }
      ctx.stroke();
      for (const v of G.vec[elegido]) anillo(X[v], Y[v], r + 2.5, G.grupos[G.g[v]].color);
      anillo(X[elegido], Y[elegido], r + 4, "#0b0b0b");
    }
    if (encima >= 0 && encima !== elegido) anillo(X[encima], Y[encima], r + 3, "#0b0b0b");
  }

  function anillo(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  // nodo visible más cercano al cursor (a lo más 10 px)
  function cercano(mx, my) {
    if (!G) return -1;
    let mejor = -1, d2 = 100;
    const s = escala(), ox = (W - LADO * s) / 2, oy = (H - LADO * s) / 2;
    const cx = (T.invertX(mx) - ox) / s, cy = LADO - (T.invertY(my) - oy) / s;
    const radio = 10 / (s * T.k);
    G.arbol.visit((nodo, x0, y0, x1, y1) => {
      if (x0 > cx + radio || x1 < cx - radio || y0 > cy + radio || y1 < cy - radio) return true;
      if (!nodo.length) {
        let q = nodo;
        do {
          const i = q.data;
          if (!G.oculto[G.g[i]]) {
            const dx = px(i) - mx, dy = py(i) - my, d = dx * dx + dy * dy;
            if (d < d2) { d2 = d; mejor = i; }
          }
        } while ((q = q.next));
      }
      return false;
    });
    return mejor;
  }

  function fila(i, alElegir) {
    const b = el("button", "visor-fila");
    b.type = "button";
    const punto = el("span", "visor-punto");
    punto.style.background = G.grupos[G.g[i]].color;
    b.append(punto, el("span", null, G.t[i] || G.id[i]));
    b.addEventListener("click", () => alElegir(i));
    b.addEventListener("mouseenter", () => { encima = i; pinta(); });
    b.addEventListener("mouseleave", () => { encima = -1; pinta(); });
    return b;
  }

  function elige(i) {
    elegido = i;
    detalle.replaceChildren();
    if (i >= 0) {
      detalle.append(el("h4", null, G.t[i] || "(sin título)"));
      detalle.append(el("p", "visor-id", G.id[i] + " · " + G.grupos[G.g[i]].nombre));
      if (G.vec[i].length) {
        detalle.append(el("p", "visor-sub", "Vecinos más cercanos" + (G.muestra ? " (entre los nodos de la muestra)" : "")));
        for (const v of G.vec[i]) detalle.append(fila(v, elige));
      } else {
        detalle.append(el("p", "visor-sub", "Sus vecinos más cercanos no quedaron en la muestra."));
      }
    } else if (hallados) {
      listaHallados();
    }
    pinta();
  }

  function listaHallados() {
    const ids = [];
    for (let i = 0; i < hallados.length && ids.length < 40; i++) if (hallados[i]) ids.push(i);
    let total = 0;
    for (let i = 0; i < hallados.length; i++) total += hallados[i];
    detalle.replaceChildren(el("p", "visor-sub", miles(total) + " nodos coinciden" + (total > ids.length ? "; los primeros " + ids.length + ":" : ":")));
    for (const i of ids) detalle.append(fila(i, elige));
  }

  function buscar() {
    const q = plano(busca.value.trim());
    if (!G || q.length < 3) { hallados = null; if (elegido < 0) detalle.replaceChildren(); pinta(); return; }
    hallados = new Uint8Array(G.x.length);
    for (let i = 0; i < G.tp.length; i++) if (G.tp[i].includes(q)) hallados[i] = 1;
    elegido = -1;
    listaHallados();
    pinta();
  }

  function armaLeyenda() {
    leyenda.replaceChildren();
    G.grupos.forEach((g, i) => {
      const b = el("button", "visor-grupo");
      b.type = "button";
      b.setAttribute("aria-pressed", "true");
      const punto = el("span", "visor-punto");
      punto.style.background = g.color;
      b.append(punto, el("span", null, g.nombre), el("span", "visor-n", miles(g.n)));
      b.addEventListener("click", () => {
        G.oculto[i] = !G.oculto[i];
        b.setAttribute("aria-pressed", String(!G.oculto[i]));
        b.classList.toggle("apagado", G.oculto[i]);
        pinta();
      });
      leyenda.append(b);
    });
  }

  const zoom = d3.zoom().scaleExtent([0.8, 80]).on("zoom", (ev) => { T = ev.transform; globo.hidden = true; pinta(); });
  d3.select(canvas).call(zoom).on("dblclick.zoom", null);

  canvas.addEventListener("mousemove", (ev) => {
    const r = canvas.getBoundingClientRect();
    const i = cercano(ev.clientX - r.left, ev.clientY - r.top);
    if (i !== encima) { encima = i; pinta(); }
    if (i >= 0) {
      globo.textContent = G.t[i] || G.id[i];
      globo.hidden = false;
      globo.style.left = Math.min(ev.clientX - r.left + 14, W - 260) + "px";
      globo.style.top = (ev.clientY - r.top + 14) + "px";
      canvas.style.cursor = "pointer";
    } else {
      globo.hidden = true;
      canvas.style.cursor = "grab";
    }
  });
  canvas.addEventListener("mouseleave", () => { encima = -1; globo.hidden = true; pinta(); });
  canvas.addEventListener("click", (ev) => {
    const r = canvas.getBoundingClientRect();
    elige(cercano(ev.clientX - r.left, ev.clientY - r.top));
  });
  reinicia.addEventListener("click", () => d3.select(canvas).transition().duration(300).call(zoom.transform, d3.zoomIdentity));
  busca.addEventListener("input", buscar);
  window.addEventListener("resize", mide);

  async function carga(info) {
    aviso.hidden = false;
    aviso.textContent = "Cargando " + info.titulo + "…";
    G = null; elegido = -1; encima = -1; hallados = null;
    detalle.replaceChildren(); leyenda.replaceChildren(); ficha.replaceChildren();
    pinta();
    let d;
    try {
      const resp = await fetch(BASE + info.clave + ".json");
      if (!resp.ok) throw new Error(resp.status);
      d = await resp.json();
    } catch (e) {
      aviso.textContent = "No se pudo cargar el grafo (" + e.message + ").";
      return;
    }
    if (selector.value !== info.clave) return;      // se eligió otro mientras cargaba
    const n = d.x.length;
    d.oculto = d.grupos.map(() => false);
    d.muestra = d.nodos < d.nodos_total;
    d.tp = d.t.map(plano);
    d.vec = Array.from({ length: n }, () => []);
    for (let j = 0; j < d.e.length; j += 2) d.vec[d.e[j]].push(d.e[j + 1]);
    d.arbol = d3.quadtree().x((i) => d.x[i]).y((i) => d.y[i]).addAll(d3.range(n));
    G = d;
    ficha.append(el("p", null, d.muestra
      ? miles(d.nodos) + " nodos de muestra, de " + miles(d.nodos_total) + " documentos."
      : miles(d.nodos) + " documentos, todos."));
    const p = el("p", "visor-sub");
    p.append("Vecinos: " + d.vecinos + ". Peso del contexto: " + d.peso_contexto + ". ");
    const a = el("a", null, "Imagen con todos los nodos");
    a.href = BASE + info.clave + ".png";
    a.target = "_blank";
    a.rel = "noopener";
    p.append(a);
    ficha.append(p);
    armaLeyenda();
    aviso.hidden = true;
    d3.select(canvas).call(zoom.transform, d3.zoomIdentity);
    buscar();
  }

  fetch(BASE + "indice.json").then((r) => r.json()).then((indice) => {
    indice.sort((a, b) => (b.colecciones.length > 1) - (a.colecciones.length > 1) || a.titulo.localeCompare(b.titulo, "es"));
    for (const g of indice) {
      const o = el("option", null, g.titulo + " · " + miles(g.nodos_total) + " documentos");
      o.value = g.clave;
      selector.append(o);
    }
    const inicial = indice.find((g) => g.colecciones.length === 1 && g.colecciones[0] === "benchmark_normas_ambientales") || indice[0];
    selector.value = inicial.clave;
    selector.addEventListener("change", () => carga(indice.find((g) => g.clave === selector.value)));
    mide();
    carga(inicial);
  }).catch(() => { aviso.textContent = "No están los datos de los grafos (falta correr grafo/exporta.py)."; });
})();
