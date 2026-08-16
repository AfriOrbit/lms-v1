# Deploying the LMS

Short version: this tree builds clean with no environment variables at all, and
shows `/setup` at runtime until you give it Supabase. Get the files in first,
confirm the build, then configure.

Full operational detail — Supabase project creation, the auth hook, Stripe — is
in `docs/DEPLOYMENT.md`. This file is about getting from a zip to a green
deployment.

---

## 1. Get the files into the repo

`package.json` must be at the **root of the repository**, not inside a folder.

```
✅ CORRECT                          ❌ WRONG
repo/                               repo/
├── package.json                    └── afriorbit-lms/
├── next.config.ts                      ├── package.json
├── src/                                └── src/
└── supabase/
```

If it looks like the right-hand column, Vercel finds no Next.js app at the root.
The build finishes in milliseconds, publishes nothing, and every route returns
`404: NOT_FOUND`. This zip extracts **flat** so that cannot happen — the files
come out at the top level with no wrapper folder.

Command line is more reliable than the GitHub web uploader, which silently skips
dotfiles (you would lose `.gitignore` and `.github/`) and occasionally drops
files from a large multi-folder drag. From inside the extracted folder:

```bash
git init
git add -A
git commit -m "AfriOrbit LMS"
git branch -M main
git remote add origin https://github.com/AfriOrbit/lms-v1.git
git push -u origin main --force
```

After pushing, confirm `src/lib/utils.ts` and `supabase/migrations/` are both
present in the repo. Those are the two things whose absence produces the most
confusing errors.

## 1b. Deleting is not automatic — read this if you upload rather than push

**Uploading files to GitHub adds and overwrites. It never deletes.**

This release removes files. If you upload the new ones on top of the old repo,
the deleted ones stay, and the tree becomes a half-merge: new code next to old
code that references things the new code no longer exports. The build then fails
with a message that points at the wrong file, e.g.

    Error: Export SITE_URL doesn't exist in target module

which is true, and useless — the fault is not that `site-config.ts` lost an
export, it is that a file which should have been deleted is still importing it.

`npm run build` now runs `check:stale` first and says so in plain words, on
Vercel as well as locally. But the cure is to make the repository match:

**These paths must not exist in the repo.** They were removed with the
marketing site, which is its own deployment now.

```
src/app/(website)/          ← the /www route group
src/content/site-pages.ts
scripts/import-site.mjs
public/site/
public/afriorbit-sims.js
public/file.svg  public/globe.svg  public/next.svg
public/vercel.svg  public/window.svg
MIGRATION.md
reset-to-clean.ps1
replace-repo.ps1
```

Pushing with git handles all of it in one step, which is why it is the
recommended route:

```bash
git add -A          # stages deletions as well as additions
git commit -m "Restyle and remove the vendored marketing site"
git push
```

Through the web interface you have to delete each one by hand: open the folder
or file → **⋯** → **Delete directory** / **Delete file** → commit.

## 2. Vercel project settings

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** — if it says "Other", the build will do nothing |
| Root Directory | *(blank)* |
| Build Command | Override **off** |
| Output Directory | Override **off** |
| Install Command | Override **off** |
| Node.js Version | 20.x or later — leave at the default |

A correct build takes **1–2 minutes** and ends with a `Route (app)` table
listing 42 routes. A build that finishes in under a second built nothing:
Framework Preset or an Output Directory override is wrong.

Do **not** add an `engines` field to `package.json`. It silently overrides the
Node version chosen in Project Settings.

**Do not attach afriorbit.space to this project.** That hostname belongs to the
website deployment.

## 3. Environment variables

All three environments ticked — Production, Preview, Development.

| Variable | Value | Read at |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://gqobaozemkhcsoiecazp.supabase.co` | build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → `anon` / publishable | build |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` / secret | runtime |
| `IP_HASH_SALT` | any long random string — `openssl rand -hex 32` | runtime |
| `NEXT_PUBLIC_LMS_HOST` | `develop.afriorbit.space` | build |
| `NEXT_PUBLIC_WEBSITE_URL` | `https://afriorbit-website.vercel.app` | build |

Optional: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MFA_POLICY`,
`REGISTRATION_MODE`, `EMBED_ALLOWED_ORIGINS`.

Do **not** set `NEXT_PUBLIC_SITE_URL` unless you know why. It means *this
application's* origin, not the company site's, and it derives itself correctly
from `NEXT_PUBLIC_LMS_HOST`. Setting it to the marketing site prints dead
verification URLs onto issued certificates and returns Stripe buyers to a 404 —
both silent failures.

The Supabase URL must be a **bare origin**: `https://<ref>.supabase.co`. Not the
bare hostname, not the dashboard link, not the database connection string. A
present-but-unparseable value used to 500 every route; it now redirects to
`/setup`, which prints the value it actually received.

`NEXT_PUBLIC_` variables are compiled in at build time. After changing one,
redeploy with **"Use existing Build Cache" unticked** or the old value stays
baked in.

## 4. Supabase, once the app is up

1. Apply the twelve migrations in `supabase/migrations/`, in filename order, via
   the SQL editor.
2. Authentication → Hooks → **Customize Access Token** → enable
   `public.custom_access_token_hook`. Without it every account reads as a
   pending learner and the dashboard is unreachable.
3. Authentication → URL Configuration → Site URL and Redirect URLs must include
   the LMS hostname, or sign-in fails after the email round trip.

`/api/health` reports on all of this: 200 with `"ok": true` when the
configuration is complete, 503 with a `blocking` list when it is not.

## 5. When something breaks

A green build with a broken page is a **runtime** problem, and build logs cannot
show you one.

The app no longer serves a bare "Internal Server Error". It renders **"This page
could not be rendered"** with an **Error reference** — an 8–10 digit digest.
Take that digest to:

```
Deployments → (the deployment) → Runtime Logs      ← not "Build Logs"
```

and search for it, or for `AFRIORBIT_SERVER_ERROR`. Every server-side failure
writes one line in that form followed by the full stack. Open the logs first,
then reload the broken page — Runtime Logs only stream live.

| Symptom | Cause |
|---|---|
| Every route 404, build took under a second | Framework Preset / Output Directory |
| Redirected to `/setup` | A required variable is absent or malformed; the page names it |
| `/api/health` returns 503 | Read its `blocking` array and `nextStep` |
| Dashboard shows a red "schema has not been applied" banner | Migrations were never run |
| Signed in but bounced to `/account/mfa` forever | The access-token hook is not enabled |

---

## Verifying locally before you push

```bash
npm install
npm run verify
```

`verify` runs typecheck, lint, five check suites and a production build. The
check suites assert things a type check cannot: that `src/lib/utils.ts` still
exports all eight symbols shadcn likes to delete, that no environment value can
reach an HTTP header un-sanitised, that the cross-link to the company site is a
well-formed origin and still rendered in the header, that no debug route is
about to ship, that no component hardcodes a palette step or a border radius or
a literal `text-white` (all three break one of the two surfaces), and that the
physics in the simulators still agrees with the closed-form answers.
