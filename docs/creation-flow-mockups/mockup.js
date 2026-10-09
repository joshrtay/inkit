// Shared by the creation-flow mockups (docs/creation-flow.md). Not product code: it puts the
// generated drawings (boards.js, made with the real sketchpad and picture code) into the pages,
// adds the site's pen wobble (root.tsx's #pen) and the watercolour filter (a copy of
// src/lib/ink.ts), and draws the chrome's icons (SketchpadIcons.tsx).
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const ICONS = {
    grid: ["M4 4h16v16H4z", "M9.33 4v16", "M14.67 4v16", "M4 9.33h16", "M4 14.67h16"],
    pen: ["M4.5 19.5l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.7 18.5z", "M13.8 7l3.2 3.2"],
    line: ["M5.5 18.5l13-13", "M5.5 20.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z", "M18.5 7.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"],
    wash: ["M12 3.5c3.4 4 6 7.3 6 10.3a6 6 0 0 1-12 0c0-3 2.6-6.3 6-10.3z", "M9.2 14.6a2.9 2.9 0 0 0 2.4 2.6"],
    stamp: ["M9.5 3.5h5v3.2a2 2 0 0 1-.9 1.7l-.6.4V12h4.5a2 2 0 0 1 2 2v2.5h-15V14a2 2 0 0 1 2-2H11V8.8l-.6-.4a2 2 0 0 1-.9-1.7z", "M5.5 20.5h13"],
    text: ["M5 7V4.5h14V7", "M12 4.5v15", "M9 19.5h6"],
    erase: ["M8.5 20h11", "M4.9 13.9l8.5-8.5a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8L10.4 18.8a2 2 0 0 1-1.4.6H7.7a2 2 0 0 1-1.4-.6l-1.4-1.4a2 2 0 0 1 0-2.8z", "M9 9.8l5.2 5.2"],
    undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
    redo: ["M15 14l5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
    clear: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
    magnet: ["M5 4h4.5v8a2.5 2.5 0 0 0 5 0V4H19v8a7 7 0 0 1-14 0z", "M5 8.5h4.5", "M14.5 8.5H19"],
    zoomIn: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4", "M8 11h6", "M11 8v6"],
    zoomOut: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4", "M8 11h6"],
    close: ["M6 6l12 12", "M18 6L6 18"],
    palette: ["M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.1-.9-1.5-.9-2.5 0-1 .8-1.6 1.8-1.6h2.1a3.7 3.7 0 0 0 3.7-3.7c0-4.2-3.8-7.5-8.5-7.5z", "M7.8 12.2h.01", "M9.7 8h.01", "M14.3 8h.01"],
    back: ["m15 18-6-6 6-6"],
    book: ["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z", "M4 21V5", "M8 7h7", "M8 11h5"],
    photo: ["M4 7h3l2-2.5h6L17 7h3v12H4z", "M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"],
    sparkle: ["M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z", "M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"],
    check: ["M5 12.5l4.5 4.5L19 7.5"],
    warn: ["M12 4 2.8 19.5h18.4z", "M12 10v4.5", "M12 17h.01"],
    rules: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
    play: ["M7 4.5v15l12-7.5z"],
    chevron: ["m6 9 6 6 6-6"],
    plus: ["M12 5v14", "M5 12h14"],
    search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
    upload: ["M12 16V4", "m7 9 5-5 5 5", "M5 20h14"],
    reset: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9", "M4.5 4v5h5"],
    eye: ["M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z", "M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z"],
    more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  };
  const icon = (name, cls = "sp-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${(ICONS[name] || []).map((d) => `<path d="${d}"/>`).join("")}</svg>`;

  // the watercolour filter (src/lib/ink.ts), for a board `u` units per pixel
  function washSteps(u) {
    const darker = (k, a = 1) => `${k} 0 0 0 0  0 ${k} 0 0 0  0 0 ${k} 0 0  0 0 0 ${a} 0`;
    return [
      ["feTurbulence", { type: "fractalNoise", baseFrequency: 0.025 / u, numOctaves: 3, seed: 3, result: "blot" }],
      ["feTurbulence", { type: "fractalNoise", baseFrequency: `${0.006 / u} ${0.09 / u}`, numOctaves: 2, seed: 8, result: "streak" }],
      ["feDisplacementMap", { in: "SourceGraphic", in2: "blot", scale: 5 * u, xChannelSelector: "R", yChannelSelector: "G", result: "shape" }],
      ["feMorphology", { in: "shape", operator: "erode", radius: 4 * u, result: "core0" }],
      ["feGaussianBlur", { in: "core0", stdDeviation: 3.5 * u, result: "core" }],
      ["feComposite", { in: "shape", in2: "core", operator: "out", result: "rim0" }],
      ["feColorMatrix", { in: "rim0", type: "matrix", values: darker(0.62), result: "rim" }],
      ["feColorMatrix", { in: "blot", type: "matrix", values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.75 0 0 0 -0.33", result: "light0" }],
      ["feComposite", { in: "light0", in2: "shape", operator: "in", result: "light" }],
      ["feColorMatrix", { in: "shape", type: "matrix", values: darker(0.8), result: "deep" }],
      ["feColorMatrix", { in: "streak", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.85", result: "streakA" }],
      ["feComposite", { in: "deep", in2: "streakA", operator: "in", result: "streaks" }],
      ["feMerge", { result: "paint" }, ["shape", "light", "streaks", "rim"].map((n) => ["feMergeNode", { in: n }])],
      ["feGaussianBlur", { in: "paint", stdDeviation: 0.5 * u }],
    ];
  }
  let boards = 0;
  function addInk(svg, shown) {
    const vb = svg.viewBox.baseVal, u = (vb && vb.width ? vb.width : 400) / (shown || 600);
    const id = `ink${++boards}-wash`;
    const build = ([tag, attrs, children], parent) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, String(attrs[k]));
      parent.appendChild(n);
      (children || []).forEach((c) => build(c, n));
      return n;
    };
    const defs = document.createElementNS(NS, "defs");
    svg.insertBefore(defs, svg.firstChild);
    build(["filter", { id, x: "-15%", y: "-15%", width: "130%", height: "130%", "color-interpolation-filters": "sRGB" }, washSteps(u)], defs);
    svg.style.setProperty("--wash", `url(#${id})`);
  }

  const get = (path) => path.split(".").reduce((o, k) => (o ? o[k] : undefined), window.BOARDS);

  /** Grid geometry helpers for overlays, in page units. */
  function geo(g) {
    return {
      g, S: g.S,
      cx: (c) => g.x + (c + 0.5) * g.S, cy: (r) => g.y + (r + 0.5) * g.S,
      x: (c) => g.x + c * g.S, y: (r) => g.y + r * g.S,
      // hexagons (model.ts hexCentre, HEX_SIDE = 1/sqrt(3))
      hx: (r, c) => g.x + (c + 0.5 + 0.5 * (r % 2)) * g.S, hy: (r) => g.y + (0.57735 + r * 1.5 * 0.57735) * g.S,
    };
  }

  window.MK = { icon, geo, overlays: {} };

  document.addEventListener("DOMContentLoaded", () => {
    // the pen wobble
    document.body.insertAdjacentHTML("afterbegin", `<svg class="ink-defs" aria-hidden="true"><filter id="pen" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
    document.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon, el.dataset.iconClass || "sp-icon")));
    document.querySelectorAll("[data-board]").forEach((el) => {
      const b = get(el.dataset.board);
      if (!b) return;
      el.innerHTML = typeof b === "string" ? b : b.svg;
      const svg = el.querySelector("svg");
      if (!svg) return;
      if (svg.querySelector("filter")) { /* a picture brings its own */ } else if (svg.classList.contains("sp-board")) addInk(svg, 600 * (400 / 560));   // as the sketchpad: a 400-unit filter on a 560 page
      else addInk(svg, el.dataset.shown ? Number(el.dataset.shown) : 600);
      const draw = window.MK.overlays[el.dataset.overlay || el.dataset.board];
      const ui = svg.querySelector(".mk-ui");
      if (draw && ui && b.grid) ui.innerHTML = draw(geo(b.grid), b);
    });
  });
})();
