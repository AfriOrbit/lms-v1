/**
 * check-routing.ts — the request gate, and the link to the other property.
 *
 * This file used to assert a two-hostname split inside one project: apex serves
 * the marketing site, subdomain serves the LMS. That split is gone — the
 * company site is its own deployment — so those assertions went with it, and
 * what remains is the part that still has teeth:
 *
 *   - no environment value can reach an HTTP header un-sanitised
 *   - "present" is not the same as "usable" for the Supabase URL
 *   - the cross-link back to the company site is well-formed and still rendered
 *
 * Each of these guards a failure that shipped at least once.
 *
 * Run:  npx tsx scripts/check-routing.ts
 */

import { readFileSync } from 'node:fs';

import { isUsableHttpUrl, publicEnv, publicEnvProblems } from '../src/lib/env';
import { LMS_HOST, LMS_URL, WEBSITE_LABEL, WEBSITE_URL } from '../src/lib/site-config';

let failed = 0;
let passed = 0;
const ok = (l: string, c: boolean, d = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${d ? `: ${d}` : ''}`);
  if (c) passed += 1;
  else failed += 1;
};

/* -- this application's own address -------------------------------------- */

ok('the LMS URL is https', LMS_URL.startsWith('https://'), LMS_URL);
ok('the LMS hostname is set', LMS_HOST.length > 0 && LMS_HOST.includes('.'), LMS_HOST);

/* -- the NEXT_PUBLIC_SITE_URL trap --------------------------------------- */

// `NEXT_PUBLIC_SITE_URL` means THIS application's origin. It is easy to read as
// "the company website" and set to the marketing apex, and the consequences are
// quiet: certificate verification URLs printed on issued certificates would
// point at a hostname with no /verify route, and Stripe would return buyers to
// a 404. The default derives from the LMS host so nobody has to get it right.
{
  const derived = publicEnv.siteUrl.replace(/^https?:\/\//, '').split(':')[0];
  ok('siteUrl has no trailing slash', !publicEnv.siteUrl.endsWith('/'), publicEnv.siteUrl);
  ok(
    'siteUrl is the LMS host or a local development origin',
    derived === LMS_HOST || derived === 'localhost' || Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    `${publicEnv.siteUrl} (LMS host is ${LMS_HOST})`,
  );
  ok(
    'siteUrl is not the company website',
    !derived.endsWith('afriorbit-website.vercel.app') && derived !== 'afriorbit.space',
    publicEnv.siteUrl,
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

/* -- the cross-link back to the company site ----------------------------- */

// The LMS and the marketing site are separate deployments, so the only route
// between them is a hardcoded-by-default URL. A typo here is a dead button on
// every page and nothing else in the build would notice.
{
  let parsed: URL | null = null;
  try {
    parsed = new URL(WEBSITE_URL);
  } catch {
    /* asserted below */
  }
  ok('WEBSITE_URL parses', parsed !== null, WEBSITE_URL);
  ok('WEBSITE_URL is https', parsed?.protocol === 'https:', WEBSITE_URL);
  ok('WEBSITE_URL is a bare origin', parsed ? WEBSITE_URL === parsed.origin : false, WEBSITE_URL);
  ok('the home button label is the agreed wording', WEBSITE_LABEL === 'AfriOrbit Home', WEBSITE_LABEL);

  // Pointing it at this deployment would make every "AfriOrbit Home" button a
  // link to the page you are already on.
  const host = parsed?.hostname ?? '';
  ok('WEBSITE_URL does not point back at the LMS', host !== LMS_HOST, host);

  const navSource = readFileSync(new URL('../src/components/site-nav.tsx', import.meta.url), 'utf8');
  ok('the public header renders the home link', navSource.includes('WEBSITE_URL'));
  // Matches an href ATTRIBUTE, not the bare string. The first version of this
  // check searched for the hostname anywhere in the file and then failed on the
  // comment explaining why the hostname had been removed — a check that fires
  // on its own documentation is worse than no check, because the next person
  // silences it.
  ok(
    'the footer no longer hardcodes an unserved hostname',
    !/href=["']https:\/\/(www\.)?afriorbit\.space/.test(navSource),
  );
  const appLayout = readFileSync(new URL('../src/app/(app)/layout.tsx', import.meta.url), 'utf8');
  ok('the signed-in shell renders the home link', appLayout.includes('WEBSITE_URL'));
}

/* -- the marketing site must not be servable from this project ------------ */

// The /www route group and the apex-rewrite branch were deleted so that
// attaching afriorbit.space to this project cannot silently serve a stale copy
// of the company site. If either comes back, this fails and says why.
{
  const proxySource = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  ok(
    'the proxy no longer rewrites a hostname to /www',
    !proxySource.includes('isWebsiteHost'),
    'the marketing site belongs to the website deployment, not this one',
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
