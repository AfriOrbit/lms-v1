/**
 * check-routing.ts — assert the two-hostname split.
 *
 * One Vercel project serves the marketing site on the apex and the LMS on a
 * subdomain, and the whole split hinges on one predicate. Getting it wrong is
 * not a subtle bug: too loose and the LMS subdomain serves the marketing site
 * (nobody can log in), too tight and the apex serves the LMS (the company
 * website disappears). Neither would be caught by a type check.
 *
 * Run:  npx tsx scripts/check-routing.ts
 */

import { SITE_PAGES, getSitePage } from '../src/content/site-pages';
import { isUsableHttpUrl, publicEnv, publicEnvProblems } from '../src/lib/env';
import { LMS_HOST, LMS_URL, SITE_HOST, SITE_URL, isWebsiteHost } from '../src/lib/site-config';

let failed = 0;
let passed = 0;
const ok = (l: string, c: boolean, d = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${d ? `: ${d}` : ''}`);
  if (c) passed += 1;
  else failed += 1;
};

/* -- the predicate ------------------------------------------------------- */

for (const host of [SITE_HOST, `www.${SITE_HOST}`, `${SITE_HOST}:443`, SITE_HOST.toUpperCase()]) {
  ok(`"${host}" is the marketing site`, isWebsiteHost(host));
}

for (const host of [
  LMS_HOST,
  `www.${LMS_HOST}`,
  'afriorbit-lms.vercel.app',
  'localhost:3000',
  '127.0.0.1:3000',
  // A lookalike registered by someone else must NOT be treated as ours.
  'afriorbit.space.evil.test',
  'notafriorbit.space',
  '',
]) {
  ok(`"${host || '(empty)'}" is NOT the marketing site`, !isWebsiteHost(host));
}
ok('null host is not the marketing site', !isWebsiteHost(null));
ok('undefined host is not the marketing site', !isWebsiteHost(undefined));

/* -- the two hostnames must actually differ ------------------------------ */

ok('the site and LMS hostnames are different', SITE_HOST !== LMS_HOST, `${SITE_HOST} vs ${LMS_HOST}`);
ok('the LMS is a subdomain of the site', LMS_HOST.endsWith(`.${SITE_HOST}`), LMS_HOST);
ok('URLs are https', SITE_URL.startsWith('https://') && LMS_URL.startsWith('https://'));

/* -- the NEXT_PUBLIC_SITE_URL trap --------------------------------------- */

// `NEXT_PUBLIC_SITE_URL` means this application's origin (the LMS); the
// similarly-named `NEXT_PUBLIC_SITE_HOST` means the marketing apex. Two names
// that read alike and mean opposite things is a trap, so the default is
// derived from the LMS host and this asserts it stayed that way. Setting it to
// the marketing apex would print dead verification URLs onto issued
// certificates and return Stripe buyers to a 404 — both silent.
{
  const derived = publicEnv.siteUrl.replace(/^https?:\/\//, '').split(':')[0];
  ok(
    'siteUrl points at the LMS, never at the marketing apex',
    derived !== SITE_HOST && derived !== `www.${SITE_HOST}`,
    publicEnv.siteUrl,
  );
  ok(
    'siteUrl has no trailing slash',
    !publicEnv.siteUrl.endsWith('/'),
    publicEnv.siteUrl,
  );
  ok(
    'siteUrl is the LMS host or a local development origin',
    derived === LMS_HOST || derived === 'localhost' || Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    `${publicEnv.siteUrl} (LMS host is ${LMS_HOST})`,
  );
}

/* -- no environment value may reach a header un-sanitised ---------------- */

// A trailing newline on NEXT_PUBLIC_SUPABASE_URL once made `Headers.set` throw
// on the CSP, 500ing every route while the build passed. The proxy now derives
// `new URL(...).origin`, which cannot contain whitespace. This asserts that
// property directly against values designed to break it.
{
  const hostile = [
    'https://x.supabase.co\n',
    'https://x.supabase.co\r\n',
    '  https://x.supabase.co  ',
    'https://x.supabase.co\u0000',
    'not a url at all',
    '',
  ];
  const originOf = (raw: string): string => {
    try {
      return new URL(raw.trim()).origin;
    } catch {
      return '';
    }
  };
  const leaked = hostile.filter((raw) => /[\s\u0000-\u001f]/.test(originOf(raw)));
  ok(
    'a mangled Supabase URL never produces an unsafe header value',
    leaked.length === 0,
    leaked.length ? `these survived: ${JSON.stringify(leaked)}` : 'newlines, padding and control chars all neutralised',
  );
  ok(
    'a well-formed URL still yields its origin',
    originOf('https://gqobaozemkhcsoiecazp.supabase.co/') === 'https://gqobaozemkhcsoiecazp.supabase.co',
    originOf('https://gqobaozemkhcsoiecazp.supabase.co/'),
  );
  ok('an unparseable URL yields empty, not garbage', originOf('nonsense') === '');
}

/* -- present is not the same as usable ----------------------------------- */

// The production failure this guards against, in full:
//
//   Error running the exported Web Handler:
//   Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
//
// NEXT_PUBLIC_SUPABASE_URL was SET — so the emptiness check in the proxy
// passed — but it was not a parseable http(s) URL, so the very next line threw
// inside createServerClient. The proxy runs on every matched route, so that was
// a 500 on every page including /setup, the page whose only job is to explain
// this. Every value below is a real way to get that wrong.
{
  const rejected = [
    'gqobaozemkhcsoiecazp.supabase.co',            // hostname copied from the address bar
    'gqobaozemkhcsoiecazp',                        // the project ref alone
    '"https://gqobaozemkhcsoiecazp.supabase.co"',  // quotes included in the paste
    'https:// gqobaozemkhcsoiecazp.supabase.co',   // a space after the scheme
    'postgresql://db.gqobaozemkhcsoiecazp.supabase.co:5432/postgres', // the DB connection string
    'HTTPS//gqobaozemkhcsoiecazp.supabase.co',     // missing colon
    '',
  ];
  const slipped = rejected.filter((v) => isUsableHttpUrl(v));
  ok(
    'an unusable Supabase URL is rejected before it reaches the SDK',
    slipped.length === 0,
    slipped.length ? `these were accepted: ${JSON.stringify(slipped)}` : `${rejected.length} paste mistakes caught`,
  );

  const accepted = [
    'https://gqobaozemkhcsoiecazp.supabase.co',
    'https://gqobaozemkhcsoiecazp.supabase.co/',
    'http://localhost:54321',
    'http://127.0.0.1:54321',
  ];
  const wronglyRejected = accepted.filter((v) => !isUsableHttpUrl(v));
  ok(
    'a legitimate Supabase URL is still accepted',
    wronglyRejected.length === 0,
    wronglyRejected.length ? `wrongly rejected: ${JSON.stringify(wronglyRejected)}` : 'production and local both fine',
  );

  // The property that actually matters: whatever publicEnvProblems() reports
  // as clean must be something the SDK will accept. If this ever diverges the
  // gate is decorative.
  const clean = publicEnvProblems().length === 0;
  ok(
    'a config reported as clean yields a URL the SDK would accept',
    !clean || isUsableHttpUrl(publicEnv.supabaseUrl),
    clean ? publicEnv.supabaseUrl || '(none)' : 'config reports problems, nothing to assert',
  );
}

/* -- the rewrite the proxy performs -------------------------------------- */

/** Mirrors the rewrite in src/proxy.ts. Kept in step by the checks below. */
function rewrite(pathname: string): string {
  if (pathname.startsWith('/www')) return pathname;
  return pathname === '/' ? '/www' : `/www${pathname}`;
}

ok('apex / maps to /www', rewrite('/') === '/www', rewrite('/'));
ok('apex /rocketry maps to /www/rocketry', rewrite('/rocketry') === '/www/rocketry');
ok('the rewrite is idempotent', rewrite(rewrite('/edusat')) === '/www/edusat');
ok('a already-prefixed path is untouched', rewrite('/www/missions') === '/www/missions');

/* -- every marketing route resolves -------------------------------------- */

for (const page of SITE_PAGES) {
  const viaRewrite = rewrite(page.path).replace(/^\/www/, '') || '/';
  ok(`${page.path} survives the rewrite and resolves`, getSitePage(viaRewrite)?.path === page.path, viaRewrite);
}
ok('nine marketing pages', SITE_PAGES.length === 9, `${SITE_PAGES.length}`);
ok('there is a home page', Boolean(getSitePage('/')));
ok('an unknown path resolves to nothing', getSitePage('/does-not-exist') === undefined);
ok('page paths are unique', new Set(SITE_PAGES.map((p) => p.path)).size === SITE_PAGES.length);
ok(
  'every page has a title and description',
  SITE_PAGES.every((p) => p.title.length > 10 && p.description.length > 20),
);
ok(
  'no marketing title claims to be the LMS',
  SITE_PAGES.every((p) => !/AfriOrbit Learning/i.test(p.title)),
);

/* -- LMS paths must not be shadowed by a marketing page ------------------ */

// If someone ever adds a marketing page at one of these, the apex would keep
// working but the path would become ambiguous to a reader and to search
// engines. Cheap to assert, and the failure mode is confusing.
for (const reserved of ['/catalog', '/dashboard', '/login', '/learn', '/admin', '/account', '/labs']) {
  ok(`no marketing page shadows ${reserved}`, getSitePage(reserved) === undefined);
}

/* -- the vendored HTML must stay inert ----------------------------------- */

// The pages render through dangerouslySetInnerHTML. scripts/import-site.mjs
// refuses to write executable content, but that check only runs at import
// time; this one runs on every verify, so a hand-edit to the generated file
// cannot slip through.
for (const page of SITE_PAGES) {
  const bad = [/<script\b/i, /<iframe\b/i, /\son[a-z]+\s*=/i, /javascript:/i].find((re) => re.test(page.html));
  ok(`${page.path} contains no executable markup`, !bad, bad ? `matched ${bad}` : '');
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
