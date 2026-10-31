# H88CRO handover: move the project to a new GitHub and run releases

This is for the person taking over the code, builds and updates. It takes about 30 minutes.

## What you are getting

- **The code**, with its full history (`h88cro.bundle`, or the GitHub repository `RNikola/h88cro`).
- **The product brief** (`BRIEF.md`): what the app is meant to do, phase by phase.
- **No secrets.** The repository and the installers contain no keys or passwords, and none are needed to build or release. The CI scans every commit and every installer for secrets (gitleaks + `scripts/scan-asar.mjs`).

### Accesses: what exists and where it lives

| Access | Where | Who holds it | Moves with the repo? |
|---|---|---|---|
| Build + release | GitHub Actions in the repo, using the built-in `GITHUB_TOKEN` | the repo | yes, nothing to set up |
| Update feed for installed apps | the repo's **Releases** (must be a **public** repo) | the repo | see "Move installed apps" |
| Claude API key | each user's app (system keychain), created at platform.claude.com | each user / your Claude Console org | no: users keep theirs |
| GitHub token for fixes | each user's app (system keychain) | each user | no: users keep theirs |
| Code signing (Mac/Windows) | not set up yet (builds are unsigned) | — | — |
| Team mode (Supabase, `SEED_ADMIN_PASSWORD`) | not built yet (Phase 2); will be repo **secrets**, never committed | — | — |

## 1. Create the new repository

1. On GitHub, in the new account or organization: **New repository**, e.g. `h88cro`. Leave it empty (no README).
2. Make it **public**. Installed apps download updates from its Releases without signing in, which only works on a public repo. The code has no secrets, so this is safe.

## 2. Push the code

From the handover pack:

```bash
git clone h88cro.bundle h88cro
cd h88cro
git remote set-url origin https://github.com/NEW_OWNER/h88cro.git
git push -u origin main
```

(Or, if you have access to the old repo: `git clone https://github.com/RNikola/h88cro.git` and push the same way.)

## 3. Repository settings (one time)

1. **Settings → Actions → General → Workflow permissions:** "Read and write permissions". (The release job needs to create Releases. If your organization forbids this, allow it for this repo.)
2. **Settings → Secrets and variables → Actions → Variables → New repository variable:**
   - `VERSION_PREFIX` = `0.2`

   Versions are `VERSION_PREFIX.<run number>`. The new repo starts counting runs from 1, so it needs a higher prefix than the old repo's `0.1.x`. Otherwise installed apps would see the new builds as older and ignore them. Versions must only ever go up; to start a new series later, raise the prefix (`0.3`, `1.0`…).
3. Optional: **Settings → Branches →** protect `main` (require the `CI` check, require a pull request).

## 4. First release from the new repo

Merge any pull request into `main` (or run **Actions → Build installers → Run workflow** on `main`). The workflow:

1. builds the Mac (universal .dmg + .zip) and Windows (.exe) installers,
2. scans them for secrets,
3. publishes Release `v0.2.<n>` with the installers and the update files (`latest.yml`, `latest-mac.yml`, blockmaps).

The update address baked into each build is taken from the repository the workflow runs in, so nothing in the code needs changing.

New users download from: `https://github.com/NEW_OWNER/h88cro/releases/latest`

Update the two links in `README.md` and `docs/INSTALL.md` (search for `RNikola/h88cro`) and send `docs/INSTALL.md` to users.

## 5. Move installed apps to the new repository (one time)

Apps installed so far check the **old** repo (`RNikola/h88cro`) for updates. To move them, publish one last "bridge" release from the old repo that points to the new one. Someone with admin access to the old repo (Niko) does this:

1. Old repo → **Settings → Secrets and variables → Actions → Variables → New repository variable:** `UPDATE_REPO` = `NEW_OWNER/h88cro`
2. Old repo → **Actions → Build installers → Run workflow** on `main`.

This publishes `v0.1.<n>` on the old repo, built to read updates from the new repo. Installed apps take it like any other update (Windows: "Restart to update"; Mac: "Download" and replace the app). From then on they follow the new repo and get `0.2.x` releases. Profiles, keys, connected sites and scans are kept.

Leave the old repo and its releases in place (archive it if you like) for a few weeks, so apps that were offline also get the bridge release.

## 6. Day-to-day: releasing an update

- Work on a branch, open a pull request. CI runs type checks, unit and acceptance tests, a build and an end-to-end test of the app, and attaches test installers to the run.
- Merge to `main` → a new release is published automatically → installed apps pick it up (Windows within ~4 hours or at next start, Mac shows "New version available").

## Developer setup

- Node 24, pnpm 10 (`corepack enable`).
- `pnpm install`
- `pnpm test` — unit and acceptance tests (rendered tests need Chrome: set `H88CRO_CHROMIUM_PATH`)
- `pnpm --filter @h88cro/desktop dev` — run the app
- `pnpm --filter @h88cro/desktop build && xvfb-run -a node apps/desktop/e2e/smoke.mjs` — end-to-end test (Linux)
- `pnpm scan fixtures/keira-fr.html --market FR --type toplist --static` — scan from the command line

The layout of the code, the scope per phase and the deviations from the brief are in `README.md`. How fixes and GitHub publishing work for users: `docs/FIXES.md`.

## Later: signing the apps

Unsigned builds work, but Mac users must click "Open Anyway" on first launch and update by downloading the .dmg, and Windows shows a SmartScreen warning. To sign:

- **Mac:** an Apple Developer account ($99/year). Add repo secrets `CSC_LINK` (base64 .p12 Developer ID certificate), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from `release.yml`. Signed Mac apps then update in place like Windows.
- **Windows:** a code-signing certificate (or Azure Trusted Signing), added the same way.
