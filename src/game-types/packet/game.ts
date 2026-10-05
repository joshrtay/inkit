// Packet game type: page through printable sheets, open each PDF, check the final answer.
import type { MountGame } from "../../lib/game";
import type { PacketClientConfig } from "./types";
import { sha256 } from "../../lib/hash";

/** Answers are compared as plain digits, so "74,992" and "74992" both match. */
export const normalizeAnswer = (raw: string) => raw.replace(/[\s,._']/g, "").replace(/^0+(?=\d)/, "");

export const createPacket = (config: PacketClientConfig): MountGame => (root, host) => {
  const { sheets, sheetsBase: base, answerHash } = config;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const list = q("[data-sheet-list]"), img = q<HTMLImageElement>("[data-sheet-img]");
  const where = q("[data-where]"), note = q("[data-note]");
  const prev = q<HTMLButtonElement>("[data-prev]"), next = q<HTMLButtonElement>("[data-next]");
  const pdf = q<HTMLAnchorElement>("[data-pdf]");
  let current = 0;

  sheets.forEach((s, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<span>${s.name}</span><span class="kind">${s.kind}</span>`;
    b.addEventListener("click", () => show(i, true));
    li.appendChild(b);
    list.appendChild(li);
    new Image().src = `${base}${s.file}.png`;   // warm the cache so paging is instant
  });

  function show(i: number, fromUser: boolean) {
    current = Math.max(0, Math.min(sheets.length - 1, i));
    const s = sheets[current];
    img.src = `${base}${s.file}.png`;
    img.alt = `${s.name}: ${s.note}`;
    pdf.href = `${base}${s.file}.pdf`;
    where.textContent = `${current + 1} / ${sheets.length}`;
    note.textContent = s.note;
    prev.disabled = current === 0;
    next.disabled = current === sheets.length - 1;
    list.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-current", String(j === current)));
    if (fromUser) history.replaceState(null, "", "#" + s.id);
  }

  prev.addEventListener("click", () => show(current - 1, true));
  next.addEventListener("click", () => show(current + 1, true));
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    if (e.key === "ArrowLeft") show(current - 1, true);
    if (e.key === "ArrowRight") show(current + 1, true);
  };
  document.addEventListener("keydown", onKey);
  const startAt = sheets.findIndex((s) => "#" + s.id === location.hash);
  show(startAt >= 0 ? startAt : 0, false);

  const result = q("[data-result]"), input = q<HTMLInputElement>("[data-answer]");
  q("[data-check]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const digits = normalizeAnswer(input.value);
    result.className = "result";
    if (!digits) { result.textContent = "Type the number from the last sheet first."; return; }
    if (!/^\d+$/.test(digits)) { result.className = "result bad"; result.textContent = "Use digits only."; return; }
    if ((await sha256(digits)) === answerHash) {
      result.innerHTML = `<span class="stamp">ESCAPED<small>${Number(digits).toLocaleString("en-US")} &middot; DELIVERED</small></span>`;
      host.solved({ answer: digits });
    } else {
      result.className = "result bad";
      result.textContent = "That's not it. Recheck the number each sheet hands to the next.";
    }
  });

  return () => document.removeEventListener("keydown", onKey);
};

/** Mount every packet on the page (each carries its config and id as data attributes). */
export function mountAll(createHost: (id: string) => Parameters<MountGame>[1]) {
  document.querySelectorAll<HTMLElement>("[data-game-type=packet]").forEach((root) => {
    createPacket(JSON.parse(root.dataset.config!) as PacketClientConfig)(root, createHost(root.dataset.gameId!));
  });
}
