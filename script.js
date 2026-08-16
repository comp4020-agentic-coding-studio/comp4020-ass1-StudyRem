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
  },
  {
    role: "model",
    label: "Model → tool call",
    content: "run_tests()",
    caption:
      "The model replies with a tool call, not code. It's a structured request — the model isn't running anything itself.",
  },
  {
    role: "harness",
    label: "Harness → result",
    content: '1 failing: expected sum(2, 3) to be 5, got "23"',
    caption:
      "Something outside the model — the harness — actually ran the tests and captured this result.",
  },
  {
    role: "model",
    label: "Model → tool call",
    content: 'read_file("sum.js")',
    caption:
      "The whole transcript so far goes back to the model, and it asks for another tool.",
  },
  {
    role: "harness",
    label: "Harness → result",
    content: "function sum(a, b) {\n  return a + b; // a, b arrive as strings\n}",
    caption: "The harness reads the file and returns its contents as a block.",
  },
  {
    role: "model",
    label: "Model → tool call",
    content: 'edit_file("sum.js", "return Number(a) + Number(b);")',
    caption: "The model proposes a fix — still just a request, not an edit made by the model itself.",
  },
  {
    role: "harness",
    label: "Harness → result",
    content: "file updated",
    caption: "The harness applies the edit and confirms it.",
  },
  {
    role: "model",
    label: "Model → tool call",
    content: "run_tests()",
    caption: "The model checks its own work by asking for the tests again.",
  },
  {
    role: "harness",
    label: "Harness → result",
    content: "3 passing",
    caption: "The harness runs them and reports back.",
  },
  {
    role: "model",
    label: "Model → final answer",
    content:
      'Fixed it — sum.js was concatenating strings instead of adding numbers. Tests pass now.',
    caption:
      "Only now does the model reply with plain text and no tool call — that's what ends the loop.",
  },
];

const stepButton = document.getElementById("step-btn");
const caption = document.getElementById("loop-caption");
const transcript = document.getElementById("transcript");

let turnIndex = 0;

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

  item.scrollIntoView({ behavior: "smooth", block: "end" });
}

function step() {
  if (turnIndex >= TURNS.length) {
    turnIndex = 0;
    transcript.innerHTML = "";
    stepButton.textContent = "Step →";
    caption.textContent = 'Click "Step" to send the first message.';
    return;
  }

  const turn = TURNS[turnIndex];
  appendTurn(turn);
  caption.textContent = turn.caption;
  turnIndex += 1;

  if (turnIndex >= TURNS.length) {
    stepButton.textContent = "Restart";
  }
}

stepButton.addEventListener("click", step);
