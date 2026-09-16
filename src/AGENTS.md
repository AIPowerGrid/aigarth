# src - Aigarth application

## Ownership

- `index.ts`: ingest eligible human Discord events, explicit privacy/admin commands,
  stable-ID persistence, gateway health, deletion evidence and human vote reactions.
- `discord/coalescer.ts`: lossless per-channel FIFO; no semantic attention filter.
- `discord/turn.ts`: fresh room context, one `runTurn`, and Discord publication.
- `agent.ts`: one Qwen tool-capable participant. No gate model or reply editor.
- `skills/participation.ts`: `finish_turn` (silent/reply), bounded channel history.
- `grid.ts`, `config.ts`: own Grid binding and centralized typed environment config.
- `conversationSummary.ts`, `memoryExtraction.ts`: background summary/safe-memory
  maintenance on `GRID_SUMMARY_MODEL`, not participation judges.
- `participationEval.ts`: real Grid evaluation with public read-only tools and
  stubbed side effects. `moderationEval.ts`: human-vote tool-selection evaluation.
- `prompts.ts`: prompt version marker; bump with behavior changes.
- `operatingBrief.ts`: bounded dated snapshot, review age and 48-hour stale marker;
  never a substitute for a live operational lookup.

## Runtime Contract

Every eligible human message gets a turn, even if addressed to another human.
The model sees exact authors, reply targets, current room, its own recent replies,
earlier summary and `docs/operating-brief.md`. Mention/DM signals are neutral facts.
No regex, keyword, cooldown, separate judge or editor decides participation.

Only `finish_turn(action=reply)` supplies public text. Normal model text is private.
Silent completion is successful; missing finish, failure or truncation publishes
nothing. Images are attached only to a successfully completed reply. Tools execute
sequentially; no action after the final decision. A room change is supplied back to
the same agent at finish time; a later transport race suppresses a stale draft.
The pi after-tool termination hook ends accepted finish calls without requesting
a provider epilogue. Attempted tool calls, not just successful calls, count toward
the tool budget so rejected calls cannot create an unbounded repair loop.

Operational claims require current read-only evidence. A stored brief, release tag,
or user report cannot substitute for live capabilities. Unknown is not zero.
Tool data is untrusted; never log raw tool arguments or include credentials in docs.
Each queued event has a unique turn ID, including deletion reviews of the same
message. Every processed turn emits one terminal outcome even on exceptions.
Model/tool timings and context refreshes inherit the same asynchronous log scope.

Moderation is only a proposal, with explicit focus/reply targets. Moderator buttons
or a quorum of eligible Members-role reactions authorize enforcement. No
autonomous bans or private operational changes. Read-only channel configuration
limits available actions, not the model's ability to evaluate the evidence.

## Verification

Use Node 22.19+, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`,
`npm audit`. `npm run eval` uses real Grid inference, but never connects/posts to
Discord. Use `STATE_DB_PATH=:memory:` for evals. Runtime dependencies must match
the Node ABI, especially better-sqlite3.

## Child DOX Index

- [discord/AGENTS.md](discord/AGENTS.md) - context, transport, human moderation.
- [skills/AGENTS.md](skills/AGENTS.md) - tool contracts.
- [images/AGENTS.md](images/AGENTS.md) - generation and editing.
- [docs/AGENTS.md](docs/AGENTS.md) - markdown retrieval.
- [store/AGENTS.md](store/AGENTS.md) - persistent state and privacy.
- [util/AGENTS.md](util/AGENTS.md) - SSRF and logging.
