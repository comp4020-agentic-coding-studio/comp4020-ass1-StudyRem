// Act 1: the tool-call loop, stepped through one turn at a time.
// Scenario: "the tests are failing, can you fix it?" — scripted so the loop
// visibly repeats (run_tests -> read_file -> edit_file -> run_tests) before
// the model gives a final answer, rather than a single call-and-response.
const TURNS = [
  {
    role: "user",
    label: "User",
    content: "The tests are failing, can you fix it?",
    caption:
      "Your message arrives. It looks like it's the only thing being sent — it isn't.",
    tokens: 12,
  },
  {
    role: "model",
    label: "Model → tool call",
    content: "run_tests()",
    caption:
      "The model replies with a tool call, not code. It's a structured request — the model isn't running anything itself.",
    tokens: 4,
  },
  {
    role: "harness",
    label: "Harness → result",
    content: '1 failing: expected sum(2, 3) to be 5, got "23"',
    caption:
      "Something outside the model — the harness — actually ran the tests and captured this result.",
    tokens: 16,
  },
  {
    role: "model",
    label: "Model → tool call",
    content: 'read_file("sum.js")',
    caption:
      "The whole transcript so far goes back to the model, and it asks for another tool.",
    tokens: 6,
  },
  {
    role: "harness",
    label: "Harness → result",
    content: "function sum(a, b) {\n  return a + b; // a, b arrive as strings\n}",
    caption: "The harness reads the file and returns its contents as a block.",
    tokens: 22,
  },
  {
    role: "model",
    label: "Model → tool call",
    content: 'edit_file("sum.js", "return Number(a) + Number(b);")',
    caption: "The model proposes a fix — still just a request, not an edit made by the model itself.",
    tokens: 16,
  },
  {
    role: "harness",
    label: "Harness → result",
    content: "file updated",
    caption: "The harness applies the edit and confirms it.",
    tokens: 4,
  },
  {
    role: "model",
    label: "Model → tool call",
    content: "run_tests()",
    caption: "The model checks its own work by asking for the tests again.",
    tokens: 4,
  },
  {
    role: "harness",
    label: "Harness → result",
    content: "3 passing",
    caption: "The harness runs them and reports back.",
    tokens: 4,
  },
  {
    role: "model",
    label: "Model → final answer",
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
const bundleHistoryTok = document.getElementById("bundle-history-tok");
const bundleNewTok = document.getElementById("bundle-new-tok");
const bundleNote = document.getElementById("bundle-note");
const loopReveal = document.getElementById("loop-reveal");
const windowReveal = document.getElementById("window-reveal");

let turnIndex = 0;

const RESET_FLASH_MS = 220;
const ARROW_FIRE_MS = 600;

// Act 2: a fixed-size context window fed by the same steps. The system
// prompt + tool definitions are a permanent, never-evicted cost — the window
// is never actually empty, even before turn one.
const BASELINE_TOKENS = 15;
const CAPACITY = 70;
const STUB_TOKENS = 2;
const windowChunks = [];

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
  [bundle, loopReveal, windowReveal].forEach((el) => {
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
  const historyTokens = TURNS.slice(0, index).reduce((sum, t) => sum + t.tokens, 0);
  const newTokens = TURNS[index].tokens;
  const total = BASELINE_TOKENS + historyTokens + newTokens;

  bundleHistory.style.flexGrow = String(historyTokens);
  bundleNew.style.flexGrow = String(newTokens);
  bundleHistoryTok.textContent = String(historyTokens);
  bundleNewTok.textContent = String(newTokens);
  bundleNote.textContent = `${total} tokens went into this call. Only ${newTokens} of them are new — the rest is system prompt, tool defs, and everything already said.`;
  bundleBar.setAttribute(
    "aria-label",
    `System prompt 9 tokens, tool definitions 6 tokens, history ${historyTokens} tokens, this turn ${newTokens} tokens`,
  );
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

function addChunk(turn) {
  const el = document.createElement("div");
  el.className = `chunk role-${turn.role}`;
  el.style.flexGrow = "0";

  const label = document.createElement("span");
  label.className = "chunk-label";
  label.textContent = turn.label;
  el.append(label);

  contextBar.insertBefore(el, chunkSpacer);

  // Same force-reflow trick as the transcript blocks: start at 0 so the
  // grow-in to its real width actually animates.
  el.getBoundingClientRect();
  requestAnimationFrame(() => {
    el.style.flexGrow = String(turn.tokens);
  });

  const chunk = { tokens: turn.tokens, evicted: false, el };
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
    oldest.el.querySelector(".chunk-label").textContent = "[compacted]";
    evictedCount += 1;
  }

  tokensHeldEl.textContent = String(heldTotal());
  tokensRawEl.textContent = String(rawTotal());
  chunkSpacer.style.flexGrow = String(Math.max(0, CAPACITY - heldTotal()));

  if (evictedCount === 1) {
    windowCaption.textContent =
      "The window's full: the oldest turn just got compacted down to a stub to make room.";
  } else if (evictedCount > 1) {
    windowCaption.textContent = `The window's full: ${evictedCount} older turns just got compacted down to stubs to make room.`;
  } else {
    windowCaption.textContent = `Holding steady — ${heldTotal()} of ${CAPACITY} tokens used.`;
  }

  if (evictedCount > 0) {
    revealOnce(windowReveal);
  }
}

function resetContextWindow() {
  windowChunks.forEach((chunk) => chunk.el.remove());
  windowChunks.length = 0;
  tokensHeldEl.textContent = String(BASELINE_TOKENS);
  tokensRawEl.textContent = String(BASELINE_TOKENS);
  chunkSpacer.style.flexGrow = String(CAPACITY - BASELINE_TOKENS);
  windowCaption.textContent =
    "The window always carries a fixed cost before your first message even arrives.";
}

function step() {
  if (turnIndex >= TURNS.length) {
    turnIndex = 0;
    transcript.innerHTML = "";
    resetLanes();
    resetContextWindow();
    resetReveals();
    stepButton.textContent = "Step →";
    caption.textContent = 'Click "Step" to send the first message.';
    return;
  }

  const turn = TURNS[turnIndex];
  appendTurn(turn);
  updateLanes(turn);
  updateContextWindow(turn);
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
