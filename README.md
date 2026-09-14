# Aigarth

AI Power Grid's Discord participant, running on the Grid's `qwen3-27b`.

**Human message -> current conversation -> one Qwen agent -> silence, lookup or reply.**

There is no separate engagement judge, regex audience classifier or reply editor.
Every eligible human event reaches the agent through a serialized channel queue.
It sees who said what, reply targets, recent messages (including its own), a rolling
summary and a short operating brief. A mention is context, not an obligation to talk.

The agent calls `finish_turn` to choose silence or an exact public reply. Ordinary
assistant text remains private. It can look something up and still choose silence.
Before finishing, changed channel context is returned to that same agent so it can
reconsider an answer that someone else has already given.

## Tools

- Public Grid network/model status and enabled validator capabilities.
- Public validator health by ID, plus official releases including previews.
- Curated docs read/search and additional history in the current Discord channel.
- Image generation/remixing, crypto data, web search and optional vision.
- User-controlled safe memory and reminders.
- Human-approved moderation proposals, never autonomous AI bans or slashing.

Operational claims need a current source. Release availability does not prove a
Core feature is enabled. Failed lookups mean unknown, not zero or user error.

## Run

Requires Node 22.19+ and a Grid service key with appropriate bounded spending.

```bash
cp .env.template .env
npm ci
npm run build
npm start
```

Set `DISCORD_TOKEN`, `GRID_API_KEY`, and channel IDs in `.env`.
`GRID_CHAT_MODEL=qwen3-27b`; `GRID_SUMMARY_MODEL` defaults to the chat model and is
used for background context maintenance, not participation decisions.
`GRID_VISION_MODEL` optionally enables image understanding.

No separate retrieval service is needed for curated markdown docs. Update
`docs/operating-brief.md` with durable operational changes, never live counts or
secret configuration. It is loaded each turn and treated as historical orientation.

Privacy controls: `!memory`, `!memory on|off`, `!forget <phrase|all>`.
Permissions, human voting, deduplication and output rate limits remain mechanical.

## Moderation

Qwen proposes a case; moderators use **Ban**, **Delete message**, or **Dismiss**.
Buttons verify current Discord permissions, source card and role hierarchy on the
server. Ban/dismiss-ban needs Ban Members; delete needs Manage Messages. Reaction
quorum is available to human users with the server's existing **Members** role.
Default: four distinct approvals act; three dismissals close. Each voter has one
position; role membership and target protections are rechecked before enforcement.

Set the existing Members role ID in `COMMUNITY_VOTER_ROLE_IDS`. No new role,
voter enrollment or native Discord moderation permissions are needed.
Set additional staff/protected role IDs in `PROTECTED_MODERATION_ROLE_IDS`.
Owners, bots, configured admins and members with moderation/administration
permissions are automatically protected from community votes. Role IDs are used,
not names, account age or keyword rules. Empty voter-role configuration keeps
community voting disabled while moderator actions continue working.
This deliberately trusts Members-role holders: multiple accounts with that role
can collude. Distinct Discord user IDs are not proof of distinct people.

Manual bans close matching cases automatically. Deleting a source message preserves
a ban proposal and its redacted evidence. Repeated reports attach to one active case
per target. Cases expire after `BAN_VOTE_TTL_MS`; failed API actions stay open.
Redacted originals and latest observed edits/deletions are kept locally for 30 days,
not fed into conversational memory or automatic training. Messages never observed
by the bot cannot be reconstructed after deletion.

## Verify

```bash
npm run typecheck
npm test
npm run build
npm audit
npm run eval
STATE_DB_PATH=:memory: npm run eval:moderation
npm run eval:discord-context
```

The participant evaluation uses real Grid inference with production prompts and
tool schemas. Discord actions and generation are stubbed; it never posts to a
channel. Its conversation fixtures include human-directed instructions, someone
else's thanks, direct questions and validator errors requiring live evidence.
