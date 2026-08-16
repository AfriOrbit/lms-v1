/**
 * check-design.ts — keep the two registers from drifting apart.
 *
 * The whole design system rests on one rule: a component names a SEMANTIC
 * token, never a palette step. `text-[var(--accent)]` renders as deep blue in
 * the light public shell and as cyan in the dark application; `text-ion-400`
 * renders as cyan in both, which means it is invisible on white.
 *
 * That failure is quiet. The build passes, the page renders, and the text is
 * simply hard to read on one of the two surfaces — which is exactly the sort
 * of thing nobody notices until a learner mentions it. So it is a test.
 *
 * Run:  npx tsx scripts/check-design.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

let failed = 0;
let passed = 0;
const ok = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (cond) passed += 1;
  else failed += 1;
};

/*
 * `fileURLToPath(new URL('..', import.meta.url))`, not `import.meta.dirname`.
 *
 * `import.meta.dirname` was added in Node 20.11 and is only populated for real
 * ESM modules. Under a TypeScript runner that transpiles to CommonJS it is
 * silently `undefined` — not an error, just undefined — so `join(undefined, '..')`
 * throws ERR_INVALID_ARG_TYPE and, because this runs in `prebuild`, takes the
 * whole deployment with it. The URL form works under every loader.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}
const files = walk(join(root, 'src'));

/* -- no component may name a palette step --------------------------------- */

// `charts/index.tsx` is the one legitimate exception: an SVG fill cannot be a
// CSS variable that changes per surface AND be validated for colour-vision
// separation, so the categorical hues are literal and checked by the palette
// validator instead.
const PALETTE = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|decoration|outline)-(?:void|ion|ember|signal|alert)-\d+/g;
{
  const offenders: string[] = [];
  for (const f of files) {
    if (f.endsWith(join('components', 'charts', 'index.tsx'))) continue;
    const hits = readFileSync(f, 'utf8').match(PALETTE);
    if (hits) offenders.push(`${f.replace(root + '/', '')} → ${[...new Set(hits)].join(', ')}`);
  }
  ok(
    'no component hardcodes a palette step',
    offenders.length === 0,
    offenders.length ? offenders.slice(0, 6).join('; ') : `${files.length} files use semantic tokens only`,
  );
}

/* -- rectangular geometry ------------------------------------------------- */

// `rounded-full` survives deliberately: it is used for dots and avatars, which
// are circles rather than rounded rectangles. The negative lookahead for a
// letter keeps `roundedRect` — the SVG path helper that draws the 4px data-ends
// the chart spec requires — from reading as a Tailwind class.
const RADIUS = /\brounded(?![A-Za-z])(?:-(?:sm|md|lg|xl|2xl|3xl|t|b|l|r|tl|tr|bl|br)\b)?(?!-full)/g;
{
  const offenders: string[] = [];
  for (const f of files) {
    const hits = readFileSync(f, 'utf8').match(RADIUS);
    if (hits) offenders.push(`${f.replace(root + '/', '')} (${hits.length})`);
  }
  ok(
    'nothing has a border radius',
    offenders.length === 0,
    offenders.length ? offenders.slice(0, 6).join('; ') : 'rectangular throughout',
  );
}

/* -- no class list may contain a dangling variant prefix ------------------ */

// Stripping `rounded-lg` out of `focus:rounded-lg` leaves a bare `focus:`,
// which Tailwind ignores silently — no warning at build, no error at runtime,
// just a utility that quietly does nothing. One of these survived into the
// skip link. The lookahead is for a delimiter, so object keys like `sm:` and
// `active:` do not match.
{
  const DANGLING = /\b(?:hover|focus|focus-visible|group-hover|group-focus|active|disabled|first|last|odd|even|dark|motion-safe|motion-reduce):(?=[\s"'`])/;
  const offenders: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    text.split('\n').forEach((line, i) => {
      // Only class strings, so a TypeScript object literal cannot trip it.
      if (!/class(?:Name)?\s*=|cn\(|'[a-z-]+ /.test(line)) return;
      if (DANGLING.test(line)) offenders.push(`${f.replace(root + '/', '')}:${i + 1}`);
    });
  }
  ok(
    'no dangling variant prefix',
    offenders.length === 0,
    offenders.length ? offenders.join(', ') : 'every variant has a utility after it',
  );
}

/* -- literal white and black do not adapt --------------------------------- */

// `text-white` on `bg-[var(--accent)]` is fine on the light surface, where the
// accent is a deep blue, and unreadable on the dark one, where it is cyan —
// about 1.7:1. Four hand-rolled buttons had exactly that. `--accent-ink` is
// white on light and near-black on dark, which is what the token is for.
//
// The sandbox simulators are exempt: they draw their own fixed palette over a
// WebGL canvas that is dark in both registers.
{
  const offenders: string[] = [];
  for (const f of files) {
    if (f.includes(join('components', 'sandbox'))) continue;
    const text = readFileSync(f, 'utf8');
    if (/\btext-(?:white|black)\b/.test(text)) offenders.push(f.replace(root + '/', ''));
  }
  ok(
    'no literal text-white or text-black outside the sandbox',
    offenders.length === 0,
    offenders.length ? offenders.join(', ') : 'foregrounds all adapt to the surface',
  );
}

/* -- the two shells must both be wired ------------------------------------ */

// If `surface-dark` came off the app layout, every signed-in page would render
// in the light tokens — legible, but suddenly a different product from the one
// the learner signed into a moment ago.
const shells: [string, string][] = [
  ['src/app/layout.tsx', 'surface-light'],
  ['src/app/(app)/layout.tsx', 'surface-dark'],
  ['src/app/(admin)/layout.tsx', 'surface-dark'],
  ['src/app/(auth)/layout.tsx', 'surface-light'],
];
for (const [file, cls] of shells) {
  ok(`${file} opens a ${cls} shell`, readFileSync(join(root, file), 'utf8').includes(cls));
}

/* -- the tokens each shell promises must actually exist ------------------- */

{
  const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8');
  const required = [
    '--bg', '--bg-card', '--bg-hover', '--border', '--border-strong',
    '--text', '--text-muted', '--text-faint',
    '--accent', '--accent-hover', '--accent-ink', '--accent-line', '--accent-bg',
    '--good', '--good-line', '--good-bg',
    '--warn', '--warn-line', '--warn-bg',
    '--bad', '--bad-line', '--bad-bg',
    '--invert-bg', '--invert-fg',
  ];
  // Anchor on the RULE, not the first mention of the name — the first mention
  // is in the comment at the top of the file explaining what these classes do.
  const lightStart = css.indexOf(':root,');
  const darkStart = css.indexOf('.surface-dark {');
  const light = css.slice(lightStart, darkStart);
  const dark = css.slice(darkStart, css.indexOf('* {', darkStart));

  const missingLight = required.filter((t) => !light.includes(`${t}:`));
  const missingDark = required.filter((t) => !dark.includes(`${t}:`));
  ok('the light surface declares every token', missingLight.length === 0, missingLight.join(', '));
  ok('the dark surface declares every token', missingDark.length === 0, missingDark.join(', '));

  // A token declared on one surface and not the other inherits from whatever
  // is outside it — which is the light shell, so a dark page would silently
  // render one colour from the light palette.
  ok(
    'the two surfaces declare the SAME token set',
    missingLight.length === 0 && missingDark.length === 0,
    `${required.length} tokens on each`,
  );

  ok('the mono label class exists', css.includes('.t-label'));
  ok('the display and stat classes exist', css.includes('.t-display') && css.includes('.t-stat'));
  ok(
    'fonts are imported, not merely installed',
    css.includes('@fontsource-variable/inter') && css.includes('@fontsource/ibm-plex-mono'),
    'they were installed and never imported once, so the app ran in system fonts',
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
