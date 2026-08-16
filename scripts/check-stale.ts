/**
 * check-stale.ts — catch files that were deleted here but not in the repo.
 *
 * WHY THIS EXISTS
 *
 * Uploading a folder through the GitHub web interface ADDS and OVERWRITES. It
 * does not delete. So a release that removes files lands as a half-merge: the
 * new code arrives, the deleted code stays, and the two disagree.
 *
 * That happened with the /www marketing pages. `src/lib/site-config.ts` was
 * replaced with a version that no longer exports `SITE_URL`, but
 * `src/app/(website)/www/[[...slug]]/page.tsx` was still in the repository
 * importing it, and the deployment failed with:
 *
 *     Error: Export SITE_URL doesn't exist in target module
 *
 * Which is true, and useless. It points at the new file for not having an
 * export rather than at the old file for still existing, so the obvious next
 * move — add SITE_URL back — is exactly wrong.
 *
 * This runs in `prebuild`, which npm invokes before `build`, which is what
 * Vercel runs. So it fires on the hosting platform too, and it says what
 * actually happened.
 *
 * Run:  npx tsx scripts/check-stale.ts
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

/**
 * Paths deliberately removed. Each one, if present, is a leftover from an
 * incomplete upload — not something a future change should reintroduce.
 */
const REMOVED: { path: string; why: string }[] = [
  {
    path: 'src/app/(website)',
    why: 'the vendored marketing site — it is now its own deployment (afriorbit-web)',
  },
  {
    path: 'src/content/site-pages.ts',
    why: 'nine pages of vendored HTML that belonged to the old /www route group',
  },
  {
    path: 'scripts/import-site.mjs',
    why: 'imported the marketing site into this repo; there is nothing to import into',
  },
  { path: 'public/site', why: 'the marketing site’s simulator bundle' },
  { path: 'public/afriorbit-sims.js', why: 'an orphaned duplicate of that bundle' },
  { path: 'MIGRATION.md', why: 'replaced by DEPLOY.md' },
  { path: 'reset-to-clean.ps1', why: 'superseded; the deploy path is git, not a script' },
  { path: 'replace-repo.ps1', why: 'superseded; the deploy path is git, not a script' },
];

const found = REMOVED.filter((r) => existsSync(join(root, r.path)));

if (found.length === 0) {
  console.log(`PASS  no stale files (${REMOVED.length} removed paths all absent)`);
  process.exit(0);
}

console.error(`
STALE FILES IN THIS TREE — the build would fail with a confusing error.

These were deleted in the current release, but they are still here. Almost
always this means the repository was updated by uploading files rather than by
pushing a commit: uploading adds and overwrites, it never deletes.
`);
for (const r of found) {
  console.error(`  ${r.path}\n      ${r.why}`);
}
console.error(`
FIX — make the repository match exactly, from inside the extracted release:

    git add -A
    git commit -m "Remove superseded files"
    git push

or delete the paths listed above through the GitHub interface
(Add file → ... → Delete directory / Delete file), then redeploy.
`);
process.exit(1);
