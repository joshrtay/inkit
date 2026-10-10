// Builds the lists mockups (docs/lists-mockups/*.html): system B in docs/research-lists.md, "search
// is the list", from its first step, next and back from where you came. The puzzle page, its board
// (before and after a solve), the nav and the cards are the real site's, taken by capture.mjs;
// the site's own CSS is linked from the repo, and lists.css adds the new pieces. Not product code.
//
// For the mockup, Slate's easy Akari stand in for more of Wyatt's (retitled), so the list
// "akari easy by:wyatt" has cards to show; its 41 is invented.
//
// Run from the repo root: node docs/lists-mockups/capture.mjs (needs the local site on :5173),
// then node docs/lists-mockups/make.mjs, then node docs/lists-mockups/shoot.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const F = JSON.parse(readFileSync(`${dir}fragments.json`, "utf8"));
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- icons

const P = {
  list: ["M9 6h11", "M9 12h11", "M9 18h11", "M4.5 6h.01", "M4.5 12h.01", "M4.5 18h.01"],
  chevL: ["m15 18-6-6 6-6"], chevR: ["m9 18 6-6-6-6"], down: ["m6 9 6 6 6-6"],
  x: ["M18 6 6 18", "M6 6l12 12"], plus: ["M12 5v14", "M5 12h14"],
  share: ["M12 3v12", "m7 8 5-5 5 5", "M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"],
  play: ["M7 4.5v15l12-7.5z"],
  bookmark: ["M6 3h12v18l-6-4.5L6 21z"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
};
const ico = (n, cls = "mini-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n].map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const CHECK = `<span class="solved-badge" role="img" aria-label="Solved" title="Solved"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 54 C24 61 32 69 39 80 C52 57 68 36 88 16" /></svg></span>`;

// ---------------------------------------------------------------- the real pieces

const wyattAvatar = F.cards.find((c) => c.includes("/g/akari-1")).match(/<span class="by">([\s\S]*?)<\/span><span class="card-foot">/)[1];
const EASY = `<span class="diff" role="img" aria-label="Difficulty: Easy" title="Easy"><i class="on"></i><i></i><i></i></span>`;
// the list "akari easy by:wyatt", newest first: Wyatt's own Akari, and Slate's standing in for more
const TITLES = { "/g/akari-3": "Secret Code", "/g/akari-4": "Letters in the Dark", "/g/akari-2": "Night Shift", "/g/akari-1": "Lights On" };
const MORE = ["Porch Light", "Two Lamps", "Back Stairs", "Lantern Row", "Attic", "Garden Path", "Corner Shop", "Night Bus", "Lighthouse", "Candle", "Hallway"];
const byHref = new Map(F.cards.map((c) => [c.match(/href="([^"]+)"/)[1], c]));
const order = ["/g/akari-3", "/g/akari-4", "/g/akari-1", "/g/akari-2", ...F.cards.map((c) => c.match(/href="([^"]+)"/)[1]).filter((h) => !TITLES[h])];
let m = 0;
const listCards = order.map((h, i) => {
  let c = byHref.get(h);
  const title = TITLES[h] ?? MORE[m++];
  c = c.replace(/<strong>[^<]*<\/strong>/, `<strong>${esc(title)}</strong>`)
    .replace(/<span class="by">[\s\S]*?<\/span><span class="card-foot">/, `<span class="by">${wyattAvatar}</span><span class="card-foot">`)
    .replace(/<span class="diff"[\s\S]*?<\/span>/, EASY)
    .replace(/<span class="when">[^<]*<\/span>/, `<span class="when">${i < 2 ? "2 d ago" : i < 4 ? "3 d ago" : `${Math.round(4 + i * 1.6)} d ago`}</span>`)
    .replace(/ data-discover="true"/g, "");
  return { href: h, title, html: c };
});
const pic = (card) => card.match(/<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>/)[0].replace("pic thumb", "pic kept-pic");
const solvedCard = (html) => html.replace(/(<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>)/, `<span class="feed-pic-wrap">$1${CHECK}</span>`);

// the nav item labelled `label`: its whole <a> or <button>, handed to `fn`
function item(html, label, fn) {
  const at = html.indexOf(`<span>${label}</span>`);
  if (at < 0) return html;
  const start = Math.max(html.lastIndexOf("<a ", at), html.lastIndexOf("<button ", at));
  const close = html.slice(start, start + 2) === "<a" ? "</a>" : "</button>";
  const end = html.indexOf(close, at) + close.length;
  return html.slice(0, start) + fn(html.slice(start, end)) + html.slice(end);
}
const nav = (active) => {
  let s = F.sidenav.replace(/ data-discover="true"/g, "").replace(/ class="nav-item active" aria-current="page"/, ` class="nav-item"`);
  // signed in as Robin: Sign in is More
  s = item(s, "Sign in", () => `<button type="button" class="nav-item"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg><span>More</span></button>`);
  if (active) s = item(s, active, (t) => t.replace(`class="nav-item"`, `class="nav-item active" aria-current="page"`));
  return s;
};
const tabbar = (active) => {
  let s = F.tabbar.replace(/ data-discover="true"/g, "").replace(/ class="active" aria-current="page"/, "");
  if (active) s = item(s, active, (t) => t.replace(/^<a( class="")?/, `<a class="active" aria-current="page"`));
  return s;
};

const page = (title, body, { active = "", cls = "", after = "" } = {}) => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- A mockup of lists (not product code). Generated by make.mjs; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="lists.css">
</head>
<body class="${cls}">
${F.defs}
<script>addEventListener("load", () => document.querySelectorAll(".solved-stamp").forEach((st) => {
  const sheet = st.closest(".sheet"), frame = sheet.querySelector("svg.board .frame") || sheet.querySelector("svg.board");
  const a = sheet.getBoundingClientRect(), f = frame.getBoundingClientRect();
  st.style.left = ((f.right - a.left) / a.width * 100) + "%"; st.style.top = ((f.top - a.top) / a.height * 100) + "%";
}));</script>
<div class="shell">${nav(active)}<div class="page">${body}</div>${tabbar(active === "Explore" ? "Explore" : "")}</div>${after}
</body></html>
`;

// ---------------------------------------------------------------- 1, 2, 6: the puzzle page, in a list

const LIST = { name: "Easy Akari by @wyatt", q: "akari easy by:wyatt", n: 41 };
const head = F.head.replace(/ data-discover="true"/g, "");
const backBtn = F.backBtn.replace(/ data-discover="true"/g, "");
const back = (name) => backBtn.replace(/href="[^"]*"/, `href="#list"`).replace(/aria-label="Back" title="Back"/, `aria-label="Back to ${esc(name)}" title="Back to ${esc(name)}"`);

/** The list bar: the list's name (a link back to it) and "‹ 3 of 41 ›". `end` and `solved` change
 *  the right-hand side; `keep` adds the Keep toggle. */
function bar({ name = LIST.name, at = 3, n = LIST.n, solved = false, end = false, keep = null, where = "wide" }) {
  const step = `<span class="lb-step"><a class="lb-arrow" href="#prev" aria-label="Previous" title="Previous (←)">${ico("chevL")}</a><span class="lb-pos">${at} of ${n}</span>${end ? "" : `<a class="lb-arrow" href="#next" aria-label="Next" title="Next (→)">${ico("chevR")}</a>`}</span>`;
  const keepBtn = keep === null ? "" : `<button class="lb-keep" type="button" aria-pressed="${keep}" title="${keep ? "Kept" : "Keep"}">${ico("bookmark")}<span>${keep ? "Kept" : "Keep"}</span></button>`;
  let right;
  if (end && solved) right = `<span class="lb-pos lb-end">${at} of ${n} · That’s the last one.</span><a class="btn primary lb-next" href="#list">Back to the list</a>`;
  else if (solved && where === "wide") right = `${keepBtn}<span class="lb-step"><a class="lb-arrow" href="#prev" aria-label="Previous">${ico("chevL")}</a></span><a class="btn primary lb-next" href="#next">Next puzzle <span class="l-sub">${at + 1} of ${n}</span>${ico("chevR")}</a>`;
  else if (end && where === "top") right = `${keepBtn}<span class="lb-step"><a class="lb-arrow" href="#prev" aria-label="Previous">${ico("chevL")}</a><span class="lb-pos">${at} of ${n}</span></span>`;
  else right = `${keepBtn}${step}`;
  if (where === "top") {
    // phones: the back button carries the list's name
    return `<div class="lb-top">${back(name).replace(/<\/a>$/, `<span class="lb-back-name">${esc(name)}</span></a>`).replace('class="back-btn"', 'class="back-btn lb-back"')}<div class="lb-right">${right}</div></div>`;
  }
  return `<nav class="list-bar" aria-label="List"><a class="lb-name" href="#list">${ico("list")}<span>${esc(name)}</span></a><div class="lb-right">${right}</div></nav>`;
}

function gamePage({ solved = false, ...opts }, extra = {}) {
  const board = (solved ? F.boardSolved : F.board);
  const n = opts.n ?? LIST.n, at = opts.at ?? 3;
  const after = !solved ? "" : opts.end
    ? `<div class="lb-after"><p>That’s the last one.</p><a class="btn primary" href="#list">Back to the list</a></div>`
    : `<div class="lb-after"><a class="btn primary" href="#next">Next puzzle <span class="l-sub">${at + 1} of ${n}</span>${ico("chevR")}</a></div>`;
  const spot = board.replace(/^<div class="game-spot">/, `<div class="game-spot">${bar({ ...opts, solved })}`).replace(/<\/div>$/, `${after}</div>`);
  const body = `<div class="game-layout in-list">${back(opts.name ?? LIST.name)}${bar({ ...opts, solved: false, end: false, ...(solved && opts.end ? { end: true } : {}), where: "top" })}
<main class="wrap game-page in-list"><header class="game-head">${head.replace(/^<header class="game-head">/, "").replace(/<\/header>$/, "")}${solved ? `<span class="solved-mark" title="You've solved this">✓ Solved</span>` : ""}</header>
<div class="game-body">${spot}</div></main></div>`;
  return page("Lights On · inkit (mockup)", body, extra);
}

writeFileSync(`${dir}puzzle.html`, gamePage({}));
writeFileSync(`${dir}puzzle-solved.html`, gamePage({ solved: true }));
writeFileSync(`${dir}puzzle-last.html`, gamePage({ solved: true, end: true, name: "Akari by @wyatt", at: 4, n: 4 }));

// ---------------------------------------------------------------- 3, 4: Explore search builds the list

const chip = (k, v, extra = "") => `<span class="q-chip"><span class="k">${k}</span>${v}${extra}<button type="button" aria-label="Remove ${esc(k)}">${ico("x")}</button></span>`;
const wyattDot = wyattAvatar.match(/<span class="avatar"[^>]*>W<\/span>/)[0].replace(/width:18px;height:18px;font-size:[^;]+;/, "width:16px;height:16px;font-size:8px;");
const search = F.search.replace(/ data-discover="true"/g, "").replace(/value=""/, `value="${LIST.q}"`).replace(/value="akari"/, `value="${LIST.q}"`);
function searchPage({ share = null } = {}) {
  const link = share === "frozen" ? `inkit.games/l?q=akari+easy+by:wyatt+before:2026-10-10` : `inkit.games/l?q=akari+easy+by:wyatt`;
  const pop = share === null ? "" : `<div class="share-pop" role="dialog" aria-label="Share list">
  <h3>Share list</h3>
  <div class="share-link"><span class="share-url">${link.replace(/(before:[0-9-]+)/, "<mark>$1</mark>").replace(/\+/g, "+<wbr>")}</span><button class="btn primary" type="button">${ico("copy")}Copy</button></div>
  <label class="share-live"><input type="checkbox"${share === "live" ? " checked" : ""}> Keep it updated</label>
  <p class="share-note">${share === "live" ? "New puzzles that match join the list." : "Always these 41."}</p>
</div>`;
  return page("Explore · inkit (mockup)", `<main class="wrap explore x-explore q-page">
<header class="x-head"><h1>Explore</h1>${search}
<div class="q-chips" role="group" aria-label="Filters">${chip("Type", "Akari")}${chip("", `${EASY.replace('role="img" ', "")} Easy`)}${chip("By", `${wyattDot} @wyatt`)}<button class="q-add" type="button">${ico("plus")}Filter</button>
<button class="q-sort" type="button"><span class="k">Sort</span> Newest${ico("down")}</button></div></header>
<section class="shelf q-results">
<div class="q-bar"><p class="q-count"><strong>41</strong> puzzles</p><div class="q-actions"><a class="btn primary" href="#play">${ico("play", "mini-icon fill")}Play</a><span class="share-wrap"><button class="btn${share ? " on" : ""}" type="button" aria-expanded="${!!share}">${ico("share")}Share list</button>${pop}</span></div></div>
<ul class="cards x-cards">${listCards.map((c) => c.html).join("")}</ul>
<div class="feed-more muted">Loading more…</div>
</section></main>`, { active: "Explore" });
}
writeFileSync(`${dir}search.html`, searchPage());
writeFileSync(`${dir}search-share.html`, searchPage({ share: "frozen" }));
writeFileSync(`${dir}search-share-live.html`, searchPage({ share: "live" }));

// ---------------------------------------------------------------- 5: the list's own page

const SOLVED = new Set([0, 1, 2, 3, 4, 5, 7, 8, 9, 11]);   // of the first 15; two more further down
const listPage = page("Easy Akari by @wyatt · inkit (mockup)", `<main class="wrap l-page">
<header class="l-head">
  <p class="l-kicker">${ico("list")}List</p>
  <h1>${esc(LIST.name)}</h1>
  <p class="l-meta">41 puzzles · as of Oct 10, 2026</p>
  <p class="l-query"><code>akari easy by:wyatt before:2026-10-10</code><a href="#explore">Open in Explore</a></p>
  <div class="l-progress"><span><strong>12</strong> of 41 solved</span><span class="l-track"><i style="width:${(12 / 41 * 100).toFixed(1)}%"></i></span></div>
  <div class="l-actions"><a class="btn primary" href="#carry-on">${ico("play", "mini-icon fill")}Carry on <span class="l-sub">7 of 41</span></a><a class="btn" href="#start">Play from the start</a><button class="btn l-share" type="button" aria-label="Share">${ico("share")}<span>Share</span></button></div>
</header>
<ul class="cards x-cards">${listCards.map((c, i) => SOLVED.has(i) ? solvedCard(c.html) : c.html).join("")}</ul>
<div class="feed-more muted">Loading more…</div>
</main>`, { active: "" });
writeFileSync(`${dir}list.html`, listPage);

// ---------------------------------------------------------------- 6: kept, hand-picked

const mixed = new Map(F.mixedCards.map((c) => [c.match(/href="([^"]+)"/)[1], c]));
const lightsOn = byHref.get("/g/akari-1");
const KEPT = [
  ["/g/akari-1", lightsOn],
  ...["/g/binary-puzzle-3", "/g/vq6b286hmx", "/g/fillomino-3", "/g/prn6szg7v2"].map((h) => [h, mixed.get(h)]),
];
const keptRow = ([h, c]) => {
  const kind = c.match(/class="kind">([^<]*)/)[1], title = c.match(/<strong>([^<]*)/)[1];
  const by = c.match(/<span class="by">([\s\S]*?)<\/span><span class="card-foot">/)[1].replace(/ data-discover="true"/g, "");
  return `<li class="kept-row"><span class="kept-grip" title="Drag to reorder">${ico("grip")}</span>${pic(c)}<a class="kept-text" href="${h}"><strong>${title}</strong><span class="kind">${kind}</span><span class="by">${by}</span></a><button class="kept-x" type="button" aria-label="Remove ${esc(title)}">${ico("x")}</button></li>`;
};
const ids = KEPT.map(([h]) => h.slice(3)).join(",");
const tray = (share) => `<aside class="kept-tray" aria-label="Kept">
  <div class="pane-head"><h2>${ico("bookmark", "mini-icon fill")}Kept <span class="muted">5</span></h2><button class="pane-close" type="button" aria-label="Close">×</button></div>
  <ol class="kept-list">${KEPT.map(keptRow).join("")}</ol>
  <div class="kept-foot">
    ${share ? `<div class="share-link"><span class="share-url">inkit.games/l?q=<mark>id:${ids.replace(/,/g, ",<wbr>")}</mark></span><button class="btn primary" type="button">${ico("copy")}Copy</button></div>` : ""}
    <div class="kept-actions"><button class="btn${share ? "" : " primary"}" type="button">${ico("share")}Share these</button><a class="btn" href="#play">${ico("play", "mini-icon fill")}Play</a><button class="link kept-clear" type="button">Clear</button></div>
  </div>
</aside>`;
const pill = (open) => `<button class="kept-pill" type="button" aria-expanded="${open}">${ico("bookmark", "mini-icon fill")}Kept · 5</button>`;
writeFileSync(`${dir}kept.html`, gamePage({ keep: true }, { after: pill(false) }));
writeFileSync(`${dir}kept-tray.html`, gamePage({ keep: true }, { after: `<div class="tray-scrim"></div>${tray(false)}`, cls: "tray-open" }));
writeFileSync(`${dir}kept-share.html`, gamePage({ keep: true }, { after: `<div class="tray-scrim"></div>${tray(true)}`, cls: "tray-open" }));

console.log("wrote puzzle, puzzle-solved, puzzle-last, search, search-share, search-share-live, list, kept, kept-tray, kept-share");
