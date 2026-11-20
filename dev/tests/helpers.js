// Shared helpers for the browser tests in dev/tests.
// Not loaded by the game. Needs Playwright: `npm i -D playwright` (or a
// global install) and a local server on BASE_URL (dev/tests/run.sh starts one).
"use strict";

const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://localhost:8765/";

// Screen sizes we care about. "fold" = Galaxy Fold unfolded (controls below
// the game), "phone" = phone in landscape (controls beside the game),
// "tablet" = controls on top of the game.
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  fold: { width: 884, height: 1000 },
  phone: { width: 915, height: 412 },
  tablet: { width: 1180, height: 820 },
};

let failures = 0;

function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  return ok;
}

function finish() {
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Launch a page and wait for the game's assets. `touch: true` emulates a
// touch device (shows the touch controls).
async function openGame({ viewport = "fold", touch = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport] || viewport,
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.gameAssetsLoaded === true, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  return { browser, context, page, errors };
}

// Open the tutorial arena (marked as already seen, so no first-run flow) and
// jump to an objective. `pick` is a function source string, e.g.
// "(o) => o.move === 'Slash'". With `endless`, that drill never completes.
async function startTutorialAt(page, pick, { endless = false } = {}) {
  await page.evaluate(() => {
    localStorage.setItem("battlechurch.tutorialSeen.v1", "1");
    requestTutorialArenaLaunch("title");
  });
  await page.waitForTimeout(600);
  return page.evaluate(({ pick, endless }) => {
    tutorialArenaState.pendingStart = false;
    // eslint-disable-next-line no-eval
    const i = TUTORIAL_ARENA_OBJECTIVES.findIndex(eval(pick));
    if (endless && TUTORIAL_ARENA_OBJECTIVES[i].target) TUTORIAL_ARENA_OBJECTIVES[i].target = 1e9;
    startTutorialArenaObjective(i);
    return i;
  }, { pick, endless });
}

// Record every move banner the game shows (window.__bannerLog).
async function logMoves(page) {
  await page.evaluate(() => {
    window.__bannerLog = [];
    let last = 0;
    const poll = () => {
      const b = window.__moveAnnouncementBanner;
      if (b && b.shownAt !== last) {
        last = b.shownAt;
        window.__bannerLog.push({ t: b.shownAt, move: b.moveName });
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

const now = (page) => page.evaluate(() => performance.now());
const movesSince = (page, t0) =>
  page.evaluate((t) => window.__bannerLog.filter((e) => e.t >= t).map((e) => e.move).join(" > "), t0);

// Full prayer + time for cooldowns (rush 3s, Trash roll 2.5s) to clear.
async function resetBetweenMoves(page, ms = 4500) {
  await page.evaluate(() => { if (player) player.prayerCharge = player.prayerChargeRequired || 6000; });
  await page.waitForTimeout(ms);
}

// Touch gesture on the action pad. `path` = [[point, holdMs], ...] where point
// is "A", "B", "C", "A+B", "A+C", "B+C" or "ABC" (see arcEl.__abcPoint in
// input.js). Holds of 1000ms+ mean "charge": wait for that button's charge
// meter to say READY (max 4s), like a player would. `slow` slides take ~0.45s.
function padGesture(page, path, { pointerId = 11, slow = false } = {}) {
  return page.evaluate(async ({ path, pointerId, slow }) => {
    const arc = document.getElementById("arcControl");
    const at = (name) => arc.__abcPoint(name);
    const fire = (type, p) =>
      (document.elementFromPoint(p.x, p.y) || arc).dispatchEvent(
        new PointerEvent(type, {
          pointerId, pointerType: "touch", isPrimary: true,
          clientX: p.x, clientY: p.y, bubbles: true, cancelable: true,
        }),
      );
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const hold = async (seg, ms) => {
      if (ms < 1000) { await sleep(ms); return; }
      const t0 = performance.now();
      while (performance.now() - t0 < 4000) {
        const segs = seg.length === 1 ? [seg] : seg === "ABC" ? ["A", "B", "C"] : seg.split("+");
        const ready = segs.every((s) => arc.querySelector(`.abc-charge-ring[data-seg="${s}"]`)?.classList.contains("is-full"));
        if (ready) break;
        await sleep(30);
      }
      await sleep(seg === "C" && ms < 1500 ? 150 : 200);
    };
    let pos = at(path[0][0]);
    fire("pointerdown", pos);
    await hold(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) {
      const to = at(path[i][0]);
      const steps = slow ? 15 : 3;
      for (let s = 1; s <= steps; s++) {
        fire("pointermove", { x: pos.x + ((to.x - pos.x) * s) / steps, y: pos.y + ((to.y - pos.y) * s) / steps });
        await sleep(slow ? 30 : 10);
      }
      pos = to;
      await hold(path[i][0], path[i][1]);
    }
    fire("pointerup", pos);
  }, { path, pointerId, slow });
}

// Which A/B/C keys the game currently sees held.
const heldKeys = (page) =>
  page.evaluate(() =>
    ["ArrowLeft", "ArrowDown", "ArrowRight"]
      .filter((k) => keysPressed.has(k))
      .map((k) => ({ ArrowLeft: "A", ArrowDown: "B", ArrowRight: "C" }[k]))
      .join(""),
  );

// Tap a canvas button (tutorial buttons are in window.__tutorialArenaButtons).
async function tapCanvasButton(page, key, { touch = true } = {}) {
  const pt = await page.evaluate((k) => {
    const b = (window.__tutorialArenaButtons || []).find((x) => x.key === k);
    if (!b) return null;
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return { x: r.left + (b.x + b.width / 2) * (r.width / c.width), y: r.top + (b.y + b.height / 2) * (r.height / c.height) };
  }, key);
  if (!pt) throw new Error(`button ${key} not on screen`);
  if (touch) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
}

module.exports = {
  BASE_URL, VIEWPORTS, check, finish, wait, openGame, startTutorialAt, logMoves, now,
  movesSince, resetBetweenMoves, padGesture, heldKeys, tapCanvasButton,
};
