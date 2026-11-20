// Combo string drills on the practice dummy, done with real touch gestures
// (and the keyboard). Checks each string counts as done.
// Usage: node dev/tests/combo_strings.js [--keyboard] [--only=Smash, Slash]
"use strict";
const H = require("./helpers");

const args = process.argv.slice(2);
const keyboard = args.includes("--keyboard");
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7);

// Each step is one move: a pad path for touch.
const STEP = {
  Slash: [["A", 60]],
  Smash: [["B", 60], ["A", 60]],
  Reap: [["C", 60], ["A", 60]],
  Blast: [["A", 2000]],
};
const KEYS = { A: "ArrowLeft", B: "ArrowDown", C: "ArrowRight" };

async function doStep(page, move) {
  const path = STEP[move];
  if (!keyboard) return H.padGesture(page, path);
  // Keyboard: roll the keys (next down before previous up).
  let prev = null;
  for (const [seg, ms] of path) {
    await page.keyboard.down(KEYS[seg]);
    if (prev) await page.keyboard.up(KEYS[prev]);
    prev = seg;
    await page.waitForTimeout(ms);
  }
  await page.keyboard.up(KEYS[prev]);
}

(async () => {
  const { browser, page, errors } = await H.openGame({ viewport: "fold", touch: !keyboard });
  await H.startTutorialAt(page, "(o) => o.type === 'card'");
  const strings = await page.evaluate(() =>
    TUTORIAL_ARENA_OBJECTIVES.map((o, i) => ({ i, type: o.type, seq: o.sequence, label: o.label }))
      .filter((o) => o.type === "combo_string"));
  H.check("first combo string is Smash, Slash", strings[0]?.seq.join(",") === "Smash,Slash", strings[0]?.label);
  H.check("second combo string is Slash, Smash, Slash", strings[1]?.seq.join(",") === "Slash,Smash,Slash", strings[1]?.label);

  for (const s of strings) {
    const name = s.seq.join(", ");
    if (only && name !== only) continue;
    await page.evaluate((i) => startTutorialArenaObjective(i), s.i);
    await page.waitForTimeout(2500);
    let done = 0;
    for (let rep = 0; rep < 3; rep++) {
      await page.evaluate(() => { player.prayerCharge = player.prayerChargeRequired || 6000; });
      await page.waitForTimeout(3300); // Smash cooldown
      for (const move of s.seq) {
        await page.evaluate(() => {
          const d = enemies.find((e) => e && e.tutorialComboDummy && !e.dead);
          if (d) { player.x = d.x - 40; player.y = d.y; }
        });
        await doStep(page, move);
        await page.waitForTimeout(450);
      }
      await page.waitForTimeout(300);
      done = await page.evaluate(() => tutorialArenaState.moveKillCount);
      const moved = await page.evaluate(() => tutorialArenaState.objectiveIndex);
      if (moved !== s.i) { done = 99; break; } // objective finished and advanced
    }
    H.check(`${name}: strings counted`, done >= 2, `${done === 99 ? "completed" : done + "/3"}`);
  }
  H.check("no page errors", !errors.length, errors.slice(0, 3).join(" | "));
  await browser.close();
  H.finish();
})().catch((e) => { console.error("CRASHED", e); process.exit(2); });
