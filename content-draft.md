# Content draft — "What actually happens in an agent loop"

Working draft of page copy. Not shipped (see `scripts/build.mjs` —
only `.html`/`.css`/`.js`/asset files get copied into `dist/`). Delete this
file once the copy has moved into `index.html`.

`[INTERACTIVE: ...]` marks a spot that's a control, an animation, or a
visualisation rather than static text — the thing the visitor actually does.

---

## Hook

> You've watched an agent "think" for thirty seconds and use six tools. What
> actually happened in that time?

`[INTERACTIVE: a "run" button that kicks off a canned agent session —
e.g. "fix the failing test" — and starts the step-through below. Nothing
plays automatically; the visitor drives it one click at a time.]`

## Act 1 — The loop

One numbered step per click. Each step appends a block to a growing
transcript panel next to (or below) the controls.

1. **Your message arrives.**
   Plain text, shown as a block: _"the tests are failing, can you fix it?"_

2. **Everything gets bundled and sent to the model.**
   Not just your message — the system prompt, every tool's name/description/
   schema, and the full conversation so far, concatenated into one request.
   `[INTERACTIVE: expand this block to show its parts — system prompt / tool
   defs / history / new message — each labelled with a token count, so the
   visitor sees tool definitions cost tokens even before any tool is used.]`

3. **The model replies with a tool call, not code.**
   `{tool: "run_tests", input: {...}}` — a structured request, not something
   that runs by itself.
   *Point to land: the model doesn't execute anything. It only asks.*

4. **The harness runs it — not the model.**
   Something outside the LLM (the CLI, the sandbox) actually executes the
   command, checks whether it's allowed to, and captures the result.
   `[INTERACTIVE: a visibly separate "harness" lane/box the tool call passes
   through, distinct from the "model" box — reinforces who's doing what.]`

5. **The result becomes a new block, appended to the transcript.**
   Test output, a diff, a file's contents — whatever came back.

6. **The whole transcript — now bigger — goes back to the model.**
   Loop to step 3.
   `[INTERACTIVE: the transcript panel visibly grows here each loop; this is
   the seed for Act 2 — maybe a running token-count ticker next to it.]`

7. **Loop ends when the model replies with plain text and no tool call.**

**Reveal for this act:** the model is stateless between steps. Nothing is
quietly "thinking" while a tool runs — every step is a brand-new inference
call over the *entire* history reattached. Persistence lives in the
transcript, not in the model.

## Act 2 — Why the loop can't run forever

Direct continuation, not a new topic: "notice that block got bigger every
loop. Here's what happens if it keeps growing."

- **Every call re-sends, and re-pays for, the whole history** — not just
  what's new. A 20-step session re-bills the first tool's output 19 extra
  times.
- **Cost and latency scale with total tokens in context**, not with "what's
  new" — self-attention means more tokens costs more compute per generated
  token.
- **Quality degrades before the hard cutoff** — "lost in the middle": detail
  buried deep in a huge context gets attended to worse than detail near the
  edges.
- **There's a hard trained limit regardless** — the model was never trained
  on sequences past a certain length, so beyond it behaviour isn't reliable.
- **The fix:** truncate old tool output, summarise/compact history, or move
  things to files instead of live context.

`[INTERACTIVE: the payoff mechanic. A fixed-size window/bar. Visitor keeps
clicking "step" from Act 1; each step drops a token-sized block into the
window. When it fills: older blocks grey out / collapse into a small
"[summarised]" stub / get evicted. Ideally: the model then visibly gets
something wrong that depended on an evicted block — a concrete, felt cost,
not just an abstract "it got smaller."]`

## Open questions / to decide

- Exact canned scenario for the loop (fix a failing test? research a
  question? — needs to be legible in 3–4 steps, not 7, given the time
  budget).
- Whether Act 1 and Act 2 are two scroll sections of one page or two
  visually distinct "chapters" with a transition beat between them.
- Visual language for "model" vs "harness" — colour-coding, lane/swimlane,
  or something else.
- Whether the eviction in Act 2 needs a scripted "gotcha" (a fact the model
  forgets) or whether visibly greying out blocks is enough on its own.
