// Prints the fingerprint for an email allowed to sync (see src/data/cloud.ts › ALLOWED).
// Usage: node scripts/sync-email-hash.mjs you@example.com
import { createHash } from 'node:crypto';
const email = process.argv[2];
if (!email) { console.error('Usage: node scripts/sync-email-hash.mjs you@example.com'); process.exit(1); }
console.log(createHash('sha256').update(`ffp-sync:${email.trim().toLowerCase()}`).digest('hex'));
