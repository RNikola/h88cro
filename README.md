# H88CRO

Desktop app that audits iGaming landing pages (toplists, brand reviews, bonus pages) for conversion, consistency, language, performance, SEO and trust issues, per market. Electron + React + TypeScript, pnpm + Turborepo monorepo.

This is **Phase 1: Solo mode MVP** (brief §14). Everything runs on the user's machine with a local profile.

## Quick start

```bash
pnpm install
pnpm dev                     # launch the desktop app (first run downloads the Chromium scan engine)
pnpm test                    # unit + acceptance tests
pnpm typecheck
```

Scan from the command line, no app needed:

```bash
pnpm scan fixtures/sample-toplist-fr.html --market FR --type toplist --static
pnpm scan https://example.com/fr/casinos --lighthouse --pdf --out ./.scan-output
```

Set `H88CRO_CHROMIUM_PATH` to use an existing Chrome/Chromium instead of the downloaded engine. Copy `.env.example` to `.env` for local overrides. Never commit `.env`.

Unsigned installers: `pnpm dist:mac` (universal .dmg) and `pnpm dist:win` (x64 .exe).

## Releases and updates

- Users download from **https://github.com/RNikola/h88cro/releases/latest**. Moving the project to another GitHub: [docs/HANDOVER.md](docs/HANDOVER.md). Install steps for end users: [docs/INSTALL.md](docs/INSTALL.md).
- Every merge to `main` runs **Build installers**: it builds both installers, scans them for secrets, then publishes release `v0.1.<run number>`. Pull requests build the installers as run artifacts only.
- Installed apps check that feed at start-up and every 4 hours (`electron-updater`). Windows downloads in the background and offers **Restart to update**. macOS can only self-install signed apps, so until the builds are signed the Mac app shows **New version available → Download**.
- Profile, settings, Claude key and scans live in the OS user-data folder, so updates and reinstalls keep them.

## Layout

| Path | What it is |
| --- | --- |
| `apps/desktop` | Electron shell: main process, preload, React renderer, scan worker |
| `packages/core` | Finding schema, scoring, priority, markets and glossaries |
| `packages/page-model` | HTML/layout to a structured page model (cards, reviews, FAQ, dates, author) |
| `packages/analyzers/*` | One package per module: language, consistency, cro, performance, seo, eeat |
| `packages/llm` | Claude passes (language, consistency, above-the-fold vision) with model routing and budget |
| `packages/engine` | Scan orchestrator: render, Lighthouse, analyzers, LanguageTool, Claude, reports, PDF/CSV, CLI |
| `packages/db` | Local SQLite (Drizzle) schema and data access |
| `packages/ui` | Shared React components |
| `fixtures` | Sample pages and the expected findings used by the acceptance test |

## Phase 1 scope

Done: Electron shell, welcome window, local profile with password, first-run engine download with checksum, new scan (URLs or local HTML files), mobile and desktop render with screenshots, modules 5.1/5.2/5.3/5.5/5.6/5.7, report UI with ignore/comment, PDF/CSV/JSON/HTML export, fixture acceptance test, CI and unsigned release builds.

Also: searchable picker for every language and country (hand-written profiles for 10 markets, generic ones from locale data for the rest), local-author check, in-app updates.

Fix engine (brief §10): **Suggest alternatives** (3 rewrites from Claude), **Fix** (automatic fixes for common rules, Claude for the rest, editable diff, before/after preview, re-check), **Apply** (pull request on a new branch of a connected GitHub repo, with an optional per-site "Merge automatically"; or a new branch in a local folder; or a saved copy of the page), **batch fix**, PR status tracking and a re-scan a few minutes after a fix is merged. See [docs/FIXES.md](docs/FIXES.md).

Later phases: Team mode (Supabase accounts, shared reports), GitHub sign-in with an OAuth app (tokens for now), code signing (needed for silent Mac updates).

## Deviations from the brief

- **SQLite driver:** built-in `node:sqlite` instead of better-sqlite3, so there is no native module to rebuild per Electron version.
- **Routing:** a small state router in the renderer instead of TanStack Router; the app has only a handful of screens.
- **Chromium version:** the engine resolves the current stable Chrome for Testing build at first download and records its SHA-256; set `H88CRO_CHROME_BUILD` to pin a build.
- **LanguageTool:** used through its HTTP API (public or self-hosted URL in Settings). Bundling a local LanguageTool server is not built yet.
- **Local data:** the profile password gates the app, but the database is not encrypted at rest. The Claude API key is stored with the OS keychain (Electron `safeStorage`).
- **Merge automatically:** the brief says nothing is pushed straight to the default branch. Fixes always go through their own pull request; when a site has "Merge automatically" on, the app merges that pull request (or turns on GitHub auto-merge if branch rules require checks), so changes reach the live domain without a manual step.
- **GitHub sign-in:** a fine-grained personal access token stored in the OS keychain. The OAuth device flow needs an OAuth app client ID and will replace it later.
- **Fixtures:** besides the real `pooky-fr.html` and `keira-fr.html`, two synthetic pages cover rules the real pages don't trigger (see `fixtures/EXPECTED_FINDINGS.md`).

## Security

- No secrets in the repo or the installer. The seed admin password for Team mode is read only from the `SEED_ADMIN_PASSWORD` environment variable, and the Supabase service-role key is never bundled.
- CI runs gitleaks on every push, and the release workflow scans each packaged `app.asar` with `scripts/scan-asar.mjs`.
- Renderer runs with context isolation and sandbox on; every IPC channel is allow-listed and validated with zod; scans run in a separate utility process and block private-network targets.
