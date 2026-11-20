// Movement stick (all three touch layouts) and the swipe trail colours.
// Usage: node dev/tests/stick_trail.js [fold|phone|tablet ...]
"use strict";
const H = require("./helpers");

const layouts = process.argv.slice(2).length ? process.argv.slice(2) : ["fold", "phone", "tablet"];

async function stick(viewport) {
  console.log(`-- movement stick (${viewport})`);
  const { browser, page, errors } = await H.openGame({ viewport, touch: true });
  await H.startTutorialAt(page, "(o) => o.type === 'move_wasd'");
  await page.waitForTimeout(1000);
  const geo = () => page.evaluate(() => {
    const b = document.getElementById("moveStick").getBoundingClientRect();
    const p = document.getElementById("arcControl").getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, padY: p.top + p.height / 2 };
  });
  const home = await geo();
  H.check("stick rests level with the pad", Math.abs(home.y - home.padY) <= 4, `${Math.round(home.y)} vs ${Math.round(home.padY)}`);

  const zone = await page.evaluate(() => { const r = document.querySelector(".joystick-area.left").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  // Start outside the resting stick (a touch on the stick itself uses it in place).
  const radius = await page.evaluate(() => document.getElementById("moveStick").getBoundingClientRect().width / 2);
  const spots = [];
  for (const fx of [0.15, 0.3, 0.5, 0.7, 0.85]) for (const fy of [0.1, 0.2, 0.35, 0.5, 0.65, 0.8]) spots.push({ x: Math.round(zone.x + zone.w * fx), y: Math.round(zone.y + zone.h * fy) });
  const start = spots.find((p) => Math.hypot(p.x - home.x, p.y - home.y) > radius + 20) || spots[spots.length - 1];
  const fire = (type, p) => page.evaluate(({ type, p }) => {
    const el = document.elementFromPoint(p.x, p.y) || document.querySelector(".joystick-area.left");
    el.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType: "touch", isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
  }, { type, p });
  const pos = () => page.evaluate(() => ({ x: player.x, y: player.y }));

  await fire("pointerdown", start);
  await page.waitForTimeout(100);
  const down = await geo();
  H.check("stick jumps under the thumb", Math.abs(down.x - start.x) <= 3 && Math.abs(down.y - start.y) <= 3);
  const p0 = await pos();
  await fire("pointermove", { x: start.x + 40, y: start.y + 40 });
  await page.waitForTimeout(700);
  const dir = await page.evaluate(() => ({ down: Input.isActionActive("down"), right: Input.isActionActive("right"), lit: document.querySelectorAll(".stick-arrow.is-on").length }));
  const p1 = await pos();
  H.check("down-right drag moves down-right and lights an arrow", dir.down && dir.right && dir.lit > 0 && p1.x > p0.x && p1.y > p0.y, JSON.stringify(dir));
  // Drag to the far side of the stick zone: the stick follows the thumb.
  const far = spots.reduce((a, b) => (Math.hypot(b.x - start.x, b.y - start.y) > Math.hypot(a.x - start.x, a.y - start.y) ? b : a));
  await fire("pointermove", far);
  await page.waitForTimeout(200);
  const follow = await geo();
  const moved = Math.hypot(follow.x - down.x, follow.y - down.y);
  H.check("stick follows the thumb", moved > 50, `moved ${Math.round(moved)}px`);
  await fire("pointerup", far);
  await page.waitForTimeout(500);
  const back = await geo();
  H.check("stick glides home", Math.abs(back.x - home.x) <= 3 && Math.abs(back.y - home.y) <= 3);

  // A quick tap in the stick zone still presses a tutorial button under it.
  await page.evaluate(() => startTutorialArenaObjective(TUTORIAL_ARENA_OBJECTIVES.findIndex((o) => o.type === "card" && o.label === "Charging")));
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => tutorialArenaState.objectiveIndex);
  await H.tapCanvasButton(page, "tutorialPrev");
  await page.waitForTimeout(600);
  H.check("quick tap on Prev works", (await page.evaluate(() => tutorialArenaState.objectiveIndex)) === before - 1);
  H.check("no page errors", !errors.length, errors.slice(0, 3).join(" | "));
  await browser.close();
}

async function trail() {
  console.log("-- swipe trail (fold)");
  const { browser, page, errors } = await H.openGame({ viewport: "fold", touch: true });
  await H.startTutorialAt(page, "(o) => o.type === 'kill_any'", { endless: true });
  await page.waitForTimeout(2000);
  const swipe = (via) => page.evaluate(async (via) => {
    const arc = document.getElementById("arcControl");
    const pts = via.map((n) => arc.__abcPoint(n));
    const fire = (type, p) => (document.elementFromPoint(p.x, p.y) || arc).dispatchEvent(new PointerEvent(type, { pointerId: 71, pointerType: "touch", isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let pos = pts[0];
    fire("pointerdown", pos);
    await wait(50);
    for (let i = 1; i < pts.length; i++) {
      for (let s = 1; s <= 4; s++) { fire("pointermove", { x: pos.x + ((pts[i].x - pos.x) * s) / 4, y: pos.y + ((pts[i].y - pos.y) * s) / 4 }); await wait(12); }
      pos = pts[i];
    }
    await wait(500);
    const t = arc.querySelector(".abc-trail");
    fire("pointerup", pos);
    return t ? (t.classList.contains("is-combo") ? "gold" : t.classList.contains("is-miss") ? "grey" : "unjudged") : "none";
  }, via);
  for (const [name, via, expect] of [
    ["B->A (Smash) trail", ["B", "A"], "gold"],
    ["A->C (just Slash) trail", ["A", "C"], "grey"],
    ["A->middle->B (Cleave) trail", ["A", "ABC", "B"], "gold"],
    ["C->B (Clash) trail", ["C", "B"], "gold"],
  ]) {
    await H.resetBetweenMoves(page, 4200);
    const got = await swipe(via);
    H.check(name, got === expect, `${got}, expected ${expect}`);
  }
  await page.waitForTimeout(3000);
  const tapTrails = await page.evaluate(async () => {
    const arc = document.getElementById("arcControl");
    const p = arc.__abcPoint("A");
    const el = document.elementFromPoint(p.x, p.y) || arc;
    const ev = (type) => el.dispatchEvent(new PointerEvent(type, { pointerId: 72, pointerType: "touch", isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
    ev("pointerdown");
    await new Promise((r) => setTimeout(r, 80));
    ev("pointerup");
    await new Promise((r) => setTimeout(r, 100));
    return arc.querySelectorAll(".abc-trail").length;
  });
  H.check("a tap draws no trail", tapTrails === 0);
  H.check("no page errors", !errors.length, errors.slice(0, 3).join(" | "));
  await browser.close();
}

(async () => {
  for (const v of layouts) await stick(v);
  await trail();
  H.finish();
})().catch((e) => { console.error("CRASHED", e); process.exit(2); });
