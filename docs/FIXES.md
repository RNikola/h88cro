# Fixing pages from a report

## 1. Connect GitHub (once per person)

Settings → GitHub. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new):

- **Repository access:** the repositories of your landing pages.
- **Permissions:** Contents → Read and write, Pull requests → Read and write.

Paste it and press Save. It is kept in the system keychain.

## 2. Connect a site (once per site)

Sites → Connect a site:

- **GitHub repository:** pick the repository, the branch the site deploys from (usually `main`), and the live address, e.g. `https://keira.best`. Every scan of a page under that address uses this connection.
- **Merge automatically:** on = each fix gets its own pull request and is merged straight away, so it goes live after your host (Netlify, Vercel, Cloudflare Pages, GitHub Pages…) deploys. If the branch requires checks or reviews, GitHub merges it as soon as they pass. Off = fixes wait for someone to merge them.
- **Folder on this computer:** fixes are committed on a new branch with your own git (optionally pushed).

## 3. Fix from a report

- The first time you fix a page, the report asks which file renders it and suggests the best matches (found by searching the repository for the page's headings). The choice is remembered.
- **Fix** on a finding: H88CRO writes the change (automatic fixers for common rules such as wrong rank text, FAQ #1, stale "updated" date, missing `rel="sponsored"`, decimal commas, missing CTA after a review, structured data; Claude for the rest), shows the diff, lets you edit it, re-checks the page, and shows before/after screenshots.
- **Fix selected:** tick several findings and fix them together in one pull request.
- **Suggest alternatives:** three rewrites from Claude, with a translation for the reviewer.
- **Publish / Open pull request:** creates the branch and pull request. The report lists every fix with its status; a few minutes after a fix is merged, the page is scanned again.

Without a connected site, a fix is saved as a fixed copy of the page.
