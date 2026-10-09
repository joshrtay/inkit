// Shared by the v3 mockups, after mockup.js (which puts the generated drawings in, adds the pen
// wobble and the watercolour, and draws the chrome's icons). Not product code. It adds a few
// icons, places tips on the paper in page units (as Paint does: .sp-paper-tip at the mark's tip),
// and mounts the real player (v3-player.js) where a page asks for it.
(function () {
  const ICONS = {
    types: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
    checklist: ["M10 6h10", "M10 12h10", "M10 18h10", "M3.5 6l1.5 1.5L7.5 5", "M3.5 12l1.5 1.5L7.5 11", "M3.5 18l1.5 1.5L7.5 17"],
    collapse: ["m13 6 6 6-6 6", "m5 6 6 6-6 6"],
    expand: ["m11 6-6 6 6 6", "m19 6-6 6 6 6"],
    download: ["M12 4v12", "m7 11 5 5 5-5", "M5 20h14"],
    straight: ["M5 19 19 5", "M5 19h.01", "M19 5h.01"],
    copy: ["M8 8h11v11H8z", "M5 16V5h11"],
    photo: ["M4 7h3l2-2.5h6L17 7h3v12H4z", "M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"],
    pencil: ["M4.5 19.5l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.7 18.5z", "M13.8 7l3.2 3.2"],
    rotate: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9", "M4.5 4v5h5"],
    flip: ["M12 3v18", "M8 7 3 12l5 5z", "M16 7l5 5-5 5z"],
    feed: ["M4 5h16v6H4z", "M4 15h7v4H4z", "M14 15h6v4h-6z"],
    grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
    cursor: ["M5 3l14 8-6.5 1.5L10 19z"],
  };
  const svg = (name, cls = "sp-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${(ICONS[name] || []).map((d) => `<path d="${d}"/>`).join("")}</svg>`;
  window.V3 = { icon: svg };
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-icon3]").forEach((el) => el.insertAdjacentHTML("afterbegin", svg(el.dataset.icon3, el.dataset.iconClass || "sp-icon")));
    // a tip at a mark, in page units (560 a side): left and top as a share of the paper
    document.querySelectorAll("[data-at]").forEach((el) => {
      const [x, y] = el.dataset.at.split(",").map(Number);
      el.style.left = `${(x / 560) * 100}%`;
      el.style.top = `${(y / 560) * 100}%`;
    });
    // the real player, with the creator's play so far; `data-play="solved"` finishes it
    document.querySelectorAll("[data-play]").forEach((el) => {
      const P = window.BOARDS.publish;
      // "almost": every square but the last one the creator has left
      const progress = el.dataset.play === "almost"
        ? { digit: P.progress.digit.map((v, i) => (P.left.includes(i) && i !== P.left[P.left.length - 1] ? P.solution[i] : v)) } : P.progress;
      window.MKPlay(el, { spec: P.spec, layout: P.layout }, progress, () => document.dispatchEvent(new CustomEvent("mk-solved")));
    });
  });
})();
