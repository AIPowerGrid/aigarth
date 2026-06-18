# Why old aigarth felt more natural — study of the JSON-era bot

Source: `bot.py`, `grid_client.py`, `conversation_db.py` (copied here from
`../../aigarth-chatbot`). The old bot did ONE LLM call per message that returned
`{respond, message, react, channel_status}` JSON. Symptoms in the new bot it
fixes: robotic, repetitive openers ("Hey half, … 🚀" / "Hey half, … 🚀"),
support-desk phrasing ("What can I help you with?"), reflexive apologies.

## The levers that made it natural (ranked by impact)

### 1. Sampling params — the big one (`grid_client.py:87-99`)
Old call used:
```
temperature: 0.7
top_p:       0.92
top_k:       100
rep_pen:     1.1      # repetition penalty
```
The NEW `gridModel()` set **none of these** → pi-ai defaults. The repeated
"Hey half…" openers are the textbook signature of **no repetition penalty**.
`rep_pen 1.1` + `temperature 0.7` is exactly what stops that and adds warmth.
pi-ai only exposes `temperature`, so the rest go in via the `onPayload` hook
(AgentOptions.onPayload) which rewrites the OpenAI-completions body before send.

### 2. Explicit "keep it simple" anti-robot guidance (`bot.py:652-654`)
> "Be natural and conversational. If someone just says 'hey aigarth' or
> 'aigarth are you there' - just say hi! Keep it simple."
> "For quick acknowledgments, use emoji reactions instead of long messages."

The new persona said "casual" but never modeled BREVITY for trivial messages,
so the model padded greetings into support-bot paragraphs.

### 3. A mood (`conversation_db.py:272-315`)
The bot carried a mood: chill / excited / focused / sarcastic / helpful /
curious / tired / happy, injected into every prompt. Cheap source of
personality variance so it didn't sound identical every message. (Not yet
ported — candidate follow-up.)

### 4. No support-desk framing
The old prompt never contained "How can I assist" / "What can I help you with".
The base model defaults to that register unless told NOT to. Fix = explicit
DON'Ts in the persona.

## Applied to the new bot (this pass)
- `config.ts`: `chatSampling` block (temperature/top_p/top_k/penalties), env-tunable.
- `agent.ts`: `onPayload` injects the sampling set into every Grid call.
- `agent.ts` persona: brevity rule + explicit DON'Ts (no "what can I help you
  with", no reflexive sorry, no 🚀 crutch, don't open every line with "Hey <name>").

## Not ported yet (deliberate — discuss first)
- Mood system (#3). Easy win for variety; needs a tiny mood table + occasional
  mood drift. Hold until the sampling+persona fix is judged.
- Single-JSON-call architecture: the new two-tier gate is cheaper and better;
  not reverting that.
