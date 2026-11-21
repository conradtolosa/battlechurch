// Battlechurch cloud API (Cloudflare Pages Function, handles every /api/* URL).
// Replaces Firebase: guest + Google sign-in, one save record per player, and
// crash reports. Storage: D1 database bound as `DB` (schema in db/schema.sql).
// Settings (Pages project env vars): GOOGLE_CLIENT_ID.
//
//   GET  /api/session        current player (creates a guest on first visit)
//   GET  /api/save           { data } — the player's whole save, or null
//   PUT  /api/save           body = whole save object (overwrites)
//   POST /api/save/reset     replace the save with a fresh one
//   POST /api/auth/google    { idToken, nonce } — sign in with Google
//   POST /api/auth/signout   back to a new guest
//   POST /api/error          { message, stack, url } — crash report
//
// The player is always taken from the session cookie, never from the request,
// so nobody can read or change another player's save.

const COOKIE = "bc_session";
const SESSION_DAYS = 365;
const MAX_SAVE_BYTES = 1_500_000;
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

const randomToken = (bytes = 32) => {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

function playerInfo(p, env) {
  return {
    uid: p.id,
    isAnonymous: !p.google_sub,
    provider: p.google_sub ? "google" : "anonymous",
    email: p.email || null,
    displayName: p.display_name || null,
    photoUrl: p.photo_url || null,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
  };
}

async function newSession(env, playerId) {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, player_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), playerId, now, now + SESSION_DAYS * 86400_000)
    .run();
  return token;
}

async function newGuest(env) {
  const id = `p_${randomToken(16)}`;
  const now = Date.now();
  await env.DB.prepare("INSERT INTO players (id, created_at, updated_at) VALUES (?, ?, ?)").bind(id, now, now).run();
  const token = await newSession(env, id);
  const player = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
  return { player, token };
}

// The signed-in player, or a brand-new guest (then `token` is set and the
// response must carry the new cookie).
async function currentPlayer(request, env, { create = true } = {}) {
  const token = readCookie(request, COOKIE);
  if (token) {
    const player = await env.DB.prepare(
      "SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ? AND s.expires_at > ?",
    ).bind(await sha256(token), Date.now()).first();
    if (player) return { player, token: null };
  }
  if (!create) return { player: null, token: null };
  return newGuest(env);
}

const withCookie = (token) => (token ? { "Set-Cookie": sessionCookie(token) } : {});

function freshSave() {
  const now = Date.now();
  const mapProgress = { version: 2, districts: {}, unlockedDistrictIds: [] };
  return {
    saveFiles: {
      save_1: { saveName: "Save 1", playerName: "Pastor", createdAt: now, lastPlayedAt: now, playtimeSec: 0, mapProgress },
    },
    activeSaveId: "save_1",
    mapProgress,
  };
}

// ── Google ID token check (RS256 against Google's published keys) ──────────
let googleKeys = { at: 0, keys: [] };
async function getGoogleKeys() {
  if (Date.now() - googleKeys.at < 3600_000 && googleKeys.keys.length) return googleKeys.keys;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error("could not fetch Google keys");
  googleKeys = { at: Date.now(), keys: (await res.json()).keys || [] };
  return googleKeys.keys;
}

const b64urlBytes = (s) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function verifyGoogleIdToken(idToken, clientId, nonce) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
  if (header.alg !== "RS256") throw new Error("bad alg");
  const jwk = (await getGoogleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new Error("bad signature");
  if (!GOOGLE_ISSUERS.has(claims.iss)) throw new Error("bad issuer");
  if (claims.aud !== clientId) throw new Error("wrong client");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("expired");
  if (!nonce || claims.nonce !== nonce) throw new Error("bad nonce");
  if (!claims.sub) throw new Error("no subject");
  return claims;
}

// ── Routes ──────────────────────────────────────────────────────────────────
async function handle(request, env, path) {
  const method = request.method;
  const isWrite = method !== "GET" && method !== "HEAD";
  // Writes must be same-site JSON requests (a cross-site page can't send
  // application/json without a CORS preflight, which we never allow).
  if (isWrite && !(request.headers.get("Content-Type") || "").includes("application/json")) {
    return json({ error: "json required" }, 415);
  }

  if (path === "session" && method === "GET") {
    const { player, token } = await currentPlayer(request, env);
    return json(playerInfo(player, env), 200, withCookie(token));
  }

  if (path === "save" && method === "GET") {
    const { player, token } = await currentPlayer(request, env);
    return json({ data: player.data ? JSON.parse(player.data) : null }, 200, withCookie(token));
  }

  if (path === "save" && method === "PUT") {
    const text = await request.text();
    if (text.length > MAX_SAVE_BYTES) return json({ error: "save too large" }, 413);
    let data;
    try { data = JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "save must be an object" }, 400);
    const { player, token } = await currentPlayer(request, env);
    await env.DB.prepare("UPDATE players SET data = ?, updated_at = ? WHERE id = ?").bind(text, Date.now(), player.id).run();
    return json({ ok: true }, 200, withCookie(token));
  }

  if (path === "save/reset" && method === "POST") {
    const { player, token } = await currentPlayer(request, env);
    await env.DB.prepare("UPDATE players SET data = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(freshSave()), Date.now(), player.id).run();
    return json({ ok: true }, 200, withCookie(token));
  }

  if (path === "auth/google" && method === "POST") {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: "google sign-in not set up", code: "auth/operation-not-allowed" }, 503);
    const body = await request.json().catch(() => ({}));
    let claims;
    try {
      claims = await verifyGoogleIdToken(body.idToken, env.GOOGLE_CLIENT_ID, body.nonce);
    } catch (e) {
      return json({ error: `google token rejected: ${e.message}`, code: "auth/invalid-credential" }, 401);
    }
    const now = Date.now();
    const profile = [claims.email || null, claims.name || null, claims.picture || null];
    const { player: current } = await currentPlayer(request, env, { create: false });
    const existing = await env.DB.prepare("SELECT * FROM players WHERE google_sub = ?").bind(claims.sub).first();
    let playerId;
    if (existing) {
      // Known Google account: switch to it (like Firebase, the guest's
      // progress stays with the guest).
      playerId = existing.id;
      await env.DB.prepare("UPDATE players SET email = ?, display_name = ?, photo_url = ?, updated_at = ? WHERE id = ?")
        .bind(...profile, now, playerId).run();
    } else if (current && !current.google_sub) {
      // New Google account: upgrade this guest in place, keeping progress.
      playerId = current.id;
      await env.DB.prepare("UPDATE players SET google_sub = ?, email = ?, display_name = ?, photo_url = ?, updated_at = ? WHERE id = ?")
        .bind(claims.sub, ...profile, now, playerId).run();
    } else {
      playerId = `p_${randomToken(16)}`;
      await env.DB.prepare("INSERT INTO players (id, google_sub, email, display_name, photo_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(playerId, claims.sub, ...profile, now, now).run();
    }
    const oldToken = readCookie(request, COOKIE);
    if (oldToken) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(oldToken)).run();
    const token = await newSession(env, playerId);
    const player = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first();
    return json(playerInfo(player, env), 200, withCookie(token));
  }

  if (path === "auth/signout" && method === "POST") {
    const oldToken = readCookie(request, COOKIE);
    if (oldToken) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(oldToken)).run();
    const { player, token } = await newGuest(env);
    return json(playerInfo(player, env), 200, withCookie(token));
  }

  if (path === "error" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { player } = await currentPlayer(request, env, { create: false });
    const cut = (v, n) => (v == null ? null : String(v).slice(0, n));
    await env.DB.prepare("INSERT INTO errors (at, player_id, message, stack, url, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(Date.now(), player?.id || null, cut(body.message, 500), cut(body.stack, 4000), cut(body.url, 300),
        cut(request.headers.get("User-Agent"), 300))
      .run();
    // Keep the table small: drop reports older than 90 days now and then.
    if (Math.random() < 0.02) {
      await env.DB.prepare("DELETE FROM errors WHERE at < ?").bind(Date.now() - 90 * 86400_000).run();
    }
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

export async function onRequest({ request, env, params }) {
  if (!env.DB) return json({ error: "database not configured" }, 503);
  const path = [].concat(params.path || []).join("/");
  try {
    return await handle(request, env, path);
  } catch (e) {
    return json({ error: "server error", detail: String(e && e.message || e).slice(0, 200) }, 500);
  }
}
