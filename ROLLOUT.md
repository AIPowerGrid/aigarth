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

## Members-role community voting follow-up

- The existing Members role permits community reaction votes without granting
  native Discord moderation permissions or access to one-click moderator controls.
- Defaults remain four approvals / three dismissals. Full quorum is revalidated;
  revoked roles, invisible channels, bots and self-votes cannot authorize action.
- Staff, bots, owner, configured admins and protected roles cannot be targets of
  reaction quorum. Moderator buttons keep their separate permissions/hierarchy checks.
- 64 hermetic tests cover the existing cases plus Members-only approvals/dismissals,
  revoked voting roles, protected targets, bot voters, channel access and delete quorum.
- The maintainer chose the existing Members role instead of a new Trusted Voter role.
  No new roles, bot permissions or member assignments were made. Runtime binds the
  existing role by ID. This accepts collusion risk among Members-role accounts;
  separate account IDs do not establish independent people.

## Observability and context follow-up - 2026-09-16

- Every queued event has a unique trace ID. Model rounds, tool timings, context
  refreshes and a terminal outcome can be joined to its Discord message ID.
- Failure and stale-output paths emit terminal records, not ambiguous missing
  logs. No raw message content, tool arguments or private reasoning in new traces.
- The operational brief is bounded to 4,000 characters with an explicit review
  date/age and 48-hour stale marker. It never overrides live capabilities.
- Evaluation now includes the missed price question, human answers arriving
  mid-turn, scam reporters and benign deletions. All Discord effects are stubbed.
- Initial read-only Discord check: Ban Members was missing; bot role position 23 was
  above configured Members at 21. Manage Messages is present. Ban enforcement is
  not ready with that configuration until the maintainer grants the missing permission and
  per-target checks pass. No permissions or role assignments changed by this work.
- Initial live evaluation: 11/14 passed. One attribution lookup used saved memory
  instead of channel history; two requests were rate-limited. Tool guidance was
  clarified and evaluation requests paced, without throttling live participation.
- A subsequent run exposed a repeated finish-call loop and was stopped. Accepted
  finish calls now use pi's termination hook; rejected attempts count toward the
  tool budget. The model still decides participation; this is loop lifecycle,
  not a semantic gate. Tests cover no epilogue, trailing calls, and attempt limits.
- Final conversation run: 14/14 passed with live Qwen and stubbed Discord effects.
  Live moderation selection: 5/5 passed with mocked ban/delete proposals; this
  tests model judgment, not Discord permission or actual ban execution.
  79 hermetic tests, typecheck/build and dependency audit passed (zero advisories).
  Live read-only Discord context check synchronized 50 messages without duplicates.
- Limits: behavior is probabilistic, not a guarantee of perfect silence or
  diagnosis. Manual review still saw overly strong "I can tell you for sure"
  phrasing about future troubleshooting; factual claims still need evidence.

## Moderation permission unblocked - 2026-09-16

- The maintainer assigned the dedicated AIGarth Ban Hammer role. A fresh Discord
  API read confirms effective Ban Members and Manage Messages, without Administrator.
  Shared Bots, Members and everyone roles do not grant Ban Members.
- The bot's highest role is position 21, above configured Members at 19. The
  permission-granting role itself need not be its highest role. Per-target role
  hierarchy, protected-target checks and human authorization still apply.
- An authenticated read of Discord's guild bans endpoint succeeded. This closes
  the missing-permission readiness blocker; no member was banned as a test.
- The dated runtime brief was corrected. Ban execution is covered by mocked
  authorization/enforcement tests, not claimed as a completed real-user ban.
