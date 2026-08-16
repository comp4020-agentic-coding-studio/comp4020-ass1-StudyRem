# Assignment 1 reflection

## What was the breakthrough that moved the work forward?

It came from the quiz bug in `PROCESS.md`: I asked Claude to build a
select-then-check quiz, and it passed every test, but the correct answer sat
in the same position in all four questions. It took several play-throughs
before I even noticed, since a single attempt just looks like a correct
answer.

What struck me afterward wasn't the bug but where the gap actually was. In
`crit-1` I learned Claude could verify correctness but not the feel of a page
the way a person would — a limit in what the agent could perceive. This time
the fault line was somewhere else: I never asked for the answer positions to
be randomised. I'd assumed that was obviously part of what "a quiz" means, so
it never made it into words at all. That gap existed before Claude touched
the quiz — a person reading the same instruction would have built the same
flaw, since the instruction was incomplete, not misunderstood.

## What did this work change about who I want to be as a software developer?

It moved where I look for this kind of mistake. After crit-1, my instinct was
to check output more carefully, since I couldn't trust the agent to perceive
things the way I did. This time the fix isn't downstream — it starts with my
own request, before anyone has acted on it. I want to build the habit of
examining my own words for what I assumed was too obvious to say, because
those unstated pieces are exactly what a collaborator, human or agent, has no
way to recover on their own. Checking output catches a flaw after the fact;
checking my own assumptions is what would have stopped it existing at all —
and that's the habit I want for working with people, not just with an agent.
