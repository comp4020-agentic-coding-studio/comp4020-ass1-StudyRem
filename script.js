// Act 1: the tool-call loop, stepped through one turn at a time.
// Scenario: "the tests are failing, can you fix it?" — scripted so the loop
// visibly repeats (run_tests -> read_file -> edit_file -> run_tests) before
// the model gives a final answer, rather than a single call-and-response.
const TURNS = [
  {
    role: "user",
    label: "$ user",
    content: "The tests are failing, can you fix it?",
    caption:
      "Your message arrives. It looks like it's the only thing being sent — it isn't.",
    tokens: 12,
  },
  {
    role: "model",
    label: "» model (tool call)",
    content: "run_tests()",
    caption:
      "The model replies with a tool call, not code. It's a structured request — the model isn't running anything itself.",
    tokens: 4,
  },
  {
    role: "harness",
    label: "# harness",
    content: '1 failing: expected sum(2, 3) to be 5, got "23"',
    caption:
      "Something outside the model — the harness — actually ran the tests and captured this result.",
    tokens: 16,
  },
  {
    role: "model",
    label: "» model (tool call)",
    content: 'read_file("sum.js")',
    caption:
      "The whole transcript so far goes back to the model, and it asks for another tool.",
    tokens: 6,
  },
  {
    role: "harness",
    label: "# harness",
    content: "function sum(a, b) {\n  return a + b; // a, b arrive as strings\n}",
    caption: "The harness reads the file and returns its contents as a block.",
    tokens: 22,
  },
  {
    role: "model",
    label: "» model (tool call)",
    content: 'edit_file("sum.js", "return Number(a) + Number(b);")',
    caption: "The model proposes a fix — still just a request, not an edit made by the model itself.",
    tokens: 16,
  },
  {
    role: "harness",
    label: "# harness",
    content: "file updated",
    caption: "The harness applies the edit and confirms it.",
    tokens: 4,
  },
  {
    role: "model",
    label: "» model (tool call)",
    content: "run_tests()",
    caption: "The model checks its own work by asking for the tests again.",
    tokens: 4,
  },
  {
    role: "harness",
    label: "# harness",
    content: "3 passing",
    caption: "The harness runs them and reports back.",
    tokens: 4,
  },
  {
    role: "model",
    label: "» model (final answer)",
    content:
      'Fixed it — sum.js was concatenating strings instead of adding numbers. Tests pass now.',
    caption:
      "Only now does the model reply with plain text and no tool call — that's what ends the loop.",
    tokens: 22,
  },
];

const stepButton = document.getElementById("step-btn");
const caption = document.getElementById("loop-caption");
const transcript = document.getElementById("transcript");
const modelBox = document.getElementById("model-box");
const harnessBox = document.getElementById("harness-box");
const laneArrow = document.getElementById("lane-arrow");
const contextBar = document.getElementById("context-bar");
const chunkSpacer = document.getElementById("chunk-spacer");
const windowCaption = document.getElementById("window-caption");
const tokensHeldEl = document.getElementById("tokens-held");
const tokensRawEl = document.getElementById("tokens-raw");
const bundle = document.getElementById("bundle");
const bundleBar = document.getElementById("bundle-bar");
const bundleHistory = document.getElementById("bundle-history");
const bundleNew = document.getElementById("bundle-new");
const bundleNote = document.getElementById("bundle-note");
const loopReveal = document.getElementById("loop-reveal");
const windowReveal = document.getElementById("window-reveal");
const speedDownBtn = document.getElementById("speed-down-btn");
const speedUpBtn = document.getElementById("speed-up-btn");
const ambientSpeedEl = document.getElementById("ambient-speed");
const gotchaCaption = document.getElementById("gotcha-caption");
const gotchaBar = document.getElementById("gotcha-bar");
const gotchaSpacer = document.getElementById("gotcha-spacer");
const gotchaHeldEl = document.getElementById("gotcha-held");
const gotchaStepBtn = document.getElementById("gotcha-step-btn");
const gotchaReveal = document.getElementById("gotcha-reveal");
const calcInput = document.getElementById("calc-turns");
const calcTurnsValueEl = document.getElementById("calc-turns-value");
const calcNaiveEl = document.getElementById("calc-naive");
const calcWindowedEl = document.getElementById("calc-windowed");
const calcRatioEl = document.getElementById("calc-ratio");

let turnIndex = 0;

const RESET_FLASH_MS = 220;
const ARROW_FIRE_MS = 600;
const CHANGE_FLASH_MS = 700;

// Act 2: a fixed-size context window fed by the same steps. The system
// prompt + tool definitions are a permanent, never-evicted cost — the window
// is never actually empty, even before turn one.
const BASELINE_TOKENS = 15;
const CAPACITY = 70;
const STUB_TOKENS = 2;
const windowChunks = [];

// The gotcha: a separate, manually-stepped fixed window with its own short
// scenario, sized so the "rule" turn is compacted well before the "mistake"
// turn plays — a felt consequence, not just an abstract "it forgets things."
const GOTCHA_TURNS = [
  {
    role: "user",
    tag: "rule",
    label: "$ user",
    content: "One thing — don't touch config/prod.yaml, ops manages that by hand.",
    caption: "A rule, stated once. Nothing marks it as special — it's just another turn in the window.",
    tokens: 11,
  },
  {
    role: "user",
    label: "$ user",
    content: "Bump the request-retry timeout from 3s to 8s everywhere it's configured.",
    caption: "The actual task arrives next.",
    tokens: 14,
  },
  {
    role: "model",
    label: "» model (tool call)",
    content: 'edit_file("config/dev.yaml", ...)',
    caption: "The model starts with dev.",
    tokens: 8,
  },
  {
    role: "harness",
    label: "# harness",
    content: "file updated",
    caption: "Applied, no questions asked.",
    tokens: 8,
  },
  {
    role: "model",
    label: "» model (tool call)",
    content: 'edit_file("config/staging.yaml", ...)',
    caption: "Then staging.",
    tokens: 8,
  },
  {
    role: "harness",
    label: "# harness",
    content: "file updated",
    caption: "Updated.",
    tokens: 8,
  },
  {
    role: "model",
    tag: "mistake",
    label: "» model (tool call)",
    content: 'edit_file("config/prod.yaml", ...)',
    caption: "And now prod — the one file it was told to leave alone.",
    tokens: 8,
  },
  {
    role: "harness",
    label: "# harness",
    content: "file updated",
    caption: "The harness doesn't know about the rule either — it just runs what it's asked.",
    tokens: 6,
  },
];
const GOTCHA_BASELINE = 6;
const GOTCHA_CAPACITY = 45;
const GOTCHA_STUB = 2;
const gotchaChunks = [];
let gotchaIndex = 0;

// Model box always blanks-then-refills, whichever turn it is: the model has
// no memory of its own last turn, so the sketch has to look "reset" every
// single time, not just visually update.
function resetAndFill(el, content) {
  el.classList.add("resetting");
  el.getBoundingClientRect();
  setTimeout(() => {
    el.textContent = content;
    el.classList.remove("resetting");
  }, RESET_FLASH_MS);
}

function fireArrow() {
  laneArrow.classList.remove("firing");
  laneArrow.getBoundingClientRect();
  laneArrow.classList.add("firing");
  setTimeout(() => laneArrow.classList.remove("firing"), ARROW_FIRE_MS);
}

// Same force-reflow-then-toggle idiom as fireArrow, generalised to any
// element/class pair — used to pulse a bar segment that just changed.
function flash(el, className) {
  el.classList.remove(className);
  el.getBoundingClientRect();
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), CHANGE_FLASH_MS);
}

function updateLanes(turn) {
  if (turn.role === "user") {
    return;
  }

  if (turn.role === "model") {
    resetAndFill(modelBox, turn.content);
    const isToolCall = turn.label.includes("tool call");
    if (isToolCall) {
      harnessBox.textContent = "…running";
      harnessBox.classList.add("pending");
      fireArrow();
    } else {
      harnessBox.textContent = "(not called — no tool needed)";
      harnessBox.classList.remove("pending");
    }
    return;
  }

  // turn.role === "harness"
  harnessBox.classList.remove("pending");
  harnessBox.textContent = turn.content;
}

function resetLanes() {
  modelBox.textContent = "—";
  modelBox.classList.remove("resetting");
  harnessBox.textContent = "—";
  harnessBox.classList.remove("pending");
  laneArrow.classList.remove("firing");
}

function revealOnce(el) {
  if (el.classList.contains("visible")) {
    return;
  }
  el.hidden = false;
  el.getBoundingClientRect();
  requestAnimationFrame(() => el.classList.add("visible"));
}

function resetReveals() {
  // windowReveal belongs to Act 2's own ambient loop, not Act 1's restart —
  // it stays visible once shown instead of hiding every time Step loops back.
  [bundle, loopReveal].forEach((el) => {
    el.hidden = true;
    el.classList.remove("visible");
  });
}

function appendTurn(turn) {
  const item = document.createElement("li");
  item.className = `block role-${turn.role} entering`;

  const label = document.createElement("span");
  label.className = "block-label";
  label.textContent = turn.label;

  const content = document.createElement("pre");
  content.className = "block-content";
  content.textContent = turn.content;

  item.append(label, content);
  transcript.append(item);

  // Force a layout flush so the "entering" -> transition removal actually
  // animates instead of the block just appearing already in place.
  item.getBoundingClientRect();
  requestAnimationFrame(() => item.classList.remove("entering"));

  if (typeof item.scrollIntoView === "function") {
    item.scrollIntoView({ behavior: "smooth", block: "end" });
  }
}

function updateBundle(index) {
  const turn = TURNS[index];
  const historyTokens = TURNS.slice(0, index).reduce((sum, t) => sum + t.tokens, 0);
  const newTokens = turn.tokens;
  const total = BASELINE_TOKENS + historyTokens + newTokens;

  bundleHistory.style.flexGrow = String(historyTokens);
  bundleHistory.title = `already said — ${historyTokens} tok`;
  bundleNew.style.flexGrow = String(newTokens);
  bundleNew.className = `bundle-part part-message role-${turn.role}`;
  bundleNew.title = `${turn.label} — ${newTokens} tok`;
  bundleNote.textContent = `What's changing: +${newTokens} tokens this turn (${turn.role}). Everything else — 9 system + 6 tool defs + ${historyTokens} history — is just carried along again, for a total of ${total}.`;
  bundleBar.setAttribute(
    "aria-label",
    `System prompt 9 tokens, tool definitions 6 tokens, history ${historyTokens} tokens, this turn ${newTokens} tokens`,
  );
  flash(bundleNew, "flash-new");
}

function rawTotal() {
  return BASELINE_TOKENS + windowChunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
}

function heldTotal() {
  return (
    BASELINE_TOKENS +
    windowChunks.reduce((sum, chunk) => sum + (chunk.evicted ? STUB_TOKENS : chunk.tokens), 0)
  );
}

function oldestLiveChunk() {
  return windowChunks.find((chunk) => !chunk.evicted);
}

// A plain-English tag for what a turn actually is, for readers who haven't
// followed Act 1's model/harness lane framing — used in Act 2's captions
// and chunk tooltips, which run on their own ambient loop.
function readableChange(turn) {
  if (turn.role === "user") {
    return "user input";
  }
  if (turn.role === "harness") {
    return "harness ran a tool";
  }
  return turn.label.includes("tool call") ? "model calls a tool" : "model's final answer";
}

function addChunk(turn) {
  const el = document.createElement("div");
  el.className = `chunk role-${turn.role}`;
  el.style.flexGrow = "0";
  el.title = `${readableChange(turn)} — ${turn.tokens} tok`;

  contextBar.insertBefore(el, chunkSpacer);

  // Same force-reflow trick as the transcript blocks: start at 0 so the
  // grow-in to its real width actually animates.
  el.getBoundingClientRect();
  requestAnimationFrame(() => {
    el.style.flexGrow = String(turn.tokens);
  });
  flash(el, "flash-new");

  const chunk = { tokens: turn.tokens, evicted: false, el, change: readableChange(turn) };
  windowChunks.push(chunk);
  return chunk;
}

function updateContextWindow(turn) {
  const justAdded = addChunk(turn);
  let evictedCount = 0;

  while (heldTotal() > CAPACITY) {
    const oldest = oldestLiveChunk();
    if (!oldest || oldest === justAdded) {
      break;
    }
    oldest.evicted = true;
    oldest.el.classList.add("evicted");
    oldest.el.style.flexGrow = String(STUB_TOKENS);
    oldest.el.title = `${oldest.change} (compacted)`;
    flash(oldest.el, "flash-evicted");
    evictedCount += 1;
  }

  tokensHeldEl.textContent = String(heldTotal());
  tokensRawEl.textContent = String(rawTotal());
  chunkSpacer.style.flexGrow = String(Math.max(0, CAPACITY - heldTotal()));

  const addedLine = `What's changing: +${turn.tokens} tokens — ${readableChange(turn)}.`;
  if (evictedCount === 1) {
    windowCaption.textContent = `${addedLine} Window's full — the oldest turn just got compacted down to a stub to make room.`;
  } else if (evictedCount > 1) {
    windowCaption.textContent = `${addedLine} Window's full — ${evictedCount} older turns just got compacted down to stubs to make room.`;
  } else {
    windowCaption.textContent = `${addedLine} Holding steady — ${heldTotal()} of ${CAPACITY} tokens used.`;
  }

  if (evictedCount > 0) {
    revealOnce(windowReveal);
  }
}

function resetContextWindow() {
  windowChunks.forEach((chunk) => {
    chunk.el.remove();
  });
  windowChunks.length = 0;
  tokensHeldEl.textContent = String(BASELINE_TOKENS);
  tokensRawEl.textContent = String(BASELINE_TOKENS);
  chunkSpacer.style.flexGrow = String(CAPACITY - BASELINE_TOKENS);
  windowCaption.textContent =
    "The window always carries a fixed cost before your first message even arrives.";
}

function gotchaHeldTotal() {
  return (
    GOTCHA_BASELINE +
    gotchaChunks.reduce((sum, chunk) => sum + (chunk.evicted ? GOTCHA_STUB : chunk.tokens), 0)
  );
}

function gotchaOldestLive() {
  return gotchaChunks.find((chunk) => !chunk.evicted);
}

function addGotchaChunk(turn) {
  const el = document.createElement("div");
  const tagClass = turn.tag ? ` chunk-${turn.tag}` : "";
  el.className = `chunk role-${turn.role}${tagClass}`;
  el.style.flexGrow = "0";
  const change = readableChange(turn);
  el.title = `${change} — ${turn.tokens} tok`;

  gotchaBar.insertBefore(el, gotchaSpacer);

  el.getBoundingClientRect();
  requestAnimationFrame(() => {
    el.style.flexGrow = String(turn.tokens);
  });
  flash(el, turn.tag === "mistake" ? "flash-mistake" : "flash-new");

  const chunk = { tokens: turn.tokens, evicted: false, el, change };
  gotchaChunks.push(chunk);
  return chunk;
}

function gotchaStep() {
  if (gotchaIndex >= GOTCHA_TURNS.length) {
    gotchaChunks.forEach((chunk) => chunk.el.remove());
    gotchaChunks.length = 0;
    gotchaIndex = 0;
    gotchaHeldEl.textContent = String(GOTCHA_BASELINE);
    gotchaSpacer.style.flexGrow = String(GOTCHA_CAPACITY - GOTCHA_BASELINE);
    gotchaCaption.textContent = 'Click "Step" to send the first message.';
    gotchaStepBtn.textContent = "Step →";
    gotchaReveal.hidden = true;
    gotchaReveal.classList.remove("visible");
    return;
  }

  const turn = GOTCHA_TURNS[gotchaIndex];
  const justAdded = addGotchaChunk(turn);

  while (gotchaHeldTotal() > GOTCHA_CAPACITY) {
    const oldest = gotchaOldestLive();
    if (!oldest || oldest === justAdded) {
      break;
    }
    oldest.evicted = true;
    oldest.el.classList.add("evicted");
    oldest.el.style.flexGrow = String(GOTCHA_STUB);
    oldest.el.title = `${oldest.change} (compacted)`;
    flash(oldest.el, "flash-evicted");
  }

  gotchaHeldEl.textContent = String(gotchaHeldTotal());
  gotchaSpacer.style.flexGrow = String(Math.max(0, GOTCHA_CAPACITY - gotchaHeldTotal()));
  gotchaCaption.textContent = turn.caption;
  gotchaIndex += 1;

  if (turn.tag === "mistake") {
    revealOnce(gotchaReveal);
  }

  if (gotchaIndex >= GOTCHA_TURNS.length) {
    gotchaStepBtn.textContent = "Restart";
  }
}

gotchaStepBtn.addEventListener("click", gotchaStep);

// Cost calculator: reuses Act 2's own BASELINE_TOKENS/CAPACITY so the
// "70-token window" here is honestly the same number the visitor just
// watched fill above, not a made-up figure.
const AVG_TOKENS = Math.round(TURNS.reduce((sum, turn) => sum + turn.tokens, 0) / TURNS.length);

function updateCalculator() {
  const turns = Number(calcInput.value);
  let naive = 0;
  let windowed = 0;
  for (let i = 1; i <= turns; i += 1) {
    const callTokens = BASELINE_TOKENS + i * AVG_TOKENS;
    naive += callTokens;
    windowed += Math.min(callTokens, CAPACITY);
  }
  calcTurnsValueEl.textContent = String(turns);
  calcNaiveEl.textContent = naive.toLocaleString();
  calcWindowedEl.textContent = windowed.toLocaleString();
  calcRatioEl.textContent = `${(naive / windowed).toFixed(1)}×`;
}

calcInput.addEventListener("input", updateCalculator);
updateCalculator();

// Quiz: one prediction per section above, recapping the same mechanic
// rather than introducing new material. A single delegated click handler
// on the section covers all four questions instead of one listener each.
const quizSection = document.getElementById("quiz");
const quizScoreEl = document.getElementById("quiz-score");
const QUIZ_TOTAL = document.querySelectorAll(".quiz-question").length;
let quizScore = 0;
let quizAnswered = 0;

quizSection.addEventListener("click", (event) => {
  const option = event.target.closest(".quiz-option");
  if (!option) {
    return;
  }

  const question = option.closest(".quiz-question");
  if (question.classList.contains("answered")) {
    return;
  }
  question.classList.add("answered");

  const options = question.querySelectorAll(".quiz-option");
  options.forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.correct === "true") {
      btn.classList.add("correct");
    }
  });

  const isRight = option.dataset.correct === "true";
  if (!isRight) {
    option.classList.add("incorrect");
  }

  const feedback = question.querySelector(".quiz-feedback");
  feedback.textContent = question.dataset.explanation;
  feedback.hidden = false;

  quizAnswered += 1;
  if (isRight) {
    quizScore += 1;
  }
  quizScoreEl.textContent =
    `Score: ${quizScore}/${QUIZ_TOTAL}` + (quizAnswered === QUIZ_TOTAL ? " — that's all four." : "");
});

function step() {
  if (turnIndex >= TURNS.length) {
    turnIndex = 0;
    transcript.innerHTML = "";
    resetLanes();
    resetReveals();
    stepButton.textContent = "Step →";
    caption.textContent = 'Click "Step" to send the first message.';
    return;
  }

  const turn = TURNS[turnIndex];
  appendTurn(turn);
  updateLanes(turn);
  updateBundle(turnIndex);
  revealOnce(bundle);
  caption.textContent = turn.caption;
  turnIndex += 1;

  if (turnIndex >= TURNS.length) {
    stepButton.textContent = "Restart";
    revealOnce(loopReveal);
  }
}

stepButton.addEventListener("click", step);

// Act 2 runs as its own ambient loop, decoupled from Act 1's Step button —
// it's here to show "the window fills, evicts, repeats" on its own
// timeline, not to mirror every click Act 1 gets. The speed is adjustable
// at runtime; 900ms was the original pace, so index 1 (1/4 that speed)
// is where the loop starts.
const AMBIENT_SPEEDS_MS = [3600 * 4, 3600 * 2, 3600, 1800, 900, 450];
const AMBIENT_SPEED_LABELS = ["0.0625×", "0.125×", "0.25×", "0.5×", "1×", "2×"];
let ambientSpeedIndex = 2;
let ambientIndex = 0;
let ambientTimer = null;

function ambientTick() {
  if (ambientIndex >= TURNS.length) {
    resetContextWindow();
    ambientIndex = 0;
    return;
  }
  updateContextWindow(TURNS[ambientIndex]);
  ambientIndex += 1;
}

function restartAmbientTimer() {
  if (ambientTimer !== null) {
    clearInterval(ambientTimer);
  }
  ambientTimer = setInterval(ambientTick, AMBIENT_SPEEDS_MS[ambientSpeedIndex]);
}

function updateSpeedControls() {
  ambientSpeedEl.textContent = AMBIENT_SPEED_LABELS[ambientSpeedIndex];
  speedDownBtn.disabled = ambientSpeedIndex === 0;
  speedUpBtn.disabled = ambientSpeedIndex === AMBIENT_SPEEDS_MS.length - 1;
}

speedDownBtn.addEventListener("click", () => {
  if (ambientSpeedIndex === 0) {
    return;
  }
  ambientSpeedIndex -= 1;
  updateSpeedControls();
  restartAmbientTimer();
});

speedUpBtn.addEventListener("click", () => {
  if (ambientSpeedIndex === AMBIENT_SPEEDS_MS.length - 1) {
    return;
  }
  ambientSpeedIndex += 1;
  updateSpeedControls();
  restartAmbientTimer();
});

updateSpeedControls();
resetContextWindow();
restartAmbientTimer();
