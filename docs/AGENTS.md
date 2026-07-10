# docs - Aigarth knowledge corpus

## Purpose

Curated factual knowledge that Aigarth can list, search, and read while answering
community questions. Every top-level Markdown file except this `AGENTS.md` is a
runtime knowledge source, so stale claims become incorrect bot answers.

## Ownership

- Product and architecture docs describe the live Grid, workers, validator
  preview, public applications, and Base integration.
- Operator docs point to the canonical worker repositories and public docs.
- Historical incident/migration docs must be explicitly labeled historical.
- `src/docs/store.ts` owns discovery, reads, and admin save/delete behavior.

## Local Contracts

- Source priority: current code/deployment manifests first, public
  `aipg-documentation` second, this local summary third. Resolve contradictions
  before publishing a claim here.
- Separate deployed contracts from operational product rails. A contract can be
  on Base while the bot, UI, funding, or economic policy remains dark.
- Label `live`, `preview`, `dark`, `planned`, `retired`, and `historical`
  explicitly. Never use roadmap dates as current facts after the date passes.
- Do not state current token price, circulating supply, APY, reward rate, worker
  earnings estimate, model inventory, or network counts as static facts. Use a
  live tool/source or say they vary.
- Never include private validator challenges, secrets, private infrastructure,
  personal data, or unverified accusations.
- Use canonical repositories: `grid-core`, `grid-text-worker`,
  `grid-media-worker`, `grid-validator`, and `grid-discord-agent`.
- `AGENTS.md` is not knowledge content and is reserved from Discord doc admin
  read/write/delete operations.

## Work Guidance

- Prefer a short accurate page with canonical links over duplicated runbooks.
- Update related pages together when auth, API endpoints, payouts, contracts,
  staking, validators, or repository names change.
- Test factual endpoint examples against `grid-core/grid_api/routers` or the
  safe public API before adding them.

## Verification

- `npm run typecheck`
- `npm run build`
- Confirm `docIndex()` excludes `AGENTS.md` after doc-store changes.
- `git diff --check`

## Child DOX Index

- None - all knowledge files are governed by this contract.
