# discord - Context and transport

## Ownership

- `coalescer.ts`: per-channel FIFO, serialized execution and pending-event dedup.
  Keep all eligible messages. No name/address prioritization or cooldown filtering.
- `context.ts`: live Discord fetch, authors/replies/timestamps/IDs, own recent
  messages, attachments, embeds, reactions and room metadata. Persist by stable ID.
  Local history is an explicitly degraded fallback, not verified live context.
- `turn.ts`: run the single agent and supply scoped Discord actions. Only completed
  explicit replies publish. Refresh context inside the same turn before finish.
- `transport.ts`: command recognition and recent-send context. No model calls or
  homegrown reply ceiling. Discord.js respects Discord's actual API rate limits.
- `scam.ts`: evidence snapshots, persisted human votes, role/permission checks,
  deduplication and enforcement. The bot never votes for itself.
- `commands.ts`: explicit privacy/admin commands. Unknown prefixes reach the agent.

## Contracts

- No separate participation judge or reply editor. All ordinary human messages,
  including mentions and messages to other people, are decisions for Qwen.
- Check output permissions at publication; let Discord.js handle platform rate limits.
- Finish-time refresh lets Qwen reconsider a changed room. Do not insert a second
  judge. A subsequent race prevents stale delivery; the new event gets its own turn.
- Tool history is bound to the current channel, bounded and credential-redacted.
- Moderation polls default to the focus author; a replied-to target is explicit.
  A reporter must never be automatically targeted for someone else's quoted abuse.
- Preserve immutable flash-deletion evidence; deletion alone is not proof of abuse.
- Moderator buttons are bound to persisted guild/channel/card IDs and checked
  against freshly fetched permissions and role hierarchy. No model tool can approve.
  Reactions count only eligible moderators; revalidate the quorum before acting.
  Failed Discord calls leave cases open. Only Unknown Message means already deleted.
- One active case per target in a guild accumulates redacted source evidence.
  Manual/external bans and startup reconciliation close cases; source deletion
  preserves ban proposals. Cards show outcomes with buttons removed when closed.
  Cases expire after the configured TTL; check TTL on interaction as well as cleanup.
- Conversation read-only channels can be reviewed for moderation, never chatted in.
- Public posts use `SAFE_MENTIONS`. Never allow unintended user/role/everyone pings.

## Verification

`npm test`: FIFO preservation, context/ID synchronization, terminal decisions,
human vote enforcement. `npm run eval`: same production participant with real Grid
inference, no Discord posts. `npm run eval:discord-context`: read-only live fetch.

## Child DOX Index

None.
