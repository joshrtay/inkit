// The sketchpad's chrome icons (components/Sketchpad.tsx): simple line icons on a 24-unit box, in
// the same stroke as the Shell's nav icons (shell.css .nav-icon: round caps, 1.8 wide).
const PATHS = {
  grid: ["M4 4h16v16H4z", "M9.33 4v16", "M14.67 4v16", "M4 9.33h16", "M4 14.67h16"],
  pen: ["M4.5 19.5l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.7 18.5z", "M13.8 7l3.2 3.2"],
  line: ["M5.5 18.5l13-13", "M5.5 20.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z", "M18.5 7.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"],
  wash: ["M12 3.5c3.4 4 6 7.3 6 10.3a6 6 0 0 1-12 0c0-3 2.6-6.3 6-10.3z", "M9.2 14.6a2.9 2.9 0 0 0 2.4 2.6"],
  stamp: ["M9.5 3.5h5v3.2a2 2 0 0 1-.9 1.7l-.6.4V12h4.5a2 2 0 0 1 2 2v2.5h-15V14a2 2 0 0 1 2-2H11V8.8l-.6-.4a2 2 0 0 1-.9-1.7z", "M5.5 20.5h13"],
  text: ["M5 7V4.5h14V7", "M12 4.5v15", "M9 19.5h6"],
  erase: ["M8.5 20h11", "M4.9 13.9l8.5-8.5a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8L10.4 18.8a2 2 0 0 1-1.4.6H7.7a2 2 0 0 1-1.4-.6l-1.4-1.4a2 2 0 0 1 0-2.8z", "M9 9.8l5.2 5.2"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  redo: ["M15 14l5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  clear: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
  magnet: ["M5 4h4.5v8a2.5 2.5 0 0 0 5 0V4H19v8a7 7 0 0 1-14 0z", "M5 8.5h4.5", "M14.5 8.5H19"],
  straight: ["M4 20L20 4", "M4 12h3", "M17 12h3", "M12 4v3", "M12 17v3"],
  rotate: ["M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9", "M19.5 4v5h-5"],
  zoomIn: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4", "M8 11h6", "M11 8v6"],
  zoomOut: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4", "M8 11h6"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  palette: ["M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.1-.9-1.5-.9-2.5 0-1 .8-1.6 1.8-1.6h2.1a3.7 3.7 0 0 0 3.7-3.7c0-4.2-3.8-7.5-8.5-7.5z",
    "M7.8 12.2h.01", "M9.7 8h.01", "M14.3 8h.01"],
} as const;

export type SpIconName = keyof typeof PATHS;

export const SpIcon = ({ name }: { name: SpIconName }) => (
  <svg className="sp-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{PATHS[name].map((d) => <path key={d} d={d} />)}</svg>
);
