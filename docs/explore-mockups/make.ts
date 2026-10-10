// Builds the Explore redesign mockups (docs/explore-mockups/*.html) from real data: the AI creators'
// backfill (puzzles/ai/out/backfill.json) and personas, the example puzzles in src/games (standing in
// for human creators' puzzles, under invented names), and the guides' pictures. Every puzzle picture
// is drawn by the site's own picture code. Not product code.
//
// Run from app/: npx vite-node --config vitest.config.ts ../docs/explore-mockups/make.ts
// then: node ../docs/explore-mockups/shoot.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "~site/engine/puzzle.ts";
import type { GridSpec } from "~site/engine/types.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import { guides } from "~site/guides/guides.ts";
import { PERSONAS } from "~/ai/personas";
import { personaIcon } from "~/ai/icons";
import { kindName } from "~/games/kinds";
import { specOf, FOLDER_GENRE } from "~/sketchpad/from-puzzle";
import { guideCard, ORDER } from "~/lib/guides.server";

const ROOT = new URL("../../", import.meta.url).pathname;
const OUT = `${ROOT}docs/explore-mockups/`;
const NOW = Date.parse("2026-10-09T18:00:00Z");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- data

interface Puzzle {
  id: string; genre: string; title: string; by: string; at: number;
  level: 1 | 2 | 3; mins: number; likes: number; solves: number; beta?: { votes: number; need: number };
}
interface Creator { handle: string; name: string; bio: string; ai: boolean; studio?: boolean; activity: string; pics: string[] }

const pictures: Record<string, string> = {};
const draw = (id: string, spec: GridSpec, label: string) => {
  try { pictures[id] = pictureSvg(makePuzzle(spec), null, label); } catch (e) { console.warn("no picture", id, String(e)); }
};
const inkOf = (genre: string) => (guides as Record<string, { ink?: string }>)[genre]?.ink ?? "#26398f";

// a rough time to solve, until the time model (research-reputation.md) has real solve times:
// grows with the board and, faster, with the scored difficulty
const minutesOf = (cells: number, d: number) => Math.max(1, Math.round(cells * (0.06 + 0.5 * d * d)));
const levelOf = (d: number): 1 | 2 | 3 => (d < 0.4 ? 1 : d < 0.62 ? 2 : 3);
// stable pseudo-random small numbers for likes and solves
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

// the AI creators' backfill
interface Post { key: string; persona: string; publishedAt: string; genre: string; size: [number, number]; title: string; sketch: string; score: { difficulty: number } }
const posts = (JSON.parse(readFileSync(`${ROOT}puzzles/ai/out/backfill.json`, "utf8")).posts as Post[]);
const ai: Puzzle[] = posts.map((r) => {
  const id = `b-${r.persona}-${r.publishedAt.slice(0, 16).replace(/[^0-9]/g, "")}`;
  const d = r.score.difficulty, cells = r.size[0] * r.size[1], age = (NOW - Date.parse(r.publishedAt)) / 86400e3;
  return { id, genre: r.genre, title: r.title.replace(/\s*—\s*$/, ""), by: r.persona, at: Date.parse(r.publishedAt), level: levelOf(d), mins: minutesOf(cells, d),
    likes: Math.round(hash(id) * 6 + Math.min(age, 30) / 6), solves: Math.round(hash(id + "s") * 14 + Math.min(age, 40) / 3), _sketch: r.sketch } as Puzzle & { _sketch: string };
});
const needPic = new Set<string>();
const aiById = new Map(ai.map((p) => [p.id, p]));

// invented human creators (placeholders: none of them are real accounts)
const H = (handle: string, name: string, bio: string, activity: string, studio = false): Creator => ({ handle, name, bio, ai: false, studio, activity, pics: [] });
const humans: Creator[] = [
  H("maren", "Maren Holt", "Loops and pearls, drawn on the train home. Mostly Masyu, sometimes a Slitherlink when the line is late.", "5 new this month · ♥ 214"),
  H("theo-makes", "Theo Okafor", "Sudoku variants for my maths club. Thermometers on Thursdays.", "4 new this month · ♥ 160"),
  H("attic", "Attic Puzzle Club", "A family studio: two kids, one parent and far too many Akari.", "6 new this month · ♥ 131", true),
  H("junebug", "June Ishikawa", "Small, fair Nurikabe and Star Battle. No guessing, ever.", "3 new this month · ♥ 118"),
  H("sam-r", "Sam Rivera", "My first puzzles! Simple Loops, mostly. Tell me if one's too easy.", "2 new this month · ♥ 37"),
];
// their puzzles: the site's example puzzles, retitled
const HP = (by: string, file: string, title: string, hoursAgo: number, level: 1 | 2 | 3, mins: number, likes: number, solves: number, beta?: Puzzle["beta"]): Puzzle => {
  const [folder, n] = file.split("/");
  const genre = FOLDER_GENRE[folder] ?? folder, id = `e-${folder}-${n}`;
  if (!pictures[id]) draw(id, specOf(genre, JSON.parse(readFileSync(`${ROOT}src/games/${folder}/${n}.json`, "utf8"))), title);
  return { id, genre, title, by, at: NOW - hoursAgo * 3600e3, level, mins, likes, solves, beta };
};
const human: Puzzle[] = [
  HP("maren", "masyu/2", "Low Tide at Six", 2, 2, 6, 12, 31),
  HP("theo-makes", "thermo-sudoku/1", "Kettle Boiling", 5, 2, 7, 9, 22),
  HP("junebug", "nurikabe/1", "Two Small Islands", 9, 1, 4, 14, 40),
  HP("attic", "akari/3", "Lamps for the Landing", 20, 1, 3, 8, 26),
  HP("sam-r", "round-the-bend/3", "Round the Pond", 26, 1, 2, 5, 19),
  HP("maren", "slitherlink/2", "Fence Posts", 30, 2, 5, 11, 28),
  HP("junebug", "star-battle/2", "Three Bright Ones", 70, 3, 14, 17, 21),
  HP("theo-makes", "irregular-sudoku/2", "Crooked Garden", 80, 3, 16, 10, 12),
  HP("attic", "hitori/1", "Pip's Shading", 100, 1, 3, 6, 23),
  HP("maren", "masyu/1", "Pearls on a String", 140, 1, 3, 21, 64),
  HP("sam-r", "simple-path/1", "From the Gate", 150, 1, 2, 4, 15),
  HP("attic", "picture-squares/2", "What Ada Drew", 160, 2, 8, 9, 18),
  HP("theo-makes", "sudoku/2", "Six by Six", 170, 1, 4, 13, 47),
  // Fresh ink: in beta, collecting votes
  HP("sam-r", "round-the-bend/5", "Snake in the Grass", 4, 1, 3, 0, 3, { votes: 3, need: 8 }),
  HP("attic", "akari/2", "Torch Under the Stairs", 7, 1, 3, 0, 5, { votes: 5, need: 8 }),
  HP("junebug", "spiral-galaxies/2", "Pinwheel", 11, 2, 9, 0, 2, { votes: 2, need: 5 }),
  HP("theo-makes", "skyscrapers/2", "View from the Roof", 15, 2, 6, 0, 4, { votes: 4, need: 5 }),
  HP("maren", "numberlink/2", "Crossed Wires", 22, 2, 5, 0, 1, { votes: 1, need: 5 }),
];

const aiCreators: Creator[] = PERSONAS.map((p) => ({ handle: p.handle, name: p.name, bio: p.bio, ai: true, activity: "", pics: [] }));
const creators = new Map<string, Creator>([...humans, ...aiCreators].map((c) => [c.handle, c]));

const all = [...human, ...ai];
const byId = new Map(all.map((p) => [p.id, p]));
const use = (ps: Puzzle[]) => { ps.forEach((p) => needPic.add(p.id)); return ps; };

// ---------------------------------------------------------------- shelves

const aiNewest = [...ai].sort((a, b) => b.at - a.at);
// Today: the newest from everyone, at most one AI puzzle after each human one... here mixed 1:1 to show both
const humanToday = human.filter((p) => !p.beta && NOW - p.at < 36 * 3600e3);
const today: Puzzle[] = [];
{
  const a = aiNewest.filter((p) => NOW - p.at < 36 * 3600e3);
  const seen = new Set<string>();
  let i = 0, j = 0;
  while (today.length < 10 && (i < humanToday.length || j < a.length)) {
    if (i < humanToday.length && (today.length % 2 === 0 || j >= a.length)) today.push(humanToday[i++]);
    else { while (j < a.length && seen.has(a[j].by)) j++; if (j < a.length) { seen.add(a[j].by); today.push(a[j++]); } else j = a.length; }
  }
}
const pickVaried = (ps: Puzzle[], n: number) => { const g = new Set<string>(), out: Puzzle[] = []; for (const p of ps) { if (out.length >= n) break; if (g.has(p.genre)) continue; g.add(p.genre); out.push(p); } return out; };
const inToday = new Set(today.map((p) => p.id));
const quick = pickVaried([...human.filter((p) => !p.beta && p.mins <= 5), ...aiNewest.filter((p) => p.mins <= 5 && p.mins >= 2)].filter((p) => !inToday.has(p.id)).sort((a, b) => b.at - a.at), 10);
const week = (p: Puzzle) => NOW - p.at < 7 * 86400e3;
const hard = pickVaried([...human.filter((p) => !p.beta && week(p)), ...ai.filter((p) => week(p))].filter((p) => p.level >= 2).sort((a, b) => b.level - a.level || b.mins - a.mins), 9);
const fresh = human.filter((p) => p.beta);
use([...today, ...quick, ...hard, ...fresh]);

// each creator's three newest
for (const c of creators.values()) {
  const mine = all.filter((p) => p.by === c.handle && !p.beta).sort((a, b) => b.at - a.at).slice(0, 3);
  c.pics = mine.map((p) => p.id); use(mine);
  if (c.ai) {
    const n = ai.filter((p) => p.by === c.handle && NOW - p.at < 30 * 86400e3).length;
    c.activity = `${n} new this month`;
  }
}
// AI creators: ranked the same way (recent activity, then how liked), on their own shelf
const aiRanked = [...aiCreators].sort((a, b) => {
  const score = (c: Creator) => ai.filter((p) => p.by === c.handle && NOW - p.at < 30 * 86400e3).reduce((s, p) => s + 1 + p.likes / 3, 0);
  return score(b) - score(a);
});

// Start here: each type's guide example (the easiest, rules on the card)
const starters = ORDER.filter((k) => k !== "coats").map((k) => {
  const card = guideCard(k);
  pictures[`g-${k}`] = card.thumb;
  return { kind: k, name: card.name, summary: card.summary, ink: card.ink, category: card.category };
});
const counts: Record<string, number> = {};
for (const p of all) if (!p.beta) counts[p.genre] = (counts[p.genre] ?? 0) + 1;

// Masyu's type page
const masyu = all.filter((p) => p.genre === "masyu" && !p.beta).sort((a, b) => b.at - a.at);
use(masyu);

// draw the AI pictures we need
for (const id of needPic) {
  const p = aiById.get(id) as (Puzzle & { _sketch: string }) | undefined;
  if (!p || pictures[id]) continue;
  const s = p._sketch;
  draw(id, { ...JSON.parse(s.slice(s.indexOf("\n") + 1)), genre: p.genre }, p.title);
}

// ---------------------------------------------------------------- pieces

const NAV = {
  feed: ["M4 13h4l2 3h4l2-3h4", "M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"],
  explore: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
  guide: ["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z", "M4 21V5", "M8 7h7", "M8 11h5"],
  plus: ["M12 5v14", "M5 12h14"],
  more: ["M4 7h16", "M4 12h16", "M4 17h16"],
  chevL: ["m15 18-6-6 6-6"], chevR: ["m9 18 6-6-6-6"], arrow: ["M5 12h14", "m13 6 6 6-6 6"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  heart: ["M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"],
};
const ico = (n: keyof typeof NAV, cls = "nav-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${NAV[n].map((d) => `<path d="${d}"/>`).join("")}</svg>`;

const HUES = [12, 28, 45, 145, 175, 200, 225, 265, 300, 335];
function avatar(c: Creator, size: number) {
  if (c.ai) return `<span class="avatar avatar-ai" aria-hidden="true" style="width:${size}px;height:${size}px">${personaIcon(c.handle)}</span>`;
  let h = 0; for (const ch of c.handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return `<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${size * 0.46}px;background:linear-gradient(135deg, hsl(${hue} 75% 62%), hsl(${(hue + 40) % 360} 70% 48%))">${esc(c.name[0])}</span>`;
}
const badge = `<span class="ai-badge" title="An AI creator: puzzles made by a generator and proved to have one solution; titles and notes written by Claude">AI</span>`;
const pic = (id: string, genre: string, cls = "thumb") => `<span class="grid-game pic ${cls}" style="--paper-ink:${inkOf(genre)}" data-pic="${id}"></span>`;
const dots = (level: number, max = 3) => `<span class="diff" role="img" aria-label="Difficulty ${level} of ${max}" title="${["", "Easy", "Medium", "Hard"][level]}">${Array.from({ length: max }, (_, i) => `<i${i < level ? ' class="on"' : ""}></i>`).join("")}</span>`;
const ago = (t: number) => { const h = Math.round((NOW - t) / 3600e3); return h < 1 ? "just now" : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`; };

function card(p: Puzzle, opts: { when?: boolean; time?: boolean } = {}) {
  const c = creators.get(p.by)!;
  const foot = p.beta
    ? `<span class="beta-tag">Fresh ink</span><span class="votes"><span class="vote-bar"><i style="width:${Math.round((p.beta.votes / p.beta.need) * 100)}%"></i></span>${p.beta.votes} of ${p.beta.need} votes</span>`
    : `${dots(p.level)}<span class="mins${opts.time ? " strong" : ""}">~${p.mins} min</span>${p.likes ? `<span class="likes">♥ ${p.likes}</span>` : ""}${opts.when ? `<span class="when">${ago(p.at)}</span>` : ""}`;
  return `<li><a class="game-card pcard${p.beta ? " beta" : ""}" href="#">${pic(p.id, p.genre)}
<span class="game-card-text"><span class="kind">${esc(kindName(p.genre))}</span><strong>${esc(p.title)}</strong>
<span class="by">${avatar(c, 18)}<span class="by-name">${esc(c.name)}</span>${c.ai ? badge : ""}</span>
<span class="card-foot">${foot}</span></span></a></li>`;
}

const shelf = (id: string, title: string, sub: string, items: string, more = "See all", extra = "") => `
<section class="shelf xshelf" id="${id}">
  <header class="shelf-head"><div><h2>${title}</h2><p class="shelf-sub">${sub}</p></div>${extra}<a class="see-all" href="#">${more}${ico("arrow", "mini-icon")}</a></header>
  <div class="rail"><ul class="row">${items}</ul><button class="rail-btn" type="button" aria-label="More">${ico("chevR", "mini-icon")}</button></div>
</section>`;

function starterCard(s: (typeof starters)[number]) {
  return `<li><a class="game-card pcard starter" href="#">${pic(`g-${s.kind}`, s.kind)}
<span class="game-card-text"><span class="kind">Start here</span><strong>${esc(s.name)}</strong><span class="desc">${esc(s.summary)}</span>
<span class="card-foot">${dots(1)}<span class="mins">~2 min</span><span class="rules-link">Rules with pictures</span></span></span></a></li>`;
}
function typeTile(s: (typeof starters)[number]) {
  return `<li><a class="type-tile" href="#">${pic(`g-${s.kind}`, s.kind, "tile-pic")}<span class="tile-text"><strong>${esc(s.name)}</strong><span>${counts[s.kind] ?? 0} puzzles</span></span></a></li>`;
}
function creatorCard(c: Creator, sub = true) {
  const bio = c.bio.split(" / ")[0];
  return `<li><article class="ccard${c.ai ? " ai" : ""}">
<a class="ccard-who" href="#">${avatar(c, 52)}<span class="ccard-id"><strong>${esc(c.name)}${c.ai ? ` ${badge}` : ""}</strong><span class="ccard-meta">@${c.handle}${c.studio ? " · studio" : ""} · ${esc(c.activity)}</span></span></a>
<p class="ccard-bio">${esc(bio)}</p>
<a class="ccard-pics" href="#">${c.pics.map((id) => pic(id, byId.get(id)!.genre, "mini")).join("")}</a>
${sub ? `<div class="ccard-actions"><a class="btn primary" href="#">Subscribe</a></div>` : ""}
</article></li>`;
}

const sidenav = `<nav class="sidenav" aria-label="Main"><a class="brand" href="#">inkit</a>
<div class="nav-items"><a class="nav-item" href="#">${ico("feed")}<span>Subscriptions</span></a><a class="nav-item active" href="#" aria-current="page">${ico("explore")}<span>Explore</span></a>
<a class="nav-item" href="#">${avatar({ handle: "you", name: "Robin", ai: false } as Creator, 26)}<span>Profile</span></a></div>
<a class="btn primary create-btn" href="#">${ico("plus")}<span>Create</span></a>
<div class="nav-foot"><a class="nav-item" href="#">${ico("guide")}<span>Puzzle types</span></a><button class="nav-item" type="button">${ico("more")}<span>More</span></button></div></nav>`;
const tabbar = `<nav class="tabbar" aria-label="Main"><a href="#">${ico("feed")}<span>Feed</span></a><a class="active" href="#">${ico("explore")}<span>Explore</span></a><a class="tab-create" href="#">${ico("plus")}<span>Create</span></a><a href="#">${ico("guide")}<span>Types</span></a><a href="#">${avatar({ handle: "you", name: "Robin", ai: false } as Creator, 24)}<span>Profile</span></a></nav>`;
const search = (value = "") => `<form class="guide-search x-search" role="search" onsubmit="return false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
<input type="search" value="${esc(value)}" placeholder="Search puzzles, types and creators" aria-label="Search puzzles, types and creators" autocomplete="off"></form>`;

const page = (title: string, body: string, cls = "") => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- A mockup of the Explore redesign (not product code). Generated by make.ts; the site's real CSS is linked from the repo. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="../../src/styles/global.css">
<link rel="stylesheet" href="../../app/app/site.css">
<link rel="stylesheet" href="../../src/game-types/grid/styles.css">
<link rel="stylesheet" href="explore.css">
<script src="pictures.js"></script>
<script src="explore.js"></script>
</head>
<body class="${cls}">
<div class="shell">${sidenav}<div class="page">${body}</div></div>${tabbar}
</body></html>
`;

// ---------------------------------------------------------------- 1. Explore

const recommends = (who: Creator, picks: { c: Creator; why: string }[]) => `
<section class="shelf xshelf recs">
  <header class="shelf-head"><div><h2>${avatar(who, 26)} ${esc(who.name)} recommends</h2><p class="shelf-sub">Creators ${esc(who.name.split(" ")[0])} subscribes to and picked to share, in their own words.</p></div><a class="see-all" href="#">${esc(who.name.split(" ")[0])}’s page${ico("arrow", "mini-icon")}</a></header>
  <ul class="rec-row">${picks.map(({ c, why }) => `<li><article class="rec">
    <a class="rec-who" href="#">${avatar(c, 40)}<span><strong>${esc(c.name)}${c.ai ? ` ${badge}` : ""}</strong><span class="ccard-meta">@${c.handle}</span></span></a>
    <blockquote>“${esc(why)}”</blockquote>
    <a class="ccard-pics" href="#">${c.pics.slice(0, 3).map((id) => pic(id, byId.get(id)!.genre, "mini")).join("")}</a>
    <a class="btn" href="#">Subscribe</a></article></li>`).join("")}</ul>
</section>`;

const C = (h: string) => creators.get(h)!;
const explore = page("Explore · inkit (mockup)", `<main class="wrap explore x-explore">
<header class="x-head"><h1>Explore</h1>${search()}
<div class="chips quick-chips" role="group" aria-label="Jump to"><button type="button" aria-pressed="true">All</button><button type="button">Quick</button><button type="button">Easy</button><button type="button">Hard</button><button type="button">Lines</button><button type="button">Numbers</button><button type="button">Shading</button></div></header>
${shelf("today", "Today", "The newest puzzles from every creator.", today.map((p) => card(p, { when: true })).join(""))}
${shelf("quick", "Quick ones", "About five minutes or less: one with a cup of tea.", quick.map((p) => card(p, { time: true })).join(""))}
${shelf("start", "Start here", "New to a type? One easy puzzle each, with the rules a tap away.", starters.slice(0, 10).map(starterCard).join(""), "All types")}
<section class="shelf xshelf" id="types">
  <header class="shelf-head"><div><h2>Browse by type</h2><p class="shelf-sub">${starters.length} kinds of puzzle. Each opens its puzzles, newest or best first.</p></div><a class="see-all" href="#">All ${starters.length} types${ico("arrow", "mini-icon")}</a></header>
  <ul class="tiles">${["masyu", "sudoku", "akari", "slitherlink", "nurikabe", "star-battle", "panel", "aquarium", "skyscrapers", "nonogram", "thermo-sudoku", "hidoku"].map((k) => typeTile(starters.find((s) => s.kind === k)!)).join("")}</ul>
</section>
${shelf("hard", "This week’s hard ones", "The toughest of the last seven days. Set aside a while.", hard.map((p) => card(p)).join(""))}
${shelf("fresh", `Fresh ink <span class="beta-pill">beta</span>`, "Brand-new puzzles still collecting votes. Solve one, then say how it was: you help it get inked.", fresh.map((p) => card(p, { when: true })).join(""), "See all",
  `<div class="seg small" role="tablist"><button role="tab" aria-selected="true">People</button><button role="tab">AI creators</button></div>`)}
<section class="shelf xshelf" id="creators">
  <header class="shelf-head"><div><h2>Creators to follow</h2><p class="shelf-sub">People who publish here, by what they’ve made lately and how much it’s liked.</p></div><a class="see-all" href="#">See all${ico("arrow", "mini-icon")}</a></header>
  <div class="rail"><ul class="row crow">${humans.map((c) => creatorCard(c)).join("")}</ul><button class="rail-btn" type="button" aria-label="More">${ico("chevR", "mini-icon")}</button></div>
</section>
<section class="shelf xshelf ai-shelf" id="ai">
  <header class="shelf-head"><div><h2>Made by AI creators</h2><p class="shelf-sub">Fifteen characters with puzzles made by inkit’s generator, each proved to have one solution. Their titles and notes are written by Claude.</p></div><a class="see-all" href="#">All 15${ico("arrow", "mini-icon")}</a></header>
  <div class="rail"><ul class="row crow">${aiRanked.map((c) => creatorCard(c)).join("")}</ul><button class="rail-btn" type="button" aria-label="More">${ico("chevR", "mini-icon")}</button></div>
</section>
${recommends(C("maren"), [
  { c: C("junebug"), why: "The fairest Nurikabe I know. Never a guess." },
  { c: C("lumen"), why: "A Masyu every few nights, and they really do get harder with the moon." },
  { c: C("sam-r"), why: "Just started, and the loops are lovely." },
])}
</main>`, "x-page");
writeFileSync(`${OUT}explore.html`, explore);

// ---------------------------------------------------------------- 2. a type page: Masyu

const mg = starters.find((s) => s.kind === "masyu")!;
const typePage = page("Masyu puzzles · inkit (mockup)", `<main class="wrap x-type">
<nav class="crumbs"><a href="#">Explore</a> <span>›</span> <a href="#">Types</a> <span>›</span> Masyu</nav>
<header class="type-head">${pic("g-masyu", "masyu", "type-pic")}
<div class="type-id"><h1>Masyu</h1><p class="aka">also Pearl · Lines</p><p class="lead">${esc(mg.summary)}</p>
<p class="type-stats">${masyu.length} puzzles · ${new Set(masyu.map((p) => p.by)).size} creators · ${masyu.filter(week).length} new this week</p>
<div class="type-actions"><a class="btn primary" href="#">Play the starter</a><a class="btn" href="#">How to play</a></div></div></header>
<div class="toolbar">
  <div class="seg" role="tablist" aria-label="Sort"><button role="tab" aria-selected="true">New</button><button role="tab">Top</button></div>
  <div class="filter" role="group" aria-label="Difficulty"><span class="filter-label">Difficulty</span>
    <div class="chips"><button type="button" aria-pressed="true">Any</button><button type="button">${dots(1)} Easy</button><button type="button">${dots(2)} Medium</button><button type="button">${dots(3)} Hard</button></div></div>
  <label class="toggle"><input type="checkbox"> Quick only <span class="muted">(~5 min)</span></label>
  <label class="toggle"><input type="checkbox" checked> Hide solved</label>
</div>
<p class="sort-note muted">New: newest first. <b>Top</b> ranks by how well liked, over this week, this month or all time.</p>
<ul class="cards x-cards">${masyu.map((p) => card(p, { when: true })).join("")}</ul>
</main>`, "x-page");
writeFileSync(`${OUT}type-masyu.html`, typePage);

// ---------------------------------------------------------------- 3. creator cards, close up

const isola = C("isola");
const closeup = page("Creator cards · inkit (mockup)", `<main class="wrap x-closeup">
<h1 class="x-title">Creator cards</h1>
<div class="closeup-row">
  <figure><figcaption>A person (Creators to follow)</figcaption><ul class="row crow solo">${creatorCard(C("maren"))}</ul>
    <ol class="notes"><li>Avatar, name and handle; a studio says so.</li><li>One line of what they’ve made lately, and how liked it is: the two things the shelf ranks by.</li><li>One line of bio, clamped (the whole bio is on About).</li><li>Their three newest puzzles. A tap on them opens the profile.</li></ol></figure>
  <figure><figcaption>An AI creator (Made by AI creators)</figcaption><ul class="row crow solo">${creatorCard(C("higgledy"))}</ul>
    <ol class="notes"><li>Its own icon instead of a letter, and the AI badge next to the name, as everywhere.</li><li>A verse bio shows its first line; the “ / ” never appears.</li><li>Only on its own shelf: never ranked against people.</li></ol></figure>
</div>
<section class="profile-recs">
  <h2 class="x-sub">On a profile: what a creator recommends</h2>
  <div class="mini-profile">
    <header class="mp-head">${avatar(isola, 64)}<div><h3>${esc(isola.name)} ${badge}</h3><p class="muted">@isola · 26 puzzles · 41 subscribers</p></div><a class="btn primary" href="#">Subscribe</a></header>
    <nav class="tabs"><a href="#">Puzzles</a><a href="#" aria-current="page">Recommends</a><a href="#">About</a></nav>
    <p class="muted rec-intro">Isola recommends 3 creators. Subscribing to Isola suggests them too; you can skip any.</p>
    <ul class="rec-list">${[
      { c: C("bramble-and-burr"), why: "Two neighbours on the next island over. Their windows open the same way twice." },
      { c: C("maren"), why: "Lines drawn with a steady hand. The pearls sit where a door would." },
      { c: C("pebble"), why: "One stone, one turn. A good place to begin the morning before a door." },
    ].map(({ c, why }) => `<li>${avatar(c, 44)}<div><strong>${esc(c.name)}${c.ai ? ` ${badge}` : ""}</strong> <span class="muted">@${c.handle}</span><p>${esc(why)}</p></div><span class="ccard-pics">${c.pics.slice(0, 2).map((id) => pic(id, byId.get(id)!.genre, "mini")).join("")}</span><a class="btn" href="#">Subscribe</a></li>`).join("")}</ul>
  </div>
</section>
</main>`, "x-page");
writeFileSync(`${OUT}creator-cards.html`, closeup);

// ---------------------------------------------------------------- 4. search

const q = "pearl";
const hits = all.filter((p) => !p.beta && (p.genre === "masyu" || /pearl/i.test(p.title))).sort((a, b) => b.at - a.at).slice(0, 6);
use(hits);
for (const id of needPic) { const p = aiById.get(id) as (Puzzle & { _sketch: string }) | undefined; if (p && !pictures[id]) draw(id, { ...JSON.parse(p._sketch.slice(p._sketch.indexOf("\n") + 1)), genre: p.genre }, p.title); }
const searchPage = page("Search · inkit (mockup)", `<main class="wrap x-explore x-search-page">
<header class="x-head"><h1>Explore</h1>${search(q)}</header>
<section class="shelf"><h2 class="group-h">Types</h2><ul class="tiles one">${typeTile(mg)}</ul></section>
<section class="shelf"><h2 class="group-h">Creators</h2><ul class="collection-list">${[C("maren"), C("lumen")].map((c) => `<li class="collection-row"><a class="collection-link" href="#">${avatar(c, 48)}<span class="collection-text"><strong>${esc(c.name)}${c.ai ? ` ${badge}` : ""}</strong><span class="muted">@${c.handle} · ${esc(c.activity || "")}</span><span class="desc">${esc(c.bio)}</span></span></a><a class="btn primary" href="#">Subscribe</a></li>`).join("")}</ul></section>
<section class="shelf"><h2 class="group-h">Puzzles</h2><ul class="cards x-cards">${hits.map((p) => card(p, { when: true })).join("")}</ul></section>
</main>`, "x-page");
writeFileSync(`${OUT}search.html`, searchPage);

// the pictures, shared by the pages
const used = new Set<string>();
for (const html of [explore, typePage, closeup, searchPage]) for (const m of html.matchAll(/data-pic="([^"]+)"/g)) used.add(m[1]);
const missing = [...used].filter((id) => !pictures[id]);
if (missing.length) console.warn("missing pictures:", missing);
writeFileSync(`${OUT}pictures.js`, `// The puzzle pictures for the Explore mockups, drawn by src/game-types/grid/picture.ts (make.ts). Generated.\nwindow.PICS = ${JSON.stringify(Object.fromEntries([...used].filter((id) => pictures[id]).map((id) => [id, pictures[id]])))};\n`);
console.log(`wrote 4 pages, ${used.size} pictures; today ${today.length}, quick ${quick.length}, hard ${hard.length}, masyu ${masyu.length}`);
