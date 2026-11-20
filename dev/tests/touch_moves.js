// Every move from the touch action pad (or the keyboard), checked by the move
// banner the game shows. Runs in the tutorial's kill_any drill (imps on screen).
// Usage: node dev/tests/touch_moves.js [fold|phone|tablet] [--slow] [--keyboard] [--only=Name]
"use strict";
const H = require("./helpers");

const args = process.argv.slice(2);
const viewport = args.find((a) => !a.startsWith("--")) || "fold";
const slow = args.includes("--slow");
const keyboard = args.includes("--keyboard");
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7);

// [name, expected move, path]. path = [[point, holdMs], ...]; holds of 1000+
// wait for READY. "A+B" etc. are the press-both zones, "ABC" is the center.
// `not` = moves that must NOT appear.
const CASES = [
  ["Tap A", "Slash", [["A", 80]]],
  ["Tap B", "Dash", [["B", 80]]],
  ["Tap C", "Unity Strike", [["C", 80]], { waitAfter: 700 }],
  ["Slide B->A", "Smash", [["B", 60], ["A", 80]]],
  ["Slide A->B", "Cleave", [["A", 60], ["B", 80]]],
  ["Slide C->A", "Reap", [["C", 60], ["A", 80]]],
  ["Slide C->B", "Clash", [["C", 60], ["B", 80]]],
  ["Slide A->C (first move only)", "Slash", [["A", 60], ["C", 80]], { not: ["Unity Strike", "Hedge"], touchOnly: true }],
  ["Slide B->C (first move only)", "Dash", [["B", 60], ["C", 80]], { not: ["Unity Strike", "Trash"], touchOnly: true }],
  ["Hold A", "Blast", [["A", 2000]]],
  ["Hold B", "Crash", [["B", 2000]]],
  ["Hold C", "Purify", [["C", 1500]]],
  ["Hold B, slide A, hold", "Thrash", [["B", 2000], ["A", 2000]]],
  ["Hold A, slide C, hold", "Hedge", [["A", 2000], ["C", 1500]], { not: ["Purify"] }],
  ["Hold C, slide A, hold", "Hedge", [["C", 1500], ["A", 2000]], { not: ["Purify"] }],
  ["Hold B, slide C (tap)", "Trash", [["B", 2000], ["C", 150]], { not: ["Purify"] }],
  ["Hold C, slide B, hold", "Trash", [["C", 1500], ["B", 2000]], { not: ["Purify"] }],
  ["Hold A, B, then C", "Prayer Storm", [["A", 2000], ["B", 2000], ["C", 300]]],
  ["Hold C, A, then B", "Prayer Storm", [["C", 1500], ["A", 2000], ["B", 2000]]],
  ["Press both A+B", "Thrash", [["A+B", 2000]], { touchOnly: true }],
  ["Press both A+C", "Hedge", [["A+C", 2000]], { not: ["Purify"], touchOnly: true }],
  ["Press both B+C", "Trash", [["B+C", 2000]], { not: ["Purify"], touchOnly: true }],
  ["Press center (all three)", "Prayer Storm", [["ABC", 2000]], { touchOnly: true }],
];

const KEYS = { A: "ArrowLeft", B: "ArrowDown", C: "ArrowRight" };
// Keyboard version: a charged key stays held while the next one goes down;
// otherwise the keys roll (next down, then previous up). Note: on keyboard,
// B then A only makes Smash if A goes down while B is still held - a clean
// tap-tap gives just Dash (this was true before the touch work too).
async function keyboardGesture(page, path) {
  const held = [];
  for (let i = 0; i < path.length; i++) {
    const [seg, ms] = path[i];
    const charged = i > 0 && path[i - 1][1] >= 1000;
    await page.keyboard.down(KEYS[seg]);
    if (i > 0 && !charged) await page.keyboard.up(KEYS[held.pop()]);
    held.push(seg);
    await page.waitForTimeout(ms);
  }
  while (held.length) await page.keyboard.up(KEYS[held.pop()]);
}

(async () => {
  const { browser, page, errors } = await H.openGame({ viewport, touch: !keyboard });
  await H.startTutorialAt(page, "(o) => o.type === 'kill_any'", { endless: true });
  await page.waitForTimeout(2500);
  await H.logMoves(page);
  console.log(`touch moves on ${viewport}${slow ? " (slow slides)" : ""}${keyboard ? " (keyboard)" : ""}`);

  for (const [name, expect, path, opt = {}] of CASES) {
    if (only && !name.includes(only)) continue;
    if (keyboard && opt.touchOnly) continue;
    await H.resetBetweenMoves(page);
    const t0 = await H.now(page);
    if (keyboard) await keyboardGesture(page, path);
    else await H.padGesture(page, path, { slow });
    await page.waitForTimeout(opt.waitAfter || 600);
    const got = await H.movesSince(page, t0);
    const list = got.split(" > ");
    const bad = (opt.not || []).filter((m) => list.includes(m));
    H.check(name, list.includes(expect) && !bad.length, `expected ${expect}, got ${got || "nothing"}`);
  }
  const held = await H.heldKeys(page);
  H.check("no keys stuck down afterwards", held === "", held);

  if (!keyboard) {
    await page.tap("#touchPauseButton");
    await page.waitForTimeout(500);
    H.check("pause button pauses", await page.evaluate(() => paused === true));
  }
  H.check("no page errors", !errors.length, errors.slice(0, 3).join(" | "));
  await browser.close();
  H.finish();
})().catch((e) => { console.error("CRASHED", e); process.exit(2); });
