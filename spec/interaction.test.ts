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

  it("scores a quiz answer and locks the question against a second attempt", async () => {
    const window = await loadPage();
    const question = window.document.querySelector('[data-qid="stateless"]');
    const options = question?.querySelectorAll(".quiz-option");
    const feedback = question?.querySelector(".quiz-feedback") as HTMLElement;
    const scoreEl = window.document.getElementById("quiz-score");

    expect(scoreEl?.textContent).toBe("Score: 0/4");

    options?.[0].dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(feedback.hidden).toBe(false);
    expect(feedback.textContent).not.toBe("");
    expect(scoreEl?.textContent).toBe("Score: 1/4");

    // Second click on the other option in the same question must not count.
    options?.[1].dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(scoreEl?.textContent).toBe("Score: 1/4");
  });

  it("tallies the final score correctly across a mix of right and wrong answers", async () => {
    const window = await loadPage();
    const scoreEl = window.document.getElementById("quiz-score");

    // Answer all four questions with a known mix: right, wrong, right, wrong.
    // The correct option is always index 0, the incorrect one index 1 —
    // this exercises the running tally, not just a single click.
    const picks: [string, number][] = [
      ["stateless", 0],
      ["capacity", 1],
      ["gotcha", 0],
      ["mitigation", 1],
    ];

    for (const [qid, choiceIndex] of picks) {
      const question = window.document.querySelector(`[data-qid="${qid}"]`);
      const options = question?.querySelectorAll(".quiz-option");
      options?.[choiceIndex].dispatchEvent(new window.Event("click", { bubbles: true }));
    }

    expect(scoreEl?.textContent).toBe("Score: 2/4 — that's all four.");
  });
});
