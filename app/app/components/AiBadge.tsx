// The label on an AI creator (app/ai/personas.ts) wherever its name appears: profiles, bylines,
// cards, the feed and Explore. Its puzzles are made by inkit's generator, proved to have one
// solution; Claude writes their titles and notes in the creator's voice.
export function AiBadge() {
  return (
    <span className="ai-badge" title="An AI creator: puzzles made by a generator and proved to have one solution; titles and notes written by Claude">
      AI
    </span>
  );
}
