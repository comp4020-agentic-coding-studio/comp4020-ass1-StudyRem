# Process overview

## What I built

I built an animated, click-driven example that explains how an agent/harness/
LLM tool-call loop actually runs, and used it to walk through the tricks
around its context window. Act 1 steps through a single loop turn by turn
across three lanes (user, model, harness), so the mechanic is visible one
message at a time instead of described in the abstract. Act 2 replays those
same turns into a fixed-width context bar that fills and evicts on its own,
making concrete the idea that the window is a fixed-size budget, not infinite
scrollback. A gotcha demo, a cost calculator, and a mitigations section all
build on that same context-window mechanic, and a closing quiz checks whether
the idea actually landed.

## The moments that mattered

1. **Claude checked its own work with screenshots; I still had to watch the
   page myself to catch what those couldn't show.** Two separate bugs slipped
   past that kind of check. First, the context bar I expected to visibly fill
   as the loop ran wasn't moving at all — flexbox was stretching every child
   to fill the row regardless of its flex-grow ratio, so a bar at 15/70 held
   tokens looked exactly as full as one at 61/70
   ([`129b572`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-StudyRem/commit/129b572)).
   Second, the label inside a narrow bar segment was flashing and
   disappearing rather than sitting still — a label too wide for its segment
   clipped into a jagged cut-off, and as the segment resized during the
   fill/evict animation that clip flickered in and out frame to frame instead
   of settling
   ([`563fb42`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-StudyRem/commit/563fb42)).
   Both are about behaviour *over time* — a fill that should climb, a label
   that should hold still — and a screenshot is one frame: a bar frozen at
   the wrong value, or a label mid-flicker, looks unremarkable in a single
   capture. Claude's automated checks confirmed the markup and the values at
   an instant; I only caught either bug by sitting there and watching the
   page run continuously.

2. **Asking Claude to investigate first, instead of telling it what to
   change, got me sharper answers than my own advice would have.** Rather
   than hand it a palette or a list of fixes, I asked it to look into how
   comparable interactive explainers handle this kind of styling before
   touching any code. What came back was concrete, not a mood board: stop
   rendering headings and prose in the same monospace as the terminal
   chrome, and give text its own sans display face
   ([`e9db1a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-StudyRem/commit/e9db1a9));
   stop sitting on a near-verbatim GitHub-dark palette and let one accent
   dominate instead of several role colours competing equally
   ([`9a11b97`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-StudyRem/commit/9a11b97));
   push the lane boxes further into real box-drawing characters instead of
   generic rounded borders
   ([`7bd4b24`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-StudyRem/commit/7bd4b24)).
   A fourth recommendation — leave the existing `.reveal`/`.bundle` fade
   motion alone, since restraint over scroll-triggered animation was already
   the right call for a click-driven page — wasn't a change at all, and
   having it confirm something was already right was as useful as it finding
   something wrong. I acted on the first three and checked the result at
   both 1920×1080 and 390×844, since the box-drawing corner marks in
   particular had to stay legible at phone width.

3. **The quiz passed every test and still wasn't a good quiz.** After the
   select-then-check rebuild, the correct answer sat in the same position in
   all four questions. Functionally that's invisible — every test and every
   single play-through scores correctly — but no real exam has every answer
   sit in the same slot, and once you notice the pattern you stop reading
   the questions at all. The tests couldn't have caught it either, since
   they selected an option by its fixed index and so shared the exact same
   blind spot as the bug. It only showed up because I ran the quiz several
   times in a row; one attempt just looks like a correct answer, and it
   takes repetition for "always the same slot" to become visible as a
   pattern rather than a coincidence. The fix shuffles each question's
   options on load and again on every restart, and switches the tests to
   select by `data-correct` instead of position, so they can no longer agree
   with the bug
   ([`5af072f`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-StudyRem/commit/5af072f)).

4. **I asked Claude to fix the arrow between the lanes; twice it didn't
   actually fix it, and I ended up solving it myself.** Its first attempt
   drew the connector with an em dash — a character I don't even have on my
   own keyboard — and when that didn't line up with the lane boxes it
   switched to a CSS-drawn bar-and-arrowhead instead. That didn't line up
   either (`4159a2e`, labelled "fix arrow alignment," still wasn't one).
   Instead of letting it keep iterating on the same two ideas, I read back
   through what it had actually tried in the conversation log and recognised,
   as a person, that neither a non-monospace dash character nor an
   absolutely-positioned CSS shape was ever going to sit flush with plain
   text. I proposed the thing that would instead: replace the whole
   connector with repeated ASCII dashes (`---`), which are just text in the
   same font as everything else and so can't help but align
   ([`4159a2e...985b33c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-StudyRem/compare/4159a2e...985b33c)).
   The em-dash attempt itself isn't in that range — I caught and corrected it
   before it was ever committed.
