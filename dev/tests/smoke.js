// Quick check (~30s): the game loads on desktop and touch with no page errors,
// the title screen runs, the tutorial and dev melee arena open, and a level
// starts and runs for a few seconds.
// Usage: node dev/tests/smoke.js
"use strict";
const H = require("./helpers");

(async () => {
  for (const [viewport, touch] of [["desktop", false], ["fold", true]]) {
    console.log(`-- ${viewport}`);
    const { browser, page, errors } = await H.openGame({ viewport, touch });
    H.check("title screen up", await page.evaluate(() => titleScreenActive === true));
    const missing = await page.evaluate(() =>
      ["requestTutorialArenaLaunch", "startTutorialArenaObjective", "updateGame", "drawHUD"]
        .filter((n) => typeof window[n] !== "function" && typeof globalThis[n] !== "function"));
    H.check("key functions exist", !missing.length, missing.join(", "));
    if (touch) H.check("touch pad wired up", await page.evaluate(() => typeof document.getElementById("arcControl").__abcPoint === "function"));

    await page.evaluate(() => { localStorage.setItem("battlechurch.tutorialSeen.v1", "1"); requestTutorialArenaLaunch("title"); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { tutorialArenaState.pendingStart = false; startTutorialArenaObjective(TUTORIAL_ARENA_OBJECTIVES.findIndex((o) => o.type === "kill_any")); });
    await page.waitForTimeout(2500);
    H.check("tutorial arena running with enemies", await page.evaluate(() => tutorialArenaMode && enemies.length > 0));

    if (!touch) {
      // Dev melee arena (the "Moves List" sandbox), if the launcher exists.
      const dev = await page.evaluate(() => {
        if (typeof exitTutorialArenaToGame === "function") { try { exitTutorialArenaToGame(); } catch (e) { return `exit failed: ${e}`; } }
        if (typeof requestDevMeleeArenaLaunch === "function") { requestDevMeleeArenaLaunch(); return "launched"; }
        return "no launcher";
      });
      await page.waitForTimeout(2500);
      H.check("dev melee arena opens", dev !== "launched" || (await page.evaluate(() => devMeleeArenaMode === true)), dev);
    }
    H.check("no page errors", !errors.length, errors.slice(0, 3).join(" | "));
    await browser.close();
  }
  H.finish();
})().catch((e) => { console.error("CRASHED", e); process.exit(2); });
