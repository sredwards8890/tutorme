// Mints two long-lived LiveKit tokens and prints a private join link for each person.
// Run with: npm run mint   (reads app/.env, falling back to spike/.env)
import { AccessToken } from "livekit-server-sdk";

const url = process.env.LIVEKIT_URL;
const key = process.env.LIVEKIT_API_KEY;
const secret = process.env.LIVEKIT_API_SECRET;
const room = process.env.ROOM ?? "tutorme";
const base = (process.env.BASE_URL ?? "http://localhost:5180").replace(/\/$/, "");

if (!url || !key || !secret) {
  console.error("Missing LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET (see .env.example)");
  process.exit(1);
}

// Identities are load-bearing: the app derives the role (who shares, who saves snapshots) from them.
const people = [
  { identity: "tutor", name: "Tutor" },
  { identity: "student", name: "Student" },
];

for (const p of people) {
  const at = new AccessToken(key, secret, { identity: p.identity, name: p.name, ttl: "365d" });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  const jwt = await at.toJwt();
  // Token goes in the URL fragment so it is never sent to the static host's logs.
  const link = `${base}/#url=${encodeURIComponent(url)}&token=${encodeURIComponent(jwt)}`;
  console.log(`\n${p.name} (${p.identity}), valid 365 days:\n${link}`);
}
console.log("\nSend each link privately to its owner. Re-run to rotate.");
