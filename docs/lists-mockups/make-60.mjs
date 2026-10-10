// Builds the 60- mockups (docs/lists-mockups/f60-*.html): the set drawer. Every puzzle (its card,
// its page) has a + that adds it to a draft set. With no drawer open, + lists your drafts (newest
// added-to first) and New set; picking one adds the puzzle and opens the drawer on that set. With the
// drawer open, + adds straight to it, and a caret beside it still lists the others. The drawer is
// the draft's editor (cover, title, description, the order, Publish) and takes the same right-hand
// slot as How to play: one at a time. It pushes the page at 1200px and wider, and lies over it below.
// On phones, + adds to the set you last used in this tab, with a toast; the toast opens a sheet.
// Real pieces from fragments.json (capture.mjs), fragments-50.json (capture-50.mjs) and
// fragments-60.json (capture-60.mjs: How to play, open; Lamp Code II's page). Styles in
// drawer-60.css, on top of lists.css, create-set.css and flow-50.css. Not product code.
//
// Run from the repo root: node docs/lists-mockups/make-60.mjs, then node docs/lists-mockups/shoot-60.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const F = JSON.parse(readFileSync(`${dir}fragments.json`, "utf8"));
const G = JSON.parse(readFileSync(`${dir}fragments-50.json`, "utf8"));
const H = JSON.parse(readFileSync(`${dir}fragments-60.json`, "utf8"));
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s) => s.replace(/ data-discover="true"/g, "").replace(/<!-- -->/g, "");

// ---------------------------------------------------------------- icons

const P = {
  set: ["M4 7h12v13H4z", "M8 4h12v13"],
  chevL: ["m15 18-6-6 6-6"], down: ["m6 9 6 6 6-6"], up: ["m18 15-6-6-6 6"],
  x: ["M18 6 6 18", "M6 6l12 12"], plus: ["M12 5v14", "M5 12h14"], check: ["m5 12 5 5 9-10"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  arrowR: ["M5 12h14", "m13 6 6 6-6 6"], puzzle: ["M4 4h16v16H4z", "M4 12h16", "M12 4v16"],
};
const ico = (n, cls = "mini-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n].map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const CURSOR = `<svg class="cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.5L10 19z"/></svg>`;
const GRAB = `<svg class="cursor grab" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11m0-1V5a1.5 1.5 0 0 1 3 0v5m0 0V6.5a1.5 1.5 0 0 1 3 0V12c0 4-2 7-6 7-3 0-4.5-1.5-6-4l-1.6-2.8a1.4 1.4 0 0 1 2.4-1.4L8 13"/></svg>`;

// ---------------------------------------------------------------- puzzles, from the captured cards

const PZ = new Map();
for (const c of [...F.cards, ...F.mixedCards]) {
  const g = (r) => (c.match(r) || [])[1];
  const id = g(/href="\/g\/([^"]+)"/);
  if (PZ.has(id) || !c.includes('<span class="by">')) continue;
  PZ.set(id, {
    id, title: g(/<strong>([^<]*)/), kind: g(/class="kind">([^<]*)/),
    by: clean(g(/<span class="by">([\s\S]*?)<\/span><span class="card-foot">/)),
    level: { Easy: 1, Medium: 2, Hard: 3 }[g(/Difficulty: (\w+)/)] ?? 1,
    mins: +(clean(c).match(/~(\d+) min/) || [0, 4])[1],
    pic: c.match(/<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>/)[0].replace("pic thumb", "pic cthumb"),
    card: clean(c),
  });
}
const pz = (id) => PZ.get(id);
const dots = (level) => `<span class="diff" role="img" aria-label="Difficulty ${level} of 3" title="${["", "Easy", "Medium", "Hard"][level]}">${[1, 2, 3].map((i) => `<i${i <= level ? ' class="on"' : ""}></i>`).join("")}</span>`;

// The set as it grows: 5 to start; 6 after Lamp Code I from its page (60–61); 7 after Lamp Code IV
// from Explore (62); Wyatt drags Lamp Code IV up (63); 8 after Lamp Code II, How to play open (64).
const SET = { name: "Akari for beginners", intro: "From your first lamp to letters. Try them in order." };
const FIVE = ["s3pw7skznd", "akari-1", "akari-3", "akari-2", "akari-4"].map(pz);
const SIX = [...FIVE, pz("m29sd5vthj")];
const SEVEN = [...SIX, pz("nf3fyxf7yu")];
const SEVEN_MOVED = ["s3pw7skznd", "akari-1", "nf3fyxf7yu", "akari-3", "akari-2", "akari-4", "m29sd5vthj"].map(pz);
const EIGHT = [...SEVEN_MOVED, pz("9tw4b3x373")];
// Wyatt's other drafts, most recently added to first (published sets never show)
const OTHERS = [
  { name: "Binary, step by step", items: ["binary-puzzle-1", "binary-puzzle-2", "binary-puzzle-3"].map(pz) },
  { name: "Sudoku nights", items: ["sudoku-3", "irregular-sudoku-2", "thermo-sudoku-2"].map(pz) },
];
const mins = (items) => items.reduce((n, it) => n + it.mins, 0);
const mosaic = (items, cls = "") => `<span class="mosaic ${cls}" aria-hidden="true">${[0, 1, 2, 3].map((i) => items[i] ? items[i].pic.replace("cthumb", "mthumb") : `<span class="m-empty"></span>`).join("")}</span>`;

// ---------------------------------------------------------------- the frame

function item(html, label, fn) {
  const at = html.indexOf(`<span>${label}</span>`);
  if (at < 0) return html;
  const start = Math.max(html.lastIndexOf("<a ", at), html.lastIndexOf("<button ", at));
  const close = html.slice(start, start + 2) === "<a" ? "</a>" : "</button>";
  const end = html.indexOf(close, at) + close.length;
  return html.slice(0, start) + fn(html.slice(start, end)) + html.slice(end);
}
const nav = (active) => {
  let s = clean(F.sidenav).replace(/ class="nav-item active" aria-current="page"/, ` class="nav-item"`);
  s = item(s, "Sign in", () => `<button type="button" class="nav-item"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg><span>More</span></button>`);
  if (active) s = item(s, active, (t) => t.replace(`class="nav-item"`, `class="nav-item active" aria-current="page"`));
  s = s.replace(/<button type="button" class="btn primary create-btn"[^>]*>([\s\S]*?)<span>Create<\/span><\/button>/, (_, icon) =>
    `<div class="create-wrap"><button type="button" class="btn primary create-btn" aria-haspopup="menu" aria-expanded="false">${icon}<span>Create</span>${ico("down", "mini-icon caret")}</button></div>`);
  return s;
};
const tabbar = (active) => {
  let s = clean(F.tabbar).replace(/ class="active" aria-current="page"/, "");
  if (active) s = item(s, active, (t) => t.replace(/^<a( class="")?/, `<a class="active" aria-current="page"`));
  return s;
};
/** The page; `slot` is the right-hand pane (How to play or the set drawer), beside the page. */
const page = (title, body, { active = "", cls = "", slot = "", after = "" } = {}) => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- A mockup of the set drawer (not product code). Generated by make-60.mjs; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="lists.css">
<link rel="stylesheet" href="create-set.css">
<link rel="stylesheet" href="flow-50.css">
<link rel="stylesheet" href="drawer-60.css">
</head>
<body class="f50 f60 ${slot ? "slot-on" : ""} ${cls}">
${F.defs}
<div class="shell">${nav(active)}<div class="page">${body}</div>${slot ? `<div class="slot">${slot}</div>` : ""}${tabbar(active)}</div>${after}
</body></html>
`;
const out = (name, html) => writeFileSync(`${dir}${name}`, html);

// ---------------------------------------------------------------- the list of drafts (drawer closed, or the caret)

const SETS = [{ name: SET.name, items: FIVE }, ...OTHERS];
/** Your drafts, most recently added to first, then a field for a new one. `on`: the open set (ticked). */
const setList = ({ sets = SETS, hover = -1, on = "", cls = "", title = "Add to set" } = {}) => `<div class="sets-pop add-pop ${cls}" role="dialog" aria-label="${esc(title)}"><span class="grabber"></span><h3>${esc(title)}</h3>
${sets.map((s, i) => `<button class="sl-row pick${i === hover ? " hov" : ""}${s.name === on ? " on" : ""}" type="button">${mosaic(s.items, "tiny")}<span class="sl-name">${esc(s.name)}</span><span class="sl-n">${s.name === on ? ico("check") : s.items.length}</span></button>`).join("")}
<label class="sl-field">${ico("plus")}<input type="text" placeholder="New set" aria-label="New set"></label></div>`;

// ---------------------------------------------------------------- the drawer

const row = (it, i, { fresh = false, phone = false, n = 0 } = {}) => `<li class="d-row${fresh ? " fresh" : ""}">
<span class="d-grip" title="Drag to move">${ico("grip")}</span><span class="d-n">${i + 1}</span>${it.pic}
<span class="d-text"><strong>${esc(it.title)}</strong><span class="by">${it.by}${dots(it.level)}</span></span>
${phone ? `<span class="d-move"><button type="button" aria-label="Move up"${i === 0 ? " disabled" : ""}>${ico("up")}</button><button type="button" aria-label="Move down"${i === n - 1 ? " disabled" : ""}>${ico("down")}</button></span>` : ""}
<button class="d-x" type="button" aria-label="Take ${esc(it.title)} out">${ico("x")}</button></li>`;

/** The set drawer. `fresh`: the row just added (a brief highlight). `drag`: [from, to] mid-drag.
 *  `confirm`: Publish asked. `intro`: the description, or empty for its placeholder. */
function drawer(items, { fresh = -1, drag = null, confirm = false, intro = "", phone = false } = {}) {
  let list;
  if (drag) {
    const [from, to] = drag;
    const rest = items.filter((_, i) => i !== from);
    const lifted = row(items[from], to).replace('class="d-row"', 'class="d-row lift"').replace("</li>", `${GRAB}</li>`);
    list = rest.map((it, i) => row(it, i < to ? i : i + 1)).map((r, i) => i === to ? `<li class="d-gap" aria-hidden="true">${lifted.replace(/^<li/, "<div").replace(/<\/li>$/, "</div>")}</li>${r}` : r).join("");
  } else list = items.map((it, i) => row(it, i, { fresh: i === fresh, phone, n: items.length })).join("");
  const foot = confirm
    ? `<div class="d-foot asking" role="alertdialog" aria-label="Publish">
  <strong>Publish ${esc(SET.name)}?</strong>
  <p>${items.length} puzzles. After you publish, the puzzles and their order stay as they are.</p>
  <div class="d-actions"><button class="btn" type="button">Cancel</button><button class="btn primary" type="button">Publish</button></div></div>`
    : `<div class="d-foot">
  <p>After you publish, the puzzles and their order stay as they are.</p>
  <div class="d-actions"><a class="d-open" href="#set">Open set page${ico("arrowR")}</a><button class="btn primary" type="button">Publish</button></div></div>`;
  return `<aside class="sdrawer${phone ? " as-sheet" : ""}" aria-label="Set: ${esc(SET.name)}">${phone ? `<span class="grabber"></span>` : ""}
<div class="d-head"><span class="draft-pill">Draft</span><span class="muted d-saved">Saved</span><button class="d-close" type="button" aria-label="Close">${ico("x")}</button></div>
<div class="d-top">${mosaic(items, "d-cover")}<div class="d-words"><input class="d-name" type="text" value="${esc(SET.name)}" aria-label="Title">
<textarea class="d-intro" rows="2" placeholder="Description (optional)" aria-label="Description">${esc(intro)}</textarea></div></div>
<div class="d-count"><strong>${items.length} puzzles</strong><span class="muted"> · ~${mins(items)} min</span></div>
<ol class="d-list${drag ? " dragging" : ""}">${list}</ol>
${foot}</aside>`;
}

// ---------------------------------------------------------------- the puzzle page

/** The header's + control. `mode`: "closed" (opens the list), "open" (adds to the open set; caret
 *  lists the others), "in" (already in the open set). */
function addCtl(mode, { pop = "", tip = false, hover = false, phone = false } = {}) {
  if (mode === "closed") return `<span class="add-wrap"><button class="btn add-set${pop ? " open" : ""}" type="button" aria-haspopup="dialog" aria-expanded="${!!pop}">${ico("plus")}<span>Add to set</span></button>${hover ? CURSOR : ""}${pop}</span>`;
  const main = mode === "in"
    ? `<button class="btn split-main done" type="button" aria-pressed="true" title="In ${esc(SET.name)}">${ico("check")}<span>In set</span></button>`
    : `<button class="btn split-main" type="button" title="Add to ${esc(SET.name)}">${ico("plus")}<span>Add to set</span></button>`;
  if (phone) return `<span class="add-wrap">${main.replace("split-main ", "")}</span>`;   // phones: Change, in the toast
  return `<span class="add-wrap split">${main}<button class="btn split-caret" type="button" aria-label="Add to another set" aria-haspopup="dialog">${ico("down")}</button>${tip ? `<span class="tip">Add to ${esc(SET.name)}</span>` : ""}${pop}</span>`;
}
function puzzlePage(S, ctl, { rules = false } = {}) {
  const head = clean(S.head)
    .replace(/<a class="like-btn"[^>]*href="[^"]*"/, `<button type="button" class="like-btn" aria-label="Like"`).replace(/<\/a><button class="btn rules-toggle"/, `</button><button class="btn rules-toggle"`)
    .replace(`<button class="btn rules-toggle" type="button" aria-pressed="false">`, `${ctl}<button class="btn rules-toggle" type="button" aria-pressed="${rules}">`);
  return `<div class="game-layout">${clean(S.backBtn)}<main class="wrap game-page">${head}<div class="game-body">${clean(S.board)}</div></main></div>`;
}
const guidePane = () => clean(H.guide).replace(`class="guide-pane open side"`, `class="guide-pane open in-slot"`);

// ---------------------------------------------------------------- Explore (search results)

const IDS = ["akari-4", "akari-3", "nf3fyxf7yu", "prn6szg7v2", "z53shxh8w3", "akari-2", "akari-1", "9tw4b3x373", "m29sd5vthj", "5fd6bmpkuw", "s3pw7skznd", "xjvr8a6vpd"];
/** A real card, with + on its picture's top-right corner. `set`: the open set's ids (✓ on those).
 *  `hover`: this card is under the pointer. `split`: the drawer is open (+ and a caret). */
function card(id, { set = null, hover = false, split = false, phone = false, tip = false, pop = "" } = {}) {
  const c = pz(id).card;
  const inSet = set?.has(id);
  let btn = "";
  if (inSet) btn = `<button class="card-add on" type="button" aria-label="In ${esc(SET.name)}" title="In ${esc(SET.name)}">${ico("check")}</button>`;
  else if (hover || phone) btn = split
    ? `<span class="card-split"><button class="card-add" type="button" aria-label="Add to ${esc(SET.name)}">${ico("plus")}</button><button class="card-caret" type="button" aria-label="Add to another set">${ico("down")}</button>${tip ? `<span class="tip">Add to ${esc(SET.name)}</span>` : ""}</span>`
    : `<button class="card-add" type="button" aria-label="Add to set">${ico("plus")}</button>`;
  const cls = [btn ? "addable" : "", inSet ? "in" : "", hover ? "hover" : "", pop ? "pop-on" : ""].filter(Boolean).join(" ");
  return c.replace(/^<li>/, `<li class="${cls}">`).replace(/<\/li>$/, `${btn}${hover ? CURSOR : ""}${pop}</li>`);
}
const explore = (cards) => `<main class="wrap explore x-explore"><header class="x-head"><h1>Explore</h1>${clean(F.search).replace(/ value="[^"]*"/, ` value="akari"`)}${clean(F.quickChips)}</header>
<section class="shelf"><ul class="cards x-cards">${cards}</ul></section></main>`;
const ids = (items) => new Set(items.map((it) => it.id));
const toast = (html, action) => `<div class="toast t60" role="status">${ico("check")}<span>${html}</span><button type="button">${action}</button></div>`;

// ---------------------------------------------------------------- 60: a puzzle page, + opens your drafts

out("f60-popover.html", page("Lamp Code I (mockup)", puzzlePage(G.slate, addCtl("closed", { pop: setList({ hover: 0 }), hover: true }))));

// ---------------------------------------------------------------- 61: picked Akari for beginners: added, the drawer opens

out("f60-drawer.html", page("Lamp Code I · Akari for beginners (mockup)", puzzlePage(G.slate, addCtl("in")), { slot: drawer(SIX, { fresh: 5 }) }));

// ---------------------------------------------------------------- 62: Explore with the drawer open; + adds in one go

{
  const set = ids(SIX);
  const cards = IDS.map((id) => card(id, { set, split: true, hover: id === "nf3fyxf7yu", tip: id === "nf3fyxf7yu" })).join("");
  out("f60-explore.html", page("Explore · Akari for beginners (mockup)", explore(cards), { active: "Explore", slot: drawer(SIX) }));
}

// ---------------------------------------------------------------- 63: mid-drag: Lamp Code IV moves up to 3

{
  const set = ids(SEVEN);
  const cards = IDS.map((id) => card(id, { set })).join("");
  out("f60-drag.html", page("Explore · Akari for beginners (mockup)", explore(cards), { active: "Explore", slot: drawer(SEVEN, { drag: [6, 2], intro: SET.intro }) }));
}

// ---------------------------------------------------------------- 64: How to play open, then the set drawer takes its place

out("f60-rules.html", page("Lamp Code II (mockup)", puzzlePage(H.l2, addCtl("closed", { pop: setList({ sets: [{ name: SET.name, items: SEVEN_MOVED }, ...OTHERS], hover: 0 }), hover: true }), { rules: true }), { slot: guidePane() }));
out("f60-rules-drawer.html", page("Lamp Code II · Akari for beginners (mockup)", puzzlePage(H.l2, addCtl("in")), { slot: drawer(EIGHT, { fresh: 7, intro: SET.intro }) }));

// ---------------------------------------------------------------- 65: Publish, asked in the drawer; then a toast

out("f60-publish.html", page("Lamp Code II · Publish (mockup)", puzzlePage(H.l2, addCtl("in")), { slot: drawer(EIGHT, { confirm: true, intro: SET.intro }) }));
out("f60-published.html", page("Lamp Code II (mockup)", puzzlePage(H.l2, addCtl("closed")), { after: toast(`Published · <strong>${esc(SET.name)}</strong>`, "View") }));

// ---------------------------------------------------------------- 66: narrower than 1200px: the drawer lies over the page

{
  const set = ids(SEVEN);
  const cards = IDS.map((id) => card(id, { set, split: true, hover: id === "z53shxh8w3" })).join("");
  out("f60-overlay.html", page("Explore · Akari for beginners (mockup)", explore(cards), { active: "Explore", slot: drawer(SEVEN, { intro: SET.intro }) }));
}

// ---------------------------------------------------------------- 67: phones

{
  // a: the first + in this tab opens the list of drafts
  const cardsA = IDS.map((id) => card(id, { set: new Set(), phone: true })).join("");
  out("f60-phone-list.html", page("Explore · Add to set (mockup)", explore(cardsA), { active: "Explore", cls: "sheet-on", after: `<div class="scrim"></div>${setList({ cls: "psheet60" })}` }));
  // b: picked; later + adds straight to that set, with a toast
  const set7 = ids(SEVEN);
  const cardsB = IDS.map((id) => card(id, { set: set7, phone: true })).join("");
  out("f60-phone-toast.html", page("Explore · Added (mockup)", explore(cardsB), { active: "Explore", after: toast(`Added to <strong>${esc(SET.name)}</strong> <span class="t-n">· 7</span>`, "Change") }));
  // c: tapping the toast opens the set as a sheet: ↑↓, ×, Publish
  out("f60-phone-sheet.html", page("Akari for beginners (mockup)", explore(cardsB), { active: "Explore", cls: "sheet-on", after: `<div class="scrim"></div>${drawer(SEVEN, { phone: true, intro: SET.intro })}` }));
  // d: a puzzle page: + in the title row, with the same toast
  out("f60-phone-puzzle.html", page("Lamp Code II (mockup)", puzzlePage(H.l2, addCtl("in", { phone: true })), { cls: "phone-pz", after: toast(`Added to <strong>${esc(SET.name)}</strong> <span class="t-n">· 8</span>`, "Change") }));
}

// ---------------------------------------------------------------- the contact sheet, in flow order

export const ROWS = [
  ["60", "A puzzle page. + lists your drafts, newest added-to first, and New set", "60-popover-desktop"],
  ["61", "Picked one: it's added, and the drawer opens on that set", "61-drawer-desktop"],
  ["62", "Explore with the drawer open: + adds in one go, the caret picks another set, ✓ on the ones in", "62-explore-desktop"],
  ["62", "The same at 1440 wide", "62-explore-1440"],
  ["63", "Dragging Lamp Code IV up to 3", "63-drag-desktop"],
  ["64", "How to play open; + lists your drafts", "64-rules-desktop"],
  ["64b", "Picked one: the set drawer takes How to play's place", "64b-rules-drawer-desktop"],
  ["65", "Publish, asked in the drawer", "65-publish-desktop"],
  ["65b", "Published: the drawer closes, a toast", "65b-published-desktop"],
  ["66", "Under 1200 wide the drawer lies over the page", "66-overlay-1100"],
  ["67", "Phone: the first + in a tab lists your drafts", "67-list-phone"],
  ["67b", "Phone: after that, + adds to that set, with a toast", "67b-toast-phone"],
  ["67c", "Phone: the toast opens the set", "67c-sheet-phone"],
  ["67d", "Phone: a puzzle page, + in the title row", "67d-puzzle-phone"],
];
const sheet = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The set drawer</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css"><link rel="stylesheet" href="create-set.css"><link rel="stylesheet" href="drawer-60.css"></head>
<body class="sheet-index"><main class="contact60">
<h1>The set drawer</h1>
<p class="muted">Add with + wherever you are; the drawer is the draft. Mockups, not product code.</p>
<div class="c60">${ROWS.map(([k, d, p]) => `<figure class="${p.includes("phone") ? "ph" : ""}"><img src="${p}.png"><figcaption><strong>${k}</strong> ${esc(d)}</figcaption></figure>`).join("")}</div>
</main></body></html>`;
out("contact-60.html", sheet);
console.log("wrote f60-*.html and contact-60.html");
