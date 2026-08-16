import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM, type DOMWindow } from "jsdom";
import { describe, expect, it } from "vitest";

// The spec: "the visitor does something that changes what they see — state
// the core interaction plainly enough to write a test for it." The core
// interaction here is the Step button: each click advances the tool-call
// loop, and the page visibly changes as a direct result. This runs the
// BUILT site's real script.js under jsdom (not a mock of it), so it fails
// if the shipped interaction ever stops working, not just the source.
const INDEX = resolve("dist/index.html");

async function loadPage(): Promise<DOMWindow> {
  const dom = await JSDOM.fromFile(INDEX, {
    url: pathToFileURL(INDEX).href,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  // Let the <script> at the end of body finish running and attach its
  // listeners before the test touches the DOM.
  await new Promise((r) => setTimeout(r, 50));
  return dom.window;
}

function click(window: DOMWindow, id: string) {
  window.document
    .getElementById(id)
    ?.dispatchEvent(new window.Event("click", { bubbles: true }));
}

describe("core interaction: stepping the tool-call loop", () => {
  it("starts with an empty transcript", async () => {
    const window = await loadPage();
    expect(window.document.getElementById("transcript")?.children.length).toBe(0);
  });

  it("changes the transcript and caption on the first click", async () => {
    const window = await loadPage();
    const transcript = window.document.getElementById("transcript");
    const caption = window.document.getElementById("loop-caption");
    const captionBefore = caption?.textContent;

    click(window, "step-btn");

    expect(transcript?.children.length).toBe(1);
    expect(caption?.textContent).not.toBe(captionBefore);
  });

  it("adds one new block per click, not a fixed snapshot", async () => {
    const window = await loadPage();
    const transcript = window.document.getElementById("transcript");

    click(window, "step-btn");
    click(window, "step-btn");
    click(window, "step-btn");

    expect(transcript?.children.length).toBe(3);
  });

  it("loops back to empty once the scripted turns run out", async () => {
    const window = await loadPage();
    const transcript = window.document.getElementById("transcript");
    const button = window.document.getElementById("step-btn");

    for (let i = 0; i < 10; i += 1) {
      click(window, "step-btn");
    }
    expect(transcript?.children.length).toBe(10);
    expect(button?.textContent?.trim()).toBe("Restart");

    click(window, "step-btn");
    expect(transcript?.children.length).toBe(0);
    expect(button?.textContent?.trim()).toBe("Step →");
  });

  it("grows the context-window token count on its own ambient loop, independent of Step clicks", async () => {
    const window = await loadPage();
    const held = window.document.getElementById("tokens-held");
    const before = Number(held?.textContent);

    await new Promise((r) => setTimeout(r, 4000));

    expect(Number(held?.textContent)).toBeGreaterThan(before);
  }, 10000);

  it("speeds up the ambient loop when the speed-up button is clicked", async () => {
    const window = await loadPage();
    const label = window.document.getElementById("ambient-speed");
    const before = label?.textContent;

    click(window, "speed-up-btn");

    expect(label?.textContent).not.toBe(before);
  });

  it("reveals the gotcha explainer once the scripted mistake turn plays", async () => {
    const window = await loadPage();
    const reveal = window.document.getElementById("gotcha-reveal");

    expect((reveal as HTMLElement)?.hidden).toBe(true);

    for (let i = 0; i < 7; i += 1) {
      click(window, "gotcha-step-btn");
    }

    expect((reveal as HTMLElement)?.hidden).toBe(false);
  });

  it("updates the cost calculator readout when the slider moves", async () => {
    const window = await loadPage();
    const naive = window.document.getElementById("calc-naive");
    const before = naive?.textContent;
    const input = window.document.getElementById("calc-turns") as HTMLInputElement;

    input.value = "50";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));

    expect(naive?.textContent).not.toBe(before);
  });

  function selectQuizAnswer(window: DOMWindow, qid: string, choiceIndex: number) {
    const question = window.document.querySelector(`[data-qid="${qid}"]`);
    const options = question?.querySelectorAll(".quiz-option");
    options?.[choiceIndex].dispatchEvent(new window.Event("click", { bubbles: true }));
  }

  it("only enables the check button once all four questions have a selection", async () => {
    const window = await loadPage();
    const checkBtn = window.document.getElementById("quiz-check-btn") as HTMLButtonElement;

    expect(checkBtn.disabled).toBe(true);

    selectQuizAnswer(window, "stateless", 0);
    selectQuizAnswer(window, "capacity", 0);
    selectQuizAnswer(window, "gotcha", 0);
    expect(checkBtn.disabled).toBe(true);

    selectQuizAnswer(window, "mitigation", 0);
    expect(checkBtn.disabled).toBe(false);
  });

  it("scores the quiz and shows the result box with the wrong ones listed", async () => {
    const window = await loadPage();

    // Known mix: right, wrong, right, wrong (correct option is always index 0).
    selectQuizAnswer(window, "stateless", 0);
    selectQuizAnswer(window, "capacity", 1);
    selectQuizAnswer(window, "gotcha", 0);
    selectQuizAnswer(window, "mitigation", 1);

    click(window, "quiz-check-btn");

    const result = window.document.getElementById("quiz-result") as HTMLElement;
    const score = window.document.getElementById("quiz-result-score");
    const wrongList = window.document.getElementById("quiz-result-wrong");

    expect(result.hidden).toBe(false);
    expect(score?.textContent).toBe("2/4");
    expect(wrongList?.children.length).toBe(2);
  });

  it("resets the quiz to its initial state on restart", async () => {
    const window = await loadPage();

    selectQuizAnswer(window, "stateless", 0);
    selectQuizAnswer(window, "capacity", 0);
    selectQuizAnswer(window, "gotcha", 0);
    selectQuizAnswer(window, "mitigation", 0);
    click(window, "quiz-check-btn");

    click(window, "quiz-restart-btn");

    const checkBtn = window.document.getElementById("quiz-check-btn") as HTMLButtonElement;
    const restartBtn = window.document.getElementById("quiz-restart-btn") as HTMLButtonElement;
    const allOptions = window.document.querySelectorAll(".quiz-option");

    expect(checkBtn.hidden).toBe(false);
    expect(checkBtn.disabled).toBe(true);
    expect(restartBtn.hidden).toBe(true);
    allOptions.forEach((option) => {
      expect((option as HTMLButtonElement).disabled).toBe(false);
      expect(option.classList.contains("selected")).toBe(false);
      expect(option.classList.contains("correct")).toBe(false);
      expect(option.classList.contains("incorrect")).toBe(false);
    });
  });
});
