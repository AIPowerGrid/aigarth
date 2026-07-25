/**
 * Prompt version marker. The persona lives in `agent.ts` and the gate prompt in
 * `discord/gate.ts`; bump this whenever you change either, so prompt changes are
 * trackable (logged at startup, printed by `npm run eval`) and can be tied to an
 * eval score. Behavior lives in prompts — treat prompt edits like code changes:
 * bump the version and re-run `npm run eval`.
 */
export const PROMPT_VERSION = "2026-07-25.2";
