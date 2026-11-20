// Tutorial flow: first-run forced tutorial on desktop (Space/Escape), touch
// taps on the tutorial buttons, every objective starts cleanly, the dummy
// section hides NPCs, and the last card finishes the tutorial.
// Usage: node dev/tests/tutorial_flow.js
"use strict";
const H = require("./helpers");

const state = (page) => page.evaluate(() => ({
  title: titleScreenActive,
  map: mapActive,
  tutorial: tutorialArenaMode,
  paused,
  step: tutorialArenaState?.objectiveIndex ?? null,
  type: tutorialArenaState?.currentObjective?.type ?? (tutorialArenaState?.pendingStart ? "pendingStart" : null),
  label: window.__tutorialArenaHud?.label || null,
  buttons: (window.__tutorialArenaButtonLabels || []).map((b) => b.label).join(" / "),
  seen: localStorage.getItem("battlechurch.tutorialSeen.v1"),
}));

async function firstRunDesktop() {
  console.log("-- first run (desktop keyboard)");
  const { browser, page, errors } = await H.openGame({ viewport: "desktop" });
  const press = async (key, ms = 900) => { await page.keyboard.press(key); await page.waitForTimeout(ms); };
  await page.waitForTimeout(500);
  await press(" ");            // Play -> choose save
  await press(" ", 2500);      // New Playthrough
  const pending = await state(page);
  H.check("first save pick forces the tutorial", pending.tutorial && pending.type === "pendingStart", JSON.stringify(pending));
  H.check("Skip Tutorial button shown", pending.buttons.includes("Skip Tutorial"), pending.buttons);
  await press(" ", 1200);      // Start Tutorial -> first card
  const card = await state(page);
  await press(" ", 1200);      // Continue (Space must not pause)
  const next = await state(page);
  H.check("Space continues a card without pausing", card.type === "card" && next.type !== "card" && !next.paused, `${card.type} -> ${next.type}`);

  // Every objective starts without errors.
  const count = await page.evaluate(() => TUTORIAL_ARENA_OBJECTIVES.length);
  for (let i = 0; i < count; i++) {
    await page.evaluate((idx) => startTutorialArenaObjective(idx), i);
    await page.waitForTimeout(250);
  }
  H.check(`all ${count} objectives start`, !errors.length, errors.slice(0, 2).join(" | "));

  await page.evaluate(() => startTutorialArenaObjective(0));
  await page.waitForTimeout(600);
  await press("Escape", 3000);
  const skipped = await state(page);
  H.check("Skip goes to the map and marks tutorial seen", skipped.map && !skipped.tutorial && skipped.seen === "1", JSON.stringify(skipped));

  await page.reload();
  await page.waitForFunction(() => window.gameAssetsLoaded === true, null, { timeout: 90000 });
  await page.waitForTimeout(2000);
  await press(" ");
  await press(" ", 2500);
  const second = await state(page);
  H.check("second visit goes straight to the map", second.map && !second.tutorial, JSON.stringify(second));
  H.check("no page errors (desktop)", !errors.length, errors.slice(0, 3).join(" | "));
  await browser.close();
}

async function touchButtonsAndDummy() {
  console.log("-- tutorial buttons + dummy section (touch, fold)");
  const { browser, page, errors } = await H.openGame({ viewport: "fold", touch: true });
  await page.evaluate(() => {
    localStorage.setItem("battlechurch.tutorialSeen.v1", "1");
    requestTutorialArenaLaunch("title");
  });
  await page.waitForTimeout(600);
  await H.tapCanvasButton(page, "tutorialStart");
  await page.waitForTimeout(1200);
  const start = await state(page);
  H.check("tapping Start Tutorial lands on the first card", start.step === 0 && start.type === "card", JSON.stringify(start));

  const cardIdx = await page.evaluate(() => TUTORIAL_ARENA_OBJECTIVES.findIndex((o) => o.label === "Armored demons"));
  await page.evaluate((i) => startTutorialArenaObjective(i), cardIdx);
  await page.waitForTimeout(800);
  await H.tapCanvasButton(page, "tutorialNext");
  await page.waitForTimeout(1500);
  H.check("one Continue tap goes to the armored step (no double skip)", (await state(page)).type === "kill_armored");

  const drill = await page.evaluate(() => TUTORIAL_ARENA_OBJECTIVES.findIndex((o) => o.type === "kill_any"));
  await page.evaluate((i) => startTutorialArenaObjective(i), drill);
  await page.waitForTimeout(800);
  const npcsBefore = await page.evaluate(() => npcs.length);
  await page.evaluate(() => { tutorialArenaState.anyKillCount = 100; checkTutorialArenaObjectiveComplete(); });
  await page.waitForTimeout(300);
  H.check("finished drill says Objective Complete!", (await state(page)).label === "Objective Complete!");

  await page.evaluate(() => startTutorialArenaObjective(TUTORIAL_ARENA_OBJECTIVES.findIndex((o) => o.type === "combo_string")));
  await page.waitForTimeout(2500);
  const dummy = await page.evaluate(() => ({ npcs: npcs.length, dummy: Boolean(enemies.find((e) => e.tutorialComboDummy)) }));
  H.check("dummy section: dummy present, NPCs hidden", dummy.dummy && dummy.npcs === 0, `${JSON.stringify(dummy)}, before ${npcsBefore}`);
  await page.evaluate(() => startTutorialArenaObjective(TUTORIAL_ARENA_OBJECTIVES.findIndex((o) => o.move === "Prayer Storm")));
  await page.waitForTimeout(500);
  H.check("NPCs come back after the dummy section", (await page.evaluate(() => npcs.length)) === npcsBefore);

  await page.evaluate(() => startTutorialArenaObjective(TUTORIAL_ARENA_OBJECTIVES.length - 1));
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  const end = await page.evaluate(() => Boolean(tutorialArenaState?.finishedReturnAt) || !tutorialArenaMode);
  H.check("Continue on the last card finishes the tutorial", end);

  const pause = await page.locator("#touchPauseButton").boundingBox();
  await page.touchscreen.tap(pause.x + pause.width / 2, pause.y + pause.height / 2);
  await page.waitForTimeout(500);
  H.check("no page errors (touch)", !errors.length, errors.slice(0, 3).join(" | "));
  await browser.close();
}

(async () => {
  await firstRunDesktop();
  await touchButtonsAndDummy();
  H.finish();
})().catch((e) => { console.error("CRASHED", e); process.exit(2); });
