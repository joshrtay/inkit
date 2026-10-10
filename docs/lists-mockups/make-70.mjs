// Builds the 70- mockups (docs/lists-mockups/f70-*.html): the set drawer, second round.
// - The puzzle page's header is the title, the meta line, then only ♡ and ⋯. How to play moves to
//   the type's name in the meta line (a link), a ? on the paper's strip before undo and reset, and,
//   the first time someone meets a type, a note on the paper: "New to Akari? How to play".
// - A set starts from ⋯ → Add to set → your drafts (+ New set). Picking one adds the puzzle and
//   opens the drawer. With the drawer closed, cards look as they do today.
// - The drawer is thinner (280px): rows are a handle, a number, a picture and a title. While it is
//   open every card has + (✓ if in), and on a puzzle page the add is the drawer's last row.
// - A draft comes back into the drawer from Edit on its set page, or from Drafts on the profile.
// - Phones: ⋯ → Add to set → a sheet; then a toast with Change; the toast opens the set as a sheet.
// Real pieces from fragments.json, fragments-50.json, fragments-60.json and fragments-70.json
// (capture-70.mjs). Styles in drawer-70.css, on top of lists.css, create-set.css, flow-50.css and
// drawer-60.css. Not product code.
//
// Run from the repo root: node docs/lists-mockups/make-70.mjs, then node docs/lists-mockups/shoot-70.mjs
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
<!-- A mockup of the set drawer, second round (not product code). Generated by make-70.mjs; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="lists.css">
<link rel="stylesheet" href="create-set.css">
<link rel="stylesheet" href="flow-50.css">
<link rel="stylesheet" href="drawer-60.css">
<link rel="stylesheet" href="drawer-70.css">
</head>
<body class="f50 f60 f70 ${slot ? "slot-on" : ""} ${cls}">
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
  return `<div class="game-layout">${clean(S.backBtn)}<main class="wrap game-page g70">${head(S, { menu, rules })}<div class="game-body">${board(S, { chip, rules })}</div></main></div>`;
}
const guidePane = () => clean(H.guide).replace(`class="guide-pane open side"`, `class="guide-pane open in-slot"`);
const toast = (html, action) => `<div class="toast t60" role="status">${ico("check")}<span>${html}</span><button type="button">${action}</button></div>`;
const L1 = pz("m29sd5vthj"), L2 = pz("9tw4b3x373"), L4 = pz("nf3fyxf7yu");

// ---------------------------------------------------------------- 70: the new header; 70b: the first-time note

out("f70-header.html", page("Lamp Code I (mockup)", puzzlePage(G.slate)));
out("f70-first.html", page("Lamp Code I (mockup)", puzzlePage(G.slate, { chip: true })));

// ---------------------------------------------------------------- 71: ⋯ → Add to set → your drafts

out("f70-menu.html", page("Lamp Code I (mockup)", puzzlePage(G.slate, { menu: moreMenu({ hover: true }) })));
out("f70-menu-owner.html", page("Lights On (mockup)", puzzlePage(G.lights, { menu: moreMenu({ owner: true }) })));
out("f70-list.html", page("Lamp Code I (mockup)", puzzlePage(G.slate, { menu: setList({ hover: 0, cls: "from-more" }) })));

// ---------------------------------------------------------------- 72: the drawer on a puzzle page

// picked Akari for beginners on Lamp Code I: it's in, and its row is marked
out("f70-drawer-in.html", page("Lamp Code I · Akari for beginners (mockup)", puzzlePage(G.slate), { slot: drawer(SIX, { here: L1 }) }));
// on to Lamp Code II with the drawer open: the last row adds it
out("f70-drawer-add.html", page("Lamp Code II · Akari for beginners (mockup)", puzzlePage(H.l2), { slot: drawer(SIX, { here: L2, addHover: true }) }));
// added
out("f70-drawer-added.html", page("Lamp Code II · Akari for beginners (mockup)", puzzlePage(H.l2), { slot: drawer(SEVEN, { here: L2, hover: 2 }) }));

// ---------------------------------------------------------------- 73: Explore with the thin drawer: + on every card

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
out("f70-explore.html", page("Explore · Akari for beginners (mockup)", explore(IDS.map((id) => card(id, { set: ids(SEVEN) })).join("")), { active: "Explore", slot: drawer(SEVEN, { intro: SET.intro }) }));
out("f70-explore-closed.html", page("Explore (mockup)", explore(IDS.map((id) => card(id)).join("")), { active: "Explore" }));

// ---------------------------------------------------------------- 73b–c: the drawer on other browsing pages

{
  const set = ids(SEVEN);
  const plus = (id) => set.has(id)
    ? `<button class="card-add on" type="button" aria-label="In ${esc(SET.name)}" title="In ${esc(SET.name)}">${ico("check")}</button>`
    : `<button class="card-add" type="button" aria-label="Add to ${esc(SET.name)}" title="Add to ${esc(SET.name)}">${ico("plus")}</button>`;
  // Slate's profile: its own cards, each with + (✓ if in)
  const S = K.slate;
  const cards = S.cards.map((c) => { const id = c.match(/href="\/g\/([^"]+)"/)[1]; return clean(c).replace(/^<li>/, `<li class="addable${set.has(id) ? " in" : ""}">`).replace(/<\/li>$/, `${plus(id)}</li>`); }).join("");
  const head = clean(S.head).replace(/<div class="profile-actions">[\s\S]*?<\/div>/, `<div class="profile-actions"><button class="btn subscribed" type="button">Subscribed</button></div>`);
  out("f70-profile-slate.html", page("Slate (mockup)", `<main class="wrap profile">${head}${clean(S.tabs)}<ul class="cards p-cards">${cards}</ul></main>`, { slot: drawer(SEVEN, { intro: SET.intro }) }));

  // Subscriptions: the feed (laid out as FeedItem does), + on each picture
  const items = ["vq6b286hmx", "nf3fyxf7yu", "prn6szg7v2", "z53shxh8w3", "9tw4b3x373"].map(pz);
  const whenOf = ["OCT 9", "OCT 8", "OCT 8", "OCT 7", "OCT 6"];
  const feed = items.map((it, i) => `<li class="feed-item${set.has(it.id) ? " in" : ""}"><a class="feed-link" href="/g/${it.id}">
<span class="feed-text"><span class="feed-from">${it.by}<span class="feed-when">${whenOf[i]}</span></span><strong>${esc(it.title)}</strong><span class="feed-meta">${esc(it.kind)}</span></span>
<span class="feed-pic-wrap">${it.pic.replace("pic cthumb", "pic feed-pic")}</span></a>${plus(it.id)}
<div class="feed-actions"><button type="button" class="like-btn" aria-label="Like"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"></path></svg><span>0</span></button></div></li>`).join("");
  out("f70-feed.html", page("Subscriptions (mockup)", `<main class="wrap feed-page"><h1 class="visually-hidden">Subscriptions</h1><ul class="feed">${feed}</ul></main>`, { active: "Subscriptions", slot: drawer(SEVEN, { intro: SET.intro }) }));
}

// ---------------------------------------------------------------- 74: ? opens How to play, in the drawer's place

out("f70-rules.html", page("Lamp Code II · How to play (mockup)", puzzlePage(H.l2, { rules: true }), { cls: "slot-wide", slot: guidePane() }));

// ---------------------------------------------------------------- 75: a draft set's page, with Edit; 75b: Drafts on the profile

{
  const rows = SEVEN.map((it, i) => `<li class="sp-row"><span class="sp-n">${i + 1}</span>${it.pic}<span class="sp-text"><strong>${esc(it.title)}</strong><span class="by">${it.by}</span></span><span class="sp-meta">${dots(it.level)}<span>~${it.mins} min</span></span></li>`).join("");
  const body = `<main class="wrap sp-page">
<div class="sp-kick">${ico("set")}Set<span class="draft-pill">Draft</span></div>
<h1>${esc(SET.name)}</h1>
<p class="sp-by"><span class="avatar" aria-hidden="true" style="width:24px;height:24px;font-size:11px;background:linear-gradient(135deg, hsl(335 75% 62%), hsl(15 70% 48%))">W</span><strong>Wyatt</strong><span class="muted">@wyatt</span></p>
<p class="sp-intro">${esc(SET.intro)}</p>
<p class="muted sp-stats">${SEVEN.length} puzzles · ~${mins(SEVEN)} min</p>
<div class="sp-actions"><button class="btn primary" type="button">${ico("pencil")}Edit</button><button class="btn" type="button">${ico("play", "mini-icon fill")}Play</button><span class="muted">Only you can see it until you publish.</span></div>
<ol class="sp-list">${rows}</ol></main>`;
  out("f70-set-page.html", page("Akari for beginners (mockup)", body, { active: "Profile" }));
  // Edit reopens the drawer, on the set page itself
  out("f70-set-page-edit.html", page("Akari for beginners (mockup)", body.replace(`class="btn primary" type="button">${ico("pencil")}Edit`, `class="btn primary on" type="button">${ico("pencil")}Edit`), { active: "Profile", slot: drawer(SEVEN, { intro: SET.intro }) }));

  // the profile, Sets tab: Drafts (only you see them) first, then published sets
  const P2 = K.profile;
  const tabs = `<nav class="tabs" aria-label="Profile"><a href="#p">Puzzles</a><a aria-current="page" href="#s">Sets</a><a href="#sub">Subscriptions (0)</a><a href="#a">About</a></nav>`;
  const setCard = (s, draft) => `<li class="set-card${draft ? " draft" : ""}">${mosaic(s.items, "sc-cover")}<span class="sc-text"><strong>${esc(s.name)}</strong><span class="muted">${s.items.length} puzzles · ~${mins(s.items)} min${draft ? ` · ${s.when}` : ""}</span></span>${draft ? `<button class="btn" type="button">${ico("pencil")}Edit</button>` : ""}</li>`;
  const drafts = [{ name: SET.name, items: SEVEN, when: "edited today" }, { ...OTHERS[0], when: "edited 2 d ago" }, { ...OTHERS[1], when: "edited 5 d ago" }];
  const published = [{ name: "A bit of everything", items: ["twins-and-triplets-3", "find-the-cut-line-3", "fillomino-3", "star-battle-3"].map(pz) }];
  const body2 = `<main class="wrap profile">${clean(P2.head).replace(/<div class="profile-actions">[\s\S]*?<\/div>/, `<div class="profile-actions"><a class="btn" href="#settings">Edit profile</a></div>`)}${tabs}
<section class="sets-sec"><div class="sec-head"><h2>Drafts</h2><span class="muted">Only you can see these.</span></div><ul class="set-cards">${drafts.map((s) => setCard(s, true)).join("")}</ul></section>
<section class="sets-sec"><div class="sec-head"><h2>Published</h2></div><ul class="set-cards">${published.map((s) => setCard(s, false)).join("")}</ul></section></main>`;
  out("f70-profile.html", page("Wyatt · Sets (mockup)", body2, { active: "Profile" }));
}

// ---------------------------------------------------------------- 76: phones

{
  const sheetMenu = `<div class="scrim"></div><div class="psheet p70" role="menu" aria-label="${esc(L2.title)}"><span class="grabber"></span>
  <div class="ps-head">${L2.pic}<span><strong>${esc(L2.title)}</strong><span class="by">${L2.by}</span></span></div>
  <button role="menuitem" type="button">${ico("set")}Add to set</button>
  <button role="menuitem" type="button">${ico("link")}Copy link</button></div>`;
  const SIXSETS = [{ name: SET.name, items: SIX }, ...OTHERS];
  out("f70-phone-menu.html", page("Lamp Code II (mockup)", puzzlePage(H.l2), { cls: "sheet-on", after: sheetMenu }));
  out("f70-phone-list.html", page("Lamp Code II (mockup)", puzzlePage(H.l2), { cls: "sheet-on", after: `<div class="scrim"></div>${setList({ sets: SIXSETS, cls: "psheet60" })}` }));
  out("f70-phone-toast.html", page("Lamp Code II (mockup)", puzzlePage(H.l2), { after: toast(`Added to <strong>${esc(SET.name)}</strong> <span class="t-n">· 7</span>`, "Change") }));
  out("f70-phone-sheet.html", page("Lamp Code II (mockup)", puzzlePage(H.l2), { cls: "sheet-on", after: `<div class="scrim"></div>${drawer(SEVEN, { phone: true, here: L2, intro: SET.intro })}` }));
  out("f70-phone-sheet-add.html", page("Lamp Code IV (mockup)", puzzlePage(K.l4), { cls: "sheet-on", after: `<div class="scrim"></div>${drawer(SEVEN, { phone: true, here: L4, intro: SET.intro })}` }));
  out("f70-phone-explore.html", page("Explore (mockup)", explore(IDS.map((id) => card(id, { set: ids(SEVEN) })).join("")), { active: "Explore" }));
}

// ---------------------------------------------------------------- the contact sheet, in flow order

export const ROWS = [
  ["70", "The header: title, meta, ♡ and ⋯. Akari in the meta line and ? on the paper open How to play", "70-header-desktop"],
  ["70", "Phone", "70-header-phone"],
  ["70b", "First time with a type: a note under ?", "70b-first-desktop"],
  ["70b", "Phone", "70b-first-phone"],
  ["71", "⋯: Add to set, Copy link", "71-menu-desktop"],
  ["71", "⋯ on your own puzzle: Delete too", "71-menu-owner-desktop"],
  ["71b", "Add to set: your drafts, newest added-to first, and New set", "71b-list-desktop"],
  ["72", "Picked one: added, and the drawer opens. This puzzle is #6", "72-drawer-in-desktop"],
  ["72", "On to Lamp Code II, drawer open: the last row adds it", "72-drawer-add-desktop"],
  ["72b", "Added: its row is marked. Pointer on a row: who made it, how hard, ×", "72b-drawer-added-desktop"],
  ["73", "Explore with the drawer open: + on every card, ✓ on the ones in; three columns", "73-explore-desktop"],
  ["73", "Drawer closed: cards as today", "73-explore-closed-desktop"],
  ["73b", "A creator's page (Slate) with the drawer open: + on its puzzles", "73b-profile-slate-desktop"],
  ["73c", "Subscriptions with the drawer open: + on each picture", "73c-feed-desktop"],
  ["74", "? opens How to play in the drawer's place", "74-rules-desktop"],
  ["75", "A draft set's page: Edit", "75-set-page-desktop"],
  ["75", "Edit reopens the drawer", "75-set-page-edit-desktop"],
  ["75b", "Profile, Sets: Drafts first, each with Edit", "75b-profile-desktop"],
  ["76", "Phone: ⋯", "76-menu-phone"],
  ["76b", "Phone: your drafts", "76b-list-phone"],
  ["76c", "Phone: added, with Change", "76c-toast-phone"],
  ["76d", "Phone: the toast opens the set; this puzzle's row is marked", "76d-sheet-phone"],
  ["76e", "Phone: on another puzzle, the last row adds it", "76e-sheet-add-phone"],
  ["76f", "Phone: once a set is started in this tab, cards get +", "76f-explore-phone"],
];
const sheet = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The set drawer, round two</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css"><link rel="stylesheet" href="create-set.css"><link rel="stylesheet" href="drawer-60.css"></head>
<body class="sheet-index"><main class="contact60">
<h1>The set drawer, round two</h1>
<p class="muted">Start a set from ⋯; while the drawer is open, + is everywhere. Mockups, not product code.</p>
<div class="c60">${ROWS.map(([k, d, p]) => `<figure class="${p.includes("phone") ? "ph" : ""}"><img src="${p}.png"><figcaption><strong>${k}</strong> ${esc(d)}</figcaption></figure>`).join("")}</div>
</main></body></html>`;
out("contact-70.html", sheet);
console.log("wrote f70-*.html and contact-70.html");
