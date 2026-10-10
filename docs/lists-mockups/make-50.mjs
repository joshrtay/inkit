// Builds the 50- mockups (docs/lists-mockups/f50-*.html): making a set the light way. Create → Set
// asks only for a title; then an "Adding to" pill follows you round the site and every card gets a +.
// The pill opens to a tray of the set in order; puzzle pages get an Add to set button; without the
// pill, + on hover (⋯ on phones) opens a list of your sets to tick; search results can all go in at
// once; and /s/<id>/edit is only about order. Real pieces from fragments.json (capture.mjs) and
// fragments-50.json (capture-50.mjs: the puzzle page as it is now, description on the paper).
// Its own styles in flow-50.css, on top of lists.css and create-set.css. Not product code.
//
// Run from the repo root: node docs/lists-mockups/make-50.mjs, then node docs/lists-mockups/shoot-50.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const F = JSON.parse(readFileSync(`${dir}fragments.json`, "utf8"));
const G = JSON.parse(readFileSync(`${dir}fragments-50.json`, "utf8"));
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s) => s.replace(/ data-discover="true"/g, "").replace(/<!-- -->/g, "");

// ---------------------------------------------------------------- icons

const P = {
  set: ["M4 7h12v13H4z", "M8 4h12v13"],
  puzzle: ["M4 4h16v16H4z", "M4 12h16", "M12 4v16"],
  chevL: ["m15 18-6-6 6-6"], chevR: ["m9 18 6-6-6-6"], down: ["m6 9 6 6 6-6"], up: ["m18 15-6-6-6 6"],
  x: ["M18 6 6 18", "M6 6l12 12"], plus: ["M12 5v14", "M5 12h14"], check: ["m5 12 5 5 9-10"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  share: ["M12 3v12", "m7 8 5-5 5 5", "M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  play: ["M7 4.5v15l12-7.5z"],
};
const ico = (n, cls = "mini-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n].map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const CURSOR = `<svg class="cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.5L10 19z"/></svg>`;

// ---------------------------------------------------------------- puzzles, from the captured cards

const PZ = new Map();
for (const c of [...F.cards, ...F.mixedCards]) {
  const g = (r) => (c.match(r) || [])[1];
  const id = g(/href="\/g\/([^"]+)"/);
  if (PZ.has(id) || !c.includes('<span class="by">')) continue;
  PZ.set(id, {
    id, title: g(/<strong>([^<]*)/), kind: g(/class="kind">([^<]*)/), name: g(/by-name">([^<]*)/),
    by: clean(g(/<span class="by">([\s\S]*?)<\/span><span class="card-foot">/)),
    level: { Easy: 1, Medium: 2, Hard: 3 }[g(/Difficulty: (\w+)/)] ?? 1,
    pic: c.match(/<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>/)[0].replace("pic thumb", "pic cthumb"),
    card: clean(c),
  });
}
const pz = (id) => PZ.get(id);
const dots = (level) => `<span class="diff" role="img" aria-label="Difficulty ${level} of 3" title="${["", "Easy", "Medium", "Hard"][level]}">${[1, 2, 3].map((i) => `<i${i <= level ? ' class="on"' : ""}></i>`).join("")}</span>`;

// The set, as it grows through the flow: 5 on Explore, 6 after Slate's Lamp Code I from its page,
// 7 after Lamp Code IV from a card without the pill. On the edit page Wyatt has moved Lamp Code I up.
const SET = { name: "Akari for beginners", intro: "Seven Akari, from your first lamp to letters. Try them in order." };
const FIVE = ["s3pw7skznd", "akari-1", "akari-3", "akari-2", "akari-4"].map(pz);
const SIX = [...FIVE, pz("m29sd5vthj")];
const SEVEN = ["s3pw7skznd", "m29sd5vthj", "akari-1", "akari-3", "nf3fyxf7yu", "akari-2", "akari-4"].map(pz);
// Wyatt's other drafts (only drafts take puzzles; a published set stays as it is)
const OTHERS = [
  { name: "Binary, step by step", items: ["binary-puzzle-1", "binary-puzzle-2", "binary-puzzle-3"].map(pz) },
  { name: "Sudoku nights", items: ["sudoku-3", "irregular-sudoku-2", "thermo-sudoku-2"].map(pz) },
];
// Wyatt's puzzles, newest first, as Explore shows them with "By you"
const MINE = ["akari-4", "akari-3", "binary-puzzle-3", "akari-2", "akari-1", "binary-puzzle-2", "sudoku-3", "star-battle-3", "nonogram-5", "thermo-sudoku-2", "aquarium-2", "fillomino-3"];

/** A set's cover: its first four puzzle pictures, two by two. */
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
const CREATE_MENU = `<div class="menu create-menu" role="menu" aria-label="Create">
  <a role="menuitem" href="/new">${ico("puzzle", "cm-icon")}<strong>Puzzle</strong><span>Draw a new one</span></a>
  <a role="menuitem" href="#set">${ico("set", "cm-icon")}<strong>Set</strong><span>Puzzles in an order you pick</span></a>
</div>`;
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
const page = (title, body, { active = "", cls = "", after = "" } = {}) => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- A mockup of making a set (not product code). Generated by make-50.mjs; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="lists.css">
<link rel="stylesheet" href="create-set.css">
<link rel="stylesheet" href="flow-50.css">
</head>
<body class="f50 ${cls}">
${F.defs}
<div class="shell">${nav(active)}<div class="page">${body}</div>${tabbar(active)}</div>${after}
</body></html>
`;
const out = (name, html) => writeFileSync(`${dir}${name}`, html);

// ---------------------------------------------------------------- the pill, the tray, the toast

const pill = (items, { open = false } = {}) => `<div class="pill${open ? " open" : ""}" role="region" aria-label="Adding to a set">
  <button class="pill-main" type="button" aria-expanded="${open}">${mosaic(items, "small")}<span class="pill-text"><span class="pill-k">Adding to</span><span class="pill-name"><strong>${esc(SET.name)}</strong><span class="pill-n"> · ${items.length}</span></span></span>${ico(open ? "down" : "up", "mini-icon pill-chev")}</button>
  <button class="pill-done" type="button">Done</button>
</div>`;
const tray = (items) => `<div class="tray" role="dialog" aria-label="${esc(SET.name)}"><span class="grabber"></span>
  <div class="tray-head"><strong>${esc(SET.name)}</strong><span class="muted">${items.length} puzzles · Draft</span></div>
  <ol class="tray-list">${items.map((it, i) => `<li><span class="tray-n">${i + 1}</span>${it.pic}</li>`).join("")}</ol>
  <div class="tray-foot"><a href="#edit">Edit order</a><button class="btn primary" type="button">Done</button></div>
</div>`;
const toast = (n) => `<div class="toast" role="status">${ico("check")}<span>Added to <strong>${esc(SET.name)}</strong> · ${n}</span><button type="button">Undo</button></div>`;

// ---------------------------------------------------------------- Explore pieces

const chip = (k, v) => `<span class="q-chip"><span class="k">${k}</span>${v}<button type="button" aria-label="Remove">${ico("x")}</button></span>`;
const search = (q = "") => clean(F.search).replace(/ value="[^"]*"/, ` value="${esc(q)}"`);

/** A real Explore card, with the pill's + (or ✓) on its picture's corner, or a ⋯ for phones. */
function card(id, { add = false, added = false, hover = false, more = false, pop = "" } = {}) {
  const c = pz(id).card;
  let btn = "";
  if (add || hover) btn = added
    ? `<span class="card-add on" role="img" aria-label="In the set">${ico("check")}</span>`
    : `<button class="card-add" type="button" aria-label="Add ${esc(pz(id).title)} to the set">${ico("plus")}</button>`;
  const dots3 = more ? `<button class="card-more" type="button" aria-label="More">${ico("more")}</button>` : "";
  const cls = [add || hover ? "addable" : "", added ? "in" : "", hover ? "hover" : "", pop ? "pop-on" : ""].filter(Boolean).join(" ");
  return c.replace(/^<li>/, `<li class="${cls}">`).replace('<span class="game-card-text">', `<span class="game-card-text">${dots3}`).replace(/<\/li>$/, `${btn}${hover ? CURSOR : ""}${pop}</li>`);
}

// ---------------------------------------------------------------- 50: Create → Set, a title and nothing else

{
  const body = `<main class="wrap explore x-explore"><header class="x-head"><h1>Explore</h1>${search()}${clean(F.quickChips)}</header>
<section class="shelf"><ul class="cards x-cards">${F.cards.slice(0, 12).map(clean).join("")}</ul></section></main>`;
  const modal = `<div class="scrim"></div><form class="new-set" role="dialog" aria-label="New set" onsubmit="return false">
  <h2>New set</h2>
  <input type="text" placeholder="Untitled set" aria-label="Title" autofocus>
  <p class="muted">Only people with the link can see it until you publish.</p>
  <div class="ns-actions"><button class="btn" type="button">Cancel</button><button class="btn primary" type="submit">Make set</button></div>
</form>`;
  out("f50-new-set.html", page("New set (mockup)", body, { active: "Explore", cls: "modal-open", after: modal }));
}

// ---------------------------------------------------------------- 51–52: Explore with the pill on, filtered to your puzzles

function exploreMine(items, file, title) {
  const inSet = new Set(items.map((it) => it.id));
  const body = `<main class="wrap explore x-explore q-page">
<header class="x-head"><h1>Explore</h1>${search()}
<div class="q-chips" role="group" aria-label="Filters">${chip("By", "you")}<button class="q-add" type="button">${ico("plus")}Filter</button>
<button class="q-sort" type="button"><span class="k">Sort</span> Newest${ico("down")}</button></div></header>
<section class="shelf"><ul class="cards x-cards">${MINE.map((id) => card(id, { add: true, added: inSet.has(id) })).join("")}</ul></section></main>`;
  out(file, page(title, body, { active: "Explore", cls: "pill-on", after: pill(items) }));
}
exploreMine([], "f50-adding-empty.html", "Explore · Adding to a set (mockup)");
exploreMine(FIVE, "f50-adding.html", "Explore · Adding to a set (mockup)");

// ---------------------------------------------------------------- 53: the pill, opened

{
  const inSet = new Set(FIVE.map((it) => it.id));
  const body = `<main class="wrap explore x-explore q-page">
<header class="x-head"><h1>Explore</h1>${search()}
<div class="q-chips" role="group" aria-label="Filters">${chip("By", "you")}<button class="q-add" type="button">${ico("plus")}Filter</button>
<button class="q-sort" type="button"><span class="k">Sort</span> Newest${ico("down")}</button></div></header>
<section class="shelf"><ul class="cards x-cards">${MINE.map((id) => card(id, { add: true, added: inSet.has(id) })).join("")}</ul></section></main>`;
  out("f50-tray.html", page("Explore · The set so far (mockup)", body, { active: "Explore", cls: "pill-on tray-open", after: `<div class="scrim light"></div>${tray(FIVE)}${pill(FIVE, { open: true })}` }));
}

// ---------------------------------------------------------------- 54: a puzzle page with the pill on

function puzzlePage(file, { added }) {
  const S = G.slate;
  const addBtn = added
    ? `<button class="btn add-set done" type="button" aria-pressed="true">${ico("check")}<span>Added</span></button>`
    : `<button class="btn add-set" type="button">${ico("plus")}<span>Add to set</span></button>`;
  const head = clean(S.head)
    .replace(/<a class="like-btn"[^>]*href="[^"]*"/, `<button type="button" class="like-btn" aria-label="Like"`).replace(/<\/a><button class="btn rules-toggle"/, `</button><button class="btn rules-toggle"`)
    .replace(`<button class="btn rules-toggle"`, `${addBtn}<button class="btn rules-toggle"`);
  const body = `<div class="game-layout">${clean(S.backBtn)}
<main class="wrap game-page">${head}<div class="game-body">${clean(S.board)}</div></main></div>`;
  out(file, page("Lamp Code I · Adding to a set (mockup)", body, { cls: "pill-on", after: `${added ? toast(6) : ""}${pill(added ? SIX : FIVE)}` }));
}
puzzlePage("f50-puzzle.html", { added: false });
puzzlePage("f50-puzzle-added.html", { added: true });

// ---------------------------------------------------------------- 55: without the pill: + on hover, a list of your sets

const SETS = [{ name: SET.name, items: SEVEN, on: true }, ...OTHERS.map((s) => ({ ...s, on: false }))];
const setRows = () => SETS.map((s) => `<label class="sl-row"><input type="checkbox"${s.on ? " checked" : ""}>${mosaic(s.items, "tiny")}<span class="sl-name">${esc(s.name)}</span><span class="sl-n">${s.items.length}</span></label>`).join("");
const setsPop = `<div class="sets-pop" role="dialog" aria-label="Add to set"><h3>Add to set</h3>${setRows()}<button class="sl-new" type="button">${ico("plus")}New set</button></div>`;
{
  const ids = ["akari-4", "akari-3", "nf3fyxf7yu", "prn6szg7v2", "z53shxh8w3", "akari-2", "akari-1", "9tw4b3x373", "m29sd5vthj", "5fd6bmpkuw", "s3pw7skznd", "xjvr8a6vpd"];
  const body = `<main class="wrap explore x-explore"><header class="x-head"><h1>Explore</h1>${search("akari")}${clean(F.quickChips)}</header>
<section class="shelf"><ul class="cards x-cards">${ids.map((id) => id === "nf3fyxf7yu" ? card(id, { hover: true, pop: setsPop }) : card(id)).join("")}</ul></section></main>`;
  out("f50-save.html", page("Explore · Add to set (mockup)", body, { active: "Explore", cls: "save-desk" }));

  // phones: ⋯ on each card opens a short menu; Add to set opens the same list as a sheet
  const phoneBody = `<main class="wrap explore x-explore"><header class="x-head"><h1>Explore</h1>${search("akari")}${clean(F.quickChips)}</header>
<section class="shelf"><ul class="cards x-cards">${ids.map((id) => card(id, { more: true })).join("")}</ul></section></main>`;
  const t = pz("nf3fyxf7yu");
  const menu = `<div class="scrim"></div><div class="psheet" role="menu" aria-label="${esc(t.title)}"><span class="grabber"></span>
  <div class="ps-head">${t.pic}<span><strong>${esc(t.title)}</strong><span class="by">${t.by}</span></span></div>
  <button role="menuitem" type="button">${ico("set")}Add to set</button>
  <button role="menuitem" type="button">${ico("link")}Copy link</button></div>`;
  out("f50-save-menu.html", page("Explore · Card menu (mockup)", phoneBody, { active: "Explore", cls: "sheet-on", after: menu }));
  const sets = `<div class="scrim"></div><div class="psheet" role="dialog" aria-label="Add to set"><span class="grabber"></span>
  <h3>Add to set</h3>${setRows()}<button class="sl-new" type="button">${ico("plus")}New set</button></div>`;
  out("f50-save-sheet.html", page("Explore · Add to set (mockup)", phoneBody, { active: "Explore", cls: "sheet-on", after: sets }));
}

// ---------------------------------------------------------------- 56: all of a search's results at once

{
  const ids = ["akari-3", "nf3fyxf7yu", "prn6szg7v2", "z53shxh8w3", "akari-1", "m29sd5vthj", "5fd6bmpkuw", "bv389fk3h7", "yvu9je7cr7", "nbkh7jajpx", "xjvr8a6vpd", "s3pw7skznd"];
  const pop = `<div class="sets-pop all-pop" role="dialog" aria-label="Add these 12 to a set"><h3>Add these 12 to</h3>
  ${SETS.map((s) => `<button class="sl-row pick" type="button">${mosaic(s.items, "tiny")}<span class="sl-name">${esc(s.name)}</span><span class="sl-n">${s.items.length}</span></button>`).join("")}
  <button class="sl-new" type="button">${ico("plus")}New set</button>
  <p class="muted">They go at the end, in this order.</p></div>`;
  const body = `<main class="wrap explore x-explore q-page">
<header class="x-head"><h1>Explore</h1>${search("akari")}
<div class="q-chips" role="group" aria-label="Filters">${chip("Type", "Akari")}${chip("", `${dots(1).replace('role="img" ', "")} Easy`)}<button class="q-add" type="button">${ico("plus")}Filter</button>
<button class="q-sort" type="button"><span class="k">Sort</span> Newest${ico("down")}</button></div></header>
<section class="shelf q-results">
<div class="q-bar"><p class="q-count"><strong>12</strong> puzzles</p><div class="q-actions"><a class="btn" href="#play">${ico("play", "mini-icon fill")}Play</a><span class="share-wrap"><button class="btn open" type="button" aria-expanded="true">${ico("set")}Add these 12 to a set</button>${pop}</span></div></div>
<ul class="cards x-cards">${ids.map((id) => card(id)).join("")}</ul>
</section></main>`;
  out("f50-add-all.html", page("Explore · Add these to a set (mockup)", body, { active: "Explore" }));
}

// ---------------------------------------------------------------- 57: /s/<id>/edit, only about order

{
  const row = (it, i, n, lift) => `<li class="e-row${lift ? " lift" : ""}">
<span class="cs-grip" title="Drag to move">${ico("grip")}</span><span class="cs-n">${i + 1}</span>${it.pic}
<span class="e-text"><strong>${esc(it.title)}</strong><span class="by">${it.by}<span class="e-dots">${dots(it.level)}</span></span></span>
<span class="e-diff">${dots(it.level)}</span>
<span class="cs-move"><button type="button" aria-label="Move up"${i === 0 ? " disabled" : ""}>${ico("up")}</button><button type="button" aria-label="Move down"${i === n - 1 ? " disabled" : ""}>${ico("down")}</button></span>
<button class="cs-x" type="button" aria-label="Remove ${esc(it.title)}">${ico("x")}</button></li>`;
  const body = `<main class="e-page">
<div class="e-top"><a class="cs-back" href="#back" aria-label="Back">${ico("chevL")}</a><span class="draft-pill">Draft</span><span class="muted">Saved</span>
  <span class="e-share"><span class="e-unlisted">Unlisted: anyone with the link</span><button class="btn" type="button">${ico("share")}Share</button></span></div>
<header class="e-head">${mosaic(SEVEN, "big")}
  <div class="e-words"><input class="e-name" type="text" value="${esc(SET.name)}" aria-label="Title"><textarea class="e-intro" rows="2" placeholder="Say what it’s for (optional)" aria-label="Description">${esc(SET.intro)}</textarea></div></header>
<div class="cs-list-head"><h2>Puzzles</h2><span class="muted">${SEVEN.length}</span></div>
<ol class="e-list">${SEVEN.map((it, i) => row(it, i, SEVEN.length, i === 1)).join("")}</ol>
<button class="btn e-add" type="button">${ico("plus")}Add puzzles</button>
</main>
<footer class="e-foot"><p>After you publish, the puzzles and their order stay as they are.</p><button class="btn primary" type="button">Publish</button></footer>`;
  out("f50-edit.html", page("Akari for beginners · Edit (mockup)", body, { active: "Profile", cls: "edit50" }));
}

// ---------------------------------------------------------------- the contact sheet, in flow order

export const ROWS = [
  ["50", "Create → Set: a title, nothing else", "50-new-set", "dp"],
  ["51", "Just made: Explore opens on your puzzles, the pill at the bottom", "51-adding-empty", "d"],
  ["52", "Adding: + on every card, ✓ on the ones in", "52-adding", "dp"],
  ["53", "The pill opened: the set so far, in order", "53-tray", "dp"],
  ["54", "A puzzle page with the pill on", "54-puzzle", "dp"],
  ["54b", "Added, with Undo", "54b-puzzle-added", "dp"],
  ["55", "No pill: + on hover (desktop), ⋯ on the card (phone)", "55-save", "dp"],
  ["55b", "Phone: the list of your sets", "55b-save-sheet", "p"],
  ["56", "Search results, all at once", "56-add-all", "d"],
  ["57", "The edit page: order, then Publish", "57-edit", "dp"],
];
const sheet50 = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Making a set</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css"><link rel="stylesheet" href="create-set.css"></head>
<body class="sheet-index"><main>
<h1>Making a set</h1>
<p class="muted">Name it, then add with + wherever you are. Mockups, not product code.</p>
<table class="contact"><thead><tr><th></th><th>Desktop</th><th>Phone</th></tr></thead><tbody>
${ROWS.map(([k, d, p, has]) => `<tr><th><strong>${k}</strong><span>${esc(d)}</span></th><td>${has.includes("d") ? `<img src="${p}-desktop.png" class="desktop">` : ""}</td><td>${has.includes("p") ? `<img src="${p}-phone.png" class="phone">` : ""}</td></tr>`).join("")}
</tbody></table>
</main></body></html>`;
out("contact-50.html", sheet50);
console.log("wrote f50-*.html and contact-50.html");
