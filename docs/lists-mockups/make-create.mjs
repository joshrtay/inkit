// Builds the "Create → Set" mockups (docs/lists-mockups/4x-*.html): Create opens a small menu
// (Puzzle, Set); Set opens /s/new, where you name the set, describe it, and add puzzles from a
// search that starts on your own library. Same real pieces as make-sets.mjs (fragments.json, from
// capture.mjs); its own styles in create-set.css. Not product code.
//
// Run from the repo root: node docs/lists-mockups/make-create.mjs, then node docs/lists-mockups/shoot-create.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const F = JSON.parse(readFileSync(`${dir}fragments.json`, "utf8"));
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s) => s.replace(/ data-discover="true"/g, "").replace(/<!-- -->/g, "");

// ---------------------------------------------------------------- icons

const P = {
  set: ["M4 7h12v13H4z", "M8 4h12v13"],
  puzzle: ["M4 4h16v16H4z", "M4 12h16", "M12 4v16"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
  chevL: ["m15 18-6-6 6-6"], down: ["m6 9 6 6 6-6"], up: ["m18 15-6-6-6 6"],
  x: ["M18 6 6 18", "M6 6l12 12"], plus: ["M12 5v14", "M5 12h14"], check: ["m5 12 5 5 9-10"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  note: ["M5 4h14v12l-4 4H5z", "M15 20v-4h4", "M8 9h8", "M8 13h5"],
};
const ico = (n, cls = "mini-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n].map((d) => `<path d="${d}"/>`).join("")}</svg>`;

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
    when: g(/class="when">([^<]*)/) || "",
    pic: c.match(/<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>/)[0].replace("pic thumb", "pic cthumb"),
  });
}
const pz = (id) => PZ.get(id);
const dots = (level) => `<span class="diff" role="img" aria-label="Difficulty ${level} of 3" title="${["", "Easy", "Medium", "Hard"][level]}">${[1, 2, 3].map((i) => `<i${i <= level ? ' class="on"' : ""}></i>`).join("")}</span>`;

// Wyatt's library, newest first. One draft at the top (a real thumbnail, standing in for an unpublished one).
const DRAFT = { ...pz("honeycomb-paths-3"), id: "draft-1", title: "Untitled", when: "today", draft: true };
const WHEN = ["2 d ago", "2 d ago", "3 d ago", "3 d ago", "4 d ago", "4 d ago", "5 d ago", "6 d ago", "1 wk ago", "1 wk ago", "1 wk ago", "2 wk ago", "2 wk ago", "2 wk ago", "3 wk ago"];
const MINE = [DRAFT, ...["akari-4", "akari-3", "sudoku-3", "binary-puzzle-3", "akari-2", "star-battle-3", "akari-1", "nonogram-5", "thermo-sudoku-2", "binary-puzzle-2", "aquarium-2", "fillomino-3", "irregular-sudoku-2", "hive-3", "square-jam-2"]
  .map((id, i) => ({ ...pz(id), when: WHEN[i] || "3 wk ago" }))];
// chips: Wyatt's own types, most used first
const TYPES = [["Akari", 4], ["Sudoku", 3], ["Binary Puzzle", 3], ["Star Battle", 1], ["Nonogram", 1]];
// everyone, searching "lamp"
const LAMP = ["s3pw7skznd", "xjvr8a6vpd", "nbkh7jajpx", "yvu9je7cr7", "m29sd5vthj", "9tw4b3x373", "z53shxh8w3", "nf3fyxf7yu", "vq6b286hmx", "5fd6bmpkuw", "bv389fk3h7"].map(pz);

// the set being made
const SET = { name: "Akari, start here", intro: "Five Akari, easy to hard. Start with Lights On." };
const FIVE = ["akari-1", "s3pw7skznd", "akari-3", "akari-2", "akari-4"].map(pz);
const NOTES = { "akari-1": "Start with the 0. Nothing goes next to it." };

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
  <a role="menuitem" href="/s/new">${ico("set", "cm-icon")}<strong>Set</strong><span>Puzzles in an order you pick</span></a>
</div>`;
const nav = (active, menuOpen) => {
  let s = clean(F.sidenav).replace(/ class="nav-item active" aria-current="page"/, ` class="nav-item"`);
  s = item(s, "Sign in", () => `<button type="button" class="nav-item"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg><span>More</span></button>`);
  if (active) s = item(s, active, (t) => t.replace(`class="nav-item"`, `class="nav-item active" aria-current="page"`));
  // Create: a button with a caret that opens Puzzle / Set
  s = s.replace(/<button type="button" class="btn primary create-btn"[^>]*>([\s\S]*?)<span>Create<\/span><\/button>/, (_, icon) =>
    `<div class="create-wrap"><button type="button" class="btn primary create-btn" aria-haspopup="menu" aria-expanded="${!!menuOpen}">${icon}<span>Create</span>${ico("down", "mini-icon caret")}</button>${menuOpen ? CREATE_MENU : ""}</div>`);
  return s;
};
const tabbar = (active, createOn) => {
  let s = clean(F.tabbar).replace(/ class="active" aria-current="page"/, "");
  if (active) s = item(s, active, (t) => t.replace(/^<a( class="")?/, `<a class="active" aria-current="page"`));
  if (createOn) s = s.replace(`class="tab-create" aria-haspopup="dialog"`, `class="tab-create on" aria-haspopup="menu" aria-expanded="true"`);
  return s;
};
const page = (title, body, { active = "", cls = "", after = "", menuOpen = false, tabCreate = false } = {}) => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- A mockup of making a set (not product code). Generated by make-create.mjs; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="lists.css">
<link rel="stylesheet" href="create-set.css">
</head>
<body class="${cls}">
${F.defs}
<div class="shell">${nav(active, menuOpen)}<div class="page">${body}</div>${tabbar(active, tabCreate)}</div>${after}
</body></html>
`;
const out = (name, html) => writeFileSync(`${dir}${name}`, html);

// ---------------------------------------------------------------- 40: the Create menu

{
  const search = clean(F.search).replace(/ value="akari"/, ` value=""`);
  const body = `<main class="wrap explore x-explore"><header class="x-head"><h1>Explore</h1>${search}${clean(F.quickChips)}</header>
<section class="shelf"><ul class="cards x-cards">${F.cards.slice(0, 12).map(clean).join("")}</ul></section></main>`;
  const sheet = `<div class="sheet-scrim"></div><div class="bottom-sheet create-sheet" role="menu" aria-label="Create"><span class="grabber"></span>
  <a role="menuitem" href="/new">${ico("puzzle", "cm-icon")}<strong>Puzzle</strong><span>Draw a new one</span></a>
  <a role="menuitem" href="/s/new">${ico("set", "cm-icon")}<strong>Set</strong><span>Puzzles in an order you pick</span></a></div>`;
  out("create-menu.html", page("Explore · Create menu (mockup)", body, { active: "Explore", menuOpen: true, tabCreate: true, cls: "create-open", after: sheet }));
}

// ---------------------------------------------------------------- the set's side: name, words, list

function listRow(it, i, { lift = false, noteOpen = false } = {}) {
  const note = NOTES[it.id];
  return `<li class="cs-row${lift ? " lift" : ""}${noteOpen ? " note-open" : ""}">
<span class="cs-grip" title="Drag to move">${ico("grip")}</span><span class="cs-n">${i + 1}</span>${it.pic}
<span class="cs-text"><strong>${esc(it.title)}</strong><span class="by">${it.name === "Wyatt" ? `<span class="kind">${esc(it.kind)}</span>` : it.by}</span>${note && !noteOpen ? `<span class="cs-note">${esc(note)}</span>` : ""}</span>
<span class="cs-move"><button type="button" aria-label="Move up"${i === 0 ? " disabled" : ""}>${ico("up")}</button><button type="button" aria-label="Move down"${i === FIVE.length - 1 ? " disabled" : ""}>${ico("down")}</button></span>
<button class="cs-note-btn${note ? " has" : ""}" type="button" aria-label="Note" title="${note ? "Edit note" : "Add a note"}">${ico("note")}</button>
<button class="cs-x" type="button" aria-label="Remove ${esc(it.title)}">${ico("x")}</button>
${noteOpen ? `<input class="cs-note-in" type="text" value="${esc(note || "")}" placeholder="A note on this one (optional)" aria-label="Note"><button class="cs-remove" type="button">${ico("x")}Remove</button>` : ""}</li>`;
}
function setSide(items, { lift = -1, noteOpen = -1 } = {}) {
  const named = items.length > 0;
  const list = items.length
    ? `<ol class="cs-list">${items.map((it, i) => listRow(it, i, { lift: i === lift, noteOpen: i === noteOpen })).join("")}</ol>`
    : `<div class="cs-empty"><p>No puzzles yet.</p><p class="muted"><span class="desk">Add them with ${ico("plus")} on the right.</span><span class="ph">Add some, then put them in order.</span></p></div>`;
  return `<header class="cs-head">
  <div class="cs-top"><a class="cs-back" href="#back" aria-label="Back">${ico("chevL")}</a><span class="cs-kicker">${ico("set")}New set</span><span class="draft-pill">Draft</span>${named ? `<span class="muted cs-saved">Saved</span>` : ""}</div>
  <input class="cs-name${named ? "" : " empty"}" type="text" ${named ? `value="${esc(SET.name)}"` : `placeholder="Name"`} aria-label="Name">
  <textarea class="cs-intro" rows="2" placeholder="Say what it’s for (optional)" aria-label="Description">${named ? esc(SET.intro) : ""}</textarea>
</header>
<div class="cs-list-head"><h2>Puzzles</h2>${items.length ? `<span class="muted">${items.length} · drag to reorder</span>` : ""}</div>
${list}`;
}
const foot = (n) => `<footer class="cs-foot"><p>After you publish, the puzzles and their order stay as they are. You can still fix the words.</p><button class="btn" type="button">Save draft</button><button class="btn primary" type="button"${n ? "" : " disabled"}>Publish</button></footer>`;

// ---------------------------------------------------------------- the search side

function resultCard(it, { inSet, everyone }) {
  const btn = it.draft
    ? `<span class="rc-draft">Draft</span>`
    : inSet ? `<span class="rc-btn on" role="img" aria-label="In the set">${ico("check")}</span>` : `<button class="rc-btn" type="button" aria-label="Add ${esc(it.title)}">${ico("plus")}</button>`;
  const meta = everyone ? `<span class="by">${it.by}</span>` : `<span class="rc-meta"><span>${esc(it.kind)}</span>${dots(it.level)}<span>${esc(it.when)}</span></span>`;
  return `<li class="rc${it.draft ? " draft" : ""}${inSet ? " in" : ""}"><span class="rc-pic">${it.pic}${btn}</span><strong>${esc(it.title)}</strong>${meta}</li>`;
}
function resultRow(it, { inSet, everyone }) {
  const btn = it.draft
    ? `<span class="rc-draft">Draft</span>`
    : inSet ? `<span class="rr-btn on" role="img" aria-label="Added">${ico("check")}</span>` : `<button class="rr-btn" type="button" aria-label="Add ${esc(it.title)}">${ico("plus")}</button>`;
  const meta = everyone ? `<span class="by">${it.by}</span>` : `<span class="rc-meta"><span>${esc(it.kind)}</span>${dots(it.level)}<span>${esc(it.when)}</span></span>`;
  return `<li class="rr${it.draft ? " draft" : ""}${inSet ? " in" : ""}">${it.pic}<span class="rr-text"><strong>${esc(it.title)}</strong>${meta}</span>${btn}</li>`;
}
function searchHead({ everyone, q, type }) {
  return `<form class="guide-search cs-search" role="search" onsubmit="return false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg><input type="search" value="${esc(q)}" placeholder="${everyone ? "Search all puzzles" : "Search your puzzles"}" aria-label="Search">${q ? `<button class="cs-clear" type="button" aria-label="Clear">${ico("x")}</button>` : ""}</form>
<div class="cs-filters"><span class="seg small" role="tablist" aria-label="Whose"><button role="tab" aria-selected="${!everyone}">Mine</button><button role="tab" aria-selected="${everyone}">Everyone</button></span>
<span class="type-chips" role="group" aria-label="Type">${[["All", 0], ...TYPES].map(([t, n]) => `<button type="button" aria-pressed="${(type || "All") === t}">${esc(t)}${n && !everyone ? `<span>${n}</span>` : ""}</button>`).join("")}</span></div>`;
}
function searchPanel({ everyone = false, q = "", type = "", inSet = new Set(), rows = false, n }) {
  let res = everyone ? LAMP : MINE;
  if (type) res = res.filter((it) => it.kind === type);
  const count = everyone ? `<p class="cs-count"><strong>${res.length}</strong> puzzles called “${esc(q)}”</p>` : `<p class="cs-count">Your puzzles, newest first<span class="muted"> · drafts can’t go in a set</span></p>`;
  const list = rows
    ? `<ul class="rr-list">${res.slice(0, n).map((it) => resultRow(it, { inSet: inSet.has(it.id), everyone })).join("")}</ul>`
    : `<ul class="rc-grid">${res.slice(0, n).map((it) => resultCard(it, { inSet: inSet.has(it.id), everyone })).join("")}</ul>`;
  const more = everyone ? "" : `<p class="cs-more">Not here? <a href="#everyone">Search everyone’s puzzles</a></p>`;
  return `${searchHead({ everyone, q, type })}${count}${list}${more}`;
}

// ---------------------------------------------------------------- 41–42: /s/new on a desktop and a phone

const IN5 = new Set(FIVE.map((it) => it.id));
function editor(name, items, panelOpts, sideOpts = {}) {
  const body = `<div class="cs-page">
<main class="cs-set">${setSide(items, sideOpts)}</main>
<aside class="cs-panel" aria-label="Add puzzles"><h2 class="cs-panel-h">Add puzzles</h2>${searchPanel({ n: 12, ...panelOpts })}</aside>
${foot(items.length)}
<div class="cs-phone-bar"><button class="btn cs-add" type="button">${ico("plus")}Add puzzles</button></div>
</div>`;
  out(name, page("New set (mockup)", body, { cls: "cs" }));
}
editor("create-empty.html", [], { inSet: new Set() });
editor("create-five.html", FIVE, { inSet: IN5 }, { lift: 3 });
editor("create-five-everyone.html", FIVE, { everyone: true, q: "lamps", inSet: IN5 }, { noteOpen: 0 });
editor("create-five-note.html", FIVE, { inSet: IN5 }, { noteOpen: 0 });

// ---------------------------------------------------------------- 43: the phone's search sheet

function sheet(name, { everyone = false, q = "", added = 3, inSet }) {
  const body = `<div class="cs-page">
<main class="cs-set">${setSide(FIVE.slice(0, 2))}</main>
</div>
<div class="full-sheet" role="dialog" aria-label="Add puzzles">
  <div class="fs-top"><button class="fs-x" type="button" aria-label="Close">${ico("x")}</button><h2>Add puzzles</h2><span class="fs-count">${added} added</span><button class="btn primary fs-done" type="button">Done</button></div>
  ${searchPanel({ everyone, q, inSet, rows: true, n: 12 })}
</div>`;
  out(name, page("New set · Add puzzles (mockup)", body, { cls: "cs sheet-open" }));
}
// mid-adding: two were in before (Lights On, Lamps I), three just added (Secret Code, Night Shift, Letters in the Dark)
sheet("create-sheet.html", { inSet: IN5, added: 3 });
sheet("create-sheet-everyone.html", { everyone: true, q: "lamps", inSet: IN5, added: 3 });

// ---------------------------------------------------------------- 44: Publish

{
  const dlg = `<div class="sheet-scrim"></div><div class="publish-dlg" role="dialog" aria-label="Publish">
  <h3>Publish “${esc(SET.name)}”?</h3>
  <p class="pd-pics">${FIVE.map((it) => it.pic).join("")}</p>
  <p>5 puzzles. Once it’s out, the puzzles and their order stay as they are. You can still fix the name, the description and the notes.</p>
  <div class="pd-actions"><button class="btn" type="button">Not yet</button><button class="btn primary" type="button">Publish</button></div>
</div>`;
  const body = `<div class="cs-page">
<main class="cs-set">${setSide(FIVE)}</main>
<aside class="cs-panel" aria-label="Add puzzles"><h2 class="cs-panel-h">Add puzzles</h2>${searchPanel({ n: 12, inSet: IN5 })}</aside>
${foot(5)}
<div class="cs-phone-bar"><button class="btn cs-add" type="button">${ico("plus")}Add puzzles</button></div>
</div>`;
  out("create-publish.html", page("New set · Publish (mockup)", body, { cls: "cs publish-open", after: dlg }));
}

// ---------------------------------------------------------------- the contact sheet

const ROWS = [
  ["40", "Create opens a menu: Puzzle or Set", "40-create-menu"],
  ["41", "New set, empty: the search starts on your puzzles", "41-new-set-empty"],
  ["42", "Five added; one being dragged (desktop)", "42-new-set-five"],
  ["42b", "Everyone, searching “lamps”; a note open on 1", "42b-new-set-everyone"],
  ["43", "Phone: the Add puzzles sheet, 3 added", "43-add-sheet"],
  ["43b", "Phone sheet, Everyone", "43b-add-sheet-everyone"],
  ["44", "Publish", "44-publish"],
];
const has = (p, s) => !((p.startsWith("43") && s === "desktop"));
const sheet40 = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Create a set</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css"><link rel="stylesheet" href="create-set.css"></head>
<body class="sheet-index"><main>
<h1>Create → Set</h1>
<p class="muted">Name it, say what it’s for, add puzzles with +. Mockups, not product code.</p>
<table class="contact"><thead><tr><th></th><th>Desktop</th><th>Phone</th></tr></thead><tbody>
${ROWS.map(([k, d, p]) => `<tr><th><strong>${k}</strong><span>${esc(d)}</span></th><td>${has(p, "desktop") ? `<img src="${p}-desktop.png" class="desktop">` : ""}</td><td>${has(p, "phone") ? `<img src="${p}-phone.png" class="phone">` : ""}</td></tr>`).join("")}
</tbody></table>
</main></body></html>`;
out("contact-40.html", sheet40);
console.log("wrote create-menu, create-empty, create-five, create-five-everyone, create-five-note, create-sheet, create-sheet-everyone, create-publish, contact-40");
