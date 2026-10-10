// The terms of service, in plain language.
import { Link } from "react-router";
import type { Route } from "./+types/terms";
import { CONTACT, UPDATED } from "~/lib/legal";
import { pageMeta } from "~/lib/seo";

export const meta: Route.MetaFunction = () => pageMeta({ title: "Terms of service · inkit", description: "The rules for using inkit.", path: "/terms" });

export default function Terms() {
  return (
    <main className="wrap doc">
      <h1>Terms of service</h1>
      <p className="muted">Last updated {UPDATED}</p>
      <p className="lead">These terms cover using inkit (inkit.games). By using the site you agree to them. Our <Link to="/privacy">privacy policy</Link> explains how we handle your information.</p>

      <h2>Your account</h2>
      <ul>
        <li>You need to be at least 13 to make an account. A parent or guardian may make and manage an account for a younger child and is responsible for its use.</li>
        <li>Keep your sign-in details to yourself; you&rsquo;re responsible for what happens on your account.</li>
        <li>Pick a handle that isn&rsquo;t misleading or offensive, and don&rsquo;t pretend to be someone else.</li>
      </ul>

      <h2>Your puzzles</h2>
      <ul>
        <li>What you make is yours. By publishing a puzzle you let inkit host, display and share it on the site (for example in feeds and Explore), and let other people play it.</li>
        <li>Only upload drawings and puzzles you made or have the right to share. Puzzle types and their rules are free for anyone to use; someone else&rsquo;s particular puzzles, art and words aren&rsquo;t.</li>
        <li>Drawings you upload are read by an AI model (Claude, from Anthropic) to turn them into puzzles. Check what it reads before you publish: you&rsquo;re responsible for what you publish.</li>
      </ul>

      <h2>Be kind</h2>
      <p>Don&rsquo;t post anything illegal, hateful, harassing, sexual, or otherwise unsuitable for a site that children use. Don&rsquo;t try to break, overload or scrape the site, or get into accounts that aren&rsquo;t yours. We may take down puzzles or suspend accounts that break these rules.</p>

      <h2>The site</h2>
      <ul>
        <li>inkit is provided as it is. We work to keep it running and your work safe, but we can&rsquo;t promise it will always be available or free of mistakes, and features may change.</li>
        <li>To the extent the law allows, we aren&rsquo;t liable for indirect losses from using the site, such as lost work or time.</li>
        <li>You can stop using inkit and ask us to delete your account at any time.</li>
      </ul>

      <h2>Changes</h2>
      <p>We may update these terms; we&rsquo;ll change the date above and tell you on the site if the change is significant. Using inkit after a change means you accept it.</p>

      <h2>Contact</h2>
      <p><a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
    </main>
  );
}
