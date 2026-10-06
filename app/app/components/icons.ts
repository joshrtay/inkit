// The ink-drawn icons for controls on a puzzle's paper, as SVG markup (same as the current
// site's Icon.astro). Games build their controls as plain HTML, so these are strings.
const PATHS = {
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  reset: ["M3 12a9 9 0 1 0 2.6-6.4L3 8", "M3 3v5h5"],
  check: ["M20 6 9 17l-5-5"],
  hint: ["M9 18h6", "M10 21h4", "M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.2.9 2V16h5.4v-.2c0-.8.3-1.5.9-2A6 6 0 0 0 12 3z"],
} as const;

export type IconName = keyof typeof PATHS;

export const icon = (name: IconName) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name].map((d) => `<path d="${d}"/>`).join("")}</svg>`;

/** A tool button on the paper: `data-<action>` is what the game listens for. */
export const tool = (action: string, label: string, name: IconName) =>
  `<button class="tool" data-${action} type="button" aria-label="${label}" title="${label}">${icon(name)}</button>`;
