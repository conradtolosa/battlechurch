// Unit test for the cloud API's Google sign-in (functions/api/[[path]].js),
// run in Node with an in-memory SQLite stand-in for D1 and a fake Google
// signing key. No network or Cloudflare needed.
// Usage: node --experimental-sqlite dev/tests/api_google.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { onRequest } = await import(path.join(root, "functions/api/[[path]].js"));

let failures = 0, passes = 0;
const check = (name, ok, detail = "") => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}  ${detail}`); }
};

// D1-like wrapper over node:sqlite.
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(path.join(root, "db/schema.sql"), "utf8"));
const DB = {
  prepare(sql) {
    let args = [];
    const stmt = sqlite.prepare(sql);
    const api = {
      bind: (...a) => { args = a; return api; },
      first: async () => stmt.get(...args) ?? null,
      run: async () => { stmt.run(...args); return { success: true }; },
    };
    return api;
  },
};

// Fake Google key pair + JWKS served by a stubbed fetch.
const CLIENT_ID = "test-client.apps.googleusercontent.com";
const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
globalThis.fetch = async (url) => {
  if (String(url).includes("googleapis.com/oauth2/v3/certs")) return new Response(JSON.stringify({ keys: [jwk] }));
  throw new Error(`unexpected fetch ${url}`);
};
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");
async function makeToken(claims, { key = privateKey, kid = "k1" } = {}) {
  const head = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(new Uint8Array(sig))}`;
}
const claims = (over = {}) => ({
  iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "google-123", email: "pastor@example.com",
  name: "Pastor Test", picture: "https://example.com/p.png", nonce: "n1",
  exp: Math.floor(Date.now() / 1000) + 600, ...over,
});

const env = { DB, GOOGLE_CLIENT_ID: CLIENT_ID };
// A tiny cookie-keeping client.
function client() {
  let cookie = "";
  return async (method, p, body) => {
    const headers = { "Content-Type": "application/json" };
    if (cookie) headers.Cookie = cookie;
    const request = new Request(`https://x.test/api/${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = await onRequest({ request, env, params: { path: p.split("/") } });
    const set = res.headers.get("Set-Cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json() };
  };
}

// 1. Guest saves, then signs in with a new Google account: progress kept.
const a = client();
const guest = (await a("GET", "session")).body;
check("starts as guest", guest.isAnonymous === true && guest.googleClientId === CLIENT_ID);
await a("PUT", "save", { activeSaveId: "save_1", saveFiles: { save_1: { saveName: "Mine" } } });
const signed = await a("POST", "auth/google", { idToken: await makeToken(claims()), nonce: "n1" });
check("google sign-in accepted", signed.status === 200 && signed.body.provider === "google", JSON.stringify(signed.body));
check("guest upgraded in place (same player)", signed.body.uid === guest.uid);
check("profile stored", signed.body.email === "pastor@example.com" && signed.body.displayName === "Pastor Test");
check("progress kept after sign-in", (await a("GET", "save")).body.data?.saveFiles?.save_1?.saveName === "Mine");

// 2. Another device: guest, then signs in to the same Google account -> same saves.
const b = client();
const guestB = (await b("GET", "session")).body;
const signedB = await b("POST", "auth/google", { idToken: await makeToken(claims({ nonce: "n2" })), nonce: "n2" });
check("second device lands on the same player", signedB.body.uid === guest.uid && guestB.uid !== guest.uid);
check("second device sees the saves", (await b("GET", "save")).body.data?.saveFiles?.save_1?.saveName === "Mine");

// 3. Sign out -> fresh guest with no save.
const out = await b("POST", "auth/signout", {});
check("sign out gives a new guest", out.body.isAnonymous && out.body.uid !== guest.uid);
check("signed-out guest has no save", (await b("GET", "save")).body.data === null);

// 4. Bad tokens are rejected.
const c = client();
await c("GET", "session");
const otherKey = (await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"])).privateKey;
for (const [name, tokenP, nonce] of [
  ["forged signature", makeToken(claims(), { key: otherKey }), "n1"],
  ["wrong app (aud)", makeToken(claims({ aud: "someone-else" })), "n1"],
  ["expired", makeToken(claims({ exp: Math.floor(Date.now() / 1000) - 10 })), "n1"],
  ["wrong issuer", makeToken(claims({ iss: "https://evil.example" })), "n1"],
  ["nonce mismatch", makeToken(claims()), "other"],
  ["garbage", Promise.resolve("not-a-token"), "n1"],
]) {
  const r = await c("POST", "auth/google", { idToken: await tokenP, nonce });
  check(`rejects ${name}`, r.status === 401, `${r.status} ${JSON.stringify(r.body)}`);
}
check("still a guest after rejected tokens", (await c("GET", "session")).body.isAnonymous === true);

// 5. Not configured -> clear error code.
const saved = env.GOOGLE_CLIENT_ID;
env.GOOGLE_CLIENT_ID = "";
const nc = await c("POST", "auth/google", { idToken: "x", nonce: "n" });
check("not set up -> auth/operation-not-allowed", nc.status === 503 && nc.body.code === "auth/operation-not-allowed");
env.GOOGLE_CLIENT_ID = saved;

console.log(failures ? `${failures} check(s) failed, ${passes} passed` : `all ${passes} checks passed`);
process.exit(failures ? 1 : 0);
