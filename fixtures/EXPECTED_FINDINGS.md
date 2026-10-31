# Expected findings (acceptance fixtures)

A scan of each fixture, loaded as a local file with no network, must detect **at least** these findings (brief §12).
`pnpm acceptance` checks the deterministic ones automatically. Rows marked **LLM** need a Claude key and are checked by a reviewer.

The two real pages from the brief (`pooky-fr.html`, `keira-fr.html`, saved 2026-10-31 from the live FR pages) come first.
The two synthetic pages below them cover rules the real pages don't trigger (placeholders, fake urgency, schema problems…).

Every Critical and High finding on the real pages was checked by hand against the page: no false positives.
The acceptance test fails if a new Critical/High rule fires on them without being reviewed and added here.

> The saved pages link their CSS from the live site, so offline they render unstyled. The scanner detects this,
> warns, and skips layout and above-the-fold checks. Static checks are unaffected.

## pooky-fr.html

| Rule | Severity | What is wrong |
|---|---|---|
| `consistency.rank-text-mismatch` | Critical | Tower Casino review: "se glisse à la deuxième place", but it is #1 |
| `consistency.faq-number-one-mismatch` | High | FAQ: "Godz Casino occupe le haut de ma sélection"; list #1 is Tower Casino |
| `consistency.superlative-claim-mismatch` | High | VipLuck: "l'offre d'accueil la plus musclée" / "le bonus affiché le plus généreux" (2 000 €), NorseMania offers 14 000 € |
| `cro.missing-cta-after-review` | High | None of the 5 review sections ends with a button |
| `cro.card-missing-terms` | High | No card links to the bonus terms |
| `seo.affiliate-missing-sponsored` | High | 10 affiliate links without rel="sponsored" |
| `consistency.stale-date` | Medium | "Classement mis à jour en juillet 2026" |
| `language.decimal-separator` | Medium | "9.9/10", "9.8/10"… instead of "9,9/10" |
| `language.percent-spacing` | Low | "100%" on the VipLuck card (other cards use "100 %") |
| `cro.generic-cta-text` | Medium | "Jouez maintenant" on every card |
| `cro.rating-staircase` | Medium | 10, 9.9, 9.8, 9.7, 9.6 |
| `performance.img-missing-dimensions` | Medium | Images without width/height |
| `eeat.no-affiliate-disclosure` | Medium | No commission disclosure |
| `eeat.author-not-local` | High | French page signed by "Alina Sazonova" |
| `cro.top-pick-not-highlighted` | Medium | Tower Casino's #1 card has no "top pick" badge |
| `cro.review-no-pros-cons` | Medium | No review has a pros/cons list |

## keira-fr.html

| Rule | Severity | What is wrong |
|---|---|---|
| `consistency.rank-text-mismatch` | Critical | Mad Casino: "décroche la médaille d'argent", but it is #4 |
| `consistency.rank-text-mismatch` | Critical | VipLuck: "décroche la deuxième marche", but it is #5 |
| `consistency.faq-number-one-mismatch` | High | FAQ: "Godz Casino au moment où nous rédigeons"; list #1 is Tower Casino |
| `consistency.card-table-rating-mismatch` | High | Cards 9.8 / 9.5 / 9.1 / 8.7 vs table 9,9 / 9,8 / 9,7 / 9,6 |
| `consistency.superlative-claim-mismatch` | High | VipLuck "l'accueil le plus généreux" and table "le bonus de bienvenue le plus généreux du classement" (2 000 € vs 14 000 €) |
| `consistency.count-word-mismatch` | High | "Le duo de tête" and "Aucune des deux plateformes" with 5 brands |
| `cro.missing-cta-after-review` | High | None of the 5 review sections ends with a button |
| `cro.card-missing-terms` | High | No card links to the bonus terms |
| `seo.affiliate-missing-sponsored` | High | 5 affiliate links without rel="sponsored" |
| `consistency.review-order-mismatch` | Medium | Reviews run NorseMania, Godz, Tower, Mad, VipLuck |
| `consistency.toc-heading-mismatch` | Medium | TOC "Le duo de tête… deux noms" links to "Le quintette de tête… cinq enseignes" |
| `consistency.stale-date` | Medium | "Mis à jour en juillet 2026" |
| `language.decimal-separator` | Medium | Card scores "9.8", "9.5"… (the table uses commas) |
| `language.borrowed-term` | Medium | "wagering" instead of "conditions de mise" |
| `language.percent-spacing` | Low | "100%" on the VipLuck card |
| `cro.generic-cta-text` | Medium | "Jouez maintenant" on every card |
| `cro.table-row-missing-cta` | Medium | Summary-table rows have no button |
| `eeat.no-person-schema` | Medium | Author without Person schema |
| `eeat.author-not-local` | High | French page signed by "Ethan Walker" |
| `cro.top-pick-not-highlighted` | Medium | Tower Casino's #1 card has no "top pick" badge |
| `cro.review-no-pros-cons` | Medium | No review has a pros/cons list |
| **LLM** `language.llm-*` | | "Ethan Walker … Testeuse de casinos" with "il" in the bio: male name with a feminine job title |

## sample-toplist-fr.html (synthetic, seeded with problems)

| Rule | What is wrong |
|---|---|
| `consistency.rank-text-mismatch` | Mirage Casino review says "deuxième place", list position is #3 |
| `consistency.faq-number-one-mismatch` | FAQ says Royal Spin is #1; list #1 is Lucky Ace |
| `consistency.card-table-rating-mismatch` | Royal Spin 9.8 on card, 9.4 in table |
| `consistency.superlative-claim-mismatch` | "bonus le plus généreux" claimed for Nova Play (200 €), Royal Spin offers 2 000 € |
| `consistency.count-word-mismatch` | "deux plateformes" with 5 brands listed |
| `consistency.review-order-mismatch` | Volt Bet review comes before Mirage Casino |
| `consistency.toc-heading-mismatch` | TOC links to #methodologie, which does not exist |
| `consistency.stale-date` | "Mis à jour le 3 janvier 2026" (older than 45 days) |
| `language.placeholder-text` | `{{brand}}` and "Lorem ipsum" |
| `language.decimal-separator` | "9.9/10" instead of "9,9/10" |
| `language.currency-format` | "2000€" |
| `language.quote-style` | straight quotes in French |
| `language.borrowed-term` | "free spins" instead of "tours gratuits" |
| `cro.generic-cta-text` | "Jouer" buttons |
| `cro.missing-cta-after-review` | No button after the Volt Bet review |
| `cro.table-row-missing-cta` | Volt Bet table row has no button |
| `cro.card-missing-terms` | Volt Bet card has no terms link |
| `cro.fake-urgency` | Countdown "expire dans 00:14:59" |
| `cro.fake-social-proof` | "1 247 joueurs se sont inscrits aujourd'hui" |
| `cro.rating-staircase` | 9.9, 9.8, 9.7, 9.6, 9.5 |
| `performance.lcp-image-lazy` | Hero image has loading="lazy" |
| `performance.img-missing-dimensions` | Images without width/height |
| `performance.render-blocking-js` | Sync third-party scripts in `<head>` |
| `seo.affiliate-missing-sponsored` | `/go/` links without rel="sponsored" |
| `seo.self-serving-rating` | aggregateRating on Organization |
| `seo.faq-schema-mismatch` | FAQ schema questions not on the page |
| `seo.hreflang-invalid` | `en-UK` (should be `en-GB`) |
| `seo.h1-count` | Two H1s |
| `seo.meta-description-missing` | No meta description |
| `eeat.no-responsible-play` | No 18+ / responsible-play message |
| `eeat.no-affiliate-disclosure` | No commission disclosure |
| `eeat.no-person-schema` | Author without Person schema |
| `eeat.unsupported-testing-claim` | "testé par notre équipe" with no evidence |
| **LLM** `language.llm-*` | "Ethan Walker … Testeuse": male name with a feminine noun |

## sample-clean-fr.html (should be clean)

No Critical or High findings. At most a few Low/Medium ones.
