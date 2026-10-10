// Builds the 80- mockups (docs/lists-mockups/f80-*.html): the set drawer, third round.
// - The puzzle page's title row: the title, with ♡ and ⋯ at its right; the meta line (the type's
//   name opens How to play) on its own line under it. Phones clamp the paper's description to two
//   lines, so ? fits beside it.
// - Sets live in the profile's Puzzles grid with the puzzles, newest first, as a card whose picture
//   is its first four puzzles; no Sets tab. The owner gets a Drafts tab: draft puzzles and draft
//   sets, each with Edit. A set card looks the same in Explore and in the Subscriptions feed.
// - A draft set says "Only you can see it." everywhere.
// - Phones: ⋯ gains the set in progress in this tab ("Akari for beginners · 7"), which opens it.
// - The first-time note ("New to Akari? How to play") shows signed out too, with ×; not remembered.
// Helpers as in make-70.mjs (copied, so each round stands alone). Styles in drawer-80.css, on top of
// drawer-70.css and what it sits on. Not product code.
//
// Run from the repo root: node docs/lists-mockups/make-80.mjs, then node docs/lists-mockups/shoot-80.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const F = JSON.parse(readFileSync(`${dir}fragments.json`, "utf8"));
const G = JSON.parse(readFileSync(`${dir}fragments-50.json`, "utf8"));
const H = JSON.parse(readFileSync(`${dir}fragments-60.json`, "utf8"));
const K = JSON.parse(readFileSync(`${dir}fragments-70.json`, "utf8"));
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s) => s.replace(/ data-discover="true"/g, "").replace(/<!-- -->/g, "");

// ---------------------------------------------------------------- icons

const P = {
  set: ["M4 7h12v13H4z", "M8 4h12v13"],
  chevL: ["m15 18-6-6 6-6"], down: ["m6 9 6 6 6-6"], up: ["m18 15-6-6-6 6"],
  x: ["M18 6 6 18", "M6 6l12 12"], plus: ["M12 5v14", "M5 12h14"], check: ["m5 12 5 5 9-10"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  arrowR: ["M5 12h14", "m13 6 6 6-6 6"], more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
  pencil: ["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"], play: ["M7 4.5v15l12-7.5z"],
  share: ["M12 3v12", "m7 8 5-5 5 5", "M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"],
};
const ico = (n, cls = "mini-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n].map((d) => `<path d="${d}"/>`).join("")}</svg>`;
// the ? on the paper, drawn like undo and reset
const QMARK = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.6 8.6a3.5 3.5 0 1 1 4.9 3.2c-.9.4-1.5 1.2-1.5 2.2v.6"></path><path d="M12 18.6h.01"></path></svg>`;
const CURSOR = `<svg class="cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.5L10 19z"/></svg>`;

// ---------------------------------------------------------------- puzzles, from the captured cards

const PZ = new Map();
for (const c of [...F.cards, ...F.mixedCards]) {
  const g = (r) => (c.match(r) || [])[1];
  const id = g(/href="\/g\/([^"]+)"/);
  if (PZ.has(id) || !c.includes('<span class="by">')) continue;
  PZ.set(id, {
    id, title: g(/<strong>([^<]*)/), kind: g(/class="kind">([^<]*)/),
    name: g(/by-name">([^<]*)/), by: clean(g(/<span class="by">([\s\S]*?)<\/span><span class="card-foot">/)),
    level: { Easy: 1, Medium: 2, Hard: 3 }[g(/Difficulty: (\w+)/)] ?? 1,
    mins: +(clean(c).match(/~(\d+) min/) || [0, 4])[1],
    pic: c.match(/<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>/)[0].replace("pic thumb", "pic cthumb"),
    card: clean(c),
  });
}
const pz = (id) => PZ.get(id);
const LEVEL = ["", "Easy", "Medium", "Hard"];
const dots = (level) => `<span class="diff" role="img" aria-label="Difficulty ${level} of 3" title="${LEVEL[level]}">${[1, 2, 3].map((i) => `<i${i <= level ? ' class="on"' : ""}></i>`).join("")}</span>`;

// The set: 5 to start; Lamp Code I from its ⋯ (71–72) makes 6; Lamp Code II from the drawer's last row
// makes 7 (72b, and on the phone, 76); Lamp Code IV is next.
const SET = { name: "Akari for beginners", intro: "From your first lamp to letters. Try them in order." };
const FIVE = ["s3pw7skznd", "akari-1", "akari-3", "akari-2", "akari-4"].map(pz);
const SIX = [...FIVE, pz("m29sd5vthj")];
const SEVEN = [...SIX, pz("9tw4b3x373")];
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
/** `slot`: the right-hand pane (the set drawer, or How to play). `wide`: the slot is How to play's width. */
const page = (title, body, { active = "", cls = "", slot = "", after = "" } = {}) => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- A mockup of the set drawer, third round (not product code). Generated by make-80.mjs; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="lists.css">
<link rel="stylesheet" href="create-set.css">
<link rel="stylesheet" href="flow-50.css">
<link rel="stylesheet" href="drawer-60.css">
<link rel="stylesheet" href="drawer-70.css">
<link rel="stylesheet" href="drawer-80.css">
</head>
<body class="f50 f60 f70 f80 ${slot ? "slot-on" : ""} ${cls}">
${F.defs}
<div class="shell">${nav(active)}<div class="page">${body}</div>${slot ? `<div class="slot">${slot}</div>` : ""}${tabbar(active)}</div>${after}
</body></html>
`;
const out = (name, html) => writeFileSync(`${dir}${name}`, html);

// ---------------------------------------------------------------- the list of drafts

const SETS = [{ name: SET.name, items: FIVE }, ...OTHERS];
const setList = ({ sets = SETS, hover = -1, cls = "" } = {}) => `<div class="sets-pop add-pop ${cls}" role="dialog" aria-label="Add to set"><span class="grabber"></span><h3>Add to set</h3>
${sets.map((s, i) => `<button class="sl-row pick${i === hover ? " hov" : ""}" type="button">${mosaic(s.items, "tiny")}<span class="sl-name">${esc(s.name)}</span><span class="sl-n">${s.items.length}</span></button>`).join("")}
<label class="sl-field">${ico("plus")}<input type="text" placeholder="New set" aria-label="New set"></label></div>`;

// ---------------------------------------------------------------- the thin drawer

/** A row: handle, number, picture, title. `hover`: the pointer is on it (× and who/how hard show).
 *  `here`: the puzzle on screen. Phones: ↑↓ and × always. */
const row = (it, i, { here = false, hover = false, phone = false, n = 0 } = {}) => `<li class="t-row${here ? " here" : ""}${hover ? " hov" : ""}" title="${esc(`${it.name} · ${LEVEL[it.level]}`)}">
${phone ? "" : `<span class="d-grip" title="Drag to move">${ico("grip")}</span>`}<span class="d-n">${i + 1}</span>${it.pic}
<span class="t-title">${esc(it.title)}</span>
${phone ? `<span class="d-move"><button type="button" aria-label="Move up"${i === 0 ? " disabled" : ""}>${ico("up")}</button><button type="button" aria-label="Move down"${i === n - 1 ? " disabled" : ""}>${ico("down")}</button></span>` : ""}
<button class="d-x" type="button" aria-label="Take ${esc(it.title)} out">${ico("x")}</button>
${hover ? `<span class="tip t-tip">${esc(it.name)} · ${LEVEL[it.level]}</span>${CURSOR}` : ""}</li>`;

/** The set drawer, 280px. `here`: the puzzle on screen (a puzzle page): if it's in the set its row is
 *  marked, otherwise the last row offers to add it. `hover`: a row under the pointer. */
function drawer(items, { here = null, hover = -1, intro = "", phone = false, addHover = false } = {}) {
  const at = here ? items.findIndex((it) => it.id === here.id) : -1;
  const rows = items.map((it, i) => row(it, i, { here: i === at, hover: i === hover, phone, n: items.length })).join("");
  const add = here && at < 0
    ? `<li class="t-add${addHover ? " hov" : ""}"><button type="button">${ico("plus")}<span>Add <strong>${esc(here.title)}</strong></span></button>${addHover ? CURSOR : ""}</li>` : "";
  const note = at >= 0 ? `<p class="t-here">${ico("check")}This puzzle is #${at + 1}</p>` : "";
  return `<aside class="sdrawer thin${phone ? " as-sheet" : ""}" aria-label="Set: ${esc(SET.name)}">${phone ? `<span class="grabber"></span>` : ""}
<div class="d-head"><span class="draft-pill">Draft</span><span class="muted d-saved">Saved</span><button class="d-close" type="button" aria-label="Close">${ico("x")}</button></div>
<div class="t-top">${mosaic(items, "t-cover")}<div class="t-name" contenteditable="true" role="textbox" aria-label="Title">${esc(SET.name)}</div></div>
<textarea class="d-intro t-intro" rows="${intro ? 2 : 1}" placeholder="Description (optional)" aria-label="Description">${esc(intro)}</textarea>
<div class="d-count"><strong>${items.length} puzzles</strong><span class="muted"> · ~${mins(items)} min</span></div>
<ol class="d-list t-list">${rows}${add}</ol>${note}
<div class="d-foot t-foot">
  <p>After you publish, the puzzles and their order stay as they are.</p>
  <button class="btn primary" type="button">Publish</button>
  <a class="d-open" href="#set">Open set page${ico("arrowR")}</a></div></aside>`;
}

// ---------------------------------------------------------------- the puzzle page

/** The header: title, meta (the type's name opens How to play), then ♡ and ⋯. `menu`: what ⋯ shows. */
function head(S, { menu = "", rules = false } = {}) {
  return clean(S.head)
    .replace(/<a class="like-btn"[^>]*href="[^"]*"/, `<button type="button" class="like-btn" aria-label="Like"`).replace(/<\/a><button class="btn rules-toggle"/, `</button><button class="btn rules-toggle"`)
    .replace(/<span class="muted">(\w+)/, (_, kind) => `<span class="muted"><a class="type-link${rules ? " on" : ""}" href="#rules" aria-expanded="${rules}" title="How to play ${kind}">${kind}</a>`)
    .replace(/<button class="btn rules-toggle"[^>]*>How to play<\/button>/, `<div class="game-more"><button type="button" class="btn icon more-btn${menu ? " open" : ""}" aria-label="More for this puzzle" aria-expanded="${!!menu}">${ico("more")}</button>${menu}</div>`);
}
const moreMenu = ({ owner = false, hover = false } = {}) => `<div class="menu more70" role="menu">
<button type="button" role="menuitem" class="${hover ? "hov" : ""}">${ico("set")}Add to set</button>${hover ? CURSOR : ""}
<button type="button" role="menuitem">${ico("link")}Copy link</button>
${owner ? `<hr><button type="button" role="menuitem" class="danger">${ico("trash")}Delete…</button>` : ""}</div>`;
/** The board, with ? on its strip before undo and reset; `chip`: the first-time note under it. */
function board(S, { chip = false, kind = "Akari", rules = false } = {}) {
  const q = `<button class="tool${rules ? " on" : ""}" data-rules="" type="button" aria-label="How to play" title="How to play" aria-expanded="${rules}">${QMARK}</button>`;
  const note = chip ? `<p class="first-note" role="note">New to ${kind}? <a href="#rules">How to play</a><button type="button" aria-label="Dismiss">${ico("x")}</button></p>` : "";
  return clean(S.board).replace(`<div class="group">`, `<div class="group">${q}`).replace(/(<div class="group">[\s\S]*?<\/div>)/, `$1${note}`);
}
function puzzlePage(S, { menu = "", chip = false, rules = false } = {}) {
  return `<div class="game-layout">${clean(S.backBtn)}<main class="wrap game-page g70 g80">${head(S, { menu, rules })}<div class="game-body">${board(S, { chip, rules })}</div></main></div>`;
}
const guidePane = () => clean(H.guide).replace(`class="guide-pane open side"`, `class="guide-pane open in-slot"`);
const toast = (html, action) => `<div class="toast t60" role="status">${ico("check")}<span>${html}</span><button type="button">${action}</button></div>`;
const L1 = pz("m29sd5vthj"), L2 = pz("9tw4b3x373"), L4 = pz("nf3fyxf7yu");

// ---------------------------------------------------------------- cards

const IDS = ["akari-4", "akari-3", "nf3fyxf7yu", "prn6szg7v2", "z53shxh8w3", "akari-2", "akari-1", "9tw4b3x373", "m29sd5vthj", "5fd6bmpkuw", "s3pw7skznd", "xjvr8a6vpd"];
function card(id, { set = null, phone = false } = {}) {
  const c = pz(id).card;
  if (!set) return c;   // drawer closed: as today
  const inSet = set.has(id);
  const btn = inSet
    ? `<button class="card-add on" type="button" aria-label="In ${esc(SET.name)}" title="In ${esc(SET.name)}">${ico("check")}</button>`
    : `<button class="card-add" type="button" aria-label="Add to ${esc(SET.name)}" title="Add to ${esc(SET.name)}">${ico("plus")}</button>`;
  return c.replace(/^<li>/, `<li class="addable${inSet ? " in" : ""}">`).replace(/<\/li>$/, `${btn}</li>`);
}
const explore = (cards) => `<main class="wrap explore x-explore"><header class="x-head"><h1>Explore</h1>${clean(F.search).replace(/ value="[^"]*"/, ` value="akari"`)}${clean(F.quickChips)}</header>
<section class="shelf"><ul class="cards x-cards">${cards}</ul></section></main>`;
const ids = (items) => new Set(items.map((it) => it.id));

// Wyatt's profile cards (their pictures), for sets made of them
const PROF = new Map(K.profile.cards.map((c) => [c.match(/href="\/g\/([^"]+)"/)[1], { card: clean(c), title: c.match(/<strong>([^<]*)/)[1], pic: c.match(/<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>/)[0].replace("pic thumb", "pic cthumb") }]));
const pp = (id) => PROF.get(id) ?? pz(id);
/** A set as a card: its first four pictures, two by two, and "Set · n puzzles" where a puzzle's type goes.
 *  `by`: the card's by line; `foot`: Explore's foot; `edit`: the Drafts tab's Edit. */
const setCard = ({ name, items, by, foot = "", edit = "", draft = false }) => `<li class="setc${draft ? " draft" : ""}"><a class="game-card${foot ? " pcard" : ""}" href="#set"><span class="grid-game pic thumb set-pic">${mosaic(items, "set-mosaic")}</span><span class="game-card-text"><span class="kind">${ico("set")}Set · ${items.length} puzzles</span><strong>${esc(name)}</strong><span class="by">${by}</span>${foot}</span></a>${edit}</li>`;
const editBtn = (what) => `<button class="btn card-edit" type="button" aria-label="Edit ${esc(what)}">${ico("pencil")}Edit</button>`;

// ---------------------------------------------------------------- 80: the title row (♡ ⋯ at its right), the meta line under it

out("f80-header.html", page("Lamp Code I (mockup)", puzzlePage(G.slate)));
out("f80-header-drawer.html", page("Lamp Code II · Akari for beginners (mockup)", puzzlePage(H.l2), { slot: drawer(SIX, { here: L2 }) }));
out("f80-header-first.html", page("Lamp Code I (mockup)", puzzlePage(G.slate, { chip: true })));

// ---------------------------------------------------------------- 81: /wyatt: sets in the Puzzles grid; 81b: Drafts (owner only)

const TILES = { name: "Tiles, two ways", items: ["binary-puzzle-1", "binary-puzzle-2", "binary-puzzle-3", "twins-and-triplets-1", "twins-and-triplets-2", "twins-and-triplets-3"].map(pp) };
const BIT = { name: "A bit of everything", items: ["twins-and-triplets-3", "find-the-cut-line-3", "fillomino-3", "star-battle-3"].map(pp) };
const profHead = clean(K.profile.head).replace(/<div class="profile-actions">[\s\S]*?<\/div>/, `<div class="profile-actions"><a class="btn" href="#settings">Edit profile</a></div>`);
const ptabs = (on) => `<nav class="tabs" aria-label="Profile">${[["Puzzles", "#p"], ["Drafts (5)", "#d"], ["Subscriptions (0)", "#s"], ["About", "#a"]].map(([t, h]) => `<a href="${h}"${t.startsWith(on) ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;
{
  const c = K.profile.cards.map(clean);
  const grid = [c[0], setCard({ ...TILES, by: "by @wyatt" }), c[1], c[2], c[3], c[4], setCard({ ...BIT, by: "by @wyatt" }), c[5], c[6], c[7]].join("");
  out("f80-profile.html", page("Wyatt (mockup)", `<main class="wrap profile">${profHead}${ptabs("Puzzles")}<ul class="cards">${grid}</ul></main>`, { active: "Profile" }));

  const draftPuzzle = (id, title, when) => { const p = pz(id); return `<li class="setc draft"><a class="game-card" href="#paint">${p.pic.replace("pic cthumb", "pic thumb")}<span class="game-card-text"><span class="kind">${esc(p.kind)}</span><strong>${esc(title)}</strong><span class="by">${when}</span></span></a>${editBtn(title)}</li>`; };
    const drafts = [
    setCard({ name: SET.name, items: SEVEN, by: "Edited today", edit: editBtn(SET.name), draft: true }),
    draftPuzzle("nonogram-5", "Hidden Kite", "Edited yesterday"),
    setCard({ ...OTHERS[0], by: "Edited 2 d ago", edit: editBtn(OTHERS[0].name), draft: true }),
    draftPuzzle("aquarium-2", "Low Tide", "Edited 4 d ago"),
    setCard({ ...OTHERS[1], by: "Edited 5 d ago", edit: editBtn(OTHERS[1].name), draft: true }),
  ].join("");
  out("f80-drafts.html", page("Wyatt · Drafts (mockup)", `<main class="wrap profile">${profHead}${ptabs("Drafts")}<p class="muted drafts-note">Only you can see these.</p><ul class="cards">${drafts}</ul></main>`, { active: "Profile" }));
}

// ---------------------------------------------------------------- 82: a set card in Explore's results; 82b: in the Subscriptions feed

const WEEK = { name: "Lamp Code week", items: ["m29sd5vthj", "9tw4b3x373", "z53shxh8w3", "nf3fyxf7yu", "vq6b286hmx"].map(pz) };
{
  const slateBy = pz("m29sd5vthj").by;
  const foot = `<span class="card-foot">${dots(1)}<span class="mins">~${mins(WEEK.items)} min</span><span class="when">1 d ago</span></span>`;
  const cards = setCard({ ...WEEK, by: slateBy, foot }) + ["vq6b286hmx", "nf3fyxf7yu", "z53shxh8w3", "9tw4b3x373", "m29sd5vthj", "5fd6bmpkuw", "xjvr8a6vpd"].map((id) => pz(id).card).join("");
  const body = `<main class="wrap explore x-explore"><header class="x-head"><h1>Explore</h1>${clean(F.search).replace(/ value="[^"]*"/, ` value="lamp code"`)}${clean(F.quickChips)}</header>
<section class="shelf"><ul class="cards x-cards">${cards}</ul></section></main>`;
  out("f80-explore-set.html", page("Explore (mockup)", body, { active: "Explore" }));

  const heart = `<div class="feed-actions"><button type="button" class="like-btn" aria-label="Like"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"></path></svg><span>0</span></button></div>`;
  const setItem = `<li class="feed-item set-item"><a class="feed-link" href="#set"><span class="feed-text"><span class="feed-from">${slateBy}<span class="feed-when">OCT 10</span></span><strong>${esc(WEEK.name)}</strong><span class="feed-meta">${ico("set")}Set · ${WEEK.items.length} puzzles · ~${mins(WEEK.items)} min</span></span>
<span class="feed-pic-wrap"><span class="grid-game pic feed-pic set-pic">${mosaic(WEEK.items, "set-mosaic")}</span></span></a>${heart}</li>`;
  const items = ["vq6b286hmx", "prn6szg7v2", "nf3fyxf7yu"].map(pz);
  const whenOf = ["OCT 9", "OCT 8", "OCT 8"];
  const rest = items.map((it, i) => `<li class="feed-item"><a class="feed-link" href="/g/${it.id}"><span class="feed-text"><span class="feed-from">${it.by}<span class="feed-when">${whenOf[i]}</span></span><strong>${esc(it.title)}</strong><span class="feed-meta">${esc(it.kind)}</span></span>
<span class="feed-pic-wrap">${it.pic.replace("pic cthumb", "pic feed-pic")}</span></a>${heart}</li>`).join("");
  out("f80-feed-set.html", page("Subscriptions (mockup)", `<main class="wrap feed-page"><h1 class="visually-hidden">Subscriptions</h1><ul class="feed">${setItem}${rest}</ul></main>`, { active: "Subscriptions" }));
}

// ---------------------------------------------------------------- 83: a draft set's page, the wording

{
  const rows = SEVEN.map((it, i) => `<li class="sp-row"><span class="sp-n">${i + 1}</span>${it.pic}<span class="sp-text"><strong>${esc(it.title)}</strong><span class="by">${it.by}</span></span><span class="sp-meta">${dots(it.level)}<span>~${it.mins} min</span></span></li>`).join("");
  const body = `<main class="wrap sp-page">
<div class="sp-kick">${ico("set")}Set<span class="draft-pill">Draft</span></div>
<h1>${esc(SET.name)}</h1>
<p class="sp-by"><span class="avatar" aria-hidden="true" style="width:24px;height:24px;font-size:11px;background:linear-gradient(135deg, hsl(335 75% 62%), hsl(15 70% 48%))">W</span><strong>Wyatt</strong><span class="muted">@wyatt</span></p>
<p class="sp-intro">${esc(SET.intro)}</p>
<p class="muted sp-stats">${SEVEN.length} puzzles · ~${mins(SEVEN)} min</p>
<div class="sp-actions"><button class="btn primary" type="button">${ico("pencil")}Edit</button><button class="btn" type="button">${ico("play", "mini-icon fill")}Play</button><span class="muted">Only you can see it.</span></div>
<ol class="sp-list">${rows}</ol></main>`;
  out("f80-set-page.html", page("Akari for beginners (mockup)", body, { active: "Profile" }));
}

// ---------------------------------------------------------------- 84: phones: ⋯ with the set in progress; it opens the set

{
  const menu = `<div class="scrim"></div><div class="psheet p70" role="menu" aria-label="${esc(L4.title)}"><span class="grabber"></span>
  <div class="ps-head">${L4.pic}<span><strong>${esc(L4.title)}</strong><span class="by">${L4.by}</span></span></div>
  <button role="menuitem" type="button" class="m-set">${mosaic(SEVEN, "tiny")}<span><strong>${esc(SET.name)}</strong> <span class="muted">· ${SEVEN.length}</span></span>${ico("chevL", "mini-icon m-go")}</button>
  <button role="menuitem" type="button" class="plain">${ico("set")}Add to set</button>
  <button role="menuitem" type="button" class="plain">${ico("link")}Copy link</button></div>`;
  out("f80-phone-menu.html", page("Lamp Code IV (mockup)", puzzlePage(K.l4), { cls: "sheet-on", after: menu }));
  out("f80-phone-sheet.html", page("Lamp Code IV (mockup)", puzzlePage(K.l4), { cls: "sheet-on", after: `<div class="scrim"></div>${drawer(SEVEN, { phone: true, here: L4, intro: SET.intro })}` }));
}

// ---------------------------------------------------------------- the contact sheet, in flow order

export const ROWS = [
  ["80", "Title row: the title, ♡ and ⋯; the meta line under it (Akari opens How to play)", "80-header-desktop"],
  ["80", "With the drawer open", "80-header-drawer-desktop"],
  ["80", "First time with a type, signed in or out: the note, with ×", "80-header-first-desktop"],
  ["80", "Phone: the description keeps to two lines, so ? fits", "80-header-phone"],
  ["80", "Phone, first time", "80-header-first-phone"],
  ["81", "Wyatt's Puzzles: sets in the grid with the puzzles, newest first", "81-profile-desktop"],
  ["81", "Phone", "81-profile-phone"],
  ["81b", "Drafts, owner only: draft puzzles and draft sets, each with Edit", "81b-drafts-desktop"],
  ["81b", "Phone", "81b-drafts-phone"],
  ["82", "A set in Explore's results", "82-explore-set-desktop"],
  ["82b", "A set in the Subscriptions feed", "82b-feed-set-desktop"],
  ["83", "A draft set's page: Only you can see it.", "83-set-page-desktop"],
  ["84", "Phone: ⋯ leads with the set in progress in this tab", "84-menu-phone"],
  ["84b", "Phone: it opens the set; the last row adds this puzzle", "84b-sheet-phone"],
];
const sheet = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The set drawer, round three</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css"><link rel="stylesheet" href="create-set.css"><link rel="stylesheet" href="drawer-60.css"></head>
<body class="sheet-index"><main class="contact60">
<h1>The set drawer, round three</h1>
<p class="muted">The title row, sets among the puzzles, Drafts, and the set in progress on phones. Mockups, not product code.</p>
<div class="c60">${ROWS.map(([k, d, p]) => `<figure class="${p.includes("phone") ? "ph" : ""}"><img src="${p}.png"><figcaption><strong>${k}</strong> ${esc(d)}</figcaption></figure>`).join("")}</div>
</main></body></html>`;
out("contact-80.html", sheet);
console.log("wrote f80-*.html and contact-80.html");
