// The Explore mockups' only script (not product code): it adds the site's pen wobble (root.tsx's
// #pen filter) and puts each puzzle's picture (pictures.js, drawn by the real picture code) in place.
document.addEventListener("DOMContentLoaded", () => {
  document.body.insertAdjacentHTML("afterbegin", `<svg class="ink-defs" aria-hidden="true"><filter id="pen" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
  document.querySelectorAll("[data-pic]").forEach((el) => { el.innerHTML = (window.PICS || {})[el.dataset.pic] || ""; });
});
