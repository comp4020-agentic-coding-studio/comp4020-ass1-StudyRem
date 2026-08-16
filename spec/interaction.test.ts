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

  it("also grows the context-window token count as the direct-consequence mechanic", async () => {
    const window = await loadPage();
    const held = window.document.getElementById("tokens-held");
    const before = Number(held?.textContent);

    click(window, "step-btn");

    expect(Number(held?.textContent)).toBeGreaterThan(before);
  });
});
