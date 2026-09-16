/**
 * Prompt version marker. The single participant persona lives in `agent.ts`;
 * bump this whenever it changes, so prompt changes are
 * trackable (logged at startup, printed by `npm run eval`) and can be tied to an
 * eval score. Behavior lives in prompts — treat prompt edits like code changes:
 * bump the version and re-run `npm run eval`.
 */
export const PROMPT_VERSION = "2026-09-16.observable-context.1";
