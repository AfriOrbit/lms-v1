<#
    replace-repo.ps1 — make github.com/AfriOrbit/lms-v1 contain exactly the
    clean codebase, and nothing else.

    Run this ONCE, from anywhere. It does not care what state your existing
    folders are in, because it does not use them: it clones the repo fresh from
    GitHub into a temporary directory, empties it, copies the clean tree in,
    builds it, and pushes only if the build passed.

    WHAT IT PROTECTS
      - Before touching anything it pushes a tag `pre-reset-<timestamp>` at the
        current commit. Every file you have today stays recoverable forever:
            git show pre-reset-<timestamp>:path/to/file
      - It never force-pushes. History is preserved; this is one ordinary
        commit that happens to delete a lot and add a lot.
      - It runs `npm run build` BEFORE committing. A tree that cannot build
        never reaches GitHub, so Vercel cannot fail on it.
      - It refuses to commit a .env file, and tells you to rotate keys if one
        was ever tracked.

    USAGE
      1. Unzip AfriOrbit-clean.zip somewhere, e.g. C:\dev\clean
         Find the folder that directly contains package.json.
      2. Run:

         powershell -ExecutionPolicy Bypass -File .\replace-repo.ps1 `
             -CleanTree "C:\dev\clean\afriorbit-lms"

      Add -DryRun to see exactly what would change without pushing anything.
#>

param(
    [Parameter(Mandatory = $true)][string]$CleanTree,
    [string]$RepoUrl  = 'https://github.com/AfriOrbit/lms-v1.git',
    [string]$Branch   = 'main',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
function Step($n, $m) { Write-Host "`n[$n] $m" -ForegroundColor Cyan }
function Ok($m)       { Write-Host "    OK   $m" -ForegroundColor Green }
function Note($m)     { Write-Host "    ..   $m" -ForegroundColor DarkGray }
function Warn($m)     { Write-Host "    !!   $m" -ForegroundColor Yellow }
function Die($m)      { Write-Host "`nSTOPPED: $m`n" -ForegroundColor Red; exit 1 }

# --------------------------------------------------------------------------
Step 1 'Checking the clean tree'

if (-not (Test-Path $CleanTree)) { Die "No such folder: $CleanTree" }
$CleanTree = (Resolve-Path $CleanTree).Path

if (-not (Test-Path (Join-Path $CleanTree 'package.json'))) {
    # The most common mistake by a distance: pointing at the zip's outer folder.
    $inner = Get-ChildItem $CleanTree -Directory |
             Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } |
             Select-Object -First 1
    if ($inner) { Die "No package.json in $CleanTree, but there is one in:`n         $($inner.FullName)`n         Re-run with -CleanTree pointing there." }
    Die "No package.json anywhere in $CleanTree. Is that the unzipped codebase?"
}

# A few files that must exist, and one that must be complete. If the zip was
# unpacked partially, this is where it gets caught — not after the repo is empty.
foreach ($f in @('src/proxy.ts', 'src/content/curriculum.ts', 'src/app/layout.tsx', 'next.config.ts')) {
    if (-not (Test-Path (Join-Path $CleanTree $f))) { Die "Clean tree is missing $f" }
}
$exports = (Select-String -Path (Join-Path $CleanTree 'src/lib/utils.ts') -Pattern '^export' | Measure-Object).Count
if ($exports -lt 8) { Die "The clean tree's src/lib/utils.ts has only $exports exports; it should have 8. Re-unzip." }
Ok "clean tree looks complete ($exports exports in utils.ts)"

# --------------------------------------------------------------------------
Step 2 'Cloning the repo fresh'

$work = Join-Path $env:TEMP ("lms-reset-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
git clone --quiet $RepoUrl $work
if ($LASTEXITCODE -ne 0) { Die "Clone failed. Check your GitHub sign-in and that you can reach $RepoUrl" }
Push-Location $work
try {
    # Do NOT swallow this. If the branch does not exist — a repo whose default
    # is `master`, or a typo in -Branch — a silently-ignored failure leaves the
    # script on an unborn HEAD, and it would go on to "empty the repo" and push
    # to a branch nobody is watching. Fail here instead.
    git checkout --quiet $Branch 2>$null
    if ($LASTEXITCODE -ne 0) {
        $available = (git branch -r | ForEach-Object { $_.Trim() -replace '^origin/', '' }) -join ', '
        Die "Branch '$Branch' does not exist in $RepoUrl.`n         Available: $available`n         Re-run with -Branch <name>."
    }
    $current = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($current -ne $Branch) { Die "Expected to be on '$Branch' but git says '$current'." }
    $head = (git rev-parse --short HEAD).Trim()
    Ok "cloned $RepoUrl at $head"
    Note "working in $work"

    # ----------------------------------------------------------------------
    Step 3 'Tagging the current state so nothing is lost'

    $tag = "pre-reset-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    git tag $tag
    if (-not $DryRun) {
        git push --quiet origin $tag
        if ($LASTEXITCODE -ne 0) { Die "Could not push the safety tag. Stopping before changing anything." }
        Ok "pushed tag $tag  — recover any old file with:  git show ${tag}:path/to/file"
    } else {
        Note "DRY RUN: would push tag $tag"
    }

    # ----------------------------------------------------------------------
    Step 4 'Emptying the repo'

    if (git ls-files --error-unmatch .env 2>$null) {
        Warn ".env was committed to this repo. Removing it."
        Warn "If it ever held real Supabase keys, ROTATE THEM — git history keeps them."
    }
    # Delete everything tracked. .git survives because it is excluded here.
    Get-ChildItem -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
    Ok "all files removed"

    # ----------------------------------------------------------------------
    Step 5 'Copying the clean tree in'

    Get-ChildItem -Path $CleanTree -Force |
        Where-Object { $_.Name -notin @('node_modules', '.next', '.git', '.vercel', '.env', '.env.local') } |
        Copy-Item -Destination . -Recurse -Force
    Ok "clean tree copied"

    if (Test-Path '.env') { Remove-Item '.env' -Force; Warn "removed a stray .env from the copy" }

    git add -A
    $changes = git status --porcelain
    if (-not $changes) {
        Ok "the repo already matched the clean tree — nothing to do"
        Pop-Location; Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
        exit 0
    }
    $d = ($changes | Where-Object { $_ -match '^D ' }).Count
    $a = ($changes | Where-Object { $_ -match '^A ' }).Count
    $m = ($changes | Where-Object { $_ -match '^M ' }).Count
    Ok "$d deleted, $a added, $m modified"

    # ----------------------------------------------------------------------
    Step 6 'Building — nothing is pushed unless this passes'

    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Die "npm install failed. The repo on GitHub is UNCHANGED." }

    # No Supabase values are set here on purpose. This app is designed to build
    # without them and show /setup at runtime; if the build needed secrets, that
    # would itself be the bug.
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n  The build failed HERE, on your machine, with the full error above." -ForegroundColor Red
        Write-Host "  GitHub and Vercel are UNCHANGED. Nothing broken was pushed." -ForegroundColor Red
        Write-Host "  Send me the error text above and I will fix it.`n" -ForegroundColor Yellow
        Die "build failed"
    }
    Ok "build succeeded — this exact tree will build on Vercel"

    # ----------------------------------------------------------------------
    Step 7 'Pushing'

    if ($DryRun) {
        Write-Host "`nDRY RUN — nothing pushed. Changes that would be made:`n" -ForegroundColor Yellow
        git status --short | Select-Object -First 40
        Pop-Location
        Write-Host "`nInspect the prepared tree at: $work`n"
        exit 0
    }

    git -c user.name="AfriOrbit" -c user.email="noreply@afriorbit.space" `
        commit --quiet -m "Replace repository contents with verified codebase

Build was run locally before this commit and exited 0.
Previous state is preserved at tag $tag."
    git push origin $Branch
    if ($LASTEXITCODE -ne 0) { Die "Push failed — check your GitHub credentials. Local work is at $work" }

    $new = (git rev-parse --short HEAD).Trim()
    Ok "pushed $new to $Branch"

    Write-Host "`n=======================================================" -ForegroundColor Green
    Write-Host " Repo replaced. Vercel will build commit $new" -ForegroundColor Green
    Write-Host "=======================================================`n" -ForegroundColor Green
    Write-Host " Old state:  git show ${tag}:path/to/file" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host " STILL TO DO — the only thing left:" -ForegroundColor Yellow
    Write-Host "   Set these in Vercel, all three environments ticked:" -ForegroundColor Yellow
    Write-Host "     NEXT_PUBLIC_SUPABASE_URL   = https://gqobaozemkhcsoiecazp.supabase.co"
    Write-Host "     NEXT_PUBLIC_SUPABASE_ANON_KEY   (anon / publishable key)"
    Write-Host "     SUPABASE_SERVICE_ROLE_KEY       (service_role / secret key)"
    Write-Host "     IP_HASH_SALT                    (any long random string)"
    Write-Host "     NEXT_PUBLIC_SITE_HOST      = afriorbit.space"
    Write-Host "     NEXT_PUBLIC_LMS_HOST       = develop.afriorbit.space"
    Write-Host "   then redeploy with 'Use existing Build Cache' UNTICKED." -ForegroundColor Yellow
    Write-Host ""
    Write-Host " Confirm with /api/health — deployment.commit should read $new`n" -ForegroundColor Yellow
}
finally {
    if ((Get-Location).Path -eq $work) { Pop-Location }
}
