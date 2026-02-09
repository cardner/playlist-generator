const path = require("node:path");
const { toMatchImageSnapshot } = require("jest-image-snapshot");

// Inlined to avoid ESM import (getStoryContext, waitForPageReady) - Jest can't load ESM
function getStoryContext(page, context) {
  return page.evaluate(
    ({ storyId }) => globalThis.__getContext(storyId),
    { storyId: context.id }
  );
}
async function waitForPageReady(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

module.exports = {
  setup() {
    expect.extend({ toMatchImageSnapshot });
  },
  async preVisit(page) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    if (storyContext.tags?.includes("no-screenshot")) return;

    await waitForPageReady(page);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
    await page.waitForFunction(() =>
      Array.from(document.images).every((i) => i.complete)
    );

    const image = await page.screenshot({
      animations: "disabled",
      caret: "hide",
    });

    expect(image).toMatchImageSnapshot({
      customSnapshotsDir: path.join(process.cwd(), "__image_snapshots__"),
      customSnapshotIdentifier: context.id.replace(/\//g, "-"),
    });
  },
};
