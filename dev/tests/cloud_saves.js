// Cloud saves through the real game screens, against a server that runs the
// API (wrangler pages dev, or a deployed preview). Not part of `run.sh all`
// because the plain python server has no /api.
//   BASE_URL=http://localhost:8788/ node dev/tests/cloud_saves.js
//   (start the server with: npx wrangler pages dev . --port 8788)
"use strict";
const H = require("./helpers");

(async () => {
  const { browser, context, page, errors } = await H.openGame({ viewport: "desktop" });
  const who = () => page.evaluate(() => ({ uid: window.cloudUid, provider: window.cloudAuthProvider }));
  await page.waitForFunction(() => Boolean(window.cloudUid), null, { timeout: 20000 }).catch(() => {});
  const first = await who();
  H.check("signed in as a guest automatically", Boolean(first.uid) && first.provider === "anonymous", JSON.stringify(first));

  // Open cloud save slot 1 the way the title's save picker does (the plain
  // Space-Space path opens the local demo slot instead). The map then creates
  // and stores the player's save.
  await page.evaluate(() => {
    localStorage.setItem("battlechurch.tutorialSeen.v1", "1");
    return openMapFromCloudSave("save_1");
  });
  await page.waitForTimeout(3000);
  H.check("reached the map", await page.evaluate(() => mapActive === true));
  const doc = await page.evaluate(() => window.Cloud.loadPlayerDoc());
  H.check("save exists in the cloud", Boolean(doc && doc.saveFiles && Object.keys(doc.saveFiles).length), JSON.stringify(doc).slice(0, 150));

  // Write a marker, reload, read it back as the same player.
  await page.evaluate(async () => {
    const d = await window.Cloud.loadPlayerDoc();
    d.__testMarker = "kept";
    await window.Cloud.savePlayerDoc(d);
  });
  await page.reload();
  await page.waitForFunction(() => window.gameAssetsLoaded === true, null, { timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.cloudUid), null, { timeout: 20000 }).catch(() => {});
  const again = await who();
  H.check("same player after reload", again.uid === first.uid, `${first.uid} -> ${again.uid}`);
  H.check("save survives reload", (await page.evaluate(() => window.Cloud.loadPlayerDoc()))?.__testMarker === "kept");

  // A different browser profile is a different player and can't see it.
  const other = await (await browser.newContext()).newPage();
  await other.goto(H.BASE_URL);
  const otherDoc = await other.evaluate(async () => {
    await window.Cloud.initCloud();
    return { uid: window.cloudUid, doc: await window.Cloud.loadPlayerDoc() };
  });
  H.check("another player can't see this save", otherDoc.uid !== first.uid && !otherDoc.doc?.__testMarker);

  // Google sign-in when not set up gives a clear message, not a crash.
  page.once("dialog", (d) => d.dismiss());
  const google = await page.evaluate(async () => {
    try { await window.Cloud.signInWithGoogle(); return "no error"; } catch (e) { return e.code; }
  });
  H.check("Google sign-in without a client ID reports operation-not-allowed (or works if set up)",
    google === "auth/operation-not-allowed" || google === "no error", google);

  // Crash reports reach the server.
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/error") && r.method() === "POST", { timeout: 5000 })
    .then(() => true).catch(() => false);
  await page.evaluate(() => setTimeout(() => { throw new Error("cloud_saves test crash"); }, 0));
  H.check("uncaught error is reported to /api/error", await sent);

  const real = errors.filter((e) => !e.includes("cloud_saves test crash"));
  H.check("no page errors", !real.length, real.slice(0, 3).join(" | "));
  await browser.close();
  H.finish();
})().catch((e) => { console.error("CRASHED", e); process.exit(2); });
