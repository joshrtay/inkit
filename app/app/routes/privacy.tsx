// The privacy policy. Plain language; keep it true to what the site actually does (see the data
// it stores in app/db/schema.ts, and who processes it: Cloudflare, Google, Anthropic).
import { Link } from "react-router";
import type { Route } from "./+types/privacy";
import { CONTACT, UPDATED } from "~/lib/legal";
import { pageMeta } from "~/lib/seo";

export const meta: Route.MetaFunction = () => pageMeta({ title: "Privacy policy · inkit", description: "What inkit collects, why, and who it's shared with.", path: "/privacy" });

export default function Privacy() {
  return (
    <main className="wrap doc">
      <h1>Privacy policy</h1>
      <p className="muted">Last updated {UPDATED}</p>
      <p className="lead">inkit (inkit.games) is a site for making and playing hand-drawn logic puzzles. This explains what we collect, why, and what you can do about it. We don&rsquo;t sell your information or show ads.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your account:</strong> your name, email address, handle, and a scrambled (hashed) version of your password. If you sign in with Google, we get your name, email address and profile picture from Google, plus the sign-in tokens Google returns.</li>
        <li><strong>What you make:</strong> your puzzles, their titles and descriptions, the photos of drawings you upload (we keep only the part of each photo that shows the puzzle, without its location or other camera details), the studios you belong to, and who you subscribe to. Published puzzles, your profile, your subscriptions and your subscriber count are public.</li>
        <li><strong>Signing in:</strong> while you&rsquo;re signed in we keep a session, with the IP address and browser it came from, so we can keep you signed in and spot misuse.</li>
        <li><strong>In your browser:</strong> your progress on puzzles and settings like the light or dark theme are saved in your own browser (local storage). They stay on your device; we don&rsquo;t receive them.</li>
        <li><strong>Server logs:</strong> our host keeps short-lived technical logs of requests (such as IP address, page and time) to run and protect the site.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account, show your puzzles and profile, and build your Subscriptions feed.</li>
        <li>To read uploaded drawings into puzzles (see Anthropic below).</li>
        <li>To make reading drawings better: we keep a record of each reading (the puzzle's part of the photo, what Claude read, how long it took) and compare it with the puzzle you publish. We use these records to measure how well drawings are read and to improve it, which may include training or testing the software that reads drawings.</li>
        <li>To send emails you ask for, like a password reset link. We don&rsquo;t send marketing email.</li>
        <li>To keep the site working and safe.</li>
      </ul>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>Cloudflare</strong> hosts the site, its database and uploaded photos, and sends our emails.</li>
        <li><strong>Google</strong>, if you choose to sign in with Google.</li>
        <li><strong>Anthropic</strong> (the company behind Claude): when you upload a drawing, the photo, and any corrections you type, are sent to Anthropic&rsquo;s API so Claude can read the puzzle. Anthropic processes it under its commercial terms; it doesn&rsquo;t use API data to train its models.</li>
      </ul>
      <p>We share information with others only when the law requires it, or to protect people and the site.</p>

      <h2>Children</h2>
      <p>You need to be at least 13 to make an account. A parent or guardian can make and manage an account for a younger child, and is responsible for it. If you think a child under 13 has given us information without a parent, contact us and we&rsquo;ll delete it.</p>

      <h2>Your choices</h2>
      <ul>
        <li>You can change your name and profile, unpublish or take down your puzzles, and unsubscribe from anyone at any time.</li>
        <li>To get a copy of your information or delete your account, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Deleting an account removes your sign-in details and drafts; puzzles you published are taken offline.</li>
        <li>Clearing your browser&rsquo;s site data removes the progress saved there.</li>
      </ul>

      <h2>Keeping it safe and how long we keep it</h2>
      <p>Passwords are stored only as hashes, connections use HTTPS, and access to the database is limited. We keep your information while you have an account; sessions and reset links expire on their own, and server logs are short-lived.</p>

      <h2>Changes</h2>
      <p>If we change this policy we&rsquo;ll update the date above, and tell you on the site if the change is significant.</p>

      <h2>Contact</h2>
      <p>Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. See also the <Link to="/terms">terms of service</Link>.</p>
    </main>
  );
}
