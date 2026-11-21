/* Cloud saves + sign-in for Battlechurch (replaces firebase.js).
 * Talks to our own Cloudflare API in functions/api/[[path]].js.
 * Same interface the game used with Firebase:
 *   window.Cloud = { initCloud, loadPlayerDoc, savePlayerDoc,
 *                    resetPlayerProgress, signInWithGoogle, signOut }
 * and the globals window.cloudUid / cloudIsAnonymous / cloudAuthProvider /
 * cloudEmail / cloudDisplayName / cloudPhotoUrl / cloudLastAuthError*.
 * Also sends uncaught errors to /api/error (crash reports).
 */
(function setupCloud(window) {
  if (!window) return;
  let user = null;
  let initPromise = null;

  function cloudError(code, message) {
    const err = new Error(message || code);
    err.code = code;
    return err;
  }

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_e) {}
    if (!res.ok) throw cloudError(data?.code || `cloud/http-${res.status}`, data?.error || `HTTP ${res.status}`);
    return data;
  }

  function setUser(info) {
    user = info || null;
    window.cloudUid = user?.uid || null;
    window.cloudIsAnonymous = Boolean(user?.isAnonymous);
    window.cloudAuthProvider = user ? user.provider : null;
    window.cloudEmail = user?.email || null;
    window.cloudDisplayName = user?.displayName || null;
    window.cloudPhotoUrl = user?.photoUrl || null;
  }

  function setLastAuthError(err) {
    window.cloudLastAuthErrorCode = err?.code || null;
    window.cloudLastAuthErrorMessage = err?.message || null;
  }

  function initCloud() {
    if (initPromise) return initPromise;
    initPromise = api("session").then((info) => {
      setUser(info);
      return user;
    }).catch((err) => {
      initPromise = null; // allow a retry later (e.g. offline at first)
      throw err;
    });
    return initPromise;
  }

  async function loadPlayerDoc() {
    await initCloud();
    const res = await api("save");
    return res?.data || null;
  }

  async function savePlayerDoc(data) {
    if (!data || typeof data !== "object") return false;
    await initCloud();
    await api("save", { method: "PUT", body: data });
    return true;
  }

  async function resetPlayerProgress() {
    await initCloud();
    await api("save/reset", { method: "POST", body: {} });
    return true;
  }

  // Google sign-in in a popup (OpenID Connect, id_token flow). The popup must
  // open right away, inside the click, or browsers block it.
  function signInWithGoogle() {
    const popup = window.open("about:blank", "battlechurch-google", "width=480,height=640");
    return (async () => {
      if (!popup) {
        const err = cloudError("auth/popup-blocked", "Popup was blocked");
        setLastAuthError(err);
        throw err;
      }
      try {
        await initCloud();
        const clientId = user?.googleClientId;
        if (!clientId) throw cloudError("auth/operation-not-allowed", "Google sign-in is not set up yet");
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const state = Math.random().toString(36).slice(2);
        const redirectUri = `${window.location.origin}/auth/google/`;
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "id_token",
          scope: "openid email profile",
          nonce,
          state,
          prompt: "select_account",
        });
        popup.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
        const idToken = await new Promise((resolve, reject) => {
          const onMessage = (event) => {
            if (event.origin !== window.location.origin || event.data?.type !== "battlechurch-google") return;
            if (event.data.state !== state) return;
            cleanup();
            if (event.data.idToken) resolve(event.data.idToken);
            else reject(cloudError("auth/" + (event.data.error || "cancelled-popup-request"), event.data.error));
          };
          const timer = setInterval(() => {
            if (popup.closed) { cleanup(); reject(cloudError("auth/popup-closed-by-user")); }
          }, 500);
          const cleanup = () => { clearInterval(timer); window.removeEventListener("message", onMessage); };
          window.addEventListener("message", onMessage);
        });
        setUser(await api("auth/google", { method: "POST", body: { idToken, nonce } }));
        setLastAuthError(null);
        return user;
      } catch (err) {
        try { if (!popup.closed) popup.close(); } catch (_e) {}
        setLastAuthError(err);
        const dismissed = err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request" ||
          err.code === "auth/access_denied";
        if (dismissed) return user;
        throw err;
      }
    })();
  }

  async function signOut() {
    setUser(await api("auth/signout", { method: "POST", body: {} }));
    return user;
  }

  window.Cloud = { initCloud, loadPlayerDoc, savePlayerDoc, resetPlayerProgress, signInWithGoogle, signOut };

  // ── Crash reports ─────────────────────────────────────────────────────────
  let reportsLeft = 10;
  const seen = new Set();
  function report(message, stack) {
    if (reportsLeft <= 0 || !message) return;
    const key = String(message).slice(0, 200);
    if (seen.has(key)) return;
    seen.add(key);
    reportsLeft -= 1;
    try {
      fetch("/api/error", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: String(message), stack: stack ? String(stack) : null, url: window.location.href }),
      }).catch(() => {});
    } catch (_e) {}
  }
  window.addEventListener("error", (e) => report(e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => report(e.reason?.message || String(e.reason), e.reason?.stack));
})(typeof window !== "undefined" ? window : null);
