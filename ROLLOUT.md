# Qwen participant rollout - 2026-09-14

## Implementation

- One `qwen3-27b` agent selects participation and tools. No engagement judge,
  reply editor, regex audience classifier, user cooldown or snooze filter.
- Every eligible human event reaches a per-channel FIFO. Commands, deduplication,
  permissions and Discord platform rate limits remain mechanical. The old
  four-replies-per-minute ceiling is removed, including the delivery-time check.
- Explicit `finish_turn`: silent or exact public text. Intermediate drafts never
  publish. Failure/truncation suppresses text and generated attachments.
- Current room metadata, reply attribution, prior bot messages, summaries and a
  dated operating brief. Same-agent reconsideration when the room changes.
- Public Grid status/capabilities, validator health, release info including previews,
  docs search, and bounded current-channel history. No operational write access.
- Moderation remains human-voted; tools explicitly distinguish focus/reply targets.
- Explicit 4096-token generation ceiling; no repetition penalties on technical names.
- Node 22.19 runtime; patched undici to 6.28.0; dependency audit clean.

## Verification

- 41 hermetic tests passed, including finish/draft isolation, context, FIFO,
  public-tool bounds and existing human-vote enforcement.
- 10 real-Qwen conversation fixtures passed the final behavioral checks.
  A useful safety warning may receive one reaction, but no public lecture or ban.
- 5 real-Qwen moderation fixtures passed; no real votes or Discord posts created.
- Live Discord read-only check: 50 messages including 13 bots, 15 replies,
  2 attachments, 3 embeds and 22 reactions; metadata and stable-ID checks passed.
- Typecheck/build/diff checks passed. Staged changes scanned with gitleaks: no leaks.

## Limits

These are bounded behavior checks, not proof of factual perfection. Manual review
still saw occasional overconfident statements about whether a client version can
be ruled out. Prompts/tool descriptions require evidence and provisional diagnoses,
but no second judge or semantic output filter is installed. Do not treat Aigarth's
technical answer as production approval or authority to change rewards.

Earlier runs encountered HTTP 502 and model-routing failures; status listing did
not guarantee a successful request. No Core configuration was changed to hide this.
There is no silent fallback to another model. Failed turns do not publish a draft.

## Deployment

Source and runtime were on 55011ab before this rollout. The private operational
checkpoint contains the previous runtime, environment and a consistent SQLite
backup. The initial Qwen rollout did not change schema; preserve new history during any code rollback.

Deployment confirmation is recorded in that private checkpoint; no credentials,
private hostnames or infrastructure paths belong in this repository.

## Moderation follow-up

- Authorized moderator buttons (Ban, Delete message, Dismiss) with fresh permissions,
  role hierarchy, source-card binding, expiry and concurrent-action protection.
- Restricted reaction quorum; arbitrary members cannot vote someone into a ban.
- External ban reconciliation, outcome cards, retained original evidence and latest
  observed edit/deletion metadata. Duplicate reports attach to one active case.
- Additive SQLite fields/table; retain backups before deployment. Original message
  snapshots are redacted and expire after 30 days; no automatic training on decisions.
- 54 hermetic tests pass, including forged controls, role escalation, failed actions,
  concurrent clicks, manual bans, immutable evidence and expired/revoked approval.
- Tests mock Discord writes. No real member is banned or used as a test target.
- This is the practical moderation workflow, not autonomous punishment or a new
  private moderation dashboard. Cases stay in their existing channel; locally retained
  evidence is not publicly expanded. Curated feedback evaluation remains future work.
