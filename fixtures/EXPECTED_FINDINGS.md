# Expected findings (acceptance fixtures)

A scan of each fixture, loaded as a local file with no network, must detect **at least** these findings (brief §12).
`pnpm acceptance` checks the deterministic ones automatically. Rows marked **LLM** need a Claude key and are checked by a reviewer.

> **Note:** the brief names two real pages, `pooky-fr.html` and `keira-fr.html`. They are not in the repo yet.
> Until they are added, these two synthetic pages stand in. When the real pages are added, list their expected findings below
> and add them to `packages/engine/test/acceptance.test.ts`.

## sample-toplist-fr.html (seeded with problems)

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
