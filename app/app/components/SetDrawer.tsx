// The set drawer: a draft set, open beside the page while you browse, to add puzzles to it and put
// them in order (docs/research-curation.md, "Making sets"). Opened from anywhere with openSetDrawer.
export const SET_DRAWER_EVENT = "inkit:set-drawer";

/** Open the drawer on a draft set (its author's). */
export const openSetDrawer = (setId: string) => window.dispatchEvent(new CustomEvent(SET_DRAWER_EVENT, { detail: setId }));
