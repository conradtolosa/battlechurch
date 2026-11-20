/* Tutorial arena + dev melee arena for Battlechurch.
 * Moved out of game.js unchanged. Loaded by index.html right BEFORE game.js;
 * it shares game.js globals (player, enemies, npcs, ...) at runtime.
 * Rule: top-level values here must be plain literals - they run before
 * game.js exists, so they cannot read game.js variables or call its
 * functions at load time (inside functions is fine).
 * Also holds the battlefield floor helpers the real game uses
 * (updateBattlefieldFloorSelection, DEV_ARENA_FLOOR_OPTIONS).
 */

// ── Dev Arena: Armored Skeleton hint bubbles ─────────────────────────────────
// First hit always shows DEV_ARENA_SKELETON_INTRO. Subsequent hits draw from
// DEV_ARENA_SKELETON_HINTS in shuffled order — every hint appears once before
// any repeats. Edit either list freely.
const DEV_ARENA_SKELETON_INTRO = "Ow! OK fine. I'll give you hints.";
const DEV_ARENA_SKELETON_HINTS = [
  "B/A 'Smash' is great to grab powerups in chaos.",
  "CC 'Pastor Protect' the congregants target enemies near you.",
  "Save the Smite bomb (Charge C) for the final waves.",
  "Max battle bonuses to max congregation.",
  "If congregant loses all faith, save them before they leave.",
  "Smite bomb gives a huge battle bonus so manage prayer meter well.",
];
let devArenaSkeletonHintBubble = null;
let devArenaSkeletonHintNextAt = 0;
let devArenaSkeletonIntroShown = false;
let devArenaSkeletonHintPool = [];   // shuffled pool, refilled when empty
// ─────────────────────────────────────────────────────────────────────────────

const DEV_MELEE_ARENA_HEALTH = 100000;
const DEV_MELEE_ARENA_PRAYER_REFILL_MS = 3000;
const DEV_ARENA_IMP_GROUP_SIZE = 100;
const DEV_ARENA_IMP_RESPAWN_MS = 3000;
const DEV_ARENA_IMP_GRID_COLS = 10;
const DEV_ARENA_IMP_SPACING = 30;
let devMeleeArenaMode = false;
let pendingDevMeleeArenaLaunch = false;
let tutorialArenaMode = false;
let pendingTutorialArenaLaunch = false;
let tutorialArenaReturnRoute = "congregation";
let tutorialArenaLaunchContext = {
  stage: "",
  titleScreenActive: false,
  mapActive: false,
};
// Snapshot of whatever screen/game state was live when the tutorial was opened,
// so "Back to Game" can put the player back exactly where they were.
let tutorialArenaReturnSnapshot = null;
// How long the "Tutorial Complete" banner stays up before returning.
const TUTORIAL_ARENA_FINISHED_RETURN_MS = 3500;
const DEV_MELEE_FEED_MAX = 12;
const DEV_MELEE_COMBO_WINDOW_MS = 1300;
let devMeleeMoveFeed = [];
const DEV_MELEE_CONFIRMED_COMBO_MAX = 8;
let devMeleeConfirmedCombos = [];
let devMeleeComboSerial = 0;
let devArenaBestCombo = null;
let devArenaImpHordeSlots = [];
let devArenaDemonLord = null;
let devArenaDemonLordRespawnAt = 0;
let devArenaFireKeeper = null;
let devArenaFireKeeperRespawnAt = 0;
let devArenaPrayerRefillAt = 0;
let devArenaLastPrayerCharge = null;
const DEV_ARENA_DEMON_LORD_RESPAWN_MS = 3000;
const DEV_ARENA_PICKUP_LIFE = 4;
const DEV_ARENA_PICKUP_EFFECT_DURATION = 3;
const DEV_ARENA_PLAYER_WEAPON_EFFECT_DURATION = 6;
const DEV_ARENA_PICKUP_RESPAWN_DELAY = 1.0;
let devArenaPickupSlots = [];
const TUTORIAL_ARENA_BATCH_SIZE = 100;
const TUTORIAL_ARENA_REINFORCE_THRESHOLD = 50;
const TUTORIAL_ARENA_PRAYER_REFILL_MS = 4000;
const TUTORIAL_ARENA_MOVE_CONTEXT_WINDOW_MS = 2500;
const TUTORIAL_ARENA_SLASH_KILL_WINDOW_MS = 500;
const TUTORIAL_ARENA_CLEAVE_KILL_WINDOW_MS = 500;
// Tutorial chapters. "card" steps pause the action and explain what comes
// next; the rest are short practice drills. Labels ending in "(...)" have the
// parenthetical replaced on screen by the move's button icons.
const TUTORIAL_ARENA_OBJECTIVES = [
  // 1. Basics
  {
    type: "card",
    label: "Welcome to Battlechurch",
    body: "Demons are attacking your town. Your pastor leads the fight, and your congregation fights beside you. First, the basics.",
  },
  { type: "move_wasd", label: "Move with WASD or Xbox Controller", touchLabel: "Move with the stick on the left: up, down, left and right" },
  { type: "kill_any", target: 100, label: "Your pastor fires automatically. Defeat 100 demons" },
  // 2. The point of the game
  {
    type: "card",
    label: "Auto-fire won't win this war",
    body: "Battlechurch is about your three buttons, and combining them. A is your Sword, B is your Dash and C is Prayer, which does many things. Master them and you'll tear through anything.",
    showButtons: true,
  },
  // 3. One button at a time (auto-fire is paused during move drills, so only
  //    the move being learned counts)
  { type: "kill_with_move", move: "Slash", target: 100, label: "A is your Sword. Slash 100 demons (A)" },
  {
    type: "card",
    label: "Cooldowns",
    body: "Some moves need a moment to recharge. After a Dash, the B meter under your pastor empties and refills. Wait for it to fill before you Dash again.",
    touchBody: "Some moves need a moment to recharge. After a Dash, the B button dims, says WAIT and refills like a ring. When it's bright again, you can Dash again.",
  },
  { type: "dash_plus_kills", move: "Dash", dashTarget: 3, killTarget: 0, label: "Dash 3 times. Wait for B to recharge in between (B)" },
  {
    type: "card",
    label: "The Prayer meter",
    body: "C is Prayer, and it uses your Prayer meter: the bar under Health at the top left. Defeating demons fills it back up. Bigger prayer moves use more: a Unity Strike uses 1 bar, Purify uses 2 and Prayer Storm uses all 6. (In this tutorial it refills on its own.)",
    highlight: "prayer",
  },
  {
    type: "kill_with_move",
    move: "Unity Strike",
    target: 100,
    label: "Tap C for a Unity Strike. It uses 1 Prayer bar (C)",
  },
  // 4. Charging
  {
    type: "card",
    label: "Charging",
    body: "Hold a button down to charge it. A charge meter fills while you hold. When it's full, let go to unleash a much stronger attack. Let go early and you just get the normal move.",
    touchBody: "Hold a button down to charge it. A ring fills around the button while you hold, and it says READY when it's full. Then let go to unleash a much stronger attack. Let go early and you just get the normal move.",
  },
  { type: "kill_with_move", move: "Blast", target: 100, label: "Charge A until full, then let go: Blast (Charge A)" },
  { type: "kill_with_move", move: "Crash", target: 100, label: "Charge B until full, then let go: Crash (Charge B)" },
  { type: "kill_with_move", move: "Purify", target: 100, label: "Charge C until full, then let go: Purify (Charge C)" },
  // 5. Quick combos
  {
    type: "card",
    label: "Combos",
    body: "Press one button, then quickly press another, to combo. Combos hit two to three times harder than a single slash. Combos that use B share the Dash cooldown, so wait for B to recharge between them.",
    touchBody: "Slide your thumb quickly from one button to another to combo. Combos hit two to three times harder than a single slash. Combos that use B share the Dash cooldown: wait for the B button to brighten between them.",
  },
  { type: "kill_with_move", move: "Smash", target: 100, label: "Smash: B \u2192 A. Wait for B to recharge (B -> A)", touchLabel: "Smash: slide B \u2192 A. Wait for B to recharge (B -> A)" },
  { type: "kill_with_move", move: "Cleave", target: 100, label: "Cleave: A \u2192 B. Wait for B to recharge (A -> B)", touchLabel: "Cleave: slide A \u2192 B. Wait for B to recharge (A -> B)" },
  { type: "kill_with_move", move: "Reap", target: 100, label: "Reap: C \u2192 A (C -> A)", touchLabel: "Reap: slide C \u2192 A (C -> A)" },
  { type: "kill_with_move", move: "Clash", target: 100, label: "Clash: C \u2192 B (C -> B)", touchLabel: "Clash: slide C \u2192 B (C -> B)" },
  // 6. Why it matters
  {
    type: "card",
    label: "Armored demons",
    body: "Armor shrugs off auto-fire. Get close and use your sword and combos to break through.",
  },
  { type: "kill_armored", target: 3, label: "Defeat 3 armored demons with your sword and combos" },
  // 7. Two-button charges (advanced, optional)
  {
    type: "card",
    label: "Charge two at once",
    body: "Advanced moves charge two buttons together. Hold BOTH buttons down until BOTH charge meters are full, then let go. These are optional: press Continue to practice them, or Skip to start playing.",
    touchBody: "Advanced moves charge two buttons together. Press right on the line between two buttons to hold both (or use two fingers), and hold until both say READY. Then let go. Pressing the very middle, where all three meet, holds all three. These are optional: Continue to practice, or Skip to start playing.",
  },
  { type: "kill_with_move", move: "Thrash", target: 100, label: "Thrash: charge B and A together (Charge B + A)", touchLabel: "Thrash: hold the line between A and B until both are READY (Charge B + A)" },
  { type: "kill_with_move", move: "Hedge", target: 100, label: "Hedge: charge A and C together (Charge A + C)", touchLabel: "Hedge: hold the line between A and C until both are READY (Charge A + C)" },
  { type: "kill_with_move", move: "Trash", target: 100, label: "Trash: charge B, then hold C too (Charge B + C)", touchLabel: "Trash: hold the line between B and C until B is READY (Charge B + C)" },
  { type: "kill_with_move", move: "Prayer Storm", target: 100, label: "Prayer Storm: charge A, B and C together (Charge A + B + C)", touchLabel: "Prayer Storm: hold the middle, where all three meet, until all are READY (Charge A + B + C)" },
  // 8. Combo strings (no congregation: just you and a practice dummy that
  //    walks, swings and can't be defeated)
  {
    type: "card",
    arena: "dummy",
    label: "Combo strings",
    body: "Like combos in fighting games such as Street Fighter or Mortal Kombat, you can string moves together. Each hit within a moment of the last builds a Hit Chain, and every 4th hit knocks the enemy down. Start easy: Smash (B \u2192 A) dashes you in, then A finishes. Practice on the armored dummy: it can't be defeated.",
  },
  {
    type: "combo_string",
    arena: "dummy",
    sequence: ["Smash", "Slash"],
    inputs: "B \u2192 A,  A",
    target: 3,
    label: "Combo string: Smash, Slash. Get close to the dummy first",
    touchLabel: "Combo string: Smash, Slash. Get close first",
  },
  {
    type: "combo_string",
    arena: "dummy",
    sequence: ["Slash", "Smash", "Slash"],
    inputs: "A,  B \u2192 A,  A",
    target: 3,
    label: "Combo string: Slash, Smash, Slash",
  },
  {
    type: "combo_string",
    arena: "dummy",
    sequence: ["Slash", "Smash", "Reap"],
    inputs: "A,  B \u2192 A,  C \u2192 A",
    target: 3,
    label: "Combo string: Slash, Smash, Reap",
  },
  {
    type: "combo_string",
    arena: "dummy",
    sequence: ["Slash", "Reap", "Smash"],
    inputs: "A,  C \u2192 A,  B \u2192 A",
    target: 3,
    label: "Combo string: Slash, Reap, Smash",
  },
  {
    type: "combo_string",
    arena: "dummy",
    sequence: ["Blast", "Smash", "Reap"],
    inputs: "Charge A,  B \u2192 A,  C \u2192 A",
    target: 3,
    label: "Combo string: Blast, Smash, Reap",
  },
  {
    type: "card",
    arena: "dummy",
    label: "Combos to try",
    body: "Smash, Slash (B \u2192 A,  A).   Slash, Smash, Slash (A,  B \u2192 A,  A).   Slash, Smash, Reap (A,  B \u2192 A,  C \u2192 A).   Slash, Reap, Smash (A,  C \u2192 A,  B \u2192 A).   Blast, Smash, Reap (charge A,  B \u2192 A,  C \u2192 A).",
  },
  // 9. Counter Hits and Punish Counters
  {
    type: "card",
    arena: "dummy",
    label: "Counter Hits",
    body: "When an enemy swings at you and misses, it's open for a split second. Hit it right then for a Counter Hit: extra damage and a burst of grace. Step or Dash out of the swing, then strike back fast.",
  },
  { type: "counter_hit", arena: "dummy", target: 3, label: "Dodge the dummy's swing, then hit it: 3 Counter Hits" },
  {
    type: "card",
    arena: "dummy",
    label: "Punish Counters",
    body: "A Counter Hit starts a Punish Counter: keep hitting the same enemy without letting the chain drop, and every hit in that chain does extra damage. Counter Hit, then go straight into a combo string.",
  },
  { type: "punish_counter", arena: "dummy", target: 6, label: "Counter Hit, then keep hitting: 6 Punish Counter hits" },
  // 10. Done
  {
    type: "card",
    label: "You're ready to fight",
    body: "That's everything. Every move is listed under Pause > Moves. Press Continue to start playing.",
  },
];
// The tutorial is forced the first time a player picks a save; this remembers
// (per browser) that they've seen it so it only happens once.
const TUTORIAL_SEEN_STORAGE_KEY = "battlechurch.tutorialSeen.v1";
let tutorialSeenThisSession = false;
// When set, runs after the tutorial closes (e.g. continue on to the map).
let tutorialArenaExitContinuation = null;
// True while the tutorial was forced on a first-time player.
let tutorialArenaFirstRun = false;
const TUTORIAL_ARENA_ARMORED_TYPE = "armoredSkeleton";
// Combo string drills: max gap between one move and the next.
const TUTORIAL_ARENA_COMBO_STRING_GAP_MS = 2500;
// Auto-fire barely scratches these (see Enemy.takeDamage in entities.js), so
// the lesson "use your sword and combos" is unmistakable.
const TUTORIAL_ARENA_ARMORED_HEALTH = 700;
let tutorialArenaState = null;
let tutorialArenaPrayerRefillAt = 0;
let tutorialArenaLastPrayerCharge = null;
let tutorialArenaCurrentMoveContext = { move: "", at: 0 };
let tutorialArenaLaunchLockUntil = 0;
let tutorialArenaSwarmGroupSerial = 0;
let tutorialArenaMoveKillWindowUntilByMove = Object.create(null);

function clearTutorialArenaMoveKillWindows() {
  tutorialArenaMoveKillWindowUntilByMove = Object.create(null);
}

function openTutorialArenaMoveKillWindow(moveName, durationMs) {
  if (!isTutorialArenaActive()) return;
  const key = String(moveName || "");
  if (!key || !Number.isFinite(durationMs) || durationMs <= 0) return;
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  tutorialArenaMoveKillWindowUntilByMove[key] = now + durationMs;
}
const DEV_ARENA_FLOOR_OPTIONS = [
  { key: "floor-A1", label: "Floor A1", src: "assets/backgrounds/floors-arena/floor-A1.png" },
  { key: "floor-A2", label: "Floor A2", src: "assets/backgrounds/floors-arena/floor-A2.png" },
  { key: "floor-A3", label: "Floor A3", src: "assets/backgrounds/floors-arena/floor-A3.png" },
];
let devArenaFloorOptionIndex = 0;
let devArenaFloorDiscoveryStarted = false;
let battlefieldFloorSelectionKey = "";

function registerArenaFloorOption(src) {
  const normalizedSrc = String(src || "").trim();
  if (!normalizedSrc) return false;
  const existing = DEV_ARENA_FLOOR_OPTIONS.some(
    (entry) => String(entry?.src || "").trim().toLowerCase() === normalizedSrc.toLowerCase(),
  );
  if (existing) return false;
  const filename = normalizedSrc.split("/").pop() || normalizedSrc;
  const baseName = filename.replace(/\.[^.]+$/, "");
  const label = baseName
    .replace(/[_-]+/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
  DEV_ARENA_FLOOR_OPTIONS.push({
    key: baseName.toLowerCase(),
    label,
    src: normalizedSrc,
  });
  return true;
}

function discoverArenaFloorOptions() {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  if (devArenaFloorDiscoveryStarted) return;
  devArenaFloorDiscoveryStarted = true;
  const dirUrl = "assets/backgrounds/floors-arena/";
  fetch(dirUrl)
    .then((res) => (res && res.ok ? res.text() : ""))
    .then((html) => {
      if (!html) return;
      const hrefRegex = /href=["']([^"']+\.png)["']/gi;
      let match = null;
      while ((match = hrefRegex.exec(html))) {
        const href = String(match[1] || "").trim();
        if (!href) continue;
        const normalized = href.startsWith("http")
          ? href
          : (href.startsWith("/") ? href.slice(1) : `${dirUrl}${href.replace(/^\.?\//, "")}`);
        registerArenaFloorOption(normalized);
      }
    })
    .catch(() => {});
}

function getDevArenaFloorPickerState() {
  const options = DEV_ARENA_FLOOR_OPTIONS.slice();
  const count = options.length;
  if (!count) {
    return { options: [], index: -1, selected: null };
  }
  const safeIndex = ((Math.floor(devArenaFloorOptionIndex) % count) + count) % count;
  const selected = options[safeIndex] || null;
  return { options, index: safeIndex, selected };
}

function cycleDevArenaFloorOption(delta = 1) {
  const state = getDevArenaFloorPickerState();
  if (!state.options.length) return null;
  const count = state.options.length;
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 1;
  const next = ((state.index + step) % count + count) % count;
  devArenaFloorOptionIndex = next;
  const selected = state.options[next] || null;
  return selected;
}

function randomizeDevArenaFloorOption() {
  discoverArenaFloorOptions();
  const state = getDevArenaFloorPickerState();
  const count = state.options.length;
  if (!count) return null;
  const idx = Math.floor(Math.random() * count);
  devArenaFloorOptionIndex = idx;
  return state.options[idx] || null;
}

function shouldRandomizeBattlefieldFloor(levelStatus) {
  const stage = String(levelStatus?.stage || "");
  const battlefieldNum = Number(levelStatus?.battlefieldNum);
  if (!Number.isFinite(battlefieldNum) || battlefieldNum < 1) return false;
  // Randomize once per battlefield, starting at teaser/intro, then persist
  // through the battlefield combat/victory/grace flow.
  return (
    stage === "briefingTeaser" ||
    stage === "battleIntro" ||
    stage === "briefing" ||
    stage === "waveIntro" ||
    stage === "waveActive" ||
    stage === "allKillBreak" ||
    stage === "waveCleared" ||
    stage === "victoryCelebrate" ||
    stage === "graceRush"
  );
}

function updateBattlefieldFloorSelection(levelStatus) {
  if (!shouldRandomizeBattlefieldFloor(levelStatus)) return;
  const battlefieldNum = Math.max(1, Math.floor(Number(levelStatus?.battlefieldNum) || 1));
  const key = `${activeDistrictId || "none"}:${activeCampaign || "p1"}:${battlefieldNum}`;
  if (key === battlefieldFloorSelectionKey) return;
  battlefieldFloorSelectionKey = key;
  randomizeDevArenaFloorOption();
}

if (typeof window !== "undefined") {
  window.BattlechurchDevArenaFloorPicker = {
    getOptions: () => getDevArenaFloorPickerState().options,
    getSelected: () => getDevArenaFloorPickerState().selected,
    getSelectedSrc: () => getDevArenaFloorPickerState().selected?.src || null,
    getSelectedLabel: () => getDevArenaFloorPickerState().selected?.label || "",
    cycle: (delta = 1) => cycleDevArenaFloorOption(delta),
    randomize: () => randomizeDevArenaFloorOption(),
    setByKey: (key) => {
      const normalized = String(key || "").trim().toLowerCase();
      const idx = DEV_ARENA_FLOOR_OPTIONS.findIndex((entry) => String(entry.key || "").toLowerCase() === normalized);
      if (idx < 0) return null;
      devArenaFloorOptionIndex = idx;
      return DEV_ARENA_FLOOR_OPTIONS[idx];
    },
  };
}

function getDevArenaPickupSlotPositions() {
  const center = getDevMeleeArenaCenter();
  const y = center.y - 260;
  const spacing = 140;
  return [
    { x: center.x - spacing, y },
    { x: center.x,           y },
    { x: center.x + spacing, y },
  ];
}

function initDevArenaPickupSlots() {
  const positions = getDevArenaPickupSlotPositions();
  devArenaPickupSlots = [
    { kind: "playerWeapon", x: positions[0].x, y: positions[0].y, pickup: null, respawnAt: 0 },
    { kind: "npcWeapon",    x: positions[1].x, y: positions[1].y, pickup: null, respawnAt: 0 },
    { kind: "utility",      x: positions[2].x, y: positions[2].y, pickup: null, respawnAt: 0 },
  ];
}

function maintainDevArenaPickups() {
  if (!devArenaPickupSlots.length) initDevArenaPickupSlots();
  if (typeof window !== "undefined") window.__devArenaPickupSlots = devArenaPickupSlots;
  const now = typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
  devArenaPickupSlots.forEach((slot) => {
    if (slot.pickup) {
      if (slot.pickup.expired || slot.pickup.life <= 0 || !slot.pickup.active) {
        slot.pickup = null;
        slot.respawnAt = now + DEV_ARENA_PICKUP_RESPAWN_DELAY;
      }
      return;
    }
    if (now < slot.respawnAt) return;
    const pos = { x: slot.x, y: slot.y };
    if (slot.kind === "playerWeapon") {
      const playerTypes = ["faith", "scripture", "wisdom"];
      const type = playerTypes[Math.floor(Math.random() * playerTypes.length)];
      const def = assets?.weaponPickups?.[type];
      if (def) {
        const pickup = new WeaponPickup({ ...def, type, life: DEV_ARENA_PICKUP_LIFE, speed: 0 });
        pickup.x = slot.x;
        pickup.y = slot.y;
        pickup.baseY = slot.y;
        weaponPickups.push(pickup);
        playPowerupSpawnSfx();
        slot.pickup = pickup;
      }
    } else if (slot.kind === "npcWeapon") {
      const npcTypes = ["npcScripture", "npcWisdom", "npcFaith"];
      const type = npcTypes[Math.floor(Math.random() * npcTypes.length)];
      const def = assets?.weaponPickups?.[type];
      if (def) {
        const pickup = new WeaponPickup({ ...def, type, life: DEV_ARENA_PICKUP_LIFE, speed: 0 });
        pickup.x = slot.x;
        pickup.y = slot.y;
        pickup.baseY = slot.y;
        weaponPickups.push(pickup);
        playPowerupSpawnSfx();
        slot.pickup = pickup;
      }
    } else if (slot.kind === "utility") {
      const utilTypes = Object.keys(UTILITY_POWERUP_DEFS);
      const type = utilTypes[Math.floor(Math.random() * utilTypes.length)];
      const asset = assets?.utility?.[type];
      const def = UTILITY_POWERUP_DEFS[type];
      if (asset?.image && def) {
        const pickup = new UtilityPowerUp({ ...def, ...asset, type, life: DEV_ARENA_PICKUP_LIFE }, slot.x, slot.y);
        pickup.baseY = slot.y;
        utilityPowerUps.push(pickup);
        playPowerupSpawnSfx();
        slot.pickup = pickup;
      }
    }
  });
}

function isDevMeleeArenaActive() {
  return devMeleeArenaMode === true;
}

function isTutorialArenaActive() {
  return tutorialArenaMode === true;
}

function setTutorialArenaMoveContext(moveName) {
  if (!isTutorialArenaActive() || !moveName) return;
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  tutorialArenaCurrentMoveContext = { move: String(moveName), at: now };
}

function getTutorialArenaCurrentMoveContext() {
  if (!tutorialArenaCurrentMoveContext?.move) return "";
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  if (now - (Number(tutorialArenaCurrentMoveContext.at) || 0) > TUTORIAL_ARENA_MOVE_CONTEXT_WINDOW_MS) {
    return "";
  }
  return String(tutorialArenaCurrentMoveContext.move || "");
}

function isTouchControlsActive() {
  return typeof document !== "undefined" && Boolean(document.body?.classList.contains("touch-enabled"));
}

function getTutorialArenaExitLabel() {
  return tutorialArenaFirstRun ? "Skip Tutorial" : "Back to Game";
}

function setTutorialArenaHud(hud, buttons, { menu = false } = {}) {
  window.__tutorialArenaHud = hud;
  window.__tutorialArenaButtonLabels = buttons;
  // Lets the controller's A/B buttons act as Confirm/Back on menu-like steps.
  window.__tutorialArenaMenuActive = Boolean(menu);
}

function updateTutorialArenaHudState() {
  if (typeof window === "undefined") return;
  // During move drills, pause the pastor's and congregation's auto-fire so
  // only the move being learned kills demons (and counts).
  window.__tutorialArenaBlockAutoFire = Boolean(
    isTutorialArenaActive() &&
    !tutorialArenaState?.pendingStart &&
    ["kill_with_move", "combo_string", "counter_hit", "punish_counter"].includes(
      tutorialArenaState?.currentObjective?.type,
    ),
  );
  if (!isTutorialArenaActive()) {
    window.__tutorialArenaHud = null;
    window.__tutorialArenaPendingStart = false;
    window.__tutorialArenaButtonLabels = null;
    window.__tutorialArenaMenuActive = false;
    return;
  }
  const exitButton = { key: "tutorialBack", label: getTutorialArenaExitLabel() };
  if (tutorialArenaState?.pendingStart) {
    window.__tutorialArenaPendingStart = true;
    setTutorialArenaHud(
      {
        label: tutorialArenaFirstRun ? "Learn to Play" : "Start Tutorial",
        progressText: tutorialArenaFirstRun
          ? "A quick tutorial before your first battle"
          : "Press Start Tutorial",
        moveKey: "",
      },
      [{ key: "tutorialStart", label: "Start Tutorial" }, exitButton],
      { menu: true },
    );
    return;
  }
  window.__tutorialArenaPendingStart = false;
  const stepButtons = [
    { key: "tutorialPrev", label: "Prev" },
    { key: "tutorialNext", label: "Next" },
    exitButton,
  ];
  if (tutorialArenaState?.finishedReturnAt > 0) {
    setTutorialArenaHud(
      { label: "Tutorial Complete", progressText: "Returning...", moveKey: "" },
      stepButtons,
    );
    return;
  }
  if (!tutorialArenaState?.currentObjective) {
    setTutorialArenaHud(null, null);
    return;
  }
  const objective = tutorialArenaState.currentObjective;
  const label = String(objective.label || "");
  if (tutorialArenaState.completionQueuedAt > 0) {
    setTutorialArenaHud(
      { label: "Objective Complete!", progressText: "", moveKey: "" },
      stepButtons,
    );
    return;
  }
  if (objective.type === "card") {
    const index = Number(tutorialArenaState.objectiveIndex) || 0;
    setTutorialArenaHud(
      {
        card: true,
        label,
        body: String(
          (isTouchControlsActive() && objective.touchBody) || objective.body || "",
        ),
        showButtons: Boolean(objective.showButtons),
        highlight: objective.highlight || "",
        progressText: "",
        moveKey: "",
      },
      [
        ...(index > 0 ? [{ key: "tutorialPrev", label: "Prev" }] : []),
        { key: "tutorialNext", label: "Continue" },
        exitButton,
      ],
      { menu: true },
    );
    return;
  }
  let progressText = `${tutorialArenaState.moveKillCount}/${objective.target}`;
  let moveKey = String(objective.move || "");
  if (objective.type === "dash_plus_kills") {
    progressText = objective.killTarget > 0
      ? `Dashes ${tutorialArenaState.dashCount}/${objective.dashTarget} | Kills ${tutorialArenaState.anyKillCount}/${objective.killTarget}`
      : `Dashes ${tutorialArenaState.dashCount}/${objective.dashTarget}`;
  } else if (objective.type === "combo_string") {
    const seq = Array.isArray(objective.sequence) ? objective.sequence : [];
    const step = Math.max(0, Math.min(seq.length - 1, Number(tutorialArenaState.comboStep) || 0));
    progressText = `${objective.inputs}   |   ${tutorialArenaState.moveKillCount}/${objective.target} done   |   next: ${seq[step] || ""}`;
    moveKey = "";
  } else if (objective.type === "counter_hit" || objective.type === "punish_counter") {
    progressText = `${tutorialArenaState.moveKillCount}/${objective.target}`;
    moveKey = "";
  } else if (objective.type === "kill_any" || objective.type === "kill_armored") {
    progressText = `${tutorialArenaState.anyKillCount}/${objective.target}`;
    moveKey = "";
  } else if (objective.type === "move_wasd") {
    const seen = tutorialArenaState?.movementKeysSeen || {};
    const count = (seen.w ? 1 : 0) + (seen.a ? 1 : 0) + (seen.s ? 1 : 0) + (seen.d ? 1 : 0);
    progressText = `${count}/4`;
    moveKey = "";
  }
  const shownLabel = (isTouchControlsActive() && objective.touchLabel) || label;
  setTutorialArenaHud({ label: shownLabel, progressText, moveKey }, stepButtons);
}

function announceTutorialArenaObjective() {
  const objective = tutorialArenaState?.currentObjective;
  if (!objective) return;
  updateTutorialArenaHudState();
}

function stepTutorialArenaObjective(delta = 1) {
  if (!isTutorialArenaActive() || !tutorialArenaState) return;
  if (tutorialArenaState.pendingStart) return;
  const maxIndex = Math.max(0, TUTORIAL_ARENA_OBJECTIVES.length - 1);
  const current = Math.max(0, Number(tutorialArenaState.objectiveIndex) || 0);
  if (delta > 0 && current === maxIndex && tutorialArenaState.currentObjective?.type === "card") {
    startTutorialArenaObjective(current + 1); // "Continue" on the last card: done
    return;
  }
  const next = Math.max(0, Math.min(maxIndex, current + Math.trunc(delta)));
  if (next === current) return;
  startTutorialArenaObjective(next);
}

function getTutorialArenaAudioTracks() {
  const tracks = Object.values(musicState).filter(
    (value) => typeof Audio !== "undefined" && value instanceof Audio && value !== musicState.devArena,
  );
  [spiritRealmAmbientAudio, battleTeaserCreepyAudio, visitorConversationAmbientAudio].forEach((audio) => {
    if (audio && !tracks.includes(audio)) tracks.push(audio);
  });
  return tracks;
}

function captureTutorialArenaReturnSnapshot() {
  const copy = (list) => (Array.isArray(list) ? list.slice() : []);
  return {
    titleScreenActive,
    mapActive,
    paused,
    gameOver,
    gameStarted,
    npcsSuspended,
    pendingDistrictIntroStart,
    suppressInitialAnnouncements,
    postDeathSequenceActive,
    postDeathAnimLeadActive,
    postDeathAnimLeadTimer,
    battlefieldIntroFadeAlpha,
    levelManager,
    activeBoss,
    congregationWanderBounds,
    playerGraceCount,
    powerUpRespawnTimer,
    powerUpStaggerTimer,
    pastorPowerupSpawnTimer,
    churchPowerupEnsureTimer,
    queuedPowerUpDrops,
    player: player ? { ...player } : null,
    formationState: { ...formationState },
    lists: {
      enemies: copy(enemies),
      projectiles: copy(projectiles),
      bossHazards: copy(bossHazards),
      npcs: copy(npcs),
      congregationMembers: copy(congregationMembers),
      levelAnnouncements: copy(levelAnnouncements),
      weaponPickups: copy(weaponPickups),
      churchPowerupPickups: copy(churchPowerupPickups),
      pastorPowerupPickups: copy(pastorPowerupPickups),
      utilityPowerUps: copy(utilityPowerUps),
      gracePickups: copy(gracePickups),
    },
    audio: {
      playing: getTutorialArenaAudioTracks().filter((audio) => !audio.paused),
      spiritRealmAmbientPlaying,
      spiritRealmAmbientFadingOut,
      battleTeaserCreepyPlaying,
      visitorConversationAmbientPlaying,
    },
  };
}

function restoreTutorialArenaReturnSnapshot(snapshot) {
  const refill = (target, source) => {
    target.splice(0, target.length, ...(source || []));
  };
  titleScreenActive = snapshot.titleScreenActive;
  mapActive = snapshot.mapActive;
  paused = snapshot.paused;
  gameOver = snapshot.gameOver;
  gameStarted = snapshot.gameStarted;
  npcsSuspended = snapshot.npcsSuspended;
  pendingDistrictIntroStart = snapshot.pendingDistrictIntroStart;
  suppressInitialAnnouncements = snapshot.suppressInitialAnnouncements;
  postDeathSequenceActive = snapshot.postDeathSequenceActive;
  postDeathAnimLeadActive = snapshot.postDeathAnimLeadActive;
  postDeathAnimLeadTimer = snapshot.postDeathAnimLeadTimer;
  battlefieldIntroFadeAlpha = snapshot.battlefieldIntroFadeAlpha;
  levelManager = snapshot.levelManager;
  activeBoss = snapshot.activeBoss;
  congregationWanderBounds = snapshot.congregationWanderBounds;
  playerGraceCount = snapshot.playerGraceCount;
  powerUpRespawnTimer = snapshot.powerUpRespawnTimer;
  powerUpStaggerTimer = snapshot.powerUpStaggerTimer;
  pastorPowerupSpawnTimer = snapshot.pastorPowerupSpawnTimer;
  churchPowerupEnsureTimer = snapshot.churchPowerupEnsureTimer;
  queuedPowerUpDrops = snapshot.queuedPowerUpDrops;
  if (player && snapshot.player) Object.assign(player, snapshot.player);
  Object.assign(formationState, snapshot.formationState);
  refill(enemies, snapshot.lists.enemies);
  refill(projectiles, snapshot.lists.projectiles);
  refill(bossHazards, snapshot.lists.bossHazards);
  refill(npcs, snapshot.lists.npcs);
  refill(congregationMembers, snapshot.lists.congregationMembers);
  refill(levelAnnouncements, snapshot.lists.levelAnnouncements);
  refill(weaponPickups, snapshot.lists.weaponPickups);
  refill(churchPowerupPickups, snapshot.lists.churchPowerupPickups);
  refill(pastorPowerupPickups, snapshot.lists.pastorPowerupPickups);
  refill(utilityPowerUps, snapshot.lists.utilityPowerUps);
  refill(gracePickups, snapshot.lists.gracePickups);
  if (musicState.devArena) musicState.devArena.pause();
  spiritRealmAmbientPlaying = snapshot.audio.spiritRealmAmbientPlaying;
  spiritRealmAmbientFadingOut = snapshot.audio.spiritRealmAmbientFadingOut;
  battleTeaserCreepyPlaying = snapshot.audio.battleTeaserCreepyPlaying;
  visitorConversationAmbientPlaying = snapshot.audio.visitorConversationAmbientPlaying;
  snapshot.audio.playing.forEach((audio) => {
    try {
      const result = audio.play();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (e) {}
  });
}

function hasSeenTutorial() {
  if (tutorialSeenThisSession) return true;
  try {
    return window.localStorage?.getItem(TUTORIAL_SEEN_STORAGE_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function markTutorialSeen() {
  tutorialSeenThisSession = true;
  try {
    window.localStorage?.setItem(TUTORIAL_SEEN_STORAGE_KEY, "1");
  } catch (e) {}
}

// First-time players: run the tutorial before `continueFn` (e.g. opening the
// map for the save they picked). Everyone else goes straight to `continueFn`.
function runFirstTimeTutorialThen(continueFn) {
  if (hasSeenTutorial() || !player || isTutorialArenaActive()) {
    continueFn();
    return;
  }
  tutorialArenaFirstRun = true;
  tutorialArenaExitContinuation = continueFn;
  requestTutorialArenaLaunch("title");
  if (!isTutorialArenaActive()) {
    // Couldn't start it for some reason; don't block the player.
    tutorialArenaFirstRun = false;
    tutorialArenaExitContinuation = null;
    continueFn();
  }
}

function exitTutorialArenaToGame() {
  const continuation = tutorialArenaExitContinuation;
  tutorialArenaExitContinuation = null;
  tutorialArenaFirstRun = false;
  markTutorialSeen();
  exitTutorialArenaToPreviousScreen();
  if (typeof continuation === "function") {
    try {
      continuation();
    } catch (e) {
      console.error("Tutorial continuation failed", e);
    }
  }
}

function exitTutorialArenaToPreviousScreen() {
  const snapshot = tutorialArenaReturnSnapshot;
  tutorialArenaReturnSnapshot = null;
  tutorialArenaMode = false;
  pendingTutorialArenaLaunch = false;
  tutorialArenaState = null;
  tutorialArenaPrayerRefillAt = 0;
  tutorialArenaLastPrayerCharge = null;
  tutorialArenaCurrentMoveContext = { move: "", at: 0 };
  clearTutorialArenaMoveKillWindows();
  if (typeof window !== "undefined") {
    window.__battlechurchTutorialArenaMode = false;
    window.__tutorialArenaPendingStart = false;
    window.__tutorialArenaHud = null;
    window.__tutorialArenaButtons = null;
    window.__tutorialArenaButtonLabels = null;
    window.__tutorialArenaMenuActive = false;
    window.__tutorialArenaBlockAutoFire = false;
  }
  enemies.splice(0, enemies.length);
  projectiles.splice(0, projectiles.length);
  bossHazards.splice(0, bossHazards.length);
  clearAllPowerUps();
  clearGracePickups();
  if (snapshot) {
    // Put back the exact screen the player came from (title, congregation,
    // pause menu, mid-battle...).
    restoreTutorialArenaReturnSnapshot(snapshot);
    return;
  }
  // No snapshot (e.g. opened from the map or before the pastor existed):
  // the previous game state is gone, so fall back to the title screen.
  if (typeof window !== "undefined" && typeof window.returnToTitleScreen === "function") {
    window.returnToTitleScreen();
    return;
  }
  restartGame();
}

function handleTutorialArenaButtons() {
  if (!isTutorialArenaActive()) return false;
  // While the pause menu is open it owns taps and Esc (Resume etc.).
  if (paused) return false;
  // Esc (or controller B on card/start screens) = Back to Game / Skip Tutorial.
  // Handled here because the shared menu-button code would swallow it.
  if (keysJustPressed.has("escape") || keysJustPressed.has("Escape")) {
    keysJustPressed.delete("escape");
    keysJustPressed.delete("Escape");
    exitTutorialArenaToGame();
    return true;
  }
  const buttons =
    typeof window !== "undefined" && Array.isArray(window.__tutorialArenaButtons)
      ? window.__tutorialArenaButtons
      : null;
  if (!buttons || !buttons.length) return false;
  return handleAnnouncementButtons({
    key: "tutorialArena",
    buttons,
    // Do not bind confirm keys here; gamepad/keyboard attack inputs reuse
    // those keys and can accidentally trigger tutorial UI buttons mid-combat.
    allowSpace: false,
    onActivate: (button) => {
      const key = String(button?.key || "");
      if (key === "tutorialStart") {
        if (tutorialArenaState?.pendingStart) {
          tutorialArenaState.pendingStart = false;
          startTutorialArenaObjective(tutorialArenaState.objectiveIndex || 0);
        }
        return;
      }
      if (key === "tutorialPrev") {
        stepTutorialArenaObjective(-1);
        return;
      }
      if (key === "tutorialNext") {
        stepTutorialArenaObjective(1);
        return;
      }
      if (key === "tutorialBack") {
        exitTutorialArenaToGame();
      }
    },
  });
}

// The dummy section is just you and the dummy: park the congregation NPCs
// and put them back when leaving it (or the tutorial).
function setTutorialArenaCongregationHidden(hidden) {
  if (!tutorialArenaState) return;
  if (hidden && !tutorialArenaState.hiddenNpcs) {
    tutorialArenaState.hiddenNpcs = npcs.slice();
    npcs.splice(0, npcs.length);
  } else if (!hidden && tutorialArenaState.hiddenNpcs) {
    npcs.splice(0, npcs.length, ...tutorialArenaState.hiddenNpcs);
    tutorialArenaState.hiddenNpcs = null;
  }
}

// Counter Hit / Punish Counter drills (called from getCounterHitResult).
function recordTutorialArenaCounter(kind) {
  if (!isTutorialArenaActive() || !tutorialArenaState) return;
  const objective = tutorialArenaState.currentObjective;
  if (!objective || tutorialArenaState.completionQueuedAt > 0) return;
  if (
    (objective.type === "counter_hit" && kind === "counter") ||
    (objective.type === "punish_counter" && kind === "punish")
  ) {
    tutorialArenaState.moveKillCount += 1;
    updateTutorialArenaHudState();
    checkTutorialArenaObjectiveComplete();
  }
}

function startTutorialArenaObjective(index) {
  if (!isTutorialArenaActive()) return;
  if (tutorialArenaState?.pendingStart) return;
  const objective = TUTORIAL_ARENA_OBJECTIVES[index];
  if (!objective) {
    // All objectives done: show the banner, keep the tutorial buttons up,
    // then return to the screen the player came from (same as Back to Game).
    // The HUD shows "Tutorial Complete / Returning..." (no separate banner,
    // which overlapped it).
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    tutorialArenaState.currentObjective = null;
    tutorialArenaState.completionQueuedAt = 0;
    tutorialArenaState.finishedReturnAt = now + TUTORIAL_ARENA_FINISHED_RETURN_MS;
    enemies.splice(0, enemies.length);
    projectiles.splice(0, projectiles.length);
    tutorialArenaCurrentMoveContext = { move: "", at: 0 };
    clearTutorialArenaMoveKillWindows();
    updateTutorialArenaHudState();
    return;
  }
  tutorialArenaState.finishedReturnAt = 0;
  setTutorialArenaCongregationHidden(objective.arena === "dummy");
  tutorialArenaState.objectiveIndex = index;
  tutorialArenaState.currentObjective = objective;
  enemies.splice(0, enemies.length);
  projectiles.splice(0, projectiles.length);
  tutorialArenaState.moveKillCount = 0;
  tutorialArenaState.anyKillCount = 0;
  tutorialArenaState.dashCount = 0;
  tutorialArenaState.comboStep = 0;
  tutorialArenaState.comboLastAt = 0;
  tutorialArenaState.movementKeysSeen = { w: false, a: false, s: false, d: false };
  tutorialArenaState.batchSpawned = false;
  tutorialArenaState.completionQueuedAt = 0;
  tutorialArenaCurrentMoveContext = { move: "", at: 0 };
  clearTutorialArenaMoveKillWindows();
  announceTutorialArenaObjective();
}

function completeTutorialArenaObjective() {
  if (!isTutorialArenaActive() || !tutorialArenaState || tutorialArenaState.completionQueuedAt > 0) return;
  tutorialArenaCurrentMoveContext = { move: "", at: 0 };
  clearTutorialArenaMoveKillWindows();
  tutorialArenaState.completionQueuedAt = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1200;
  // Shown in place of the objective text (see updateTutorialArenaHudState);
  // a separate banner drew on top of it.
  updateTutorialArenaHudState();
}

function checkTutorialArenaObjectiveComplete() {
  if (!isTutorialArenaActive() || !tutorialArenaState?.currentObjective) return;
  if (tutorialArenaState.pendingStart) return;
  const objective = tutorialArenaState.currentObjective;
  let done = false;
  if (objective.type === "card") return; // cards advance on Continue only
  if (objective.type === "kill_armored") {
    done = tutorialArenaState.anyKillCount >= objective.target;
  } else if (
    objective.type === "combo_string" ||
    objective.type === "counter_hit" ||
    objective.type === "punish_counter"
  ) {
    done = tutorialArenaState.moveKillCount >= objective.target;
  } else if (objective.type === "dash_plus_kills") {
    done = tutorialArenaState.dashCount >= objective.dashTarget && tutorialArenaState.anyKillCount >= objective.killTarget;
  } else if (objective.type === "kill_any") {
    done = tutorialArenaState.anyKillCount >= objective.target;
  } else if (objective.type === "move_wasd") {
    const seen = tutorialArenaState?.movementKeysSeen || {};
    done = Boolean(seen.w && seen.a && seen.s && seen.d);
  } else {
    done = tutorialArenaState.moveKillCount >= objective.target;
  }
  if (done) completeTutorialArenaObjective();
}

function updateTutorialArenaMoveObjectiveProgress() {
  if (!isTutorialArenaActive() || !tutorialArenaState?.currentObjective) return;
  if (tutorialArenaState.currentObjective.type !== "move_wasd") return;
  if (!tutorialArenaState.movementKeysSeen) {
    tutorialArenaState.movementKeysSeen = { w: false, a: false, s: false, d: false };
  }
  const seen = tutorialArenaState.movementKeysSeen;
  const upActive = (keysPressed.has("w") || keysPressed.has("W")) || isActionActive("up");
  const leftActive = (keysPressed.has("a") || keysPressed.has("A")) || isActionActive("left");
  const downActive = (keysPressed.has("s") || keysPressed.has("S")) || isActionActive("down");
  const rightActive = (keysPressed.has("d") || keysPressed.has("D")) || isActionActive("right");
  if (upActive) seen.w = true;
  if (leftActive) seen.a = true;
  if (downActive) seen.s = true;
  if (rightActive) seen.d = true;
  updateTutorialArenaHudState();
  checkTutorialArenaObjectiveComplete();
}

function onTutorialArenaEnemyDefeated(enemy) {
  if (!isTutorialArenaActive() || !tutorialArenaState?.currentObjective || !enemy) return;
  if (enemy.__tutorialObjectiveCounted) return;
  enemy.__tutorialObjectiveCounted = true;
  const objective = tutorialArenaState.currentObjective;
  if (enemy.tutorialArmorTest) {
    if (objective.type === "kill_armored") {
      tutorialArenaState.anyKillCount += 1;
      updateTutorialArenaHudState();
      checkTutorialArenaObjectiveComplete();
    }
    return;
  }
  if (enemy.type !== "miniImp") return;
  if (objective.type === "kill_armored") return; // only armored demons count here
  tutorialArenaState.anyKillCount += 1;
  if (objective.type === "kill_with_move") {
    const objectiveMove = String(objective.move || "");
    const moveName = String(enemy.tutorialLastMove || "");
    let countsForObjective = moveName === objectiveMove;
    if (!countsForObjective) {
      const now = typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
      const windowUntil = Number(tutorialArenaMoveKillWindowUntilByMove[objectiveMove]) || 0;
      if (now <= windowUntil) {
        countsForObjective = true;
      }
    }
    if (countsForObjective) {
      tutorialArenaState.moveKillCount += 1;
    }
  }
  updateTutorialArenaHudState();
  checkTutorialArenaObjectiveComplete();
}

function onTutorialArenaEnemyKilledInstant(enemy) {
  onTutorialArenaEnemyDefeated(enemy);
}

function getTutorialArenaSwarmSpawnPoint(side = "right") {
  const width = Math.max(1, Number(canvas?.width) || 1920);
  const height = Math.max(1, Number(canvas?.height) || 1080);
  const hud = Number.isFinite(HUD_HEIGHT) ? HUD_HEIGHT : 0;
  const minY = Math.max(hud + 120, hud + (height - hud) * 0.22);
  const maxY = Math.max(minY + 40, height - 160);
  const y = randomInRange(minY, maxY);
  if (side === "left") {
    return { x: -4, y, __spawnEdge: "left" };
  }
  return { x: width + 4, y, __spawnEdge: "right" };
}

function collectTutorialArenaInstantDeaths() {
  if (!isTutorialArenaActive() || !Array.isArray(enemies) || !enemies.length) return;
  for (let i = 0; i < enemies.length; i += 1) {
    const enemy = enemies[i];
    if (!enemy || enemy.__tutorialObjectiveCounted) continue;
    if (enemy.type !== "miniImp" && !enemy.tutorialArmorTest) continue;
    if (enemy.state === "death" || enemy.dead || (Number.isFinite(enemy.health) && enemy.health <= 0)) {
      onTutorialArenaEnemyDefeated(enemy);
    }
  }
}

function spawnTutorialArenaBatch() {
  if (!isTutorialArenaActive()) return;
  const side = tutorialArenaState?.nextSpawnSide === "left" ? "left" : "right";
  const spawnPoint = getTutorialArenaSwarmSpawnPoint(side);
  const cols = 10;
  const spacingX = 26;
  const spacingY = 24;
  const depth = (cols - 1) * spacingX;
  const halfRows = (Math.ceil(TUTORIAL_ARENA_BATCH_SIZE / cols) - 1) * 0.5;
  const swarmGroupId = `tutorialSwarm:${++tutorialArenaSwarmGroupSerial}`;
  for (let i = 0; i < TUTORIAL_ARENA_BATCH_SIZE; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const offsetY = (row - halfRows) * spacingY + randomInRange(-6, 6);
    const laneX =
      side === "left"
        ? spawnPoint.x - depth + col * spacingX + randomInRange(-4, 4)
        : spawnPoint.x + depth - col * spacingX + randomInRange(-4, 4);
    spawnEnemyOfType(
      "miniImp",
      { x: laneX, y: spawnPoint.y + offsetY, __spawnEdge: side },
      {
        skipSpawnEffects: false,
        applyCameraShake: i === 0,
        swarmGroupId,
        swarmGroupInitialCount: TUTORIAL_ARENA_BATCH_SIZE,
        swarmGroupType: "miniImp",
        swarmGroupLabel: String(TUTORIAL_ARENA_BATCH_SIZE),
      },
    );
  }
  if (tutorialArenaState) {
    tutorialArenaState.nextSpawnSide = side === "left" ? "right" : "left";
  }
  tutorialArenaState.batchSpawned = true;
}

// Armored lesson: keep the remaining armored demons on the field (no imp swarm,
// so auto-fire visibly bounces off them).
function maintainTutorialArenaArmoredSpawns() {
  const objective = tutorialArenaState?.currentObjective;
  if (!objective) return;
  const alive = enemies.filter(
    (enemy) => enemy && enemy.tutorialArmorTest && !enemy.dead && enemy.state !== "death",
  ).length;
  const needed = Math.max(0, objective.target - tutorialArenaState.anyKillCount - alive);
  if (!needed) return;
  const width = Math.max(1, Number(canvas?.width) || 1920);
  for (let i = 0; i < needed; i += 1) {
    const side = tutorialArenaState.nextSpawnSide === "left" ? "left" : "right";
    tutorialArenaState.nextSpawnSide = side === "left" ? "right" : "left";
    const point = getTutorialArenaSwarmSpawnPoint(side);
    point.x = side === "left" ? width * 0.12 : width * 0.88;
    const enemy = spawnEnemyOfType(TUTORIAL_ARENA_ARMORED_TYPE, point, {
      skipSpawnEffects: false,
      applyCameraShake: i === 0,
    });
    if (!enemy) continue;
    enemy.tutorialArmorTest = true;
    enemy.maxHealth = TUTORIAL_ARENA_ARMORED_HEALTH;
    enemy.health = TUTORIAL_ARENA_ARMORED_HEALTH;
    if (enemy.config) {
      enemy.config.maxHealth = TUTORIAL_ARENA_ARMORED_HEALTH;
      enemy.config.health = TUTORIAL_ARENA_ARMORED_HEALTH;
    }
  }
}

// Combo strings / counters: one slow armored practice dummy that walks up and
// swings at you but can't be defeated.
// Refilled every frame, so it can't be defeated (kept short so its health
// label stays readable).
const TUTORIAL_ARENA_DUMMY_HEALTH = 9999;
function maintainTutorialArenaComboDummy() {
  let dummy = enemies.find((e) => e && e.tutorialComboDummy && !e.dead && e.state !== "death");
  if (!dummy) {
    const center = getDevMeleeArenaCenter();
    // Level with where the pastor starts, clear of the drill text.
    const spot = { x: center.x + 160, y: center.y - 180 };
    dummy = spawnEnemyOfType(TUTORIAL_ARENA_ARMORED_TYPE, { x: spot.x, y: spot.y }, {
      skipSpawnEffects: false,
      applyCameraShake: false,
    });
    if (!dummy) return;
    dummy.tutorialComboDummy = true;
    dummy.spawnOffscreenTimer = 0;
  }
  dummy.maxHealth = TUTORIAL_ARENA_DUMMY_HEALTH;
  dummy.health = TUTORIAL_ARENA_DUMMY_HEALTH;
  if (dummy.config) {
    dummy.config.maxHealth = TUTORIAL_ARENA_DUMMY_HEALTH;
    dummy.config.health = TUTORIAL_ARENA_DUMMY_HEALTH;
  }
}

function maintainTutorialArenaWaveSpawns() {
  if (!isTutorialArenaActive() || !tutorialArenaState?.currentObjective) return;
  if (tutorialArenaState.pendingStart) return;
  const objectiveType = tutorialArenaState.currentObjective.type;
  if (objectiveType === "move_wasd") return;
  if (objectiveType === "card" && tutorialArenaState.currentObjective.arena !== "dummy") return;
  if (tutorialArenaState.completionQueuedAt > 0) return;
  if (objectiveType === "kill_armored") {
    maintainTutorialArenaArmoredSpawns();
    return;
  }
  if (tutorialArenaState.currentObjective.arena === "dummy") {
    maintainTutorialArenaComboDummy();
    return;
  }
  if (!tutorialArenaState.batchSpawned) {
    spawnTutorialArenaBatch();
    return;
  }
  const aliveMiniImps = enemies.filter((enemy) => enemy && !enemy.dead && enemy.state !== "death" && enemy.type === "miniImp").length;
  if (aliveMiniImps < TUTORIAL_ARENA_REINFORCE_THRESHOLD) {
    spawnTutorialArenaBatch();
  }
}

function enforceTutorialArenaVitals() {
  if (!isTutorialArenaActive() || !player) return;
  // Congregation members can't be worn down while you're learning.
  if (Array.isArray(npcs)) {
    npcs.forEach((npc) => {
      if (npc && Number.isFinite(npc.maxFaith) && npc.faith < npc.maxFaith) npc.faith = npc.maxFaith;
    });
  }
  player.invulnerableTimer = Math.max(player.invulnerableTimer || 0, 0.2);
  const prayerRequired = Math.max(1, Number(player.prayerChargeRequired) || Number(PRAYER_BOMB_CHARGE_REQUIRED) || 1);
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  if (!Number.isFinite(tutorialArenaLastPrayerCharge)) {
    tutorialArenaLastPrayerCharge = Number(player.prayerCharge) || prayerRequired;
  }
  const currentPrayer = Math.max(0, Number(player.prayerCharge) || 0);
  if (currentPrayer < tutorialArenaLastPrayerCharge - 0.001) {
    tutorialArenaPrayerRefillAt = now + TUTORIAL_ARENA_PRAYER_REFILL_MS;
  }
  if (tutorialArenaPrayerRefillAt > 0 && now >= tutorialArenaPrayerRefillAt) {
    player.prayerCharge = prayerRequired;
    tutorialArenaPrayerRefillAt = 0;
  }
  tutorialArenaLastPrayerCharge = Math.max(0, Number(player.prayerCharge) || 0);
  const commandRequired = Math.max(
    0.001,
    Number(player.congregationCommandChargeRequired) || Number(CONGREGATION_COMMAND_CHARGE_TIME) || 1,
  );
  player.congregationCommandCharge = commandRequired;
}

function resetDevMeleeMoveFeed() {
  devMeleeMoveFeed = [];
  devMeleeConfirmedCombos = [];
  devMeleeComboSerial = 0;
  devArenaBestCombo = null;
  devArenaSkeletonHintBubble = null;
  devArenaSkeletonHintNextAt = 0;
  devArenaSkeletonIntroShown = false;
  devArenaSkeletonHintPool = [];
  if (typeof window !== "undefined") {
    window.__devArenaMeleeFeed = devMeleeMoveFeed;
    window.__devArenaConfirmedCombos = devMeleeConfirmedCombos;
    window.__devArenaBestCombo = null;
  }
}

function showDevArenaSkeletonHint(target) {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now < devArenaSkeletonHintNextAt) return;
  if (devArenaSkeletonHintBubble) {
    devArenaSkeletonHintBubble.life = 0;
    devArenaSkeletonHintBubble = null;
  }

  let text;
  if (!devArenaSkeletonIntroShown) {
    text = DEV_ARENA_SKELETON_INTRO;
    devArenaSkeletonIntroShown = true;
  } else {
    if (!DEV_ARENA_SKELETON_HINTS.length) return;
    if (!devArenaSkeletonHintPool.length) {
      // Refill and shuffle a fresh copy of the hints array
      devArenaSkeletonHintPool = DEV_ARENA_SKELETON_HINTS.slice();
      for (let i = devArenaSkeletonHintPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [devArenaSkeletonHintPool[i], devArenaSkeletonHintPool[j]] =
          [devArenaSkeletonHintPool[j], devArenaSkeletonHintPool[i]];
      }
    }
    text = devArenaSkeletonHintPool.pop();
  }

  const hintLifeSec = 3.5;
  devArenaSkeletonHintNextAt = now + hintLifeSec * 1000;
  devArenaSkeletonHintBubble = addFloatingTextAt(
    target.x, target.y - (target.radius || 30) - 28,
    text, UI_COLOR.speechBubbleText,
    {
      speechBubble: true,
      bubbleTheme: "npc",
      entity: target,
      offsetY: -(target.radius || 30) - 28,
      life: hintLifeSec,
      fadeDelay: 2.5,
      priority: 150,
    }
  );
}

function pushDevMeleeMove(moveName) {
  if (!isDevMeleeArenaActive() || !moveName) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const move = String(moveName);
  const prev = devMeleeMoveFeed.length
    ? devMeleeMoveFeed[devMeleeMoveFeed.length - 1]
    : null;
  const comboId =
    prev && now - prev.at <= DEV_MELEE_COMBO_WINDOW_MS
      ? prev.comboId
      : `combo-${Math.floor(now)}-${Math.floor(Math.random() * 1000)}`;
  devMeleeMoveFeed.push({ move, at: now, comboId });
  if (devMeleeMoveFeed.length > DEV_MELEE_FEED_MAX) {
    devMeleeMoveFeed = devMeleeMoveFeed.slice(-DEV_MELEE_FEED_MAX);
  }
  if (typeof window !== "undefined") {
    window.__devArenaMeleeFeed = devMeleeMoveFeed;
  }
}

function syncDevArenaConfirmedCombos() {
  if (typeof window !== "undefined") {
    window.__devArenaConfirmedCombos = devMeleeConfirmedCombos;
    window.__devArenaBestCombo = devArenaBestCombo;
  }
}

function syncHudConfirmedCombo(comboId, hits, details = null, enemyName = null) {
  if (typeof window === "undefined") return;
  if (!comboId || !Number.isFinite(hits) || hits < 2) return;
  const HUD_COMBO_MAX = 8;
  const normalizedDetails = Array.isArray(details)
    ? details
        .slice(0, hits)
        .map((entry) => ({
          move: String(entry?.move || ""),
          damage: Math.max(0, Math.round(Number(entry?.damage) || 0)),
          isCounterHit: Boolean(entry?.isCounterHit),
          isPunishCounter: Boolean(entry?.isPunishCounter),
        }))
        .filter((entry) => entry.move)
    : [];
  const totalDamage = normalizedDetails.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.damage) || 0),
    0,
  );
  const hasPunishCounter = normalizedDetails.some((entry) => entry.isPunishCounter);
  const hasCounterHit = normalizedDetails.some((entry) => entry.isCounterHit);
  const payload = {
    comboId: String(comboId),
    hits: Math.max(2, Math.floor(hits), normalizedDetails.length),
    totalDamage,
    hasPunishCounter,
    hasCounterHit,
    enemyName: enemyName ? String(enemyName) : null,
    recordedAt:
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now(),
  };
  const list = Array.isArray(window.__hudConfirmedCombos)
    ? window.__hudConfirmedCombos.slice()
    : [];
  const existingIdx = list.findIndex((entry) => entry?.comboId === payload.comboId);
  if (existingIdx >= 0) list[existingIdx] = payload;
  else list.push(payload);
  list.sort((a, b) => {
    const hitDiff = (Number(b?.hits) || 0) - (Number(a?.hits) || 0);
    if (hitDiff !== 0) return hitDiff;
    return (Number(b?.recordedAt) || 0) - (Number(a?.recordedAt) || 0);
  });
  window.__hudConfirmedCombos = list.slice(0, HUD_COMBO_MAX);
}

function upsertDevArenaConfirmedCombo(comboId, hits, moves, details = null, enemyName = null) {
  if (!isDevMeleeArenaActive()) return;
  if (!comboId || !Number.isFinite(hits) || hits < 2) return;
  const normalizedMoves = Array.isArray(moves)
    ? moves.filter((name) => typeof name === "string" && name.trim()).slice(0, hits)
    : [];
  const normalizedDetails = Array.isArray(details)
    ? details
        .slice(0, hits)
        .map((entry) => {
          const damage = Math.max(0, Math.round(Number(entry?.damage) || 0));
          const baseDamage = Math.max(
            0,
            Math.round(Number(entry?.baseDamage) || Number(entry?.damage) || 0),
          );
          const bonusDamage = Math.max(
            0,
            Math.round(
              Number(entry?.bonusDamage) ||
              (Number(entry?.damage) || 0) - (Number(entry?.baseDamage) || Number(entry?.damage) || 0),
            ),
          );
          return {
            move: String(entry?.move || ""),
            damage,
            baseDamage,
            bonusDamage,
            isCounterHit: Boolean(entry?.isCounterHit),
            isPunishCounter: Boolean(entry?.isPunishCounter),
          };
        })
        .filter((entry) => entry.move)
    : [];
  const computedTotalDamage = normalizedDetails.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.damage) || 0),
    0,
  );
  const hasCounterHit = normalizedDetails.some((entry) => entry.isCounterHit);
  const hasPunishCounter = normalizedDetails.some((entry) => entry.isPunishCounter);
  const hitCount = Math.max(
    2,
    Math.floor(hits),
    normalizedMoves.length,
    normalizedDetails.length,
  );
  const payload = {
    comboId: String(comboId),
    hits: hitCount,
    moves: normalizedMoves,
    details: normalizedDetails,
    totalDamage: computedTotalDamage,
    hasCounterHit,
    hasPunishCounter,
    enemyName: enemyName ? String(enemyName) : null,
  };
  const last = devMeleeConfirmedCombos.length
    ? devMeleeConfirmedCombos[devMeleeConfirmedCombos.length - 1]
    : null;
  if (last && last.comboId === payload.comboId) {
    last.hits = payload.hits;
    last.moves = payload.moves;
    last.details = payload.details;
    last.totalDamage = payload.totalDamage;
    last.hasCounterHit = payload.hasCounterHit;
    last.hasPunishCounter = payload.hasPunishCounter;
    if (payload.enemyName) last.enemyName = payload.enemyName;
  } else {
    payload.recordedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    devMeleeConfirmedCombos.push(payload);
    if (devMeleeConfirmedCombos.length > DEV_MELEE_CONFIRMED_COMBO_MAX) {
      devMeleeConfirmedCombos = devMeleeConfirmedCombos.slice(-DEV_MELEE_CONFIRMED_COMBO_MAX);
    }
  }
  const finalHits = last && last.comboId === payload.comboId ? last.hits : payload.hits;
  if (!devArenaBestCombo || finalHits > devArenaBestCombo.hits) {
    devArenaBestCombo = last && last.comboId === payload.comboId
      ? { ...last }
      : { ...payload };
  }
  syncDevArenaConfirmedCombos();
}

function getDevMeleeArenaCenter() {
  const hud = typeof HUD_HEIGHT !== "undefined" ? HUD_HEIGHT : 0;
  return {
    x: (canvas?.width || 0) * 0.5,
    y: hud + ((canvas?.height || 0) - hud) * 0.67,
  };
}

function enforceDevMeleeArenaVitals() {
  if (!isDevMeleeArenaActive()) return;
  if (player) {
    player.maxHealth = DEV_MELEE_ARENA_HEALTH;
    player.health = DEV_MELEE_ARENA_HEALTH;
    const prayerRequired = Math.max(
      1,
      Number(player.prayerChargeRequired) || Number(PRAYER_BOMB_CHARGE_REQUIRED) || 1,
    );
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    if (!Number.isFinite(devArenaLastPrayerCharge)) {
      devArenaLastPrayerCharge = Number(player.prayerCharge) || prayerRequired;
    }
    const currentPrayer = Math.max(0, Number(player.prayerCharge) || 0);
    if (currentPrayer < devArenaLastPrayerCharge - 0.001) {
      devArenaPrayerRefillAt = now + DEV_MELEE_ARENA_PRAYER_REFILL_MS;
    }
    if (devArenaPrayerRefillAt > 0 && now >= devArenaPrayerRefillAt) {
      player.prayerCharge = prayerRequired;
      devArenaPrayerRefillAt = 0;
    }
    devArenaLastPrayerCharge = Math.max(0, Number(player.prayerCharge) || 0);
    const commandRequired = Math.max(
      0.001,
      Number(player.congregationCommandChargeRequired) || Number(CONGREGATION_COMMAND_CHARGE_TIME) || 1,
    );
    player.congregationCommandCharge = commandRequired;
    if (typeof window !== "undefined") {
      window.__devArenaDamageReference = {
        melee: Math.round(MELEE_BASE_DAMAGE),
        cleave: Math.round(MELEE_BASE_DAMAGE * CLEAVE_DAMAGE_MULTIPLIER),
        rushAttack: Math.round(RUSH_DAMAGE),
        divineShot: Math.round(DIVINE_SHOT_DAMAGE),
        spinAttack: Math.round(MELEE_BASE_DAMAGE * MELEE_SPIN_DAMAGE_MULTIPLIER),
        blitz: Math.round(BLITZ_DAMAGE),
        modifiers: {
          counterHit: COUNTER_HIT_MULTIPLIER,
          punishCounter: PUNISH_COUNTER_MULTIPLIER,
        },
      };
    }
  }
  enemies.forEach((enemy) => {
    if (!enemy || enemy.dead || enemy.state === "death") return;
    if (enemy.devArenaPrimaryDummy === true) {
      enemy.maxHealth = DEV_MELEE_ARENA_HEALTH;
      enemy.health = DEV_MELEE_ARENA_HEALTH;
      if (enemy.config) {
        enemy.config.maxHealth = DEV_MELEE_ARENA_HEALTH;
        enemy.config.health = DEV_MELEE_ARENA_HEALTH;
      }
    }
  });
}

function spawnDevMeleeArenaEnemy() {
  const center = getDevMeleeArenaCenter();
  const enemy = spawnEnemyOfType("armoredSkeleton", center, {
    skipSpawnEffects: true,
    applyCameraShake: false,
  });
  if (!enemy) return false;
  enemy.x = center.x + 100;
  enemy.y = center.y + 100;
  enemy.devAnchorX = center.x + 100;
  enemy.devAnchorY = center.y + 100;
  enemy.devImmobileTestDummy = true;
  enemy.devArenaPrimaryDummy = true;
  enemy.spawnOffscreenTimer = 0;
  enemy.ignoreWorldBounds = false;
  enemy.maxHealth = DEV_MELEE_ARENA_HEALTH;
  enemy.health = DEV_MELEE_ARENA_HEALTH;
  if (enemy.config) {
    enemy.config.maxHealth = DEV_MELEE_ARENA_HEALTH;
    enemy.config.health = DEV_MELEE_ARENA_HEALTH;
  }
  return true;
}

function getDevArenaImpHordeCenter() {
  const hud = typeof HUD_HEIGHT !== "undefined" ? HUD_HEIGHT : 0;
  return {
    x: (canvas?.width || 0) - 220,
    y: hud + ((canvas?.height || 0) - hud) - 410,
  };
}

function initializeDevArenaImpHordeSlots() {
  const center = getDevArenaImpHordeCenter();
  const cols = DEV_ARENA_IMP_GRID_COLS;
  const rows = Math.ceil(DEV_ARENA_IMP_GROUP_SIZE / cols);
  const spacing = DEV_ARENA_IMP_SPACING;
  const startX = center.x - ((cols - 1) * spacing) * 0.5;
  const startY = center.y - ((rows - 1) * spacing) * 0.5;
  devArenaImpHordeSlots = [];
  for (let i = 0; i < DEV_ARENA_IMP_GROUP_SIZE; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    devArenaImpHordeSlots.push({
      index: i,
      x: startX + col * spacing,
      y: startY + row * spacing,
      enemy: null,
      respawnAt: 0,
    });
  }
}

function spawnDevArenaImpAtSlot(slot) {
  if (!slot) return null;
  const enemy = spawnEnemyOfType("miniImp", { x: slot.x, y: slot.y }, {
    skipSpawnEffects: true,
    applyCameraShake: false,
    swarmGroupId: "devArenaImpHorde",
    swarmGroupInitialCount: DEV_ARENA_IMP_GROUP_SIZE,
    swarmGroupType: "miniImp",
    swarmGroupLabel: String(DEV_ARENA_IMP_GROUP_SIZE),
  });
  if (!enemy) return null;
  enemy.x = slot.x;
  enemy.y = slot.y;
  enemy.devAnchorX = slot.x;
  enemy.devAnchorY = slot.y;
  enemy.devImmobileTestDummy = true;
  enemy.devArenaImpDummy = true;
  enemy.devArenaImpSlotIndex = slot.index;
  enemy.spawnOffscreenTimer = 0;
  return enemy;
}

function maintainDevArenaImpHorde() {
  if (!isDevMeleeArenaActive()) return;
  if (!Array.isArray(devArenaImpHordeSlots) || !devArenaImpHordeSlots.length) {
    initializeDevArenaImpHordeSlots();
  }
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  devArenaImpHordeSlots.forEach((slot) => {
    if (!slot) return;
    const enemy = slot.enemy;
    if (!enemy) {
      if (now >= (slot.respawnAt || 0)) {
        slot.enemy = spawnDevArenaImpAtSlot(slot);
      }
      return;
    }
    const defeated =
      enemy.dead ||
      enemy.state === "death" ||
      enemy.removed ||
      enemy.invalid ||
      (Number.isFinite(enemy.health) && enemy.health <= 0);
    if (defeated) {
      slot.enemy = null;
      slot.respawnAt = now + DEV_ARENA_IMP_RESPAWN_MS;
      return;
    }
    slot.respawnAt = 0;
    enemy.x = slot.x;
    enemy.y = slot.y;
    enemy.devAnchorX = slot.x;
    enemy.devAnchorY = slot.y;
  });
}

function getDevArenaDemonLordPosition() {
  const center = getDevMeleeArenaCenter();
  return { x: center.x - 250, y: center.y - 150 };
}

function spawnDevArenaDemonLord() {
  const pos = getDevArenaDemonLordPosition();
  const enemy = spawnEnemyOfType("miniHighDemon", pos, {
    skipSpawnEffects: true,
    applyCameraShake: false,
  });
  if (!enemy) return null;
  enemy.x = pos.x;
  enemy.y = pos.y;
  enemy.devAnchorX = pos.x;
  enemy.devAnchorY = pos.y;
  enemy.devImmobileTestDummy = true;
  enemy.spawnOffscreenTimer = 0;
  enemy.maxHealth = DEV_MELEE_ARENA_HEALTH;
  enemy.health = DEV_MELEE_ARENA_HEALTH;
  if (enemy.config) {
    enemy.config.maxHealth = DEV_MELEE_ARENA_HEALTH;
    enemy.config.health = DEV_MELEE_ARENA_HEALTH;
  }
  return enemy;
}

function maintainDevArenaDemonLord() {
  if (!isDevMeleeArenaActive()) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  if (!devArenaDemonLord) {
    if (now >= devArenaDemonLordRespawnAt) {
      devArenaDemonLord = spawnDevArenaDemonLord();
    }
    return;
  }
  const defeated =
    devArenaDemonLord.dead ||
    devArenaDemonLord.state === "death" ||
    devArenaDemonLord.removed ||
    devArenaDemonLord.invalid ||
    (Number.isFinite(devArenaDemonLord.health) && devArenaDemonLord.health <= 0);
  if (defeated) {
    devArenaDemonLord = null;
    devArenaDemonLordRespawnAt = now + DEV_ARENA_DEMON_LORD_RESPAWN_MS;
    return;
  }
  const pos = getDevArenaDemonLordPosition();
  devArenaDemonLord.x = pos.x;
  devArenaDemonLord.y = pos.y;
  devArenaDemonLord.devAnchorX = pos.x;
  devArenaDemonLord.devAnchorY = pos.y;
  devArenaDemonLord.maxHealth = DEV_MELEE_ARENA_HEALTH;
  devArenaDemonLord.health = DEV_MELEE_ARENA_HEALTH;
  if (devArenaDemonLord.config) {
    devArenaDemonLord.config.maxHealth = DEV_MELEE_ARENA_HEALTH;
    devArenaDemonLord.config.health = DEV_MELEE_ARENA_HEALTH;
  }
}

function getDevArenaFireKeeperPosition() {
  const pos = getDevArenaDemonLordPosition();
  return { x: pos.x, y: pos.y + 80 };
}

function spawnDevArenaFireKeeper() {
  const pos = getDevArenaFireKeeperPosition();
  const enemy = spawnEnemyOfType("miniDemonFireKeeper", pos, {
    skipSpawnEffects: true,
    applyCameraShake: false,
  });
  if (!enemy) return null;
  enemy.x = pos.x;
  enemy.y = pos.y;
  enemy.devAnchorX = pos.x;
  enemy.devAnchorY = pos.y;
  enemy.devImmobileTestDummy = true;
  enemy.devArenaIdleOnly = true;
  enemy.spawnOffscreenTimer = 0;
  enemy.maxHealth = DEV_MELEE_ARENA_HEALTH;
  enemy.health = DEV_MELEE_ARENA_HEALTH;
  if (enemy.config) {
    enemy.config.maxHealth = DEV_MELEE_ARENA_HEALTH;
    enemy.config.health = DEV_MELEE_ARENA_HEALTH;
  }
  return enemy;
}

function maintainDevArenaFireKeeper() {
  if (!isDevMeleeArenaActive()) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  if (!devArenaFireKeeper) {
    if (now >= devArenaFireKeeperRespawnAt) {
      devArenaFireKeeper = spawnDevArenaFireKeeper();
    }
    return;
  }
  const defeated =
    devArenaFireKeeper.dead ||
    devArenaFireKeeper.state === "death" ||
    devArenaFireKeeper.removed ||
    devArenaFireKeeper.invalid ||
    (Number.isFinite(devArenaFireKeeper.health) && devArenaFireKeeper.health <= 0);
  if (defeated) {
    devArenaFireKeeper = null;
    devArenaFireKeeperRespawnAt = now + DEV_ARENA_DEMON_LORD_RESPAWN_MS;
    return;
  }
  const pos = getDevArenaFireKeeperPosition();
  devArenaFireKeeper.x = pos.x;
  devArenaFireKeeper.y = pos.y;
  devArenaFireKeeper.devAnchorX = pos.x;
  devArenaFireKeeper.devAnchorY = pos.y;
  devArenaFireKeeper.maxHealth = DEV_MELEE_ARENA_HEALTH;
  devArenaFireKeeper.health = DEV_MELEE_ARENA_HEALTH;
  if (devArenaFireKeeper.config) {
    devArenaFireKeeper.config.maxHealth = DEV_MELEE_ARENA_HEALTH;
    devArenaFireKeeper.config.health = DEV_MELEE_ARENA_HEALTH;
  }
}

function activateDevMeleeArenaMode() {
  devMeleeArenaMode = true;
  randomizeDevArenaFloorOption();
  battlefieldFloorSelectionKey = "";
  resetDevMeleeMoveFeed();
  if (typeof window !== "undefined") {
    window.__battlechurchDevMeleeArenaMode = true;
    window.__devArenaMeleeFeed = devMeleeMoveFeed;
  }
  paused = false;
  gameOver = false;
  postDeathSequenceActive = false;
  postDeathAnimLeadActive = false;
  postDeathAnimLeadTimer = 0;
  pendingDistrictIntroStart = false;
  suppressInitialAnnouncements = false;
  if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  if (levelManager?.reset) levelManager.reset();
  clearCongregationMembers();
  clearCongregationSpeechBubbles();
  npcsSuspended = false;
  battlefieldIntroFadeAlpha = 0;
  resetCozyNpcs(5);
  enemies.splice(0, enemies.length);
  projectiles.splice(0, projectiles.length);
  bossHazards.splice(0, bossHazards.length);
  clearAllPowerUps();
  clearGracePickups();
  activeBoss = null;
  devArenaImpHordeSlots = [];
  devArenaDemonLord = null;
  devArenaDemonLordRespawnAt = 0;
  devArenaFireKeeper = null;
  devArenaFireKeeperRespawnAt = 0;
  devArenaPrayerRefillAt = 0;
  devArenaLastPrayerCharge = null;
  devArenaPickupSlots = [];
  if (player) {
    const center = getDevMeleeArenaCenter();
    player.x = center.x;
    player.y = center.y - 180;
    clampEntityToBounds(player);
    player.maxHealth = DEV_MELEE_ARENA_HEALTH;
    player.health = DEV_MELEE_ARENA_HEALTH;
    const prayerRequired = Math.max(
      1,
      Number(player.prayerChargeRequired) || Number(PRAYER_BOMB_CHARGE_REQUIRED) || 1,
    );
    player.prayerCharge = prayerRequired;
  }
  spawnDevMeleeArenaEnemy();
  initializeDevArenaImpHordeSlots();
  maintainDevArenaImpHorde();
  maintainDevArenaDemonLord();
  maintainDevArenaFireKeeper();
  enforceDevMeleeArenaVitals();
  pauseAllMusic();
  if (musicState.devArena) {
    musicState.devArena.currentTime = 0;
    playMusic(musicState.devArena, { volume: MUSIC_VOLUME_BATTLE, loop: true });
  }
  setDevStatus("Dev Arena active", 2.2);
}

function requestDevMeleeArenaLaunch() {
  pendingDevMeleeArenaLaunch = true;
  if (!titleScreenActive && !mapActive && player) {
    pendingDevMeleeArenaLaunch = false;
    activateDevMeleeArenaMode();
    return;
  }
  const districts = Array.isArray(window.BattlechurchMapData?.districts) ? window.BattlechurchMapData.districts : [];
  const districtId = districts[0]?.id || null;
  if (!districtId) {
    if (player) {
      pendingDevMeleeArenaLaunch = false;
      activateDevMeleeArenaMode();
    } else {
      setDevStatus("Dev Arena failed: no town/map loaded", 2.4);
    }
    return;
  }
  if (typeof window !== "undefined") {
    window.activeDistrictId = districtId;
  }
  activeDistrictId = districtId;
  startRunForDistrict(districtId);
}

function activateTutorialArenaMode() {
  tutorialArenaMode = true;
  // Clear the launch request; leaving it set made the tutorial relaunch
  // itself the frame after "Back to Game".
  pendingTutorialArenaLaunch = false;
  devMeleeArenaMode = false;
  resetDevMeleeMoveFeed();
  if (typeof window !== "undefined") {
    window.__battlechurchDevMeleeArenaMode = false;
    window.__battlechurchTutorialArenaMode = true;
  }
  paused = false;
  gameOver = false;
  postDeathSequenceActive = false;
  postDeathAnimLeadActive = false;
  postDeathAnimLeadTimer = 0;
  pendingDistrictIntroStart = false;
  suppressInitialAnnouncements = false;
  if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  if (tutorialArenaReturnSnapshot) {
    // Park the real level manager in the snapshot and give the tutorial an
    // idle one, so the player's progress survives the tutorial.
    levelManager = Levels.createLevelManager();
  } else if (levelManager?.reset) {
    levelManager.reset();
  }
  clearCongregationMembers();
  clearCongregationSpeechBubbles();
  npcsSuspended = false;
  battlefieldIntroFadeAlpha = 0;
  resetCozyNpcs(5);
  enemies.splice(0, enemies.length);
  projectiles.splice(0, projectiles.length);
  bossHazards.splice(0, bossHazards.length);
  clearAllPowerUps();
  clearGracePickups();
  activeBoss = null;
  tutorialArenaPrayerRefillAt = 0;
  tutorialArenaLastPrayerCharge = null;
  tutorialArenaCurrentMoveContext = { move: "", at: 0 };
  if (player) {
    const center = getDevMeleeArenaCenter();
    player.x = center.x;
    player.y = center.y - 180;
    clampEntityToBounds(player);
    player.maxHealth = DEV_MELEE_ARENA_HEALTH;
    player.health = DEV_MELEE_ARENA_HEALTH;
    const prayerRequired = Math.max(
      1,
      Number(player.prayerChargeRequired) || Number(PRAYER_BOMB_CHARGE_REQUIRED) || 1,
    );
    player.prayerCharge = prayerRequired;
    player.invulnerableTimer = Math.max(3, player.invulnerableTimer || 0);
  }
  tutorialArenaState = {
    objectiveIndex: 0,
    currentObjective: null,
    moveKillCount: 0,
    anyKillCount: 0,
    dashCount: 0,
    batchSpawned: false,
    completionQueuedAt: 0,
    nextSpawnSide: Math.random() < 0.5 ? "left" : "right",
    pendingStart: true,
  };
  updateTutorialArenaHudState();
  pauseAllMusic();
  if (musicState.devArena) {
    musicState.devArena.currentTime = 0;
    playMusic(musicState.devArena, { volume: MUSIC_VOLUME_BATTLE, loop: true });
  }
  setDevStatus("Tutorial Arena active", 2.2);
}

function requestTutorialArenaLaunch(source = "auto") {
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  if (now < tutorialArenaLaunchLockUntil) return;
  tutorialArenaLaunchLockUntil = now + 300;
  if (isTutorialArenaActive()) return;
  // Remember where we came from. Only possible when the pastor already exists
  // and we're not on the map (those paths have to start a fresh run).
  tutorialArenaReturnSnapshot = player && !mapActive ? captureTutorialArenaReturnSnapshot() : null;
  tutorialArenaLaunchContext = {
    stage: String(levelManager?.getStatus?.()?.stage || ""),
    titleScreenActive: Boolean(titleScreenActive),
    mapActive: Boolean(mapActive),
  };
  const launchSource = String(source || "auto").toLowerCase();
  if (launchSource === "title") {
    tutorialArenaReturnRoute = "title";
  } else if (launchSource === "congregation") {
    tutorialArenaReturnRoute = "congregation";
  } else if (launchSource === "pause") {
    tutorialArenaReturnRoute = "gameplay";
  } else {
    const currentStage = String(levelManager?.getStatus?.()?.stage || "");
    tutorialArenaReturnRoute = titleScreenActive
      ? "title"
      : (currentStage === "levelIntro" ? "congregation" : "gameplay");
  }
  pendingTutorialArenaLaunch = true;
  const districts = Array.isArray(window.BattlechurchMapData?.districts) ? window.BattlechurchMapData.districts : [];
  const districtId = districts[0]?.id || null;

  // Title-screen path: bootstrap gameplay immediately, then tutorial activates
  // as soon as player/game state is ready.
  if (titleScreenActive) {
    if (player) {
      mapActive = false;
      titleScreenActive = false;
      activateTutorialArenaMode();
      return;
    }
    if (districtId) {
      activeDistrictId = districtId;
      if (typeof window !== "undefined") window.activeDistrictId = districtId;
    }
    mapActive = false;
    titleScreenActive = false;
    startGameFromTitle();
    pendingTutorialArenaLaunch = true;
    if (player) activateTutorialArenaMode();
    return;
  }

  if (!titleScreenActive && !mapActive && player) {
    activateTutorialArenaMode();
    return;
  }
  if (!districtId) {
    if (player) activateTutorialArenaMode();
    else setDevStatus("Tutorial Arena failed: no town/map loaded", 2.4);
    return;
  }
  if (typeof window !== "undefined") {
    window.activeDistrictId = districtId;
  }
  activeDistrictId = districtId;
  startRunForDistrict(districtId);
}
