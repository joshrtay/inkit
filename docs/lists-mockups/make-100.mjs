// Builds the 100- mockups (docs/lists-mockups/f100-*.html), from the spec at the end of
// docs/research-curation.md ("Making sets (decided)", "Playing through a list: the URL (decided)"):
// - Playing through a list: the bar under the board (V2, arrangement A: Prev left, Next right, the
//   context in the middle), on the puzzle page as it is now decided: the title row with ♡ and ⋯, the
//   meta line under it (the type's name opens the rules), ? on the paper before undo and reset, the
//   puzzle's own description top left on the paper, colors and digits under the board. One screen
//   per context: a set (the only one with a progress bar), an Explore search, a type page, a
//   profile, Subscriptions, an Explore shelf; then after a solve in a set, and the set's last puzzle.
// - The set's page, /s/<id>: its cover (four small paper cards in a square), title, curator,
//   description, numbers, then the puzzles in order. Signed in mid-way, signed out, finished, and a
//   draft (the owner's); the puzzles as a list (used) and as a grid.
// Real pieces from fragments.json (capture.mjs) and fragments-100.json (capture-100.mjs). Styles in
// play-100.css, on top of the site's CSS, lists.css, flow-50.css and drawer-70/80.css. Not product code.
//
// Run from the repo root: node docs/lists-mockups/make-100.mjs, then node docs/lists-mockups/shoot-100.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const F = JSON.parse(readFileSync(`${dir}fragments.json`, "utf8"));
const Z = JSON.parse(readFileSync(`${dir}fragments-100.json`, "utf8"));
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s) => s.replace(/ data-discover="true"/g, "").replace(/<!-- -->/g, "");

// ---------------------------------------------------------------- icons

const P = {
  set: ["M4 7h12v13H4z", "M8 4h12v13"],
  chevL: ["m15 18-6-6 6-6"], chevR: ["m9 18 6-6-6-6"], down: ["m6 9 6 6 6-6"],
  check: ["m5 12 5 5 9-10"], more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  pencil: ["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"], play: ["M7 4.5v15l12-7.5z"],
  again: ["M3 12a9 9 0 1 0 2.6-6.4L3 8", "M3 3v5h5"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "m20 20-4-4"],
  grid: ["M4 4h16v16H4z", "M4 10h16", "M4 15h16", "M10 4v16", "M15 4v16"],
  feed: ["M4 13h4l2 3h4l2-3h4", "M4 13l2-8h12l2 8v6H4z"],
  shelf: ["M4 6h16", "M4 12h16", "M4 18h10"],
};
const ico = (n, cls = "mini-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n].map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const QMARK = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.6 8.6a3.5 3.5 0 1 1 4.9 3.2c-.9.4-1.5 1.2-1.5 2.2v.6"></path><path d="M12 18.6h.01"></path></svg>`;

// ---------------------------------------------------------------- puzzles, from the captured cards

const PZ = new Map();
for (const c of [...F.cards, ...F.mixedCards]) {
  const g = (r) => (c.match(r) || [])[1];
  const id = g(/href="\/g\/([^"]+)"/);
  if (PZ.has(id) || !c.includes('<span class="by">') || !c.includes('<span class="card-foot">')) continue;
  PZ.set(id, {
    id, title: g(/<strong>([^<]*)/), kind: g(/class="kind">([^<]*)/),
    by: clean(g(/<span class="by">([\s\S]*?)<\/span><span class="card-foot">/)),
    level: { Easy: 1, Medium: 2, Hard: 3 }[g(/Difficulty: (\w+)/)] ?? 1,
    mins: +(clean(c).match(/~(\d+) min/) || [0, 4])[1],
    pic: c.match(/<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>/)[0],
    card: clean(c),
  });
}
const pz = (id) => PZ.get(id);
const LEVEL = ["", "Easy", "Medium", "Hard"];
const dots = (level) => `<span class="diff" role="img" aria-label="Difficulty: ${LEVEL[level]}" title="${LEVEL[level]}">${[1, 2, 3].map((i) => `<i${i <= level ? ' class="on"' : ""}></i>`).join("")}</span>`;
const WYATT = (size = 18) => `<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${(size * 0.46).toFixed(1)}px;background:linear-gradient(135deg, hsl(335 75% 62%), hsl(15 70% 48%))">W</span>`;

// the set: Wyatt's Akari for beginners, published, eight puzzles
const SET = {
  id: "k4t9wq2v7c", name: "Akari for beginners", intro: "From your first lamp to letters. Try them in order.", published: "October 9, 2026",
  items: ["s3pw7skznd", "akari-1", "nf3fyxf7yu", "akari-3", "akari-2", "akari-4", "m29sd5vthj", "9tw4b3x373"].map(pz),
};
const AVG = Math.round(SET.items.reduce((n, it) => n + it.level, 0) / SET.items.length);
const MINS = SET.items.reduce((n, it) => n + it.mins, 0);

// ---------------------------------------------------------------- the frame

function item(html, label, fn) {
  const at = html.indexOf(`<span>${label}</span>`);
  if (at < 0) return html;
  const start = Math.max(html.lastIndexOf("<a ", at), html.lastIndexOf("<button ", at));
  const close = html.slice(start, start + 2) === "<a" ? "</a>" : "</button>";
  const end = html.indexOf(close, at) + close.length;
  return html.slice(0, start) + fn(html.slice(start, end)) + html.slice(end);
}
const nav = (active, signedOut) => {
  let s = clean(F.sidenav).replace(/ class="nav-item active" aria-current="page"/, ` class="nav-item"`);
  if (!signedOut) s = item(s, "Sign in", () => `<button type="button" class="nav-item"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg><span>More</span></button>`);
  if (active) s = item(s, active, (t) => t.replace(`class="nav-item"`, `class="nav-item active" aria-current="page"`));
  return s;
};
const tabbar = (active) => {
  let s = clean(F.tabbar).replace(/ class="active" aria-current="page"/, "");
  if (active) s = item(s, active, (t) => t.replace(/^<a( class="")?/, `<a class="active" aria-current="page"`));
  return s;
};
const page = (title, body, { active = "", cls = "", signedOut = false } = {}) => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- A mockup of playing through a list and of a set's page (not product code). Generated by make-100.mjs; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="lists.css">
<link rel="stylesheet" href="flow-50.css">
<link rel="stylesheet" href="drawer-70.css">
<link rel="stylesheet" href="drawer-80.css">
<link rel="stylesheet" href="play-100.css">
</head>
<body class="f50 f70 f80 f100 ${cls}">
${F.defs}
<div class="shell">${nav(active, signedOut)}<div class="page">${body}</div>${tabbar(active)}</div>
</body></html>
`;
const out = (name, html) => writeFileSync(`${dir}${name}`, html);

// ---------------------------------------------------------------- the puzzle page, as decided

/** The header: the title row (title, ♡, ⋯), the meta line under it; the type's name opens the rules. */
const head = (S) => clean(S.head)
  .replace(/<a class="like-btn"[^>]*href="[^"]*"/, `<button type="button" class="like-btn" aria-label="Like"`).replace(/<\/a><button class="btn rules-toggle"/, `</button><button class="btn rules-toggle"`)
  .replace(/<span class="muted">([\w ]+?) · /, (_, kind) => `<span class="muted"><a class="type-link" href="#rules" title="How to play ${kind}">${kind}</a> · `)
  .replace(/<button class="btn rules-toggle"[^>]*>How to play<\/button>/, `<div class="game-more"><button type="button" class="btn icon more-btn" aria-label="More for this puzzle">${ico("more")}</button></div>`);
/** The board, with ? on the paper's strip before undo and reset. */
const board = (html) => clean(html).replace(`<div class="group">`, `<div class="group"><button class="tool" data-rules="" type="button" aria-label="How to play" title="How to play">${QMARK}</button>`);

/** The bar under the board. `c`: the context; `solved`: the puzzle on screen is solved (Next stands
 *  out); `last`: the set's last puzzle, solved (no Next: back to the set). */
function bar(c, { solved = false, last = false } = {}) {
  const ctx = `<span class="ub-ctx">${c.icon}<span class="ctx-title">${c.name}</span>${c.by ? `<span class="ctx-by"><span class="dot">· </span>by ${c.by}</span>` : ""}</span>`;
  let mid;
  if (last) mid = `<span class="ub-mid end">${ctx}<span class="ub-last">That's the last one.</span></span>`;
  else if (c.set) mid = `<a class="ub-mid" href="/s/${SET.id}">${ctx}<span class="ub-prog"><span class="pbar" role="img" aria-label="${c.solvedN} of 8 solved; this is ${c.at}"><i style="width:${(c.solvedN / 8 * 100).toFixed(1)}%"></i><b style="left:${((c.at - 0.5) / 8 * 100).toFixed(2)}%"></b></span><span class="ub-count">${c.solvedN} of 8 solved</span></span></a>`;
  else mid = `<a class="ub-mid" href="#list">${ctx}${c.count ? `<span class="ub-count plain">${c.count}</span>` : ""}</a>`;
  const prev = `<a class="btn ub-prev" href="#prev" aria-label="Previous">${ico("chevL")}<span>Prev</span></a>`;
  const next = last
    ? `<a class="btn primary ub-back" href="/s/${SET.id}">${ico("set")}<span>Back to the set</span></a>`
    : `<a class="btn${solved ? " primary big" : ""} ub-next" href="#next" aria-label="Next"><span>Next</span>${ico("chevR")}</a>`;
  return `<nav class="ub a${solved || last ? " after" : ""}" aria-label="${c.set ? "Set" : "List"}">${prev}${mid}${next}</nav>`;
}
function playPage(id, c, opts = {}) {
  const S = Z[id];
  const b = opts.solved || opts.last ? Z.solved[id] : S.board;
  return `<div class="game-layout">${clean(S.backBtn)}<main class="wrap game-page g70 g80 p100${/class="paper-bar pad/.test(b) ? " has-pad" : ""}">${head(S)}<div class="game-body"><div class="game-spot-wrap">${board(b)}${bar(c, opts)}</div></div></main></div>`;
}

const CTX = {
  set: { set: true, icon: ico("set"), name: esc(SET.name), by: "@wyatt", solvedN: 4, at: 2 },
  search: { icon: ico("search"), name: `Search: lamps <span class="ctx-f">· Easy · Newest</span>`, count: "3 of 41" },
  type: { icon: ico("grid"), name: `Akari <span class="ctx-f">· Easy · Newest</span>`, count: "3 of 41" },
  profile: { icon: WYATT(20), name: "Wyatt", count: "3 of 24" },
  feed: { icon: ico("feed"), name: "Subscriptions" },
  shelf: { icon: ico("shelf"), name: "Today", count: "3 of 24" },
};
export const PLAY = [
  ["100", "set", "akari-1", {}, `/g/akari-1?set=${SET.id}`, "A set: the only list with a progress bar"],
  ["101", "search", "xjvr8a6vpd", {}, "/g/xjvr8a6vpd?in=all&q=lamps&level=1&sort=new", "An Explore search"],
  ["102", "type", "nf3fyxf7yu", {}, "/g/nf3fyxf7yu?in=akari&level=1&sort=new", "A type page"],
  ["103", "profile", "binary-puzzle-3", {}, "/g/binary-puzzle-3?in=@wyatt", "A profile; the colors stay on the paper, the bar goes under it"],
  ["104", "feed", "sudoku-3", {}, "/g/sudoku-3?in=feed", "Subscriptions: no count"],
  ["105", "shelf", "vq6b286hmx", {}, "/g/vq6b286hmx?in=all&sort=new", "An Explore shelf (Today)"],
  ["106", "set", "akari-1", { solved: true }, `/g/akari-1?set=${SET.id}`, "Solved, in a set: Next stands out"],
  ["106b", "set", "9tw4b3x373", { last: true }, `/g/9tw4b3x373?set=${SET.id}`, "The set's last puzzle, solved"],
];
for (const [n, k, id, opts] of PLAY) {
  const c = opts.solved ? { ...CTX[k], solvedN: 5 } : opts.last ? { ...CTX[k], solvedN: 7, at: 8 } : CTX[k];
  out(`f100-${n}.html`, page(`${pz(id)?.title ?? id} (mockup)`, playPage(id, c, opts), { active: k === "feed" ? "Subscriptions" : k === "search" || k === "shelf" || k === "type" ? "Explore" : k === "profile" ? "Profile" : "" }));
}

// ---------------------------------------------------------------- the set's page

/** A cover: four small paper cards in a square, on a slightly darker ground (90-A). */
const cover = (items, cls = "") => `<span class="s7-cover ${cls}" aria-hidden="true">${items.slice(0, 4).map((it) => `<span class="cv-tile">${it.pic.replace(/^<span class="grid-game pic thumb"/, `<span class="grid-game pic cv-pic"`)}</span>`).join("")}</span>`;

/** `state`: "mid" (signed in, 3 of 8), "out" (signed out), "done" (all 8), "draft" (the owner's). */
function setPage(state, { grid = false } = {}) {
  const solved = state === "mid" ? 3 : state === "done" ? 8 : 0;
  const draft = state === "draft";
  const facts = `${SET.items.length} puzzles · ~${MINS} min · ${dots(AVG)}${draft ? "" : ` · Published ${SET.published}`}`;
  const progress = state === "mid" || state === "done"
    ? `<div class="s7-progress"><span class="pbar wide"><i style="width:${(solved / 8 * 100).toFixed(1)}%"></i></span><span>${state === "done" ? `<strong>Set done</strong> · 8 of 8 solved` : `<strong>${solved}</strong> of 8 solved`}</span></div>` : "";
  const more = `<div class="game-more"><button type="button" class="btn icon more-btn" aria-label="More for this set">${ico("more")}</button></div>`;
  const actions = {
    mid: `<a class="btn primary" href="/g/akari-3?set=${SET.id}">${ico("play", "mini-icon fill")}Carry on<span class="b-sub">4 of 8</span></a><a class="btn" href="/g/s3pw7skznd?set=${SET.id}">${ico("again")}Play again</a>`,
    out: `<a class="btn primary" href="/g/s3pw7skznd?set=${SET.id}">${ico("play", "mini-icon fill")}Play</a>`,
    done: `<a class="btn primary" href="/g/s3pw7skznd?set=${SET.id}">${ico("again")}Play again</a>`,
    draft: `<button class="btn primary" type="button">${ico("pencil")}Edit</button><a class="btn" href="/g/s3pw7skznd?set=${SET.id}">${ico("play", "mini-icon fill")}Play</a><span class="muted s7-only">Only you can see it.</span>`,
  }[state];
  const isSolved = (i) => i < solved;
  const list = grid
    ? `<ol class="cards x-cards s7-grid">${SET.items.map((it, i) => it.card.replace(/^<li>/, `<li class="spg${isSolved(i) ? " solved" : ""}">`).replace(/<\/li>$/, `<span class="spg-n">${i + 1}</span>${isSolved(i) ? `<span class="spg-ok" title="Solved">${ico("check")}</span>` : ""}</li>`)).join("")}</ol>`
    : `<ol class="s7-rows">${SET.items.map((it, i) => `<li class="s7-row${isSolved(i) ? " solved" : ""}${state === "mid" && i === 3 ? " next" : ""}"><a href="/g/${it.id}?set=${SET.id}">
<span class="s7-n">${i + 1}</span><span class="s7-pic">${it.pic.replace("pic thumb", "pic cthumb")}${isSolved(i) ? `<span class="s7-ok" title="Solved">${ico("check")}</span>` : ""}</span>
<span class="s7-text"><strong>${esc(it.title)}</strong><span class="by">${it.by}</span></span>
<span class="s7-meta">${dots(it.level)}<span>~${it.mins} min</span></span></a></li>`).join("")}</ol>`;
  return `<main class="wrap sp100${grid ? " gridded" : ""}">
<header class="s7-head">${cover(SET.items)}
<div class="s7-words">
  <div class="s7-kick">${ico("set")}Set${draft ? `<span class="draft-pill">Draft</span>` : ""}${more}</div>
  <h1>${esc(SET.name)}</h1>
  <p class="s7-by">${WYATT(24)}<a href="/wyatt"><strong>Wyatt</strong></a><span class="muted">@wyatt</span></p>
  <p class="s7-intro">${esc(SET.intro)}</p>
  <p class="s7-facts muted">${facts}</p>
  ${progress}
  <div class="s7-actions">${actions}</div>
</div></header>
${list}
</main>`;
}
export const SETPAGE = [
  ["107", "mid", {}, "Published, signed in, mid-way: Carry on · 4 of 8, Play again"],
  ["107b", "out", {}, "Signed out: Play, from the start"],
  ["107c", "done", {}, "Finished: Set done, Play again"],
  ["107d", "draft", {}, "A draft, the owner's: Only you can see it. Edit reopens the drawer"],
  ["107e", "mid", { grid: true }, "The puzzles as a grid instead (not used)"],
];
for (const [n, state, opts] of SETPAGE) out(`f100-${n}.html`, page(`${SET.name} (mockup)`, setPage(state, opts), { active: state === "draft" ? "Profile" : "", signedOut: state === "out" }));

// ---------------------------------------------------------------- the contact sheet

const shots = [
  ...PLAY.flatMap(([n, , , , url, d]) => [[`${n}-desktop`, n, d, url], [`${n}-phone`, n, "Phone", url]]),
  ["107-desktop", "107", SETPAGE[0][3], `/s/${SET.id}`], ["107-phone", "107", "Phone", `/s/${SET.id}`],
  ...SETPAGE.slice(1).map(([n, , , d]) => [`${n}-desktop`, n, d, `/s/${SET.id}`]),
];
const sheet = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playing a list; the set's page</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css"><link rel="stylesheet" href="create-set.css"><link rel="stylesheet" href="play-100.css"></head>
<body class="sheet-index"><main class="c100">
<h1>Playing a list; the set's page</h1>
<p class="muted">The bar under the board for each kind of list, with the URL it plays from; then the set's own page. Mockups, not product code.</p>
<div class="c100-grid">${shots.map(([f, n, d, url]) => `<figure class="${f.endsWith("phone") ? "ph" : "dk"}"><img src="${f}.png"><figcaption><strong>${n}</strong> ${esc(d)}<code>${esc(url)}</code></figcaption></figure>`).join("")}</div>
</main></body></html>`;
out("contact-100.html", sheet);
console.log("wrote f100-*.html and contact-100.html");
