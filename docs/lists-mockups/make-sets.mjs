// Builds the sets mockups (docs/lists-mockups/1x-*.html, 2x-*.html): published, curated sets from
// docs/research-curation.md beside the light search lists of make.mjs. Making a set (Add to a set,
// Make a set from these, the editor in rows and as a board, on a phone), the set's page, Slate's
// week as an open set, and four ways to show where you are while playing (V1–V4), each for a set
// and for a search. Same real pieces as make.mjs (fragments.json, from capture.mjs). Not product code.
//
// Run from the repo root: node docs/lists-mockups/make-sets.mjs, then node docs/lists-mockups/shoot-sets.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const F = JSON.parse(readFileSync(`${dir}fragments.json`, "utf8"));
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s) => s.replace(/ data-discover="true"/g, "").replace(/<!-- -->/g, "");

// ---------------------------------------------------------------- icons

const P = {
  set: ["M4 7h12v13H4z", "M8 4h12v13"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
  chevL: ["m15 18-6-6 6-6"], chevR: ["m9 18 6-6-6-6"], down: ["m6 9 6 6 6-6"], up: ["m18 15-6-6-6 6"],
  x: ["M18 6 6 18", "M6 6l12 12"], plus: ["M12 5v14", "M5 12h14"],
  share: ["M12 3v12", "m7 8 5-5 5 5", "M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"],
  play: ["M7 4.5v15l12-7.5z"], again: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  ramp: ["M3 20h18", "M4 17l5-4 4 2 7-9"], rows: ["M4 6h16", "M4 12h16", "M4 18h16"], grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  check: ["m5 12 5 5 9-10"], swipe: ["M8 12h11", "m15 8 4 4-4 4", "M5 8v8"], lock: ["M6 11h12v9H6z", "M9 11V8a3 3 0 0 1 6 0v3"],
  section: ["M4 12h4", "M16 12h4", "M10 12h4"],
};
const ico = (n, cls = "mini-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n].map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const CHECK = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 54 C24 61 32 69 39 80 C52 57 68 36 88 16" /></svg>`;
const solvedBadge = `<span class="solved-badge" role="img" aria-label="Solved" title="Solved">${CHECK}</span>`;

// ---------------------------------------------------------------- puzzles, from the captured cards

const PZ = new Map();
for (const c of [...F.cards, ...F.mixedCards]) {
  const g = (r) => (c.match(r) || [])[1];
  const id = g(/href="\/g\/([^"]+)"/);
  if (PZ.has(id) || !c.includes('<span class="by">')) continue;
  PZ.set(id, {
    id, title: g(/<strong>([^<]*)/), kind: g(/class="kind">([^<]*)/), name: g(/by-name">([^<]*)/),
    by: clean(g(/<span class="by">([\s\S]*?)<\/span><span class="card-foot">/)),
    level: { Easy: 1, Medium: 2, Hard: 3 }[g(/Difficulty: (\w+)/)] ?? 1, mins: +g(/~(?:<!-- -->)?(\d+)/),
    pic: c.match(/<span class="grid-game pic thumb"[\s\S]*?<\/svg><\/span>/)[0].replace("pic thumb", "pic sthumb"),
    card: clean(c),
  });
}
const pz = (id) => PZ.get(id);
const avatarOf = (id) => pz(id).by.match(/^<span class="avatar[\s\S]*?<\/span>(?=<span class="by-name">)/)[0];
const WYATT = avatarOf("akari-1"), SLATE = avatarOf("m29sd5vthj");
const sized = (av, n) => av.replace(/width:\d+px;height:\d+px(;font-size:[^;]+)?/, `width:${n}px;height:${n}px;font-size:${(n * 0.46).toFixed(1)}px`);
const dots = (level) => `<span class="diff" role="img" aria-label="Difficulty ${level} of 3" title="${["", "Easy", "Medium", "Hard"][level]}">${[1, 2, 3].map((i) => `<i${i <= level ? ' class="on"' : ""}></i>`).join("")}</span>`;

// the set: Akari for beginners, by Wyatt, with Slate's puzzles credited
const SET = {
  title: "Akari for beginners", by: "wyatt",
  intro: "Eight Akari, from your first lamp to letters. Try them in order.",
  sections: [
    { name: "First lamps", items: [
      ["s3pw7skznd", "Numbers say how many lamps touch them."],
      ["xjvr8a6vpd", "A black cell stops the light."],
      ["akari-1", "Start with the 0. Nothing goes next to it."],
    ] },
    { name: "Letters", items: [
      ["m29sd5vthj", "Letters are numbers in disguise."],
      ["9tw4b3x373", "One letter, used twice."],
      ["akari-3", "Four letters this time."],
    ] },
    { name: "Bigger rooms", items: [
      ["akari-2", "A bigger room. Take it slowly."],
      ["akari-4", "Everything at once."],
    ] },
  ],
};
const ITEMS = SET.sections.flatMap((s) => s.items.map(([id, note]) => ({ ...pz(id), note, section: s.name })));
const SOLVED = new Set(["s3pw7skznd", "xjvr8a6vpd", "m29sd5vthj"]);   // 3 of 8; Lights On (3rd) is next
const CUR = 2;

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
  return s;
};
const tabbar = (active) => {
  let s = clean(F.tabbar).replace(/ class="active" aria-current="page"/, "");
  if (active) s = item(s, active, (t) => t.replace(/^<a( class="")?/, `<a class="active" aria-current="page"`).replace(/^<button type="button"/, `<button type="button" class="active"`));
  return s;
};
const STAMP = `<script>addEventListener("load", () => document.querySelectorAll(".solved-stamp").forEach((st) => {
  const sheet = st.closest(".sheet"), frame = sheet.querySelector("svg.board .frame") || sheet.querySelector("svg.board");
  const a = sheet.getBoundingClientRect(), f = frame.getBoundingClientRect();
  st.style.left = ((f.right - a.left) / a.width * 100) + "%"; st.style.top = ((f.top - a.top) / a.height * 100) + "%";
}));</script>`;
const page = (title, body, { active = "", cls = "", after = "" } = {}) => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- A mockup of sets (not product code). Generated by make-sets.mjs; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="lists.css">
<link rel="stylesheet" href="sets.css">
</head>
<body class="${cls}">
${F.defs}${STAMP}
<div class="shell">${nav(active)}<div class="page">${body}</div>${tabbar(active === "Explore" ? "Explore" : active === "Profile" ? "Profile" : "")}</div>${after}
</body></html>
`;
const out = (name, html) => writeFileSync(`${dir}${name}`, html);

// ---------------------------------------------------------------- the puzzle page's pieces

const head = clean(F.head);
const headInner = head.replace(/^<header class="game-head">/, "").replace(/<\/header>$/, "");
const backBtn = clean(F.backBtn);
const boardOf = (solved = false) => (solved ? F.boardSolved : F.board).replace(/^<div class="game-spot">/, "").replace(/<\/div>$/, "");

/** Where you are in a set: a box per puzzle, ticked when solved, ringed when current. */
const segs = (cls = "") => `<span class="segs ${cls}" role="img" aria-label="3 of 8, 3 solved">${ITEMS.map((it, i) => `<i class="${SOLVED.has(it.id) ? "done" : ""}${i === CUR ? " cur" : ""}">${SOLVED.has(it.id) ? ico("check") : ""}</i>`).join("")}</span>`;

const CTX = {
  set: { icon: "set", name: SET.title, by: "@wyatt", at: 3, n: 8, note: ITEMS[CUR].note, kind: "set" },
  search: { icon: "search", name: "Easy Akari by @wyatt", by: "", at: 3, n: 41, note: "", kind: "search" },
};
const ctxName = (c, withBy = true) => `<a class="ctx-name" href="#ctx">${ico(c.icon)}<span class="ctx-title">${esc(c.name)}</span>${withBy && c.by ? `<span class="ctx-by"> · by ${c.by}</span>` : ""}</a>`;
const count = (c) => `<span class="lb-pos">${c.at} of ${c.n}</span>`;
const progress = (c) => c.kind === "set" ? `${segs()}${count(c)}` : count(c);
const arrow = (dir, cls = "lb-arrow") => `<a class="${cls}" href="#${dir}" aria-label="${dir === "prev" ? "Previous" : "Next"}">${ico(dir === "prev" ? "chevL" : "chevR")}</a>`;
const noteLine = (c) => c.note ? `<p class="set-note">${esc(c.note)}</p>` : "";

/** One puzzle page, Lights On, in a set or a search, laid out as variant v. */
function variant(v, c) {
  let top = "", above = "", below = "", rail = "", aside = "", headPre = "", sideArrows = "", phoneStrip = "";
  const backTo = backBtn.replace(/href="[^"]*"/, `href="#ctx"`);
  const backNamed = (name) => backTo.replace('class="back-btn"', 'class="back-btn lb-back"').replace(/<\/a>$/, `<span class="lb-back-name">${esc(name)}</span></a>`);
  if (v === 1) {
    // a line above the paper: name left, ‹ 3 of 8 › right
    above = `<nav class="list-bar v1"><span class="ctx">${ctxName(c)}</span><div class="lb-right"><span class="lb-step">${arrow("prev")}${progress(c)}${arrow("next")}</span></div></nav>`;
    top = `<div class="lb-top">${backNamed(c.name).replace(/<svg[\s\S]*?<\/svg>/, (m) => m)}<div class="lb-right"><span class="lb-step">${arrow("prev")}${count(c)}${arrow("next")}</span></div></div>`;
    if (c.kind === "set") phoneStrip = `<div class="phone-strip">${segs("wide")}</div>`;
  } else if (v === 2) {
    // a bar under the board: context, progress, Prev and Next where Next appears after a solve
    below = `<nav class="under-bar"><span class="ctx">${ctxName(c)}</span><span class="ub-progress">${progress(c)}</span><span class="ub-buttons"><a class="btn" href="#prev">${ico("chevL")}Prev</a><a class="btn primary" href="#next">Next${ico("chevR")}</a></span></nav>`;
  } else if (v === 3) {
    // context folded into the title row as a breadcrumb; arrows at the paper's edges
    headPre = `<nav class="crumb">${ctxName(c, false)}<span class="crumb-sep">›</span>${c.kind === "set" ? segs("tiny") : ""}<span class="crumb-pos">${c.at} of ${c.n}</span>${c.by ? `<span class="ctx-by">by ${c.by}</span>` : ""}</nav>`;
    sideArrows = `<a class="side-arrow prev" href="#prev" aria-label="Previous">${ico("chevL")}</a><a class="side-arrow next" href="#next" aria-label="Next">${ico("chevR")}</a>`;
    below = `<p class="swipe-hint">${ico("chevL")}Swipe for the next one${ico("chevR")}</p>`;
  } else if (v === 4) {
    // a side rail of the set's puzzles; on phones, a strip
    const list = c.kind === "set" ? ITEMS : searchRun();
    rail = `<aside class="rail-strip" aria-label="${esc(c.name)}"><div class="rs-head">${ctxName(c, false)}${c.by ? `<span class="ctx-by">by ${c.by}</span>` : ""}<span class="rs-count">${c.kind === "set" ? `${c.at} of ${c.n} · 3 solved` : `${c.at} of ${c.n}`}</span></div>
<ol class="rs-list">${list.map((it, i) => `<li class="${i === CUR ? "cur" : ""}"><a href="#p${i}"><span class="rs-n">${i + 1}</span><span class="rs-pic">${it.pic}${c.kind === "set" && SOLVED.has(it.id) ? solvedBadge : ""}</span></a></li>`).join("")}</ol>
${c.kind === "search" ? `<p class="rs-more">+ 33 more</p>` : ""}<div class="rs-step">${arrow("prev")}${arrow("next")}</div></aside>`;
    phoneStrip = `<div class="phone-strip v4">${ctxName(c)}<span class="ps-row">${arrow("prev", "lb-arrow small")}${c.kind === "set" ? segs("wide") : `<span class="thin"><i style="width:${(3 / 41 * 100).toFixed(1)}%"></i></span>`}${count(c)}${arrow("next", "lb-arrow small")}</span></div>`;
  }
  const noteHtml = c.kind === "set" ? noteLine(c) : "";
  const il = v === 1 ? " in-list" : "";
  const body = `<div class="game-layout${il} v${v}${rail ? " with-rail" : ""}">${backTo}${top}${v === 4 ? phoneStrip : ""}
<main class="wrap game-page${il} v${v}"><header class="game-head">${headPre}${headInner}${noteHtml}</header>${v === 1 ? phoneStrip : ""}
<div class="game-body"><div class="game-spot">${above}<div class="stage">${sideArrows}${boardOf()}</div>${below}</div></div></main>${rail}</div>`;
  return page(`Lights On · V${v} · ${c.kind} (mockup)`, body);
}
// a search's run of puzzles around this one (the rail shows its first 8)
function searchRun() {
  const ids = ["akari-3", "akari-4", "akari-1", "akari-2", "nf3fyxf7yu", "prn6szg7v2", "z53shxh8w3", "m29sd5vthj"];
  return ids.map(pz);
}

for (const v of [1, 2, 3, 4]) for (const k of ["set", "search"]) out(`v${v}-${k}.html`, variant(v, CTX[k]));

// ---------------------------------------------------------------- 10: Add to a set, on a puzzle page

const DRAFTS = [
  { title: "Akari for beginners", n: 7, state: "Draft", on: true, pics: ["s3pw7skznd", "xjvr8a6vpd", "m29sd5vthj"] },
  { title: "Lines for the train", n: 4, state: "Draft", on: false, pics: ["pythagorean-paths-3", "connect-the-critters-3"] },
  { title: "Saturday picks", n: 2, state: "Draft", on: false, pics: ["binary-puzzle-3", "fillomino-3"] },
];
const addPop = `<div class="pop add-pop" role="dialog" aria-label="Add to a set">
  <h3>Add to a set</h3>
  <ul class="set-pick">${DRAFTS.map((d) => `<li><label><input type="checkbox"${d.on ? " checked" : ""}><span class="sp-pics">${d.pics.slice(0, 2).map((id) => pz(id).pic.replace("sthumb", "spic")).join("")}</span><span class="sp-text"><strong>${esc(d.title)}</strong><span>${d.state} · ${d.n + (d.on ? 1 : 0)} puzzles</span></span></label></li>`).join("")}</ul>
  <button class="sp-new" type="button">${ico("plus")}New set</button>
  <p class="pop-foot">Published sets can’t take new puzzles.</p>
</div>`;
{
  const addBtn = `<span class="add-wrap"><button class="btn on add-btn" type="button" aria-expanded="true">${ico("set")}Add to a set</button>${addPop}</span>`;
  const h = headInner.replace(/(<button class="btn rules-toggle")/, `${addBtn}$1`);
  const body = `<div class="game-layout">${backBtn}<main class="wrap game-page"><header class="game-head">${h}</header>
<div class="game-body"><div class="game-spot">${boardOf()}</div></div></main></div>`;
  out("add-to-set.html", page("Lights On · Add to a set (mockup)", body, { cls: "pop-open" }));
}

// ---------------------------------------------------------------- 11: Make a set from these (search)

const searchCards = ["akari-3", "akari-4", "akari-1", "akari-2", "nf3fyxf7yu", "prn6szg7v2", "z53shxh8w3", "9tw4b3x373", "m29sd5vthj", "5fd6bmpkuw", "s3pw7skznd", "xjvr8a6vpd"].map((id) => pz(id).card);
{
  const chip = (k, v) => `<span class="q-chip"><span class="k">${k}</span>${v}<button type="button" aria-label="Remove">${ico("x")}</button></span>`;
  const search = clean(F.search).replace(/value="akari"/, `value="akari easy"`);
  const pop = `<div class="pop make-pop" role="dialog" aria-label="Make a set">
  <h3>Make a set from these</h3>
  <label class="field"><span>Title</span><input type="text" value="Easy Akari"></label>
  <p class="pop-note">The first 30 of 41, in this order. You can change them next.</p>
  <div class="pop-actions"><button class="btn" type="button">Cancel</button><button class="btn primary" type="button">Make set</button></div>
</div>`;
  const body = `<main class="wrap explore x-explore q-page">
<header class="x-head"><h1>Explore</h1>${search}
<div class="q-chips" role="group" aria-label="Filters">${chip("Type", "Akari")}${chip("", `${dots(1).replace('role="img" ', "")} Easy`)}<button class="q-add" type="button">${ico("plus")}Filter</button>
<button class="q-sort" type="button"><span class="k">Sort</span> Newest${ico("down")}</button></div></header>
<section class="shelf q-results">
<div class="q-bar"><p class="q-count"><strong>41</strong> puzzles</p><div class="q-actions"><a class="btn" href="#play">${ico("play", "mini-icon fill")}Play</a><button class="btn" type="button">${ico("share")}Copy link</button><span class="share-wrap"><button class="btn on" type="button" aria-expanded="true">${ico("set")}Make a set from these</button>${pop}</span></div></div>
<ul class="cards x-cards">${searchCards.join("")}</ul>
</section></main>`;
  out("make-from-search.html", page("Explore · Make a set (mockup)", body, { active: "Explore" }));
}

// ---------------------------------------------------------------- 12: the set editor

// how hard each puzzle is, for the ramp: its level, nudged by its minutes
const hardness = (it) => it.level + Math.min(it.mins, 12) / 12;
function spark(items, w = 180, h = 40) {
  const xs = items.map((_, i) => 6 + (i * (w - 12)) / (items.length - 1));
  const vals = items.map(hardness), lo = 1, hi = 3.2;
  const ys = vals.map((v) => h - 6 - ((v - lo) / (hi - lo)) * (h - 12));
  const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Difficulty from first to last"><polyline points="${pts}"/>${xs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3.2" class="l${items[i].level}"/>`).join("")}</svg>`;
}
const editorHead = (view) => `<header class="ed-head">
  <div class="ed-top"><span class="draft-pill">Draft</span><span class="muted ed-saved">Saved</span><span class="ed-url muted">inkit.games/s/k3v9q</span></div>
  <input class="ed-title" type="text" value="${esc(SET.title)}" aria-label="Title">
  <textarea class="ed-intro" rows="2" aria-label="Intro">${esc(SET.intro)}</textarea>
</header>
<div class="ed-tools">
  <span class="ed-count"><strong>8</strong> puzzles · ~${ITEMS.reduce((s, it) => s + it.mins, 0)} min</span>
  <span class="ed-ramp">${spark(ITEMS)}<span class="ramp-label">Easy → hard</span></span>
  <button class="btn" type="button">${ico("ramp")}Sort by difficulty</button>
  <span class="seg small" role="tablist" aria-label="View"><button role="tab" aria-selected="${view === "rows"}">${ico("rows")}Rows</button><button role="tab" aria-selected="${view === "grid"}">${ico("grid")}Board</button></span>
  <button class="btn primary ed-add" type="button">${ico("plus")}Add puzzles</button>
</div>`;
const editorFoot = `<footer class="ed-foot"><p>After you publish, the puzzles and their order stay as they are. You can still fix the words.</p><a class="btn" href="#preview">Preview</a><button class="btn primary" type="button">Publish</button></footer>`;
function edRow(it, i, opts = {}) {
  return `<li class="ed-row${opts.lift ? " lift" : ""}"><span class="ed-grip" title="Drag to move">${ico("grip")}</span><span class="ed-n">${i + 1}</span>${it.pic}
<span class="ed-text"><strong>${esc(it.title)}</strong><span class="by">${it.by}</span></span>
<span class="ed-meta">${dots(it.level)}<span class="mins">~${it.mins} min</span></span>
<input class="ed-note" type="text" value="${esc(it.note)}" placeholder="A note (optional)" aria-label="Note for ${esc(it.title)}">
<button class="ed-x" type="button" aria-label="Remove ${esc(it.title)}">${ico("x")}</button></li>`;
}
const edSection = (name) => `<li class="ed-section"><span class="ed-grip">${ico("grip")}</span><input type="text" value="${esc(name)}" aria-label="Section"><button class="ed-x" type="button" aria-label="Remove section">${ico("x")}</button></li>`;
function edRows(phone = false) {
  let i = 0, html = "";
  SET.sections.forEach((s, si) => {
    html += edSection(s.name);
    s.items.forEach(() => {
      const it = ITEMS[i];
      html += phone ? phoneRow(it, i, i === 4) : edRow(it, i);
      if (!phone && i === 4) html += `<li class="ed-between"><button type="button">${ico("plus")}Section here</button></li>`;
      i++;
    });
  });
  return html;
}
function addDrawer() {
  const res = ["akari-1", "akari-2", "akari-3", "akari-4", "nf3fyxf7yu", "z53shxh8w3", "prn6szg7v2", "5fd6bmpkuw"];
  const inSet = new Set(ITEMS.map((it) => it.id));
  return `<aside class="add-drawer" aria-label="Add puzzles"><div class="pane-head"><h2>Add puzzles</h2><button class="pane-close" type="button" aria-label="Close">×</button></div>
<form class="guide-search" role="search" onsubmit="return false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg><input type="search" value="akari" aria-label="Search puzzles"></form>
<span class="seg small" role="tablist"><button role="tab" aria-selected="false">Yours</button><button role="tab" aria-selected="true">Everyone’s</button></span>
<ul class="add-list">${res.map((id) => { const it = pz(id); const on = inSet.has(id); return `<li>${it.pic}<span class="ed-text"><strong>${esc(it.title)}</strong><span class="by">${it.by}</span><span class="ed-meta">${dots(it.level)}<span class="mins">~${it.mins} min</span></span></span>${on ? `<span class="added">${ico("check")}In set</span>` : `<button class="btn" type="button">${ico("plus")}Add</button>`}</li>`; }).join("")}</ul>
<p class="pop-note">Others’ puzzles keep their name on them.</p></aside>`;
}
const editor = (drawer) => page("Akari for beginners · Edit (mockup)", `<main class="wrap ed-page">${editorHead("rows")}
<ol class="ed-rows">${edRows()}</ol>${editorFoot}</main>`, { cls: drawer ? "drawer-open" : "", after: drawer ? addDrawer() : "" });
out("set-editor.html", editor(false));
out("set-editor-add.html", editor(true));

// the board view: cards you drag, in reading order, sections as rules across
{
  let i = 0, html = "";
  SET.sections.forEach((s) => {
    html += `<li class="bd-section"><span>${esc(s.name)}</span></li>`;
    s.items.forEach(() => {
      const it = ITEMS[i];
      if (i === 5) html += `<li class="bd-gap" aria-hidden="true"></li>`;
      html += `<li class="bd-card${i === 5 ? " lift" : ""}"><span class="bd-n">${i + 1}</span>${it.pic}<span class="bd-title">${esc(it.title)}</span><span class="bd-meta">${dots(it.level)}<span class="mins">~${it.mins} min</span>${it.note ? `<span class="bd-has-note" title="${esc(it.note)}">note</span>` : ""}</span></li>`;
      i++;
    });
  });
  out("set-editor-board.html", page("Akari for beginners · Edit, board (mockup)", `<main class="wrap ed-page">${editorHead("grid")}
<ol class="bd-grid">${html}</ol>${editorFoot}</main>`));
}

// phones: rows with ↑ ↓, notes under each, one row held to drag
function phoneRow(it, i, lift) {
  return `<li class="ph-row${lift ? " lift" : ""}"><div class="ph-main"><span class="ed-n">${i + 1}</span>${it.pic}<span class="ed-text"><strong>${esc(it.title)}</strong><span class="by">${it.by}</span><span class="ed-meta">${dots(it.level)}<span class="mins">~${it.mins} min</span></span></span>
<span class="ph-move"><button type="button" aria-label="Move up">${ico("up")}</button><button type="button" aria-label="Move down">${ico("down")}</button></span></div>
<input class="ed-note" type="text" value="${esc(it.note)}" placeholder="A note (optional)" aria-label="Note"></li>`;
}
out("set-editor-phone.html", page("Akari for beginners · Edit, phone (mockup)", `<main class="wrap ed-page ed-phone">${editorHead("rows")}
<p class="hold-hint">Hold a puzzle to drag it, or use the arrows.</p>
<ol class="ed-rows">${edRows(true)}</ol>${editorFoot}</main>`));

// ---------------------------------------------------------------- 13: the set's page

function setRows(items, { solved, cur, day, offset = 0 } = {}) {
  return items.map((it, i) => `<li class="st-row${i === cur ? " cur" : ""}"><span class="st-n">${day ? day[i] : offset + i + 1}</span><a class="st-pic" href="#p${i}">${it.pic}${solved.has(it.id) ? solvedBadge : ""}</a>
<a class="st-text" href="#p${i}"><strong>${esc(it.title)}</strong><span class="by">${it.by}</span>${it.note ? `<span class="st-note">${esc(it.note)}</span>` : ""}</a>
<span class="st-meta">${dots(it.level)}<span class="mins">~${it.mins} min</span></span></li>`).join("");
}
{
  let i = 0;
  const sections = SET.sections.map((s) => { const items = ITEMS.slice(i, i + s.items.length); const html = `<section class="st-section"><h2>${esc(s.name)}</h2><ol class="st-rows" start="${i + 1}">${setRows(items, { solved: SOLVED, cur: CUR - i, offset: i })}</ol></section>`; i += s.items.length; return html; }).join("");
  const body = `<main class="wrap st-page">
<header class="st-head">
  <p class="l-kicker">${ico("set")}Set</p>
  <h1>${esc(SET.title)}</h1>
  <a class="st-by" href="#wyatt">${sized(WYATT, 26)}<span>Wyatt</span><span class="muted">@wyatt</span></a>
  <p class="st-intro">${esc(SET.intro)}</p>
  <p class="l-meta">8 puzzles · ~${ITEMS.reduce((s, it) => s + it.mins, 0)} min · Puzzles by @wyatt and Slate</p>
  <div class="l-progress"><span><strong>3</strong> of 8 solved</span><span class="l-track"><i style="width:${(3 / 8 * 100).toFixed(1)}%"></i></span></div>
  <div class="l-actions"><a class="btn primary" href="#carry-on">${ico("play", "mini-icon fill")}Carry on <span class="l-sub">3 of 8</span></a><button class="btn" type="button">${ico("again")}Play again</button><button class="btn l-share" type="button" aria-label="Share">${ico("share")}<span>Share</span></button></div>
</header>
${sections}
</main>`;
  out("set-page.html", page("Akari for beginners · inkit (mockup)", body));
}

// ---------------------------------------------------------------- 14: Slate's week, an open set

{
  const week = ["m29sd5vthj", "9tw4b3x373", "z53shxh8w3"].map(pz).map((it) => ({ ...it, note: "" }));
  const days = ["Mon", "Tue", "Wed"];
  const body = `<main class="wrap st-page">
<header class="st-head">
  <p class="l-kicker">${ico("set")}Set · <span class="open-pill">Open</span></p>
  <h1>Week 41 · Lamp Code</h1>
  <a class="st-by" href="#slate">${sized(SLATE, 26)}<span>Slate</span><span class="ai-badge" title="AI creator. Puzzles are generated; Claude writes the titles.">AI</span><span class="muted">@slate</span></a>
  <p class="st-intro">A letter where a number should be. Monday has one.</p>
  <p class="l-meta">3 so far · a new one each weekday until Friday</p>
  <div class="l-progress"><span><strong>2</strong> of 3 solved</span><span class="l-track"><i style="width:${(2 / 3 * 100).toFixed(1)}%"></i></span></div>
  <div class="l-actions"><a class="btn primary" href="#carry-on">${ico("play", "mini-icon fill")}Carry on <span class="l-sub">Wed</span></a><button class="btn" type="button">Subscribe to Slate</button></div>
</header>
<section class="st-section"><ol class="st-rows">${setRows(week, { solved: new Set(["m29sd5vthj", "9tw4b3x373"]), cur: 2, day: days })}
<li class="st-row soon"><span class="st-n">Thu</span><span class="st-pic empty"></span><span class="st-text"><strong>Comes Thursday</strong></span></li>
<li class="st-row soon"><span class="st-n">Fri</span><span class="st-pic empty"></span><span class="st-text"><strong>Comes Friday</strong></span></li></ol></section>
<section class="st-past"><h2>Earlier weeks</h2><ul class="past-list">${[["Week 40 · Lamps", "s3pw7skznd"], ["Week 39 · Thermometers", "bv389fk3h7"], ["Week 38 · Review", "5fd6bmpkuw"]].map(([t, id]) => `<li><a href="#w">${pz(id).pic}<span><strong>${t}</strong><span class="muted">5 puzzles</span></span></a></li>`).join("")}</ul></section>
</main>`;
  out("set-week.html", page("Week 41 · Lamp Code · inkit (mockup)", body));
}

// ---------------------------------------------------------------- the overview

const SHOTS = [
  ["10-add-to-set-desktop.png", "Add to a set, from a puzzle page"], ["10-add-to-set-phone.png", "Add to a set, phone"],
  ["11-make-set-from-search-desktop.png", "Make a set from these, from a search"],
  ["12-set-editor-rows-desktop.png", "Set editor: rows, notes, sections, the ramp"], ["12b-set-editor-add-desktop.png", "Set editor: Add puzzles"],
  ["12c-set-editor-board-desktop.png", "Set editor, other way: a board of cards"], ["12d-set-editor-phone.png", "Set editor, phone"],
  ["13-set-page-desktop.png", "The set's page"], ["13-set-page-phone.png", "The set's page, phone"],
  ["14-week-open-set-desktop.png", "Slate's week, an open set"], ["14-week-open-set-phone.png", "Slate's week, phone"],
];
const VAR = [
  ["V1", "Line above the paper"], ["V2", "Bar under the board"], ["V3", "Breadcrumb in the title, arrows at the edges"], ["V4", "Side rail (strip on phones)"],
];
const vimg = (i, k, s) => `2${i}-v${i + 1}-${k}-${s}.png`;
const index = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lists and sets mockups</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css"><link rel="stylesheet" href="sets.css"></head>
<body class="sheet-index"><main>
<h1>Lists and sets</h1>
<p class="muted">Search lists (01–06) and sets (10–24). Mockups, not product code.</p>
<h2>Where am I? Four ways, in a set and in a search</h2>
<table class="contact"><thead><tr><th></th><th>Set · desktop</th><th>Search · desktop</th><th>Set · phone</th><th>Search · phone</th></tr></thead><tbody>
${VAR.map(([v, d], i) => `<tr><th><strong>${v}</strong><span>${d}</span></th>${[["set", "desktop"], ["search", "desktop"], ["set", "phone"], ["search", "phone"]].map(([k, s]) => `<td><a href="${vimg(i, k, s)}"><img src="${vimg(i, k, s)}" alt="${v} ${k} ${s}" class="${s}"></a></td>`).join("")}</tr>`).join("")}
</tbody></table>
<h2>Making and playing sets</h2>
<ul class="shots">${SHOTS.map(([f, d]) => `<li><a href="${f}"><img src="${f}" alt="${esc(d)}" class="${f.includes("phone") ? "phone" : "desktop"}"></a><span>${f.slice(0, 3).replace("-", "")} · ${esc(d)}</span></li>`).join("")}</ul>
<h2>Search lists (first round)</h2>
<ul class="shots">${["01-puzzle-in-list-desktop.png", "02-solved-next-desktop.png", "02b-solved-last-desktop.png", "03-search-list-desktop.png", "04-share-frozen-desktop.png", "05-list-page-desktop.png"].map((f) => `<li><a href="${f}"><img src="${f}" alt="${f}" class="desktop"></a><span>${f}</span></li>`).join("")}</ul>
</main></body></html>`;
out("index.html", index);
console.log("wrote v1–v4 × set/search, add-to-set, make-from-search, set-editor (rows, add, board, phone), set-page, set-week, index");

// ---------------------------------------------------------------- 30–32: V2 refined (the owner's pick)
// The bar under the board, centred: Prev, then the context and progress, then Next (A); or all
// stacked in the middle (B). A set shows a thin bar of how many are solved, with a notch where
// this puzzle sits; a search shows "3 of 41". The maker's note: (a) under the title row, (b) on
// the paper's top left, (c) just above the paper, on its left edge.

const SOLVED2 = 4;   // of 8: puzzles 1, 2, 4 and 5; this one is 3
function bar2(c, arr) {
  const ctx = `<span class="ub2-ctx">${ico(c.icon)}<span class="ctx-title">${esc(c.name)}</span>${c.by ? `<span class="ctx-by"><span class="dot">· </span>by ${c.by}</span>` : ""}</span>`;
  const prog = c.kind === "set"
    ? `<span class="ub2-prog"><span class="pbar" role="img" aria-label="${SOLVED2} of 8 solved; this is 3"><i style="width:${(SOLVED2 / 8 * 100).toFixed(1)}%"></i><b style="left:${(2.5 / 8 * 100).toFixed(2)}%"></b></span><span class="ub2-count">${SOLVED2} of 8 solved</span></span>`
    : `<span class="ub2-prog"><span class="ub2-count plain">3 of 41</span></span>`;
  const prev = `<a class="btn ub2-prev" href="#prev" aria-label="Previous">${ico("chevL")}<span>Prev</span></a>`;
  const next = `<a class="btn primary ub2-next" href="#next" aria-label="Next">${arr === "A" ? "" : ""}<span>Next</span>${ico("chevR")}</a>`;
  return arr === "A"
    ? `<nav class="ub2 a">${prev}<a class="ub2-mid" href="#ctx">${ctx}${prog}</a>${next}</nav>`
    : `<nav class="ub2 b"><a class="ub2-mid" href="#ctx">${ctx}${prog}</a><span class="ub2-buttons">${prev}${next}</span></nav>`;
}
function v2r(c, { arr = "A", note = "c" } = {}) {
  const n = c.kind === "set" ? note : "";
  let board = boardOf();
  if (n === "b") board = board.replace('<div class="paper-bar"><div class="group"></div>', `<div class="paper-bar"><div class="group paper-note">${esc(c.note)}</div>`);
  const above = n === "c" ? `<p class="stage-note">${esc(c.note)}</p>` : "";
  const headNote = n === "a" ? `<p class="set-note">${esc(c.note)}</p>` : "";
  const cls = `v2r arr-${arr}${n ? ` note-${n}` : ""}`;
  const body = `<div class="game-layout ${cls}">${backBtn}
<main class="wrap game-page ${cls}"><header class="game-head">${headInner}${headNote}</header>
<div class="game-body"><div class="game-spot"><div class="stage">${above}${board}</div>${bar2(c, arr)}</div></div></main></div>`;
  return page(`Lights On · V2 · ${c.kind} (mockup)`, body);
}
for (const k of ["set", "search"]) {
  out(`v2r-${k}.html`, v2r(CTX[k], { arr: "A", note: "c" }));
  out(`v2r-${k}-stack.html`, v2r(CTX[k], { arr: "B", note: "c" }));
}
out("v2r-set-note-a.html", v2r(CTX.set, { note: "a" }));
out("v2r-set-note-b.html", v2r(CTX.set, { note: "b" }));

const sheet30 = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>V2, refined</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css"><link rel="stylesheet" href="sets.css"></head>
<body class="sheet-index"><main>
<h2>The bar under the board</h2>
<table class="contact"><thead><tr><th></th><th>Set · desktop</th><th>Search · desktop</th><th>Set · phone</th><th>Search · phone</th></tr></thead><tbody>
${[["A", "Prev · context and progress · Next", "30-v2", ""], ["B", "Stacked in the middle", "31-v2", "-stack"]].map(([k, d, p, s]) => `<tr><th><strong>${k}</strong><span>${d}</span></th>${["set-desktop", "search-desktop", "set-phone", "search-phone"].map((x) => `<td><img src="${p}-${x.replace("-", s + "-")}.png" class="${x.endsWith("phone") ? "phone" : "desktop"}"></td>`).join("")}</tr>`).join("")}
</tbody></table>
<h2>The maker's note</h2>
<table class="contact"><thead><tr><th></th><th>Desktop</th><th>Phone</th></tr></thead><tbody>
${[["a", "Under the title row", "32-v2-note-a"], ["b", "On the paper, top left", "32-v2-note-b"], ["c", "Above the paper, left edge (used)", "30-v2-set"]].map(([k, d, p]) => `<tr><th><strong>${k}</strong><span>${d}</span></th><td><img src="${p}-desktop.png" class="desktop"></td><td><img src="${p}-phone.png" class="phone"></td></tr>`).join("")}
</tbody></table>
</main></body></html>`;
out("contact-30.html", sheet30);
console.log("wrote v2r (set, search, stack, note a, note b), contact-30");
