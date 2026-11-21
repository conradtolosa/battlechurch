/* Top-down adventure sandbox | Version 2025-10-30b */

// Dev mode: only active on localhost. All developer tools and hotkeys are hidden in production.
const IS_DEV = typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
if (typeof window !== "undefined") window.IS_DEV = IS_DEV;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const gameWrapper = document.getElementById("gameWrapper");
const touchControlsRoot = document.getElementById("touchControls");
const moveStickBase = document.getElementById("moveStick");
const aimStickBase = document.getElementById("aimStick");
// On-screen pause button for touch (acts as Space: pause / resume).
const virtualSpaceButton =
  document.getElementById("virtualSpaceButton") || document.getElementById("touchPauseButton");
const arcControl = document.getElementById("arcControl");

let assets = null;
let player = null;
const enemies = [];
const projectiles = [];
const obstacles = [];
const weaponPickups = [];
const utilityPowerUps = [];
const churchPowerupPickups = [];
const pastorPowerupPickups = [];
const ringOfFireHazards = [];
const prayerStormGroundFires = [];
const gracePickups = [];
const graceHudFlyEffects = [];
const powerupHudFlyEffects = [];
const graceSpendFlyEffects = [];
let graceSpendAnimState = null;
// Helper to read from GameBalance config with fallback
const _gb = (path, fallback) => {
  if (typeof GameBalance === 'undefined') return fallback;
  const parts = path.split('.');
  let val = GameBalance;
  for (const p of parts) {
    if (val && typeof val === 'object' && p in val) val = val[p];
    else return fallback;
  }
  return val !== undefined ? val : fallback;
};

const _uiColor = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  const raw = window.UIStyles?.colors?.[key];
  return typeof raw === "string" && raw ? raw : fallback;
};

const UI_COLOR = Object.freeze({
  softWhite: _uiColor("softWhite", "#DFDFC4"),
  ice: _uiColor("ice", "#94C0D8"),
  teal: _uiColor("teal", "#8BD0BA"),
  crimson: _uiColor("crimson", "#D44E52"),
  gold: _uiColor("gold", "#DDA677"),
  healthFill: _uiColor("healthFill", "#B22E2E"),
  hpBarBg: _uiColor("hpBarBg", "rgba(10,15,31,0.6)"),
  hpBarBorder: _uiColor("hpBarBorder", "#94C0D8"),
  speechBubbleText: _uiColor("speechBubbleText", "#DFDFC4"),
  damageEnemy: _uiColor("damageEnemy", "#D44E52"),
  damageCounter: _uiColor("damageCounter", "#FFE7A1"),
  comboMilestone: _uiColor("comboMilestone", "#DDA677"),
});

function installDesolateCanvasColorLock() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!_gb("masterRenderStyle.enforceDesolatePalette", true)) return;
  const Ctx = window.CanvasRenderingContext2D;
  if (!Ctx || !Ctx.prototype || Ctx.prototype.__battlechurchDesolatePaletteLocked) return;

  const paletteHex = Array.isArray(window.UIStyles?.theme?.palette)
    ? window.UIStyles.theme.palette.filter((c) => typeof c === "string" && c)
    : [UI_COLOR.softWhite, UI_COLOR.gold, UI_COLOR.ice, UI_COLOR.teal, UI_COLOR.crimson, UI_COLOR.healthFill];
  if (!paletteHex.length) return;

  const toRgb = (hex) => {
    const raw = String(hex || "").trim().replace(/^#/, "");
    if (raw.length !== 6) return null;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    if (![r, g, b].every(Number.isFinite)) return null;
    return { r, g, b };
  };

  const palette = paletteHex
    .map((hex) => ({ hex: hex[0] === "#" ? hex.toLowerCase() : `#${hex.toLowerCase()}`, rgb: toRgb(hex) }))
    .filter((entry) => entry.rgb);
  if (!palette.length) return;

  const parserCanvas = document.createElement("canvas");
  parserCanvas.width = 1;
  parserCanvas.height = 1;
  const parserCtx = parserCanvas.getContext("2d");
  if (!parserCtx) return;

  const parseCache = new Map();
  const outputCache = new Map();

  const parseColor = (input) => {
    if (typeof input !== "string") return null;
    if (parseCache.has(input)) return parseCache.get(input);
    let normalized = "";
    try {
      parserCtx.fillStyle = "#000000";
      parserCtx.fillStyle = input;
      normalized = String(parserCtx.fillStyle || "");
    } catch (_e) {
      parseCache.set(input, null);
      return null;
    }
    if (!normalized) {
      parseCache.set(input, null);
      return null;
    }
    if (normalized.startsWith("#")) {
      const rgb = toRgb(normalized);
      const parsed = rgb ? { ...rgb, a: 1 } : null;
      parseCache.set(input, parsed);
      return parsed;
    }
    const match = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) {
      parseCache.set(input, null);
      return null;
    }
    const parts = match[1].split(",").map((p) => p.trim());
    if (parts.length < 3) {
      parseCache.set(input, null);
      return null;
    }
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = parts.length > 3 ? Number(parts[3]) : 1;
    const parsed = [r, g, b, a].every(Number.isFinite)
      ? { r: Math.max(0, Math.min(255, r)), g: Math.max(0, Math.min(255, g)), b: Math.max(0, Math.min(255, b)), a: Math.max(0, Math.min(1, a)) }
      : null;
    parseCache.set(input, parsed);
    return parsed;
  };

  const remapColor = (value) => {
    if (typeof value !== "string") return value;
    if (outputCache.has(value)) return outputCache.get(value);
    const parsed = parseColor(value);
    if (!parsed) {
      outputCache.set(value, value);
      return value;
    }
    let best = palette[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < palette.length; i += 1) {
      const p = palette[i].rgb;
      const dr = parsed.r - p.r;
      const dg = parsed.g - p.g;
      const db = parsed.b - p.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = palette[i];
      }
    }
    const out = parsed.a < 0.999
      ? `rgba(${best.rgb.r}, ${best.rgb.g}, ${best.rgb.b}, ${parsed.a.toFixed(3)})`
      : best.hex;
    outputCache.set(value, out);
    return out;
  };

  ["fillStyle", "strokeStyle", "shadowColor"].forEach((prop) => {
    const descriptor = Object.getOwnPropertyDescriptor(Ctx.prototype, prop);
    if (!descriptor || typeof descriptor.get !== "function" || typeof descriptor.set !== "function") return;
    Object.defineProperty(Ctx.prototype, prop, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: function getColorStyle() {
        return descriptor.get.call(this);
      },
      set: function setColorStyle(value) {
        descriptor.set.call(this, remapColor(value));
      },
    });
  });

  Ctx.prototype.__battlechurchDesolatePaletteLocked = true;
}

const CLASS_SELECTION_STORAGE_KEY = "battlechurch.selectedClassId";
const CLASS_SELECTION_HINT_SEEN_KEY = "battlechurch.classHintShown";
const classConfig =
  (typeof window !== "undefined" && window.BattlechurchClassConfig) || {};
const classEntries = Array.isArray(classConfig.classes) ? classConfig.classes : [];
const classById = classConfig.byId && typeof classConfig.byId === "object" ? classConfig.byId : {};
const classLegacyIdMap =
  classConfig.legacyIdMap && typeof classConfig.legacyIdMap === "object"
    ? classConfig.legacyIdMap
    : {};
const defaultClassId =
  typeof classConfig.defaultClassId === "string" && classConfig.defaultClassId.trim()
    ? classConfig.defaultClassId.trim()
    : (classEntries[0]?.id || "default");
let activeClassId = defaultClassId;

function getClassById(classId) {
  const rawKey = String(classId || "").trim();
  const key = (rawKey && classLegacyIdMap[rawKey]) || rawKey;
  return (key && classById[key]) || classById[defaultClassId] || classEntries[0] || null;
}

function loadSelectedClassIdFromStorage() {
  if (typeof localStorage === "undefined") return defaultClassId;
  try {
    const raw = localStorage.getItem(CLASS_SELECTION_STORAGE_KEY);
    const selected = String(raw || "").trim();
    return getClassById(selected)?.id || defaultClassId;
  } catch (_error) {
    return defaultClassId;
  }
}

function saveSelectedClassIdToStorage(classId) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLASS_SELECTION_STORAGE_KEY, classId);
  } catch (_error) {}
}

function hasSelectedClassStorageKey() {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(CLASS_SELECTION_STORAGE_KEY) != null;
  } catch (_error) {
    return false;
  }
}

function hasShownClassSelectionHint() {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(CLASS_SELECTION_HINT_SEEN_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

function markClassSelectionHintShown() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLASS_SELECTION_HINT_SEEN_KEY, "1");
  } catch (_error) {}
}

function getSortedClassMenuEntries(list) {
  // Only show top-level traditions at character creation; pin Independent first.
  const all = Array.isArray(list) ? list : [];
  const topLevel = all.filter((c) => c?.isTopLevel);
  const entries = topLevel.length > 0 ? topLevel : all.slice();
  entries.sort((a, b) => {
    const aLabel = String(a?.classTitle || a?.id || "");
    const bLabel = String(b?.classTitle || b?.id || "");
    const aPinned = aLabel.toLowerCase() === "independent";
    const bPinned = bLabel.toLowerCase() === "independent";
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
  });
  return entries;
}

function setActiveClassId(classId, { syncToActiveSave = true } = {}) {
  const resolved = getClassById(classId);
  activeClassId = resolved?.id || defaultClassId;
  saveSelectedClassIdToStorage(activeClassId);
  if (syncToActiveSave && window.MapScreen?.setClassForActiveSave) {
    void window.MapScreen.setClassForActiveSave(activeClassId, { persist: true });
  }
  return activeClassId;
}

function getActiveClass() {
  return getClassById(activeClassId);
}

function getActiveClassMultiplier(path, fallback = 1) {
  const active = getActiveClass();
  if (!active || !active.tuning) return fallback;
  const parts = String(path || "").split(".");
  let value = active.tuning;
  for (const part of parts) {
    if (!value || typeof value !== "object" || !(part in value)) return fallback;
    value = value[part];
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function applyPlayerMeleeClassMultiplier(baseDamage) {
  return Math.max(
    1,
    Math.round(Number(baseDamage || 0) * getActiveClassMultiplier("player.meleeDamageMultiplier", 1)),
  );
}

function applyPlayerProjectileClassMultiplier(baseDamage) {
  return Math.max(
    1,
    Math.round(Number(baseDamage || 0) * getActiveClassMultiplier("player.projectileDamageMultiplier", 1)),
  );
}

function applyNpcDamageClassMultiplier(baseDamage) {
  return Math.max(
    1,
    Math.round(Number(baseDamage || 0) * getActiveClassMultiplier("npc.damageMultiplier", 1)),
  );
}

function applyNpcRofClassMultiplier(baseCooldown) {
  const rof = Math.max(0.05, getActiveClassMultiplier("npc.rofMultiplier", 1));
  return Math.max(0.02, Number(baseCooldown || 0) / rof);
}

function applyPrayerGainClassMultiplier(baseGain) {
  const mult = Math.max(0, getActiveClassMultiplier("player.prayerGainMultiplier", 1));
  return Math.max(0, Number(baseGain || 0) * mult);
}

function applySmiteDamageClassMultiplier(baseDamage) {
  const mult = Math.max(0, getActiveClassMultiplier("player.smiteDamageMultiplier", 1));
  return Math.max(0, Number(baseDamage || 0) * mult);
}

function applyPlayerCooldownClassMultiplier(baseCooldown) {
  const mult = Math.max(0.05, getActiveClassMultiplier("player.cooldownMultiplier", 1));
  return Math.max(0, Number(baseCooldown || 0) * mult);
}

function getMoveMultiplier(moveName) {
  if (location.hostname === 'localhost' && window.BattlechurchMoveCatalog && !window.BattlechurchMoveCatalog.byKey[moveName]) {
    console.warn(`getMoveMultiplier: unknown move "${moveName}" — add it to move_catalog.js`);
  }
  const cls = window.BattlechurchClasses?.getActive?.();
  const mult = cls?.tuning?.player?.moves?.[moveName];
  const val = typeof mult === "number" ? mult : 1.0;
  return Math.max(0.1, val);
}

activeClassId = loadSelectedClassIdFromStorage();

if (typeof window !== "undefined") {
  window.BattlechurchClasses = {
    getAll() {
      return classEntries.slice();
    },
    getActive() {
      return getActiveClass();
    },
    getActiveId() {
      return activeClassId;
    },
    setActive(classId) {
      return setActiveClassId(classId);
    },
    getById(classId) {
      return getClassById(classId);
    },
  };
}

const POWERUP_RESPAWN_DELAY = _gb('powerups.respawnDelay', 5);
const POWERUP_ACTIVE_LIFETIME = _gb('powerups.activeLifetime', 8);
const POWERUP_BLINK_DURATION = _gb('powerups.blinkDuration', 2);
const POWERUP_SPAWN_BLINK_DURATION = _gb('powerups.spawnBlinkDuration', 1.2);
const POWERUP_STAGGER_DELAY = _gb('powerups.staggerDelay', 4);
const POWERUP_REFILL_DELAY = _gb('powerups.refillDelay', 4);
let powerUpRespawnTimer = 0;
let powerUpStaggerTimer = 0;
let churchPowerupEnsureTimer = 0;
let pastorPowerupSpawnTimer = 0;
let pastorDashBuffTimer = 0;
let queuedPowerUpDrops = 0;
let powerUpEnsureCycleIndex = 0;
let playerGraceCount = 0;
let graceDropHpBudget = 0;
let maxChainThisTown = 0;
let hudComboDisplay = null;
const unlockedChurchPowerups = new Set();
const churchPowerupLevels = new Map();
const GRACE_PICKUP_RADIUS = _gb('grace.pickupRadius', 18);
const GRACE_PICKUP_FRAME_DURATION = 0.08;
const GRACE_PICKUP_LIFETIME = _gb('grace.lifetime', 15);
const GRACE_PICKUP_ATTRACT_DISTANCE = _gb('grace.attractDistance', 170);
const GRACE_PICKUP_ATTRACT_FORCE = _gb('grace.attractForce', 460);
const GRACE_PICKUP_GRAVITY = _gb('grace.gravity', 520);
const GRACE_PICKUP_AIR_DRAG = _gb('grace.airDrag', 0.88);
const GRACE_PICKUP_FLOOR_Y = () => canvas.height - 36;
const GRACE_DROP_PER_HP = _gb('grace.dropPerHp', 0.005);
const GRACE_DROP_MAX_PER_KILL = _gb('grace.dropMaxPerKill', 3);
const GRACE_COUNTER_HIT_GEMS = _gb('grace.counterHitGems', 1);
const GRACE_PUNISH_COUNTER_GEMS = _gb('grace.punishCounterGems', 3);
const GRACE_MELEE_COMBO_GEMS = _gb('grace.meleeComboGems', 1);
const GRACE_VICTORY_BURST_AMOUNT = _gb('grace.victoryBurstAmount', 20);
const GRACE_BOSS_DEATH_BURST_AMOUNT = _gb('grace.bossDeathBurstAmount', 18);
const GRACE_BOSS_DEATH_BURST_LIFE = _gb('grace.bossDeathBurstLife', 22);
const GRACE_RUSH_BATTLE_BURST_AMOUNT = _gb('grace.rushBattleBurstAmount', 16);
const GRACE_RUSH_BOSS_BURST_AMOUNT = _gb('grace.rushBossBurstAmount', 26);
const GRACE_RUSH_BATTLE_SPAWN_INTERVAL = _gb('grace.rushBattleSpawnInterval', 1.1);
const GRACE_RUSH_BOSS_SPAWN_INTERVAL = _gb('grace.rushBossSpawnInterval', 0.65);
const GRACE_BOSS_DEATH_RAIN_INTERVAL_IDLE = _gb('grace.bossDeathRainIntervalIdle', 0.22);
const GRACE_BOSS_DEATH_RAIN_INTERVAL_ACTIVE = _gb('grace.bossDeathRainIntervalActive', 0.18);
const GRACE_BOSS_DEATH_RAIN_INITIAL_DELAY = _gb('grace.bossDeathRainInitialDelay', 0.08);
const GRACE_RUSH_DURATION = _gb('grace.rushDuration', 8);
const GRACE_BONUS_MULTIPLIER = _gb('grace.bonusMultiplier', 5);
const POST_DEATH_ANIM_LEAD = 2;
const POST_DEATH_HANG = 0;
const ARENA_FADE_DURATION = 2;
let postDeathSequenceActive = false;
let postDeathAnimLeadActive = false;
let pendingExteriorShotAfterVisitor = false;
let pendingBossIntroAfterExterior = false;
let mapAmbientFadeQueued = false;
let postDeathTimer = 0;
let postDeathAnimLeadTimer = 0;
let miniImpWaveDispatched = false;
let arenaFadeTimer = 0;
let arenaFadeAlpha = 0;
let bossBonusTransitionFadeTimer = 0;
let bossBonusTransitionFadeDuration = 0;
let bossBonusTransitionFadeAlpha = 0;
let battlefieldIntroFadeTimer = 0;
let battlefieldIntroFadeDuration = 0;
let battlefieldIntroFadeAlpha = 0;
const CONGREGATION_SCREEN_DURATION = 4.0;
const MISSION_INTRO_FADE_IN = 0.8;
const MISSION_INTRO_FADE_OUT = 0.8;
const MISSION_INTRO_HOLD_SECONDS = 2;
let battlefieldIntroActive = false;
let battlefieldIntroNumber = 2;
let battlefieldIntroImage = null;
let lastCompletedLevel = 0;
let lastSummaryWasLevelEnd = false;
let pendingPostUpgradeTransition = false;
let graceRushFadeTimer = 0;
let graceRushFadeDuration = 0;
let graceRushFadeAlpha = 0;
let graceRushFadeHold = false;
let graceRushFadeReleaseTimer = 0;
let graceRushBlackout = false;
let graceRushHardBlackoutTimer = 0;
let bossVictoryElapsed = 0;
let recapIntroFadeTimer = 0;
let recapIntroFadeDuration = 0;
let recapIntroFadeAlpha = 0;
let playerDeathFadeAlpha = 0;
const PLAYER_DEATH_FADE_TARGET = 0.5;
const PLAYER_DEATH_FADE_SPEED = 6;
let damageHitFlash = 0;
let prayerBombRainTimer = 0;
let prayerBombRainSpawnTimer = 0;
let prayerBombScreenFadeTimer = 0;
let prayerBombScreenFadeDuration = 0.8;
let smiteBombFlashTimer = 0;
const SMITE_BOMB_FLASH_DURATION = 0.22;
const SMITE_BOMB_SWEEP_DURATION = 1.3;
const SMITE_BOMB_SWEEP_BAND = 30;
const SMITE_BOMB_SWEEP_HAZARD_LIFE = .5;
const SMITE_BOMB_SWEEP_RING_COUNT = 3;
const SMITE_BOMB_SWEEP_RING_DAMAGE = 100;
const SMITE_BOMB_SWEEP_RING_DELAY = 0.22;
let smiteBombSweepState = null;
let prayerStormGroundFireTargetThisCast = 0;
let prayerStormGroundFireSpawnedThisCast = 0;
let prayerStormRainImpactCountThisCast = 0;
let prayerStormGroundFireNextSpawnAtImpact = Infinity;
let prayerStormGroundFireImpactSpacing = Infinity;
const prayerBombComboState = {
  active: false,
  hits: 0,
  label: null,
  anchorX: null,
  anchorY: null,
};
const DAMAGE_HIT_FLASH_DURATION = 0.08;
if (typeof window !== "undefined" && !window.triggerDamageFlash) {
  window.triggerDamageFlash = () => {
    damageHitFlash = DAMAGE_HIT_FLASH_DURATION;
  };
}
const npcs = [];
let hitboxEditorNpcPreview = null;
const effects = Effects.getActive();
let divineChargeSparkEffect = null;
let divineChargeFlashEffect = null;
let prayerBombReadyEffect = null;
let divineChargeFlashFrames = null;
let playerDashState = {
  isDashing: false,
  dashDir: { x: 0, y: 0 },
  dashDistanceRemaining: 0,
  dashDustAccumulator: 0,
  pendingDashTimer: 0,
  pendingDashDir: { x: 1, y: 0 },
  dashCooldown: 0,
};
let ashOverlay = null;
let fireOverlay = null;
let pendingDistrictIntroStart = false;
let districtIntroDismissedAt = 0;
const DISTRICT_INTRO_ZOOM_DURATION = 1.0;
const DISTRICT_INTRO_FADE_DURATION = 2.0;
let districtIntroTransitionActive = false;
let districtIntroTransitionTimer = 0;
let districtVisitorMinigamePlayed = false;
let suppressInitialAnnouncements = false;
const levelAnnouncements = [];
let levelManager = null;
let npcDamageImmuneForBriefTeaser = false;
const briefTeaserState = {
  active: false,
  spawnScheduled: false,
  introTextQueued: false,
  spawnTimers: [],
};
const briefTeaserDialogueState = {
  timerSec: 0,
  lineIndex: 0,
  linePool: [],
};

function clearBriefTeaserSpawnTimers() {
  if (!Array.isArray(briefTeaserState.spawnTimers)) return;
  for (const timerId of briefTeaserState.spawnTimers) {
    if (typeof clearTimeout === "function" && timerId) {
      clearTimeout(timerId);
    }
  }
  briefTeaserState.spawnTimers.length = 0;
}

function scheduleBriefTeaserSpawns() {
  if (briefTeaserState.spawnScheduled) return;
  briefTeaserState.spawnScheduled = true;
  const scheduleAt = [150, 1450, 2750];
  scheduleAt.forEach((delayMs) => {
    if (typeof setTimeout !== "function") return;
    const timerId = setTimeout(() => {
      try {
        if (typeof window !== "undefined" && window.Spawner?.spawnEnemyGroup) {
          window.Spawner.spawnEnemyGroup(20, null, { skipSpawnEffects: false }, "miniImp");
        }
      } catch (error) {}
    }, delayMs);
    briefTeaserState.spawnTimers.push(timerId);
  });
}
let activeBoss = null;
const bossHazards = [];
let titleScreenActive = true;
let titleDemoSaveMenuActive = false;
let titleClassMenuActive = false;
let titleUtilityPanelMode = null;
let titleEditSaveDraft = null;
let titleNewSaveDraft = null;
const TITLE_EDIT_SAVE_FIELD_LIMITS = Object.freeze({
  playerName: 24,
  cityName: 24,
});
let titleDemoSaveOverride = null;
let demoSandboxRunActive = false;
let titleCloudSaveLoading = false;
let titleCloudSaveRows = [];
let titleCloudActiveSaveId = null;
let titleCloudSelectedSaveId = null;
const TITLE_DEMO_SAVE_SLOTS = [
  {
    key: "slot1",
    label: "Demo: New Playthrough",
    districtId: "pine_hollow",
    completedDistricts: 0,
    playerName: "DemoName",
    cityName: "DemoTown",
    classId: "class9",
    campaignData: {
      campaign: "p1",
      startCount: 50,
      campaignMultiplier: 1.0,
      restoredChurchPowerupLevels: {},
    },
  },
  {
    key: "slot2",
    label: "Demo: District 3 (Demon Overload)",
    districtId: "northvale",
    completedDistricts: 2,
    playerName: "DemoName",
    cityName: "DemoTown",
    classId: "class9",
    campaignData: {
      campaign: "p1",
      startCount: 50,
      campaignMultiplier: 1.0,
      restoredChurchPowerupLevels: { spreadGun: 3, halo: 3, spear: 3, sentry: 3 },
      restoredPastorPowerupLevels: { prayer: 1, hp: 1 },
    },
    districtPowerups: {
      pine_hollow: { spreadGun: 2 },
      stone_ridge: { halo: 2 },
    },
    districtStartCounts: {
      pine_hollow: 100,
      stone_ridge: 100,
    },
  },
  {
    key: "slot3",
    label: "Demo: District 4 (Armor Town)",
    description: "Mainly for QA testing melee combos",
    districtId: "red_creek",
    completedDistricts: 3,
    playerName: "DemoName",
    cityName: "DemoTown",
    classId: "class9",
    campaignData: null,
    districtPowerups: {
      pine_hollow:  { spreadGun: 5 },
      stone_ridge:  { halo: 5 },
      northvale:    { spear: 5 },
    },
    districtStartCounts: {
      pine_hollow: 100,
      stone_ridge: 100,
      northvale:   100,
    },
  },
];

function setDemoSandboxRunActive(active) {
  demoSandboxRunActive = Boolean(active);
  if (!demoSandboxRunActive && typeof window !== "undefined" && typeof window.MapScreen?.clearDemoProfile === "function") {
    window.MapScreen.clearDemoProfile();
  }
  if (typeof window !== "undefined") {
    window.__demoSandboxRunActive = demoSandboxRunActive;
  }
}
setDemoSandboxRunActive(false);
let assetsLoaded = false;
let mapReady = false; // True when title/map can be used (before full gameplay assets)
let gameplayAssetsPromise = null; // Promise for background gameplay asset loading
let loadingProgress = 0; // 0-100
const devStatus = { text: "", timer: 0 };
const weaponPickupAnnouncement = {
  title: "",
  description: "",
  color: UI_COLOR.softWhite,
  iconSrc: "",
  timer: 0,
  duration: 0,
};
let evacuatedNpcCount = 0;
let npcsSuspended = false;
const congregationMembers = [];
let congregationWanderBounds = null;
let npcProcessionActive = false;
let powerUpsClearedForCongregation = false;
let congregationGreetingShown = false;
let congregationWelcomeTimer = 0;
let congregationGreetingCount = 0;
let congregationMonsterAmbientTimer = 0;
let congregationTutorialPrayerInit = false;
let congregationDialogueIndex = 0;
const congregationWaveIntroDialogueState = {
  activeKey: "",
  queue: [],
  usedResponders: new Set(),
};
const battleVictoryDialogueState = {
  queue: [],
};
let sentryOrbitAngle = 0;
const CONGREGATION_MEMBER_RADIUS = 26;
const CONGREGATION_MEMBER_COUNT = 50;
const INITIAL_CONGREGATION_SIZE = CONGREGATION_MEMBER_COUNT;
const CONGREGATION_DIALOGUE_COOLDOWN_MS = 4500;
const CONGREGATION_DIALOGUE_DATA =
  (typeof window !== "undefined" && window.BattlechurchCongregationDialogue) || {};
const CONGREGATION_DIALOGUE_LINES =
  CONGREGATION_DIALOGUE_DATA.lines || [];
const CONGREGATION_DIALOGUE_LINES_BY_CAMPAIGN =
  CONGREGATION_DIALOGUE_DATA.linesByCampaign || {};
const CONGREGATION_WAVE_INTRO_DIALOGUE = CONGREGATION_DIALOGUE_DATA.waveIntro || {};
const CONGREGATION_WAVE_END_DIALOGUE = CONGREGATION_DIALOGUE_DATA.waveEnd || {};
const CONGREGATION_RED_FAITH_DIALOGUE = CONGREGATION_DIALOGUE_DATA.redFaith || {};
const CONGREGATION_TEASER_DIALOGUE = CONGREGATION_DIALOGUE_DATA.teaser || {};

function getCongregationIntroLinesForCampaign(campaignIdRaw) {
  const campaignId = String(campaignIdRaw || "").toLowerCase();
  const fromCampaign =
    Array.isArray(CONGREGATION_DIALOGUE_LINES_BY_CAMPAIGN?.[campaignId]) &&
    CONGREGATION_DIALOGUE_LINES_BY_CAMPAIGN[campaignId].length
      ? CONGREGATION_DIALOGUE_LINES_BY_CAMPAIGN[campaignId]
      : null;
  if (fromCampaign) return fromCampaign;
  if (Array.isArray(CONGREGATION_DIALOGUE_LINES_BY_CAMPAIGN?.p1) && CONGREGATION_DIALOGUE_LINES_BY_CAMPAIGN.p1.length) {
    return CONGREGATION_DIALOGUE_LINES_BY_CAMPAIGN.p1;
  }
  return Array.isArray(CONGREGATION_DIALOGUE_LINES) ? CONGREGATION_DIALOGUE_LINES : [];
}

function getActiveSpeechBubbleCountForEntities(entities) {
  if (!Array.isArray(entities) || !entities.length) return 0;
  const set = new Set(entities.filter(Boolean));
  if (!set.size) return 0;
  return floatingTexts.filter(
    (ft) =>
      ft &&
      ft.speechBubble &&
      Number(ft.life || 0) > 0 &&
      set.has(ft.entity),
  ).length;
}

function updateBriefTeaserNpcDialogue(dt, levelStatus) {
  const stage = levelStatus?.stage;
  const teaserStageActive = stage === "briefingTeaser" || stage === "congregationToTeaser";
  if (!teaserStageActive) {
    briefTeaserDialogueState.timerSec = 0;
    briefTeaserDialogueState.linePool = [];
    return;
  }
  const teaserLines = Array.isArray(CONGREGATION_TEASER_DIALOGUE.lines)
    ? CONGREGATION_TEASER_DIALOGUE.lines
    : [];
  const lines = teaserLines
    .filter((line) => typeof line === "string" && line.trim());
  if (!lines.length || !Array.isArray(npcs) || !npcs.length) return;
  const cfg = CONGREGATION_TEASER_DIALOGUE || {};
  const maxConcurrent = Math.max(1, Math.floor(Number(cfg.maxConcurrentSpeakers) || 2));
  const minIntervalSec = Math.max(0.6, Number(cfg.minIntervalSec) || 2.8);
  const maxIntervalSec = Math.max(minIntervalSec, Number(cfg.maxIntervalSec) || 4.2);
  const bubbleLifeSec = Math.max(1.2, Number(cfg.bubbleLifeSec) || 3.9);

  briefTeaserDialogueState.timerSec -= Math.max(0, Number(dt) || 0);
  if (briefTeaserDialogueState.timerSec > 0) return;

  const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const eligible = npcs.filter(
    (npc) =>
      npc &&
      !npc.dead &&
      !npc.departed &&
      Number.isFinite(npc.x) &&
      Number.isFinite(npc.y) &&
      (!Number.isFinite(npc.dialogueCooldownUntil) || now >= npc.dialogueCooldownUntil),
  );
  if (!eligible.length) {
    briefTeaserDialogueState.timerSec = minIntervalSec;
    return;
  }
  const activeBubbleCount = getActiveSpeechBubbleCountForEntities(npcs);
  if (activeBubbleCount >= maxConcurrent) {
    briefTeaserDialogueState.timerSec = minIntervalSec + Math.random() * Math.max(0, maxIntervalSec - minIntervalSec);
    return;
  }
  const npc = eligible[Math.floor(Math.random() * eligible.length)];
  const normalizedLines = lines.map((line) => String(line).trim()).filter(Boolean);
  const pool = Array.isArray(briefTeaserDialogueState.linePool) ? briefTeaserDialogueState.linePool : [];
  if (!pool.length) {
    briefTeaserDialogueState.linePool = normalizedLines.slice().sort(() => Math.random() - 0.5);
  }
  const line = briefTeaserDialogueState.linePool.shift();
  if (line) {
    npcCheer(npc, line, UI_COLOR.speechBubbleText, { life: bubbleLifeSec });
    npc.dialogueCooldownUntil = now + CONGREGATION_DIALOGUE_COOLDOWN_MS;
  }
  briefTeaserDialogueState.timerSec = minIntervalSec + Math.random() * Math.max(0, maxIntervalSec - minIntervalSec);
}
const NPC_PROCESSION_SPEED_MULTIPLIER = 3.5;
let congregationSize = INITIAL_CONGREGATION_SIZE;
let districtStartCongregation = INITIAL_CONGREGATION_SIZE;
const NPC_PROCESSION_ENTRY_MARGIN = 220;
const VISITOR_GUEST_COUNT = 10;
const VISITOR_SESSION_DURATION = 30;
const VISITOR_GUEST_MAX_FAITH = 10;
const VISITOR_BLOCKER_HITS_REQUIRED = 5;
const HEART_FAITH_PER_HIT = 1;
const VISITOR_BLOCKER_LINES =
  (typeof window !== "undefined" &&
    window.BattlechurchVisitorBlocker &&
    window.BattlechurchVisitorBlocker.blockerLines) ||
  [];
const ITEM_SPRITE_ROOT = "assets/sprites/items/icons";
const TORCH_SPRITE_FILE = `${ITEM_SPRITE_ROOT}/I43_Torch.png`;
const FLAG_SPRITE_FILE = `${ITEM_SPRITE_ROOT}/I28_Idol.png`;
const DEFAULT_ARROW_SFX_SRC = "assets/sfx/rpg/Magic/fireball_release_3.wav";
// (moved to audio.js)

function getFinalEndingState() {
  const finalSize = getCongregationSize();
  const grew = finalSize > INITIAL_CONGREGATION_SIZE;
  return { finalSize, grew };
}

function queuePastorFinalAnnouncement() {
  const line = "\"I heard from the denomination, and they've decided to keep this church open. I look forward to spending more time with you all and continuing to bring love, joy, and peace into this town!\"";
  queueLevelAnnouncement(line, "", {
    requiresConfirm: true,
    skipMissionBrief: true,
    pastorFinal: true,
  });
}

const PASTOR_BOSS_POST_RECAP_LINES = {
  default: "You're now in good hands. I'm needed in the next town. I'll come back to visit.",
};

function queuePastorBossPostRecapAnnouncement(levelNumber, upgradeAfter = false) {
  const line =
    PASTOR_BOSS_POST_RECAP_LINES[levelNumber] || PASTOR_BOSS_POST_RECAP_LINES.default;
  queueLevelAnnouncement(line, "", {
    requiresConfirm: true,
    skipMissionBrief: true,
    pastorPostRecap: true,
    pastorPostRecapDelay: 0.6,
    pastorPostRecapUpgradeAfter: upgradeAfter,
  });
}

const BETA_EPILOGUE_DISTRICT_ID = "red_creek";

function activateBetaEpilogue() {
  epilogueTitle = "Thanks for Playing!";
  epilogueBackgroundKey = "epilogue";
  epilogueText =
    "Thanks for beta testing the demo. Please leave feedback on how to improve the game. Links in the About section.";
  epilogueScroll.phase = "epilogue";
  epilogueScroll.scrollY = 0;
  epilogueScroll.delayTimer = 0;
  epilogueScroll.contentHeight = 0;
  epilogueScroll.showButton = false;
  epilogueScroll.paused = false;
  epilogueActive = true;
  pauseAllMusic();
  startEpilogueMusic();
}

function activateEpilogue() {
  const ministryOptions = [
    "rehab clinics",
    "food pantries",
    "tutoring and school boards",
    "city council involvement",
    "elder care",
    "recovery housing",
    "community mediation",
  ];
  for (let i = ministryOptions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = ministryOptions[i];
    ministryOptions[i] = ministryOptions[j];
    ministryOptions[j] = tmp;
  }
  const pickedMinistries = ministryOptions.slice(0, 3);
  const ministrySentence = `${pickedMinistries[0]}, ${pickedMinistries[1]}, and ${pickedMinistries[2]}.`;
  epilogueTitle = "Epilogue";
  epilogueBackgroundKey = "epilogue";
  epilogueText =
    "Because of your hard work, the members of your church made a difference in the town.\n\n" +
    "In the years that followed, your church members went in the community and ministered in " +
    `${ministrySentence}\n\n` +
    "The town is thriving and has become a place of light and hope for all its residents and families.\n\n" +
    "Thank you for your faithful service.\n\n\n\n" +
    "Other towns need a pastor like you...";
  // Reset scroll state for epilogue/credits sequence
  epilogueScroll.phase = "epilogue";
  epilogueScroll.scrollY = 0;
  epilogueScroll.delayTimer = 0;
  epilogueScroll.contentHeight = 0;
  epilogueScroll.showButton = false;
  epilogueScroll.paused = false;
  epilogueActive = true;
  pauseAllMusic();
  startEpilogueMusic();
}

// (moved to audio.js)

function getPlayerChargeVisualAnchor(targetPlayer = player) {
  if (!targetPlayer) return null;
  const hitboxRect = getPlayerHitboxRect(targetPlayer);
  if (hitboxRect) {
    return {
      x: hitboxRect.x + hitboxRect.width * 0.5,
      y: hitboxRect.y - DIVINE_CHARGE_SPARK_OFFSET,
    };
  }
  return {
    x: targetPlayer.x,
    y: targetPlayer.y - (targetPlayer.radius || 24) - DIVINE_CHARGE_SPARK_OFFSET,
  };
}

function spawnDivineChargeSparkVisual() {
  if (!player) return null;
  const frames = assets?.effects?.divineChargeSpark;
  if (!Array.isArray(frames) || !frames.length) return null;
  if (divineChargeSparkEffect && !divineChargeSparkEffect.dead) return divineChargeSparkEffect;
  const anchor = getPlayerChargeVisualAnchor(player);
  if (!anchor) return null;
  divineChargeSparkEffect = Effects.spawnLoopingEffect(frames, anchor.x, anchor.y, {
    frameDuration: DIVINE_CHARGE_SPARK_FRAME_DURATION,
    scale: DIVINE_CHARGE_SPARK_SCALE,
  });
  return divineChargeSparkEffect;
}

function getDivineChargeFlashFrames() {
  if (Array.isArray(divineChargeFlashFrames) && divineChargeFlashFrames.length) {
    return divineChargeFlashFrames;
  }
  divineChargeFlashFrames = [];
  for (let i = 1; i <= 14; i += 1) {
    const img = new Image();
    img.src = `assets/sprites/projectiles/flash/flash${i}.png`;
    divineChargeFlashFrames.push(img);
  }
  return divineChargeFlashFrames;
}

function spawnDivineChargeReadyVisual(effectKey = "melee") {
  if (!player) return null;
  const anchor = getPlayerChargeVisualAnchor(player);
  if (!anchor) return null;
  const flashFrames = getDivineChargeFlashFrames();
  if (!Array.isArray(flashFrames) || !flashFrames.length) return null;

  if (effectKey === "prayerBomb") {
    if (!prayerBombReadyEffect || prayerBombReadyEffect.dead) {
      prayerBombReadyEffect = Effects.spawnLoopingEffect(flashFrames, anchor.x, anchor.y, {
        frameDuration: 0.03,
        scale: 2.0,
      });
    }
    prayerBombReadyEffect.x = anchor.x;
    prayerBombReadyEffect.y = anchor.y;
    return prayerBombReadyEffect;
  }

  if (divineChargeFlashEffect && !divineChargeFlashEffect.dead) {
    divineChargeFlashEffect.x = anchor.x;
    divineChargeFlashEffect.y = anchor.y;
    return divineChargeFlashEffect;
  }
  divineChargeFlashEffect = Effects.spawnLoopingEffect(flashFrames, anchor.x, anchor.y, {
    frameDuration: 0.03,
    scale: 2.0,
  });
  return divineChargeFlashEffect;
}

function updateDivineChargeSparkVisual(dt, chargeTimer, holdTime) {
  if (!player) return;

  // Create charge effect if it doesn't exist
  if (!divineChargeSparkEffect || divineChargeSparkEffect.dead) {
    const frames = assets?.effects?.divineChargeSpark;
    if (!Array.isArray(frames) || !frames.length) return;
    const anchor = getPlayerChargeVisualAnchor(player);
    if (!anchor) return;
    divineChargeSparkEffect = Effects.spawnLoopingEffect(frames, anchor.x, anchor.y, {
      frameDuration: DIVINE_CHARGE_SPARK_FRAME_DURATION,
      scale: DIVINE_CHARGE_SPARK_SCALE,
    });
  }

  // Keep charge visuals centered above the player's body instead of offsetting sideways.
  if (divineChargeSparkEffect) {
    const anchor = getPlayerChargeVisualAnchor(player);
    if (!anchor) return;
    divineChargeSparkEffect.x = anchor.x;
    divineChargeSparkEffect.y = anchor.y;

    // Scale effect based on charge progress
    const chargePercent = Math.min(1, chargeTimer / holdTime);
    divineChargeSparkEffect.scale = DIVINE_CHARGE_SPARK_SCALE * (0.5 + chargePercent * 0.5);
  }
}

function clearDivineChargeSparkVisual() {
  if (divineChargeSparkEffect) {
    divineChargeSparkEffect.dead = true;
    divineChargeSparkEffect = null;
  }
  if (divineChargeFlashEffect) {
    divineChargeFlashEffect.dead = true;
    divineChargeFlashEffect = null;
  }
}

function clearPrayerBombReadyVisual() {
  if (prayerBombReadyEffect) {
    prayerBombReadyEffect.dead = true;
    prayerBombReadyEffect = null;
  }
}
const GRACE_SPRITE_FILES = [
  "assets/sprites/items/icons/I62_Gem_L.png",
];
const visitorSession = {
  active: false,
  timer: 0,
  duration: VISITOR_SESSION_DURATION,
  visitors: [],
  blockers: [],
  savedVisitors: 0,
  quietedBlockers: 0,
  onComplete: null,
  autoTriggered: false,
  sourceLevel: 0,
  bounds: null,
  targetVisitors: VISITOR_GUEST_COUNT,
  summaryActive: false,
  newMemberPortraits: [],
  introActive: false,
  summaryReason: null,
  awaitingSummaryConfirm: false,
  usedNpcIds: new Set(),
  usedChattyLines: new Set(),
  recapShown: false,
  introShown: false,
};
const graceRushState = {
  active: false,
  timer: 0,
  duration: 0,
  elapsed: 0,
  reason: "battle",
  // Prevent accidental instant skip when Space is still being pressed
  // from prior overlays/transitions.
  skipLockDuration: 0.9,
  spawnTimer: 0,
  spawnInterval: 1,
  burstAmount: 16,
  centerX: null,
  centerY: null,
  farewellQueue: [],
  farewellNextAt: 0,
  farewellSpokenCount: 0,
};
let lastEnemyDeathPosition = null;
const GRACE_RUSH_FAREWELL_LINES = [
  "See you around church.",
  "See you Sunday.",
  "See ya soon.",
  "Let's get coffee later.",
];
const VICTORY_OPENING_LINES = [
  "This really helped me.",
  "Thanks, Pastor!",
  "I feel ready now.",
  "I can face this now.",
  "I feel stronger already.",
  "This gave me hope.",
];

function resetGraceRushNpcFarewellState({ resetAlpha = true } = {}) {
  graceRushState.farewellQueue = [];
  graceRushState.farewellNextAt = 0;
  graceRushState.farewellSpokenCount = 0;
  if (!resetAlpha) return;
  if (!Array.isArray(npcs)) return;
  npcs.forEach((npc) => {
    if (!npc) return;
    npc.graceRushNpcFadeAlpha = 1;
    npc.graceRushFarewellIndex = null;
  });
}

function prepareGraceRushNpcFarewellQueue() {
  resetGraceRushNpcFarewellState();
  if (graceRushState.reason === "boss") return;
  const activeSurvivors = Array.isArray(npcs)
    ? npcs.filter((npc) => npc && !npc.departed && npc.active)
    : [];
  if (!activeSurvivors.length) return;
  const speakerCount = activeSurvivors.length;
  const shuffled = [...activeSurvivors].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, speakerCount);
  graceRushState.farewellQueue = picked.map((npc, index) => {
    npc.graceRushFarewellIndex = index;
    return { npc, line: null };
  });
  graceRushState.farewellNextAt = 0.35;
  graceRushState.farewellSpokenCount = 0;
}
visitorSession.activeChatty = new Set();
visitorSession.lockingBlockers = new Set();
visitorSession.movementLock = false;

// Track per-season congregation changes (4-month blocks)
const seasonStats = {
  seasonNumber: 1,
  monthlyAdded: 0, // sum of member deltas from monthly recaps
  lost: 0, // total NPCs lost across the season
  bossBonus: 0, // bonus from boss win
  bossBonusApplied: false,
  recapShown: false,
  startCongregation: null,
  visitorAdded: 0,
};

function isPlayerMovementLocked() {
  const meleeState = window?._meleeAttackState;
  const spinActive = Boolean(meleeState?.spinTimer > 0);
  const swingActive = Boolean(meleeState?.swooshTimer > 0);
  const rushActive = Boolean(meleeState?.isRushing);
  const ringFireActive = Boolean(meleeState?.ringFireActive);
  if (rushActive) return false;
  return Boolean((visitorSession.active && visitorSession.movementLock) || spinActive || swingActive || ringFireActive);
}

if (typeof window !== "undefined") {
  window.Battlechurch = window.Battlechurch || {};
  window.BattlechurchComboTrackerEnabled = true;
  window.BattlechurchComboTrackerAllow = false;
  window.Battlechurch.isPlayerMovementLocked = isPlayerMovementLocked;
  window.selectFormation = selectFormation;
  window.clearFormationSelection = clearFormationSelection;
  window.getFormationBonuses = getFormationBonuses;
  window.applyFormationAnchors = applyFormationAnchors;
  window.setCozyNpcsToFrontlineFormation = setCozyNpcsToFrontlineFormation;
  window.Battlechurch.isBossStageActive = () => {
    try {
      if (levelManager?.getStatus) {
        const stage = levelManager.getStatus().stage;
        return stage === "bossIntro" || stage === "bossActive";
      }
    } catch (e) {}
    return false;
  };
}
const DEFAULT_HERO_LIVES = 1;
// Runtime dev session — activated via Shift+Cmd+D on any build.
let devSessionActive = IS_DEV;
if (typeof window !== "undefined") window.devSessionActive = devSessionActive;

const DEV_OVERRIDE_HERO_LIVES = 3;
const DEV_THREE_LIVES_STORAGE_KEY = "battlechurch.devThreeLivesMode";
function loadDevThreeLivesMode() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(DEV_THREE_LIVES_STORAGE_KEY) === "1";
  } catch (_error) {
    return false;
  }
}
function persistDevThreeLivesMode(enabled) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(DEV_THREE_LIVES_STORAGE_KEY, enabled ? "1" : "0");
  } catch (_error) {}
}

let enemyDevLabelsVisible = false;
const devTools = {
  godMode: false,
  showCombatDebug: false,
  showNpcZones: false,
  showSpawnDebug: false,
  ambientSmokeEnabled: false,
  floorPickerOverlay: false,
  disableCameraScroll: true,
  threeLivesMode: loadDevThreeLivesMode(),
  enemyHpBarThreshold: 100,
  // Adjustable runtime tuning for NPC combat behaviour
  npcFireCooldown: 0.6, // seconds between NPC arrow shots when at full faith
  npcFaithPerEnemy: 0, // faith gained by NPCs per enemy defeated
};
if (typeof window !== "undefined") {
  window.__battlechurchFloorPickerOverlayEnabled = Boolean(devTools.floorPickerOverlay);
}
function getConfiguredHeroLives() {
  return devTools.threeLivesMode ? DEV_OVERRIDE_HERO_LIVES : DEFAULT_HERO_LIVES;
}
let heroLives = getConfiguredHeroLives();

function clearFormationSelection() {
  formationState.current = null;
  formationState.bonuses = {
    rof: 0,
    damage: 0,
    powerupDuration: 0,
    prayerChargeGain: 0,
    armorPierce: false,
    projectileType: null,
  };
  formationState.homePressure = 0;
  formationState.combatSpreadScaleCurrent = formationState.combatSpreadScale || 1.18;
}

function selectFormation(key) {
  const preset = FORMATION_PRESETS[key];
  if (!preset) return null;
  formationState.current = key;
  formationState.bonuses = { ...preset.bonuses };
  formationState.homePressure = 0;
  formationState.combatSpreadScaleCurrent = formationState.combatSpreadScale || 1.18;
  return preset;
}

function getFormationBonuses() {
  return formationState?.bonuses || {
    rof: 0,
    damage: 0,
    powerupDuration: 0,
    prayerChargeGain: 0,
    armorPierce: false,
    projectileType: null,
  };
}

function resolveNpcWeaponPowerup(effect, def = {}) {
  const base = resolveWeaponPowerupConfig(effect, def);
  // NPC versions: weaker damage, keep duration and cooldown/speed multipliers
  let baseFactor = 0.2;
  if (effect === "npcWisdomWeapon") baseFactor = 0.3;
  if (effect === "npcFaithWeapon") baseFactor = 0.24; // +20% over 0.2
  return {
    ...base,
    damageMultiplier: (base.damageMultiplier ?? 1) * baseFactor,
  };
}

function applyNpcWeaponPowerup(effect, def = {}) {
  const cfg = resolveNpcWeaponPowerup(effect, def);
  const formation = getFormationBonuses();
  const durationScale = 1 + (formation.powerupDuration || 0);
  const scaledDuration = (cfg.duration || 0) * durationScale;
  const mapping = {
    npcScriptureWeapon: "fire",
    npcWisdomWeapon: "wisdom_missle",
    npcFaithWeapon: "faith_cannon",
  };
  const rofKeyMapping = {
    npcScriptureWeapon: "npc.npcScriptureRofMultiplier",
    npcWisdomWeapon:    "npc.npcWisdomRofMultiplier",
    npcFaithWeapon:     "npc.npcFaithRofMultiplier",
  };
  const dmgKeyMapping = {
    npcScriptureWeapon: "npc.npcScriptureDamageMultiplier",
    npcWisdomWeapon:    "npc.npcWisdomDamageMultiplier",
    npcFaithWeapon:     "npc.npcFaithDamageMultiplier",
  };
  const mode = mapping[effect] || null;
  if (!mode) return;
  npcWeaponState.mode = mode;
  npcWeaponState.timer = scaledDuration || 0;
  npcWeaponState.duration = scaledDuration || 0;
  npcWeaponState.damageMultiplier = (cfg.damageMultiplier ?? 1) * getActiveClassMultiplier(dmgKeyMapping[effect] || "", 1);
  npcWeaponState.cooldownMultiplier = (cfg.cooldownMultiplier ?? 1) / Math.max(0.05, getActiveClassMultiplier(rofKeyMapping[effect] || "", 1));
  npcWeaponState.speedMultiplier = cfg.speedMultiplier ?? 1;
}

function computeFormationAnchors(count) {
  const anchors = [];
  const home = getNpcHomeBounds();
  if (!home) return anchors;
  const cx = home.x;
  const cy = home.y;
  const rx = (home.maxX - home.minX) / 2;
  const ry = (home.maxY - home.minY) / 2;
  const spreadScale = Math.max(
    0.5,
    Math.min(
      1.35,
      Number.isFinite(formationState?.combatSpreadScaleCurrent)
        ? formationState.combatSpreadScaleCurrent
        : (formationState?.combatSpreadScale || 1),
    ),
  );
  const presetKey = formationState.current || "circle";
  switch (presetKey) {
    case "line": {
      const radius = Math.min(rx, ry) * 0.82 * spreadScale;
      const start = (210 * Math.PI) / 180;
      const end = (-30 * Math.PI) / 180;
      const zoneStep = count > 1 ? (end - start) / (count - 1) : 0;
      for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const angle = start + (end - start) * t;
        anchors.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          angle,
          zoneHalfSpan: Math.abs(zoneStep) * 0.5,
          zoneIndex: i,
          zoneCount: count,
        });
      }
      break;
    }
    case "crescent": {
      const radius = Math.min(rx, ry) * 0.78 * spreadScale;
      // Smile: arc that faces left/right/bottom; use angles from 210° to -30°
      const start = (210 * Math.PI) / 180;
      const end = (-30 * Math.PI) / 180;
      const zoneStep = count > 1 ? (end - start) / (count - 1) : 0;
      for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const angle = start + (end - start) * t;
        anchors.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          angle,
          zoneHalfSpan: Math.abs(zoneStep) * 0.5,
          zoneIndex: i,
          zoneCount: count,
        });
      }
      break;
    }
    case "circle":
    default: {
      const radius = Math.min(rx, ry) * 0.82 * spreadScale;
      const start = (210 * Math.PI) / 180;
      const end = (-30 * Math.PI) / 180;
      const zoneStep = count > 1 ? (end - start) / (count - 1) : 0;
      for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const angle = start + (end - start) * t;
        anchors.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          angle,
          zoneHalfSpan: Math.abs(zoneStep) * 0.5,
          zoneIndex: i,
          zoneCount: count,
        });
      }
      break;
    }
  }
  formationState.anchors = anchors;
  return anchors;
}

function getNpcZoneWanderPoint(npc, { inwardBias = 0, angleJitterScale = 0.42, edgeBias = 0 } = {}) {
  const home = getNpcHomeBounds();
  const anchor = npc?.formationAnchor || null;
  if (!home || !anchor) {
    return {
      x: home?.x || npc?.x || 0,
      y: home?.y || npc?.y || 0,
    };
  }
  const baseAngle = Number.isFinite(anchor.angle)
    ? anchor.angle
    : Math.atan2(anchor.y - home.y, anchor.x - home.x);
  const halfSpan = Number.isFinite(anchor.zoneHalfSpan) ? anchor.zoneHalfSpan : 0.35;
  const angle = baseAngle + randomInRange(-halfSpan, halfSpan) * angleJitterScale;
  const anchorRadius = Math.hypot(anchor.x - home.x, anchor.y - home.y);
  const radiusMin = Math.max(28, anchorRadius * Math.max(0.32, 0.72 - inwardBias * 0.35));
  const radiusMax = Math.max(radiusMin + 8, anchorRadius * Math.max(0.48, 1.02 - inwardBias * 0.2));
  const edgeBlend = Math.max(0, Math.min(1, edgeBias));
  const blendedRadiusMin = mixLinear(radiusMin, radiusMax, edgeBlend * 0.82);
  const radius = randomInRange(blendedRadiusMin, radiusMax);
  return clampPointToBounds(
    home,
    home.x + Math.cos(angle) * radius,
    home.y + Math.sin(angle) * radius,
  );
}

function getNpcZoneReadyPoint(npc) {
  const pressure = Math.max(0, Math.min(1, formationState?.homePressure || 0));
  const home = getNpcHomeBounds();
  const anchor = npc?.formationAnchor || null;
  if (!home || !anchor) {
    return getNpcZoneWanderPoint(npc, {
      inwardBias: pressure * 0.08,
      angleJitterScale: 0.34,
      edgeBias: 1,
    });
  }
  const baseAngle = Number.isFinite(anchor.angle)
    ? anchor.angle
    : Math.atan2(anchor.y - home.y, anchor.x - home.x);
  const halfSpan = Number.isFinite(anchor.zoneHalfSpan) ? anchor.zoneHalfSpan : 0.35;
  if (!Number.isFinite(npc.zonePatrolDirection) || npc.zonePatrolDirection === 0) {
    npc.zonePatrolDirection = Math.random() < 0.5 ? -1 : 1;
  } else {
    npc.zonePatrolDirection *= -1;
  }
  const currentAngle = Math.atan2((npc?.y || anchor.y) - home.y, (npc?.x || anchor.x) - home.x);
  let patrolOffset = halfSpan * randomInRange(0.6, 0.95) * npc.zonePatrolDirection;
  let angle = baseAngle + patrolOffset;
  if (Math.abs(angle - currentAngle) < halfSpan * 0.45) {
    patrolOffset = halfSpan * 0.95 * npc.zonePatrolDirection;
    angle = baseAngle + patrolOffset;
  }
  const anchorRadius = Math.hypot(anchor.x - home.x, anchor.y - home.y);
  const radius = anchorRadius * (0.97 - pressure * 0.06);
  let point = clampPointToBounds(
    home,
    home.x + Math.cos(angle) * radius,
    home.y + Math.sin(angle) * radius,
  );
  const minTravel = Math.max(18, anchorRadius * 0.12);
  const travel = Math.hypot(point.x - (npc?.x || point.x), point.y - (npc?.y || point.y));
  if (travel < minTravel) {
    const fallbackAngle = baseAngle - patrolOffset;
    point = clampPointToBounds(
      home,
      home.x + Math.cos(fallbackAngle) * radius,
      home.y + Math.sin(fallbackAngle) * radius,
    );
  }
  return point;
}

function getNpcDistinctReadyPoint(npc, minTravel = 28) {
  if (!npc) return null;
  let bestPoint = null;
  let bestDistance = -Infinity;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const point = getNpcZoneReadyPoint(npc);
    if (!point) continue;
    const distance = Math.hypot(point.x - (npc.x || point.x), point.y - (npc.y || point.y));
    if (distance >= minTravel) {
      return point;
    }
    if (distance > bestDistance) {
      bestDistance = distance;
      bestPoint = point;
    }
  }
  return bestPoint || getNpcZoneReadyPoint(npc);
}

function getNpcZonePatrolPoint(npc, side = 1) {
  const home = getNpcHomeBounds();
  const anchor = npc?.formationAnchor || null;
  if (!home || !anchor) return getNpcZoneReadyPoint(npc);
  const baseAngle = Number.isFinite(anchor.angle)
    ? anchor.angle
    : Math.atan2(anchor.y - home.y, anchor.x - home.x);
  const halfSpan = Number.isFinite(anchor.zoneHalfSpan) ? anchor.zoneHalfSpan : 0.35;
  const patrolSide = side >= 0 ? 1 : -1;
  const angle = baseAngle + halfSpan * 0.72 * patrolSide;
  const anchorRadius = Math.hypot(anchor.x - home.x, anchor.y - home.y);
  const radius = anchorRadius * 0.985;
  return clampPointToBounds(
    home,
    home.x + Math.cos(angle) * radius,
    home.y + Math.sin(angle) * radius,
  );
}

function getNpcFrontlineDesiredPoint(npc) {
  const home = getNpcHomeBounds();
  const anchor = npc?.formationAnchor || null;
  if (!home || !anchor) return getNpcZonePatrolPoint(npc, npc?.zonePatrolSide || 1);
  const pressure = Math.max(0, Math.min(1, formationState?.homePressure || 0));
  const baseAngle = Number.isFinite(anchor.angle)
    ? anchor.angle
    : Math.atan2(anchor.y - home.y, anchor.x - home.x);
  const halfSpan = Number.isFinite(anchor.zoneHalfSpan) ? anchor.zoneHalfSpan : 0.35;
  const anchorRadius = Math.hypot(anchor.x - home.x, anchor.y - home.y);
  const patrolClock = Number.isFinite(npc?.patrolClock) ? npc.patrolClock : 0;
  const laneSwing = Math.sin(patrolClock) * halfSpan * 0.74;
  const angle = baseAngle + laneSwing;
  const radialPulse = Math.cos(patrolClock * 0.55 + (anchor.zoneIndex || 0) * 0.45) * 0.018;
  const radius = anchorRadius * Math.max(0.82, 0.975 - pressure * 0.07 + radialPulse);
  return clampPointToBounds(
    home,
    home.x + Math.cos(angle) * radius,
    home.y + Math.sin(angle) * radius,
  );
}

function getNpcBriefingPoint(npc) {
  const home = getNpcHomeBounds();
  if (!home) {
    return npc?.formationAnchor
      ? { x: npc.formationAnchor.x, y: npc.formationAnchor.y }
      : { x: npc?.x || 0, y: npc?.y || 0 };
  }
  const retreatCenter = getNpcAnchorRetreatPoint(npc, home, 0.46);
  const anchor = npc?.formationAnchor || null;
  const baseAngle = Number.isFinite(anchor?.angle)
    ? anchor.angle
    : Math.atan2(retreatCenter.y - home.y, retreatCenter.x - home.x);
  const orbit = Number.isFinite(npc?.patrolClock) ? npc.patrolClock : 0;
  const angle = baseAngle + Math.sin(orbit * 0.8) * 0.12;
  const radius = Math.max(8, home.radius * 0.045);
  return clampPointToBounds(
    home,
    retreatCenter.x + Math.cos(angle) * radius,
    retreatCenter.y + Math.sin(angle) * radius,
  );
}

function assignNpcFrontlinePatrolTarget(npc, { forceFlip = false } = {}) {
  if (!npc) return null;
  if (!Number.isFinite(npc.zonePatrolSide) || npc.zonePatrolSide === 0) {
    npc.zonePatrolSide = Math.random() < 0.5 ? -1 : 1;
  } else if (forceFlip) {
    npc.zonePatrolSide *= -1;
  }
  if (forceFlip) {
    npc.patrolClock = (npc.patrolClock || 0) + Math.PI * 0.75;
  }
  const target = getNpcFrontlineDesiredPoint(npc);
  npc.target = target;
  npc.zoneMoveMode = "frontline";
  npc.frontlinePatrolTimer = randomInRange(0.8, 1.4);
  return target;
}

function setCozyNpcsToBriefingFormation() {
  if (!Array.isArray(npcs) || !npcs.length) return;
  npcs.forEach((npc) => {
    if (!npc || npc.departed || !npc.active) return;
    npc.zoneMoveMode = "briefing";
    npc.safeRecoveryTimer = 0;
    npc.retreatCommitTimer = 0;
    npc.idleTimer = 0;
    npc.target = getNpcBriefingPoint(npc);
  });
}

function setCozyNpcsToFrontlineFormation() {
  if (!Array.isArray(npcs) || !npcs.length) return;
  npcs.forEach((npc) => {
    if (!npc || npc.departed || !npc.active) return;
    npc.zoneMoveMode = "frontline";
    npc.safeRecoveryTimer = 1;
    npc.retreatCommitTimer = 0;
    npc.idleTimer = 0;
    npc.target = getNpcFrontlineDesiredPoint(npc);
  });
}

function resetFormationSwaps() {
  if (formationState?.swappedThisBattle) {
    formationState.swappedThisBattle.clear();
  }
  if (formationState) {
    formationState.swapCooldown = 0;
  }
}

function rotateNpcPositionsForActBreak() {
  if (!npcs || !npcs.length) return;
  resetFormationSwaps();
  const swaps = Math.min(3, Math.floor(npcs.length / 2));
  for (let i = 0; i < swaps; i += 1) {
    maybeSwapNpcPositions({ force: true });
  }
}

function maybeSwapNpcPositions(options = {}) {
  // Only run during active battles; skip if no formation selected.
  if (!npcs || !npcs.length) return;
  const status =
    typeof levelManager?.getStatus === "function" ? levelManager.getStatus() : null;
  const activeStages = new Set(["waveActive", "bossActive", "graceRush"]);
  const forceSwap = Boolean(options.force);
  if (!forceSwap) {
    if ((formationState?.swapCooldown || 0) > 0) return;
  }
  if (!forceSwap && (!status || !activeStages.has(status.stage))) return;
  if (!formationState?.current) return;
  // Candidates: active NPCs not departed/drained
  const active = npcs.filter(
    (npc) => npc && npc.active && !npc.departed && npc.state !== "drained",
  );
  if (active.length < 2) return;
  // Find lowest and highest faith to rotate who is taking damage.
  let low = null;
  let high = null;
  for (const npc of active) {
    if (!low || npc.faith < low.faith) low = npc;
    if (!high || npc.faith > high.faith) high = npc;
  }
  if (!low) return;
  if (!high || high === low) return;
  if (!forceSwap && high.faith - low.faith < 1) return;
  // Swap anchors and set new targets so they walk to swapped spots
  const lowAnchor = low.formationAnchor ? { ...low.formationAnchor } : null;
  const hiAnchor = high.formationAnchor ? { ...high.formationAnchor } : null;
  if (!lowAnchor || !hiAnchor) return;
  low.formationAnchor = hiAnchor;
  high.formationAnchor = lowAnchor;
  low.zoneMoveMode = "frontline";
  high.zoneMoveMode = "frontline";
  low.idleTimer = 0;
  high.idleTimer = 0;
  low.safeRecoveryTimer = 1;
  high.safeRecoveryTimer = 1;
  assignNpcFrontlinePatrolTarget(low, { forceFlip: true });
  assignNpcFrontlinePatrolTarget(high, { forceFlip: true });
  if (!forceSwap && formationState) {
    formationState.swapCooldown = 6;
  }
}
// Enemy spawning constants (tunable via GameBalance.spawning.*)
const MAX_ACTIVE_ENEMIES = _gb('spawning.maxActiveEnemies', 1000);
const SKELETON_MIN_COUNT = _gb('spawning.skeletonMinCount', 4);
const SKELETON_PACK_SIZE = _gb('spawning.skeletonPackSize', 4);
const MINI_IMP_BASE_GROUP_SIZE = _gb('spawning.miniImpBaseGroupSize', 48);
const MINI_IMP_MAX_GROUP_SIZE = _gb('spawning.miniImpMaxGroupSize', 120);
const MINI_IMP_MIN_GROUPS_PER_HORDE = _gb('spawning.miniImpMinGroupsPerHorde', 1);
const ENEMY_GROUP_SPAWN_STAGGER_MS = 20; // test override: spawn grouped enemies immediately
const RESPAWN_DELAY = _gb('player.respawnDelay', 2.5);
const RESPAWN_STATUS_INTERVAL = _gb('player.respawnStatusInterval', 0.5);
const RESPAWN_SHIELD_DURATION = _gb('player.respawnShieldDuration', 6);
let playerRespawnPending = false;
let respawnTimer = 0;
let respawnIndicatorTimer = 0;
// track auto-spawn of MiniFolks for level 1 so only one appears automatically
let lastLevelNumber = null;
// track whether one automatic enemy has spawned on level 1

function getNpcHomeBounds() {
  const centerX = canvas.width / 2;
  const playableHeight = canvas.height - HUD_HEIGHT;
  const centerY = HUD_HEIGHT + playableHeight * (1 / 3);
  const radius = Math.max(180, Math.min(centerX * 0.72, playableHeight * 0.31));
  const minX = Math.max(0, centerX - radius);
  const maxX = Math.min(canvas.width, centerX + radius);
  const minY = Math.max(HUD_HEIGHT, centerY - radius);
  const maxY = Math.min(canvas.height, centerY + radius);
  return { x: centerX, y: centerY, radius, minX, maxX, minY, maxY };
}

function computeNpcHomeThreatPressure() {
  const home = getNpcHomeBounds();
  if (!home) return 0;
  const threatRadius = home.radius + 220;
  let pressure = 0;
  for (const enemy of enemies) {
    if (!enemy || enemy.dead || enemy.state === "death") continue;
    const center = getEnemyHitboxCenter(enemy);
    const dx = center.x - home.x;
    const dy = center.y - home.y;
    const distance = Math.hypot(dx, dy);
    if (distance > threatRadius) continue;
    const closeness = 1 - distance / Math.max(1, threatRadius);
    const weight =
      enemy.damageClass === "armored" ? 1.35 :
      enemy.damageClass === "tank" ? 1.2 :
      enemy.isBoss ? 2 : 1;
    pressure += closeness * weight;
  }
  return Math.max(0, Math.min(1, pressure / 4.75));
}

function mixLinear(a, b, t) {
  return a + (b - a) * t;
}

function updateNpcFormationPressure(dt) {
  if (!formationState?.current || !npcs.length) return;
  const home = getNpcHomeBounds();
  if (!home) return;
  const targetPressure = computeNpcHomeThreatPressure();
  const currentPressure = Number.isFinite(formationState.homePressure)
    ? formationState.homePressure
    : 0;
  const nextPressure = mixLinear(currentPressure, targetPressure, Math.min(1, dt * 2.2));
  formationState.homePressure = nextPressure;
  const safeSpread = Number.isFinite(formationState.combatSpreadScale)
    ? formationState.combatSpreadScale
    : 1.18;
  const threatenedSpread = 0.58;
  const targetSpread = mixLinear(safeSpread, threatenedSpread, nextPressure);
  const currentSpread = Number.isFinite(formationState.combatSpreadScaleCurrent)
    ? formationState.combatSpreadScaleCurrent
    : safeSpread;
  formationState.combatSpreadScaleCurrent = mixLinear(
    currentSpread,
    targetSpread,
    Math.min(1, dt * 2.8),
  );
  const anchors = computeFormationAnchors(npcs.length);
  if (!anchors.length) return;
  const retargetThreshold = 24;
  npcs.forEach((npc, idx) => {
    const anchor = anchors[idx % anchors.length];
    if (!npc || !anchor) return;
    const prevAnchor = npc.formationAnchor || anchor;
    npc.formationAnchor = {
      x: mixLinear(prevAnchor.x, anchor.x, Math.min(1, dt * 3.5)),
      y: mixLinear(prevAnchor.y, anchor.y, Math.min(1, dt * 3.5)),
      angle: Number.isFinite(anchor.angle) ? anchor.angle : prevAnchor.angle,
      zoneHalfSpan: Number.isFinite(anchor.zoneHalfSpan) ? anchor.zoneHalfSpan : prevAnchor.zoneHalfSpan,
      zoneIndex: Number.isFinite(anchor.zoneIndex) ? anchor.zoneIndex : prevAnchor.zoneIndex,
      zoneCount: Number.isFinite(anchor.zoneCount) ? anchor.zoneCount : prevAnchor.zoneCount,
    };
    if (!npc.target) {
      assignNpcFrontlinePatrolTarget(npc);
      return;
    }
    const targetDx = npc.target.x - npc.formationAnchor.x;
    const targetDy = npc.target.y - npc.formationAnchor.y;
    const anchorShift = Math.hypot(anchor.x - prevAnchor.x, anchor.y - prevAnchor.y);
    const targetDistanceFromAnchor = Math.hypot(targetDx, targetDy);
    if (anchorShift > retargetThreshold || targetDistanceFromAnchor > home.radius * 0.7) {
      assignNpcFrontlinePatrolTarget(npc);
    }
  });
}

function getNpcAnchorRetreatPoint(npc, home, ratio = 0.42) {
  const anchor = npc?.formationAnchor || null;
  if (!anchor || !home) return { x: home.x, y: home.y };
  return {
    x: mixLinear(anchor.x, home.x, ratio),
    y: mixLinear(anchor.y, home.y, ratio),
  };
}

function getNpcThreatAvoidanceTarget(npc) {
  if (!npc || npc.departed || npc.state === "lostFaith" || npc.state === "departed") return null;
  const home = getNpcHomeBounds();
  if (!home) return null;
  let bestEnemy = null;
  let bestDistance = Infinity;
  for (const enemy of enemies) {
    if (!enemy || enemy.dead || enemy.state === "death") continue;
    const center = getEnemyHitboxCenter(enemy);
    const safeDistance =
      getEnemyHitboxRadius(enemy) +
      (npc.radius || NPC_RADIUS) +
      84;
    const dx = npc.x - center.x;
    const dy = npc.y - center.y;
    const distance = Math.hypot(dx, dy);
    if (distance > safeDistance || distance >= bestDistance) continue;
    bestDistance = distance;
    bestEnemy = { enemy, center, dx, dy, distance, safeDistance };
  }
  if (!bestEnemy) return null;
  const away = normalizeVector(bestEnemy.dx, bestEnemy.dy);
  const retreatCenter = getNpcAnchorRetreatPoint(npc, home, 0.46);
  const centerDir = normalizeVector(retreatCenter.x - npc.x, retreatCenter.y - npc.y);
  const retreatDir = normalizeVector(
    away.x * 0.35 + centerDir.x * 1.15,
    away.y * 0.35 + centerDir.y * 1.15,
  );
  const retreatDistance = Math.max(54, home.radius * 0.22);
  const targetX = npc.x + retreatDir.x * retreatDistance;
  const targetY = npc.y + retreatDir.y * retreatDistance;
  return clampPointToBounds(home, targetX, targetY);
}

function npcTargetNeedsUpdate(npc, target, minDelta = 18) {
  if (!npc || !target) return false;
  if (!npc.target) return true;
  const targetShift = Math.hypot((npc.target.x || 0) - target.x, (npc.target.y || 0) - target.y);
  if (targetShift >= minDelta) return true;
  const currentGap = Math.hypot((npc.x || 0) - target.x, (npc.y || 0) - target.y);
  return currentGap >= minDelta;
}

function pushPointOutsideNpcHome(x, y, padding = 28) {
  const homeBounds = getNpcHomeBounds();
  if (!homeBounds) return { x, y };
  const dx = x - homeBounds.x;
  const dy = y - homeBounds.y;
  if (Math.hypot(dx, dy) > homeBounds.radius) return { x, y };
  const angle = Math.atan2(dy, dx) || 0;
  const pushDist = homeBounds.radius + padding;
  return {
    x: homeBounds.x + Math.cos(angle) * pushDist,
    y: homeBounds.y + Math.sin(angle) * pushDist,
  };
}

function getActiveUtilityPowerUpCount() {
  return utilityPowerUps.filter((p) => p && !p.collected && !p.dead).length;
}

function canSpawnUtilityPowerUp() {
  return getActiveUtilityPowerUpCount() < 1 && powerUpRespawnTimer <= 0;
}

function getActiveChurchPowerupCount() {
  return churchPowerupPickups.filter((p) => p && !p.collected && !p.dead).length;
}

function canSpawnChurchPowerup() {
  const stageName = typeof levelManager?.getStatus === "function" ? levelManager.getStatus()?.stage : "";
  const isBossStage = stageName === "bossIntro" || stageName === "bossActive";
  if (isBossStage) return false;
  return getActiveChurchPowerupCount() < 1 && powerUpRespawnTimer <= 0;
}

function getActiveWeaponPowerUpCount() {
  return weaponPickups.filter((pickup) => pickup && pickup.effect && isWeaponPowerEffect(pickup.effect)).length;
}

function canSpawnWeaponPowerUp() {
  return getActiveWeaponPowerUpCount() < 1 && powerUpRespawnTimer <= 0;
}

function triggerPowerUpCooldown() {
  powerUpRespawnTimer = POWERUP_REFILL_DELAY;
}

function clearAllPowerUps() {
  weaponPickups.forEach((pickup) => {
    if (!pickup) return;
    pickup.active = false;
    pickup.expired = true;
    pickup.visible = false;
    pickup.life = 0;
  });
  weaponPickups.splice(0, weaponPickups.length);
  churchPowerupPickups.forEach((pickup) => {
    if (!pickup) return;
    pickup.active = false;
    pickup.expired = true;
    pickup.visible = false;
    pickup.life = 0;
  });
  churchPowerupPickups.splice(0, churchPowerupPickups.length);
  pastorPowerupPickups.splice(0, pastorPowerupPickups.length);
  pastorPowerupSpawnTimer = 0;
  utilityPowerUps.forEach((powerUp) => {
    if (!powerUp) return;
    powerUp.active = false;
    powerUp.expired = true;
    powerUp.visible = false;
    powerUp.life = 0;
  });
  utilityPowerUps.splice(0, utilityPowerUps.length);
  powerupHudFlyEffects.splice(0, powerupHudFlyEffects.length);
  powerUpRespawnTimer = 0;
  powerUpStaggerTimer = 0;
  churchPowerupEnsureTimer = 0;
  queuedPowerUpDrops = 0;
}

function resetChurchPowerups() {
  unlockedChurchPowerups.clear();
  churchPowerupLevels.clear();
  churchPowerupPickups.splice(0, churchPowerupPickups.length);
}

function clearGracePickups() {
  gracePickups.splice(0, gracePickups.length);
  graceHudFlyEffects.splice(0, graceHudFlyEffects.length);
}

function getGraceCount() {
  return playerGraceCount;
}

let npcHarmonyBuffTimer = 0;
let npcHarmonyBuffDuration = 0;
const HARMONY_BUFF_MULTIPLIER = 2.25;

function addGrace(amount = 1) {
  if (!Number.isFinite(amount) || amount === 0) return playerGraceCount;
  playerGraceCount = Math.max(0, Math.round(playerGraceCount + amount));
  return playerGraceCount;
}
if (typeof window !== "undefined") {
  window.getGraceCount = getGraceCount;
  window.addGrace = addGrace;
}

const CHURCH_POWERUP_MAX_LEVEL = 10;

const PASTOR_POWERUP_MAX_LEVEL = (window.GameBalance?.pastorPowerups?.maxLevel) ?? 5;

// One shared pool, fixed spawn interval regardless of level or unlocked types.
const PASTOR_PICKUP_SPAWN_INTERVAL = (window.GameBalance?.pastorPowerups?.spawnInterval) ?? 20;

// Per-level values (index 0 = level 1, index 4 = level 5). Edit in config_balance.js.
const PASTOR_PICKUP_PRAYER_BARS_BY_LEVEL  = (window.GameBalance?.pastorPowerups?.prayerBarsByLevel)   ?? [1, 1.25, 1.5, 1.75, 2];
const PASTOR_PICKUP_HP_AMOUNT_BY_LEVEL    = (window.GameBalance?.pastorPowerups?.hpAmountByLevel)     ?? [5, 6, 7, 8, 10];
const PASTOR_PICKUP_DASH_DURATION_BY_LEVEL = (window.GameBalance?.pastorPowerups?.dashDurationByLevel) ?? [20, 22, 24, 27, 30];
const PASTOR_PICKUP_DASH_REDUCTION        = (window.GameBalance?.pastorPowerups?.dashCooldownMultiplier) ?? 0.5;

function getPastorPickupValue(byLevelArray, level) {
  const idx = Math.max(0, Math.min(byLevelArray.length - 1, level - 1));
  return byLevelArray[idx];
}

const PASTOR_POWERUP_DEFS = {
  prayer: {
    key: "prayer",
    label: "Fervent Prayer",
    get description() {
      const byLevel = window.GameBalance?.pastorPowerups?.prayerBarsByLevel ?? PASTOR_PICKUP_PRAYER_BARS_BY_LEVEL;
      const level = getPastorPowerupLevel("prayer");
      const bars = getPastorPickupValue(byLevel, Math.max(1, level));
      const barsText = bars === 6 ? "your entire Prayer Meter" : `${bars} bar${bars !== 1 ? "s" : ""} of your Prayer Meter`;
      return `+${bars} Prayer Meter`;
    },
    iconSrc: "assets/sprites/items/icons/Fire.png",
  },
  hp: {
    key: "hp",
    label: "Endurance",
    get description() {
      const byLevel = window.GameBalance?.pastorPowerups?.hpAmountByLevel ?? PASTOR_PICKUP_HP_AMOUNT_BY_LEVEL;
      const level = getPastorPowerupLevel("hp");
      const hp = getPastorPickupValue(byLevel, Math.max(1, level));
      return `+${hp} HP`;
    },
    iconSrc: "assets/sprites/items/icons/Heart.png",
  },
  dash: {
    key: "dash",
    label: "Stamina",
    get description() {
      const byLevel = window.GameBalance?.pastorPowerups?.dashDurationByLevel ?? PASTOR_PICKUP_DASH_DURATION_BY_LEVEL;
      const mult = window.GameBalance?.pastorPowerups?.dashCooldownMultiplier ?? PASTOR_PICKUP_DASH_REDUCTION;
      const level = getPastorPowerupLevel("dash");
      const dur = getPastorPickupValue(byLevel, Math.max(1, level));
      const pct = Math.round((1 - mult) * 100);
      return `Faster dash recovery by ${pct}% for ${dur}s`;
    },
    iconSrc: "assets/sprites/items/Armour/A38_Iron_Boots.png",
  },
};
const pastorPowerupLevels = new Map([["prayer", 0], ["hp", 0], ["dash", 0]]);
let pendingPastorUpgradeScreen = false;

function getPastorPowerupLevel(key) {
  return Math.max(0, Math.min(PASTOR_POWERUP_MAX_LEVEL, pastorPowerupLevels.get(key) || 0));
}

function setPastorPowerupLevel(key, level) {
  if (!PASTOR_POWERUP_DEFS[key]) return;
  pastorPowerupLevels.set(key, Math.max(0, Math.min(PASTOR_POWERUP_MAX_LEVEL, Math.round(level))));
  if (typeof window !== "undefined") window.pastorPowerupLevels = pastorPowerupLevels;
}

function applyPastorPowerupPickup(type) {
  if (!player) return;
  const level = Math.max(1, getPastorPowerupLevel(type));
  let speechText = null;
  if (type === "prayer") {
    const byLevel = window.GameBalance?.pastorPowerups?.prayerBarsByLevel ?? PASTOR_PICKUP_PRAYER_BARS_BY_LEVEL;
    const bars = getPastorPickupValue(byLevel, level);
    const required = Math.max(1, player.prayerChargeRequired || PRAYER_BOMB_CHARGE_REQUIRED || 60000);
    player.prayerCharge = Math.min(required, (player.prayerCharge || 0) + (bars / 6) * required);
    speechText = `Prayer +${bars} Bar${bars !== 1 ? "s" : ""}`;
  } else if (type === "hp") {
    const byLevel = window.GameBalance?.pastorPowerups?.hpAmountByLevel ?? PASTOR_PICKUP_HP_AMOUNT_BY_LEVEL;
    const hp = getPastorPickupValue(byLevel, level);
    player.health = (player.health || 0) + hp;
    speechText = `HP +${hp}`;
  } else if (type === "dash") {
    const byLevel = window.GameBalance?.pastorPowerups?.dashDurationByLevel ?? PASTOR_PICKUP_DASH_DURATION_BY_LEVEL;
    const duration = getPastorPickupValue(byLevel, level);
    pastorDashBuffTimer = duration;
    if (typeof window !== "undefined") window.pastorDashBuffTimer = pastorDashBuffTimer;
    speechText = `Stamina Boost ${Math.round(duration)}s`;
  }
  if (speechText) heroSay(speechText, { life: 2.2 });
  const pastorDef = PASTOR_POWERUP_DEFS[type];
  if (pastorDef) {
    setWeaponPickupAnnouncement({
      title: pastorDef.label || speechText || "Power Up",
      description: pastorDef.description || "",
      color: UI_COLOR.teal,
      iconSrc: pastorDef.iconSrc || "",
    });
  }
}

if (typeof window !== "undefined") {
  window.pastorPowerupLevels = pastorPowerupLevels;
  window.PASTOR_POWERUP_DEFS = PASTOR_POWERUP_DEFS;
  window.PASTOR_POWERUP_MAX_LEVEL = PASTOR_POWERUP_MAX_LEVEL;
  window.PASTOR_PICKUP_DASH_DURATION_BY_LEVEL = PASTOR_PICKUP_DASH_DURATION_BY_LEVEL;
  window.getPastorPowerupLevel = getPastorPowerupLevel;
  window.setPastorPowerupLevel = setPastorPowerupLevel;
}

const PastorUpgradeScreen = (() => {
  let _visible = false;
  let _onClose = null;
  let _focusedIndex = 0;
  let _consumedAction = false;

  function show(callback) {
    _onClose = typeof callback === "function" ? callback : null;
    _visible = true;
    _focusedIndex = 0;
    _consumedAction = false;
  }

  function hide() {
    _visible = false;
    if (typeof _onClose === "function") {
      const cb = _onClose;
      _onClose = null;
      cb();
    }
  }

  function activate(btn) {
    if (!btn) return;
    if (btn.key === "__skip__" || btn.maxed) {
      hide();
    } else {
      const currentLevel = getPastorPowerupLevel(btn.key);
      if (currentLevel < PASTOR_POWERUP_MAX_LEVEL) {
        setPastorPowerupLevel(btn.key, currentLevel + 1);
        if (typeof window?.playMenuItemPickSfx === "function") window.playMenuItemPickSfx(0.6);
      }
      hide();
    }
  }

  function handleCanvasClick() {} // handled by update via handleAnnouncementButtons

  function update() {
    if (!_visible) return;
    const buttons = window.__pastorUpgradeScreenButtons?.buttons || [];
    if (!buttons.length) return;
    handleAnnouncementButtons({
      key: "pastorUpgradeScreen",
      buttons,
      onActivate: activate,
    });
  }

  function draw() {
    if (!_visible) return;
    const r = window.Renderer;
    if (!r?.drawPastorUpgradeScreen) return;
    r.drawPastorUpgradeScreen(ctx, canvas, {
      uiFontFamily: UI_FONT_FAMILY,
      backgroundMode: "image",
    });
  }

  function consumeAction() {
    const was = _consumedAction;
    _consumedAction = false;
    return was;
  }

  return { show, hide, draw, isVisible: () => _visible, handleCanvasClick, update, consumeAction };
})();

const DenominationScreen = (() => {
  let _visible = false;
  let _onClose = null;
  let _focusedIndex = 0;

  function show(callback) {
    _onClose = typeof callback === "function" ? callback : null;
    _visible = true;
    _focusedIndex = 0;
  }

  function hide() {
    _visible = false;
    if (typeof _onClose === "function") {
      const cb = _onClose;
      _onClose = null;
      cb();
    }
  }

  function activate(btn) {
    if (!btn || btn.key === "__skip__") { hide(); return; }
    if (typeof window.MapScreen?.setDenominationForActiveSave === "function") {
      window.MapScreen.setDenominationForActiveSave(btn.key);
    }
    hide();
  }

  function shouldShow() {
    const classId = window.BattlechurchClasses?.getActiveId?.() || "";
    const cls = window.BattlechurchClasses?.getById?.(classId);
    // Only show for Protestant top-level (not already a sub-denom)
    if (!cls?.isProtestant || cls?.isProtestantSub) return false;
    // Check if already unlocked in a previous run — never show again
    if (window.MapScreen?.areDenominationsUnlocked?.()) return false;
    // Check if we're finishing District 1 right now using activeDistrictId
    const mapData = window.BattlechurchMapData;
    if (!mapData) return false;
    const fronts = (mapData.fronts || []).slice().sort((a, b) => a.order - b.order);
    const firstFront = fronts[0];
    if (!firstFront) return false;
    const firstFrontDistricts = (mapData.districts || []).filter((d) => d.frontId === firstFront.id);
    return firstFrontDistricts.some((d) => d.id === activeDistrictId);
  }

  function update() {
    if (!_visible) return;
    const buttons = window.__denominationScreenButtons?.buttons || [];
    if (!buttons.length) return;
    handleAnnouncementButtons({
      key: "denominationScreen",
      buttons,
      onActivate: activate,
    });
  }

  function draw() {
    if (!_visible) return;
    const r = window.Renderer;
    if (!r?.drawDenominationScreen) return;
    r.drawDenominationScreen(ctx, canvas, { uiFontFamily: UI_FONT_FAMILY });
  }

  return { show, hide, draw, isVisible: () => _visible, update, shouldShow };
})();

function getChurchPowerupLevelCost(def, level) {
  // level is the CURRENT level (0-9); returns cost to purchase the next level
  const costs = Array.isArray(def?.levelCosts) ? def.levelCosts : [];
  return Number.isFinite(costs[level]) ? costs[level] : (Number.isFinite(def?.cost) ? def.cost : 40);
}

// Returns the active duration for a church powerup instance given level and instance (1=primary, 2=secondary).
// Levels 1-5: single instance, duration scales 40%→100% of base (4s→10s for base 10).
// Levels 6-10: primary at full duration; secondary scales 40%→100% of base.
function getChurchPowerupInstanceDuration(baseDuration, level, instance) {
  const minFrac = 0.4;
  if (instance === 1) {
    if (level >= 5) return baseDuration;
    const t = (level - 1) / 4;
    return baseDuration * (minFrac + (1 - minFrac) * t);
  }
  if (level < 6) return 0;
  if (level >= 10) return baseDuration;
  const t = (level - 6) / 4;
  return baseDuration * (minFrac + (1 - minFrac) * t);
}

function getChurchPowerupOptions() {
  return Object.entries(CHURCH_POWERUP_DEFS).map(([key, def]) => {
    const level = churchPowerupLevels.get(key) || 0;
    const maxLevel = CHURCH_POWERUP_MAX_LEVEL;
    const detail = def.disabled ? "Coming soon" : "";
    return {
      key,
      label: def.label || key,
      description: def.description || "",
      weaponName: def.weaponName || "",
      cost: getChurchPowerupLevelCost(def, level),
      iconSrc: def.iconSrc || def.src || null,
      detail,
      disabled: Boolean(def.disabled),
      owned: level > 0,
      level,
      maxLevel,
    };
  });
}

function unlockChurchPowerup(key) {
  if (!key || !CHURCH_POWERUP_DEFS[key] || CHURCH_POWERUP_DEFS[key].disabled) return false;
  const level = churchPowerupLevels.get(key) || 0;
  if (level >= CHURCH_POWERUP_MAX_LEVEL) return false;
  const nextLevel = level + 1;
  churchPowerupLevels.set(key, nextLevel);
  if (nextLevel >= 1) unlockedChurchPowerups.add(key);
  return true;
}

function refundChurchPowerup(key) {
  const def = CHURCH_POWERUP_DEFS[key];
  if (!def || def.disabled) return false;
  const level = churchPowerupLevels.get(key) || 0;
  if (level <= 0) return false;
  const nextLevel = level - 1;
  churchPowerupLevels.set(key, nextLevel);
  if (nextLevel <= 0) unlockedChurchPowerups.delete(key);
  // Refund the cost that was paid for this level (levelCosts is 0-indexed by level before purchase)
  const cost = getChurchPowerupLevelCost(def, level - 1);
  addGrace(cost);
  return true;
}

function purchaseChurchPowerup(key) {
  const def = CHURCH_POWERUP_DEFS[key];
  if (!def || def.disabled) return false;
  const level = churchPowerupLevels.get(key) || 0;
  if (level >= CHURCH_POWERUP_MAX_LEVEL) return false;
  const cost = getChurchPowerupLevelCost(def, level);
  if (getGraceCount() < cost) return false;
  spawnGraceSpendFlyEffects(key, cost);
  addGrace(-cost);
  return unlockChurchPowerup(key);
}

if (typeof window !== "undefined") {
  window.ChurchPowerups = {
    getOptions: getChurchPowerupOptions,
    purchase: purchaseChurchPowerup,
    refund: refundChurchPowerup,
    reset: resetChurchPowerups,
  };
}

function startBattleGraceRush(duration = GRACE_RUSH_DURATION, options = {}) {
  // Always start from a clean grace-rush visual state so one battle's
  // end-fade/blackout cannot leak into the next battle rush.
  graceRushFadeTimer = 0;
  graceRushFadeDuration = 0;
  graceRushFadeAlpha = 0;
  graceRushFadeHold = false;
  graceRushFadeReleaseTimer = 0;
  graceRushBlackout = false;
  graceRushHardBlackoutTimer = 0;

  graceRushState.active = true;
  graceRushState.timer = Math.max(0, duration);
  graceRushState.duration = Math.max(0, duration);
  graceRushState.elapsed = 0;
  graceRushState.reason = options.reason || "battle";
  graceRushState.burstAmount = Math.max(
    1,
    Math.round(
      options.burstAmount ??
        (graceRushState.reason === "boss" ? GRACE_RUSH_BOSS_BURST_AMOUNT : GRACE_RUSH_BATTLE_BURST_AMOUNT),
    ),
  );
  graceRushState.spawnInterval = Math.max(
    0.2,
    Number.isFinite(options.spawnInterval)
      ? options.spawnInterval
      : graceRushState.reason === "boss"
        ? GRACE_RUSH_BOSS_SPAWN_INTERVAL
        : GRACE_RUSH_BATTLE_SPAWN_INTERVAL,
  );
  graceRushState.spawnTimer = 0;
  graceRushState.centerX = Number.isFinite(options.centerX) ? options.centerX : null;
  graceRushState.centerY = Number.isFinite(options.centerY) ? options.centerY : null;
  prepareGraceRushNpcFarewellQueue();
  lastEnemyDeathPosition = null;
}

function updateGraceRushState(dt) {
  if (!graceRushState.active) return;
  const levelStatus = levelManager?.getStatus ? levelManager.getStatus() : null;
  if (levelStatus?.stage !== "graceRush") {
    graceRushState.active = false;
    graceRushState.timer = 0;
    graceRushState.elapsed = 0;
    graceRushState.spawnTimer = 0;
    graceRushState.centerX = null;
    graceRushState.centerY = null;
    resetGraceRushNpcFarewellState({ resetAlpha: false });
    return;
  }
  graceRushState.elapsed = Math.max(0, graceRushState.elapsed + dt);
  graceRushState.timer = Math.max(0, graceRushState.timer - dt);
  graceRushState.spawnTimer = (graceRushState.spawnTimer || 0) - dt;
  if (graceRushState.reason !== "boss") {
    // Non-boss NPC fades are now driven by each NPC's spoken-line timer
    // (see updateBattleVictoryNpcDialogue + updateCozyNpcs).
  } else {
    resetGraceRushNpcFarewellState({ resetAlpha: false });
  }
  if (graceRushState.spawnTimer <= 0) {
    spawnVictoryGraceBurst({
      reason: graceRushState.reason,
      amount: graceRushState.burstAmount,
      centerX: graceRushState.centerX,
      centerY: graceRushState.centerY,
    });
    graceRushState.spawnTimer = graceRushState.spawnInterval;
  }
  if (graceRushState.timer <= 0) {
    graceRushState.active = false;
    graceRushState.timer = 0;
    graceRushState.elapsed = 0;
    graceRushState.spawnTimer = 0;
    graceRushState.centerX = null;
    graceRushState.centerY = null;
    resetGraceRushNpcFarewellState({ resetAlpha: false });
  }
}

function getLastEnemyDeathPosition() {
  if (!lastEnemyDeathPosition) return null;
  return { ...lastEnemyDeathPosition };
}

let projectileFrames = {};
const assetSrcResolutionCache = new Map();

let paused = false;

let spawnTimer = 0;
let gameOver = false;
let lastTime = performance.now();
let gameLoopStarted = false;
let gameLoopHandle = null;
paused = true;
let hpFlashTimer = 0;
let hitFreezeTimer = 0;
let cameraShakeTimer = 0;
let cameraShakeMagnitude = 0;
let bossLightningFlashAlpha = 0;
const BOSS_LIGHTNING_ATMO_MIN_INTERVAL = 3.6;
const BOSS_LIGHTNING_ATMO_MAX_INTERVAL = 8.2;
const BOSS_LIGHTNING_ATMO_FLASH_DURATION = 0.24;
const BOSS_LIGHTNING_ATMO_FLASH_MIN_INTENSITY = 0.12;
const BOSS_LIGHTNING_ATMO_FLASH_MAX_INTENSITY = 0.24;
const BOSS_LIGHTNING_ATMO_SHAKE_DURATION = 0.12;
const BOSS_LIGHTNING_ATMO_SHAKE_MIN = 1.8;
const BOSS_LIGHTNING_ATMO_SHAKE_MAX = 3.4;
const BOSS_LIGHTNING_ATMO_ECHO_CHANCE = 0.34;
const BOSS_LIGHTNING_ATMO_ECHO_MIN_DELAY = 0.1;
const BOSS_LIGHTNING_ATMO_ECHO_MAX_DELAY = 0.22;
const bossLightningAtmosphere = {
  active: false,
  nextStrikeTimer: 0,
  echoTimer: 0,
  flashTimer: 0,
  flashDuration: BOSS_LIGHTNING_ATMO_FLASH_DURATION,
  flashIntensity: 0,
};

function getBossLightningRandomInterval() {
  return (
    BOSS_LIGHTNING_ATMO_MIN_INTERVAL +
    Math.random() * Math.max(0.001, BOSS_LIGHTNING_ATMO_MAX_INTERVAL - BOSS_LIGHTNING_ATMO_MIN_INTERVAL)
  );
}

function queueBossLightningStrike() {
  const intensity =
    BOSS_LIGHTNING_ATMO_FLASH_MIN_INTENSITY +
    Math.random() * Math.max(0.001, BOSS_LIGHTNING_ATMO_FLASH_MAX_INTENSITY - BOSS_LIGHTNING_ATMO_FLASH_MIN_INTENSITY);
  bossLightningAtmosphere.flashDuration = BOSS_LIGHTNING_ATMO_FLASH_DURATION;
  bossLightningAtmosphere.flashTimer = BOSS_LIGHTNING_ATMO_FLASH_DURATION;
  bossLightningAtmosphere.flashIntensity = intensity;
  const shakeMag =
    BOSS_LIGHTNING_ATMO_SHAKE_MIN +
    Math.random() * Math.max(0.001, BOSS_LIGHTNING_ATMO_SHAKE_MAX - BOSS_LIGHTNING_ATMO_SHAKE_MIN);
  applyCameraShake(BOSS_LIGHTNING_ATMO_SHAKE_DURATION, shakeMag);
  playBossLightningThunderSfx(0.5 + Math.random() * 0.16);
}

function resetBossLightningAtmosphere() {
  bossLightningAtmosphere.active = false;
  bossLightningAtmosphere.nextStrikeTimer = 0;
  bossLightningAtmosphere.echoTimer = 0;
  bossLightningAtmosphere.flashTimer = 0;
  bossLightningAtmosphere.flashIntensity = 0;
  bossLightningFlashAlpha = 0;
}

function updateBossLightningAtmosphere(dt) {
  const levelStatus = levelManager?.getStatus ? levelManager.getStatus() : null;
  const stage = levelStatus?.stage || "";
  const bossAtmosphereActive = stage === "bossIntro" || stage === "bossActive";
  if (!bossAtmosphereActive) {
    resetBossLightningAtmosphere();
    return;
  }
  if (paused) return;
  if (!bossLightningAtmosphere.active) {
    bossLightningAtmosphere.active = true;
    bossLightningAtmosphere.nextStrikeTimer = 1.8 + Math.random() * 2.2;
    bossLightningAtmosphere.echoTimer = 0;
  }
  bossLightningAtmosphere.nextStrikeTimer = Math.max(0, bossLightningAtmosphere.nextStrikeTimer - dt);
  if (bossLightningAtmosphere.nextStrikeTimer <= 0) {
    queueBossLightningStrike();
    bossLightningAtmosphere.nextStrikeTimer = getBossLightningRandomInterval();
    bossLightningAtmosphere.echoTimer =
      Math.random() < BOSS_LIGHTNING_ATMO_ECHO_CHANCE
        ? BOSS_LIGHTNING_ATMO_ECHO_MIN_DELAY +
          Math.random() * Math.max(0.001, BOSS_LIGHTNING_ATMO_ECHO_MAX_DELAY - BOSS_LIGHTNING_ATMO_ECHO_MIN_DELAY)
        : 0;
  }
  if (bossLightningAtmosphere.echoTimer > 0) {
    bossLightningAtmosphere.echoTimer = Math.max(0, bossLightningAtmosphere.echoTimer - dt);
    if (bossLightningAtmosphere.echoTimer <= 0) {
      queueBossLightningStrike();
    }
  }
  if (bossLightningAtmosphere.flashTimer > 0) {
    bossLightningAtmosphere.flashTimer = Math.max(0, bossLightningAtmosphere.flashTimer - dt);
    const t =
      bossLightningAtmosphere.flashDuration > 0
        ? bossLightningAtmosphere.flashTimer / bossLightningAtmosphere.flashDuration
        : 0;
    const eased = Math.max(0, Math.min(1, t * t));
    bossLightningFlashAlpha = bossLightningAtmosphere.flashIntensity * eased;
  } else {
    bossLightningFlashAlpha = 0;
  }
}

function applyCameraShake(duration, magnitude) {
  if (duration <= 0 || magnitude <= 0) return;
  if (cameraShakeTimer <= 0 || magnitude > cameraShakeMagnitude) {
    cameraShakeTimer = Math.max(cameraShakeTimer, duration);
    cameraShakeMagnitude = magnitude;
  }
}
// per-layer pan values used by drawBackground
let backgroundPan = { far: { x: 0 }, mid: { x: 0 } };
const devFrameCache = new Map(); // cache extracted frames per clip
let canvasScale = 1;

FloatingText.initialize({
  getPlayer: () => player,
  maxSpeechBubbles: 10,
});

const floatingTexts = FloatingText.getActive();
const addFloatingText = FloatingText.add;
const addFloatingTextAt = FloatingText.addAt;
const showDamage = FloatingText.showDamage;
const heroSay = FloatingText.heroSay;
const heroComboCallout = FloatingText.heroComboCallout;
const npcCheer = FloatingText.npcCheer;
const addStatusText = FloatingText.addStatusText;
const updateFloatingTexts = FloatingText.update;

function showWaveHealthSnapshot() {
  if (player && player.state !== "death" && Number.isFinite(player.health)) {
    heroSay(`HP ${Math.max(0, Math.round(player.health))}`, { life: 5.0 });
  }
  showWaveKillCountBurst();

  const formationLabel =
    FORMATION_PRESETS?.[formationState?.current]?.label || "formation";
  const waveEndConfig = CONGREGATION_WAVE_END_DIALOGUE;
  const eligibleNpcs = npcs.filter(
    (npc) =>
      npc &&
      !npc.departed &&
      npc.active &&
      npc.state !== "lostFaith" &&
      Number.isFinite(npc.faith),
  );
  if (!eligibleNpcs.length) return;

  const buckets = {
    full: [],
    high: [],
    mid: [],
    low: [],
    critical: [],
  };
  eligibleNpcs.forEach((npc) => {
    const faith = Math.max(0, Math.round(npc.faith || 0));
    if (faith >= 100) {
      buckets.full.push(npc);
    } else if (faith >= 81) {
      buckets.high.push(npc);
    } else if (faith >= 50) {
      buckets.mid.push(npc);
    } else if (faith >= 30) {
      buckets.low.push(npc);
    } else if (faith >= 1) {
      buckets.critical.push(npc);
    }
  });

  const linesByTier = waveEndConfig.linesByTier || {};
  const maxSpeakers = Math.max(1, Math.round(waveEndConfig.maxSpeakers || 5));
  const shortLineLife = Math.max(0.1, Number(waveEndConfig.shortLineLife) || 5.4);

  const speakers = [];
  const speakerSet = new Set();
  const addSpeaker = (npc, line, life = shortLineLife) => {
    if (!npc || !line || speakerSet.has(npc)) return;
    speakers.push({ npc, line, life });
    speakerSet.add(npc);
  };

  const tierOrder = Array.isArray(waveEndConfig.tierOrder)
    ? waveEndConfig.tierOrder
    : ["full", "high", "mid", "low", "critical"];
  tierOrder.forEach((tier) => {
    if (speakers.length >= maxSpeakers) return;
    const candidates = buckets[tier].filter((npc) => !speakerSet.has(npc));
    if (!candidates.length) return;
    const npc = randomChoice(candidates);
    if (!npc) return;
    const faith = Math.max(0, Math.round(npc.faith || 0));
    const tierLines = Array.isArray(linesByTier[tier]) ? linesByTier[tier] : [];
    const lineFactory = randomChoice(tierLines);
    addSpeaker(npc, typeof lineFactory === "function" ? lineFactory(faith) : null);
  });

  if (speakers.length < maxSpeakers) {
    const leftovers = eligibleNpcs.filter((npc) => !speakerSet.has(npc));
    while (speakers.length < maxSpeakers && leftovers.length) {
      const npc = leftovers.splice(Math.floor(Math.random() * leftovers.length), 1)[0];
      const faith = Math.max(0, Math.round(npc.faith || 0));
      const tier =
        faith >= 100 ? "full" :
        faith >= 81 ? "high" :
        faith >= 50 ? "mid" :
        faith >= 30 ? "low" :
        "critical";
      const tierLines = Array.isArray(linesByTier[tier]) ? linesByTier[tier] : [];
      const lineFactory = randomChoice(tierLines);
      addSpeaker(npc, typeof lineFactory === "function" ? lineFactory(faith) : null);
    }
  }

  speakers.forEach(({ npc, line, life }) => {
    const faith = Math.max(0, Math.round(npc?.faith || 0));
    const shortLine = String(line || "").trim() || "Holding on";
    npcCheer(npc, `${faith}\n${shortLine}`, UI_COLOR.speechBubbleText, { life });
  });
}

function getCongregationConversationResponders() {
  const activeNpcs = npcs.filter(
    (npc) => npc && !npc.departed && npc.active && npc.state !== "lostFaith" && npc.state !== "drained",
  );
  if (activeNpcs.length) return activeNpcs;
  return congregationMembers.filter(
    (member) =>
      member &&
      !member.departed &&
      member.state !== "lostFaith" &&
      member.state !== "drained" &&
      Number.isFinite(member.x) &&
      Number.isFinite(member.y),
  );
}

function resetCongregationWaveIntroDialogueState() {
  congregationWaveIntroDialogueState.activeKey = "";
  congregationWaveIntroDialogueState.queue.length = 0;
  congregationWaveIntroDialogueState.usedResponders = new Set();
}

function queueCongregationWaveIntroDialogue(levelStatus) {
  const firstWaveIntro = CONGREGATION_WAVE_INTRO_DIALOGUE.firstWave || {};
  const pastorLine = firstWaveIntro.pastor || null;
  const responses = Array.isArray(firstWaveIntro.responses) ? firstWaveIntro.responses : [];
  const key = [
    levelStatus?.level || 0,
    levelStatus?.battle || 0,
    levelStatus?.wave || 0,
  ].join(":");
  if (!key) return;
  congregationWaveIntroDialogueState.activeKey = key;
  congregationWaveIntroDialogueState.queue.length = 0;
  congregationWaveIntroDialogueState.usedResponders = new Set();
  const formationLabel = getCurrentFormationDialogueLabel();
  const pastorText =
    typeof pastorLine?.text === "function"
      ? pastorLine.text(formationLabel)
      : pastorLine?.text;
  if (pastorText) {
    congregationWaveIntroDialogueState.queue.push({
      delay: Math.max(0, Number(pastorLine.delay) || 0.35),
      run() {
        heroSay(pastorText, { life: Number(pastorLine.life) || 2.6 });
      },
    });
  }
  const responseBaseDelay = Math.max(0, Number(responses[0]?.delay) || 1.35);
  const responseStagger = Math.max(0.25, Number(firstWaveIntro.responseStaggerSec) || 0.9);
  const allRespondersSpeak = Boolean(firstWaveIntro.allRespondersSpeak);
  if (allRespondersSpeak) {
    const responders = getCongregationConversationResponders();
    if (!responders.length || !responses.length) return;
    const shuffledResponders = responders.slice().sort(() => Math.random() - 0.5);
    const shuffledResponses = responses.slice().sort(() => Math.random() - 0.5);
    shuffledResponders.forEach((npc, idx) => {
      if (!npc) return;
      const response = shuffledResponses[idx % shuffledResponses.length];
      if (!response?.text) return;
      const perLineDelay = Math.max(0, Number(response.delay));
      const cumulativeDelay = Number.isFinite(perLineDelay)
        ? perLineDelay + idx * responseStagger
        : responseBaseDelay + idx * responseStagger;
      congregationWaveIntroDialogueState.queue.push({
        delay: cumulativeDelay,
        run() {
          congregationWaveIntroDialogueState.usedResponders.add(npc);
          npcCheer(npc, response.text, UI_COLOR.speechBubbleText, {
            life: Number(response.life) || 3.2,
          });
        },
      });
    });
    return;
  }
  responses.forEach((response, idx) => {
    if (!response?.text) return;
    const perLineDelay = Math.max(0, Number(response.delay));
    const cumulativeDelay = Number.isFinite(perLineDelay)
      ? perLineDelay + idx * responseStagger
      : responseBaseDelay + idx * responseStagger;
    congregationWaveIntroDialogueState.queue.push({
      delay: cumulativeDelay,
      run() {
        const available = getCongregationConversationResponders();
        if (!available.length) return;
        const used = congregationWaveIntroDialogueState.usedResponders;
        const fresh = available.filter((npc) => !used.has(npc));
        const candidates = fresh.length ? fresh : available;
        const npc = randomChoice(candidates);
        if (!npc) return;
        used.add(npc);
        npcCheer(npc, response.text, UI_COLOR.speechBubbleText, {
          life: Number(response.life) || 3.2,
        });
      },
    });
  });
}

function updateCongregationWaveIntroDialogue(dt, levelStatus) {
  const stage = levelStatus?.stage || "";
  const waveNumber = Number(levelStatus?.wave) || 0;
  const allowCarryIntoWaveActive =
    waveNumber === 1 &&
    stage === "waveActive" &&
    congregationWaveIntroDialogueState.queue.length > 0;
  if ((stage !== "waveIntro" && !allowCarryIntoWaveActive) || waveNumber !== 1) {
    if (congregationWaveIntroDialogueState.activeKey) {
      resetCongregationWaveIntroDialogueState();
    }
    return;
  }
  const currentKey = [
    levelStatus?.level || 0,
    levelStatus?.battle || 0,
    waveNumber,
  ].join(":");
  if (congregationWaveIntroDialogueState.activeKey !== currentKey) {
    queueCongregationWaveIntroDialogue(levelStatus);
  }
  for (let i = 0; i < congregationWaveIntroDialogueState.queue.length; ) {
    const event = congregationWaveIntroDialogueState.queue[i];
    event.delay -= dt;
    if (event.delay <= 0) {
      try {
        event.run();
      } catch (error) {
        console.error("Congregation wave intro dialogue failed", error);
      }
      congregationWaveIntroDialogueState.queue.splice(i, 1);
    } else {
      i += 1;
    }
  }
}

function getCurrentFormationDialogueLabel() {
  const preset = FORMATION_PRESETS?.[formationState?.current] || null;
  return preset?.spokenLabel || preset?.label || "group";
}

function getNpcRedFaithThresholdRatio() {
  const threshold = Number(CONGREGATION_RED_FAITH_DIALOGUE.thresholdRatio);
  return Number.isFinite(threshold) ? Math.max(0, Math.min(1, threshold)) : 0.33;
}

function getNpcRedFaithDialogueLine() {
  const candidates = Array.isArray(CONGREGATION_RED_FAITH_DIALOGUE.lines)
    ? CONGREGATION_RED_FAITH_DIALOGUE.lines
    : [];
  const lineFactory = randomChoice(candidates);
  if (typeof lineFactory === "function") {
    return lineFactory(getCurrentFormationDialogueLabel());
  }
  return lineFactory || null;
}

function getNpcRedFaithDialogueLife() {
  const life = Number(CONGREGATION_RED_FAITH_DIALOGUE.life);
  return Number.isFinite(life) ? Math.max(0.1, life) : 5.8;
}

function getNpcPowerupDialogueSpeaker() {
  const activeNpcs = npcs.filter(
    (npc) =>
      npc &&
      !npc.departed &&
      npc.active &&
      npc.state !== "lostFaith" &&
      npc.state !== "drained" &&
      Number.isFinite(npc.x) &&
      Number.isFinite(npc.y),
  );
  return activeNpcs.length ? randomChoice(activeNpcs) : null;
}

const NPC_POWERUP_EFFECT_NAMES = {
  npcScriptureWeapon: "Scripture",
  npcWisdomWeapon: "Wisdom",
  npcFaithWeapon: "Faith",
  harmony: "Encouragement",
};
// Toggle for pickup/powerup speech bubbles only (player + NPC).
// Keep false for now; flip to true to restore the old behavior quickly.
const POWERUP_SPEECH_BUBBLES_ENABLED = false;

function triggerNpcPowerupDialogue(effectKey) {
  if (!POWERUP_SPEECH_BUBBLES_ENABLED) return false;
  const name = NPC_POWERUP_EFFECT_NAMES[effectKey];
  if (!name) return false;
  const speaker = getNpcPowerupDialogueSpeaker();
  if (!speaker) return false;
  npcCheer(speaker, name, UI_COLOR.speechBubbleText, { life: 3.2 });
  return true;
}

function showBattleVictoryNpcDialogue() {
  const responders = getCongregationConversationResponders().slice();
  if (!responders.length) return false;
  const helpedLineCount = 3;
  const goodbyeLineCount = 2;
  const speakerCount = helpedLineCount + goodbyeLineCount;
  const life = 5.6;
  const fadeDelay = 4.1;
  const initialPostKillDelay = 2.0;
  const helpedStaggerStep = 0.75;
  const goodbyeStartDelay = 0.4;
  const goodbyeStaggerStep = 0.5;
  const speakerCycle = responders.slice().sort(() => Math.random() - 0.5);
  let speakerCursor = 0;
  const usedHelped = new Set();
  const usedGoodbyes = new Set();
  battleVictoryDialogueState.queue.length = 0;
  for (let i = 0; i < speakerCount; i += 1) {
    const speaker = speakerCycle[speakerCursor % speakerCycle.length];
    speakerCursor += 1;
    if (!speaker) continue;
    const isHelpedLine = i < helpedLineCount;
    const line =
      isHelpedLine
        ? (() => {
            const available = VICTORY_OPENING_LINES.filter((text) => !usedHelped.has(text));
            const pool = available.length ? available : VICTORY_OPENING_LINES;
            const selected = pool[Math.floor(Math.random() * pool.length)];
            usedHelped.add(selected);
            return selected;
          })()
        : (() => {
            const available = GRACE_RUSH_FAREWELL_LINES.filter((text) => !usedGoodbyes.has(text));
            const pool = available.length ? available : GRACE_RUSH_FAREWELL_LINES;
            const selected = pool[Math.floor(Math.random() * pool.length)];
            usedGoodbyes.add(selected);
            return selected;
          })();
    const helpedPhaseEnd =
      initialPostKillDelay + Math.max(0, (helpedLineCount - 1) * helpedStaggerStep);
    const delay = isHelpedLine
      ? initialPostKillDelay + i * helpedStaggerStep
      : helpedPhaseEnd + goodbyeStartDelay + (i - helpedLineCount) * goodbyeStaggerStep;
    battleVictoryDialogueState.queue.push({
      delay,
      speaker,
      line,
      life,
      fadeDelay,
    });
  }
  return battleVictoryDialogueState.queue.length > 0;
}

function updateBattleVictoryNpcDialogue(dt) {
  for (let i = 0; i < battleVictoryDialogueState.queue.length; i += 1) {
    const event = battleVictoryDialogueState.queue[i];
    event.delay -= dt;
  }
  const readyIndex = battleVictoryDialogueState.queue.findIndex((event) => event.delay <= 0);
  if (readyIndex >= 0) {
    const [event] = battleVictoryDialogueState.queue.splice(readyIndex, 1);
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    if (event.speaker) {
      event.speaker.graceRushNpcFadeStartAt = now + Math.max(0, (event.fadeDelay || 0) * 1000);
      event.speaker.graceRushNpcFadeDurationMs = 1200;
      event.speaker.graceRushNpcFadeAlpha = 1;
    }
    npcCheer(event.speaker, event.line, UI_COLOR.speechBubbleText, {
      life: event.life,
      fadeDelay: event.fadeDelay || 0,
      vy: 0,
    });
  }
}

Effects.initialize({
  context: ctx,
  getAssets: () => assets,
});

const updateEffects = Effects.update;
const spawnImpactEffect = Effects.spawnImpactEffect;
const spawnFlashEffect = Effects.spawnFlashEffect;
const spawnSentryBurnEffect = Effects.spawnSentryBurnEffect;
const spawnSentryBeamHitEffect = Effects.spawnSentryBeamHitEffect;
const spawnSentryBoreKillEffect = Effects.spawnSentryBoreKillEffect;
const spawnMagicImpactEffect = Effects.spawnMagicImpactEffect;
const spawnVisitorHeartHitEffect = Effects.spawnVisitorHeartHitEffect;
const spawnBossProjectilePuffEffect = Effects.spawnBossProjectilePuffEffect;
const spawnChattyHeartHitEffect = Effects.spawnChattyHeartHitEffect;
const spawnChattyAppeaseEffect = Effects.spawnChattyAppeaseEffect;
const spawnMagicSplashEffect = Effects.spawnMagicSplashEffect;
const spawnSplashDebugCircle = Effects.spawnSplashDebugCircle;
const spawnPuffEffect = Effects.spawnPuffEffect;
const spawnSmokeEffect = Effects.spawnSmokeEffect;
const spawnImpactDustEffect = Effects.spawnImpactDustEffect;
const spawnRayboltEffect = Effects.spawnRayboltEffect;
const spawnPrayerBombGlow = Effects.spawnPrayerBombGlow;
const spawnPrayerBombExplosion = Effects.spawnPrayerBombExplosion;
const spawnEnemyDeathExplosion = Effects.spawnEnemyDeathExplosion;
const spawnRushBurstEffect = Effects.spawnRushBurstEffect;
const spawnSlashBurstEffect = Effects.spawnSlashBurstEffect;

function triggerPrayerBombExplosionAt(x, y, radius, damage) {
  if (typeof spawnPrayerBombExplosion === "function") {
    spawnPrayerBombExplosion(x, y, { radius });
  }
  applyPrayerBombDamageAt(x, y, radius, damage);
}

function applyPrayerBombDamageAt(x, y, radius, damage, { bossScale = PRAYER_BOMB_BOSS_DAMAGE_SCALE } = {}) {
  const classScaledDamage = applySmiteDamageClassMultiplier(damage);
  const hits = [];
  enemies.forEach((enemy) => {
    if (!enemy || enemy.dead || enemy.state === "death") return;
    const hitRadius = getEnemyHitboxRadius(enemy);
    const center = getEnemyHitboxCenter(enemy);
    const distance = Math.hypot(center.x - x, center.y - y);
    if (distance <= radius + hitRadius * 0.8) {
      enemy.takeDamage(classScaledDamage);
      if (enemy.dead || enemy.state === "death" || (Number.isFinite(enemy.health) && enemy.health <= 0)) {
        enemy.killedByPrayerBomb = true;
      }
      hits.push(enemy);
    }
  });
  let bossHit = false;
  if (typeof activeBoss !== "undefined" && activeBoss && !activeBoss.dead && activeBoss.state !== "death") {
    const bossRadius = activeBoss.radius || 0;
    const bossDistance = Math.hypot(activeBoss.x - x, activeBoss.y - y);
    if (bossDistance <= radius + bossRadius * 0.8) {
      activeBoss.takeDamage(classScaledDamage * bossScale);
      bossHit = true;
    }
  }
  if (prayerBombComboState.active) {
    const hitCount = hits.length + (bossHit ? 1 : 0);
    recordPrayerBombComboHits(hitCount);
  }
  return { hits, bossHit };
}

function startPrayerBombFireRain(duration = PRAYER_BOMB_RAIN_DURATION) {
  const castDuration = Math.max(0, Number(duration) || 0);
  prayerBombRainTimer = Math.max(prayerBombRainTimer, castDuration);
  prayerBombRainSpawnTimer = 0;
  prayerStormGroundFireTargetThisCast =
    PRAYER_STORM_GROUND_FIRE_TARGET_MIN +
    Math.floor(
      Math.random() *
        (PRAYER_STORM_GROUND_FIRE_TARGET_MAX - PRAYER_STORM_GROUND_FIRE_TARGET_MIN + 1),
    );
  prayerStormGroundFireSpawnedThisCast = 0;
  prayerStormRainImpactCountThisCast = 0;
  const estimatedImpacts = Math.max(
    1,
    Math.ceil(castDuration / Math.max(0.001, PRAYER_BOMB_RAIN_INTERVAL)) * 2,
  );
  prayerStormGroundFireImpactSpacing = Math.max(
    1,
    estimatedImpacts / Math.max(1, prayerStormGroundFireTargetThisCast),
  );
  prayerStormGroundFireNextSpawnAtImpact = Math.max(
    1,
    prayerStormGroundFireImpactSpacing * 0.5,
  );
  startPrayerBombCombo();
}

function triggerPrayerBombScreenDarken(duration = 0.8) {
  const safeDuration = Math.max(0.2, Number(duration) || 0.8);
  prayerBombScreenFadeDuration = safeDuration;
  prayerBombScreenFadeTimer = Math.max(prayerBombScreenFadeTimer, safeDuration);
}

function handlePrayerBombRainImpact() {
  triggerPrayerBombScreenDarken(PRAYER_BOMB_RAIN_DARKEN_DURATION);
  applyCameraShake(PRAYER_BOMB_RAIN_SHAKE_DURATION, PRAYER_BOMB_RAIN_SHAKE_MAGNITUDE);
}

function maybeSpawnPrayerStormGroundFire(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (prayerStormGroundFireSpawnedThisCast >= prayerStormGroundFireTargetThisCast) return;
  prayerStormRainImpactCountThisCast += 1;
  if (prayerStormRainImpactCountThisCast < prayerStormGroundFireNextSpawnAtImpact) return;
  const fireSets = assets?.effects?.prayerStormGroundFire || [];
  let frames = null;
  if (Array.isArray(fireSets) && fireSets.length) {
    frames = fireSets[Math.floor(Math.random() * fireSets.length)] || null;
  }
  const getUWallSpawnPoint = () => {
    const home = getNpcHomeBounds();
    if (!home) return { x, y };
    const spanX = Math.max(1, home.maxX - home.minX);
    const spanY = Math.max(1, home.maxY - home.minY);
    const sideRoll = Math.random();
    const bottomBias = 0.40;
    const sideInsetX = spanX * 0.1;
    const sideInsetY = spanY * 0.12;
    const wallOffsetMin = Math.max(18, 26 * WORLD_SCALE);
    const wallOffsetMax = Math.max(wallOffsetMin + 10, 72 * WORLD_SCALE);
    let sx = x;
    let sy = y;
    if (sideRoll < (1 - bottomBias) * 0.5) {
      // Left wall
      sx = home.minX - randomInRange(wallOffsetMin, wallOffsetMax);
      sy = randomInRange(home.minY + sideInsetY, home.maxY - sideInsetY * 0.65);
    } else if (sideRoll < (1 - bottomBias)) {
      // Right wall
      sx = home.maxX + randomInRange(wallOffsetMin, wallOffsetMax);
      sy = randomInRange(home.minY + sideInsetY, home.maxY - sideInsetY * 0.65);
    } else {
      // Bottom wall
      sx = randomInRange(home.minX + sideInsetX, home.maxX - sideInsetX);
      sy = home.maxY + randomInRange(wallOffsetMin, wallOffsetMax);
    }
    // Keep this effect explicitly out of the "north/top" side of the home base.
    sy = Math.max(home.minY + sideInsetY, sy);
    const dx = sx - home.x;
    const dy = sy - home.y;
    const dist = Math.hypot(dx, dy);
    const minDist = home.radius + Math.max(14, 18 * WORLD_SCALE);
    if (dist < minDist) {
      const angle = Math.atan2(dy, dx);
      sx = home.x + Math.cos(angle) * minDist;
      sy = home.y + Math.sin(angle) * minDist;
    }
    return {
      x: Math.max(8, Math.min(canvas.width - 8, sx)),
      y: Math.max(HUD_HEIGHT + 8, Math.min(canvas.height - 8, sy)),
    };
  };
  const spawnPoint = getUWallSpawnPoint();
  prayerStormGroundFires.push({
    x: spawnPoint.x,
    y: spawnPoint.y,
    life: PRAYER_STORM_GROUND_FIRE_DURATION,
    duration: PRAYER_STORM_GROUND_FIRE_DURATION,
    fadeDuration: PRAYER_STORM_GROUND_FIRE_FADE_DURATION,
    frameTimer: 0,
    frameIndex: Math.floor(Math.random() * 14),
    frameDuration: PRAYER_STORM_GROUND_FIRE_FRAME_DURATION,
    frames,
    radius: PRAYER_STORM_GROUND_FIRE_RADIUS,
    scale: PRAYER_STORM_GROUND_FIRE_SCALE,
    damage: PRAYER_STORM_GROUND_FIRE_DAMAGE,
    bossDamage: PRAYER_STORM_GROUND_FIRE_BOSS_DAMAGE,
    hitCooldown: PRAYER_STORM_GROUND_FIRE_HIT_COOLDOWN,
    hitMap: new WeakMap(),
  });
  prayerStormGroundFireSpawnedThisCast += 1;
  prayerStormGroundFireNextSpawnAtImpact += prayerStormGroundFireImpactSpacing;
}

function spawnPrayerBombFireball(target) {
  if (!target) return;
  const startY = HUD_HEIGHT + 8;
  const startX = target.x + randomInRange(-40, 40);
  const dx = target.x - startX;
  const dy = target.y - startY;
  const dir = normalizeVector(dx, dy);
  const speed = 900 * WORLD_SCALE;
  const travel = Math.max(40, Math.hypot(dx, dy));
  const life = travel / speed;
  const proj = spawnProjectile("fire", startX, startY, dir.x, dir.y, {
    speed,
    life,
    damage: 0,
    radius: 18,
    scale: 2.6,
    loopFrames: true,
    pierce: false,
    friendly: true,
    onImpact: (proj) => {
      if (typeof window !== "undefined" && typeof window.playPrayerBombRainSfx === "function") {
        window.playPrayerBombRainSfx(0.75);
      }
      handlePrayerBombRainImpact();
      triggerPrayerBombExplosionAt(proj.x, proj.y, PRAYER_BOMB_RAIN_RADIUS, PRAYER_BOMB_LEVEL3_DAMAGE);
      maybeSpawnPrayerStormGroundFire(proj.x, proj.y);
    },
    onExpire: (proj) => {
      if (typeof window !== "undefined" && typeof window.playPrayerBombRainSfx === "function") {
        window.playPrayerBombRainSfx(0.75);
      }
      handlePrayerBombRainImpact();
      triggerPrayerBombExplosionAt(proj.x, proj.y, PRAYER_BOMB_RAIN_RADIUS, PRAYER_BOMB_LEVEL3_DAMAGE);
      maybeSpawnPrayerStormGroundFire(proj.x, proj.y);
    },
  });
  if (!proj) {
    if (typeof window !== "undefined" && typeof window.playPrayerBombRainSfx === "function") {
      window.playPrayerBombRainSfx(0.75);
    }
    handlePrayerBombRainImpact();
    triggerPrayerBombExplosionAt(target.x, target.y, PRAYER_BOMB_RAIN_RADIUS, PRAYER_BOMB_LEVEL3_DAMAGE);
    maybeSpawnPrayerStormGroundFire(target.x, target.y);
  }
}

function updatePrayerBombFireRain(dt) {
  if (prayerBombRainTimer <= 0) {
    if (prayerBombComboState.active) {
      endPrayerBombCombo();
    }
    return;
  }
  prayerBombRainTimer = Math.max(0, prayerBombRainTimer - dt);
  prayerBombRainSpawnTimer -= dt;
  while (prayerBombRainSpawnTimer <= 0 && prayerBombRainTimer > 0) {
    prayerBombRainSpawnTimer += PRAYER_BOMB_RAIN_INTERVAL;
    for (let burstIndex = 0; burstIndex < 2; burstIndex += 1) {
      const pos = randomSpreadPosition();
      spawnPrayerBombFireball(pos);
    }
  }
}

function updatePrayerStormGroundFires(dt) {
  if (!prayerStormGroundFires.length) return;
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  for (let i = prayerStormGroundFires.length - 1; i >= 0; i -= 1) {
    const fire = prayerStormGroundFires[i];
    fire.life = Math.max(0, (fire.life || 0) - dt);
    fire.frameTimer = (fire.frameTimer || 0) + dt;
    const frames = fire.frames || [];
    const frameDuration = Math.max(0.01, fire.frameDuration || PRAYER_STORM_GROUND_FIRE_FRAME_DURATION);
    if (frames.length) {
      while (fire.frameTimer >= frameDuration) {
        fire.frameTimer -= frameDuration;
        fire.frameIndex = ((fire.frameIndex || 0) + 1) % frames.length;
      }
    }
    const canTickEntity = (entity) => {
      if (!entity || entity.dead) return false;
      if (entity.state === "death") return false;
      const lastAt = fire.hitMap?.get(entity) || 0;
      return now - lastAt >= (fire.hitCooldown || PRAYER_STORM_GROUND_FIRE_HIT_COOLDOWN) * 1000;
    };
    const markTick = (entity) => {
      if (fire.hitMap) fire.hitMap.set(entity, now);
    };
    enemies.forEach((enemy) => {
      if (!canTickEntity(enemy)) return;
      const center = getEnemyHitboxCenter(enemy);
      const dist = Math.hypot(center.x - fire.x, center.y - fire.y);
      const targetRadius = getEnemyHitboxRadius(enemy);
      if (dist > (fire.radius || PRAYER_STORM_GROUND_FIRE_RADIUS) + targetRadius * 0.7) return;
      markTick(enemy);
      enemy.takeDamage(fire.damage || PRAYER_STORM_GROUND_FIRE_DAMAGE, { damageType: "charged" });
      spawnEnemyHitEffect(enemy, center.x, center.y, { damageType: "charged" });
    });
    if (activeBoss && !activeBoss.dead && !activeBoss.defeated && !activeBoss.removed && canTickEntity(activeBoss)) {
      const center = getEnemyHitboxCenter(activeBoss);
      const dist = Math.hypot(center.x - fire.x, center.y - fire.y);
      const targetRadius = activeBoss.radius || 0;
      if (dist <= (fire.radius || PRAYER_STORM_GROUND_FIRE_RADIUS) + targetRadius * 0.7) {
        markTick(activeBoss);
        activeBoss.takeDamage(fire.bossDamage || PRAYER_STORM_GROUND_FIRE_BOSS_DAMAGE, {
          hitX: center.x,
          hitY: center.y,
          damageType: "charged",
        });
        spawnEnemyHitEffect(activeBoss, center.x, center.y, { damageType: "charged" });
      }
    }
    projectiles.forEach((projectile) => {
      if (!projectile || projectile.dead || projectile.friendly || projectile.visualOnly) return;
      if (!canTickEntity(projectile)) return;
      const pr = Math.max(0, projectile.radius || 0);
      const dist = Math.hypot((projectile.x || 0) - fire.x, (projectile.y || 0) - fire.y);
      if (dist > (fire.radius || PRAYER_STORM_GROUND_FIRE_RADIUS) + pr * 0.8) return;
      markTick(projectile);
      const projectileDied = applyProjectileDurabilityDamage(
        projectile,
        fire.damage || PRAYER_STORM_GROUND_FIRE_DAMAGE,
      );
      if (projectileDied) {
        spawnImpactEffect(projectile.x, projectile.y);
        spawnFlashEffect(projectile.x, projectile.y);
      }
    });
    if (fire.life <= 0) {
      prayerStormGroundFires.splice(i, 1);
    }
  }
}

if (typeof window !== "undefined") {
  window.startPrayerBombFireRain = startPrayerBombFireRain;
  window.triggerPrayerBombScreenDarken = triggerPrayerBombScreenDarken;
  window.showPrayerBombBlastCombo = showPrayerBombBlastCombo;
  window.triggerPrayerBombExplosionAt = triggerPrayerBombExplosionAt;
  window.applyPrayerBombDamageAt = applyPrayerBombDamageAt;
}
let heroRescueCooldown = 0;

const START_COUNTDOWN_SEQUENCE = [];

let countdownState = null;
let needsCountdown = false;
// Allow world scale to be tuned centrally (set window.__BATTLECHURCH_WORLD_SCALE before init).
const DEFAULT_WORLD_SCALE = 0.75;
const projectileSettings =
  (typeof window !== "undefined" && window.BattlechurchProjectileConfig) || {};
const WORLD_SCALE =
  projectileSettings.worldScale ??
  ((typeof window !== "undefined" && window.__BATTLECHURCH_WORLD_SCALE !== undefined)
    ? Number(window.__BATTLECHURCH_WORLD_SCALE) || DEFAULT_WORLD_SCALE
    : DEFAULT_WORLD_SCALE);
const SPEED_SCALE = Math.max(0.01, WORLD_SCALE);
const createHaloBladeState = () => ({
  active: false,
  angle: 0,
  x: 0,
  y: 0,
  radius: 288 * WORLD_SCALE,
  speed: 5.6,
  damage: 20,
  hitRadius: 22 * WORLD_SCALE,
  hitCooldown: 0.25,
  armoredHitCooldown: 0.004,
  armoredDamageMultiplier: 4.0,
  armoredMaxHitsPerSecond: 120,
  armoredHitWindowSeconds: 1,
  lastHit: new WeakMap(),
  lastBladeHit: new WeakMap(),
  hitWindowStats: new WeakMap(),
  sprite: null,
  scale: 3.4 * WORLD_SCALE,
  trail: [],
  trailTimer: 0,
  trailSpacing: 10 * WORLD_SCALE,
  trailLife: 0.4,
  maxTrail: 18,
  tetherDamageMultiplier: 0.65,
  tetherHitRadius: 12 * WORLD_SCALE,
  bladeImpactSfxCooldown: 0.05,
  lastBladeImpactSfxAt: 0,
});
const haloBladeState = createHaloBladeState();
const haloBladeStateSecondary = createHaloBladeState();
const haloBladeStateBonus = createHaloBladeState();

const createShieldTrailState = () => ({
  active: false,
  angle: 0,
  x: 0,
  y: 0,
  radius: 55 * WORLD_SCALE,
  speed: 12.0,
  trail: [],
  trailTimer: 0,
  trailSpacing: 4 * WORLD_SCALE,
  trailLife: 0.22,
  maxTrail: 35,
});
const shieldTrailStateA = createShieldTrailState();
const shieldTrailStateB = createShieldTrailState();

const createSpearState = () => ({
  active: false,
  x: 0,
  y: 0,
  angle: 0,
  speed: 1000 * WORLD_SCALE,
  damage: 20,
  armoredDamageMultiplier: 5.5,
  hitRadius: 18 * WORLD_SCALE,
  hitCooldown: 0.15,
  lastHit: new WeakMap(),
  target: null,
  trail: [],
  trailTimer: 0,
  trailSpacing: 12 * WORLD_SCALE,
  trailLife: 0.6,
  maxTrail: 16,
  sprite: null,
  scale: 3.4 * WORLD_SCALE,
  minTravel: 180 * WORLD_SCALE,
  travelSinceHit: 0,
  pauseDuration: 0.04,
  pauseTimer: 0,
  pendingRetarget: false,
  hits: 0,
  lastTarget: null,
  lastHitPos: null,
  waypoint: null,
  startDelayTimer: 0,
  spawnOffset: { x: 0, y: 0 },
  useSpawnOffset: false,
  turnSfxCooldown: 0,
  trailOuterColor: "#FFD94A",
  trailInnerColor: "#FFF7A8",
  glowColor: "#FFE86B",
  pauseFlashColor: "#FFF0A0",
  trailOuterWidth: 5,
  trailInnerWidth: 2.2,
  glowBlur: 18,
  pauseFlashBlur: 28,
  searchSpinSpeed: 1.2,
});
const spearState = createSpearState();
const spearStateSecondary = createSpearState();
const spearStateBonus = createSpearState();
spearStateSecondary.trailOuterColor = "#B6E6FF";
spearStateSecondary.trailInnerColor = "#F2FCFF";
spearStateSecondary.glowColor = "#55CCFF";
spearStateSecondary.pauseFlashColor = "#7FE0FF";
spearStateSecondary.trailOuterWidth = 7;
spearStateSecondary.trailInnerWidth = 3.2;
spearStateSecondary.glowBlur = 28;
spearStateSecondary.pauseFlashBlur = 40;
spearStateBonus.trailOuterColor = "#FFD2A8";
spearStateBonus.trailInnerColor = "#FFF4D6";
spearStateBonus.glowColor = "#FFC86B";
spearStateBonus.pauseFlashColor = "#FFE2A6";
spearStateBonus.trailOuterWidth = 6;
spearStateBonus.trailInnerWidth = 2.6;
spearStateBonus.glowBlur = 30;
spearStateBonus.pauseFlashBlur = 42;

const createSentryState = () => ({
  active: false,
  x: 0,
  y: 0,
  baseX: 0,
  baseY: 0,
  offsetX: 0,
  offsetY: 0,
  floatTimer: 0,
  floatSpeed: 1.4,
  floatAmplitude: 6 * WORLD_SCALE,
  orbitEnabled: false,
  orbitAngleOffset: 0,
  orbitRadius: 26 * WORLD_SCALE,
  angle: 0,
  baseAngle: 0,
  sprite: null,
  scale: 3.2 * WORLD_SCALE,
  beamActive: false,
  beamProgress: 0,
  beamLength: 0,
  beamEndX: 0,
  beamEndY: 0,
  beamSpeed: 2800 * WORLD_SCALE,
  beamCooldown: 0.55,
  beamCooldownTimer: 0,
  beamPulseDuration: 0.34,
  beamPulseTimer: 0,
  beamStartDelay: 0,
  beamStartDelayTimer: 0,
  beamHitSfxTimer: 0,
  hitInterval: 0.02,
  hitTimer: 0,
  damage: 10,
  hitRadius: 18 * WORLD_SCALE,
  beamOuterWidth: 10 * WORLD_SCALE,
  beamInnerWidth: 4 * WORLD_SCALE,
  beamOuterColor: "rgba(255, 214, 140, 0.85)",
  beamInnerColor: "rgba(255, 250, 220, 0.95)",
  fadeAlpha: 1,
  target: null,
  sweepAngle: Number.NaN,
  sweepStep: Math.PI / 9,
  sweepPhaseOffset: 0,
  sweepDirection: 1,
  pulseSweepAmount: Math.PI / 10,
  pulseSweepSpeed: 0.4,
  pulseSweepRemaining: 0,
  pulseSweepDirection: 1,
});
const sentryState = createSentryState();
const sentryStateSecondary = createSentryState();
const sentryStateBonus = createSentryState();
sentryState.orbitEnabled = true;
sentryState.orbitAngleOffset = 0;
sentryStateSecondary.orbitEnabled = true;
sentryStateSecondary.orbitAngleOffset = Math.PI;
sentryStateBonus.orbitEnabled = true;
sentryStateBonus.orbitAngleOffset = (Math.PI * 2) / 3;
sentryStateSecondary.beamOuterColor = "rgba(182, 230, 255, 0.85)";
sentryStateSecondary.beamInnerColor = "rgba(242, 252, 255, 0.95)";
sentryStateSecondary.glowColor = "rgba(130, 210, 255, 0.75)";
sentryStateSecondary.glowBlur = 18;
sentryStateSecondary.beamStartDelay = 0.06;
sentryStateSecondary.sweepPhaseOffset = (Math.PI * 2) / 3;
sentryStateSecondary.sweepStep = Math.PI / 9;
sentryStateSecondary.pulseSweepDirection = -1;
sentryStateBonus.beamOuterColor = "rgba(255, 215, 155, 0.85)";
sentryStateBonus.beamInnerColor = "rgba(255, 247, 220, 0.95)";
sentryStateBonus.glowColor = "rgba(255, 200, 120, 0.72)";
sentryStateBonus.glowBlur = 18;
sentryStateBonus.beamStartDelay = 0.08;
sentryStateBonus.sweepPhaseOffset = (Math.PI * 4) / 3;
sentryStateBonus.sweepStep = Math.PI / 9;

// Melee Attack System Constants (tunable via GameBalance.melee.*)
const MELEE_SWING_LENGTH_BASE = 260;
// For hitbox calculations, we need a much smaller range to match the actual swoosh visual
const MELEE_SWING_RANGE = _gb('melee.swingRange', 104) * WORLD_SCALE;
const MELEE_CLOSE_RANGE = _gb('melee.closeRange', 60) * WORLD_SCALE;
const MELEE_OFFSET = 54 * WORLD_SCALE;
const MELEE_DAMAGE_KNOCKBACK = _gb('melee.knockback', 48) * WORLD_SCALE;
const MELEE_PUSHBACK_STRENGTH = _gb('melee.pushbackStrength', 36) * WORLD_SCALE;
const MELEE_DAMAGE_DURATION = _gb('melee.damageDuration', 0.25);
const GAME_MELEE_SWING_DURATION = _gb('melee.swingDuration', 0.2);
const MELEE_COOLDOWN = _gb('melee.cooldown', 0.4);
const MELEE_DOUBLE_TAP_WINDOW = _gb('melee.doubleTapWindow', 0.18);
const HOLY_DASH_COMBO_WINDOW = _gb('melee.holyDashWindow', 0.35);
const NORMAL_A_CHAIN_WINDOW_MS = Math.max(520, MELEE_COOLDOWN * 1000 + 140);
const NORMAL_A_REHIT_HURT_DURATION = 0.1;
const A_MOVE_SFX_VOLUME_SLASH = 1.15;
const A_MOVE_SFX_VOLUME_CLEAVE = 1.2;
const A_MOVE_SFX_VOLUME_DASH_SLASH = 1.2;
const A_MOVE_SFX_VOLUME_SMASH = 1.25;
const A_MOVE_SFX_VOLUME_CHARGE_A = 1.0;
const MELEE_HOLD_CHARGE_TIME = _gb('melee.holdChargeTime', 1.5);
const MELEE_BASE_DAMAGE = _gb('melee.baseDamage', 100);
const MELEE_SWOOSH_DAMAGE_SCALE = _gb('melee.swooshDamageScale', 1.2);
const MELEE_SWOOSH_EXIT_INVULNERABILITY = _gb('melee.swooshExitInvulnerability', 0.2);
const MELEE_SWOOSH_INVULNERABILITY = GAME_MELEE_SWING_DURATION + MELEE_SWOOSH_EXIT_INVULNERABILITY;
const MELEE_SWOOSH_ARC_SCALE = _gb('melee.swooshArcScale', 2.5);
const MELEE_PROJECTILE_COOLDOWN_AFTER = _gb('melee.projectileCooldownAfter', 0.5);
const MELEE_RUSH_LOCKOUT = _gb('melee.rushLockout', 1.0);
const MELEE_CHARGE_MOVE_MULTIPLIER = 0.6;
const MELEE_SPIN_DURATION = _gb('melee.spinDuration', 0.45);
const MELEE_SPIN_COOLDOWN = _gb('melee.spinCooldown', 2.0);
const MELEE_SPIN_DAMAGE_MULTIPLIER = _gb('melee.spinDamageMultiplier', 2);
const CLEAVE_DAMAGE_MULTIPLIER = 3.0;
const CLEAVE_RANGE_MULTIPLIER = 1.35;
const COUNTER_HIT_WINDOW = 0.3;
const COUNTER_HIT_MULTIPLIER = 1.20;
const PUNISH_COUNTER_MULTIPLIER = 1.30;
const COUNTER_HIT_TEXT_LIFE = 2.9;
const PUNISH_COUNTER_TEXT_LIFE = 2.9;
const MELEE_COMBO_TEXT_LIFE = 4.2;
const COUNTER_HIT_GRACE_GEMS = GRACE_COUNTER_HIT_GEMS;
const PUNISH_COUNTER_GRACE_GEMS = GRACE_PUNISH_COUNTER_GEMS;
const MELEE_COMBO_GRACE_GEMS = GRACE_MELEE_COMBO_GEMS;
const MELEE_HITSTOP_DURATION = 0.09;
const MELEE_COMBO_HITSTOP_DURATION = 0.11;
const MELEE_KNOCKDOWN_MIN_HITS = 4;
const MELEE_KNOCKDOWN_REPEAT_INTERVAL = 4;
const MELEE_KNOCKDOWN_LAUNCH_MULTIPLIER = 2.2;
const MELEE_KNOCKDOWN_LAUNCH_DURATION = 0.34;
const MELEE_KNOCKDOWN_HURT_LOCK = 0.62;
const MELEE_KNOCKDOWN_LIFT = 36;
const MELEE_DIZZY_MIN_CHAIN_HITS = 4;
const MELEE_DIZZY_DURATION = 4.05;
const MELEE_COUNTER_HITSTOP_DURATION = MELEE_HITSTOP_DURATION;
const MELEE_PUNISH_HITSTOP_DURATION = MELEE_HITSTOP_DURATION;
const MELEE_HITSTOP_SHAKE = 10;
const MELEE_COMBO_HITSTOP_SHAKE = 13;
const MELEE_COUNTER_HITSTOP_SHAKE = 17;
const MELEE_PUNISH_HITSTOP_SHAKE = 22;
const RUSH_DISTANCE = _gb('rush.distance', 220) * WORLD_SCALE;
const RUSH_SPEED = _gb('rush.speed', 1200) * SPEED_SCALE;
const RUSH_DAMAGE = MELEE_BASE_DAMAGE * 2;
const RUSH_RADIUS = _gb('rush.radius', 50) * WORLD_SCALE;
const RUSH_PUSHBACK_RADIUS = _gb('rush.pushbackRadius', 52) * WORLD_SCALE;
const RUSH_PUSHBACK_STRENGTH = _gb('rush.pushbackStrength', 50) * WORLD_SCALE;
const RUSH_COOLDOWN = _gb('rush.cooldown', 3.0);
const RUSH_DUST_SPACING = 26 * WORLD_SCALE;
const RUSH_EXIT_INVULNERABILITY = _gb('rush.exitInvulnerability', 0.35);
const SWORD_RUSH_DISTANCE_MULTIPLIER = 2.8;
const SPIN_HOLD_CHARGE_TIME = MELEE_HOLD_CHARGE_TIME;
const SPIN_CHARGE_MOVE_MULTIPLIER = 0.5;
const SPIN_MOVE_DISTANCE = RUSH_DISTANCE;
const SPIN_MOVE_SPEED = RUSH_SPEED;
const RING_OF_FIRE_RADIUS = 236 * WORLD_SCALE;
const RING_OF_FIRE_OUT_SPEED = 1550 * SPEED_SCALE;
const RING_OF_FIRE_RETURN_SPEED = 1550 * SPEED_SCALE;
const RING_OF_FIRE_TRACE_DURATION = 0.46;
const RING_OF_FIRE_LINGER_DURATION = 8.0;
const RING_OF_FIRE_BAND = 20 * WORLD_SCALE;
const RING_OF_FIRE_DAMAGE = 34;
const RING_OF_FIRE_BOSS_DAMAGE = 18;
const RING_OF_FIRE_HIT_COOLDOWN = 0.38;
const RING_OF_FIRE_INVULNERABILITY = 0.72;
const MELEE_COMBO_WINDOW_MS = _gb('melee.comboWindowMs', 750);
const HIT_CHAIN_WINDOW_MS = 400;    // enemy hit chain window
const DASH_DISTANCE = 400 * WORLD_SCALE;
const DASH_SPEED = 1400 * SPEED_SCALE;
const DASH_DUST_SPACING = 20 * WORLD_SCALE;
const DASH_COOLDOWN = 2.0;
const PROTECTED_DASH_DISTANCE = DASH_DISTANCE * 2;
const TELEPORT_INVULNERABILITY_DURATION = 1.0;
const DASH_COMBO_GRACE = 0.12;
const RUSH_HITBOX_DEBUG_DURATION = 0.12;
const BAT_SPAWN_COUNT = 10;
const BAT_SCATTER_DURATION = 0.35;
const BAT_SCATTER_SPEED_MULTIPLIER = 2.0;
const TORMENTOR_FLAME_MAX = 3;
const TORMENTOR_FLAME_RESPAWN_INTERVAL = 7.0;
const TORMENTOR_FLAME_ORBIT_SPEED = 2.6;
const TORMENTOR_FLAME_ORBIT_SCALE_MIN = 0.9;
const TORMENTOR_FLAME_ORBIT_SCALE_MAX = 1.08;
const TORMENTOR_FLAME_THROW_SPEED = 420;
const TORMENTOR_FLAME_THROW_DURATION = 0.48;
const TORMENTOR_FLAME_THROW_TOUCH_DELAY = 0.14;
const DIVINE_SHOT_DAMAGE = 100;
const DIVINE_SHOT_SPEED = 1400 * SPEED_SCALE;
const DIVINE_SHOT_LIFE = 2.8;
const DIVINE_SHOT_AUTO_AIM_DURATION = 1.6;
const DIVINE_SHOT_AUTO_AIM_STRENGTH = 3.2;
const DIVINE_SHOT_AUTO_AIM_MIN_DOT = 0.25;
const DIVINE_SHOT_PROJECTILE_PRIORITY = 5;
const SWORD_RUSH_BLAST_DAMAGE = DIVINE_SHOT_DAMAGE;
const BLITZ_DAMAGE = _gb("rush.blitzDamage", RUSH_DAMAGE + SWORD_RUSH_BLAST_DAMAGE);
const THRASH_FLURRY_STEP_SEQUENCE = Object.freeze(["SlashDown", "SlashUp", "SlashBash", "Thrust", "SlashUp"]);
const THRASH_FLURRY_CYCLES = 2;
const THRASH_FLURRY_STEP_INTERVAL = 0.08;
const THRASH_FLURRY_VFX_SCALE = 2.35;
const THRASH_FLURRY_VFX_OFFSET = 350 * WORLD_SCALE;
const THRASH_FLURRY_VFX_THICKNESS_SCALE_Y = 0.72;
const THRASH_FLURRY_VFX_GLOW_BLUR = 24;
const THRASH_FLURRY_VFX_GLOW_ALPHA = 0.92;
const THRASH_FLURRY_AFTERIMAGE_TAIL_STEPS = 3;
const THRASH_FLURRY_AFTERIMAGE_COUNT = 2;
const THRASH_FLURRY_AFTERIMAGE_DELAY = 0.05;
const THRASH_FLURRY_AFTERIMAGE_ALPHA_FALLOFF = 0.5;
const THRASH_FLURRY_VFX_FRAME_DURATION_BASE = 0.04;
const THRASH_FLURRY_VFX_FRAME_DURATION_TAIL = 0.08;
const THRASH_FLURRY_HITBOX_THICKNESS = 84 * WORLD_SCALE;
const THRASH_FLURRY_HITBOX_RADIUS = 122 * WORLD_SCALE;
const THRASH_FLURRY_HITBOX_ARC_DOT = -0.08;
const THRASH_FLURRY_REHIT_COOLDOWN = 0.065;
const THRASH_FLURRY_STEP_DAMAGE = 250;
const NORMAL_SLASH_VFX_GLOW_BLUR = 20;
const NORMAL_SLASH_VFX_GLOW_ALPHA = 0.88;
const NORMAL_SLASH_VFX_DOWNWARD_ANGLE_OFFSET = 0;
const CLEAVE_VFX_UPSLASH_ANGLE_OFFSET = 0;
const CLEAVE_VFX_SCALE = 3.05;
const CLEAVE_VFX_SCALE_X = 1.5;
const CLEAVE_VFX_SCALE_Y = 0.92;
const CLEAVE_VFX_GLOW_BLUR = 26;
const CLEAVE_VFX_GLOW_ALPHA = 0.94;
const CLEAVE_VFX_SECONDARY_FORWARD_OFFSET = 30 * WORLD_SCALE;
const CLEAVE_VFX_SECONDARY_VERTICAL_OFFSET = 14 * WORLD_SCALE;
const DIVINE_CHAKRAM_SPIN_SPEED = 18.5;
const DIVINE_CHAKRAM_SCALE = 3.25;
const DIVINE_CHAKRAM_TRAIL_STEP = 18;
const DIVINE_CHAKRAM_TRAIL_COUNT = 3;
const DIVINE_CHAKRAM_HIT_RADIUS = 130 * WORLD_SCALE;
const RUSH_GLOW_TRAIL_SCALE = 2.6;
const RUSH_GLOW_TRAIL_SCALE_X = 1.7;
const RUSH_GLOW_TRAIL_SCALE_Y = 0.85;
const RUSH_GLOW_TRAIL_GLOW_BLUR = 22;
const RUSH_GLOW_TRAIL_GLOW_ALPHA = 0.88;

const CANVAS_BASE_WIDTH = 1280;
const CANVAS_BASE_HEIGHT = 720;
const HUD_HEIGHT = 43;
const UI_FONT_FAMILY =
  (typeof window !== "undefined" && window.UIStyles?.fonts?.primary) ||
  "'VT323', 'Press Start 2P', monospace";
const PIXEL_UI_FONT_FAMILY =
  (typeof window !== "undefined" && window.UIStyles?.fonts?.pixel) ||
  "'VT323', 'Press Start 2P', monospace";
const PIXEL_FONT_SIZE_MULTIPLIER = 1.4;
if (typeof window !== "undefined") {
  window.__battlechurchPixelFontSizeMultiplier = PIXEL_FONT_SIZE_MULTIPLIER;
}
if (typeof document !== "undefined" && document.fonts?.load) {
  document.fonts.load(`16px ${PIXEL_UI_FONT_FAMILY}`).catch(() => {});
}
if (
  typeof window !== "undefined" &&
  typeof CanvasRenderingContext2D !== "undefined" &&
  !window.__battlechurchPixelFontScalePatched
) {
  const fontDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "font");
  const nativeGet = fontDesc && typeof fontDesc.get === "function" ? fontDesc.get : null;
  const nativeSet = fontDesc && typeof fontDesc.set === "function" ? fontDesc.set : null;
  if (nativeGet && nativeSet) {
    const scalePixelFontDeclaration = (fontValue) => {
      if (typeof fontValue !== "string") return fontValue;
      const hasPixelFamily =
        fontValue.includes("VT323") || fontValue.includes("Press Start 2P");
      if (!hasPixelFamily) return fontValue;
      return fontValue.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => {
        const scaled = Math.max(1, Number(n) * PIXEL_FONT_SIZE_MULTIPLIER);
        const rounded = Math.round(scaled * 100) / 100;
        return `${rounded}px`;
      });
    };
    Object.defineProperty(CanvasRenderingContext2D.prototype, "font", {
      configurable: true,
      enumerable: true,
      get() {
        return nativeGet.call(this);
      },
      set(value) {
        if (this && this.__battlechurchSkipPixelFontScale === true) {
          nativeSet.call(this, value);
          return;
        }
        nativeSet.call(this, scalePixelFontDeclaration(value));
      },
    });
    window.__battlechurchPixelFontScalePatched = true;
  }
}

// Debug overlay toggle (DEV-ONLY)
const DEBUG = true;
let debugOverlayVisible = false;
let debugOverlayData = null;
let debugOverlayTimer = null;
let debugOverlayUpdateAccumulator = 0;
const DEBUG_OVERLAY_UPDATE_INTERVAL = 0.25; // Update 4 times per second

// Audio creation counter (DEV-ONLY) - tracks ALL Audio objects created
let audioCreatedTotal = 0;
if (DEBUG && typeof window !== "undefined" && typeof window.Audio !== "undefined") {
  const OriginalAudio = window.Audio;
  window.Audio = function(...args) {
    audioCreatedTotal++;
    return new OriginalAudio(...args);
  };
  // Preserve prototype chain
  window.Audio.prototype = OriginalAudio.prototype;
}

const BASE_ASPECT_RATIO = CANVAS_BASE_WIDTH / CANVAS_BASE_HEIGHT;
const TARGET_ASPECT_RATIO = (typeof window !== 'undefined' && window.__BATTLECHURCH_ASPECT_RATIO !== undefined)
  ? Number(window.__BATTLECHURCH_ASPECT_RATIO) || BASE_ASPECT_RATIO
  : BASE_ASPECT_RATIO;
const MOBILE_MAX_DIMENSION = 900;
const SLAB_ASPECT_MIN = 1.9;
const SQUARE_ASPECT_MAX = 1.4;
const ROTATE_ASPECT_MAX = 0.8;
const ROTATE_ROW_HEIGHT = 40;
const ASSET_CACHE_BUSTER = (typeof window !== 'undefined' && window.__BATTLECHURCH_ASSET_VERSION !== undefined)
  ? String(window.__BATTLECHURCH_ASSET_VERSION)
  : '2025-10-30a';
const MAGIC_SPLASH_RADIUS = projectileSettings.magicSplashRadius ?? 180 * WORLD_SCALE;
const MAGIC_SPLASH_DAMAGE_MULTIPLIER =
  projectileSettings.magicSplashDamageMultiplier ?? 1;
const FAITH_CANNON_SPLASH_RADIUS =
  projectileSettings.faithCannonSplashRadius ?? 120 * WORLD_SCALE;
const FAITH_CANNON_SPLASH_DAMAGE_MULTIPLIER =
  projectileSettings.faithCannonSplashDamageMultiplier ?? 1.0;
const FAITH_CANNON_PROJECTILE_RANGE =
  projectileSettings.faithCannonProjectileRange ?? 660 * WORLD_SCALE;
const FAITH_CANNON_PROJECTILE_COOLDOWN =
  projectileSettings.faithCannonCooldown ?? 0.22;
const SPAWN_CAMERA_SHAKE_DURATION =
  projectileSettings.spawnCameraShakeDuration ?? 0.24;
const SPAWN_CAMERA_SHAKE_MAGNITUDE =
  projectileSettings.spawnCameraShakeMagnitude ?? 10;
// Prayer Bomb constants (tunable via GameBalance.prayerBomb.*)
const PRAYER_BOMB_RADIUS = _gb('prayerBomb.radius', 520) * WORLD_SCALE;
const PRAYER_BOMB_DAMAGE_MULTIPLIER = _gb('prayerBomb.damageMultiplier', 12.0);
const PRAYER_BOMB_CHARGE_REQUIRED = _gb('prayerBomb.chargeRequired', 60000);
const PRAYER_BOMB_LEVEL1_THRESHOLD = _gb('prayerBomb.level1Threshold', 2 / 6);
const PRAYER_BOMB_LEVEL2_THRESHOLD = _gb('prayerBomb.level2Threshold', 4 / 6);
const PRAYER_BOMB_LEVEL3_THRESHOLD = _gb('prayerBomb.level3Threshold', 1.0);
const PRAYER_BOMB_LEVEL1_DAMAGE = _gb('prayerBomb.level1Damage', 250);
const PRAYER_BOMB_LEVEL2_DAMAGE = _gb('prayerBomb.level2Damage', 100);
const PRAYER_BOMB_LEVEL3_DAMAGE = _gb('prayerBomb.level3Damage', 250);
const PRAYER_BOMB_LEVEL1_BOSS_DAMAGE = _gb('prayerBomb.level1BossDamage', 1000);
const PRAYER_BOMB_LEVEL2_BOSS_DAMAGE = _gb('prayerBomb.level2BossDamage', 1000);
const PRAYER_BOMB_LEVEL2_RADIUS = Math.max(0, Math.hypot(CANVAS_BASE_WIDTH, CANVAS_BASE_HEIGHT));
const PRAYER_BOMB_RAIN_DURATION = _gb('prayerBomb.rainDuration', 7);
const PRAYER_BOMB_RAIN_INTERVAL = _gb('prayerBomb.rainInterval', 0.12);
const PRAYER_BOMB_RAIN_RADIUS = _gb('prayerBomb.rainRadius', 160) * WORLD_SCALE;
const PRAYER_BOMB_BOSS_DAMAGE_SCALE = _gb('prayerBomb.bossDamageScale', 0.5);
const PRAYER_BOMB_SCREEN_DARKEN_ALPHA = _gb('prayerBomb.screenDarkenAlpha', 0.38);
const PRAYER_BOMB_RAIN_DARKEN_DURATION = _gb('prayerBomb.rainDarkenDuration', 0.5);
const PRAYER_BOMB_RAIN_SHAKE_DURATION = _gb('prayerBomb.rainShakeDuration', 0.24);
const PRAYER_BOMB_RAIN_SHAKE_MAGNITUDE = _gb('prayerBomb.rainShakeMagnitude', 22);
const PRAYER_STORM_GROUND_FIRE_TARGET_MIN = Math.max(
  1,
  Math.floor(_gb('prayerBomb.groundFireTargetMin', 16)),
);
const PRAYER_STORM_GROUND_FIRE_TARGET_MAX = Math.max(
  PRAYER_STORM_GROUND_FIRE_TARGET_MIN,
  Math.floor(_gb('prayerBomb.groundFireTargetMax', 20)),
);
const PRAYER_STORM_GROUND_FIRE_DAMAGE = _gb('prayerBomb.groundFireDamage', 10);
const PRAYER_STORM_GROUND_FIRE_BOSS_DAMAGE = _gb('prayerBomb.groundFireBossDamage', 10);
const PRAYER_STORM_GROUND_FIRE_HIT_COOLDOWN = _gb('prayerBomb.groundFireHitCooldown', 0.5);
const PRAYER_STORM_GROUND_FIRE_DURATION = _gb('prayerBomb.groundFireDuration', 14);
const PRAYER_STORM_GROUND_FIRE_FADE_DURATION = _gb('prayerBomb.groundFireFadeDuration', 1.2);
const PRAYER_STORM_GROUND_FIRE_RADIUS = _gb('prayerBomb.groundFireRadius', 42) * WORLD_SCALE;
const PRAYER_STORM_GROUND_FIRE_SCALE = _gb('prayerBomb.groundFireScale', 2.6) * WORLD_SCALE;
const PRAYER_STORM_GROUND_FIRE_FRAME_DURATION = _gb('prayerBomb.groundFireFrameDuration', 0.07);
const PRAYER_STORM_GROUND_FIRE_SHEETS = [
  "assets/sprites/items/fire/Group 4 - 1.png",
  "assets/sprites/items/fire/Group 4 - 2.png",
  "assets/sprites/items/fire/Group 4 - 3.png",
  "assets/sprites/items/fire/Group 4 - 4.png",
  "assets/sprites/items/fire/Group 4 - 5.png",
  "assets/sprites/items/fire/Group 5 - 1.png",
  "assets/sprites/items/fire/Group 5 - 2.png",
  "assets/sprites/items/fire/Group 5 - 3.png",
];
const CONGREGATION_COMMAND_CHARGE_TIME = _gb('congregationCommand.chargeTime', 7);
const CONGREGATION_COMMAND_DAMAGE = _gb('congregationCommand.damage', 30);
const CONGREGATION_COMMAND_SPEED_MULTIPLIER = _gb('congregationCommand.speedMultiplier', 1.1);
const CONGREGATION_COMMAND_SCALE = _gb('congregationCommand.scale', 1.15);
const CONGREGATION_COMMAND_VISUAL_SCALE_MULTIPLIER = _gb('congregationCommand.visualScaleMultiplier', 2.0);
const CONGREGATION_COMMAND_RADIUS_MULTIPLIER = _gb('congregationCommand.radiusMultiplier', 3.4);
const CONGREGATION_COMMAND_STAGGER = _gb('congregationCommand.stagger', 0.14);
const CONGREGATION_COMMAND_SHAKE_DURATION = _gb('congregationCommand.shakeDuration', 0.12);
const CONGREGATION_COMMAND_SHAKE_MAGNITUDE = _gb('congregationCommand.shakeMagnitude', 8);
if (typeof window !== "undefined") {
  window.PRAYER_BOMB_RAIN_DURATION = PRAYER_BOMB_RAIN_DURATION;
}
const PRAYER_BOMB_HOLD_TIME = 1.0;
const HIT_FREEZE_DURATION = 0.08;
const CAMERA_SHAKE_DURATION = 0.3;
const CAMERA_SHAKE_INTENSITY = 18;
const WISDOM_HIT_SHAKE_DURATION = 0.2;
const WISDOM_HIT_SHAKE_MAGNITUDE = CAMERA_SHAKE_INTENSITY * 0.6;
const FAITH_HIT_SHAKE_DURATION = 0.16;
const FAITH_HIT_SHAKE_MAGNITUDE = CAMERA_SHAKE_INTENSITY * 0.36;
const FAITH_WEAPON_HIT_SHAKE_MAGNITUDE = FAITH_HIT_SHAKE_MAGNITUDE * 0.82;
const SCRIPTURE_HIT_SHAKE_DURATION = 0.16;
const SCRIPTURE_HIT_SHAKE_MAGNITUDE = CAMERA_SHAKE_INTENSITY * 0.52;
const SCRIPTURE_HIT_BURST_WINDOW_MS = 160;
const SCRIPTURE_HIT_BURST_MAX_SFX = 20;
let scriptureHitBurstStartedAt = 0;
let scriptureHitBurstSfxCount = 0;
const DAMAGE_FLASH_DURATION = 0.6;
const DAMAGE_FLASH_INTENSITY = 1.35;
const SHIELD_SMALL_DAMAGE = 999;
const SHIELD_LARGE_DAMAGE = 220;
const SHIELD_LARGE_COOLDOWN = 0.25;
const SHIELD_LARGE_RADIUS_THRESHOLD = 42 * WORLD_SCALE;
const HERO_SPEECH_BUBBLE_PADDING = 10;
const HERO_BASE_HEARTS = 6;
const HERO_MAX_HEALTH = 100;
const HERO_HEALTH_PER_HEART = HERO_MAX_HEALTH / HERO_BASE_HEARTS;
const LOG_NPC_FAITH_BAR = false;
const ENEMY_SHADOW_CRUSH = Math.max(
  0,
  Math.min(1, Number(_gb("enemyRenderStyle.shadowCrush", 0)) || 0),
);
const ENEMY_SHADOW_THRESHOLD = Math.max(
  0.02,
  Math.min(1, Number(_gb("enemyRenderStyle.shadowThreshold", 0.72)) || 0.72),
);
const MASTER_SHADOW_CRUSH = Math.max(
  0,
  Math.min(1, Number(_gb("masterRenderStyle.shadowCrush", 0)) || 0),
);
const MASTER_SHADOW_THRESHOLD = Math.max(
  0.02,
  Math.min(1, Number(_gb("masterRenderStyle.shadowThreshold", 0.72)) || 0.72),
);
const MASTER_ASSET_SHADOW_STYLE = Object.freeze({
  shadowCrush: MASTER_SHADOW_CRUSH,
  shadowThreshold: MASTER_SHADOW_THRESHOLD,
});
const AMBIENT_SMOKE_CONFIG = Object.freeze({
  enabled: Boolean(_gb("ambientSmoke.enabled", true)),
  maxPuffs: Math.max(0, Math.min(96, Number(_gb("ambientSmoke.maxPuffs", 16)) || 16)),
  spawnPerSecond: Math.max(0, Number(_gb("ambientSmoke.spawnPerSecond", 6.5)) || 6.5),
  minSize: Math.max(4, Number(_gb("ambientSmoke.minSize", 26)) || 26),
  maxSize: Math.max(6, Number(_gb("ambientSmoke.maxSize", 78)) || 78),
  minLife: Math.max(0.2, Number(_gb("ambientSmoke.minLife", 2.8)) || 2.8),
  maxLife: Math.max(0.3, Number(_gb("ambientSmoke.maxLife", 6.2)) || 6.2),
  riseSpeedMin: Math.max(0, Number(_gb("ambientSmoke.riseSpeedMin", 8)) || 8),
  riseSpeedMax: Math.max(0, Number(_gb("ambientSmoke.riseSpeedMax", 26)) || 26),
  driftSpeedMin: Math.max(0, Number(_gb("ambientSmoke.driftSpeedMin", 4)) || 4),
  driftSpeedMax: Math.max(0, Number(_gb("ambientSmoke.driftSpeedMax", 18)) || 18),
  baseAlpha: Math.max(0, Math.min(1, Number(_gb("ambientSmoke.baseAlpha", 0.15)) || 0.15)),
  sideWeight: Math.max(0, Math.min(1, Number(_gb("ambientSmoke.sideWeight", 0.42)) || 0.42)),
  bottomBandRatio: Math.max(0.03, Math.min(0.6, Number(_gb("ambientSmoke.bottomBandRatio", 0.22)) || 0.22)),
  sideBandRatio: Math.max(0.02, Math.min(0.5, Number(_gb("ambientSmoke.sideBandRatio", 0.16)) || 0.16)),
  tint: String(_gb("ambientSmoke.tint", "#D44E52") || "#D44E52"),
  debugVisible: Boolean(_gb("ambientSmoke.debugVisible", false)),
  wave3StageMultiplier: Math.max(0.1, Number(_gb("ambientSmoke.wave3StageMultiplier", 1.35)) || 1.35),
  bossStageMultiplier: Math.max(0.1, Number(_gb("ambientSmoke.bossStageMultiplier", 1.8)) || 1.8),
});
const WAVE_SMOKE_TUNING = Object.freeze({
  baseParticleCount: Math.max(40, Math.round(Number(_gb("ambientSmoke.baseParticleCount", 150)) || 150)),
  wave3ParticleCount: Math.max(80, Math.round(Number(_gb("ambientSmoke.wave3ParticleCount", 290)) || 290)),
  bossParticleCount: Math.max(40, Math.round(Number(_gb("ambientSmoke.bossParticleCount", 190)) || 190)),
  baseEmberRatio: Math.max(0, Math.min(1, Number(_gb("ambientSmoke.baseEmberRatio", 0.72)) || 0.72)),
  wave3EmberRatio: Math.max(0, Math.min(1, Number(_gb("ambientSmoke.wave3EmberRatio", 0.82)) || 0.82)),
  bossEmberRatio: Math.max(0, Math.min(1, Number(_gb("ambientSmoke.bossEmberRatio", 0.9)) || 0.9)),
  baseIntensity: Math.max(0.1, Number(_gb("ambientSmoke.baseIntensity", 1.32)) || 1.32),
  wave3Intensity: Math.max(0.1, Number(_gb("ambientSmoke.wave3Intensity", 2.55)) || 2.55),
  bossIntensity: Math.max(0.1, Number(_gb("ambientSmoke.bossIntensity", 1.72)) || 1.72),
});
const PROJECTILE_CONFIG = projectileSettings.config || {};
const PROJECTILE_PATH =
  projectileSettings.projectilePath || "assets/sprites/projectiles/";
const MAGIC_PACK_ROOT =
  projectileSettings.magicPackRoot || "assets/sprites/projectiles";
const MAGIC_FIREBALL_SPRITE_PATH = `${MAGIC_PACK_ROOT}/fireball`;
const MAGIC_FLASH_SPRITE_PATH = `${MAGIC_PACK_ROOT}/flash`;
const POWERUP_PLAYFIELD_MARGIN = 140;
const CONRAD_UTILITY_POWERUP_MAX_HEIGHT = 48 * WORLD_SCALE;
function resizeCanvas() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportMin = Math.min(viewportWidth, viewportHeight);
  const viewportAspect = viewportWidth / Math.max(1, viewportHeight);
  const isMobile = viewportMin <= MOBILE_MAX_DIMENSION;
  const isRotateWarning = isMobile && viewportAspect < ROTATE_ASPECT_MAX;
  const layoutWidth = viewportWidth;
  const layoutHeight = viewportHeight;
  const layoutAspect = viewportAspect;
  const isSlabLayout = isMobile && layoutAspect >= SLAB_ASPECT_MIN;
  const isSquareLayout = isMobile && layoutAspect <= SQUARE_ASPECT_MAX;
  const scaleWidth = layoutWidth / CANVAS_BASE_WIDTH;
  const scaleHeight = layoutHeight / CANVAS_BASE_HEIGHT;
  const scale = isSquareLayout || isRotateWarning ? scaleWidth : Math.min(scaleWidth, scaleHeight);
  canvasScale = Math.max(0.1, scale);

  canvas.width = CANVAS_BASE_WIDTH;
  canvas.height = CANVAS_BASE_HEIGHT;
  const cssWidth = Math.round(CANVAS_BASE_WIDTH * canvasScale);
  const cssHeight = Math.round(CANVAS_BASE_HEIGHT * canvasScale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  if (gameWrapper) {
    gameWrapper.style.width = `${cssWidth}px`;
    gameWrapper.style.height = `${cssHeight}px`;
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    const gameLeft = Math.floor((layoutWidth - cssWidth) / 2);
    const gameTop = (isSquareLayout || isRotateWarning) ? 0 : Math.floor((layoutHeight - cssHeight) / 2);
    const gutterWidth = Math.max(0, gameLeft);
    const gutterHeight = Math.max(0, Math.floor((layoutHeight - cssHeight) / 2));
    const rotateRowHeight = isRotateWarning ? ROTATE_ROW_HEIGHT : 0;
    const controlsHeight = Math.max(0, layoutHeight - cssHeight - rotateRowHeight);

    document.documentElement.style.setProperty('--viewport-width', `${viewportWidth}px`);
    document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
    document.documentElement.style.setProperty('--layout-width', `${layoutWidth}px`);
    document.documentElement.style.setProperty('--layout-height', `${layoutHeight}px`);
    document.documentElement.style.setProperty('--game-width', `${cssWidth}px`);
    document.documentElement.style.setProperty('--game-height', `${cssHeight}px`);
    document.documentElement.style.setProperty('--game-left', `${gameLeft}px`);
    document.documentElement.style.setProperty('--game-top', `${gameTop}px`);
    document.documentElement.style.setProperty('--gutter-width', `${gutterWidth}px`);
    document.documentElement.style.setProperty('--gutter-height', `${gutterHeight}px`);
    document.documentElement.style.setProperty('--controls-height', `${controlsHeight}px`);
    document.documentElement.style.setProperty('--rotate-row-height', `${rotateRowHeight}px`);

    if (document.body) {
      document.body.classList.toggle('layout-mobile', isMobile);
      document.body.classList.toggle('layout-slab', isSlabLayout);
      document.body.classList.toggle('layout-square', isSquareLayout);
      document.body.classList.toggle('layout-rotate-warning', isRotateWarning);
    }
  }
  if (typeof window !== 'undefined') {
    window.__BATTLECHURCH_LAYOUT = {
      rotated: false,
      layoutWidth,
      layoutHeight,
      gameLeft: Math.floor((layoutWidth - cssWidth) / 2),
      gameTop: (isSquareLayout || isRotateWarning) ? 0 : Math.floor((layoutHeight - cssHeight) / 2),
      gameWidth: cssWidth,
      gameHeight: cssHeight,
    };
  }

  if (!pointerState.active) {
    pointerState.x = CANVAS_BASE_WIDTH / 2;
    pointerState.y = CANVAS_BASE_HEIGHT / 2;
  }

  if (typeof window !== "undefined" && window.AshOverlay) {
    if (!ashOverlay) {
      ashOverlay = new window.AshOverlay(canvas.width, canvas.height);
      fireOverlay = new window.AshOverlay(canvas.width, canvas.height, 300);
      fireOverlay.setEmbersOnly(true);
      fireOverlay.setEmberRatio(1);
      fireOverlay.setIntensity(1);
      window.fireOverlay = fireOverlay;
    } else {
      ashOverlay.resize(canvas.width, canvas.height);
      if (fireOverlay) {
        fireOverlay.resize(canvas.width, canvas.height);
      }
    }
  }

  positionObstacles();
  if (player) {
    resolveEntityObstacles(player);
    player.clampToBounds();
  }
  enemies.forEach((enemy) => {
    if (enemy?.spawnOffscreenTimer > 0) return;
    resolveEntityObstacles(enemy);
    clampEntityToBounds(enemy);
  });
  weaponPickups.forEach((pickup) => {
    resolveEntityObstacles(pickup);
    clampEntityToBounds(pickup);
  });
  Input.updateTouchLayout();
}

let gameStarted = false;
let pauseDialogActive = false;
let pauseRestartConfirmActive = false;
let mapActive = false;
let activeDistrictId = null;
let activeCampaign = "p1"; // 'p1' | 'p2' | 'p3'
let activeCampaignMultiplier = 1.0; // 1.0 | 1.15 | 1.1
let cloudInitAttempted = false;
let pendingBattlefieldStartOverride = null; // { districtId, localBattlefieldNumber }
let pendingDevCampaignDataOverride = null; // { districtId, campaignData }
let devPlaytestLaunchInProgress = false;
let devPlaytestSession = {
  active: false,
  scope: null, // { town, battlefield }
};
let devPlaytestQuickActionsEl = null;
// Tutorial arena + dev melee arena code lives in tutorial_arena.js (loaded just before this file).

function setDevPlaytestSession(active, scope = null) {
  const normalizedScope =
    scope && typeof scope === "object"
      ? {
          town: Math.max(1, Math.floor(Number(scope.town) || 1)),
          battlefield: Math.max(1, Math.floor(Number(scope.battlefield || scope.mission) || 1)),
        }
      : null;
  devPlaytestSession = {
    active: Boolean(active),
    scope: normalizedScope,
  };
  if (typeof window !== "undefined") {
    window.__battlechurchDevPlaytestSession = {
      active: devPlaytestSession.active,
      scope: devPlaytestSession.scope ? { ...devPlaytestSession.scope } : null,
    };
  }
}

function getDevPlaytestScopeLabel() {
  const scope = devPlaytestSession.scope;
  if (!scope) return "Playtest";
  return `T${scope.town} BF${scope.battlefield}`;
}

function ensureDevPlaytestQuickActions() {
  if (typeof document === "undefined") return null;
  if (devPlaytestQuickActionsEl && document.body.contains(devPlaytestQuickActionsEl)) {
    return devPlaytestQuickActionsEl;
  }
  const root = document.createElement("div");
  root.className = "dev-playtest-quick-actions";
  root.setAttribute("aria-label", "Playtest quick actions");
  root.innerHTML = `
    <div class="dev-playtest-quick-actions__label">PLAYTEST</div>
    <button type="button" class="dev-playtest-quick-actions__button" data-action="back">Back to Editor</button>
  `;
  root.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  root.addEventListener("click", (event) => {
    event.stopPropagation();
    const target = event.target?.closest?.("[data-action]");
    if (!target) return;
    const action = String(target.getAttribute("data-action") || "");
    if (action === "back") {
      returnFromDevPlaytestToEditor();
    }
  });
  document.body.appendChild(root);
  devPlaytestQuickActionsEl = root;
  return root;
}

function syncDevPlaytestQuickActions() {
  const root = ensureDevPlaytestQuickActions();
  if (!root) return;
  const scopeLabel = getDevPlaytestScopeLabel();
  const labelEl = root.querySelector(".dev-playtest-quick-actions__label");
  if (labelEl) {
    labelEl.textContent = `PLAYTEST ${scopeLabel}`;
  }
  const builderVisible = Boolean(window.BattlechurchLevelBuilder?.isVisible?.());
  const shouldShow =
    devPlaytestSession.active &&
    !builderVisible &&
    !titleScreenActive &&
    !mapActive &&
    !gameOver &&
    !epilogueActive &&
    !districtVictoryActive &&
    !window.DialogOverlay?.isVisible?.() &&
    !window.UpgradeScreen?.isVisible?.() &&
    !PastorUpgradeScreen.isVisible();
  root.style.display = shouldShow ? "flex" : "none";
  root.setAttribute("data-scope", scopeLabel);
}

function returnFromDevPlaytestToEditor() {
  if (!devPlaytestSession.active) return false;
  const scope = devPlaytestSession.scope
    ? { ...devPlaytestSession.scope }
    : { town: 1, battlefield: 1 };
  try {
    if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  } catch (e) {}
  pendingDistrictIntroStart = false;
  suppressInitialAnnouncements = false;
  pendingBattlefieldStartOverride = null;
  pendingDevCampaignDataOverride = null;
  pendingBossIntroAfterExterior = false;
  pendingExteriorShotAfterVisitor = false;
  paused = true;
  gameStarted = false;
  mapActive = false;
  titleScreenActive = false;
  gameOver = false;
  postDeathSequenceActive = false;
  postDeathAnimLeadActive = false;
  postDeathAnimLeadTimer = 0;
  if (typeof stopBattleMusicFast === "function") {
    stopBattleMusicFast();
  }
  if (window.DialogOverlay?.isVisible?.()) {
    window.DialogOverlay.hide();
  }
  if (window.MapScreen?.close) {
    window.MapScreen.close();
  }
  if (window.UpgradeScreen?.isVisible?.()) {
    window.UpgradeScreen.hide();
  }
  if (levelManager?.reset) {
    levelManager.reset();
  }
  if (window.BattlechurchLevelBuilder?.showAtScope) {
    window.BattlechurchLevelBuilder.showAtScope(scope);
  } else {
    window.BattlechurchLevelBuilder?.show?.();
    if (window.BattlechurchLevelBuilder?.setScope) {
      window.BattlechurchLevelBuilder.setScope(scope);
    }
  }
  setDevStatus(`Back to editor — Town ${scope.town} Battlefield ${scope.battlefield}`, 2.8);
  syncDevPlaytestQuickActions();
  return true;
}

function tryBootstrapCloud() {
  if (cloudInitAttempted) return;
  if (!window.Cloud?.initCloud) {
    setTimeout(tryBootstrapCloud, 250);
    return;
  }
  cloudInitAttempted = true;
  window.Cloud.initCloud().catch(() => {});
}

Input.initialize({
  canvas,
  touchControlsRoot,
  moveStickBase,
  aimStickBase,
  virtualSpaceButton,
  arcControl,
  onAnyKeyDown: (key) => {
    const modifiers = typeof Input !== "undefined" ? Input.modifiers : null;
    const devCombo = Boolean(modifiers && modifiers.shift);
    if (key === "m" && DEBUG && devCombo) {
      toggleDebugOverlay();
      return;
    }
    if (key === "g" && devCombo) {
      addGrace(500);
      setDevStatus("Dev: +500 grace");
    }
    if (key === "h" && titleScreenActive && !titleUtilityPanelMode) {
      const editor = window.BattlechurchHitboxEditor;
      const next = typeof editor?.toggle === "function" ? editor.toggle() : false;
      if (next && window.DialogOverlay?.isVisible?.()) {
        window.DialogOverlay.hide();
      }
      return;
    }
    const hitboxEditorActive = Boolean(window.__battlechurchHitboxEditorActive);
    if (hitboxEditorActive) return;
    if (!gameStarted && !paused) gameStarted = true;
  },
  shouldUpdatePointer: () => Boolean(player),
});

const pointerState = Input.pointerState;
const aimState = Input.aimState;
const virtualInput = Input.virtualInput;
const keysJustPressed = Input.keysJustPressed;
const keysPressed = Input.keysPressed;
let announcementNavHoldDir = null;
let announcementNavNextTime = 0;
window.consumePauseAction = () => {
  keysJustPressed.delete("pause");
  keysJustPressed.delete("restart");
};
window.isMissionBriefOverlayActive = false;
window.isPauseOverlayActive = false;
window.MovesList = { isOpen: false };
window.gameOverReady = false;
window.gameOverReady = false;
window.postDeathSequenceActive = false;
if (typeof window !== "undefined") {
  window.BattlechurchHitboxDebug = window.BattlechurchHitboxDebug || {
    playerMelee: false,
    npcs: false,
    enemies: false,
    projectiles: false,
  };
  if (typeof window.BattlechurchShowAttackHitboxes !== "boolean") {
    window.BattlechurchShowAttackHitboxes = Boolean(window.BattlechurchHitboxDebug.enemies);
  }
}
const isActionActive = Input.isActionActive;
const wasActionJustPressed = Input.wasActionJustPressed;
const consumePrayerBombClick = Input.consumePrayerBombClick;
const consumeCongregationClick = Input.consumeCongregationClick;
const cancelCongregationTap = Input.cancelCongregationTap;
const AC_SUPER_PRAYER_BOMB_BLOCK_TIME = 0.3;

function isPrayerBombInputSuppressed() {
  const meleeState = window._meleeAttackState;
  if (!meleeState) return false;
  // Letting go of charged C while A or B is also fully charged is part of a
  // two-button charge move, not Purify.
  const aFullyCharged =
    meleeState.buttonDown && meleeState.isCharging &&
    (meleeState.chargeTimer || 0) >= (meleeState.holdTime || Infinity);
  const bFullyCharged =
    meleeState.spinButtonDown && meleeState.spinCharging &&
    (meleeState.spinChargeTimer || 0) >= (meleeState.spinHoldTime || Infinity);
  return Boolean(
    meleeState.acSuperArmed ||
    meleeState.cConsumedByCombo ||
    aFullyCharged ||
    bFullyCharged ||
    (meleeState.acSuperPrayerBombBlockTimer || 0) > 0,
  );
}

// Charged C used as part of a combo (Trash, Hedge): letting go of C must
// only finish that combo, never also cast Purify or Unity Strike. Purify is
// Charged C on its own.
function markChargedCConsumedByCombo(meleeAttackState) {
  // Marked even if C was let go in the same instant as the other button
  // (lifting one finger off a slide releases both together).
  if (!meleeAttackState) return;
  meleeAttackState.cConsumedByCombo = true;
  meleeAttackState.cConsumedReleasedAt = 0;
  if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
  if (typeof cancelCongregationTap === "function") cancelCongregationTap();
}

// Clear the flag shortly after C is let go (once every release path has
// seen it), and keep any queued Purify / Unity Strike cancelled until then.
function updateChargedCConsumedByCombo(meleeAttackState) {
  if (!meleeAttackState?.cConsumedByCombo) return;
  if (keysPressed.has("ArrowRight")) {
    meleeAttackState.cConsumedReleasedAt = 0;
    return;
  }
  if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
  if (typeof cancelCongregationTap === "function") cancelCongregationTap();
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (!meleeAttackState.cConsumedReleasedAt) {
    meleeAttackState.cConsumedReleasedAt = now;
  } else if (now - meleeAttackState.cConsumedReleasedAt > 300) {
    meleeAttackState.cConsumedByCombo = false;
    meleeAttackState.cConsumedReleasedAt = 0;
  }
}
window.isPrayerBombInputSuppressed = isPrayerBombInputSuppressed;
const aimAssist = {
  target: null,
  vertices: null,
  targetKind: null,
};
const SHOW_ENEMY_SPAWN_DEBUG = false;
const PLAYER_CORNER_CUTOFF_SIDE_INSET = 200;
const PLAYER_CORNER_CUTOFF_DEPTH = 200;
// Congregation-only player walk bounds (top corners cut for perspective background).
// Congregation walk bounds tuning (also shown by debug overlay text):
// sideInset: horizontal cut-in from left/right at the top boundary (current 270px)
const CONGREGATION_PLAYER_CORNER_CUTOFF_SIDE_INSET = 370;
// depth: vertical depth of each diagonal corner cutoff wedge (current 200px)
const CONGREGATION_PLAYER_CORNER_CUTOFF_DEPTH = 500;
// topY: absolute top walkable Y line (current 236px)
const CONGREGATION_PLAYER_TOP_Y = 236;
const SHOW_CONGREGATION_PLAYER_BOUNDS_DEBUG = false

function isCongregationBoundsStage(stage) {
  return stage === "levelIntro" || stage === "congregationToTeaser" || stage === "npcArrival";
}

function toggleHudHitboxDebug(key) {
  if (typeof window === "undefined" || !window.BattlechurchHitboxDebug) return false;
  if (!Object.prototype.hasOwnProperty.call(window.BattlechurchHitboxDebug, key)) return false;
  window.BattlechurchHitboxDebug[key] = !window.BattlechurchHitboxDebug[key];
  window.BattlechurchShowAttackHitboxes = Boolean(window.BattlechurchHitboxDebug.enemies);
  return true;
}
if (typeof window !== "undefined") {
  window.BattlechurchToggleHitboxDebug = toggleHudHitboxDebug;
}

Renderer.initialize({
  get canvas() { return canvas; },
  get ctx() { return ctx; },
  levelAnnouncements,
  weaponPickupAnnouncement,
  HUD_HEIGHT,
  UI_FONT_FAMILY,
  bossHazards,
  get SHOW_ENEMY_SPAWN_DEBUG() { return Boolean(devTools.showSpawnDebug); },
  getEnemySpawnPoints,
  congregationMembers,
  buildCongregationMembers,
  clearCongregationMembers,
  updateCongregationMembers,
  getMonthName,
  getOffscreenNpcInviteName,
  get assets() { return assets; },
  get cameraOffsetX() { return cameraOffsetX; },
  get cameraShakeTimer() { return cameraShakeTimer; },
  CAMERA_SHAKE_DURATION,
  get cameraShakeMagnitude() { return cameraShakeMagnitude; },
  clearCameraShake() { cameraShakeTimer = 0; cameraShakeMagnitude = 0; },
  get titleScreenActive() { return titleScreenActive; },
  get titleDemoSaveMenuActive() { return titleDemoSaveMenuActive; },
  get titleClassMenuActive() { return titleClassMenuActive; },
  get titleUtilityPanelMode() { return titleUtilityPanelMode; },
  get titleEditSaveDraft() { return titleEditSaveDraft; },
  get titleNewSaveDraft() { return titleNewSaveDraft; },
  get titleSelectedClassId() {
    return window.BattlechurchClasses?.getActiveId?.() || null;
  },
  get titleDemoSaveSlots() { return TITLE_DEMO_SAVE_SLOTS; },
  get titleCloudSaveLoading() { return titleCloudSaveLoading; },
  get titleCloudSaveRows() { return titleCloudSaveRows; },
  get titleCloudActiveSaveId() { return titleCloudActiveSaveId; },
  get titleCloudSelectedSaveId() { return titleCloudSelectedSaveId; },
  get masterShadowCrushStyle() {
    return {
      shadowCrush: MASTER_SHADOW_CRUSH,
      shadowThreshold: MASTER_SHADOW_THRESHOLD,
    };
  },
  get ambientSmokeConfig() { return AMBIENT_SMOKE_CONFIG; },
  get waveSmokeTuning() { return WAVE_SMOKE_TUNING; },
  get playerCornerCutoffSideInset() { return PLAYER_CORNER_CUTOFF_SIDE_INSET; },
  get playerCornerCutoffDepth() { return PLAYER_CORNER_CUTOFF_DEPTH; },
  get congregationPlayerCornerCutoffSideInset() { return CONGREGATION_PLAYER_CORNER_CUTOFF_SIDE_INSET; },
  get congregationPlayerCornerCutoffDepth() { return CONGREGATION_PLAYER_CORNER_CUTOFF_DEPTH; },
  get congregationPlayerTopY() { return CONGREGATION_PLAYER_TOP_Y; },
  get showCongregationPlayerBoundsDebug() { return SHOW_CONGREGATION_PLAYER_BOUNDS_DEBUG; },
  get mapActive() { return mapActive; },
  get assetsLoaded() { return assetsLoaded; },
  get mapReady() { return mapReady; },
  get loadingProgress() { return loadingProgress; },
  get levelManager() { return levelManager; },
  get pendingBossIntroAfterExterior() { return pendingBossIntroAfterExterior; },
  get gameOver() { return gameOver; },
  obstacles,
  npcs,
  utilityPowerUps,
  weaponPickups,
  churchPowerupPickups,
  pastorPowerupPickups,
  gracePickups,
  enemies,
  get activeBoss() { return activeBoss; },
  projectiles,
  get visitorSession() { return visitorSession; },
  get player() { return player; },
  getCongregationSize,
  initialCongregationSize: INITIAL_CONGREGATION_SIZE,
  get cannonSplashRadius() { return FAITH_CANNON_SPLASH_RADIUS; },
  effects,
  ringOfFireHazards,
  prayerStormGroundFires,
  floatingTexts,
  pointerState,
  get paused() { return paused; },
  getStartCountdownLabel,
  aimState,
  aimAssist,
  get graceRushState() { return graceRushState; },
  getGraceCount: () => getGraceCount(),
  WORLD_SCALE,
  get MELEE_SWING_RANGE() { return MELEE_SWING_RANGE; },
  get MELEE_CLOSE_RANGE() { return MELEE_CLOSE_RANGE; },
  get RUSH_DISTANCE() { return RUSH_DISTANCE; },
  get DASH_COOLDOWN() { return DASH_COOLDOWN; },
  get playerDashState() { return playerDashState; },
  get damageHitFlash() { return damageHitFlash; },
  get npcWeaponState() { return npcWeaponState; },
  get npcHarmonyBuffTimer() { return npcHarmonyBuffTimer; },
  get npcHarmonyBuffDuration() { return npcHarmonyBuffDuration; },
  get powerupIconStyles() { return POWERUP_ICON_STYLES; },
  get pastorPowerupLevels() { return pastorPowerupLevels; },
  get pastorDashBuffTimer() { return pastorDashBuffTimer; },
  get PASTOR_POWERUP_DEFS() { return PASTOR_POWERUP_DEFS; },
  get PASTOR_POWERUP_MAX_LEVEL() { return PASTOR_POWERUP_MAX_LEVEL; },
  get graceHudFlyEffects() { return graceHudFlyEffects; },
  get powerupHudFlyEffects() { return powerupHudFlyEffects; },
  get graceSpendFlyEffects() { return graceSpendFlyEffects; },
  get maxChainThisTown() { return maxChainThisTown; },
  get haloBladeState() { return haloBladeState; },
  get haloBladeStateSecondary() { return haloBladeStateSecondary; },
  get haloBladeStateBonus() { return haloBladeStateBonus; },
  get shieldTrailStateA() { return shieldTrailStateA; },
  get shieldTrailStateB() { return shieldTrailStateB; },
  get spearState() { return spearState; },
  get spearStateSecondary() { return spearStateSecondary; },
  get spearStateBonus() { return spearStateBonus; },
  get sentryState() { return sentryState; },
  get sentryStateSecondary() { return sentryStateSecondary; },
  get sentryStateBonus() { return sentryStateBonus; },
  formatNumberWithCommas,
  updatePlayerDuringCongregation,
  resolveCongregationCollisions,
  get touchControlsVisible() { return Boolean(Input?.virtualInput?.enabled); },
  get touchControlsAvailable() { return Boolean(touchControlsRoot); },
  get bossLightningFlashAlpha() { return bossLightningFlashAlpha; },
  get postDeathSequenceActive() { return postDeathSequenceActive; },
  get heroLives() { return heroLives; },
  get hpFlashTimer() { return hpFlashTimer; },
  get gameStarted() { return gameStarted; },
  get epilogueActive() { return epilogueActive; },
  get epilogueTitle() { return epilogueTitle; },
  get epilogueText() { return epilogueText; },
  get epilogueBackgroundKey() { return epilogueBackgroundKey; },
  get epilogueScroll() { return epilogueScroll; },
  get creditsContent() { return CREDITS_CONTENT; },
  get districtVictoryActive() { return districtVictoryActive; },
  get districtVictoryName() { return districtVictoryName; },
  get districtVictoryScore() { return districtVictoryScore; },
  get districtVictoryCampaign() { return districtVictoryCampaign; },
  get districtVictoryScroll() { return districtVictoryScroll; },
  get ashOverlay() { return ashOverlay; },
  get fireOverlay() { return fireOverlay; },
  get congregationOverlay() { return congregationOverlay; },
  get speedrunTimer() { return speedrunTimer; },
  get pauseRestartConfirmActive() { return pauseRestartConfirmActive; },
  get isModalActive() { return isAnyDialogActive(); },
  get arenaFadeAlpha() { return arenaFadeAlpha; },
  get battlefieldIntroFadeAlpha() { return battlefieldIntroFadeAlpha; },
  get battlefieldIntroActive() { return battlefieldIntroActive; },
  get battlefieldIntroNumber() { return battlefieldIntroNumber; },
  get battlefieldIntroImage() { return battlefieldIntroImage; },
  get graceRushFadeAlpha() { return graceRushFadeAlpha; },
  get graceRushBlackout() { return graceRushBlackout; },
  get bossBonusTransitionFadeAlpha() { return bossBonusTransitionFadeAlpha; },
  get recapIntroFadeAlpha() { return recapIntroFadeAlpha; },
  get playerDeathFadeAlpha() { return playerDeathFadeAlpha; },
  get prayerBombScreenFadeTimer() { return prayerBombScreenFadeTimer; },
  get prayerBombScreenFadeDuration() { return prayerBombScreenFadeDuration; },
  get prayerBombScreenDarkenAlpha() { return PRAYER_BOMB_SCREEN_DARKEN_ALPHA; },
  get prayerBombComboActive() { return Boolean(prayerBombComboState.active); },
  get smiteBombFlashTimer() { return smiteBombFlashTimer; },
  get smiteBombFlashDuration() { return SMITE_BOMB_FLASH_DURATION; },
  get RUSH_RADIUS() { return RUSH_RADIUS; },
  get meleeAttackState() { return window._meleeAttackState; },
  get devTools() { return devTools; },
  getEnemyHitboxRect,
  get districtIntroTransitionActive() { return districtIntroTransitionActive; },
  get districtIntroTransitionTimer() { return districtIntroTransitionTimer; },
  get devMeleeArenaActive() { return isDevMeleeArenaActive(); },
  get pendingDevMeleeArenaLaunch() { return pendingDevMeleeArenaLaunch === true; },
  DISTRICT_INTRO_ZOOM_DURATION,
  DISTRICT_INTRO_FADE_DURATION,
  renderDebugOverlay,
});
function bootInputAndResize() {
  resizeCanvas();
  Input.updateTouchLayout();
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(bootInputAndResize, 0);
  setTimeout(tryBootstrapCloud, 0);
} else {
  window.addEventListener("load", bootInputAndResize);
  window.addEventListener("load", tryBootstrapCloud);
}

window.addEventListener("resize", () => {
  resizeCanvas();
  Input.updateTouchLayout();
}, { passive: true });

if (typeof window !== "undefined") {
  window.startRunForDistrict = startRunForDistrict;
  window.startDevLevelTestFromEditor = startDevLevelTestFromEditor;
  window.exitMapScreen = exitMapScreen;
  window.returnToTitleScreen = restartGame;
  // Expose loading state for MapScreen to check
  Object.defineProperty(window, "gameAssetsLoaded", {
    get: () => assetsLoaded,
    enumerable: true,
  });
  Object.defineProperty(window, "gameLoadingProgress", {
    get: () => loadingProgress,
    enumerable: true,
  });
}

const PLAYER_SPRITE_PATH = "assets/sprites/npcs/mana-seed/";
const BACKGROUND_MID_PATH = "";
const BACKGROUND_FLOOR_PATH = "assets/backgrounds/background-6.png";
const TITLE_BACKGROUND_PATH = "assets/backgrounds/title.png";
const DISTRICT_INTRO_BACKGROUND_PATH = "assets/backgrounds/mission-1.png";
const CHARACTER_ROOT = "assets/sprites/rpg-sprites/Characters(100x100)";
const OBSTACLE_DEFS = {};
const OBSTACLE_LAYOUT = [];
const DIVINE_CHARGE_SPARK_ROOT = "assets/sprites/projectiles/sparks";
const DIVINE_CHARGE_SPARK_COUNT = 16;
const DIVINE_CHARGE_SPARK_FRAME_DURATION = 0.06;
const DIVINE_CHARGE_SPARK_SCALE = 1.5;
const DIVINE_CHARGE_SPARK_OFFSET = 18;
const MELEE_SWOOSH_PATH = "assets/sprites/projectiles/blast/blast.png";
const WISDOM_FRAME_START = 9;
const WISDOM_FRAME_END = 18;
const WISDOM_FRAME_SOURCES = Array.from(
  { length: WISDOM_FRAME_END - WISDOM_FRAME_START + 1 },
  (_, index) => `${MAGIC_FIREBALL_SPRITE_PATH}/fireball${WISDOM_FRAME_START + index}.png`,
); // Wisdom projectile uses frames 9-18 from the fireball sprite sheet.
const DEMON_LORD_FIREBALL_FRAME_FILES = Array.from(
  { length: 10 },
  (_, index) => `${MAGIC_FIREBALL_SPRITE_PATH}/fireball${9 + index}.png`,
);
const WORD_OF_GOD_FRAME_FILES = Array.from(
  { length: 11 },
  (_, index) => `assets/sprites/projectiles/fire4/1_${index}.png`,
);
const FLASH_FRAME_COUNT = 14;
const PROJECTILE_FRAME_DURATIONS = {
  fire: 0.05,
  fireOrb: 0.05,
  wisdom_missle: 0.05,
  faith_cannon: 0.06,
  word_of_god: 0.06,
  divine_shot: 0.05,
};
const ARMORED_PROJECTILE_DEFLECT_DISTANCE = 75 * WORLD_SCALE;
const ARMORED_PROJECTILE_DEFLECT_SPEED_SCALE = 0.45;
const ARMORED_PROJECTILE_DEFLECT_ANGLE = Math.PI * 0.22;
const ARMORED_PROJECTILE_DEFLECT_ANGLE_VARIANCE = Math.PI * 0.08;
const ARMORED_PROJECTILE_DEFLECT_TYPES = new Set(["arrow"]);
const NPC_COZY_ROOT = "assets/sprites/npcs";
const NPC_PIXEL_LINE_ROOT = "assets/sprites/npcs/npcs-pixel-line";
const NPC_WALK_ROOT = `${NPC_COZY_ROOT}/separate/walk`;
const NPC_SHADOW_PATH = `${NPC_COZY_ROOT}/shadow.png`;
const NPC_FRAME_WIDTH = 32;
const NPC_FRAME_HEIGHT = 32;
const NPC_FRAMES_PER_DIRECTION = 8;
const NPC_DIRECTION_ROW_MAP = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};
const NPC_WALK_FRAME_DURATION = 0.1;
const NPC_SCALE = 3.08 * WORLD_SCALE;
const NPC_RADIUS = 28 * WORLD_SCALE;
const NPC_BASE_VARIANT = "char1_walk.png";
const NPC_EYE_LAYER = "eyes_walk.png";
const NPC_SHOES_LAYER = "shoes_walk.png";
const npcVariants =
  (typeof window !== "undefined" && window.BattlechurchNpcVariants) || {};
const NPC_HAIR_VARIANTS = npcVariants.hair || [];
const NPC_CLOTHING_VARIANTS = npcVariants.clothing || [];
const NPC_ACCESSORY_VARIANTS = npcVariants.accessories || [];
const NPC_COZY_WALK_FRAME_COUNT = NPC_FRAMES_PER_DIRECTION;
const NPC_COZY_HURT_ROOT = `${NPC_COZY_ROOT}/separate/hurt`;
const NPC_BASE_HURT_VARIANT = "char1_hurt.png";
const NPC_HURT_FRAME_DURATION = 0.18;
const NPC_PIXEL_FRAME_WIDTH = 34;
const NPC_PIXEL_FRAME_HEIGHT = 36;
const NPC_PIXEL_SWING_ROW_BASE = 9;
const NPC_PIXEL_SWING_FRAME_COUNT = 4;
const NPC_PIXEL_SWING_FRAME_DURATION = 0.095;
const NPC_FIRE_SWING_VISUAL_DURATION =
  NPC_PIXEL_SWING_FRAME_COUNT * NPC_PIXEL_SWING_FRAME_DURATION + 0.02;
const NPC_MAX_FAITH = 100;
const NPC_FAITH_DRAIN_RATE = 14;
const NPC_FAITH_RECOVERY_PER_COIN = 22;
const NPC_FAITH_RETURN_THRESHOLD = NPC_MAX_FAITH * 0.96;
// NPC helper tuning
const NPC_STARTING_FAITH_RATIO = 1; // start NPCs at 100% faith
const NPC_FAITH_PER_ENEMY_KILL = 0; // default faith gained per enemy kill
const NPC_FAITH_KILL_REWARD_EXCLUSIONS = new Set(); // enemy kills that should not reward NPC faith
const NPC_ARROW_COOLDOWN_DEFAULT = 0.8; // faster default seconds between NPC shots
const NPC_ARROW_RANGE_DEFAULT = 520; // maximum range NPC will attempt to shoot
const NPC_ARROW_DAMAGE = 10; // damage dealt by NPC arrows
const NPC_MAX_FAITH_LOSS_PER_ATTACK = 25;
// make faith bars slightly smaller and closer to the NPC for better layout
const NPC_FAITH_BAR_WIDTH = 40;
const NPC_FAITH_BAR_HEIGHT = 8;
const NPC_FAITH_FILL_COLOR = "#5AA6D6";
function resolveSwatchColor(propertyName, fallback) {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  try {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(propertyName);
    return value ? value.trim() : fallback;
  } catch (error) {
    console.warn && console.warn("resolveSwatchColor failed", propertyName, error);
    return fallback;
  }
}
const GRACE_FLOAT_TEXT_COLOR = resolveSwatchColor("--swatch-accent-2", "#94C0D8");
const NPC_FAITH_BORDER_COLOR = resolveSwatchColor("--swatch-light", "rgba(255, 255, 255, 0.25)");
const NPC_HURT_VARIANT_REMAP = {
  overalls: "overall",
  mask_clown_red: "mask_clown",
};
const NPC_HURT_FILENAME_OVERRIDES = {
  "overalls_walk.png": "overall_hurt.png",
  "mask_clown_red_walk.png": "mask_clown_hurt.png",
};
const NPC_DAMAGE_COOLDOWN = 1.5;
const NPC_DAMAGE_COOLDOWN_EXCEPTIONS = ["ghost"];

const npcDialogue =
  (typeof window !== "undefined" && window.BattlechurchNpcDialogue) || {};
const NPC_STRUGGLE_LINES = npcDialogue.struggleLines || [];
const NPC_RETURN_LINES = npcDialogue.returnLines || [];

const CONGREGATION_OVERLAY_PHASE_1_DURATION = 0.6;
const CONGREGATION_OVERLAY_PHASE_2_DURATION = 0.6;
const CONGREGATION_OVERLAY_PHASE_3_DURATION = 0.8;
const CONGREGATION_OVERLAY_HOLD_DURATION = 1.0;
const CONGREGATION_OVERLAY_TOTAL_DURATION =
  CONGREGATION_OVERLAY_PHASE_1_DURATION +
  CONGREGATION_OVERLAY_PHASE_2_DURATION +
  CONGREGATION_OVERLAY_PHASE_3_DURATION +
  CONGREGATION_OVERLAY_HOLD_DURATION;
const congregationOverlay = {
  active: false,
  timer: 0,
  phase: 0,
  countTo: 0,
  countValue: 0,
  lastPhase: -1,
  playedFinal: false,
};

function playCongregationOverlayWordSfx() {
  playPooledSfx(
    congregationOverlaySfxPool,
    CONGREGATION_OVERLAY_WORD_SFX_SRC,
    CONGREGATION_OVERLAY_SFX_POOL_SIZE,
    { volume: 0.6 },
  );
}

function playCongregationOverlayFinalSfx() {
  playPooledSfx(
    congregationOverlaySfxPool,
    CONGREGATION_OVERLAY_FINAL_SFX_SRC,
    CONGREGATION_OVERLAY_SFX_POOL_SIZE,
    { volume: 0.7 },
  );
}

function playCongregationFightSfx(volume = 0.65) {
  playPooledSfx(
    congregationFightSfxPool,
    CONGREGATION_FIGHT_SFX_SRC,
    CONGREGATION_FIGHT_SFX_POOL_SIZE,
    { volume },
  );
}

function playCongregationCountPopSfx(volume = 0.6, direction = "up") {
  const isDown = direction === "down";
  playPooledSfx(
    isDown ? congregationCountPopDownSfxPool : congregationCountPopUpSfxPool,
    isDown ? CONGREGATION_COUNT_POP_DOWN_SFX_SRC : CONGREGATION_COUNT_POP_UP_SFX_SRC,
    CONGREGATION_COUNT_POP_SFX_POOL_SIZE,
    { volume, matchSrc: true },
  );
}

if (typeof window !== "undefined") {
  window.playCongregationCountPopSfx = playCongregationCountPopSfx;
}
function triggerCongregationOverlay(targetCount) {
  const count = Number.isFinite(targetCount) ? Math.max(0, Math.round(targetCount)) : 0;
  congregationOverlay.active = true;
  congregationOverlay.timer = 0;
  congregationOverlay.phase = 0;
  congregationOverlay.countTo = count;
  congregationOverlay.countValue = 0;
  congregationOverlay.lastPhase = -1;
  congregationOverlay.playedFinal = false;
}

function updateCongregationOverlay(dt) {
  if (!congregationOverlay.active) return;
  congregationOverlay.timer += dt;
  const t = congregationOverlay.timer;
  const phase1End = CONGREGATION_OVERLAY_PHASE_1_DURATION;
  const phase2End = phase1End + CONGREGATION_OVERLAY_PHASE_2_DURATION;
  const phase3End = phase2End + CONGREGATION_OVERLAY_PHASE_3_DURATION;
  const holdEnd = phase3End + CONGREGATION_OVERLAY_HOLD_DURATION;
  let phase = 0;
  if (t >= phase2End) phase = 2;
  else if (t >= phase1End) phase = 1;
  if (phase !== congregationOverlay.lastPhase) {
    if (phase === 0 || phase === 1) {
      playCongregationOverlayWordSfx();
    }
    congregationOverlay.lastPhase = phase;
  }
  congregationOverlay.phase = phase;
  if (phase === 2) {
    const progress = Math.min(1, Math.max(0, (t - phase2End) / CONGREGATION_OVERLAY_PHASE_3_DURATION));
    const value = Math.min(
      congregationOverlay.countTo,
      Math.max(0, Math.floor(congregationOverlay.countTo * progress)),
    );
    congregationOverlay.countValue = value;
    if (!congregationOverlay.playedFinal && progress >= 1) {
      congregationOverlay.playedFinal = true;
      playCongregationOverlayFinalSfx();
    }
    if (progress >= 1) {
      congregationOverlay.countValue = congregationOverlay.countTo;
    }
  } else {
    congregationOverlay.countValue = 0;
  }
  if (t >= holdEnd) {
    congregationOverlay.active = false;
  }
}

function getMissionIndexFromName(name) {
  if (!name) return null;
  // Parse "Mission X" format to get mission number
  const match = String(name).match(/Mission\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// Alias for backwards compatibility
function getMonthIndexFromName(name) {
  return getMissionIndexFromName(name);
}

function isNoCooldownDamageSource(type) {
  if (!type) return false;
  const normalized = String(type).toLowerCase();
  return NPC_DAMAGE_COOLDOWN_EXCEPTIONS.some((token) => normalized.includes(token));
}

// Mission names replace calendar month names in the new terminology.
const MISSIONS_PER_TOWN =
  (typeof window !== "undefined" && Number.isFinite(window.BATTLES_PER_DISTRICT)
    ? window.BATTLES_PER_DISTRICT
    : null) ||
  3;

function getMissionName(globalMissionNumber) {
  if (!Number.isFinite(globalMissionNumber) || globalMissionNumber <= 0) return "Mission 1";
  const missionInTown = ((globalMissionNumber - 1) % MISSIONS_PER_TOWN) + 1;
  return `Mission ${missionInTown}`;
}

// Alias for backwards compatibility
function getMonthName(levelNumber) {
  return getMissionName(levelNumber);
}

function getUpcomingMissionName() {
  const status = levelManager?.getStatus ? levelManager.getStatus() : null;
  const currentMission = status?.month;
  if (!currentMission) return "";
  // Parse "Mission X" format to get next mission
  const match = String(currentMission).match(/Mission\s*(\d+)/i);
  if (match) {
    const currentNum = parseInt(match[1], 10);
    const nextNum = (currentNum % MISSIONS_PER_TOWN) + 1;
    return `Mission ${nextNum}`;
  }
  return String(currentMission);
}

// Alias for backwards compatibility
function getUpcomingMonthName() {
  return getUpcomingMissionName();
}

const COIN_FRAME_FILES = [
  "I57_Coin.png",
  "I57_Coin.png",
  "I57_Coin.png",
  "I57_Coin.png",
];
const COIN_HEAL_AMOUNT = NPC_FAITH_RECOVERY_PER_COIN;
// Enemy catalog: grouped by archetype so it’s easy to see ranges vs bruisers vs NPC-focus.
// The Entities module later applies the health-based slow-down on every entry.

const ENEMY_CATALOG =
  (typeof window !== "undefined" && window.BattlechurchEnemyCatalog?.catalog) || {};
const DEV_LEVEL_BUILDER =
  (typeof window !== "undefined" && window.BattlechurchLevelBuilder) || null;
const DEV_ENEMY_EDITOR =
  (typeof window !== "undefined" && window.BattlechurchEnemyEditor) || null;

function applyDevEnemyOverrides(baseDefs) {
  return { ...(baseDefs || {}) };
}

const ENEMY_DEFINITIONS_RAW =
  applyDevEnemyOverrides(ENEMY_CATALOG);

// MiniFolk enemies: catalog entries with a spriteSrc field (single sprite sheet loaders).
const MINIFOLKS = Object.entries(ENEMY_CATALOG)
  .filter(([, def]) => def.spriteSrc)
  .map(([key, def]) => ({ key, src: def.spriteSrc }));
const MINIFOLK_KEYS = new Set(MINIFOLKS.map((entry) => entry.key));
const EXTRA_ENEMY_KEYS = new Set([
  "armoredOrc",
  "armoredSkeleton",
  "armoredAxeman",
  "armoredEliteOrc",
  "orc",
]);
const ENEMY_DEFINITIONS = Object.fromEntries(
  Object.entries(ENEMY_DEFINITIONS_RAW).filter(
    ([key]) => MINIFOLK_KEYS.has(key) || EXTRA_ENEMY_KEYS.has(key),
  ),
);

const powerupDefinitions =
  (typeof window !== "undefined" && window.BattlechurchPowerupDefinitions) ||
  {};
const WEAPON_DROP_DEFS = powerupDefinitions.weaponDropDefs || {};
const UTILITY_POWERUP_DEFS = powerupDefinitions.utilityPowerupDefs || {};
const CHURCH_POWERUP_DEFS = powerupDefinitions.churchPowerupDefs || {};

function applyExplicitEnemyFrameMaps(enemyName, clipBundle) {
  if (!clipBundle) return;
  if (enemyName === "miniDemonFireThrower") {
    const idleMap = [0, 1, 2, 3];
    const walkMap = [8, 9, 10, 11, 12, 13];
    if (clipBundle.idle) clipBundle.idle.frameMap = idleMap.slice();
    if (clipBundle.walk) clipBundle.walk.frameMap = walkMap.slice();
    return;
  }
  if (enemyName === "miniDemonLord" || enemyName === "bossDemonLord") {
    const attackMap = Array.from({ length: 9 }, (_, index) => 51 + index);
    const jumpMap = [20, 60, 60, 60, 21, 22, 23];
    if (clipBundle.attack) {
      clipBundle.attack.frameMap = attackMap.slice();
      clipBundle.attack.frameCount = attackMap.length;
      if (!clipBundle.attack.frameRate || clipBundle.attack.frameRate <= 0) {
        clipBundle.attack.frameRate = 10;
      }
    }
    if (clipBundle.jump) {
      clipBundle.jump.frameMap = jumpMap.slice();
      clipBundle.jump.frameCount = jumpMap.length;
      clipBundle.jump.frameRate = 12;
    }
  }
}

const ASSET_MANIFEST =
  window.BattlechurchAssetManifest?.build?.({
    playerSpritePath: PLAYER_SPRITE_PATH,
    projectilePath: PROJECTILE_PATH,
    magicPackRoot: MAGIC_PACK_ROOT,
    characterRoot: CHARACTER_ROOT,
    enemyDefinitions: ENEMY_DEFINITIONS,
  }) || {};
if (typeof window !== "undefined") {
  window.ASSET_MANIFEST = ASSET_MANIFEST;
  window.__BATTLECHURCH_CHARACTER_ROOT = CHARACTER_ROOT;
}
// Inject mini folks into the enemies manifest so they are loaded like other enemies.
// Each mini sprite sheet will be used as a single animation named 'idle' - the
// loader will infer frame dimensions; game logic will reuse 'walk' and 'attack'
// by playing the same clip where needed so the characters animate.
for (const mini of MINIFOLKS) {
  const miniDef = ENEMY_DEFINITIONS[mini.key] || ENEMY_CATALOG[mini.key] || {};
  const assetGrid = miniDef.assetGrid || null;
  const animationFrameMaps = miniDef.animationFrameMaps || {};
  const isBat = mini.key === "bat";
  const isTormentorFlame = mini.key === "tormentorFlame";
  const frameWidth = isBat ? 34 : isTormentorFlame ? 32 : 0;
  const frameHeight = isBat ? 34 : isTormentorFlame ? 48 : 0;
  const fallbackFrameMap =
    isBat ? [0, 1, 2, 3] :
    isTormentorFlame ? Array.from({ length: 14 }, (_, i) => i) :
    undefined;
  const getFrameMap = (state) => {
    const mapped = animationFrameMaps[state];
    return Array.isArray(mapped) && mapped.length ? mapped.slice() : fallbackFrameMap;
  };
  ASSET_MANIFEST.enemies[mini.key] = {
    idle: {
      src: mini.src,
      frameWidth,
      frameHeight,
      gridCols: assetGrid?.cols || undefined,
      gridRows: assetGrid?.rows || undefined,
      frameRate: 8,
      loop: true,
      frameMap: getFrameMap("idle"),
    },
    walk: {
      src: mini.src,
      frameWidth,
      frameHeight,
      gridCols: assetGrid?.cols || undefined,
      gridRows: assetGrid?.rows || undefined,
      frameRate: 10,
      loop: true,
      frameMap: getFrameMap("walk"),
    },
    attack: {
      src: mini.src,
      frameWidth,
      frameHeight,
      gridCols: assetGrid?.cols || undefined,
      gridRows: assetGrid?.rows || undefined,
      frameRate: 12,
      loop: false,
      frameMap: getFrameMap("attack"),
    },
    jump: {
      src: mini.src,
      frameWidth,
      frameHeight,
      gridCols: assetGrid?.cols || undefined,
      gridRows: assetGrid?.rows || undefined,
      frameRate: 12,
      loop: false,
      frameMap: getFrameMap("jump"),
    },
    hurt: {
      src: mini.src,
      frameWidth,
      frameHeight,
      gridCols: assetGrid?.cols || undefined,
      gridRows: assetGrid?.rows || undefined,
      frameRate: 10,
      loop: false,
      frameMap: getFrameMap("hurt"),
    },
    death: {
      src: mini.src,
      frameWidth,
      frameHeight,
      gridCols: assetGrid?.cols || undefined,
      gridRows: assetGrid?.rows || undefined,
      frameRate: 10,
      loop: false,
      frameMap: getFrameMap("death"),
    },
  };
}

const { AnimationClip, Animator } = window.Entities || {};
const PLAYER_BASE_SCALE = 1.08;
const PLAYER_SCALE = PLAYER_BASE_SCALE * WORLD_SCALE;
const PLAYER_COLLISION_RADIUS = 12;
const PLAYER_HITBOX_STORAGE_KEY = "battlechurch.playerHitbox";

function loadBundledPlayerHitbox(fallback) {
  const bundled = window.BattlechurchHitboxes?.player?.hitbox || null;
  if (!bundled || typeof bundled !== "object") return null;
  return normalizeStoredPlayerHitbox(bundled, fallback);
}

function normalizeStoredPlayerHitbox(hitbox, fallback) {
  if (!hitbox || typeof hitbox !== "object") return { ...fallback };
  const width = Number(hitbox.width);
  const height = Number(hitbox.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { ...fallback };
  return {
    width,
    height,
    offsetX: Number.isFinite(Number(hitbox.offsetX)) ? Number(hitbox.offsetX) : fallback.offsetX,
    offsetY: Number.isFinite(Number(hitbox.offsetY)) ? Number(hitbox.offsetY) : fallback.offsetY,
  };
}

function loadStoredPlayerHitbox(fallback) {
  const bundled = loadBundledPlayerHitbox(fallback);
  if (bundled) return bundled;
  if (typeof localStorage === "undefined") return { ...fallback };
  try {
    const raw = localStorage.getItem(PLAYER_HITBOX_STORAGE_KEY);
    if (!raw) return { ...fallback };
    return normalizeStoredPlayerHitbox(JSON.parse(raw), fallback);
  } catch (error) {
    console.warn("Failed to load stored player hitbox", error);
    return { ...fallback };
  }
}

function saveStoredPlayerHitbox(hitbox) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PLAYER_HITBOX_STORAGE_KEY, JSON.stringify(hitbox));
  } catch (error) {
    console.warn("Failed to save player hitbox", error);
  }
}

const DEFAULT_PLAYER_BODY_HITBOX = {
  width: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 2.7,
  height: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 3.4,
  offsetX: 0,
  offsetY: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 0.45,
};
const DEFAULT_PLAYER_WEAPON_HITBOX = {
  width: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 7.2,
  height: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 5.2,
  offsetX: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 4.8,
  offsetY: 0,
};
const DEFAULT_PLAYER_DASH_SLASH_HITBOX = {
  width: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 8.6,
  height: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 5.8,
  offsetX: PLAYER_COLLISION_RADIUS * PLAYER_SCALE * 4.9,
  offsetY: 0,
};
const DEFAULT_PLAYER_RUSH_HITBOX = {
  width: 260 * WORLD_SCALE * 1.68,
  height: 260 * WORLD_SCALE * 0.92,
  offsetX: 260 * WORLD_SCALE * 0.34,
  offsetY: 0,
};
const DEFAULT_PLAYER_ATTACK_HIT_FRAME = 2;
const PLAYER_BODY_HITBOX = loadStoredPlayerHitbox(DEFAULT_PLAYER_BODY_HITBOX);
const PLAYER_WEAPON_HITBOX = normalizeStoredPlayerHitbox(
  window.BattlechurchHitboxes?.player?.weaponHitbox || null,
  DEFAULT_PLAYER_WEAPON_HITBOX,
);
const PLAYER_DASH_SLASH_HITBOX = normalizeStoredPlayerHitbox(
  window.BattlechurchHitboxes?.player?.dashSlashHitbox || null,
  DEFAULT_PLAYER_DASH_SLASH_HITBOX,
);
const PLAYER_RUSH_HITBOX = normalizeStoredPlayerHitbox(
  window.BattlechurchHitboxes?.player?.rushHitbox || null,
  DEFAULT_PLAYER_RUSH_HITBOX,
);
const PLAYER_ATTACK_HIT_FRAME = Number.isFinite(Number(window.BattlechurchHitboxes?.player?.attackHitFrame))
  ? Math.max(1, Math.round(Number(window.BattlechurchHitboxes.player.attackHitFrame)))
  : DEFAULT_PLAYER_ATTACK_HIT_FRAME;
const PLAYER_BODY_RADIUS_FALLBACK = Math.max(PLAYER_BODY_HITBOX.width, PLAYER_BODY_HITBOX.height) * 0.5;
const PLAYER_FRAME_SIZE = 100;

// small horizontal camera offset (world scroll) used to drive parallax
let cameraOffsetX = 0;
const CAMERA_SCROLL_LIMIT = 56; // reduced: subtle parallax only

const BASE_PLAYER_CONFIG = {
  scale: PLAYER_SCALE,
  speed: 299 * SPEED_SCALE,
  arrowCooldown: 0.35 / 2,
  maxHealth: HERO_MAX_HEALTH,
  radius: PLAYER_BODY_RADIUS_FALLBACK,
  hitbox: { ...PLAYER_BODY_HITBOX },
  weaponHitbox: { ...PLAYER_WEAPON_HITBOX },
  dashSlashHitbox: { ...PLAYER_DASH_SLASH_HITBOX },
  rushHitbox: { ...PLAYER_RUSH_HITBOX },
  attackHitFrame: PLAYER_ATTACK_HIT_FRAME,
};

const ENTITIES_BOOTSTRAP = window.Entities?.initialize?.({
  WORLD_SCALE,
  PLAYER_BASE_SCALE,
  HERO_MAX_HEALTH,
  PRAYER_BOMB_CHARGE_REQUIRED,
  CONGREGATION_COMMAND_CHARGE_TIME,
  DAMAGE_FLASH_INTENSITY,
  PLAYER_BASE_CONFIG: BASE_PLAYER_CONFIG,
  ENEMY_DEFINITIONS,
});

const PLAYER_CONFIG = ENTITIES_BOOTSTRAP?.PLAYER_CONFIG || BASE_PLAYER_CONFIG;
const ENEMY_TYPES =
  ENTITIES_BOOTSTRAP?.ENEMY_TYPES || buildEnemyTypesFallback(ENEMY_DEFINITIONS);

function applyHitboxChange(key, sourceHitbox, sourceWeaponHitbox) {
  if (!key || !ENEMY_CATALOG || !ENEMY_CATALOG[key]) return;
  const def = ENEMY_CATALOG[key];
  if (sourceHitbox && typeof sourceHitbox === "object") {
    def.hitbox = { ...sourceHitbox };
  }
  if (sourceWeaponHitbox && typeof sourceWeaponHitbox === "object") {
    def.weaponHitbox = { ...sourceWeaponHitbox };
  } else if (sourceWeaponHitbox === null) {
    delete def.weaponHitbox;
  }
  const scale = (def.scale || 1) * WORLD_SCALE;
  const scaled = buildScaledHitbox(def, scale);
  const scaledWeaponHitbox = (() => {
    const raw = def.weaponHitbox || null;
    if (!raw) return null;
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    const offsetX = Number.isFinite(raw.offsetX) ? raw.offsetX : 0;
    const offsetY = Number.isFinite(raw.offsetY) ? raw.offsetY : 0;
    return {
      width: width * scale,
      height: height * scale,
      offsetX: offsetX * scale,
      offsetY: offsetY * scale,
    };
  })();
  const scaledRadius = getHitboxRadius(scaled, (def.baseRadius || 14) * scale);
  if (ENEMY_TYPES && ENEMY_TYPES[key]) {
    ENEMY_TYPES[key].hitbox = scaled;
    ENEMY_TYPES[key].hitRadius = scaledRadius;
    ENEMY_TYPES[key].weaponHitbox = scaledWeaponHitbox || undefined;
    ENEMY_TYPES[key].attackHitFrame =
      Number.isFinite(def.attackHitFrame) && def.attackHitFrame > 0 ? def.attackHitFrame : undefined;
    ENEMY_TYPES[key].attackHitDamage =
      Number.isFinite(def.attackHitDamage) && def.attackHitDamage >= 0
        ? def.attackHitDamage
        : undefined;
    ENEMY_TYPES[key].contactDamage =
      Number.isFinite(def.contactDamage) && def.contactDamage >= 0
        ? def.contactDamage
        : undefined;
    ENEMY_TYPES[key].attackDamage =
      Number.isFinite(def.attackDamage) && def.attackDamage >= 0
        ? def.attackDamage
        : undefined;
    ENEMY_TYPES[key].damage =
      Number.isFinite(def.damage) && def.damage >= 0 ? def.damage : ENEMY_TYPES[key].damage;
  }
  if (Array.isArray(enemies)) {
    enemies.forEach((enemy) => {
      if (enemy && enemy.type === key) {
        enemy.config.hitbox = scaled;
        enemy.config.hitRadius = scaledRadius;
        enemy.config.weaponHitbox = scaledWeaponHitbox || undefined;
        enemy.config.attackHitFrame =
          Number.isFinite(def.attackHitFrame) && def.attackHitFrame > 0
            ? def.attackHitFrame
            : undefined;
        enemy.config.attackHitDamage =
          Number.isFinite(def.attackHitDamage) && def.attackHitDamage >= 0
            ? def.attackHitDamage
            : undefined;
        enemy.config.contactDamage =
          Number.isFinite(def.contactDamage) && def.contactDamage >= 0
            ? def.contactDamage
            : undefined;
        enemy.config.attackDamage =
          Number.isFinite(def.attackDamage) && def.attackDamage >= 0
            ? def.attackDamage
            : undefined;
        if (Number.isFinite(def.damage) && def.damage >= 0) {
          enemy.config.damage = def.damage;
        }
        enemy.radius = scaledRadius;
        enemy.safeTopMargin = Math.max(enemy.radius * 3.5, 100);
      }
    });
  }
}

if (typeof window !== "undefined") {
  window.__battlechurchApplyHitboxChange = applyHitboxChange;
}

// Developer/testing: restrict automatic MiniFolk spawns on level 1 to a single

  Spawner.initialize({
    enemies,
    npcs,
    getAssets: () => assets,
    enemyTypes: ENEMY_TYPES,
    getEnemyCatalog: () => ENEMY_CATALOG,
    createEnemyInstance,
    randomSpawnPosition,
    spawnPuffEffect,
    randomChoice,
    randomInRange,
    applyCameraShake,
    spawnCameraShakeDuration: SPAWN_CAMERA_SHAKE_DURATION,
    spawnCameraShakeMagnitude: SPAWN_CAMERA_SHAKE_MAGNITUDE,
    playEnemySpawnSfx: typeof playEnemySpawnSfx === "function" ? playEnemySpawnSfx : null,
    getLevelManager: () => levelManager,
    miniFolks: MINIFOLKS,
    maxActiveEnemies: MAX_ACTIVE_ENEMIES,
    skeletonMinCount: SKELETON_MIN_COUNT,
    skeletonPackSize: SKELETON_PACK_SIZE,
    miniImpBaseGroupSize: MINI_IMP_BASE_GROUP_SIZE,
    miniImpMaxGroupSize: MINI_IMP_MAX_GROUP_SIZE,
    miniImpMinGroupsPerHorde: MINI_IMP_MIN_GROUPS_PER_HORDE,
    enemySpawnStaggerMs: ENEMY_GROUP_SPAWN_STAGGER_MS,
    worldScale: WORLD_SCALE,
    getCameraOffsetX: () => cameraOffsetX,
  });

const spawnEnemyOfType = Spawner.spawnEnemyOfType;
const spawnMiniImpGroup = Spawner.spawnMiniImpGroup;
const spawnEnemyGroup = Spawner.spawnEnemyGroup;
const schedulePortalSpawn = Spawner.schedulePortalSpawn;
const maintainMiniImpHorde = Spawner.maintainMiniImpHorde;
const getPendingPortalSpawnCount = Spawner.getPendingPortalSpawnCount;

function startPostBossVisitorSession(config = {}) {
  return beginVisitorSession({
    duration: VISITOR_SESSION_DURATION,
    autoTriggered: true,
    onComplete: config?.onComplete,
    level: config?.level || 0,
  });
}

Levels.initialize({
  enemies,
  npcs,
  randomChoice,
  randomInRange,
  queueLevelAnnouncement,
  setDevStatus,
  getMonthName,
  spawnEnemyOfType,
  spawnMiniImpGroup,
  spawnEnemyGroup,
  schedulePortalSpawn,
  randomSpawnPosition,
  spawnPowerUpDrops,
  spawnBossForLevel,
  devClearOpponents,
  resetCozyNpcs,
  buildCongregationMembers,
  clearCongregationMembers,
  clearPowerUps: clearAllPowerUps,
  clearGrace: clearGracePickups,
  spawnVictoryGraceBurst,
  startBattleGraceRush,
  getLastEnemyDeathPosition,
  spawnWeaponPickups: spawnWeaponDrops,
  evacuateNpcsForBoss,
  restoreNpcsAfterBoss,
  heroSay,
  npcCheer,
  onNpcLost: handleNpcLostFromCongregation,
  prepareNpcProcession,
  isNpcProcessionComplete: areNpcProcessionsComplete,
  getConversationResponders: getCongregationConversationResponders,
  startMissionIntroFade,
  startGraceRushEndFade,
  triggerCongregationOverlay,
  getCongregationSize,
  showWaveHealthSnapshot,
  showBattleVictoryNpcDialogue,
  playBattleVictoryMusic: startBattleVictoryMusic,
  startBossBonusTransition,
  playWaveTransitionSfx,
  rotateNpcPositionsForActBreak,
  getAvailableMiniFolkKeys: () => MINIFOLKS.map((m) => m.key),
  hasEnemyAsset: (key) => Boolean(ASSET_MANIFEST.enemies?.[key]),
  miniImpBaseGroupSize: MINI_IMP_BASE_GROUP_SIZE,
  miniImpMaxGroupSize: MINI_IMP_MAX_GROUP_SIZE,
  miniImpMinGroupsPerHorde: MINI_IMP_MIN_GROUPS_PER_HORDE,
  enemySpawnStaggerMs: ENEMY_GROUP_SPAWN_STAGGER_MS,
  isPostBattleFlowBlocked: () =>
    Boolean(
      levelAnnouncements.length ||
      window.DialogOverlay?.isVisible?.() ||
      window.UpgradeScreen?.isVisible?.() ||
      PastorUpgradeScreen.isVisible() ||
      battlefieldIntroActive ||
      pendingUpgradeAfterSummary ||
      pendingPostUpgradeTransition ||
      levelManager?.getStatus?.()?.stage === "visitorMinigame",
    ),
  startVisitorMinigame: startPostBossVisitorSession,
  getPendingPortalSpawnCount,
});

const AIM_ASSIST_LENGTH = 520;
const AIM_ASSIST_FOV = Math.PI / 4;
const ENEMY_SPAWN_MARGIN = 140;
const ENEMY_SPAWN_JITTER = 26;
const ENEMY_SPAWN_DEBUG_BOX_SIZE = 80;
const ENEMY_SPAWN_PUFF_DURATION = 0;
const WEAPON_POWERUP_EFFECTS = new Set(
  Object.values(powerupDefinitions.weaponDropDefs || {}).map((d) => d.effect).filter(Boolean)
);
const CHURCH_POWERUP_EFFECTS = new Set(
  Object.values(powerupDefinitions.churchPowerupDefs || {}).map((d) => d.effect).filter(Boolean)
);
let devPowerupSwapIndex = 0;
const weaponPowerupConfig = projectileSettings.weaponPowerups || {};
// NPC buff presets and state. The legacy keys still drive anchor/layout behavior.
const FORMATION_PRESETS = {
  circle: {
    key: "circle",
    label: "Heavy Ordnance",
    spokenLabel: "Heavy Ordnance",
    bonuses: { damage: 0.2, armorPierce: true, projectileType: "lichBolt" },
  },
  line: { key: "line", label: "Rapid Fire", spokenLabel: "Rapid Fire", bonuses: { rof: 0.2 } },
  crescent: { key: "crescent", label: "Tactical Support", spokenLabel: "Tactical Support", bonuses: { prayerChargeGain: 0.2 } },
};
const npcWeaponState = {
  mode: null,
  timer: 0,
  duration: 0,
  damageMultiplier: 1,
  cooldownMultiplier: 1,
  speedMultiplier: 1,
};
const formationState = {
  current: null,
  bonuses: {
    rof: 0,
    damage: 0,
    powerupDuration: 0,
    prayerChargeGain: 0,
    armorPierce: false,
    projectileType: null,
  },
  anchors: [],
  jitterRadius: 28,
  swappedThisBattle: new Set(),
  swapCooldown: 0,
  combatSpreadScale: 1.18,
  combatSpreadScaleCurrent: 1.18,
  homePressure: 0,
};

function resolveWeaponPowerupConfig(effect, def = {}) {
  const defaults = weaponPowerupConfig[effect] || {};
  const overrides = def || {};
  return {
    duration: overrides.duration ?? def.duration ?? defaults.duration ?? 8,
    maxShots: overrides.maxShots ?? def.maxShots ?? defaults.maxShots ?? 2,
    cooldownMultiplier:
      overrides.cooldownMultiplier ?? def.cooldownMultiplier ?? defaults.cooldownMultiplier ?? 1,
    speedMultiplier:
      overrides.speedMultiplier ?? def.speedMultiplier ?? defaults.speedMultiplier ?? 1,
    damageMultiplier:
      overrides.damageMultiplier ?? def.damageMultiplier ?? defaults.damageMultiplier ?? 1,
    text: overrides.text ?? overrides.label ?? defaults.text ?? effect,
    textColor: overrides.textColor ?? defaults.textColor ?? "#fff",
    statusBgColor: overrides.statusBgColor ?? defaults.statusBgColor,
    statusLife: overrides.statusLife ?? defaults.statusLife,
    hudTitle:
      overrides.hudTitle ??
      defaults.hudTitle ??
      overrides.text ??
      overrides.label ??
      defaults.text ??
      effect,
    description: overrides.description ?? defaults.description ?? "",
    hudDuration: overrides.hudDuration ?? defaults.hudDuration ?? 2.6,
    spokenName: overrides.spokenName ?? defaults.spokenName ?? overrides.label ?? null,
    iconSrc: overrides.iconSrc ?? defaults.iconSrc ?? "",
    hitShakeMultiplier:
      overrides.hitShakeMultiplier ?? def.hitShakeMultiplier ?? defaults.hitShakeMultiplier ?? 1,
  };
}

function setWeaponPickupAnnouncement({ title, description, color, duration, iconSrc } = {}) {
  if (!title && !description) return;
  weaponPickupAnnouncement.title = title || "";
  weaponPickupAnnouncement.description = description || "";
  weaponPickupAnnouncement.color = color || UI_COLOR.softWhite;
  weaponPickupAnnouncement.iconSrc = iconSrc || "";
  weaponPickupAnnouncement.duration = Number.isFinite(duration) ? duration : 2.6;
  weaponPickupAnnouncement.timer = weaponPickupAnnouncement.duration;
}

function showWeaponPowerupConfigText(config) {
  showWeaponPowerupFloatingText(config.text, config.textColor || "#fff");
  const announcementTitle = config.hudTitle || config.text || "Weapon Power Up";
  setWeaponPickupAnnouncement({
    title: announcementTitle,
    description: config.description || "",
    color: config.textColor || "#fff",
    duration: config.hudDuration,
    iconSrc: config.iconSrc || "",
  });
  if (POWERUP_SPEECH_BUBBLES_ENABLED) {
    playerYell(config.spokenName || announcementTitle, 3.2);
  }
}

function getWeaponPowerName(effect, fallback = "Weapon") {
  switch (effect) {
    case "wisdomWeapon":
      return "Wisdom";
    case "scriptureWeapon":
      return "Scripture";
    case "cannonWeapon":
      return "Faith";
    default:
      return fallback || "Weapon";
  }
}

function roundEnemyDamageToFive(value) {
  const raw = Number.isFinite(value) && value > 0 ? value : 1;
  return Math.max(5, Math.ceil(raw / 5) * 5);
}

function buildScaledHitbox(def, scale) {
  const raw = def && def.hitbox ? def.hitbox : null;
  if (!raw) return null;
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const offsetX = Number.isFinite(raw.offsetX) ? raw.offsetX : 0;
  const offsetY = Number.isFinite(raw.offsetY) ? raw.offsetY : 0;
  return {
    width: width * scale,
    height: height * scale,
    offsetX: offsetX * scale,
    offsetY: offsetY * scale,
  };
}

function getHitboxRadius(hitbox, fallback = 0) {
  if (!hitbox || !Number.isFinite(hitbox.width) || !Number.isFinite(hitbox.height)) return fallback;
  return Math.max(hitbox.width, hitbox.height) * 0.5;
}

function buildEnemyTypesFallback(defs) {
  if (!defs || typeof defs !== "object") return {};
  return Object.fromEntries(
    Object.entries(defs).map(([key, def]) => {
      const scale = def.scale * WORLD_SCALE;
      const baseRadius = def.baseRadius || 14;
      const hitbox = buildScaledHitbox(def, scale);
      const baseHitRadius = baseRadius * scale;
      const hitRadius = getHitboxRadius(hitbox, baseHitRadius);
      const attackRange = def.attackRange ?? hitRadius + (def.attackBonus ?? 30);
      const displayName = def.displayName || def.folder || key;
      return [
        key,
        {
          speed: def.speed,
          health: def.health,
          maxHealth: def.health,
          damage: roundEnemyDamageToFive(def.damage),
          contactDamage:
            Number.isFinite(def.contactDamage) && def.contactDamage >= 0
              ? roundEnemyDamageToFive(def.contactDamage)
              : undefined,
          attackDamage:
            Number.isFinite(def.attackDamage) && def.attackDamage >= 0
              ? roundEnemyDamageToFive(def.attackDamage)
              : undefined,
          attackRange,
          hitRadius,
          attackCooldown: def.cooldown,
          scale,
          displayName,
          ranged: Boolean(def.ranged),
          projectileType: def.projectileType || null,
          preferEdges: Boolean(def.preferEdges),
          desiredRange: def.desiredRange || attackRange,
          projectileCooldown: def.projectileCooldown || def.cooldown,
          damageClass: def.damageClass,
          hitbox,
        },
      ];
    }),
  );
}


class Obstacle {
  constructor(asset, xRatio, yRatio) {
    this.image = asset.image;
    this.scale = asset.scale;
    this.baseCollisionRadius = asset.collisionRadius;
    this.collisionRadius = this.baseCollisionRadius * this.scale;
    this.xRatio = xRatio;
    this.yRatio = yRatio;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    this.updatePosition();
  }

  updatePosition() {
    this.x = this.xRatio * canvas.width;
    this.y = this.yRatio * canvas.height;
    this.width = this.image.width * this.scale;
    this.height = this.image.height * this.scale;
    this.collisionRadius = this.baseCollisionRadius * this.scale;
  }

  draw(context) {
    context.save();
    context.translate(this.x, this.y);
    context.drawImage(this.image, -this.width / 2, -this.height / 2, this.width, this.height);
    context.restore();
  }
}

// (moved to asset_loading.js)

function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (!length) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

function rotateVector(vector, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function distanceToEdge(x, y, dx, dy) {
  const epsilon = 1e-6;
  let maxDistance = Infinity;

  if (Math.abs(dx) > epsilon) {
    const tx1 = (0 - x) / dx;
    const tx2 = (canvas.width - x) / dx;
    const tx = dx > 0 ? tx2 : tx1;
    if (tx > 0) maxDistance = Math.min(maxDistance, tx);
  }

  if (Math.abs(dy) > epsilon) {
    const ty1 = (0 - y) / dy;
    const ty2 = (canvas.height - y) / dy;
    const ty = dy > 0 ? ty2 : ty1;
    if (ty > 0) maxDistance = Math.min(maxDistance, ty);
  }

  if (!Number.isFinite(maxDistance)) {
    maxDistance = Math.max(canvas.width, canvas.height);
  }

  return Math.max(0, maxDistance);
}

function distanceToArenaEdge(x, y, dx, dy) {
  const epsilon = 1e-6;
  let maxDistance = Infinity;
  const minY = HUD_HEIGHT;
  const maxY = canvas.height;

  if (Math.abs(dx) > epsilon) {
    const tx1 = (0 - x) / dx;
    const tx2 = (canvas.width - x) / dx;
    const tx = dx > 0 ? tx2 : tx1;
    if (tx > 0) maxDistance = Math.min(maxDistance, tx);
  }

  if (Math.abs(dy) > epsilon) {
    const ty1 = (minY - y) / dy;
    const ty2 = (maxY - y) / dy;
    const ty = dy > 0 ? ty2 : ty1;
    if (ty > 0) maxDistance = Math.min(maxDistance, ty);
  }

  if (!Number.isFinite(maxDistance)) {
    maxDistance = Math.max(canvas.width, canvas.height);
  }

  return Math.max(0, maxDistance);
}

function approachAngle(current, target, maxDelta) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

function getNpcTimerScale() {
  return 1;
}

function beginStartCountdown() {
  if (!START_COUNTDOWN_SEQUENCE.length) {
    needsCountdown = false;
    countdownState = null;
    return;
  }
  const first = START_COUNTDOWN_SEQUENCE[0];
  countdownState = {
    index: 0,
    timer: first.duration,
    label: first.label,
    active: true,
  };
}

function cancelStartCountdown() {
  if (countdownState) {
    countdownState = null;
  }
}

function updateStartCountdown(dt) {
  if (!countdownState || !countdownState.active) return false;
  countdownState.timer -= dt;
  while (countdownState.timer <= 0 && countdownState.active) {
    countdownState.index += 1;
    if (countdownState.index >= START_COUNTDOWN_SEQUENCE.length) {
      countdownState.active = false;
      countdownState.label = null;
      needsCountdown = false;
      return true;
    }
    const nextStep = START_COUNTDOWN_SEQUENCE[countdownState.index];
    countdownState.label = nextStep.label;
    countdownState.timer += nextStep.duration;
  }
  return false;
}

function isStartCountdownActive() {
  return Boolean(countdownState?.active);
}

function getStartCountdownLabel() {
  return countdownState?.active ? countdownState.label : null;
}

const uiTexts =
  (typeof window !== "undefined" && window.GameText?.screens) || {};
const TITLE_OVERLAY_BODY = "";

function typewriterElement(overlay, selector, text, msPerChar = 18) {
  if (!overlay) return;
  const target = overlay.querySelector(selector);
  if (!target) return;
  if (target.__typeTimer) clearInterval(target.__typeTimer);
  let idx = 0;
  const payload = String(text || "");
  const previousDisplay = target.style.display;
  const previousTextAlign = target.style.textAlign;
  const previousWidth = target.style.width;
  const previousMaxWidth = target.style.maxWidth;
  const previousWhiteSpace = target.style.whiteSpace;
  target.style.display = "inline-block";
  target.style.textAlign = "left";
  target.style.maxWidth = "100%";
  target.style.whiteSpace = "pre-line";
  target.textContent = payload;
  const fullWidth = Math.ceil(target.getBoundingClientRect().width || 0);
  target.style.width = fullWidth ? `${fullWidth}px` : target.style.width;
  target.textContent = "";
  target.__typeTimer = setInterval(() => {
    idx += 1;
    target.textContent = payload.slice(0, idx);
    if (idx >= payload.length) {
      clearInterval(target.__typeTimer);
      target.__typeTimer = null;
      target.style.display = previousDisplay;
      target.style.textAlign = previousTextAlign;
      target.style.width = previousWidth;
      target.style.maxWidth = previousMaxWidth;
      target.style.whiteSpace = previousWhiteSpace;
    }
  }, msPerChar);
}

function typewriterText(target, text, msPerChar = 18, onComplete = null) {
  if (!target) return;
  if (target.__typeTimer) clearInterval(target.__typeTimer);
  const payload = String(text || "");
  const previousWhiteSpace = target.style.whiteSpace;
  target.style.whiteSpace = "pre-line";
  target.textContent = "";
  let idx = 0;
  target.__typeTimer = setInterval(() => {
    idx += 1;
    target.textContent = payload.slice(0, idx);
    if (idx >= payload.length) {
      clearInterval(target.__typeTimer);
      target.__typeTimer = null;
      target.style.whiteSpace = previousWhiteSpace;
      if (typeof onComplete === "function") onComplete();
    }
  }, msPerChar);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showDistrictIntroDialog() {
  if (!window.DialogOverlay) return false;
  const body =
    "You are the new pastor to the last church in a town under spiritual attack. Grow your congregation in one year, or the town falls with you.";
  window.DialogOverlay.show({
    title: "",
    bodyHtml: `<div class="district-intro-text"></div>`,
    buttonText: "Continue",
    variant: "district-intro",
    devLabel: "",
    onRender: ({ overlay }) => startMissionTypewriter(overlay, body, 18),
    onContinue: () => {
      if (window.DialogOverlay?.hide) {
        window.DialogOverlay.hide();
      }
      paused = false;
      if (levelManager && typeof levelManager.startBriefing === "function") {
        levelManager.startBriefing(1);
      } else if (levelManager && typeof levelManager.advanceFromBriefing === "function") {
        levelManager.advanceFromBriefing(1);
      }
    },
  });
  return true;
}

function queueDistrictIntroAnnouncement() {
  const mapData = typeof window !== "undefined" ? window.BattlechurchMapData : null;
  const districtName = mapData?.districts?.find((t) => t.id === activeDistrictId)?.name || "this town";
  const act1Subtitle = "Secure 3 battlefields";
  const devStartOverride =
    pendingBattlefieldStartOverride &&
    pendingBattlefieldStartOverride.districtId === activeDistrictId
      ? pendingBattlefieldStartOverride
      : null;
  const localBattlefieldNumber = Number.isFinite(devStartOverride?.localBattlefieldNumber)
    ? Math.max(1, Math.floor(devStartOverride.localBattlefieldNumber))
    : 1;
  if (devStartOverride && localBattlefieldNumber > 1) {
    const districtList = mapData?.districts || [];
    const districtIndex = districtList.findIndex((t) => t?.id === activeDistrictId);
    const levelNumber = districtIndex >= 0 ? districtIndex + 1 : 1;
    pendingDistrictIntroStart = false;
    suppressInitialAnnouncements = false;
    paused = false;
    pendingBattlefieldStartOverride = null;
    // Battlefield 2 or 3: show the between-battlefield intro screen first.
    // startActBreakTeaser (called on dismiss) jumps to the right battlefield.
    showBattlefieldIntro(localBattlefieldNumber);
    return;
  }
  const upcomingBattlefieldOrderNumber = localBattlefieldNumber;
  const upcomingBattlefieldNumber = 1;
  pendingDistrictIntroStart = true;
  queueLevelAnnouncement(act1Subtitle, "", {
    requiresConfirm: true,
    skipMissionBrief: true,
    battlefieldIntro: true,
    upcomingBattlefieldOrderNumber,
    upcomingBattlefieldNumber,
  });
}

function queueBattlefieldIntroTransition(battlefieldNumber) {
  const targetBattlefield = Math.max(2, Math.floor(battlefieldNumber));
  if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  queueLevelAnnouncement("", "", {
    requiresConfirm: true,
    skipMissionBrief: true,
    battlefieldIntro: true,
    upcomingBattlefieldOrderNumber: targetBattlefield,
    upcomingBattlefieldNumber: 1,
    actBreakFlatBattle: targetBattlefield,
  });
}

function queueExteriorShotAnnouncement({ force = false, actBreak = false } = {}) {
  const monthName = getUpcomingMonthName();
  if (!monthName) return;
  const status = levelManager?.getStatus ? levelManager.getStatus() : null;
  const _ohCamp = (typeof window !== "undefined" && window.activeCampaign) || "p1";
  const _ohLabels = (typeof window !== "undefined" && window.BattlechurchCampaignLabels) || {};
  const orderHeadings = _ohLabels.missionIntroTitles?.[_ohCamp] || _ohLabels.missionIntroTitles?.p1 || {};
  const currentBattlefieldNumber = Math.max(
    1,
    Number.isFinite(status?.battle) ? status.battle : 1,
  );
  const orderNumber = Math.max(1, Number.isFinite(status?.level) ? status.level : 1);
  const bossBattleNumber =
    typeof window !== "undefined" && Number.isFinite(window.MONTHS_PER_LEVEL)
      ? window.MONTHS_PER_LEVEL
      : 4;
  // Check if this is a boss exterior - either by battle number OR by pending boss flag (from dev hotkey 5)
  const isBossExterior = pendingBossIntroAfterExterior ||
    (Number.isFinite(status?.battle) && status.battle >= bossBattleNumber);
  const battleTitle = isBossExterior
    ? `Battle ${bossBattleNumber}`
    : (orderHeadings[orderNumber] || monthName);
  const upcomingBattlefieldNumber = isBossExterior
    ? bossBattleNumber
    : Math.max(1, (Number.isFinite(status?.battle) ? status.battle : 0) + 1);
  const upcomingBattlefieldOrderNumber = orderNumber;
  // actBreak bypasses the mission-1 guard — chapter breaks always need the exterior shot + zoom
  const shouldShowExterior = actBreak || upcomingBattlefieldNumber === 1;
  if (!shouldShowExterior) return;
  const visitorActive =
    visitorSession?.active || visitorSession?.summaryActive || visitorSession?.introActive;
  if (!force && (visitorActive || status?.pendingVisitorMinigame)) {
    pendingExteriorShotAfterVisitor = true;
    return;
  }
  pendingExteriorShotAfterVisitor = false;
  if (levelAnnouncements.some((announcement) => announcement?.exteriorShot)) return;
  queueLevelAnnouncement(battleTitle, "", {
    duration: 1.4,
    requiresConfirm: true,
    skipMissionBrief: true,
    exteriorShot: true,
    upcomingBattlefieldNumber,
    upcomingBattlefieldOrderNumber,
  });
}

function startDistrictIntroTransition() {
  if (districtIntroTransitionActive) return;
  districtIntroTransitionActive = true;
  districtIntroTransitionTimer = 0;
  stopIntroMusic();
  startCongregationMusic();
  dismissCurrentLevelAnnouncement();
}

function queueInitialMonthAnnouncementFromCongregation() {
  const status = levelManager?.getStatus ? levelManager.getStatus() : null;
  const levelNumber = status?.level || 1;
  const globalMonthNumberForLevelStart = (levelNumber - 1) * MONTHS_PER_LEVEL + 1;
  const monthName = getMonthName(globalMonthNumberForLevelStart);
  suppressInitialAnnouncements = false;
  if (levelManager && typeof levelManager.setWaitingForCongregation === "function") {
    levelManager.setWaitingForCongregation(false);
  }
  queueLevelAnnouncement(`Level ${levelNumber}: ${monthName}`, "A new month of ministry begins", {
    duration: CONGREGATION_SCREEN_DURATION,
    requiresConfirm: true,
  });
  setDevStatus(`Preparing ${monthName}`, CONGREGATION_SCREEN_DURATION);
}

function startGameFromTitle() {
  // Don't start if assets haven't loaded yet
  if (!assetsLoaded) return;
  devMeleeArenaMode = false;
  tutorialArenaMode = false;
  tutorialArenaState = null;
  if (musicState.devArena) musicState.devArena.pause();
  resetDevMeleeMoveFeed();
  if (typeof window !== "undefined") {
    window.__battlechurchDevMeleeArenaMode = false;
    window.__battlechurchTutorialArenaMode = false;
    window.__tutorialArenaHud = null;
  }
  if (!pendingBattlefieldStartOverride && !devPlaytestLaunchInProgress) {
    setDevPlaytestSession(false, null);
  }
  districtVisitorMinigamePlayed = false;
  maxChainThisTown = 0;
  // Load campaign data (start count, multiplier, powerup restore)
  if (typeof window !== "undefined" && window.MapScreen?.getDistrictCampaignData) {
    const overrideCampaignData =
      titleDemoSaveOverride && titleDemoSaveOverride.districtId === activeDistrictId
        ? titleDemoSaveOverride.campaignData
        : null;
    const devCampaignDataOverride =
      pendingDevCampaignDataOverride && pendingDevCampaignDataOverride.districtId === activeDistrictId
        ? pendingDevCampaignDataOverride.campaignData
        : null;
    setDemoSandboxRunActive(Boolean(overrideCampaignData));
    const baseCampaignData = window.MapScreen.getDistrictCampaignData(activeDistrictId);
    const campaignData = overrideCampaignData
      ? overrideCampaignData
      : devCampaignDataOverride
        ? { ...baseCampaignData, ...devCampaignDataOverride }
        : baseCampaignData;
    activeCampaign = campaignData?.campaign || "p1";
    activeCampaignMultiplier = Number.isFinite(campaignData?.campaignMultiplier) ? campaignData.campaignMultiplier : 1.0;
    if (typeof window !== "undefined") {
      window.activeCampaign = activeCampaign;
      window.activeCampaignMultiplier = activeCampaignMultiplier;
    }
    const resumeLocalBattleNumber = Number.isFinite(campaignData?.resumeLocalBattleNumber)
      ? Math.max(1, Math.floor(campaignData.resumeLocalBattleNumber))
      : 1;
    const maxMissionsPerTown =
      typeof window !== "undefined" && Number.isFinite(window.BATTLES_PER_DISTRICT)
        ? Math.max(1, Math.floor(Number(window.BATTLES_PER_DISTRICT) || 1))
        : 3;
    const clampedResumeLocalBattleNumber = Math.min(resumeLocalBattleNumber, maxMissionsPerTown);
    const hasDevStartOverrideForTown =
      pendingBattlefieldStartOverride &&
      pendingBattlefieldStartOverride.districtId === activeDistrictId;
    if (!overrideCampaignData && !hasDevStartOverrideForTown && clampedResumeLocalBattleNumber > 1) {
      pendingBattlefieldStartOverride = {
        districtId: activeDistrictId,
        localBattlefieldNumber: clampedResumeLocalBattleNumber,
      };
    }
    if (Number.isFinite(campaignData?.savedGraceCount)) {
      playerGraceCount = Math.max(0, Math.round(campaignData.savedGraceCount));
    }
    districtStartCongregation = Number.isFinite(campaignData?.startCount) ? campaignData.startCount : INITIAL_CONGREGATION_SIZE;
    resetChurchPowerups();
    // Restore church powerup levels from prior campaigns
    const restored = campaignData?.restoredChurchPowerupLevels || {};
    for (const [id, level] of Object.entries(restored)) {
      if (Number.isFinite(level) && level > 0) {
        churchPowerupLevels.set(id, level);
        unlockedChurchPowerups.add(id);
      }
    }
    // Restore persistent pastor powerup levels
    const restoredPastor = campaignData?.restoredPastorPowerupLevels;
    if (restoredPastor && typeof restoredPastor === "object") {
      for (const [key, level] of Object.entries(restoredPastor)) {
        if (PASTOR_POWERUP_DEFS[key] && Number.isFinite(level)) {
          pastorPowerupLevels.set(key, Math.max(0, Math.min(PASTOR_POWERUP_MAX_LEVEL, Math.round(level))));
        }
      }
      if (typeof window !== "undefined") window.pastorPowerupLevels = pastorPowerupLevels;
    }
  } else {
    setDemoSandboxRunActive(false);
    activeCampaign = "p1";
    activeCampaignMultiplier = 1.0;
    if (typeof window !== "undefined") {
      window.activeCampaign = activeCampaign;
      window.activeCampaignMultiplier = activeCampaignMultiplier;
    }
    districtStartCongregation = INITIAL_CONGREGATION_SIZE;
    resetChurchPowerups();
  }
  titleDemoSaveOverride = null;
  if (pendingDevCampaignDataOverride?.districtId === activeDistrictId) {
    pendingDevCampaignDataOverride = null;
  }
  // Apply denominational upgrade powerups (free picks granted before County 2/3/4 towns)
  const _denomPowerups = typeof window !== "undefined" ? window.pendingDenomPowerups : null;
  if (Array.isArray(_denomPowerups) && _denomPowerups.length > 0) {
    const DENOM_POWERUP_LEVEL = 5;
    for (const _key of _denomPowerups) {
      if (CHURCH_POWERUP_DEFS[_key] && !CHURCH_POWERUP_DEFS[_key].disabled) {
        const _existing = churchPowerupLevels.get(_key) || 0;
        churchPowerupLevels.set(_key, Math.max(_existing, DENOM_POWERUP_LEVEL));
        unlockedChurchPowerups.add(_key);
      }
    }
    window.pendingDenomPowerups = null;
  }
  // Hard-clear any leftover state from a previous town (e.g. dev skip).
  // buildCongregationMembers() is called inside beginLevel() so clearing here is safe.
  enemies.splice(0, enemies.length);
  npcs.splice(0, npcs.length);
  clearCongregationMembers();
  bossHazards.splice(0, bossHazards.length);
  projectiles.splice(0, projectiles.length);
  activeBoss = null;
  evacuatedNpcCount = 0;
  npcsSuspended = false;
  Effects.clear?.();
  Spawner.resetAllFlags?.();
  resetCongregationSize();
  // Ensure title is hidden and game is paused while we enter briefing.
  paused = true;
  needsCountdown = false;
  gameStarted = false;
  districtIntroTransitionActive = false;
  districtIntroTransitionTimer = 0;
  pendingBossIntroAfterExterior = false;
  battlefieldIntroActive = false;
  battlefieldIntroFadeTimer = 0;
  battlefieldIntroFadeDuration = 0;
  battlefieldIntroFadeAlpha = 0;
  battlefieldIntroImage = null;
  graceRushBlackout = false;
  graceRushFadeHold = false;
  graceRushFadeAlpha = 0;
  graceRushFadeTimer = 0;
  graceRushFadeDuration = 0;
  graceRushFadeReleaseTimer = 0;
  startSpeedrunTimer();
  resetYearNpcPool();
  // Clear any previously queued announcements so the congregation doesn't show
  // immediately (init/restart may have queued them at startup).
  try {
    if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  } catch (e) {}
  try {
    titleScreenActive = false;
    queueDistrictIntroAnnouncement();
    return;
  } catch (e) {}
}

function startRunForDistrict(districtId) {
  if (!devPlaytestLaunchInProgress) {
    setDevPlaytestSession(false, null);
    pendingDevCampaignDataOverride = null;
  }
  devPlaytestLaunchInProgress = false;
  activeDistrictId = districtId || null;
  mapActive = false;
  if (typeof window !== "undefined" && typeof window.MapScreen?.close === "function") {
    window.MapScreen.close();
  }
  if (typeof window !== "undefined") {
    window.activeDistrictId = activeDistrictId;
  }
  battlefieldFloorSelectionKey = "";
  randomizeDevArenaFloorOption();
  // Starting a new district/town should always begin at full pastor health.
  if (player && Number.isFinite(player.maxHealth) && player.maxHealth > 0) {
    player.health = player.maxHealth;
  }
  // activeCampaign and activeCampaignMultiplier are set inside startGameFromTitle via getDistrictCampaignData
  startGameFromTitle();
}

function startDevLevelTestFromEditor({
  town = 1,
  battlefield = 1,
  // legacy aliases
  mission,
  battle,
} = {}) {
  // Resolve legacy aliases (mission/battle were the old swapped names)
  const resolvedBattlefield = battlefield !== 1 ? battlefield : (mission ?? battle ?? 1);
  pendingDevCampaignDataOverride = null;
  const getDevEditorAssumedPowerups = ({ districtNum, battlefieldNum }) => {
    const cfg =
      (typeof window !== "undefined" && window.BattlechurchLevelBuilder?.getConfig?.()) ||
      (typeof window !== "undefined" ? window.BattlechurchLevelData : null);
    if (!cfg || typeof cfg !== "object") return {};
    const districtList = Array.isArray(cfg?.districts)
      ? cfg.districts
      : Array.isArray(cfg?.towns)
        ? cfg.towns
        : Array.isArray(cfg?.levels)
          ? cfg.levels
          : [];
    const districtCfg =
      districtList.find((entry) => Number(entry?.index) === districtNum) || districtList[districtNum - 1] || null;
    const battleList = Array.isArray(districtCfg?.battles)
      ? districtCfg.battles
      : Array.isArray(districtCfg?.months)
        ? districtCfg.months
        : [];
    const battlefieldCfg =
      battleList.find((entry) => Number(entry?.index) === battlefieldNum) ||
      battleList[battlefieldNum - 1] ||
      null;
    // Support both collapsed format (waves directly on battlefield) and legacy missions[] nesting
    const assumedLevels =
      battlefieldCfg?.assumedChurchPowerupLevels ??
      battlefieldCfg?.missions?.[0]?.assumedChurchPowerupLevels;
    if (!assumedLevels || typeof assumedLevels !== "object" || Array.isArray(assumedLevels)) {
      return {};
    }
    const defs =
      (typeof window !== "undefined" && window.BattlechurchPowerupDefinitions?.churchPowerupDefs) ||
      {};
    const hasKnownDefs = Object.keys(defs).length > 0;
    const maxLevel = Number.isFinite(CHURCH_POWERUP_MAX_LEVEL)
      ? CHURCH_POWERUP_MAX_LEVEL
      : 10;
    const sanitized = {};
    for (const [key, value] of Object.entries(assumedLevels)) {
      if (hasKnownDefs && !defs[key]) continue;
      if (defs[key]?.disabled) continue;
      const level = Math.max(0, Math.min(maxLevel, Math.floor(Number(value) || 0)));
      if (level > 0) sanitized[key] = level;
    }
    return sanitized;
  };

  const getDevEditorAssumedPastorPowerups = ({ districtNum, battlefieldNum }) => {
    const cfg =
      (typeof window !== "undefined" && window.BattlechurchLevelBuilder?.getConfig?.()) ||
      (typeof window !== "undefined" ? window.BattlechurchLevelData : null);
    if (!cfg || typeof cfg !== "object") return {};
    const districtList = Array.isArray(cfg?.districts)
      ? cfg.districts
      : Array.isArray(cfg?.towns)
        ? cfg.towns
        : Array.isArray(cfg?.levels)
          ? cfg.levels
          : [];
    const districtCfg =
      districtList.find((entry) => Number(entry?.index) === districtNum) || districtList[districtNum - 1] || null;
    const battleList = Array.isArray(districtCfg?.battles)
      ? districtCfg.battles
      : Array.isArray(districtCfg?.months)
        ? districtCfg.months
        : [];
    const battlefieldCfg =
      battleList.find((entry) => Number(entry?.index) === battlefieldNum) ||
      battleList[battlefieldNum - 1] ||
      null;
    const assumedLevels =
      battlefieldCfg?.assumedPastorPowerupLevels ??
      battlefieldCfg?.missions?.[0]?.assumedPastorPowerupLevels;
    if (!assumedLevels || typeof assumedLevels !== "object" || Array.isArray(assumedLevels)) return {};
    const maxLevel = Number.isFinite(PASTOR_POWERUP_MAX_LEVEL) ? PASTOR_POWERUP_MAX_LEVEL : 5;
    const sanitized = {};
    for (const [key, value] of Object.entries(assumedLevels)) {
      if (!PASTOR_POWERUP_DEFS[key]) continue;
      const level = Math.max(0, Math.min(maxLevel, Math.floor(Number(value) || 0)));
      if (level > 0) sanitized[key] = level;
    }
    return sanitized;
  };

  const mapData = typeof window !== "undefined" ? window.BattlechurchMapData : null;
  const districts = Array.isArray(mapData?.districts) ? mapData.districts : [];
  if (!districts.length) {
    setDevStatus("Dev test failed: no map towns loaded", 2.2);
    return false;
  }
  const districtNumber = Math.max(1, Math.floor(Number(town) || 1));
  const districtIndex = Math.min(districts.length - 1, districtNumber - 1);
  const matchedDistrict =
    districts.find((t) => Number(t?.index) === districtNumber) || districts[districtIndex] || null;
  const districtId = matchedDistrict?.id || null;
  if (!districtId) {
    setDevStatus("Dev test failed: invalid town", 2.2);
    return false;
  }
  const battlefieldNumber = Math.max(1, Math.floor(Number(resolvedBattlefield) || 1));
  const assumedPowerupLevels = getDevEditorAssumedPowerups({
    districtNum: districtNumber,
    battlefieldNum: battlefieldNumber,
  });
  const assumedPastorLevels = getDevEditorAssumedPastorPowerups({
    districtNum: districtNumber,
    battlefieldNum: battlefieldNumber,
  });
  pendingDevCampaignDataOverride = {
    districtId,
    campaignData: {
      restoredChurchPowerupLevels: assumedPowerupLevels,
      restoredPastorPowerupLevels: Object.keys(assumedPastorLevels).length ? assumedPastorLevels : undefined,
    },
  };
  setDevPlaytestSession(true, {
    town: districtNumber,
    battlefield: battlefieldNumber,
  });
  const localBattlefieldNumber = battlefieldNumber;
  const getMaxBattlesInDistrict = () => {
    const fallbackBattlesPerTown =
      typeof window !== "undefined" && Number.isFinite(window.BATTLES_PER_DISTRICT)
        ? Math.max(1, Math.floor(Number(window.BATTLES_PER_DISTRICT) || 1))
        : 3;
    const fallbackTotal = fallbackBattlesPerTown;
    const cfg =
      (typeof window !== "undefined" && window.BattlechurchLevelBuilder?.getConfig?.()) ||
      (typeof window !== "undefined" ? window.BattlechurchLevelData : null);
    const districtCfg =
      (Array.isArray(cfg?.districts) &&
        (cfg.districts.find((t) => Number(t?.index) === districtNumber) || cfg.districts[districtNumber - 1])) ||
      null;
    const battleList = Array.isArray(districtCfg?.battles)
      ? districtCfg.battles
      : Array.isArray(districtCfg?.months)
        ? districtCfg.months
        : [];
    if (!battleList.length) return fallbackTotal;
    let total = 0;
    for (const battleCfg of battleList) {
      total += 1;
    }
    return Math.max(1, total);
  };
  const maxBattlesInDistrict = getMaxBattlesInDistrict();
  pendingBattlefieldStartOverride = {
    districtId,
    localBattlefieldNumber: Math.max(1, Math.min(maxBattlesInDistrict, localBattlefieldNumber)),
  };
  if (typeof window !== "undefined") {
    window.activeDistrictId = districtId;
    window.BattlechurchLevelBuilder?.hide?.();
  }
  activeDistrictId = districtId;
  devPlaytestLaunchInProgress = true;

  // Route through existing county-based denomination picker flow first.
  mapActive = true;
  titleScreenActive = false;
  titleDemoSaveMenuActive = false;
  titleUtilityPanelMode = null;
  titleEditSaveDraft = null;
  titleNewSaveDraft = null;
  if (typeof window !== "undefined" && window.MapScreen?.open) {
    window.MapScreen.selectDistrict?.(districtId);
    window.MapScreen.open();
    if (typeof window.MapScreen.devStartRunForDistrict === "function") {
      window.MapScreen.devStartRunForDistrict(districtId);
    } else {
      startRunForDistrict(districtId);
    }
    setDevStatus(
      `Dev test: Town ${districtNumber} Battlefield ${battlefieldNumber}`,
      2.8,
    );
    return true;
  }
  startRunForDistrict(districtId);
  return true;
}

function exitMapScreen() {
  mapActive = false;
  titleScreenActive = true;
  titleDemoSaveMenuActive = false;
}

function returnToMapWithNextTown() {
  // Stop the game and return to map screen with next town selected
  paused = true;
  gameStarted = false;
  titleScreenActive = false;
  mapActive = true;
  pendingBossIntroAfterExterior = false;
  districtVisitorMinigamePlayed = false;
  // Clear any pending announcements
  try {
    if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  } catch (e) {}
  // Reset level manager
  if (levelManager?.reset) levelManager.reset();
  // Select next town and open map
  if (window.MapScreen) {
    const nextDistrictId = window.MapScreen.getNextDistrictInOrder(activeDistrictId);
    if (nextDistrictId) {
      window.MapScreen.selectDistrict(nextDistrictId);
    }
    window.MapScreen.open();
  }
}

function returnToMapFromPause() {
  paused = false;
  gameStarted = false;
  titleScreenActive = false;
  mapActive = true;
  pendingBossIntroAfterExterior = false;
  districtVisitorMinigamePlayed = false;
  window.isPauseOverlayActive = false;
  pauseRestartConfirmActive = false;
  // Clear any pending announcements
  try {
    if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  } catch (e) {}
  // Reset level manager
  if (levelManager?.reset) levelManager.reset();
  if (window.MapScreen) {
    if (activeDistrictId) {
      window.MapScreen.selectDistrict(activeDistrictId);
    }
    window.MapScreen.open();
  }
}

function returnToMapFromGameOver() {
  paused = false;
  gameOver = false;
  gameStarted = false;
  titleScreenActive = false;
  mapActive = true;
  pendingBossIntroAfterExterior = false;
  districtVisitorMinigamePlayed = false;
  window.isPauseOverlayActive = false;
  pauseRestartConfirmActive = false;
  postDeathSequenceActive = false;
  postDeathAnimLeadActive = false;
  postDeathAnimLeadTimer = 0;
  postDeathTimer = 0;
  miniImpWaveDispatched = false;
  arenaFadeTimer = 0;
  arenaFadeAlpha = 0;
  try {
    if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  } catch (e) {}
  if (levelManager?.reset) levelManager.reset();
  if (window.MapScreen) {
    if (activeDistrictId) {
      window.MapScreen.selectDistrict(activeDistrictId);
    }
    window.MapScreen.open();
  }
}

async function seedDemoSlotProgress(slot) {
  if (!slot || !slot.districtId) return;
  const mapScreen = typeof window !== "undefined" ? window.MapScreen : null;
  if (typeof mapScreen?.setDemoProfile !== "function") return;
  mapScreen.setDemoProfile({
    completedDistricts: Math.max(0, Number(slot.completedDistricts) || 0),
    playerName: slot.playerName || null,
    cityName: slot.cityName || null,
    classId: slot.classId || null,
    districtPowerups: slot.districtPowerups || null,
    districtStartCounts: slot.districtStartCounts || null,
  });
}

async function refreshTitleCloudSaveOption() {
  titleCloudSaveLoading = true;
  titleCloudSaveRows = [];
  titleCloudActiveSaveId = null;
  try {
    if (typeof window === "undefined") return;
    if (window.cloudAuthProvider !== "google") {
      titleCloudSaveLoading = false;
      titleCloudSaveRows = [];
      titleCloudSelectedSaveId = null;
      return;
    }
    if (window.MapScreen?.reloadProgress) {
      await window.MapScreen.reloadProgress();
    }
    if (typeof window.MapScreen?.getSaveFileSummaries !== "function") {
      titleCloudSaveLoading = false;
      titleCloudSaveRows = [];
      titleCloudSelectedSaveId = null;
      return;
    }
    const summary = window.MapScreen.getSaveFileSummaries();
    const saves = Array.isArray(summary?.saves) ? summary.saves : [];
    titleCloudActiveSaveId = summary?.activeSaveId || null;
    titleCloudSaveRows = saves.map((save) => {
      const completed = Number.isFinite(save?.completedP1Districts) ? save.completedP1Districts : 0;
      const total = Math.max(1, Number.isFinite(save?.totalDistricts) ? save.totalDistricts : 10);
      const totalCongregationBest = Number.isFinite(save?.totalCongregationBest) ? save.totalCongregationBest : 0;
      const districtRows = Array.isArray(save?.districtProgressRows) ? save.districtProgressRows : [];
      const completedDistrictRows = districtRows.filter((row) => row?.p1Completed === true);
      const activeRunDistrictName = save?.activeRunDistrictName || null;
      const activeRunActNumber = Number.isFinite(save?.activeRunActNumber) ? save.activeRunActNumber : null;
      const activeRunCongregation = Number.isFinite(save?.activeRunCongregation) ? save.activeRunCongregation : null;
      const congregationDisplay = activeRunCongregation !== null ? activeRunCongregation : totalCongregationBest;
      const activeRunDistrictId = save?.activeRunDistrictId || null;
      const districtIndex = activeRunDistrictId
        ? districtRows.findIndex((row) => row.districtId === activeRunDistrictId)
        : -1;
      const districtNumber = districtIndex >= 0 ? districtIndex + 1 : null;
      const missionNumber = activeRunActNumber !== null ? activeRunActNumber : null;
      const districtMissionLabel = districtNumber !== null && missionNumber !== null
        ? `Town ${districtNumber}.${missionNumber}`
        : districtNumber !== null
          ? `Town ${districtNumber}.1`
          : completed > 0
            ? `Town ${completed + 1}.1`
            : null;
      const cityName = (save?.cityName || "").trim();
      const classTitle = String(save?.classTitle || "").trim() || "Unknown";
      const _terms = window.BattlechurchCampaignLabels?.terms || {};
      const districtsLabel = _terms.districts || "Districts";
      const meta = `${classTitle}  ·  ${completed} / ${total} ${districtsLabel}`;
      return {
        id: save.id,
        key: `cloudsave:${save.id}`,
        label: save?.playerName || save?.saveName || "Pastor",
        meta,
        suggestedDistrictId: save?.suggestedDistrictId || null,
        isActive: save?.isActive === true,
        details: {
          saveName: save?.saveName || "Save",
          playerName: save?.playerName || "Pastor",
          cityName: cityName,
          classTitle,
          classId: save?.classId || null,
          completedDistricts: completed,
          totalDistricts: total,
          totalCongregationBest,
          totalReplayCompletions: Number.isFinite(save?.totalReplayCompletions) ? save.totalReplayCompletions : completedDistrictRows.length,
          totalUpgradeLevels: Number.isFinite(save?.totalUpgradeLevels) ? save.totalUpgradeLevels : 0,
          districtRows: districtRows,
        },
      };
    });
    if (!titleCloudSelectedSaveId || !titleCloudSaveRows.some((row) => row.id === titleCloudSelectedSaveId)) {
      titleCloudSelectedSaveId = titleCloudActiveSaveId || titleCloudSaveRows[0]?.id || null;
    }
    titleCloudSaveLoading = false;
  } catch (e) {
    titleCloudSaveLoading = false;
    titleCloudSaveRows = [];
    titleCloudSelectedSaveId = null;
  }
}

async function openMapFromCloudSave(saveId, { skipTutorialGate = false } = {}) {
  if (!saveId) return;
  if (!skipTutorialGate && !hasSeenTutorial()) {
    runFirstTimeTutorialThen(() => void openMapFromCloudSave(saveId, { skipTutorialGate: true }));
    return;
  }
  setDemoSandboxRunActive(false);
  titleDemoSaveOverride = null;
  titleCloudSelectedSaveId = saveId || titleCloudSelectedSaveId;
  if (saveId && typeof window.MapScreen?.setActiveSave === "function") {
    await window.MapScreen.setActiveSave(saveId);
  }
  const selectedRow =
    titleCloudSaveRows.find((row) => row.id === saveId) ||
    titleCloudSaveRows.find((row) => row.id === titleCloudSelectedSaveId) ||
    null;
  const suggestedDistrictId = selectedRow?.suggestedDistrictId || null;
  titleScreenActive = false;
  mapActive = true;
  if (window.MapScreen) {
    window.MapScreen.open();
    if (typeof window.MapScreen.reloadProgress === "function") {
      await window.MapScreen.reloadProgress();
    }
    if (suggestedDistrictId && typeof window.MapScreen.selectDistrict === "function") {
      window.MapScreen.selectDistrict(suggestedDistrictId);
    }
  }
  if (suggestedDistrictId) {
    activeDistrictId = suggestedDistrictId;
    if (typeof window !== "undefined") {
      window.activeDistrictId = activeDistrictId;
    }
  }
  titleDemoSaveMenuActive = false;
}

async function openMapFromDemoSlot(slot, { skipTutorialGate = false } = {}) {
  if (!slot?.districtId) return;
  if (!skipTutorialGate && !hasSeenTutorial()) {
    runFirstTimeTutorialThen(() => void openMapFromDemoSlot(slot, { skipTutorialGate: true }));
    return;
  }
  setDemoSandboxRunActive(true);
  await seedDemoSlotProgress(slot);
  titleDemoSaveOverride = {
    districtId: slot.districtId,
    campaignData: slot.campaignData || null,
  };
  if (typeof window !== "undefined" && window.MapScreen?.selectDistrict) {
    window.MapScreen.selectDistrict(slot.districtId);
  }
  activeDistrictId = slot.districtId;
  if (typeof window !== "undefined") {
    window.activeDistrictId = activeDistrictId;
  }
  titleScreenActive = false;
  mapActive = true;
  if (window.MapScreen?.open) window.MapScreen.open();
  titleDemoSaveMenuActive = false;
}

async function showTitleSavePickerOverlay() {
  if (!window.DialogOverlay?.show) return false;
  titleDemoSaveMenuActive = false;
  await refreshTitleCloudSaveOption();
  const isSignedIn = typeof window !== "undefined" && window.cloudAuthProvider === "google" && window.cloudEmail;
  const rows = Array.isArray(titleCloudSaveRows) ? titleCloudSaveRows : [];
  const demoSlots = Array.isArray(TITLE_DEMO_SAVE_SLOTS) ? TITLE_DEMO_SAVE_SLOTS : [];
  const totalRowsCount = rows.length + demoSlots.length;
  const cloudRowsHtml = rows
    .map((row) => {
      const selected = row?.id === titleCloudSelectedSaveId ? " save-picker__item--selected" : "";
      const activeBadge = row?.isActive ? '<span class="save-picker__badge">ACTIVE</span>' : "";
      return `
        <button type="button" class="save-picker__item${selected}" data-save-id="${escapeHtml(row.id)}">
          <span class="save-picker__item-icon">💾</span>
          <span class="save-picker__item-text">
            <span class="save-picker__item-title">${escapeHtml(row.label || "Save")}</span>
            <span class="save-picker__item-meta">${escapeHtml(row.meta || "")}</span>
          </span>
          ${activeBadge}
        </button>
      `;
    })
    .join("");
  const demoRowsHtml = demoSlots
    .map((slot, idx) => `
      <button type="button" class="save-picker__item save-picker__item--demo" data-demo-slot="${escapeHtml(slot?.key || `slot${idx + 1}`)}">
        <span class="save-picker__item-icon">🧪</span>
        <span class="save-picker__item-text">
          <span class="save-picker__item-title">${escapeHtml(slot?.label || `Demo Slot ${idx + 1}`)}</span>
          <span class="save-picker__item-meta">${escapeHtml(slot?.description || "Demo profile for QA/testing")}</span>
        </span>
      </button>
    `)
    .join("");
  const rowsHtml = `${cloudRowsHtml}${demoRowsHtml}` || `
    <div class="settings-row">
      <span class="settings-row__icon">ℹ️</span>
      <div class="settings-row__text">
        <div class="settings-row__label">No Save Files</div>
        <div class="settings-row__desc">Create a new save to start playing.</div>
      </div>
    </div>
  `;

  const bodyHtml = `
    <div class="settings-panel save-picker">
      <div class="save-picker__scrollbar">
        <button type="button" class="save-picker__scroll-btn" data-save-picker-scroll="up">▲</button>
        <button type="button" class="save-picker__scroll-btn" data-save-picker-scroll="down">▼</button>
      </div>
      <div class="save-picker__list" tabindex="0" role="listbox" aria-label="Save files">${rowsHtml}</div>
      <div class="save-picker__actions">
        ${
          isSignedIn
            ? `
            <button type="button" class="settings-btn--hellfire" data-save-picker-action="new">New Save</button>
            <button type="button" class="settings-btn--hellfire" data-save-picker-action="logout">Logout</button>
            `
            : `
            <button type="button" class="settings-btn--hellfire" data-save-picker-action="login">Login with Google</button>
            `
        }
        <button type="button" class="settings-btn--hellfire" data-save-picker-action="back">Back</button>
      </div>
    </div>
  `;

  window.DialogOverlay.show({
    title: "Choose Save",
    bodyHtml,
    buttonText: "",
    variant: "settings",
    onRender: ({ bodyEl, overlay }) => {
      if (overlay) {
        applyDefaultHellfirePanelStyle(overlay, true, "default");
      }
      if (!bodyEl) return;
      const closeOverlay = () => window.DialogOverlay?.hide?.();
      const listEl = bodyEl.querySelector(".save-picker__list");
      const scrollStepPx = 180;
      if (listEl) {
        setTimeout(() => {
          try { listEl.focus({ preventScroll: true }); } catch (_e) {}
        }, 0);
        listEl.addEventListener("keydown", (event) => {
          const k = String(event.key || "");
          if (k === "ArrowDown" || k === "s" || k === "S") {
            listEl.scrollBy({ top: scrollStepPx, behavior: "smooth" });
            event.preventDefault();
          } else if (k === "ArrowUp" || k === "w" || k === "W") {
            listEl.scrollBy({ top: -scrollStepPx, behavior: "smooth" });
            event.preventDefault();
          } else if (k === "PageDown") {
            listEl.scrollBy({ top: Math.max(220, listEl.clientHeight - 40), behavior: "smooth" });
            event.preventDefault();
          } else if (k === "PageUp") {
            listEl.scrollBy({ top: -Math.max(220, listEl.clientHeight - 40), behavior: "smooth" });
            event.preventDefault();
          }
        });
      }
      const toggleScrollButtons = () => {
        const upBtn = bodyEl.querySelector('[data-save-picker-scroll="up"]');
        const downBtn = bodyEl.querySelector('[data-save-picker-scroll="down"]');
        const canScroll = totalRowsCount > 6 && listEl;
        if (upBtn) upBtn.style.display = canScroll ? "inline-flex" : "none";
        if (downBtn) downBtn.style.display = canScroll ? "inline-flex" : "none";
      };
      toggleScrollButtons();
      bodyEl.querySelector('[data-save-picker-scroll="up"]')?.addEventListener("click", () => {
        if (!listEl) return;
        listEl.scrollBy({ top: -scrollStepPx, behavior: "smooth" });
      });
      bodyEl.querySelector('[data-save-picker-scroll="down"]')?.addEventListener("click", () => {
        if (!listEl) return;
        listEl.scrollBy({ top: scrollStepPx, behavior: "smooth" });
      });
      bodyEl.querySelectorAll("[data-save-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const saveId = String(button.getAttribute("data-save-id") || "");
          if (!saveId) return;
          titleCloudSelectedSaveId = saveId;
          closeOverlay();
          void openMapFromCloudSave(saveId);
        });
      });
      bodyEl.querySelectorAll("[data-demo-slot]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = String(button.getAttribute("data-demo-slot") || "");
          const slot = TITLE_DEMO_SAVE_SLOTS.find((entry) => String(entry?.key || "") === key);
          if (!slot?.districtId) return;
          closeOverlay();
          void openMapFromDemoSlot(slot);
        });
      });

      bodyEl.querySelector('[data-save-picker-action="new"]')?.addEventListener("click", () => {
        closeOverlay();
        showNewCloudSaveDialog();
      });
      bodyEl.querySelector('[data-save-picker-action="logout"]')?.addEventListener("click", () => {
        closeOverlay();
        void (async () => {
          try {
            if (window.Cloud?.signOut) await window.Cloud.signOut();
            await refreshTitleCloudSaveOption();
            await showTitleSavePickerOverlay();
          } catch (_e) {}
        })();
      });
      bodyEl.querySelector('[data-save-picker-action="login"]')?.addEventListener("click", () => {
        closeOverlay();
        void (async () => {
          try {
            if (window.Cloud?.signInWithGoogle) await window.Cloud.signInWithGoogle();
            await refreshTitleCloudSaveOption();
            await showTitleSavePickerOverlay();
          } catch (_e) {}
        })();
      });
      bodyEl.querySelector('[data-save-picker-action="back"]')?.addEventListener("click", () => {
        closeOverlay();
      });
    },
  });
  return true;
}

function _buildSaveFormOptionsHtml(classOptions, selectedId) {
  return classOptions
    .map((entry) => {
      const id = String(entry?.id || "");
      const title = String(entry?.classTitle || id || "Class");
      const desc = String(window.BattlechurchClassConfig?.byId?.[id]?.classDescription || "");
      const label = desc ? `${title}  —  ${desc}` : title;
      const selected = id === selectedId ? " selected" : "";
      return `<option value="${id}"${selected}>${label}</option>`;
    })
    .join("");
}

function showNewCloudSaveDialog() {
  if (!window.DialogOverlay?.show) return false;
  if (titleCloudSaveRows.length >= 3) return false;
  const classOptions = getSortedClassMenuEntries(classEntries);
  const defaultClassId = String(classOptions[0]?.id || "");
  const optionsHtml = _buildSaveFormOptionsHtml(classOptions, defaultClassId);
  window.DialogOverlay.show({
    title: "New Save",
    buttonText: "",
    variant: "save-form",
    bodyHtml: `
      <div class="save-form">
        <div class="save-form__pair">
          <input id="sf-playerName" class="save-form__input" type="text" placeholder="Pastor name" autocomplete="off" maxlength="32" />
          <input id="sf-cityName" class="save-form__input" type="text" placeholder="City (optional)" autocomplete="off" maxlength="32" />
        </div>
        <div class="save-form__inline">
          <span class="save-form__inline-label">Denomination</span>
          <select id="sf-classId" class="save-form__input">${optionsHtml}</select>
        </div>
        <div class="save-form__actions">
          <button type="button" id="sf-cancel" class="save-form__btn save-form__btn--cancel">Cancel</button>
          <button type="button" id="sf-submit" class="save-form__btn save-form__btn--primary">Create Save</button>
        </div>
      </div>
    `,
    onRender: ({ bodyEl }) => {
      const nameInput  = bodyEl?.querySelector("#sf-playerName");
      const cityInput  = bodyEl?.querySelector("#sf-cityName");
      const classInput = bodyEl?.querySelector("#sf-classId");
      const cancelBtn  = bodyEl?.querySelector("#sf-cancel");
      const submitBtn  = bodyEl?.querySelector("#sf-submit");
      setTimeout(() => { try { nameInput?.focus(); } catch (_e) {} }, 60);
      cancelBtn?.addEventListener("click", () => window.DialogOverlay?.hide?.());
      const doSubmit = () => {
        const playerName = String(nameInput?.value || "").trim();
        const cityName   = String(cityInput?.value  || "").trim();
        const classId    = String(classInput?.value || "").trim();
        if (!playerName) { nameInput?.focus(); return; }
        window.DialogOverlay?.hide?.();
        void (async () => {
          try {
            let newId = null;
            if (typeof window.MapScreen?.createSaveFile === "function") {
              newId = await window.MapScreen.createSaveFile({
                saveName: playerName, playerName, cityName, classId, setActive: true,
              });
            }
            if (typeof window.BattlechurchClasses?.setActive === "function") {
              window.BattlechurchClasses.setActive(classId);
            }
            if (newId) {
              await openMapFromCloudSave(newId);
            } else {
              await refreshTitleCloudSaveOption();
              titleUtilityPanelMode = null;
            }
          } catch (_e) {}
        })();
      };
      submitBtn?.addEventListener("click", doSubmit);
      bodyEl?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target?.tagName !== "BUTTON") { e.preventDefault(); doSubmit(); }
      });
    },
  });
  return true;
}

function showEditCloudSaveDialog(saveId) {
  if (!window.DialogOverlay?.show) return false;
  const row = titleCloudSaveRows.find((entry) => entry.id === saveId) || null;
  if (!row) return false;
  const details = row.details || {};
  const currentPlayerName = String(details.playerName || "Pastor").trim() || "Pastor";
  const currentCityName   = String(details.cityName || "").trim();
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  window.DialogOverlay.show({
    title: "Edit Save",
    buttonText: "",
    variant: "save-form",
    bodyHtml: `
      <div class="save-form">
        <div class="save-form__pair">
          <input id="ef-playerName" class="save-form__input" type="text" value="${esc(currentPlayerName)}" placeholder="Pastor name" autocomplete="off" maxlength="32" />
          <input id="ef-cityName" class="save-form__input" type="text" value="${esc(currentCityName)}" placeholder="City (optional)" autocomplete="off" maxlength="32" />
        </div>
        <div class="save-form__actions">
          <button type="button" id="ef-cancel" class="save-form__btn save-form__btn--cancel">Cancel</button>
          <button type="button" id="ef-submit" class="save-form__btn save-form__btn--primary">Apply Changes</button>
        </div>
      </div>
    `,
    onRender: ({ bodyEl }) => {
      const nameInput  = bodyEl?.querySelector("#ef-playerName");
      const cityInput  = bodyEl?.querySelector("#ef-cityName");
      const cancelBtn  = bodyEl?.querySelector("#ef-cancel");
      const submitBtn  = bodyEl?.querySelector("#ef-submit");
      setTimeout(() => { try { nameInput?.focus(); } catch (_e) {} }, 60);
      cancelBtn?.addEventListener("click", () => window.DialogOverlay?.hide?.());
      const doSubmit = () => {
        const playerName = String(nameInput?.value  || "").trim();
        const cityName   = String(cityInput?.value  || "").trim();
        if (!playerName) { nameInput?.focus(); return; }
        window.DialogOverlay?.hide?.();
        void (async () => {
          try {
            if (typeof window.MapScreen?.updateSaveFileMetadata === "function") {
              await window.MapScreen.updateSaveFileMetadata(saveId, {
                saveName: playerName, playerName, cityName,
              });
            }
            await refreshTitleCloudSaveOption();
            titleCloudSelectedSaveId = saveId;
          } catch (_e) {}
        })();
      };
      submitBtn?.addEventListener("click", doSubmit);
      bodyEl?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target?.tagName !== "BUTTON") { e.preventDefault(); doSubmit(); }
      });
    },
  });
  return true;
}

function showCloudSaveDetailsDialog(saveId) {
  const cloudRow = saveId
    ? titleCloudSaveRows.find((row) => row.id === saveId) || null
    : null;
  if (!cloudRow?.details) return false;
  const d = cloudRow.details;
  const districtRows = Array.isArray(d.districtRows) ? d.districtRows : [];
  const _detailTerms = window.BattlechurchCampaignLabels?.terms || {};
  const _districtTerm = _detailTerms.district || "District";
  const _districtsTerm = _detailTerms.districts || "Districts";
  const title = `${d.playerName || d.saveName || "Save"} - Full Details`;
  const lines = [];
  lines.push(`Pastor: ${d.playerName || "Pastor"}`);
  lines.push(`Denomination: ${d.classTitle || "Unknown"}`);
  lines.push(`${_districtsTerm} Cleared: ${Number(d.completedDistricts) || 0}/${Number(d.totalDistricts) || 10}`);
  lines.push(`Congregation Total: ${Number(d.totalCongregationBest) || 0}`);
  lines.push(`Runs: ${Number(d.totalReplayCompletions) || 0}`);
  lines.push(`Upgrade Levels: ${Number(d.totalUpgradeLevels) || 0}`);
  lines.push("");
  lines.push(`${_districtTerm} Breakdown:`);
  districtRows.forEach((row) => {
    lines.push(
      `${row?.districtName || _districtTerm} | ${row?.p1Completed ? "DONE" : "--"} | C:${Number(row?.bestCount) || 0} R:${Number(row?.completions) || 0} U:${Number(row?.upgradeLevelTotal) || 0}`,
    );
  });
  if (window.DialogOverlay?.show) {
    window.DialogOverlay.show({
      title,
      bodyHtml: `<div class="settings-panel"><pre style="white-space: pre-wrap; max-height: 58vh; overflow-y: auto; margin: 0;">${escapeHtml(lines.join("\n"))}</pre></div>`,
      buttonText: "Close",
      variant: "settings",
    });
  } else if (typeof window?.alert === "function") {
    window.alert(`${title}\n\n${lines.join("\n")}`);
  }
  return true;
}

function showCloudSaveMoreMenu(saveId) {
  if (!saveId || !window.DialogOverlay?.show) return false;
  const row = titleCloudSaveRows.find((entry) => entry.id === saveId) || null;
  if (!row) return false;
  if (typeof window !== "undefined") {
    window.__titleCloudRowMoreOpenFor = saveId;
  }
  window.DialogOverlay.show({
    title: `${row.label || "Save"} - More`,
    buttonText: "",
    variant: "settings",
    bodyHtml: `
      <div class="more-menu">
        <button type="button" id="cloudMoreView" class="more-menu__item">
          <span class="more-menu__icon">📋</span>
          <span class="more-menu__text">
            <span class="more-menu__name">View Full Details</span>
            <span class="more-menu__desc">Town breakdown, congregation totals, upgrades</span>
          </span>
        </button>
        <button type="button" id="cloudMoreEdit" class="more-menu__item">
          <span class="more-menu__icon">✏️</span>
          <span class="more-menu__text">
            <span class="more-menu__name">Edit Save</span>
            <span class="more-menu__desc">Rename file, player name, city, denomination</span>
          </span>
        </button>
        <button type="button" id="cloudMoreReset" class="more-menu__item more-menu__item--danger">
          <span class="more-menu__icon">↺</span>
          <span class="more-menu__text">
            <span class="more-menu__name">Reset Save Progress</span>
            <span class="more-menu__desc">Wipe all progress and start fresh</span>
          </span>
        </button>
        <button type="button" id="cloudMoreDelete" class="more-menu__item more-menu__item--danger">
          <span class="more-menu__icon">🗑</span>
          <span class="more-menu__text">
            <span class="more-menu__name">Delete Save</span>
            <span class="more-menu__desc">Permanently remove this save file</span>
          </span>
        </button>
        <button type="button" id="cloudMoreClose" class="more-menu__item more-menu__item--close">
          <span class="more-menu__icon">✕</span>
          <span class="more-menu__text">
            <span class="more-menu__name">Close</span>
          </span>
        </button>
      </div>
    `,
    onRender: ({ bodyEl }) => {
      const closeMenu = () => {
        if (typeof window !== "undefined") {
          window.__battlechurchSuppressMenuConfirmUntilRelease = true;
        }
        if (typeof Input !== "undefined" && Input?.keysJustPressed) {
          Input.keysJustPressed.delete(" ");
          Input.keysJustPressed.delete("enter");
          Input.keysJustPressed.delete("Enter");
        }
        if (typeof window !== "undefined") {
          window.__titleCloudRowMoreOpenFor = null;
        }
        window.DialogOverlay?.hide?.();
      };
      bodyEl?.querySelector("#cloudMoreClose")?.addEventListener("click", closeMenu);
      bodyEl?.querySelector("#cloudMoreView")?.addEventListener("click", () => {
        closeMenu();
        setTimeout(() => {
          showCloudSaveDetailsDialog(saveId);
        }, 0);
      });
      bodyEl?.querySelector("#cloudMoreEdit")?.addEventListener("click", () => {
        closeMenu();
        setTimeout(() => {
          showEditCloudSaveDialog(saveId);
        }, 0);
      });
      bodyEl?.querySelector("#cloudMoreReset")?.addEventListener("click", () => {
        closeMenu();
        void (async () => {
          const confirmed =
            typeof window === "undefined" ||
            typeof window.confirm !== "function" ||
            window.confirm("Reset highlighted save file progress to a fresh start? This cannot be undone.");
          if (!confirmed) return;
          if (typeof window.MapScreen?.resetSaveFile === "function") {
            await window.MapScreen.resetSaveFile(saveId);
          }
          titleCloudSelectedSaveId = saveId;
          await refreshTitleCloudSaveOption();
        })();
      });
      bodyEl?.querySelector("#cloudMoreDelete")?.addEventListener("click", () => {
        closeMenu();
        void (async () => {
          const confirmed =
            typeof window === "undefined" ||
            typeof window.confirm !== "function" ||
            window.confirm("Delete selected save file? This cannot be undone.");
          if (!confirmed) return;
          try {
            const deleted = await window.MapScreen?.deleteSaveFile?.(saveId);
            if (!deleted && typeof window?.alert === "function") {
              window.alert("Could not delete save. You must keep at least one save file.");
            }
          } catch (e) {
            if (typeof window?.alert === "function") {
              window.alert(`Delete failed: ${e?.message || "Unknown error"}`);
            }
          }
          await refreshTitleCloudSaveOption();
        })();
      });
    },
  });
  return true;
}

const PAUSE_BODY =
  uiTexts.pause?.body ||
  [
    "Game paused. Take a breather, then press Continue or Space to resume.",
    "Your congregation will hold its place while you choose to keep fighting.",
  ].join(" ");

const PAUSE_HOTKEYS_HTML = `
  <div class="pause-hotkeys pause-hotkeys--single">
    <div class="pause-hotkeys__title">Controls</div>
    <ul class="pause-hotkeys__list pause-hotkeys__list--compact">
      <li>Joystick/WASD: Move</li>
      <li>Arc or Arrow keys: Aim</li>
      <li>A/Left Arrow: Melee (hold to charge)</li>
      <li>B/Up Arrow: Dash</li>
      <li>C/Right Arrow: Tap volley, hold Purge</li>
      <li>Mouse: Aim</li>
      <li>Space: Pause / Resume</li>
    </ul>
  </div>
  <div class="pause-hotkeys__note">Press Continue or Space to resume.</div>
`;

function resumeFromPause() {
  pauseDialogActive = false;
  pauseRestartConfirmActive = false;
  paused = false;
  gameStarted = true;
  keysJustPressed.clear();
  window.isPauseOverlayActive = false;
  if (window.DialogOverlay && window.DialogOverlay.isVisible()) {
    window.DialogOverlay.hide();
  }
  if (typeof window !== "undefined" && typeof window.resumeBattleMusicIfNeeded === "function") {
    window.resumeBattleMusicIfNeeded();
  }
}

function showPauseDialog() {
  if (!window.DialogOverlay || pauseDialogActive) return;
  pauseDialogActive = true;
  window.isPauseOverlayActive = true;
  if (typeof window !== "undefined" && typeof window.pauseAllMusic === "function") {
    window.pauseAllMusic();
  }
  window.DialogOverlay.show({
    title: "Paused",
    bodyHtml: PAUSE_HOTKEYS_HTML,
    buttonText: "Continue",
    variant: "pause",
    devLabel: "",
    onContinue: () => {
      resumeFromPause();
    },
  });
}

let pendingUpgradeAfterSummary = false;
let pendingPastorPostRecapAfterUpgrade = false;
let pendingMissionSaveContext = null;
let epilogueActive = false;
let epilogueTitle = "Epilogue";
let epilogueText = "";
let epilogueBackgroundKey = "epilogue";
const progressSaveToast = {
  text: "",
  timer: 0,
  duration: 5.5,
  // simulated save bar state
  barProgress: 0,    // 0.0–1.0
  barDone: false,    // true once bar completed and "saved" phase triggered
  barFillDuration: 1.4, // seconds to fill bar to 100%
};

// Scrolling epilogue/credits system
const epilogueScroll = {
  phase: "epilogue", // "epilogue" | "credits" | "done"
  scrollY: 0,
  scrollSpeed: 40, // pixels per second
  startDelay: 1.5, // seconds before scrolling starts
  delayTimer: 0,
  contentHeight: 0,
  canvasHeight: 0,
  creditsStartY: 0,
  thankYouY: 0, // Y position of "Thank you for playing!" item
  showButton: false,
  paused: false,
};

// Town Victory scene (mini-epilogue after completing a town)
let districtVictoryActive = false;
let districtVictoryName = "";
let districtVictoryScore = 0;
let districtVictoryCampaign = "p1";
const districtVictoryScroll = {
  scrollY: 0,
  scrollSpeed: 35, // pixels per second (slightly slower than epilogue)
  startDelay: 1.0, // seconds before scrolling starts
  delayTimer: 0,
  contentHeight: 0,
  showButton: false,
};

function activateDistrictVictory(districtName, score, campaign = "p1") {
  districtVictoryName = districtName || "this town";
  districtVictoryScore = Number.isFinite(score) ? score : 0;
  districtVictoryCampaign = ["p1", "p2", "p3"].includes(String(campaign || "").toLowerCase())
    ? String(campaign).toLowerCase()
    : "p1";
  districtVictoryScroll.scrollY = 0;
  districtVictoryScroll.delayTimer = 0;
  districtVictoryScroll.contentHeight = 0;
  districtVictoryScroll.showButton = false;
  districtVictoryActive = true;
  stopRecapMusic();
  startMapMusic();
}

const CREDITS_CONTENT = [
  { type: "heading", text: "Credits" },
  { type: "spacer", height: 40 },
  { type: "label", text: "Created by" },
  { type: "name", text: "Conrad Tolosa" },
  { type: "spacer", height: 60 },
  { type: "label", text: "Art" },
  { type: "credit", text: "Pixel Art Pack by [Asset Creator]" },
  { type: "credit", text: "Additional sprites and backgrounds" },
  { type: "spacer", height: 60 },
  { type: "label", text: "Music & Sound" },
  { type: "credit", text: "Music from licensed packs" },
  { type: "credit", text: "Sound effects from various sources" },
  { type: "spacer", height: 60 },
  { type: "label", text: "Special Thanks" },
  { type: "credit", text: "Playtesters and supporters" },
  { type: "spacer", height: 100 },
  { type: "thankyou", text: "Thank you for playing!" },
  { type: "spacer", height: 200 },
];
const speedrunTimer = {
  visible: true,
  running: false,
  startTime: null,
  sectionStart: null,
  currentSection: null,
  totalElapsed: 0,
  sectionElapsed: 0,
  splits: [],
};

function getSpeedrunSectionName(levelStatus) {
  const stage = levelStatus?.stage;
  if (
    pendingDistrictIntroStart ||
    districtIntroTransitionActive ||
    levelAnnouncements[0]?.battlefieldIntro ||
    stage === "briefing" ||
    stage === "levelIntro"
  ) {
    return "Intro";
  }
  return levelStatus?.month || "Unknown";
}

function startSpeedrunTimer() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  speedrunTimer.running = true;
  speedrunTimer.startTime = now;
  speedrunTimer.sectionStart = now;
  speedrunTimer.currentSection = "Intro";
  speedrunTimer.totalElapsed = 0;
  speedrunTimer.sectionElapsed = 0;
  speedrunTimer.splits = [];
}

function startMissionTypewriter(overlay, text, msPerChar = 18) {
  if (!overlay) return;
  const target = overlay.querySelector(".mission-brief-text") || overlay.querySelector(".dialog-overlay__body");
  if (!target) return;
  if (overlay.__missionTypeTimer) clearInterval(overlay.__missionTypeTimer);
  target.textContent = "";
  let idx = 0;
  const payload = String(text || "");
  overlay.__missionTypeTimer = setInterval(() => {
    idx += 1;
    target.textContent = payload.slice(0, idx);
    if (idx >= payload.length) {
      clearInterval(overlay.__missionTypeTimer);
      overlay.__missionTypeTimer = null;
    }
  }, msPerChar);
}

function showBattleSummaryDialog(announcement, savedCount, lostCount, upgradeAfter, portraits = {}) {
  if (announcement?.recapPrepared) return true;
  startRecapIntroFade(1.5);
  const isFinalYear = Boolean(announcement?.finalYear);
  const shouldUpgradeAfter = Boolean(upgradeAfter);
  // Track which mission was just completed for chapter-break/visitor routing.
  const completedActNum = Number.isFinite(announcement?.completedActNum)
    ? announcement.completedActNum
    : (levelManager?.getActNumber ? levelManager.getActNumber() : 1);
  lastCompletedLevel = completedActNum;
  lastSummaryWasLevelEnd = true;
  const summary = levelManager?.getLastBattleSummary?.() || {};
  const status = levelManager?.getStatus?.() || null;
  const savedNames = Array.isArray(summary.savedNames)
    ? summary.savedNames.filter(Boolean)
    : [];
  const lostNames = Array.isArray(summary.lostNames)
    ? summary.lostNames.filter(Boolean)
    : [];
  const formatNameList = (names) => {
    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    if (!list.length) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  };
  const levelNumber = levelManager?.getLevelNumber ? levelManager.getLevelNumber() : 1;
  const currentSeasonNumber = levelNumber; // one season per level (4 months each)
  if (seasonStats.seasonNumber !== currentSeasonNumber) {
    seasonStats.seasonNumber = currentSeasonNumber;
    seasonStats.monthlyAdded = 0;
    seasonStats.lost = 0;
    seasonStats.bossBonus = 0;
    seasonStats.bossBonusApplied = false;
    seasonStats.recapShown = false;
    seasonStats.visitorAdded = 0;
    seasonStats.startCongregation = getCongregationSize();
  }
  const monthLabelFromAnnouncement = (() => {
    const titleText = String(announcement?.title || "");
    const match = titleText.match(/—\s*([^]+?)\s*Cleared/i);
    return match && match[1] ? match[1].trim() : null;
  })();
  const monthLabel =
    monthLabelFromAnnouncement ||
    (levelManager?.getStatus?.() && levelManager.getStatus().month) ||
    "This Month";
  const localMonthNumber = status?.battle || 1; // battle is 1-based month within the level
  const stage = status?.stage || "";
  const isBossSummary = Boolean(announcement?.levelSummary) || stage === "levelSummary";
  if (seasonStats.startCongregation == null) {
    seasonStats.startCongregation = getCongregationSize();
  }
  const npcHealthBreakdown = Array.isArray(summary?.npcHealthBreakdown)
    ? summary.npcHealthBreakdown
    : [];
  const totalNpcFaithRaw = Number.isFinite(summary?.totalNpcFaith) ? summary.totalNpcFaith : 0;
  const totalNpcFaith = Math.max(0, Math.min(500, Math.round(totalNpcFaithRaw)));
  const playerHealthAtRecap = Number.isFinite(player?.health) ? Math.max(0, Math.round(player.health)) : 0;
  const prayerBombComboContributions = Array.isArray(summary?.prayerBombComboContributions)
    ? summary.prayerBombComboContributions
        .map((value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0))
        .filter((value) => value > 0)
    : [];
  const prayerBombContributions = Array.isArray(summary?.prayerBombContributions)
    ? summary.prayerBombContributions
        .map((value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0))
        .filter((value) => value > 0)
    : [];
  const prayerBombTotal = prayerBombContributions.reduce((sum, value) => sum + value, 0);
  const prayerBombComboTotal = prayerBombComboContributions.reduce((sum, value) => sum + value, 0);
  const battleMaxChain = Number.isFinite(summary?.battleMaxChain)
    ? Math.max(0, Math.round(summary.battleMaxChain))
    : 0;
  const zeroHealthPenaltyCount = isBossSummary
    ? 0
    : npcHealthBreakdown.reduce(
        (sum, entry) => {
          const isRealNpc = Boolean((entry?.name || "").trim() || entry?.portrait);
          if (!isRealNpc) return sum;
          const faithValue = Number.isFinite(entry?.faith) ? Math.max(0, Math.round(entry.faith)) : 0;
          return sum + (faithValue <= 0 ? 1 : 0);
        },
        0,
      );
  const lostCongregationPenalty = zeroHealthPenaltyCount * NPC_LOSS_CONGREGATION_PENALTY;
  const healthRewardBase = isBossSummary ? 0 : Math.max(0, Math.min(5, Math.floor(totalNpcFaith / 100)));
  const healthReward = isBossSummary ? 0 : (healthRewardBase - lostCongregationPenalty);
  const perfectProtectionValue = !isBossSummary && totalNpcFaith >= 500 ? 100 : 0;
  const pastorHealthValue = playerHealthAtRecap;
  const maxChainPerformanceValue = battleMaxChain;
  const prayerBombPerformanceValue = prayerBombTotal;
  const congregationalPrayersPerformanceValue = prayerBombComboTotal;
  const battleEnemiesDefeated = Number.isFinite(summary?.battleEnemiesDefeated) ? Math.max(0, summary.battleEnemiesDefeated) : 0;
  const battleDamageDealt = Number.isFinite(summary?.battleDamageDealt) ? Math.max(0, summary.battleDamageDealt) : 0;
  const enemiesKilledPerformanceValue = Math.floor(battleEnemiesDefeated / 1000) * 100;
  // Damage bonus tuning: doubled divisor halves recap/performance contribution.
  const damageDealtPerformanceValue = Math.floor(battleDamageDealt / 20000) * 100;
  const performancePointTotal =
    perfectProtectionValue +
    pastorHealthValue +
    maxChainPerformanceValue +
    prayerBombPerformanceValue +
    congregationalPrayersPerformanceValue +
    enemiesKilledPerformanceValue +
    damageDealtPerformanceValue;
  const performanceCongregationReward = Math.floor(performancePointTotal / 100);
  const bossHealth = Number.isFinite(player?.health) ? player.health : 0;
  const PERFORMANCE_BONUS_BADGE_SRCS = {
    perfectCongregation: "assets/sprites/items/icons/I07_Apple.png",
    pastorHealth: "assets/sprites/items/Weapons/W14_Sword.png",
    maxChain: "assets/sprites/items/icons/I36_Hammer.png",
    prayerBomb: "assets/sprites/items/icons/A32_Decorative_Shield.png",
    congregationalPrayers: "assets/sprites/items/icons/A29_Iron_Shield.png",
    enemiesKilled: "assets/sprites/items/icons/A28_Kite_Shield.png",
    damageDealt: "assets/sprites/items/icons/A30_Tower_Shield.png",
  };
  const performanceBadgeBreakdown = [];
  if (pastorHealthValue > 0) {
    performanceBadgeBreakdown.push({
      id: "pastorHealth",
      label: "Pastor Health",
      iconSrc: PERFORMANCE_BONUS_BADGE_SRCS.pastorHealth,
      value: pastorHealthValue,
    });
  }
  if (maxChainPerformanceValue > 0) {
    performanceBadgeBreakdown.push({
      id: "maxChain",
      label: "Max Chain",
      iconSrc: PERFORMANCE_BONUS_BADGE_SRCS.maxChain,
      value: maxChainPerformanceValue,
    });
  }
  if (perfectProtectionValue > 0) {
    performanceBadgeBreakdown.push({
      id: "perfectProtection",
      label: "Perfect Protection",
      iconSrc: PERFORMANCE_BONUS_BADGE_SRCS.perfectCongregation,
      value: perfectProtectionValue,
    });
  }
  if (prayerBombPerformanceValue > 0) {
    performanceBadgeBreakdown.push({
      id: "prayerBomb",
      label: "Purge",
      iconSrc: PERFORMANCE_BONUS_BADGE_SRCS.prayerBomb,
      value: prayerBombPerformanceValue,
    });
  }
  if (congregationalPrayersPerformanceValue > 0) {
    performanceBadgeBreakdown.push({
      id: "congregationalPrayers",
      label: "Purify",
      iconSrc: PERFORMANCE_BONUS_BADGE_SRCS.congregationalPrayers,
      value: congregationalPrayersPerformanceValue,
    });
  }
  if (enemiesKilledPerformanceValue > 0) {
    performanceBadgeBreakdown.push({
      id: "enemiesKilled",
      label: "Enemies Slain",
      iconSrc: PERFORMANCE_BONUS_BADGE_SRCS.enemiesKilled,
      value: enemiesKilledPerformanceValue,
      rawStat: battleEnemiesDefeated,
    });
  }
  if (damageDealtPerformanceValue > 0) {
    performanceBadgeBreakdown.push({
      id: "damageDealt",
      label: "Damage Dealt",
      iconSrc: PERFORMANCE_BONUS_BADGE_SRCS.damageDealt,
      value: damageDealtPerformanceValue,
      rawStat: battleDamageDealt,
    });
  }
  if (!summary.congregationDeltaApplied) {
    adjustCongregationSize(healthReward + performanceCongregationReward);
    summary.congregationDeltaApplied = true;
    summary.healthReward = healthReward;
    summary.performanceBonusReward = performanceCongregationReward;
  }
  seasonStats.monthlyAdded += healthReward + performanceCongregationReward;
  seasonStats.lost += Math.max(0, lostCount || 0);
  const congregationTotal = getCongregationSize();
  const formatDelta = (value) => {
    const numeric = Number.isFinite(value) ? Math.round(value) : 0;
    const sign = numeric >= 0 ? "+" : "-";
    return `${sign}${formatNumberWithCommas(Math.abs(numeric))}`;
  };
  const totalDelta = healthReward + performanceCongregationReward;
  const graceBonusCongregants = Math.max(0, totalDelta);
  const graceBonus = 0;
  if (graceBonus > 0 && !summary.graceBonusApplied) {
    summary.graceBonusApplied = false;
    summary.graceBonus = graceBonus;
  }
  const recapLines = [];
  const scenario =
    summary?.battleScenario ||
    status?.battleScenario ||
    (typeof window !== "undefined" ? window.__lastMissionBriefScenario : null) ||
    announcement?.missionBriefScenario ||
    "a crisis";
  const scenarioTitle =
    typeof scenario === "string"
      ? scenario
      : scenario && typeof scenario === "object" && typeof scenario.title === "string"
        ? scenario.title
        : "a crisis";
  const scenarioRecap =
    scenario && typeof scenario === "object" && typeof scenario.recap === "string"
      ? scenario.recap
      : null;
  if (!isBossSummary) {
    recapLines.push({
      label: "Congregation Health Bonus:",
      delta: healthReward,
      kind: "npcHealthBonus",
      affectsTotal: true,
      totalHealth: totalNpcFaith,
      positiveHealthBonus: healthRewardBase,
      zeroHealthPenaltyCount,
      zeroHealthPenaltyValue: lostCongregationPenalty,
      npcHealthBreakdown,
    });
  }
  if (performanceBadgeBreakdown.length > 0) {
    recapLines.push({
      label: "Performance Bonuses:",
      delta: performanceCongregationReward,
      kind: "performanceBonuses",
      affectsTotal: true,
      totalPerformance: performancePointTotal,
      performanceCongregationReward,
      performanceBadgeBreakdown,
    });
  }
  const recapTitle = "Battlefield Report";
  const recapStartCount = Number.isFinite(summary?.battleStartCongregation)
    ? Math.round(summary.battleStartCongregation)
    : Math.round(congregationTotal - totalDelta);
  if (announcement) {
    announcement.recapData = {
      id: `${announcement.title || monthLabel || "recap"}|${levelNumber}|${localMonthNumber}`,
      title: recapTitle,
      startCount: recapStartCount,
      totalDelta,
      totalCount: congregationTotal,
      problemTitle: isBossSummary ? "" : scenarioTitle,
      lines: recapLines,
      graceBonus,
      graceBonusCongregants,
      graceApplied: false,
      graceAppliedCount: 0,
      graceSpawned: false,
    };
  }
  let paragraph = "";
  if (isBossSummary) {
    paragraph = `Pastor's Health: ${formatNumberWithCommas(bossHealth)}. Performance total: ${formatNumberWithCommas(performancePointTotal)} (${formatDelta(performanceCongregationReward)} congregants). Current Congregation Size: (${formatDelta(totalDelta)}) ${formatNumberWithCommas(congregationTotal)}`;
  } else {
    if (savedNames.length) {
      const names = savedNames.join(", ");
      paragraph += `You ministered to ${names}. `;
    }
    if (lostNames.length) {
      const names = lostNames.join(", ");
      const verb = lostNames.length === 1 ? "has" : "have";
      paragraph += `${names} ${verb} left the church. `;
    }
    const zeroPenaltyLabel = zeroHealthPenaltyCount === 1 ? "zero-health penalty" : "zero-health penalties";
    paragraph += `Their remaining health was ${formatNumberWithCommas(totalNpcFaith)} (${formatDelta(healthRewardBase)}), with ${formatNumberWithCommas(zeroHealthPenaltyCount)} ${zeroPenaltyLabel} (${formatDelta(-lostCongregationPenalty)}). Current Congregation Size: (${formatDelta(totalDelta)}) ${formatNumberWithCommas(congregationTotal)}`;
  }
  const body = paragraph;
  if (announcement) {
    announcement.recapTitle = recapTitle;
    announcement.recapBody = body;
    announcement.recapFinalYear = isFinalYear;
    announcement.recapUpgradeAfter = shouldUpgradeAfter;
    announcement.recapPrepared = true;
  }
  return true;
}

function createFloorPattern() {
  const tileSize = 48;
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = tileSize;
  patternCanvas.height = tileSize;
  const patternCtx = patternCanvas.getContext("2d");

  patternCtx.fillStyle = "#1a1d26";
  patternCtx.fillRect(0, 0, tileSize, tileSize);

  patternCtx.fillStyle = "#1f222b";
  patternCtx.fillRect(0, 0, tileSize / 2, tileSize / 2);
  patternCtx.fillRect(tileSize / 2, tileSize / 2, tileSize / 2, tileSize / 2);

  patternCtx.fillStyle = "#232632";
  patternCtx.fillRect(0, tileSize / 2 - 4, tileSize, 8);
  patternCtx.fillRect(tileSize / 2 - 4, 0, 8, tileSize);

  return ctx.createPattern(patternCanvas, "repeat");
}

const floorPattern = createFloorPattern();

// (moved to powerups.js)

const EARLY_BOSS_TYPE_POOL = ["bossHighDemon"];
const FINAL_TOWN_BOSS_TYPE = "bossDemonLord";
const BOSS_TYPE_POOL = [...EARLY_BOSS_TYPE_POOL, FINAL_TOWN_BOSS_TYPE];

function logBossSpriteIssue(payload) {
  try {
    const enriched = Object.assign(
      {
        timestamp: Date.now(),
        availableBossSprites: Object.keys((assets && assets.enemies) || {}).filter((key) =>
          BOSS_TYPE_POOL.includes(key),
        ),
      },
      payload || {},
    );
    window.__BATTLECHURCH_LAST_BOSS_ERROR = enriched;
    console.warn("Boss sprite issue detected", enriched);
  } catch (err) {
    console.warn("Boss sprite issue detected (logging failed)", payload, err);
  }
}

function resolveBossClips(type) {
  const enemyClips = assets?.enemies || null;
  if (!enemyClips) {
    logBossSpriteIssue({ reason: "assets-unloaded", requestedType: type });
    return null;
  }
  if (enemyClips[type]) {
    return { key: type, clips: enemyClips[type], fallback: false };
  }
  const fallbackType = BOSS_TYPE_POOL.find((candidate) => enemyClips[candidate]);
  if (fallbackType) {
    logBossSpriteIssue({ reason: "missing-requested-clips", requestedType: type, fallbackType });
    return { key: fallbackType, clips: enemyClips[fallbackType], fallback: true };
  }
  const genericKey = Object.keys(enemyClips).find((key) => enemyClips[key]);
  if (genericKey) {
    logBossSpriteIssue({
      reason: "no-boss-sprites-loaded",
      requestedType: type,
      fallbackType: genericKey,
      genericFallback: true,
    });
    return { key: genericKey, clips: enemyClips[genericKey], fallback: true };
  }
  logBossSpriteIssue({ reason: "no-enemy-sprites-loaded", requestedType: type });
  return null;
}

function chooseBossType(levelNumber) {
  const districtBossCount =
    typeof window !== "undefined" && Number.isFinite(window.BATTLES_PER_DISTRICT)
      ? window.BATTLES_PER_DISTRICT
      : 3;
  if (levelNumber >= districtBossCount) {
    return FINAL_TOWN_BOSS_TYPE;
  }
  if (!EARLY_BOSS_TYPE_POOL.length) return FINAL_TOWN_BOSS_TYPE;
  const index = (levelNumber - 1) % EARLY_BOSS_TYPE_POOL.length;
  return EARLY_BOSS_TYPE_POOL[index];
}

function spawnBossForLevel(levelNumber) {
  const fallbackType = FINAL_TOWN_BOSS_TYPE;
  const attempted = new Set();
  const trySpawn = (type) => {
    if (!type) return null;
    const boss = new BossEncounter({ level: levelNumber, type });
    if (boss && !boss.invalid) return boss;
    logBossSpriteIssue({ reason: "boss-constructor-invalid", requestedType: type });
    return null;
  };

  let bossType = chooseBossType(levelNumber);
  let boss = trySpawn(bossType);
  attempted.add(bossType);

  if (!boss) {
    for (const candidate of BOSS_TYPE_POOL) {
      if (attempted.has(candidate)) continue;
      boss = trySpawn(candidate);
      attempted.add(candidate);
      if (boss) break;
    }
  }

  if (!boss && !attempted.has(fallbackType)) {
    boss = trySpawn(fallbackType);
  }

  if (!boss) return null;
  activeBoss = boss;
  levelManager?.attachBoss(boss);
  if (player) {
    const leftMargin = Math.max(player.radius + 36, canvas.width * 0.08);
    const playfieldCenterY = HUD_HEIGHT + (canvas.height - HUD_HEIGHT) / 2;
    const maxY = canvas.height - player.radius - 20;
    player.x = leftMargin;
    player.y = Math.max(HUD_HEIGHT + player.radius + 20, Math.min(maxY, playfieldCenterY));
    clampEntityToBounds(player);
  }
  const status = levelManager?.getStatus ? levelManager.getStatus() : null;
  const theme = status?.bossTheme || "Boss battle";
  setDevStatus(`${theme} (Phase 1)`, 3.5);
  return boss;
}

function eliminateActiveEnemiesForBossVictory() {
  enemies.forEach((enemy) => {
    if (!enemy || enemy.dead || enemy.state === "death") return;
    if (typeof enemy.takeDamage === "function") {
      const health = Number.isFinite(enemy.health) ? enemy.health : enemy.config?.health || 10;
      enemy.takeDamage(health + 1000);
    } else {
      enemy.dead = true;
      enemy.state = "death";
    }
  });
  bossHazards.forEach((hazard) => {
    if (hazard) {
      hazard.dead = true;
      hazard.life = 0;
    }
  });
}

function rebuildObstacles() {
  if (!assets?.obstacles) return;
  obstacles.splice(0, obstacles.length);
  OBSTACLE_LAYOUT.forEach(({ key, xRatio, yRatio }) => {
    const asset = assets.obstacles[key];
    if (!asset) return;
    const obstacle = new Obstacle(asset, xRatio, yRatio);
    obstacles.push(obstacle);
  });
  positionObstacles();
}

function positionObstacles() {
  obstacles.forEach((obstacle) => obstacle.updatePosition());
}

// (moved to powerups.js)

function queueLevelAnnouncement(title, subtitle = "", durationOrOptions = 2.5, maybeOptions = undefined) {
  if (!title) return;
  let duration = 2.5;
  let options = {};
  if (typeof durationOrOptions === "number") {
    duration = durationOrOptions;
    if (maybeOptions && typeof maybeOptions === "object") options = maybeOptions;
  } else if (typeof durationOrOptions === "object" && durationOrOptions !== null) {
    options = durationOrOptions;
    if (typeof options.duration === "number") {
      duration = options.duration;
    }
  }
  const requiresConfirm = Boolean(options.requiresConfirm);
  const skipMissionBrief = Boolean(options.skipMissionBrief);
  const battlefieldIntro = Boolean(options.battlefieldIntro || options.missionIntro);
  const exteriorShot = Boolean(options.exteriorShot);
  const allowDuringSuppression = Boolean(options.allowDuringSuppression);
  if (suppressInitialAnnouncements && !allowDuringSuppression) return;
  const missionBriefTitle =
    typeof options.missionBriefTitle === "string" && options.missionBriefTitle.trim().length
      ? options.missionBriefTitle
      : null;
  const bossMissionBrief = Boolean(options.bossMissionBrief);
  const finalYear = Boolean(options.finalYear);
  const pastorFinal = Boolean(options.pastorFinal);
  const pastorPostRecap = Boolean(options.pastorPostRecap);
  const missionNumber = Number.isFinite(options.missionNumber) ? options.missionNumber : null;
  const upcomingBattlefieldNumber = Number.isFinite(options.upcomingBattlefieldNumber)
    ? options.upcomingBattlefieldNumber
    : null;
  const upcomingBattlefieldOrderNumber = Number.isFinite(options.upcomingBattlefieldOrderNumber)
    ? options.upcomingBattlefieldOrderNumber
    : null;
  const pastorPostRecapDelay = Number.isFinite(options.pastorPostRecapDelay)
    ? Math.max(0, options.pastorPostRecapDelay)
    : 0;
  const pastorPostRecapUpgradeAfter = Boolean(options.pastorPostRecapUpgradeAfter);
  const levelSummary = Boolean(options.levelSummary);
  const actBreakFlatBattle = Number.isFinite(options.actBreakFlatBattle) ? Math.max(1, Math.floor(options.actBreakFlatBattle)) : null;
  const fadeOutDuration = Number.isFinite(options.fadeOutDuration)
    ? Math.max(0.05, options.fadeOutDuration)
    : null;
  const showSubtitle = Boolean(options.showSubtitle);
  const eyebrowText =
    typeof options.eyebrowText === "string" && options.eyebrowText.trim().length
      ? options.eyebrowText.trim()
      : "";
  const announcement = {
    title,
    subtitle,
    eyebrowText,
    duration,
    timer: duration,
    requiresConfirm,
    skipMissionBrief,
    missionBriefTitle,
    battlefieldIntro,
    exteriorShot,
    bossMissionBrief,
    missionNumber,
    upcomingBattlefieldNumber,
    upcomingBattlefieldOrderNumber,
    finalYear,
    levelSummary,
    fadeOutDuration,
    showSubtitle,
    pastorFinal,
    pastorPostRecap,
    pastorPostRecapDelay,
    pastorPostRecapUpgradeAfter,
    actBreakFlatBattle,
  };
  if (requiresConfirm && Array.isArray(levelAnnouncements) && levelAnnouncements.length) {
    // Confirm-gated overlays (mission brief, recap, etc.) must take priority.
    // Clear transient timed overlays so they can't sit in front and block flow.
    for (let i = levelAnnouncements.length - 1; i >= 0; i -= 1) {
      if (!levelAnnouncements[i]?.requiresConfirm) {
        levelAnnouncements.splice(i, 1);
      }
    }
  }
  if (
    missionBriefTitle &&
    !bossMissionBrief &&
    typeof subtitle === "string" &&
    subtitle.trim().length &&
    typeof window !== "undefined"
  ) {
    window.__lastMissionBriefScenario = subtitle.trim();
  }
  levelAnnouncements.push(announcement);
}

function updateLevelAnnouncements(dt) {
  for (let i = levelAnnouncements.length - 1; i >= 0; i -= 1) {
    const announcement = levelAnnouncements[i];
    if (announcement.exteriorShot) {
      announcement.timer -= dt;
      if (announcement.timer <= 0) {
        if (i === 0) {
          startDistrictIntroTransition();
          return;
        }
        levelAnnouncements.splice(i, 1);
      }
      continue;
    }
    if (announcement.requiresConfirm) continue;
    announcement.timer -= dt;
    if (announcement.timer <= 0) {
      levelAnnouncements.splice(i, 1);
    }
  }
}

function setPlayerPrayerToLevelStartBars(bars = 2) {
  if (!player) return;
  const required = Math.max(
    1,
    Number(player.prayerChargeRequired) || Number(PRAYER_BOMB_CHARGE_REQUIRED) || 6000,
  );
  const clampedBars = Math.max(0, Math.min(6, Number(bars) || 0));
  player.prayerCharge = Math.round((clampedBars / 6) * required);
  player.prayerHoldTimer = 0;
  player.prayerHoldLocked = false;
}

let lastPrayerFloorBattleKey = "";
function ensurePlayerPrayerFloorForBattleStart(levelStatus, bars = 2) {
  if (!player || !levelStatus) return;
  const stage = String(levelStatus.stage || "");
  const waveNum = Number(levelStatus.waveNum || levelStatus.wave || 0);
  if (stage !== "waveIntro" || waveNum !== 1) return;
  const battleKey = [
    Number(levelStatus.level) || 0,
    Number(levelStatus.battle) || 0,
    Number(levelStatus.year) || 0,
    Number(levelStatus.season) || 0,
  ].join(":");
  if (lastPrayerFloorBattleKey === battleKey) return;
  lastPrayerFloorBattleKey = battleKey;

  const required = Math.max(
    1,
    Number(player.prayerChargeRequired) || Number(PRAYER_BOMB_CHARGE_REQUIRED) || 6000,
  );
  const minimumCharge = Math.round((Math.max(0, Math.min(6, Number(bars) || 0)) / 6) * required);
  if ((player.prayerCharge || 0) < minimumCharge) {
    player.prayerCharge = minimumCharge;
  }
}

function dismissCurrentLevelAnnouncement() {
  if (!levelAnnouncements.length) return;
  // Clear any pending prayer bomb input to prevent accidental activation after dismissal
  if (typeof Input !== "undefined" && "prayerBombClickQueued" in Input) {
    Input.prayerBombClickQueued = false;
  }
  const current = levelAnnouncements[0];
  if (!current.requiresConfirm) {
    levelAnnouncements.shift();
    return;
  }
  levelAnnouncements.shift();
  if (current.isVisitorSummary) {
    const reason = current.summaryReason || "summary";
    visitorSession.summaryReason = null;
    visitorSession.awaitingSummaryConfirm = false;
    completeVisitorSession(reason);
  }
  if (current.battlefieldIntro) {
    // Every new battlefield/level starts with 2 bars (2/6) of prayer meter.
    setPlayerPrayerToLevelStartBars(2);
    pendingDistrictIntroStart = true;
    districtIntroDismissedAt =
      typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    suppressInitialAnnouncements = true;
    paused = false;
    const _districtList = window.BattlechurchMapData?.towns;
    const _districtIdx = _districtList ? _districtList.findIndex((t) => t.id === activeDistrictId) : -1;
    const _levelNum = _districtIdx >= 0 ? _districtIdx + 1 : 1;
    // Towns beyond the first skip the congregation screen in levels.js, so
    // suppressInitialAnnouncements would never be cleared — clear it now.
    if (_levelNum > 1) {
      suppressInitialAnnouncements = false;
      pendingDistrictIntroStart = false;
    }
    // Act 2/3 chapter-break intros: skip congregation, jump straight to teaser → battle brief
    if (Number.isFinite(current.actBreakFlatBattle) && current.actBreakFlatBattle > 1) {
      suppressInitialAnnouncements = false;
      pendingDistrictIntroStart = false;
      if (levelManager && typeof levelManager.beginBattleFromDistrictIntro === "function") {
        levelManager.beginBattleFromDistrictIntro(_levelNum, current.actBreakFlatBattle);
      }
      pendingBattlefieldStartOverride = null;
      if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
      return;
    }
    const devStartOverride =
      pendingBattlefieldStartOverride &&
      pendingBattlefieldStartOverride.districtId === activeDistrictId
        ? pendingBattlefieldStartOverride
        : null;
    const targetBattle = Number.isFinite(devStartOverride?.localBattlefieldNumber)
      ? Math.max(1, Math.floor(devStartOverride.localBattlefieldNumber))
      : 1;
    if (devStartOverride && levelManager && typeof levelManager.beginBattleFromDistrictIntro === "function") {
      levelManager.beginBattleFromDistrictIntro(_levelNum, targetBattle);
    } else if (levelManager && typeof levelManager.beginFromDistrictIntro === "function") {
      levelManager.beginFromDistrictIntro(_levelNum);
    } else if (levelManager && typeof levelManager.begin === "function") {
      levelManager.begin();
    } else if (levelManager && typeof levelManager.startBriefing === "function") {
      levelManager.startBriefing(_levelNum);
    } else if (levelManager && typeof levelManager.advanceFromBriefing === "function") {
      levelManager.advanceFromBriefing(_levelNum);
    }
    pendingBattlefieldStartOverride = null;
    if (Array.isArray(levelAnnouncements)) {
      levelAnnouncements.length = 0;
    }
  }
  if (levelManager?.acknowledgeAnnouncement) {
    try { levelManager.acknowledgeAnnouncement(); } catch (e) {}
  }
}

function isBattleSummaryAnnouncement(announcement) {
  if (!announcement || !announcement.title) return false;
  const lowerTitle = String(announcement.title).toLowerCase();
  return (
    lowerTitle.includes("cleared") ||
    lowerTitle.includes("horde") && lowerTitle.includes("cleared")
  );
}

function setDevStatus(text, duration = 2.5) {
  if (!text) {
    devStatus.text = "";
    devStatus.timer = 0;
    return;
  }
  devStatus.text = text;
  devStatus.timer = duration;
  console.log(`[stage] ${text}`);
}

function updateDevStatus(dt) {
  if (devStatus.timer > 0) {
    devStatus.timer = Math.max(0, devStatus.timer - dt);
  }
}

function drawDevStatus() {
  // Developer status messages are intentionally not drawn in the HUD.
  // They can still be stored (devStatus) for programmatic checks but are hidden.
  return;
}

function _triggerProgressSavedEffects() {
  if (typeof playProgressSavedSfx === "function") playProgressSavedSfx(0.7);
}

function shouldShowProgressSaveToast() {
  // Keep title/utility navigation deterministic: no transient toast overlays there.
  return !titleScreenActive;
}

function showProgressSaveToast(text = "Progress Saved", duration = 5.5) {
  if (!shouldShowProgressSaveToast()) return;
  const isProgressSaved = text === "Progress Saved" || text === "progress saved";
  progressSaveToast.text = String(text || "Progress Saved");
  progressSaveToast.duration = Number.isFinite(duration) ? Math.max(0.8, duration) : 5.5;
  progressSaveToast.timer = progressSaveToast.duration;
  progressSaveToast.barProgress = 0;
  progressSaveToast.barDone = true; // skip bar phase — show text directly

  if (isProgressSaved) {
    _triggerProgressSavedEffects();
  }
}

function startSaveProgressBar() {
  if (!shouldShowProgressSaveToast()) return;
  progressSaveToast.text = "Saving...";
  progressSaveToast.duration = 999;
  progressSaveToast.timer = 999;
  progressSaveToast.barProgress = 0;
  progressSaveToast.barDone = false;
}

function updateProgressSaveToast(dt) {
  if (progressSaveToast.timer <= 0) return;
  const delta = Math.max(0, Number(dt) || 0);
  // Animate the simulated save bar
  if (!progressSaveToast.barDone) {
    progressSaveToast.barProgress = Math.min(1, progressSaveToast.barProgress + delta / progressSaveToast.barFillDuration);
    if (progressSaveToast.barProgress >= 1) {
      progressSaveToast.barDone = true;
      progressSaveToast.text = "Progress Saved";
      progressSaveToast.duration = 4.0;
      progressSaveToast.timer = 4.0;
      _triggerProgressSavedEffects();
      return;
    }
    return; // hold timer while bar is filling
  }
  progressSaveToast.timer = Math.max(0, progressSaveToast.timer - delta);
}

function drawProgressSaveToast() {
  if (progressSaveToast.timer <= 0 || !ctx || !canvas) return;
  const isSaving = !progressSaveToast.barDone;
  // Always fully opaque while saving; fade out after saved
  let alpha = 1;
  if (!isSaving) {
    const t = progressSaveToast.duration > 0 ? progressSaveToast.timer / progressSaveToast.duration : 0;
    alpha = Math.max(0, Math.min(1, t * (progressSaveToast.duration / 0.6)));
  }
  const toastWidth = 440;
  const toastHeight = isSaving ? 114 : 96;
  const x = (canvas.width - toastWidth) / 2;
  const y = (canvas.height - toastHeight) / 2;
  const r = 10;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Dark brown gradient fill
  const grad = ctx.createLinearGradient(x, y, x, y + toastHeight);
  grad.addColorStop(0, "#2A2118");
  grad.addColorStop(1, "#1E1812");
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, toastWidth, toastHeight, r, true, false);
  // Gold outer border
  ctx.strokeStyle = "rgba(200,160,90,0.85)";
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, toastWidth, toastHeight, r, false, true);
  // Inner cream accent line
  ctx.strokeStyle = "rgba(243,226,196,0.25)";
  ctx.lineWidth = 1;
  roundRect(ctx, x + 4, y + 4, toastWidth - 8, toastHeight - 8, r - 2, false, true);
  if (isSaving) {
    // "Saving..." label at top
    ctx.fillStyle = "#F3E2C4";
    ctx.font = `600 22px ${UI_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Saving...", x + toastWidth / 2, y + 36);
    // Progress bar track
    const barPad = 24;
    const barY = y + 62;
    const barH = 22;
    const barW = toastWidth - barPad * 2;
    const bx = x + barPad;
    ctx.fillStyle = "rgba(62, 20, 14, 0.94)";
    roundRect(ctx, bx, barY, barW, barH, 6, true, false);
    ctx.strokeStyle = "rgba(200,160,90,0.6)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, barY, barW, barH, 6, false, true);
    // Progress fill
    const fillW = barW * progressSaveToast.barProgress;
    if (fillW > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(bx, barY, barW, barH, 6);
      ctx.clip();
      const fillGrad = ctx.createLinearGradient(bx, barY, bx, barY + barH);
      fillGrad.addColorStop(0, "#F1882F");
      fillGrad.addColorStop(1, "#A83C10");
      ctx.fillStyle = fillGrad;
      ctx.fillRect(bx, barY, fillW, barH);
      ctx.restore();
    }
  } else {
    // "Progress Saved" centered
    ctx.fillStyle = "#F3E2C4";
    ctx.font = `800 30px ${UI_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(progressSaveToast.text, x + toastWidth / 2, y + toastHeight / 2 + 1);
  }
  ctx.restore();
}

async function saveMissionProgressContext(context) {
  if (!context || demoSandboxRunActive) return true;
  if (!window.MapScreen) return false;
  startSaveProgressBar();
  try {
    const powerupSnapshot = Object.fromEntries(churchPowerupLevels);
    if (context.kind === "finalTown") {
      await window.MapScreen.recordDistrictCompletion(
        context.districtId,
        context.finalScore,
        context.campaign,
        powerupSnapshot,
        getGraceCount(),
      );
      // Bar auto-transitions to "Progress Saved" — no need to call showProgressSaveToast here
      return true;
    }
    if (context.kind === "missionCheckpoint") {
      const ok = await window.MapScreen.saveMissionCheckpoint({
        districtId: context.districtId,
        campaign: context.campaign,
        resumeLocalBattleNumber: context.resumeLocalBattleNumber,
        startCount: context.startCount,
        churchPowerupLevels: powerupSnapshot,
        graceCount: getGraceCount(),
      });
      if (ok === false) {
        showProgressSaveToast("Save Failed", 2.2);
        return false;
      }
      return true;
    }
  } catch (error) {
    console.warn && console.warn("Failed to save mission progress", error);
  }
  showProgressSaveToast("Save Failed", 2.2);
  return false;
}

function runPostUpgradeSaveThen(callback) {
  const context = pendingMissionSaveContext;
  pendingMissionSaveContext = null;
  const finish = typeof callback === "function" ? callback : () => {};
  if (!context) {
    finish();
    return;
  }
  void (async () => {
    await saveMissionProgressContext(context);
    finish();
  })();
}

function drawNpcHomeBounds() {
  // Developer-only homebase border removed per request; keep function for potential future toggles.
  return;
}

function triggerHeroRescueCall() {
  if (heroRescueCooldown > 0 || !player) return;
  heroSay("I'll save you!");
  heroRescueCooldown = 2.5;
}

function applyEnemyTouchDamage(enemy) {
  if (!enemy || enemy.state === "death") return;
  if (enemy._orbiting) return;
  if (isEnemyInKnockback(enemy)) return;
  if ((enemy.touchCooldown || 0) > 0) return;
  if (
    enemy.state === "attack" &&
    Number.isFinite(enemy.config?.attackHitFrame) &&
    enemy.config.attackHitFrame > 0
  ) {
    return;
  }

  if (player && player.state !== "death") {
    const center = getEnemyHitboxCenter(enemy);
    const touchRadius = getEnemyHitboxRadius(enemy);
    if (circleIntersectsPlayerHurtbox(center.x, center.y, touchRadius, player)) {
      if (player.invulnerableTimer > 0) {
        enemy.touchCooldown = Math.max(enemy.touchCooldown || 0, 0.35);
        return;
      }
      if (player.shieldTimer > 0) {
        applyShieldImpact(enemy);
        enemy.touchCooldown = Math.max(enemy.touchCooldown || 0, 0.25);
        return;
      }
      enemy.touchCooldown = 1.4;
      return;
    }
  }

  if (Array.isArray(npcs) && npcs.length) {
    for (const npc of npcs) {
      if (!npc || npc.departed) continue;
      const center = getEnemyHitboxCenter(enemy);
      const dx = center.x - npc.x;
      const dy = center.y - npc.y;
      const distance = Math.hypot(dx, dy);
      const threshold = getEnemyHitboxRadius(enemy) + (npc.radius || 24);
      if (distance <= threshold) {
        enemy.touchCooldown = 1.2;
        return;
      }
    }
  }
}


function applyShieldImpact(target) {
  if (!player || player.shieldTimer <= 0) return false;
  if (!target || target.dead || target.state === "death") return false;
  const targetRadius = getEnemyHitboxRadius(target) || target.radius || 30;
  const center = getEnemyHitboxCenter(target);
  const dx = center.x - player.x;
  const dy = center.y - player.y;
  const distance = Math.hypot(dx, dy);
  const shieldReach = player.radius * 1.6 + targetRadius;
  if (distance > shieldReach) return false;

  const isLargeTarget = targetRadius >= SHIELD_LARGE_RADIUS_THRESHOLD;
  const damage = isLargeTarget ? SHIELD_LARGE_DAMAGE : SHIELD_SMALL_DAMAGE;
  if (isLargeTarget) {
    if ((target.shieldHitCooldown || 0) > 0) {
      if (typeof target.touchCooldown === "number") {
        target.touchCooldown = Math.max(target.touchCooldown, SHIELD_LARGE_COOLDOWN);
      }
      return true;
    }
    if (typeof target.takeDamage === "function") {
      target.takeDamage(damage);
    }
    target.shieldHitCooldown = SHIELD_LARGE_COOLDOWN;
  } else {
    if (typeof target.takeDamage === "function") {
      target.takeDamage(damage);
    }
    target.shieldHitCooldown = SHIELD_LARGE_COOLDOWN;
  }
  registerChainHit(target, damage);
  spawnFlashEffect(target.x, target.y - targetRadius / 2);
  spawnPuffEffect(center.x, center.y, Math.max(18, targetRadius * 0.65));
  if (typeof playFaithHitSfx === "function") {
    playFaithHitSfx(0.75);
  }
  applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_HIT_SHAKE_MAGNITUDE);
  if (typeof target.touchCooldown === "number") {
    target.touchCooldown = Math.max(target.touchCooldown, SHIELD_LARGE_COOLDOWN);
  }
  return true;
}

function detonateWisdomMissleProjectile(projectile) {
  let radius = MAGIC_SPLASH_RADIUS;
  if (projectile?.source?.isCozyNpc) {
    radius = MAGIC_SPLASH_RADIUS * 0.5;
  }
  const centerX = projectile.x;
  const centerY = projectile.y;
  if (typeof playWisdomHitSfx === "function") {
    playWisdomHitSfx(0.8);
  }
  const baseDamage = projectile.getDamage() * MAGIC_SPLASH_DAMAGE_MULTIPLIER;
  applyProjectileSplashDamage(projectile, centerX, centerY, radius, baseDamage, {
    skipBossImpact: true,
    churchPowerup: true,
  });
  spawnMagicSplashEffect(centerX, centerY, radius);
  projectile.dead = true;
  const shakeMult = Number.isFinite(projectile?.hitShakeMultiplier) ? projectile.hitShakeMultiplier : 1;
  applyCameraShake(WISDOM_HIT_SHAKE_DURATION, WISDOM_HIT_SHAKE_MAGNITUDE * shakeMult);
}

function detonateFaithCannonProjectile(projectile, { endOfRange = false } = {}) {
  if (!projectile || projectile.dead) return;
  let radius = FAITH_CANNON_SPLASH_RADIUS;
  if (projectile?.source?.isCozyNpc) {
    radius = FAITH_CANNON_SPLASH_RADIUS * 0.5;
  }
  const centerX = projectile.x;
  const centerY = projectile.y;
  if (typeof playFaithHitSfx === "function") {
    playFaithHitSfx(0.8);
  }
  const splashDamage = projectile.getDamage() * FAITH_CANNON_SPLASH_DAMAGE_MULTIPLIER;
  applyProjectileSplashDamage(projectile, centerX, centerY, radius, splashDamage, {
    skipBossImpact: true,
    churchPowerup: true,
  });
  if (endOfRange) {
    spawnImpactDustEffect(centerX, centerY);
  } else {
    spawnPuffEffect(centerX, centerY);
  }
  projectile.dead = true;
  const shakeMult = Number.isFinite(projectile?.hitShakeMultiplier) ? projectile.hitShakeMultiplier : 1;
  applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_WEAPON_HIT_SHAKE_MAGNITUDE * shakeMult);
}

function triggerScriptureHitFeedback(hitX, hitY, { isBoss = false, shakeScale = 1 } = {}) {
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  if (now - scriptureHitBurstStartedAt > SCRIPTURE_HIT_BURST_WINDOW_MS) {
    scriptureHitBurstStartedAt = now;
    scriptureHitBurstSfxCount = 0;
  }
  if (scriptureHitBurstSfxCount < SCRIPTURE_HIT_BURST_MAX_SFX) {
    scriptureHitBurstSfxCount += 1;
    if (typeof playFaithHitSfx === "function") {
      const volume = isBoss ? 0.75 : 0.62 + Math.random() * 0.12;
      playFaithHitSfx(volume);
    }
  }
  spawnPuffEffect(hitX, hitY, isBoss ? 22 : 20);
  applyCameraShake(SCRIPTURE_HIT_SHAKE_DURATION, SCRIPTURE_HIT_SHAKE_MAGNITUDE * Math.max(0, shakeScale));
}

function updateAimAssist() {
  aimAssist.target = null;
  aimAssist.targetKind = null;
  aimAssist.vertices = null;
  if (!player || aimState.usingPointer) return;

  const dir = player.getAimDirection();
  if (!dir.x && !dir.y) return;

  const forward = dir;
  const length = AIM_ASSIST_LENGTH;
  const halfFov = AIM_ASSIST_FOV / 2;
  const cosThreshold = Math.cos(halfFov);

  const origin = { x: player.x, y: player.y };
  const leftDir = rotateVector(forward, halfFov);
  const rightDir = rotateVector(forward, -halfFov);
  aimAssist.vertices = {
    origin,
    left: { x: origin.x + leftDir.x * length, y: origin.y + leftDir.y * length },
    right: { x: origin.x + rightDir.x * length, y: origin.y + rightDir.y * length },
  };

  const candidates = [];
  enemies.forEach((enemy) => {
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    candidates.push({ entity: enemy, kind: "enemy" });
  });
  projectiles.forEach((projectile) => {
    if (!projectile || projectile.dead || projectile.friendly) return;
    candidates.push({ entity: projectile, kind: "projectile" });
  });
  // NPCs are intentionally excluded from aim-assist candidates to keep
  // player aim under direct control and avoid auto-targeting friendly NPCs.

  const priorityForKind = (kind) => {
    if (kind === "npc") return 0;
    if (kind === "projectile") return 0;
    return 1;
  };

  let bestCandidate = null;
  let bestPriority = Infinity;
  let bestDistance = Infinity;
  candidates.forEach(({ entity, kind }) => {
    const center = kind === "enemy" ? getEnemyHitboxCenter(entity) : { x: entity.x, y: entity.y };
    const vx = center.x - origin.x;
    const vy = center.y - origin.y;
    const distance = Math.hypot(vx, vy);
    if (!distance || distance > length) return;
    const cosAngle = (vx * forward.x + vy * forward.y) / distance;
    if (cosAngle < cosThreshold) return;
    const priority = priorityForKind(kind);
    if (priority < bestPriority || (priority === bestPriority && distance < bestDistance)) {
      bestPriority = priority;
      bestDistance = distance;
      bestCandidate = { entity, kind };
    }
  });

  if (bestCandidate) {
    aimAssist.target = bestCandidate.entity;
    aimAssist.targetKind = bestCandidate.kind;
  }
}

function clampEntityToBounds(entity) {
  const radius = Math.max(entity.radius || 0, 0);
  if (entity?.spawnOffscreenTimer > 0) return;
  if (entity?.ignoreWorldBounds) return;
  const offset = getEntityCollisionOffset(entity);
  const centerX = (entity?.x || 0) + offset.x;
  const centerY = (entity?.y || 0) + offset.y;
  const lateralMargin = Math.max(radius, 16);
  const verticalMargin = Math.max(radius, 16);
  const clampedX = Math.max(lateralMargin, Math.min(canvas.width - lateralMargin, centerX));
  entity.x = clampedX - offset.x;
  // Reduce the default top padding so the playable area's upper boundary moves
  // up and the player can get closer to the HUD. Use a smaller radius-based
  // multiplier and a low absolute minimum to avoid clipping into HUD.
  const defaultTopPadding = Math.max(verticalMargin, Math.floor(radius * 2), 8);
  const stage = levelManager?.getStatus?.()?.stage || "";
  const isCongregationStage = isCongregationBoundsStage(stage);
  const congregationTopY = Math.max(HUD_HEIGHT + 1, Number(CONGREGATION_PLAYER_TOP_Y) || (HUD_HEIGHT + defaultTopPadding));
  const topPadding =
    entity?.isPlayer && isCongregationStage
      ? null
      : typeof entity.safeTopMargin === "number"
      ? Math.max(entity.safeTopMargin, verticalMargin)
      : defaultTopPadding;
  // Strict top limit: do not allow entities above the HUD line. Keep a
  // consistent top padding so entities don't clip into HUD elements.
  const topLimit = entity?.isPlayer && isCongregationStage ? congregationTopY : HUD_HEIGHT + topPadding;
  const enemyTopLimit =
    isCongregationStage && isEnemyEntity(entity)
      ? Math.max(HUD_HEIGHT + 1, Number(CONGREGATION_PLAYER_TOP_Y) || (HUD_HEIGHT + 1))
      : topLimit;
  const bottomLimit = canvas.height - verticalMargin;
  const clampedY = Math.max(enemyTopLimit, Math.min(bottomLimit, centerY));
  let adjustedCenterX = clampedX;
  let adjustedCenterY = clampedY;
  if (entity?.isPlayer) {
    const cornerCut = getPlayerCornerCutoffBounds(topLimit);
    const cornerResolved = resolvePointAgainstCornerCutoffs(
      adjustedCenterX,
      adjustedCenterY,
      cornerCut,
      canvas.width,
    );
    adjustedCenterX = cornerResolved.x;
    adjustedCenterY = cornerResolved.y;
  }
  entity.x = adjustedCenterX - offset.x;
  entity.y = adjustedCenterY - offset.y;
}

function getPlayerCornerCutoffBounds(topY) {
  const stage = levelManager?.getStatus?.()?.stage || "";
  const isCongregationStage = isCongregationBoundsStage(stage);
  const sideInset = isCongregationStage
    ? CONGREGATION_PLAYER_CORNER_CUTOFF_SIDE_INSET
    : PLAYER_CORNER_CUTOFF_SIDE_INSET;
  const depth = isCongregationStage
    ? CONGREGATION_PLAYER_CORNER_CUTOFF_DEPTH
    : PLAYER_CORNER_CUTOFF_DEPTH;
  return {
    topY,
    sideInset,
    depth,
  };
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function projectPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.00001) return { x: ax, y: ay };
  const apx = px - ax;
  const apy = py - ay;
  const t = clampUnit((apx * abx + apy * aby) / abLenSq);
  return { x: ax + abx * t, y: ay + aby * t };
}

function resolvePointAgainstCornerCutoffs(x, y, cutoff, worldWidth) {
  const sideInset = Math.max(8, Number(cutoff?.sideInset) || 0);
  const depth = Math.max(8, Number(cutoff?.depth) || 0);
  const topY = Number(cutoff?.topY) || HUD_HEIGHT;
  const topCutY = topY + depth;

  const leftLineYAtX = topCutY - (depth / sideInset) * x;
  if (x <= sideInset && y <= leftLineYAtX) {
    const projected = projectPointToSegment(x, y, 0, topCutY, sideInset, topY);
    return { x: projected.x, y: projected.y };
  }

  const rx = worldWidth - x;
  const rightLineYAtX = topCutY - (depth / sideInset) * rx;
  if (rx <= sideInset && y <= rightLineYAtX) {
    const projected = projectPointToSegment(x, y, worldWidth, topCutY, worldWidth - sideInset, topY);
    return { x: projected.x, y: projected.y };
  }

  return { x, y };
}

function resolveEntityObstacles(entity) {
  if (entity?.spawnOffscreenTimer > 0) return;
  if (!entity || entity?.ignoreWorldBounds) return;
  if (entity?.ignoreObstacles) return;
  const hasStaticObstacles = obstacles.length > 0;
  if (!hasStaticObstacles) return;
  const offset = getEntityCollisionOffset(entity);
  const maxIterations = 5;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let adjusted = false;
    if (hasStaticObstacles) {
      for (const obstacle of obstacles) {
        const centerX = (entity.x || 0) + offset.x;
        const centerY = (entity.y || 0) + offset.y;
        const dx = centerX - obstacle.x;
        const dy = centerY - obstacle.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = (entity.radius || 0) + obstacle.collisionRadius;
        if (distance < minDistance && minDistance > 0) {
          const overlap = minDistance - (distance || 0);
          const nx = distance === 0 ? 1 : dx / distance;
          const ny = distance === 0 ? 0 : dy / distance;
          entity.x += nx * overlap;
          entity.y += ny * overlap;
          adjusted = true;
        }
      }
    }
    if (!adjusted) break;
  }
}

function resolveEntityCollisions(entity, targets, { allowPush = true, overlapScale = 1 } = {}) {
  if (!targets?.length) return;
  if (!entity || entity?.spawnOffscreenTimer > 0) return;
  if (!entity || entity?.ignoreWorldBounds) return;
  if (entity?.ignoreEntityCollisions) return;
  const hasMiniBehavior = (ent) => {
    if (!ent) return false;
    const type = typeof ent.type === "string" ? ent.type.toLowerCase() : "";
    return type.startsWith("mini");
  };
  const getSwarmSpacing = (ent) => {
    if (!ent || !ent.config) return 1;
    const val = ent.config.swarmSpacing;
    if (Number.isFinite(val) && val > 0) {
      if (val <= 1) return Math.max(0.1, val * 0.4);
      return Math.max(0.25, Math.min(2, val));
    }
    return 1;
  };
  const isMiniImp = (ent) => {
    const type = typeof ent?.type === "string" ? ent.type : "";
    return type === "miniImp" || type === "miniImpLevel2" || type === "miniImpLevel3";
  };
  for (const other of targets) {
    if (other === entity) continue;
    if (other.dead || other.state === "death") continue;
    if (other?.spawnOffscreenTimer > 0) continue;
    if (other?.ignoreWorldBounds) continue;
    if (other?.ignoreEntityCollisions) continue;
    if (other?.spawnOffscreenTimer > 0) continue;
    const bothEnemies = isEnemyEntity(entity) && isEnemyEntity(other);
    if (bothEnemies) {
      const entityIsMini = hasMiniBehavior(entity);
      const otherIsMini = hasMiniBehavior(other);
      const entityIsMiniImp = isMiniImp(entity);
      const otherIsMiniImp = isMiniImp(other);
      if (entity.isPlayer || entity.isCozyNpc || other.isPlayer || other.isCozyNpc) {
        // keep default behavior for players/NPCs
      } else if (entityIsMiniImp && otherIsMini && !otherIsMiniImp) {
        continue;
      } else if (otherIsMiniImp && entityIsMini && !entityIsMiniImp) {
        continue;
      }
    if (entityIsMini !== otherIsMini) {
      continue;
    }
  }
    const entityCenter = getEntityCollisionCenter(entity);
    const otherCenter = getEntityCollisionCenter(other);
    const dx = entityCenter.x - otherCenter.x;
    const dy = entityCenter.y - otherCenter.y;
    const distance = Math.hypot(dx, dy);
    const baseRadius = (entity.radius || 0) + (other.radius || 0);
    let spacingFactor = 1;
    if (bothEnemies && entity.type === other.type) {
      spacingFactor = Math.min(getSwarmSpacing(entity), getSwarmSpacing(other));
    }
    const minDistance = baseRadius * overlapScale * spacingFactor;
    if (distance > 0 && distance < minDistance) {
      const overlap = minDistance - distance;
      const nx = dx / distance;
      const ny = dy / distance;
      if (allowPush) {
        const pushFactor = 0.5;
        const pullFactor = 0.5;
        const entityGrace = Boolean(entity.spawnPushGrace && entity.spawnPushGrace > 0);
        const otherGrace = Boolean(other.spawnPushGrace && other.spawnPushGrace > 0);
        if (entityGrace && otherGrace) {
          const entitySeq = Number.isFinite(entity.spawnSequence) ? entity.spawnSequence : 0;
          const otherSeq = Number.isFinite(other.spawnSequence) ? other.spawnSequence : 0;
          const newerIsEntity = entitySeq > otherSeq;
          if (newerIsEntity) {
            entity.x += nx * (overlap * pushFactor);
            entity.y += ny * (overlap * pushFactor);
          } else {
            other.x -= nx * (overlap * pullFactor);
            other.y -= ny * (overlap * pullFactor);
          }
        } else if (entityGrace && !otherGrace) {
          entity.x += nx * (overlap * pushFactor);
          entity.y += ny * (overlap * pushFactor);
        } else if (otherGrace && !entityGrace) {
          other.x -= nx * (overlap * pullFactor);
          other.y -= ny * (overlap * pullFactor);
        } else {
          entity.x += nx * (overlap * pushFactor);
          entity.y += ny * (overlap * pushFactor);
          other.x -= nx * (overlap * pullFactor);
          other.y -= ny * (overlap * pullFactor);
        }
      } else {
        entity.x += nx * overlap;
        entity.y += ny * overlap;
      }
    }
  }
}

function devClearOpponents({ includeBoss = false } = {}) {
  enemies.forEach((enemy) => {
    if (!enemy || enemy.dead || enemy.state === "death") return;
    if (typeof enemy.takeDamage === "function") {
      enemy.takeDamage(enemy.health + (enemy.maxHealth || 0) + 9999);
    } else {
      enemy.dead = true;
      enemy.state = "death";
    }
  });
  if (includeBoss && activeBoss && typeof activeBoss.takeDamage === "function") {
    activeBoss.takeDamage(activeBoss.health + (activeBoss.maxHealth || 0) + 9999);
  }
  bossHazards.length = 0;
}

function computeObstacleAvoidance(entity) {
  const hasStaticObstacles = obstacles.length > 0;
  if (!hasStaticObstacles) return { x: 0, y: 0 };
  let steerX = 0;
  let steerY = 0;
  const applyObstacle = (ox, oy, radius) => {
    if (!radius || radius <= 0) return;
    const center = getEntityCollisionCenter(entity);
    const dx = center.x - ox;
    const dy = center.y - oy;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return;
    const buffer = 12;
    const safeDistance = (entity.radius || 0) + radius + buffer;
    if (distance < safeDistance) {
      const influence = (safeDistance - distance) / Math.max(safeDistance, 1);
      steerX += (dx / distance) * influence;
      steerY += (dy / distance) * influence;
    }
  };
  if (hasStaticObstacles) {
    for (const obstacle of obstacles) {
      applyObstacle(obstacle.x, obstacle.y, obstacle.collisionRadius);
    }
  }
  return { x: steerX, y: steerY };
}

function canSpawnWisdomMissleProjectile() {
  const maxShots = player ? player.wisdomMissleShotsMax : 1;
  const activeShots = projectiles.reduce(
    (count, projectile) => count + (projectile.type === "wisdom_missle" ? 1 : 0),
    0,
  );
  return activeShots < maxShots;
}

function canSpawnFaithCannonProjectile() {
  const maxShots = player ? player.faithCannonShotsMax : 1;
  const activeShots = projectiles.reduce(
    (count, projectile) => count + (projectile.type === "faith_cannon" ? 1 : 0),
    0,
  );
  return activeShots < maxShots;
}

function canSpawnFireProjectile() {
  const maxShots = player ? player.fireShotsMax : 2;
  const activeShots = projectiles.reduce(
    (count, projectile) => count + (projectile.type === "fire" ? 1 : 0),
    0,
  );
  return activeShots < maxShots;
}

function updateAimFromKeyboard() {
  const gamepadAim = Input?.gamepadState?.aim;
  if (gamepadAim?.active) {
    aimState.x = gamepadAim.x;
    aimState.y = gamepadAim.y;
    aimState.usingPointer = false;
    aimState.triggerPress = true;
    pointerState.active = false;
    if (player) {
      player.aim = { x: gamepadAim.x, y: gamepadAim.y };
      player.updateFacing(gamepadAim.x, gamepadAim.y);
    }
    return;
  }

  aimState.triggerPress = false;
  const aimX = (isActionActive("aimRight") ? 1 : 0) - (isActionActive("aimLeft") ? 1 : 0);
  const aimY = (isActionActive("aimDown") ? 1 : 0) - (isActionActive("aimUp") ? 1 : 0);
  if (aimX === 0 && aimY === 0) {
    return;
  }

  const { x, y } = normalizeVector(aimX, aimY);
  aimState.x = x;
  aimState.y = y;
  aimState.usingPointer = false;
  pointerState.active = false;
  aimState.triggerPress = true;
  if (player) {
    player.aim = { x, y };
    player.updateFacing(x, y);
  }
}
function createPlayerInstance(x, y, clips) {
  const factory = window.Entities?.createPlayer;
  if (typeof factory === 'function') return factory(x, y, clips);
  const PlayerClass = window.Entities?.Player;
  if (typeof PlayerClass === 'function') return new PlayerClass(x, y, clips);
  throw new Error('Player factory unavailable');
}


function createEnemyInstance(type, config, clips, x, y) {
  const factory = window.Entities?.createEnemy;
  if (typeof factory === "function") return factory(type, config, clips, x, y);
  throw new Error("Enemy factory unavailable: expected window.Entities.createEnemy");
}

function shouldEnemyHuntNpcs(type, config = {}) {
  if (
    Array.isArray(config.specialBehavior) &&
    (config.specialBehavior.includes("npcPriority") || config.specialBehavior.includes("closestAny"))
  ) {
    return true;
  }
  if (type === "skeleton") return true;
  if (config.projectileType === "arrow") return true;
  return false;
}

function drawPickupLabel(context, text, x, y, color = UI_COLOR.softWhite) {
  if (!context || !text) return;
  context.save();
  context.font = `12px ${UI_FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(0, 0, 0, 0.75)";
  context.fillStyle = color;
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
  context.restore();
}

const POWERUP_ICON_STYLES = {
  player: { shape: "square", color: "#2B4C73", accent: "#3C5F8C" },
  npc: { shape: "square", color: "#C14C4C", accent: "#E06A6A" },
  utility: { shape: "circle", color: "#B7742A", accent: "#D08D42" },
};
const POWERUP_ICON_OUTLINE = "rgba(10, 15, 31, 0.7)";
const POWERUP_ICON_HIGHLIGHT = "rgba(255, 215, 64, 0.95)";
const POWERUP_ICON_TEXT_COLOR = UI_COLOR.softWhite;

function resolvePowerupIconCategory(effect = "") {
  if (String(effect).startsWith("npc")) return "npc";
  if (WEAPON_POWERUP_EFFECTS.has(effect)) return "player";
  if (CHURCH_POWERUP_EFFECTS.has(effect)) return "player";
  return "utility";
}

function splitPowerupLabel(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (words.length === 1) return [words[0]];
  if (words.length === 2) return [words[0], words[1]];
  if (words.length === 3) return [`${words[0]} ${words[1]}`, words[2]];
  if (words.length === 4) return [`${words[0]} ${words[1]}`, `${words[2]} ${words[3]}`];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function drawPowerupIcon(context, { x, y, size, shape, color, accent, text, iconImage }) {
  if (!context) return;
  const hasDrawableIcon = Boolean(
    iconImage &&
      iconImage.complete &&
      Number.isFinite(iconImage.naturalWidth) &&
      Number.isFinite(iconImage.naturalHeight) &&
      iconImage.naturalWidth > 0 &&
      iconImage.naturalHeight > 0
  );
  const half = size / 2;
  context.save();
  context.translate(x, y);
  context.globalAlpha *= 0.8;
  const gradient = context.createLinearGradient(0, -half, 0, half);
  gradient.addColorStop(0, accent || color);
  gradient.addColorStop(1, color);
  context.fillStyle = gradient;
  if (shape === "circle") {
    context.beginPath();
    context.arc(0, 0, half, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = Math.max(2, size * 0.08);
    context.strokeStyle = POWERUP_ICON_HIGHLIGHT;
    context.stroke();
  } else {
    const radius = Math.max(6, Math.round(size * 0.16));
    roundRect(context, -half, -half, size, size, radius, true, false);
    context.lineWidth = Math.max(2, size * 0.08);
    context.strokeStyle = POWERUP_ICON_HIGHLIGHT;
    roundRect(context, -half, -half, size, size, radius, false, true);
  }

  const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
  const pulse = (Math.sin(t * 1.6) + 1) * 0.5;
  const shimmerAlpha = Math.max(0.12, pulse * 0.65);
  if (shimmerAlpha > 0.12) {
    context.save();
    context.globalAlpha *= shimmerAlpha;
    context.beginPath();
    if (shape === "circle") {
      context.arc(0, 0, half, 0, Math.PI * 2);
    } else {
      const radius = Math.max(6, Math.round(size * 0.16));
      roundRect(context, -half, -half, size, size, radius, false, false);
    }
    context.clip();
    const shimmerWidth = size * 0.6;
    const offset = ((t * 0.9) % 1) * (size + shimmerWidth) - (size + shimmerWidth) / 2;
    context.rotate(-0.45);
    const grad = context.createLinearGradient(offset - shimmerWidth, 0, offset + shimmerWidth, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = grad;
    context.fillRect(-size * 1.5, -size * 1.5, size * 3, size * 3);
    context.restore();
  }

  if (hasDrawableIcon) {
    const iconSize = size * 0.6;
    const iconX = -iconSize / 2;
    const iconY = -iconSize / 2;
    context.save();
    context.globalAlpha *= 0.9;
    context.drawImage(iconImage, iconX, iconY, iconSize, iconSize);
    context.restore();
  }

  const lines = hasDrawableIcon ? [] : splitPowerupLabel(text);
  if (lines.length) {
    const maxWidth = size * 0.82;
    let fontSize = Math.round(size * 0.22);
    context.fillStyle = POWERUP_ICON_TEXT_COLOR;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    const fitText = () => {
      context.font = `800 ${fontSize}px ${UI_FONT_FAMILY}`;
      return lines.every((line) => context.measureText(line).width <= maxWidth);
    };
    while (fontSize > 8 && !fitText()) {
      fontSize -= 1;
    }
    context.font = `800 ${fontSize}px ${UI_FONT_FAMILY}`;
    const lineHeight = Math.round(fontSize * 0.92);
    const totalHeight = lineHeight * lines.length;
    const startY = -totalHeight / 2 + lineHeight / 2;
    lines.forEach((line, idx) => {
      context.fillText(line, 0, startY + idx * lineHeight);
    });
  }
  context.restore();
}

function drawPowerupShadow(context, x, y, size, heightOffset = 0) {
  if (!context) return;
  const clampedOffset = Math.max(0, Math.min(16, Math.abs(heightOffset)));
  const scale = Math.max(0.72, 1 - clampedOffset * 0.02);
  const shadowWidth = size * 0.85 * scale;
  const shadowHeight = Math.max(6, size * 0.22 * scale);
  const shadowY = y + size * 0.5;
  context.save();
  context.fillStyle = "rgba(0, 0, 0, 0.45)";
  context.beginPath();
  if (typeof context.ellipse === "function") {
    context.ellipse(x, shadowY, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
  } else {
    context.translate(x, shadowY);
    context.scale(shadowWidth / 2, shadowHeight / 2);
    context.arc(0, 0, 1, 0, Math.PI * 2);
  }
  context.fill();
  context.restore();
}

class WeaponPickup {
  constructor(definition) {
    this.type = definition.type;
    this.definition = definition;
    this.frames =
      Array.isArray(definition.frames) && definition.frames.length ? definition.frames.slice() : null;
    this.frameRate = typeof definition.frameRate === "number" ? definition.frameRate : 0;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.image = this.frames ? this.frames[0] : definition.image;
    this.scale = definition.scale;
    this.radius = definition.radius;
    this.effect = definition.effect;
    if (typeof definition.speed === "number") {
      this.speed = Math.max(0, definition.speed);
    } else {
      const baseMin = typeof definition.speedMin === "number" ? definition.speedMin : 40;
      const baseMax = typeof definition.speedMax === "number" ? definition.speedMax : 85;
      const span = Math.max(0, baseMax - baseMin);
      this.speed = Math.max(0, baseMin + Math.random() * span);
    }
    this.speed *= SPEED_SCALE;
    this.direction = Math.random() * Math.PI * 2;
    this.turnTimer = this.speed > 0 ? 1 + Math.random() * 3 : Infinity;
    const initialSprite = this.frames ? this.frames[this.frameIndex] : this.image;
    const spriteWidth = initialSprite ? initialSprite.width : this.image.width;
    const spriteHeight = initialSprite ? initialSprite.height : this.image.height;
    this.width = spriteWidth * this.scale;
    this.height = spriteHeight * this.scale;
    this.x = Math.random() * (canvas.width - 200) + 100;
    this.y = Math.random() * (canvas.height - 200) + 100;
    const pushed = pushPointOutsideNpcHome(this.x, this.y);
    this.x = pushed.x;
    this.y = pushed.y;
    this.baseY = this.y;
    this.floatTimer = 0;
    this.active = true;
    this.life =
      typeof definition.life === "number" && Number.isFinite(definition.life)
        ? definition.life
        : POWERUP_ACTIVE_LIFETIME;
    this.blinkWindow = Math.min(
      Math.max(0, typeof definition.blinkDuration === "number" ? definition.blinkDuration : POWERUP_BLINK_DURATION),
      this.life,
    );
    this.blinkTimer = 0;
    this.spawnBlinkTimer = POWERUP_SPAWN_BLINK_DURATION;
    this.visible = true;
    this.expired = false;
    this.safeTopMargin = Math.max(this.height / 2, this.radius * 3, 150);
    clampEntityToBounds(this);
  }

  update(dt) {
    if (!this.active) return;
    if (this.frames && this.frameRate > 0 && this.frames.length > 1) {
      const frameDuration = 1 / this.frameRate;
      this.frameTimer += dt;
      while (this.frameTimer >= frameDuration) {
        this.frameTimer -= frameDuration;
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        this.image = this.frames[this.frameIndex];
      }
    }

    if (this.speed > 0) {
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) {
        this.direction = Math.random() * Math.PI * 2;
        this.turnTimer = 1 + Math.random() * 3;
      }
      this.x += Math.cos(this.direction) * this.speed * dt;
      this.y += Math.sin(this.direction) * this.speed * dt;
      this.baseY = this.y;
    }
    if (this.speed <= 0) {
      this.floatTimer += dt * 2;
      this.y = this.baseY + Math.sin(this.floatTimer) * 6 - 10;
    }
    resolveEntityObstacles(this);
    clampEntityToBounds(this);

    this.life -= dt;
    const exiting = this.life <= this.blinkWindow;
    if (this.spawnBlinkTimer > 0) {
      this.spawnBlinkTimer = Math.max(0, this.spawnBlinkTimer - dt);
    }
    if (exiting) {
      this.blinkTimer += dt * 10;
      this.visible = Math.floor(this.blinkTimer) % 2 === 0;
    } else {
      this.visible = true;
    }
    if (this.life <= 0) {
      this.expired = true;
      this.active = false;
      this.visible = false;
    }
  }

  draw() {
    if (!this.active || !this.visible) return;
    const styleKey = resolvePowerupIconCategory(this.effect);
    const style = POWERUP_ICON_STYLES[styleKey] || POWERUP_ICON_STYLES.utility;
    const size = Math.max(44, (this.radius || 24) * 2);
    const shadowY = Number.isFinite(this.baseY) ? this.baseY : this.y;
    const offset = Number.isFinite(this.baseY) ? this.y - this.baseY : 0;
    drawPowerupShadow(ctx, this.x, shadowY, size, offset);
    drawPowerupIcon(ctx, {
      x: this.x,
      y: this.y,
      size,
      shape: style.shape,
      color: style.color,
      accent: style.accent,
      text: this.definition?.label || "",
      iconImage: this.definition?.iconImage || null,
    });
  }
}

class UtilityPowerUp {
  constructor(definition, x, y) {
    // Uses the same glow logic as weapon power-ups for visual consistency.
    this.type = definition.type;
    this.definition = definition;
    this.image = definition.image;
    this.scale =
      Number.isFinite(definition.scale) && definition.scale > 0
        ? definition.scale
        : 1;
    const srcHint =
      definition.src ||
      (definition.image && typeof definition.image.src === "string"
        ? definition.image.src
        : "");
    const explicitMaxHeight =
      typeof definition.maxHeight === "number" ? definition.maxHeight : undefined;
    const inferredMaxHeight =
      explicitMaxHeight ??
      (srcHint.includes("/conrad/") ? CONRAD_UTILITY_POWERUP_MAX_HEIGHT : undefined);
    if (
      this.image &&
      inferredMaxHeight &&
      this.image.height > 0
    ) {
      const derivedMaxScale = Math.max(0.01, inferredMaxHeight / this.image.height);
      this.scale = Math.min(this.scale, derivedMaxScale);
    }
    this.radius = definition.radius;
    this.duration = definition.duration;
    this.label = definition.label;
    this.color = definition.color;
    this.x = x;
    this.y = y;
    this.floatTimer = 0;
    this.active = true;
    this.life =
      typeof definition.life === "number" && Number.isFinite(definition.life)
        ? definition.life
        : POWERUP_ACTIVE_LIFETIME;
    this.blinkWindow = Math.min(
      Math.max(0, typeof definition.blinkDuration === "number" ? definition.blinkDuration : POWERUP_BLINK_DURATION),
      this.life,
    );
    this.blinkTimer = 0;
    this.spawnBlinkTimer = POWERUP_SPAWN_BLINK_DURATION;
    this.visible = true;
    this.expired = false;
    this.safeTopMargin = Math.max((this.radius || 0) * 2.5, 140);
    const minY = HUD_HEIGHT + this.safeTopMargin;
    if (this.y < minY) {
      this.y = minY;
    }
    this.baseY = this.y;
  }

  update(dt) {
    if (!this.active) return;
    this.floatTimer += dt * 2;
    this.y = this.baseY + Math.sin(this.floatTimer) * 6 - 10;
    this.life -= dt;
    const exiting = this.life <= this.blinkWindow;
    if (this.spawnBlinkTimer > 0) {
      this.spawnBlinkTimer = Math.max(0, this.spawnBlinkTimer - dt);
    }
    if (exiting) {
      this.blinkTimer += dt * 10;
      this.visible = Math.floor(this.blinkTimer) % 2 === 0;
    } else {
      this.visible = true;
    }
    if (this.life <= 0) {
      this.expired = true;
      this.active = false;
      this.visible = false;
    }
  }

  draw(context) {
    if (!this.active || !this.visible) return;
    const style = POWERUP_ICON_STYLES.utility;
    const size = Math.max(44, (this.radius || 24) * 2);
    const shadowY = Number.isFinite(this.baseY) ? this.baseY : this.y;
    const offset = Number.isFinite(this.baseY) ? this.y - this.baseY : 0;
    drawPowerupShadow(context, this.x, shadowY, size, offset);
    drawPowerupIcon(context, {
      x: this.x,
      y: this.y,
      size,
      shape: style.shape,
      color: style.color,
      accent: style.accent,
      text: this.label || this.definition?.label || "",
      iconImage: this.definition?.iconImage || null,
    });
  }

  hitTest(entity) {
    const dx = entity.x - this.x;
    const dy = entity.y - this.y;
    const distance = Math.hypot(dx, dy);
    return distance <= (entity.radius || 0) + (this.radius || 0);
  }
}

class BossHazard {
  constructor(x, y, radius, duration, { damage = 1, tickInterval = 0.6 } = {}) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.damage = damage;
    this.life = duration;
    this.tickInterval = tickInterval;
    this.tickTimer = 0;
    this.dead = false;
  }

  update(dt) {
    if (this.dead) return;
    this.life -= dt;
    this.tickTimer -= dt;
    if (this.tickTimer <= 0) {
      this.tickTimer += this.tickInterval;
      this.applyDamage();
    }
    if (this.life <= 0) {
      this.dead = true;
    }
  }

  applyDamage() {
    if (!player || player.state === "death") return;
    if (circleIntersectsPlayerHurtbox(this.x, this.y, this.radius, player)) {
      if (player.invulnerableTimer > 0) {
        return;
      }
      if (player.shieldTimer > 0) {
        spawnFlashEffect(player.x, player.y - player.radius / 2);
      } else {
        player.takeDamage(this.damage);
        spawnFlashEffect(player.x, player.y - player.radius / 2);
      }
    }
  }

  draw(context) {
    if (this.dead) return;
    const alpha = Math.max(0.2, Math.min(0.85, this.life));
    const gradient = context.createRadialGradient(this.x, this.y, this.radius * 0.1, this.x, this.y, this.radius);
    gradient.addColorStop(0, `rgba(255, 120, 80, ${alpha})`);
    gradient.addColorStop(0.45, `rgba(255, 80, 40, ${alpha * 0.65})`);
    gradient.addColorStop(1, `rgba(120, 20, 10, 0)`);
    context.save();
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.save();
    context.strokeStyle = `rgba(255, 160, 120, ${alpha})`;
    context.lineWidth = 3;
    context.setLineDash([8, 6]);
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function updateBossHazards(dt) {
  for (let i = bossHazards.length - 1; i >= 0; i -= 1) {
    const hazard = bossHazards[i];
    hazard.update(dt);
    if (hazard.dead) bossHazards.splice(i, 1);
  }
}

// (moved to npcs.js)

function getEnemyHitboxRadius(enemy) {
  if (!enemy) return 0;
  const hitbox = enemy.hitbox || enemy.config?.hitbox || null;
  if (hitbox && Number.isFinite(hitbox.width) && Number.isFinite(hitbox.height)) {
    return Math.max(hitbox.width, hitbox.height) * 0.5;
  }
  return enemy.config?.hitRadius || enemy.radius || 0;
}

function getEnemyContactDamageValue(enemy) {
  const config = enemy?.config || enemy || null;
  if (!config) return 0;
  if (Number.isFinite(config.contactDamage) && config.contactDamage >= 0) {
    return config.contactDamage;
  }
  if (Number.isFinite(config.damage) && config.damage >= 0) {
    return config.damage;
  }
  return 0;
}

function getEnemyAttackDamageValue(enemy) {
  const config = enemy?.config || enemy || null;
  if (!config) return 0;
  if (Number.isFinite(config.attackHitDamage) && config.attackHitDamage >= 0) {
    return config.attackHitDamage;
  }
  if (Number.isFinite(config.attackDamage) && config.attackDamage >= 0) {
    return config.attackDamage;
  }
  if (Number.isFinite(config.damage) && config.damage >= 0) {
    return config.damage;
  }
  return 0;
}

function isEnemyInKnockback(enemy) {
  return Boolean(enemy && Number.isFinite(enemy.knockbackTimer) && enemy.knockbackTimer > 0);
}

function getEnemyHitboxCenter(enemy) {
  const hitbox = enemy?.hitbox || enemy?.config?.hitbox || null;
  const offsetX = hitbox && Number.isFinite(hitbox.offsetX) ? hitbox.offsetX : 0;
  const offsetY = hitbox && Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0;
  return {
    x: (enemy?.x || 0) + offsetX,
    y: (enemy?.y || 0) + offsetY,
  };
}

function isEnemyTargetableForAutoAim(enemy) {
  if (!enemy || enemy.dead || enemy.state === "death") return false;
  if (enemy.type === "miniDemonFireKeeper" && enemy.fireKeeperPhase === "hidden") return false;
  return true;
}

function spawnEnemyHitEffect(enemy, hitX = null, hitY = null, options = {}) {
  if (!enemy) return;
  const x = Number.isFinite(hitX) ? hitX : enemy.x;
  const y = Number.isFinite(hitY) ? hitY : enemy.y;
  const damageType = options?.damageType || null;
  const damageClass = (enemy.config?.damageClass || "normal").toLowerCase();
  if (damageType === "projectile" && damageClass === "armored") {
    const puffRadius = Math.max(18, getEnemyHitboxRadius(enemy) * 0.7);
    spawnPuffEffect(x, y, puffRadius);
    return;
  }
  if (enemy.type === "tormentorFlame") {
    const puffRadius = Math.max(18, (getEnemyHitboxRadius(enemy) || enemy.radius || 12) * 0.9);
    spawnPuffEffect(x, y, puffRadius);
    return;
  }
  spawnFlashEffect(x, y);
}

function isArmoredProjectileDeflectTarget(target, projectile, damageType) {
  if (!target || !projectile) return false;
  if (damageType !== "projectile") return false;
  if (!projectile.friendly) return false;
  if (projectile.ignoreArmorDeflect) return false;
  const damageClass = String(target.damageClass || target.config?.damageClass || "").toLowerCase();
  if (damageClass !== "armored") return false;
  return ARMORED_PROJECTILE_DEFLECT_TYPES.has(projectile.type);
}

function spawnArmoredProjectileDeflect(projectile, target, hitX, hitY) {
  if (!projectile || !target) return;
  const baseSpeed = Math.max(
    1,
    Math.hypot(projectile.vx || 0, projectile.vy || 0) * ARMORED_PROJECTILE_DEFLECT_SPEED_SCALE,
  );
  const center = typeof getEnemyHitboxCenter === "function" ? getEnemyHitboxCenter(target) : { x: target.x, y: target.y };
  let dirX = (hitX ?? projectile.x ?? 0) - center.x;
  let dirY = (hitY ?? projectile.y ?? 0) - center.y;
  if (Math.abs(dirX) < 0.001 && Math.abs(dirY) < 0.001) {
    dirX = -(projectile.vx || 0);
    dirY = -(projectile.vy || 0);
  }
  const baseAngle = Math.atan2(dirY, dirX);
  const angleOffset =
    ARMORED_PROJECTILE_DEFLECT_ANGLE +
    (Math.random() * 2 - 1) * ARMORED_PROJECTILE_DEFLECT_ANGLE_VARIANCE;
  const signedOffset = Math.random() < 0.5 ? -angleOffset : angleOffset;
  const deflectAngle = baseAngle + signedOffset;
  const dir = normalizeVector(Math.cos(deflectAngle), Math.sin(deflectAngle));
  const life = ARMORED_PROJECTILE_DEFLECT_DISTANCE / baseSpeed;
  const deflect = spawnProjectile(
    projectile.type,
    Number.isFinite(hitX) ? hitX : projectile.x,
    Number.isFinite(hitY) ? hitY : projectile.y,
    dir.x,
    dir.y,
    {
      friendly: false,
      damage: 0,
      source: null,
      speed: baseSpeed,
      life,
      scale: projectile.scale,
      flipHorizontal: dir.x < 0,
      // Preserve the original projectile visual style on deflect.
      lightSpreadShot: Boolean(projectile.lightSpreadShot),
      frames: Array.isArray(projectile.frames) && projectile.frames.length ? projectile.frames : undefined,
      frameDuration: Number.isFinite(projectile.frameDuration) ? projectile.frameDuration : undefined,
      loopFrames: Boolean(projectile.loopFrames),
      visualOnly: true,
      onExpire: (proj) => {
        spawnEnemyHitEffect(
          target,
          Number.isFinite(proj?.x) ? proj.x : hitX,
          Number.isFinite(proj?.y) ? proj.y : hitY,
          { damageType: "projectile" },
        );
      },
    },
  );
  if (deflect) {
    deflect.rotation = Math.atan2(deflect.vy || 0, deflect.vx || 0);
  }
}

function isEnemyEntity(ent) {
  return Boolean(ent && !ent.isCozyNpc && !ent.isPlayer && typeof ent.type === "string");
}

function getEntityCollisionOffset(entity) {
  if (!isEnemyEntity(entity)) return { x: 0, y: 0 };
  const hitbox = entity?.config?.hitbox || null;
  return {
    x: hitbox && Number.isFinite(hitbox.offsetX) ? hitbox.offsetX : 0,
    y: hitbox && Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0,
  };
}

function getEntityCollisionCenter(entity) {
  const offset = getEntityCollisionOffset(entity);
  return {
    x: (entity?.x || 0) + offset.x,
    y: (entity?.y || 0) + offset.y,
  };
}

function getEnemyHitboxRect(enemy) {
  if (!enemy) return null;
  const hitbox = enemy.config?.hitbox || null;
  if (!hitbox || !Number.isFinite(hitbox.width) || !Number.isFinite(hitbox.height)) return null;
  const width = hitbox.width;
  const height = hitbox.height;
  if (width <= 0 || height <= 0) return null;
  const offsetX = Number.isFinite(hitbox.offsetX) ? hitbox.offsetX : 0;
  const offsetY = Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0;
  const center = getEnemyHitboxCenter(enemy);
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
}

function getPlayerHitboxRect(targetPlayer = player) {
  if (!targetPlayer) return null;
  const hitbox = targetPlayer.config?.hitbox || PLAYER_CONFIG?.hitbox || null;
  if (!hitbox || !Number.isFinite(hitbox.width) || !Number.isFinite(hitbox.height)) return null;
  if (hitbox.width <= 0 || hitbox.height <= 0) return null;
  const facingSign = targetPlayer?.facing === "left" ? -1 : 1;
  const offsetX = Number.isFinite(hitbox.offsetX) ? hitbox.offsetX * facingSign : 0;
  const offsetY = Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0;
  return {
    x: targetPlayer.x + offsetX - hitbox.width / 2,
    y: targetPlayer.y + offsetY - hitbox.height / 2,
    width: hitbox.width,
    height: hitbox.height,
  };
}

function circleIntersectsPlayerHurtbox(x, y, radius = 0, targetPlayer = player) {
  if (!targetPlayer || targetPlayer.state === "death") return false;
  const hurtbox = getPlayerHitboxRect(targetPlayer);
  const circleRadius = Math.max(0, Number(radius) || 0);
  if (hurtbox) {
    return circleIntersectsRect(x, y, circleRadius, hurtbox);
  }
  const dx = (targetPlayer.x || 0) - x;
  const dy = (targetPlayer.y || 0) - y;
  return Math.hypot(dx, dy) <= circleRadius + Math.max(0, targetPlayer.radius || 24);
}

function getPlayerWeaponHitboxLocalRect(targetPlayer = player) {
  if (!targetPlayer) return null;
  const weaponHitbox = targetPlayer.config?.weaponHitbox || PLAYER_CONFIG?.weaponHitbox || null;
  if (!weaponHitbox || !Number.isFinite(weaponHitbox.width) || !Number.isFinite(weaponHitbox.height)) return null;
  if (weaponHitbox.width <= 0 || weaponHitbox.height <= 0) return null;
  const offsetX = Number.isFinite(weaponHitbox.offsetX) ? weaponHitbox.offsetX : 0;
  const offsetY = Number.isFinite(weaponHitbox.offsetY) ? weaponHitbox.offsetY : 0;
  return {
    x: offsetX - weaponHitbox.width / 2,
    y: offsetY - weaponHitbox.height / 2,
    width: weaponHitbox.width,
    height: weaponHitbox.height,
  };
}

function getPlayerDashSlashHitboxLocalRect(targetPlayer = player) {
  if (!targetPlayer) return null;
  const hitbox = targetPlayer.config?.dashSlashHitbox || PLAYER_CONFIG?.dashSlashHitbox || null;
  if (!hitbox || !Number.isFinite(hitbox.width) || !Number.isFinite(hitbox.height)) return null;
  if (hitbox.width <= 0 || hitbox.height <= 0) return null;
  const offsetX = Number.isFinite(hitbox.offsetX) ? hitbox.offsetX : 0;
  const offsetY = Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0;
  return {
    x: offsetX - hitbox.width / 2,
    y: offsetY - hitbox.height / 2,
    width: hitbox.width,
    height: hitbox.height,
  };
}

function getPlayerRushHitboxLocalRect(targetPlayer = player) {
  if (!targetPlayer) return null;
  const rushHitbox = targetPlayer.config?.rushHitbox || PLAYER_CONFIG?.rushHitbox || null;
  if (!rushHitbox || !Number.isFinite(rushHitbox.width) || !Number.isFinite(rushHitbox.height)) return null;
  if (rushHitbox.width <= 0 || rushHitbox.height <= 0) return null;
  const offsetX = Number.isFinite(rushHitbox.offsetX) ? rushHitbox.offsetX : 0;
  const offsetY = Number.isFinite(rushHitbox.offsetY) ? rushHitbox.offsetY : 0;
  return {
    x: offsetX - rushHitbox.width / 2,
    y: offsetY - rushHitbox.height / 2,
    width: rushHitbox.width,
    height: rushHitbox.height,
  };
}

function queueBasicMeleeAttack(dir, meleeAttackState) {
  if (!player || !meleeAttackState || !dir) return;
  if (typeof player.updateFacing === "function") {
    player.updateFacing(dir.x, dir.y);
  }
  // Clear cached attack facing so the paperdoll picks up the new facing immediately.
  player._paperdollAttackFacing = null;
  meleeAttackState.pendingBasicAttack = {
    dir: { x: dir.x, y: dir.y },
    queuedAt:
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now(),
    hitApplied: false,
  };
}

function resolveQueuedBasicMeleeAttack(meleeAttackState) {
  if (!player || !meleeAttackState?.pendingBasicAttack) return;
  const pending = meleeAttackState.pendingBasicAttack;
  const animator = player.animator;
  const clip = animator?.currentClip || null;
  if (!animator || player.state !== "attackMelee" || animator.currentName !== "attackMelee" || !clip) return;
  const logicalFrames =
    Array.isArray(clip.frameMap) && clip.frameMap.length
      ? clip.frameMap.length
      : clip.frameCount || 1;
  const requiredFrame = Math.max(
    1,
    Math.min(
      logicalFrames,
      Number.isFinite(player.config?.attackHitFrame) ? Math.round(player.config.attackHitFrame) : DEFAULT_PLAYER_ATTACK_HIT_FRAME,
    ),
  );
  const currentFrame = (Number.isFinite(animator.frameIndex) ? animator.frameIndex : 0) + 1;
  if (pending.hitApplied || currentFrame < requiredFrame) return;
  pending.hitApplied = true;
  const angleRad = Math.atan2(pending.dir.y, pending.dir.x);
  const swingCenterX = player.x + Math.cos(angleRad) * MELEE_OFFSET;
  const swingCenterY = player.y + Math.sin(angleRad) * MELEE_OFFSET;
  executeBasicMeleeAttack(pending.dir, meleeAttackState, swingCenterX, swingCenterY);
  meleeAttackState.pendingBasicAttack = null;
}

function circleIntersectsRect(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-6) return { x: ax, y: ay, t: 0 };
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  return {
    x: ax + abx * t,
    y: ay + aby * t,
    t,
  };
}

class Projectile {
  constructor(type, config, clip, x, y, dx, dy) {
    this.type = type;
    this.config = config;
    this.x = x;
    this.y = y;
    const direction = normalizeVector(dx, dy);
    const projectorSpeed = Number.isFinite(config.speed)
      ? config.speed
      : Math.hypot(direction.x, direction.y);
    this.speed = Math.max(0, projectorSpeed);
    this.vx = direction.x * this.speed;
    this.vy = direction.y * this.speed;
    this.rotation = Math.atan2(this.vy, this.vx);
    this.priority = config.priority ?? 0;
    this.life = config.life ?? 5;
    this.radius = config.radius;
    this.pierce = Boolean(config.pierce);
    this.maxBossHits = Number.isFinite(config.maxBossHits) && config.maxBossHits > 1 ? Math.round(config.maxBossHits) : 1;
    this.bossHitCooldown = Number.isFinite(config.bossHitCooldown) && config.bossHitCooldown > 0 ? config.bossHitCooldown : 0;
    this.bossHitCount = 0;
    this.bossHitTimer = 0;
    this.dead = false;
    this.damage = config.damage ?? 0;
    this.scale = config.scale || 1;
    this.flipHorizontal = Boolean(config.flipHorizontal);
    this.loopFrames = Boolean(config.loopFrames);
    this.onImpact = config.onImpact || null;
    this.onExpire = config.onExpire || null;
    this.onDestroyed = config.onDestroyed || null;
    this.onImpactTriggered = false;
    this.onExpireTriggered = false;
    this.onDestroyedTriggered = false;
    this.friendly = config.friendly ?? true;
    this.visualOnly = Boolean(config.visualOnly);
    this.lightSpreadShot = Boolean(config.lightSpreadShot);
    this.splashRadius = Number.isFinite(config.splashRadius) && config.splashRadius > 0 ? config.splashRadius : 0;
    this.splashDamageRatio = Number.isFinite(config.splashDamageRatio) ? config.splashDamageRatio : 0;
    this.collisionDisabled = Boolean(config.collisionDisabled);
    this.damageType = config.damageType || null;
    this.source = config.source || null;
    this.hitEntities = new Set();
    this.maxDurability = Math.max(0, Number(config.durabilityHealth) || 0);
    this.durability = this.maxDurability;
    this.durabilityDamagePerHit = Math.max(1, Number(config.durabilityDamagePerHit) || 10);
    this.homingTarget = config.homingTarget || null;
    this.homingDuration = Math.max(0, config.homingDuration || 0);
    this.homingStrength = Math.max(0, config.homingStrength ?? 0);
    this.isDivineShot = Boolean(config.isDivineShot);
    this.scriptureFeedback = Boolean(config.scriptureFeedback);
    this.perseveranceFeedback = Boolean(config.perseveranceFeedback);
    this.hitShakeMultiplier = Number.isFinite(config.hitShakeMultiplier) ? config.hitShakeMultiplier : 1;
    this.fireThrowerBomb = Boolean(config.fireThrowerBomb);
    this.fireThrowerBombState = this.fireThrowerBomb ? "flight" : null;
    this.fireThrowerFlightTimer = Math.max(0, Number(config.flightDuration) || 0);
    this.fireThrowerArmedTimer = Math.max(0, Number(config.armedDuration) || 0);
    this.fireThrowerArmedFrames = Array.isArray(config.armedFrames) ? config.armedFrames : null;
    this.fireThrowerFlightFrames = Array.isArray(config.frames) ? config.frames.slice() : null;
    this.fireThrowerVisualLift = this.fireThrowerBomb ? Math.max(58, (this.radius || 18) * 3.8) : 0;
    this.fireThrowerSpawnCount = Math.max(1, Number(config.fireThrowerSpawnCount) || 5);
    this.fireThrowerLandingDamage = Math.max(0, Number(config.fireThrowerLandingDamage) || 0);
    this.fireThrowerLandingRadius = Math.max(
      this.radius || 0,
      Number(config.fireThrowerLandingRadius) || (this.radius || 0),
    );
    const extractedFrames =
      this.fireThrowerBomb &&
      (!Array.isArray(config.frames) || !config.frames.length) &&
      clip?.image &&
      Number.isFinite(clip.frameWidth) &&
      Number.isFinite(clip.frameHeight) &&
      clip.frameWidth > 0 &&
      clip.frameHeight > 0 &&
      typeof getFramesForClip === "function"
        ? getFramesForClip(clip)
        : null;
    const resolvedFrames =
      Array.isArray(config.frames) && config.frames.length
        ? config.frames
        : (Array.isArray(extractedFrames) && extractedFrames.length ? extractedFrames : null);
    if (resolvedFrames && resolvedFrames.length) {
      this.frames = resolvedFrames;
      this.frameDuration = config.frameDuration || 0.05;
      this.frameTimer = 0;
      this.frameIndex = 0;
      this.animator = null;
    } else {
      this.frames = null;
      this.animator = new Animator({ fly: clip }, this.scale);
      this.animator.play("fly");
    }
  }

  update(dt) {
    if (this.fireThrowerBomb) {
      if (this.fireThrowerBombState === "flight") {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.fireThrowerFlightTimer = Math.max(0, this.fireThrowerFlightTimer - dt);
        if (this.frames && this.frames.length) {
          this.frameTimer += dt;
          const frameDuration = this.frameDuration > 0 ? this.frameDuration : 0.05;
          while (this.frameTimer >= frameDuration) {
            this.frameTimer -= frameDuration;
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
          }
        }
        if (this.fireThrowerFlightTimer <= 0) {
          this.fireThrowerBombState = "armed";
          this.collisionDisabled = true;
          this.vx = 0;
          this.vy = 0;
          this.speed = 0;
          this.rotation = 0;
          this.life = Math.max(this.life, this.fireThrowerArmedTimer);
          const landingDamage = Math.max(0, this.fireThrowerLandingDamage || 0);
          const landingRadius = Math.max(this.radius || 0, this.fireThrowerLandingRadius || 0);
          if (landingDamage > 0) {
            if (
              player &&
              player.state !== "death" &&
              circleIntersectsPlayerHurtbox(this.x, this.y, landingRadius, player)
            ) {
              if (player.invulnerableTimer <= 0) {
                player.takeDamage(landingDamage);
              }
            }
            if (Array.isArray(npcs) && npcs.length) {
              for (const npc of npcs) {
                if (!npc || !npc.active || npc.departed) continue;
                const npcRadius = npc.radius || NPC_RADIUS || 0;
                const dx = (npc.x || 0) - this.x;
                const dy = (npc.y || 0) - this.y;
                if (Math.hypot(dx, dy) > landingRadius + npcRadius * 0.7) continue;
                if (typeof npc.sufferAttack === "function") {
                  npc.sufferAttack(landingDamage, { sourceType: this.source?.type || "miniDemonFireThrower" });
                }
              }
            }
          }
          if (this.fireThrowerArmedFrames?.length) {
            this.frames = this.fireThrowerArmedFrames;
            this.frameIndex = 0;
            this.frameTimer = 0;
            this.loopFrames = true;
            this.frameDuration = 0.06;
          }
          if (typeof spawnFlashEffect === "function") {
            spawnFlashEffect(this.x, this.y);
          }
          if (typeof spawnPuffEffect === "function") {
            spawnPuffEffect(this.x, this.y, Math.max(18, (this.radius || 16) * 1.2), {
              tintColor: "#ffb347",
              tintAlpha: 0.42,
            });
          }
        }
      } else if (this.fireThrowerBombState === "armed") {
        this.fireThrowerArmedTimer = Math.max(0, this.fireThrowerArmedTimer - dt);
        this.life = this.fireThrowerArmedTimer;
        if (this.frames && this.frames.length) {
          this.frameTimer += dt;
          const frameDuration = this.frameDuration > 0 ? this.frameDuration : 0.06;
          while (this.frameTimer >= frameDuration) {
            this.frameTimer -= frameDuration;
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
          }
        }
        if (this.fireThrowerArmedTimer <= 0) {
          if (typeof spawnSentryBeamHitEffect === "function") {
            spawnSentryBeamHitEffect(this.x, this.y);
          } else if (typeof spawnFlashEffect === "function") {
            spawnFlashEffect(this.x, this.y);
          }
          const missileCount = 5;
          for (let i = 0; i < missileCount; i += 1) {
            const angle = (Math.PI * 2 * i) / missileCount - Math.PI / 2;
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const projectile = spawnProjectile("fire", this.x, this.y, dirX, dirY, {
              friendly: false,
              source: this.source || null,
              damage: Math.max(1, Math.round(this.config?.damage || 2)),
              speed: (PROJECTILE_CONFIG.fire?.speed || 420) * 0.92,
              radius: PROJECTILE_CONFIG.fire?.radius || 18,
              scale: 0.95,
              frames: Array.isArray(projectileFrames.fire) ? projectileFrames.fire : undefined,
              frameDuration: 0.05,
              loopFrames: true,
            });
            if (projectile) {
              projectile.hitEntities.add(this.source || this);
            }
          }
          if (this.onExpire && !this.onExpireTriggered) {
            this.onExpireTriggered = true;
            this.onExpire(this);
          }
          this.dead = true;
        }
      }
      return;
    }
    if (this.homingTarget) {
      if (this.homingTarget.dead || this.homingTarget.departed) {
        this.homingTarget = null;
      } else if (this.homingDuration > 0 && this.homingStrength > 0) {
        const targetDir = normalizeVector(
          this.homingTarget.x - this.x,
          this.homingTarget.y - this.y,
        );
        const currentDir = normalizeVector(this.vx, this.vy);
        const blend = Math.min(1, this.homingStrength * dt);
        const combinedDir = normalizeVector(
          currentDir.x * (1 - blend) + targetDir.x * blend,
          currentDir.y * (1 - blend) + targetDir.y * blend,
        );
        const currentSpeed = this.speed || Math.hypot(this.vx, this.vy);
        if ((combinedDir.x !== 0 || combinedDir.y !== 0) && currentSpeed > 0) {
          this.vx = combinedDir.x * currentSpeed;
          this.vy = combinedDir.y * currentSpeed;
          this.rotation = Math.atan2(this.vy, this.vx);
        }
        this.homingDuration = Math.max(0, this.homingDuration - dt);
        if (this.homingDuration <= 0) {
          this.homingTarget = null;
        }
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.bossHitTimer > 0) this.bossHitTimer = Math.max(0, this.bossHitTimer - dt);

    if (this.frames && this.frames.length) {
      this.frameTimer += dt;
      const frameDuration = this.frameDuration > 0 ? this.frameDuration : 0.05;
      this.frameDuration = frameDuration;
      while (this.frameTimer >= frameDuration) {
        this.frameTimer -= frameDuration;
        if (this.loopFrames) {
          this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        } else if (this.frameIndex < this.frames.length - 1) {
          this.frameIndex += 1;
        } else {
          this.frameIndex = this.frames.length - 1;
          break;
        }
      }
    } else if (this.animator) {
      this.animator.update(dt);
    }

    const bossStage =
      this.friendly &&
      this.source?.isPlayer &&
      levelManager?.getStatus &&
      ["bossIntro", "bossActive"].includes(levelManager.getStatus().stage);
    const bossRangeMultiplier = bossStage ? 1.5 : 1;
    const extraX = canvas.width * (bossRangeMultiplier - 1) * 0.5;
    const extraY = canvas.height * (bossRangeMultiplier - 1) * 0.5;
    const outLeft = this.x < -this.radius - extraX;
    const outRight = this.x > canvas.width + this.radius + extraX;
    const outTop = this.y < -this.radius - extraY;
    const outBottom = this.y > canvas.height + this.radius + extraY;
    if (outLeft || outRight || outTop || outBottom) {
      if (isBossProjectile(this)) {
        const clampedX = Math.max(0, Math.min(canvas.width, this.x));
        const clampedY = Math.max(0, Math.min(canvas.height, this.y));
        const radius = this.radius || this.config?.radius || 40;
        spawnBossProjectilePuffEffect(clampedX, clampedY, { radius: radius * 2 });
      }
      this.dead = true;
    }

    if (this.life <= 0) {
      if (this.onExpire && !this.onExpireTriggered) {
        this.onExpireTriggered = true;
        this.onExpire(this);
      }
      this.dead = true;
    }
  }

  onHit(target) {
    if (this.onImpact && !this.onImpactTriggered) {
      this.onImpactTriggered = true;
      this.onImpact(this, target);
    }
    if (this.isDivineShot) {
      this.homingTarget = null;
      this.homingDuration = 0;
      this.homingStrength = 0;
    }
    if (!this.pierce) this.dead = true;
  }

  hitTest(enemy) {
    if (enemy?.isPlayer) {
      const playerHitbox = getPlayerHitboxRect(enemy);
      if (playerHitbox) {
        const radius = Math.max(0, this.radius || 0);
        return circleIntersectsRect(this.x, this.y, radius, playerHitbox);
      }
    }
    const hitbox = getEnemyHitboxRect(enemy);
    if (hitbox) {
      const radius = Math.max(0, this.radius || 0);
      return circleIntersectsRect(this.x, this.y, radius, hitbox);
    }
    const center = getEnemyHitboxCenter(enemy);
    const dx = center.x - this.x;
    const dy = center.y - this.y;
    const distance = Math.hypot(dx, dy);
    const threshold = this.radius + getEnemyHitboxRadius(enemy) * 0.6;
    return distance <= threshold;
  }

  getDamage() {
    return this.damage;
  }

  draw() {
    const fadeAlpha =
      this.type === "word_of_god"
        ? Math.max(0, Math.min(1, this.life / 0.2))
        : 1;
    if (this.lightSpreadShot) {
      drawLightTracerProjectile(this, fadeAlpha);
      return;
    }
    const shouldGlow = this.friendly || this.type === "miniTrident";
    if (this.type === "divine_shot") {
      const slashFrames = assets?.effects?.swordSlash;
      if (slashFrames && slashFrames.length) {
        const getTintedFrame = (frame, tint, cacheKey) => {
          if (!frame) return null;
          if (!this._tintCache) this._tintCache = {};
          const key = `${cacheKey}_${frame.__frameIdx ?? slashFrames.indexOf(frame)}`;
          if (this._tintCache[key]) return this._tintCache[key];
          const oc = document.createElement("canvas");
          oc.width = frame.width;
          oc.height = frame.height;
          const oc2d = oc.getContext("2d");
          oc2d.drawImage(frame, 0, 0);
          oc2d.globalCompositeOperation = "source-atop";
          oc2d.globalAlpha = 0.65;
          oc2d.fillStyle = tint;
          oc2d.fillRect(0, 0, oc.width, oc.height);
          this._tintCache[key] = oc;
          return oc;
        };
        const slashScale = DIVINE_CHAKRAM_SCALE;
        const facingLeft = Math.cos(this.rotation || 0) < 0;
        const cos = Math.cos(this.rotation || 0);
        const sin = Math.sin(this.rotation || 0);
        const trailStep = DIVINE_CHAKRAM_TRAIL_STEP;
        const totalFrames = slashFrames.length;
        const nowSec =
          (typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now()) / 1000;
        const spinDir = facingLeft ? -1 : 1;
        const spin = nowSec * DIVINE_CHAKRAM_SPIN_SPEED * spinDir;
        const layers = [];
        for (let i = DIVINE_CHAKRAM_TRAIL_COUNT - 1; i >= 0; i -= 1) {
          const alpha = i === 0 ? 0.95 : (0.46 + (DIVINE_CHAKRAM_TRAIL_COUNT - i - 1) * 0.16);
          layers.push({
            offset: trailStep * i,
            frameOffset: i + 1,
            tint: i === 0 ? "#fff7dc" : "#aaddff",
            alpha,
            spinOffset: -i * 0.18,
          });
        }
        for (const layer of layers) {
          const lx = this.x - cos * layer.offset;
          const ly = this.y - sin * layer.offset;
          const fi = (this.frameIndex + totalFrames - layer.frameOffset) % totalFrames;
          const srcFrame = slashFrames[fi];
          if (!srcFrame) continue;
          const frame = layer.tint ? getTintedFrame(srcFrame, layer.tint, layer.tint) : srcFrame;
          if (!frame) continue;
          const w = srcFrame.width * slashScale;
          const h = srcFrame.height * slashScale;
          ctx.save();
          ctx.globalAlpha = layer.alpha * fadeAlpha;
          ctx.translate(lx, ly);
          ctx.globalCompositeOperation = "lighter";
          ctx.rotate((this.rotation || 0) + spin + layer.spinOffset);
          ctx.shadowColor = "rgba(255, 232, 180, 0.95)";
          ctx.shadowBlur = 16;
          if (facingLeft) ctx.scale(1, -1);
          ctx.drawImage(frame, -w / 2, -h / 2, w, h);
          // Cross-cut layer makes the projectile read like a rotating slicer/chakram.
          ctx.rotate(Math.PI * 0.5);
          ctx.globalAlpha *= 0.75;
          ctx.drawImage(frame, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        ctx.save();
        ctx.translate(this.x, this.y);
        drawProjectileGlow(120, 120, {
          radiusScale: 1.06,
          baseAlpha: 0.27 * fadeAlpha,
          pulseScale: 0.22,
          colorCenter: "rgba(255,240,185,0.36)",
          colorMid: "rgba(255,198,120,0.2)",
          colorEdge: "rgba(255,165,95,0)",
        });
        ctx.restore();
      }
      return;
    }
    if (this.frames) {
      const frame = this.frames[this.frameIndex];
      if (!frame) return;
      const width = frame.width * this.scale;
      const height = frame.height * this.scale;
      let drawY = this.y;
      let projectileAlpha = fadeAlpha;
      if (this.fireThrowerBomb) {
        const groundRadius = Math.max(12, (this.radius || 16) * 0.95);
        ctx.save();
        ctx.translate(this.x, this.y + Math.max(4, groundRadius * 0.15));
        if (this.fireThrowerBombState === "flight") {
          const total = Math.max(0.001, Number(this.config.flightDuration) || 0.58);
          const progress = 1 - Math.max(0, this.fireThrowerFlightTimer) / total;
          const shadowScale = 0.62 + Math.sin(progress * Math.PI) * 0.45;
          ctx.fillStyle = "rgba(18, 10, 6, 0.18)";
          ctx.beginPath();
          ctx.ellipse(0, 0, groundRadius * shadowScale, groundRadius * 0.45 * shadowScale, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (this.fireThrowerBombState === "armed") {
          ctx.fillStyle = "rgba(18, 10, 6, 0.26)";
          ctx.beginPath();
          ctx.ellipse(0, 0, groundRadius, groundRadius * 0.52, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 186, 84, 0.62)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, groundRadius * 1.12, groundRadius * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        if (this.fireThrowerBombState === "flight") {
          const total = Math.max(0.001, Number(this.config.flightDuration) || 0.58);
          const progress = 1 - Math.max(0, this.fireThrowerFlightTimer) / total;
          drawY = this.y - Math.sin(progress * Math.PI) * this.fireThrowerVisualLift;
        } else if (this.fireThrowerBombState === "armed") {
          const blinkWindow = Math.min(0.55, Math.max(0.1, (this.config.armedDuration || 1.35) * 0.45));
          if (this.fireThrowerArmedTimer <= blinkWindow) {
            const blinkT = this.fireThrowerArmedTimer <= 0 ? 0 : this.fireThrowerArmedTimer;
            const blinkRate = this.fireThrowerArmedTimer <= blinkWindow * 0.5 ? 22 : 13;
            const blinkPulse = 0.55 + 0.45 * Math.abs(Math.sin((blinkWindow - blinkT) * blinkRate));
            projectileAlpha *= blinkPulse;
          }
        }
      }
      ctx.save();
      ctx.translate(this.x, drawY);
      if (this.flipHorizontal) {
        ctx.rotate(this.rotation + Math.PI);
        ctx.scale(-1, 1);
      } else {
        ctx.rotate(this.rotation);
      }
      if (projectileAlpha < 1) ctx.globalAlpha *= projectileAlpha;
      if (shouldGlow) {
        let glowOptions = undefined;
        let suppressGlow = false;
        if (this.type === "faith_cannon") {
          glowOptions = { radiusScale: 0.2, baseAlpha: 0.12 };
        }
        if (!suppressGlow) drawProjectileGlow(width, height, glowOptions);
      }
      ctx.drawImage(frame, -width / 2, -height / 2, width, height);
      ctx.restore();
    } else if (this.animator) {
      {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        if (fadeAlpha < 1) ctx.globalAlpha *= fadeAlpha;
        if (shouldGlow) {
          let glowOptions = undefined;
          let suppressGlow = false;
          if (this.type === "faith_cannon") {
            glowOptions = { radiusScale: 0.2, baseAlpha: 0.12 };
          }
          if (!suppressGlow) {
            const size = (this.radius || 18) * 2.2;
            drawProjectileGlow(size, size, glowOptions);
          }
        }
        ctx.restore();
        this.animator.draw(ctx, this.x, this.y, {
          rotation: this.rotation,
          scale: this.scale,
          alpha: fadeAlpha,
        });
      }
    }
  }
}

function applyProjectileDurabilityDamage(projectile, amount = null) {
  if (!projectile || projectile.dead) return true;
  if (!Number.isFinite(projectile.durability) || projectile.durability <= 0) {
    if (projectile.onDestroyed && !projectile.onDestroyedTriggered) {
      projectile.onDestroyedTriggered = true;
      projectile.onDestroyed(projectile);
    }
    projectile.dead = true;
    return true;
  }
  const damage = Math.max(
    1,
    Number.isFinite(amount) ? amount : projectile.durabilityDamagePerHit || 10,
  );
  projectile.durability = Math.max(0, projectile.durability - damage);
  if (projectile.durability <= 0) {
    if (projectile.onDestroyed && !projectile.onDestroyedTriggered) {
      projectile.onDestroyedTriggered = true;
      projectile.onDestroyed(projectile);
    }
    projectile.dead = true;
    return true;
  }
  return false;
}

function getPlayerProjectileDeflectDamage(meleeAttackState) {
  if (!meleeAttackState) return applyPlayerMeleeClassMultiplier(MELEE_BASE_DAMAGE);
  if (meleeAttackState.isRushing || meleeAttackState.rushDamageEnabled) {
    return applyPlayerMeleeClassMultiplier(RUSH_DAMAGE);
  }
  if (meleeAttackState.spinTimer > 0) {
    return applyPlayerMeleeClassMultiplier(
      Math.round(MELEE_BASE_DAMAGE * MELEE_SPIN_DAMAGE_MULTIPLIER),
    );
  }
  if (meleeAttackState.swooshTimer > 0) {
    return applyPlayerMeleeClassMultiplier(
      Math.round(MELEE_BASE_DAMAGE * MELEE_SWOOSH_DAMAGE_SCALE),
    );
  }
  return applyPlayerMeleeClassMultiplier(MELEE_BASE_DAMAGE);
}

let projectileGlowSprite = null;

function getProjectileGlowSprite() {
  if (projectileGlowSprite) return projectileGlowSprite;
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const localCtx = canvas.getContext("2d");
  if (!localCtx) return null;
  const center = size / 2;
  const gradient = localCtx.createRadialGradient(center, center, 2, center, center, center);
  gradient.addColorStop(0, "rgba(255, 222, 140, 0.32)");
  gradient.addColorStop(0.45, "rgba(255, 190, 110, 0.18)");
  gradient.addColorStop(0.75, "rgba(255, 170, 95, 0.08)");
  gradient.addColorStop(1, "rgba(255, 160, 80, 0)");
  localCtx.fillStyle = gradient;
  localCtx.beginPath();
  localCtx.arc(center, center, center, 0, Math.PI * 2);
  localCtx.fill();
  projectileGlowSprite = canvas;
  return projectileGlowSprite;
}

function drawProjectileGlow(
  width,
  height,
  { radiusScale = 0.95, baseAlpha = 0.2, pulseScale = 0.25, colorCenter, colorMid, colorEdge } = {},
) {
  const pulse = (Math.sin(performance.now() * 0.025) + 1) / 2;
  const alpha = baseAlpha + pulseScale * pulse;
  const radius = Math.max(width, height) * radiusScale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  if (colorCenter || colorMid || colorEdge) {
    const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
    gradient.addColorStop(0, colorCenter || "rgba(255, 222, 140, 0.32)");
    gradient.addColorStop(0.45, colorMid || "rgba(255, 190, 110, 0.18)");
    gradient.addColorStop(0.75, "rgba(255, 170, 95, 0.08)");
    gradient.addColorStop(1, colorEdge || "rgba(255, 160, 80, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const sprite = getProjectileGlowSprite();
    const drawSize = radius * 2;
    if (sprite) {
      ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    }
  }
  ctx.restore();
}

function drawLightTracerProjectile(projectile, fadeAlpha = 1) {
  if (!projectile) return;
  const vx = Number(projectile.vx) || 0;
  const vy = Number(projectile.vy) || 0;
  const speed = Math.max(1, Math.hypot(vx, vy));
  const dirX = vx / speed;
  const dirY = vy / speed;
  const len = Math.max(18, Math.min(40, (projectile.radius || 10) * 2.1));
  const halfW = Math.max(0.8, (projectile.radius || 8) * 0.14);
  const x = projectile.x || 0;
  const y = projectile.y || 0;
  const tailX = x - dirX * len;
  const tailY = y - dirY * len;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= Math.max(0, Math.min(1, fadeAlpha));
  const outer = ctx.createLinearGradient(tailX, tailY, x, y);
  outer.addColorStop(0, "rgba(120, 200, 255, 0.00)");
  outer.addColorStop(0.26, "rgba(135, 218, 255, 0.30)");
  outer.addColorStop(1, "rgba(215, 245, 255, 0.96)");
  ctx.strokeStyle = outer;
  ctx.lineCap = "round";
  ctx.lineWidth = halfW * 2.4;
  ctx.shadowColor = "rgba(150, 225, 255, 0.96)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();
  const inner = ctx.createLinearGradient(tailX, tailY, x, y);
  inner.addColorStop(0, "rgba(215, 245, 255, 0.00)");
  inner.addColorStop(0.34, "rgba(220, 248, 255, 0.50)");
  inner.addColorStop(1, "rgba(250, 255, 255, 1.00)");
  ctx.strokeStyle = inner;
  ctx.lineWidth = halfW * 0.9;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

class BossEncounter {
  constructor({ level = 1, type = chooseBossType(level) } = {}) {
    this.level = level;
    this.type = type;
    this.config = ENEMY_TYPES[this.type];
    const clipBundle = resolveBossClips(this.type);
    this.clips = clipBundle?.clips || null;
    this.visualType = clipBundle?.key || this.type;
    this.usingFallbackClips = Boolean(clipBundle?.fallback);
    if (!this.config || !this.clips) {
      if (!this.config) {
        logBossSpriteIssue({ reason: "missing-boss-config", requestedType: this.type });
      }
      if (!this.clips) {
        logBossSpriteIssue({ reason: "missing-boss-clips-after-fallback", requestedType: this.type });
      }
      this.invalid = true;
      return;
    }
    this.scale = this.config.scale;
    const maxRadius = 420 * WORLD_SCALE;
    this.radius = Math.min(maxRadius, this.config.hitRadius || 28);
    const baseHitbox = this.config.hitbox || null;
    this.hitbox = baseHitbox ? {
      width: baseHitbox.width,
      height: baseHitbox.height,
      offsetX: baseHitbox.offsetX || 0,
      offsetY: baseHitbox.offsetY || 0,
    } : null;
    this.animator = new Animator(this.clips, this.scale);
    this.animator.play("idle");
    this.state = "idle";
    this.facing = "down";
    this.maxHealth = this.config.health || 300;
    this.health = this.maxHealth;
    this.phase = 1;
    this.phaseNotified = { 2: false, 3: false };
    this.projectileTimer = 1.5;
    this.meleeAttackTimer = 0;
    this.meleeAttackHitApplied = false;
    this.summonTimer = 7.5;
    this.hazardTimer = 9;
    this.touchCooldown = 0;
    this.dead = false;
    this.defeated = false;
    this.removed = false;
    this.deathNotified = false;
    this.ignoreObstacles = true;
    this.shieldHitCooldown = 0;
    this.tauntCooldown = 0;
    this.deathExplosionTimer = 0;
    this.deathExplosionAccumulator = 0;
    this.deathPostDelay = 0;
    this.deathVisualTotal = 0;
    this.deathGraceRainTimer = 0;
    this.deathGraceRainInterval = GRACE_BOSS_DEATH_RAIN_INTERVAL_IDLE;
    this.deathStageNotified = false;
    this.victoryAnnounced = false;
    this.safeTopMargin = Math.max(this.radius * 0.8, 160);
    const spawnX = Math.max(this.radius + 20, canvas.width - this.radius - 36 - 200);
    const playfieldCenterY = HUD_HEIGHT + (canvas.height - HUD_HEIGHT) / 2;
    const spawnY = Math.max(
      HUD_HEIGHT + this.safeTopMargin,
      Math.min(canvas.height - this.safeTopMargin, playfieldCenterY - 150),
    );
    this.x = spawnX;
    this.y = spawnY;
    clampEntityToBounds(this);
    this.spawnIntro = {
      active: true,
      timer: 0,
      precursorDuration: 1.25,
      frameDuration: 0.09,
      frameCount: 5,
      opaqueByFrame: 4,
      // Oversize to cover spawn location and make the teleport feel explosive.
      explosionSize: Math.max(760, this.scale * 56),
      // Tune where the final mushroom cloud "sits" on the ground line.
      // Lower ratio plants it deeper (visibly lower) without affecting precursor bursts.
      mainExplosionGroundRatio: 0.86,
      // Positive values move the main mushroom cloud down toward the ground line.
      mainExplosionOffsetY: 88,
      bossAlpha: 0,
      events: [
        {
          key: "enemyDeathExplosionAlt2",
          startTime: 0.00,
          duration: 0.30,
          frameDuration: 0.05,
          size: 210,
          offsetX: -96,
          offsetY: 6,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt",
          startTime: 0.08,
          duration: 0.30,
          frameDuration: 0.05,
          size: 220,
          offsetX: -56,
          offsetY: 8,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt2",
          startTime: 0.14,
          duration: 0.30,
          frameDuration: 0.05,
          size: 230,
          offsetX: 12,
          offsetY: 8,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt",
          startTime: 0.22,
          duration: 0.32,
          frameDuration: 0.05,
          size: 240,
          offsetX: 72,
          offsetY: 6,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt2",
          startTime: 0.30,
          duration: 0.32,
          frameDuration: 0.05,
          size: 250,
          offsetX: -124,
          offsetY: 4,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt",
          startTime: 0.38,
          duration: 0.32,
          frameDuration: 0.05,
          size: 260,
          offsetX: -14,
          offsetY: 10,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt2",
          startTime: 0.46,
          duration: 0.34,
          frameDuration: 0.05,
          size: 270,
          offsetX: 102,
          offsetY: 4,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt",
          startTime: 0.54,
          duration: 0.34,
          frameDuration: 0.05,
          size: 280,
          offsetX: -78,
          offsetY: 8,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt2",
          startTime: 0.62,
          duration: 0.34,
          frameDuration: 0.05,
          size: 290,
          offsetX: 28,
          offsetY: 10,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt",
          startTime: 0.70,
          duration: 0.34,
          frameDuration: 0.05,
          size: 300,
          offsetX: 136,
          offsetY: 2,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt2",
          startTime: 0.78,
          duration: 0.34,
          frameDuration: 0.05,
          size: 310,
          offsetX: -146,
          offsetY: 2,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt",
          startTime: 0.86,
          duration: 0.34,
          frameDuration: 0.05,
          size: 320,
          offsetX: -40,
          offsetY: 8,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt2",
          startTime: 0.94,
          duration: 0.34,
          frameDuration: 0.05,
          size: 340,
          offsetX: 54,
          offsetY: 4,
          sfxPlayed: false,
        },
        {
          key: "enemyDeathExplosionAlt",
          startTime: 1.02,
          duration: 0.34,
          frameDuration: 0.05,
          size: 360,
          offsetX: 0,
          offsetY: 6,
          sfxPlayed: false,
        },
      ],
    };
    this.animator.play("idle");
  }

  getHpBarMetrics() {
    const baseOffset = 130;
    const name = this.config?.displayName || "";
    const offsetY = name === "High Demon" ? baseOffset - 25 : baseOffset;
    return {
      width: 260,
      height: 18,
      offsetY,
    };
  }

  isActive() {
    return !this.invalid && !this.removed;
  }

  getSpeed() {
    const base = this.config.speed || 120;
    if (this.phase === 1) return base * 0.55;
    if (this.phase === 2) return base * 0.75;
    return base * 1.05;
  }

  getProjectileCooldown() {
    if (this.phase === 1) return 2.4;
    if (this.phase === 2) return 1.6;
    return 1.1;
  }

  getSummonCooldown() {
    if (this.phase === 2) return 10;
    return 7;
  }

  getHazardCooldown() {
    const catalogDef = this.getCatalogDef();
    if (this.phase >= 3 && Number.isFinite(catalogDef?.p3SunburstCooldown) && catalogDef.p3SunburstCooldown > 0) {
      return catalogDef.p3SunburstCooldown;
    }
    return Math.max(5, 7.5 - this.level * 0.4);
  }

  moveTowardPlayer(dt) {
    if (!player) return;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return;
    const speed = this.getSpeed();
    const nx = dx / distance;
    const ny = dy / distance;
    const maintainDistance = this.phase === 1 ? 140 : 100;
    if (distance > maintainDistance) {
      this.x += nx * speed * dt;
      this.y += ny * speed * dt;
    } else if (distance < maintainDistance * 0.7) {
      this.x -= nx * speed * dt * 0.5;
      this.y -= ny * speed * dt * 0.5;
    }
    resolveEntityObstacles(this);
    clampEntityToBounds(this);
    this.updateFacing(nx, ny);
    if (this.state !== "attack" && this.state !== "hurt") {
      if (this.state !== "walk") {
        this.state = "walk";
        this.animator.play("walk");
      }
    }
  }

  updateFacing(nx, ny) {
    if (Math.abs(nx) > Math.abs(ny)) {
      this.facing = nx >= 0 ? "right" : "left";
    } else {
      this.facing = ny >= 0 ? "down" : "up";
    }
  }

  getProjectileType() {
    const catalogDef =
      window.BattlechurchEnemyCatalog?.catalog?.[this.type] ||
      window.BattlechurchEnemyDefinitions?.[this.type] ||
      null;
    if (catalogDef?.projectileType) return catalogDef.projectileType;
    if (this.type === "miniDemonLord") return "fire";
    if (this.phase === 1) return "arrow";
    return "fire";
  }

  getProjectileDamage() {
    const base = Number.isFinite(this.config?.attackDamage) && this.config.attackDamage > 0
      ? this.config.attackDamage
      : (Number.isFinite(this.config?.damage) && this.config.damage > 0 ? this.config.damage : 1);
    const phaseScale = this.phase === 1 ? 1.0 : this.phase === 2 ? 1.25 : 1.75;
    return base * phaseScale;
  }

  performProjectileAttack() {
    if (!player) return;
    const catalogDef =
      window.BattlechurchEnemyCatalog?.catalog?.[this.type] ||
      window.BattlechurchEnemyDefinitions?.[this.type] ||
      null;
    if (catalogDef && !catalogDef.ranged) return;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dir = normalizeVector(dx, dy);
    const type = this.getProjectileType();
    const base = PROJECTILE_CONFIG[type] || {};
    const isDemonLord = this.type === "miniDemonLord";
    const speedMultiplier = isDemonLord
      ? this.phase === 1 ? 0.58 : this.phase === 2 ? 0.64 : 0.72
      : this.phase === 1 ? 0.85 : this.phase === 2 ? 1.05 : 1.2;
    const projectileFramesOverride = isDemonLord ? projectileFrames.demonLordFireball : null;
    const projectile = spawnProjectile(type, this.x, this.y, dir.x, dir.y, {
      friendly: false,
      speed: (base.speed || 420) * speedMultiplier,
      damage: isDemonLord ? 5 : this.getProjectileDamage(),
      radius: isDemonLord ? Math.max(base.radius || 28, 34) : base.radius || 28,
      durabilityHealth: isDemonLord ? 20 : undefined,
      durabilityDamagePerHit: isDemonLord ? 10 : undefined,
      frames: Array.isArray(projectileFramesOverride) && projectileFramesOverride.length
        ? projectileFramesOverride
        : undefined,
      frameDuration: isDemonLord ? 0.055 : undefined,
      scale: isDemonLord ? 1.2 : undefined,
      source: this,
    });
    if (projectile) {
      if (typeof playFireballCastSfx === "function") {
        playFireballCastSfx(isDemonLord ? 0.85 : 0.7);
      }
      this.state = "attack";
      this.animator.play("attack", { restart: true });
    }
  }

  getCatalogDef() {
    return (
      window.BattlechurchEnemyCatalog?.catalog?.[this.type] ||
      window.BattlechurchEnemyDefinitions?.[this.type] ||
      null
    );
  }

  summonMinions() {
    const catalogDef = this.getCatalogDef();
    const minionType = (catalogDef?.p2MinionType) || "miniFireImp";
    const count = Number.isFinite(catalogDef?.p2MinionCount) && catalogDef.p2MinionCount > 0
      ? catalogDef.p2MinionCount
      : Math.min(3, 2 + Math.floor(this.level / 2));
    if (enemies.length >= MAX_ACTIVE_ENEMIES + 2) return;
    for (let i = 0; i < count; i += 1) {
      const offset = randomInRange(60, 140);
      const angle = Math.random() * Math.PI * 2;
      spawnEnemyOfType(minionType, {
        x: this.x + Math.cos(angle) * offset,
        y: this.y + Math.sin(angle) * offset,
      });
    }
  }

  spawnHazard() {
    if (this.phase < 3) {
      const targetX = player ? player.x : this.x;
      const targetY = player ? player.y : this.y;
      const angle = Math.random() * Math.PI * 2;
      const distance = randomInRange(80, 180);
      const x = Math.max(
        this.radius,
        Math.min(canvas.width - this.radius, targetX + Math.cos(angle) * distance),
      );
      const y = Math.max(
        HUD_HEIGHT + this.radius,
        Math.min(canvas.height - this.radius, targetY + Math.sin(angle) * distance),
      );
      const radius = 120 + this.phase * 30;
      const hazardDamage = this.phase >= 2 ? 2 : 1;
      bossHazards.push(new BossHazard(x, y, radius, 3.5, { damage: hazardDamage }));
      spawnMagicImpactEffect(x, y - radius / 4);
      return;
    }

    const catalogDef = this.getCatalogDef();
    const fanCount = Number.isFinite(catalogDef?.p3SunburstCount) && catalogDef.p3SunburstCount >= 2
      ? catalogDef.p3SunburstCount
      : 6;
    const sunburstDamage = Number.isFinite(catalogDef?.p3SunburstDamage) && catalogDef.p3SunburstDamage > 0
      ? catalogDef.p3SunburstDamage
      : this.getProjectileDamage();
    for (let i = 0; i < fanCount; i += 1) {
      const angle = (Math.PI * 2 * i) / fanCount;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const projectile = spawnProjectile("fire", this.x, this.y, dirX, dirY, {
        friendly: false,
        speed: PROJECTILE_CONFIG.fire.speed * 1.1,
        damage: sunburstDamage,
        radius: PROJECTILE_CONFIG.fire.radius,
        source: this,
      });
      if (projectile) {
        projectile.hitEntities.add(this);
      }
    }
  }

  performMeleeAttack() {
    const catalogDef =
      window.BattlechurchEnemyCatalog?.catalog?.[this.type] ||
      window.BattlechurchEnemyDefinitions?.[this.type] ||
      null;
    if (!catalogDef || catalogDef.ranged) return;
    if (!player || player.state === "death") return;
    if (this.meleeAttackTimer > 0) return;
    if (this.state === "attack") return;
    const attackRange = (this.config?.desiredRange || 80) + (this.radius || 28);
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > attackRange) return;
    this.state = "attack";
    this.animator.play("attack", { restart: true });
    this.meleeAttackHitApplied = false;
    const cooldown = this.config?.cooldown || this.config?.attackCooldown || 1.5;
    this.meleeAttackTimer = cooldown;
  }

  tickMeleeAttackHit() {
    if (this.state !== "attack" || this.meleeAttackHitApplied) return;
    const hitFrame = Number.isFinite(this.config?.attackHitFrame) && this.config.attackHitFrame > 0
      ? this.config.attackHitFrame : null;
    if (hitFrame) {
      const currentFrame = (Number.isFinite(this.animator?.frameIndex) ? this.animator.frameIndex : 0) + 1;
      if (currentFrame < hitFrame) return;
    }
    this.meleeAttackHitApplied = true;
    if (!player || player.state === "death") return;
    const attackRange = (this.config?.desiredRange || 80) + (this.radius || 28) + 20;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    if (Math.hypot(dx, dy) > attackRange) return;
    if (player.invulnerableTimer > 0) return;
    if (player.shieldTimer > 0) {
      applyShieldImpact(this);
      return;
    }
    const baseHit = Number.isFinite(this.config?.attackHitDamage) && this.config.attackHitDamage > 0
      ? this.config.attackHitDamage
      : (Number.isFinite(this.config?.attackDamage) && this.config.attackDamage > 0 ? this.config.attackDamage : 5);
    const damage = this.phase === 3 ? Math.round(baseHit * 1.5) : baseHit;
    player.takeDamage(damage);
    cameraShakeTimer = CAMERA_SHAKE_DURATION;
    cameraShakeMagnitude = CAMERA_SHAKE_INTENSITY * 1.2;
  }

  applyContactDamage() {
    if (!player || player.state === "death") return;
    if (!circleIntersectsPlayerHurtbox(this.x, this.y, this.radius, player)) return;
    if (this.touchCooldown > 0) return;
    if (this.state === "attack") return;
    if (player.invulnerableTimer > 0) {
      this.touchCooldown = Math.max(this.touchCooldown, 0.35);
      return;
    }
    if (player.shieldTimer > 0) {
      applyShieldImpact(this);
      this.touchCooldown = Math.max(this.touchCooldown, SHIELD_LARGE_COOLDOWN);
      return;
    }
    const baseContact = Number.isFinite(this.config?.contactDamage) && this.config.contactDamage > 0
      ? this.config.contactDamage
      : 2;
    const damage = this.phase === 3 ? Math.round(baseContact * 1.5) : baseContact;
    player.takeDamage(damage);
    this.touchCooldown = 2.2 - this.phase * 0.3;
    cameraShakeTimer = CAMERA_SHAKE_DURATION;
    cameraShakeMagnitude = CAMERA_SHAKE_INTENSITY * 1.2;
  }

  checkPhaseTransition() {
    const ratio = this.maxHealth > 0 ? this.health / this.maxHealth : 0;
    if (ratio <= 0.33 && !this.phaseNotified[3]) {
      this.phase = 3;
      this.phaseNotified[3] = true;
      queueLevelAnnouncement("Phase 3", "Phase 3 Text Here", 2.2);
      this.hazardTimer = 2.5;
      this.summonTimer = 4.5;
      setDevStatus("Boss phase 3 – enraged", 3.5);
    } else if (ratio <= 0.66 && !this.phaseNotified[2]) {
      this.phase = Math.max(this.phase, 2);
      this.phaseNotified[2] = true;
      queueLevelAnnouncement("Phase 2", "Phase 2 Text Here", 2.2);
      this.summonTimer = 2;
      setDevStatus("Boss phase 2 – reinforcements", 3.5);
    }
  }

  takeDamage(amount, options = {}) {
    if (this.invalid || this.removed || this.state === "death") return;
    if (this.spawnIntro?.active) return;
    const damageType = options?.damageType || null;
    const damageClass = (this.damageClass || this.config?.damageClass || "normal").toLowerCase();
    let multiplier = 1;
    if (damageType) {
      multiplier = damageType === "projectile" && damageClass === "armored" ? 0.7 : 1.0;
    }
    const scaledDamage = Math.max(0, Math.round(amount * multiplier));
    if (isDevMeleeArenaActive() && typeof window !== "undefined") {
      window.__devArenaLastAppliedDamage = {
        at:
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now(),
        target: this.config?.displayName || this.type || "Enemy",
        damageType: damageType || "none",
        damageClass,
        baseDamage: Math.max(0, Math.round(Number(amount) || 0)),
        multiplier: Number(multiplier) || 1,
        appliedDamage: scaledDamage,
      };
    }
    const prevHealth = this.health;
    this.health = Math.max(0, this.health - scaledDamage);
    if (scaledDamage > 0 && (this.maxHealth || 0) > 0) {
      const startRatio = prevHealth / this.maxHealth;
      const endRatio = this.health / this.maxHealth;
      this.hpDamageFlash = {
        startRatio,
        endRatio,
        timer: 1.0,
        duration: 1.0,
        flashes: 3,
      };
    }
    const impactX = Number.isFinite(options.hitX)
      ? options.hitX
      : Number.isFinite(options.x)
        ? options.x
        : this.x;
    const impactY = Number.isFinite(options.hitY)
      ? options.hitY
      : Number.isFinite(options.y)
        ? options.y
        : this.y;
    if (!options.skipImpactEffect) {
      spawnImpactEffect(impactX, impactY);
    }
    if (typeof playEnemyHitSfx === "function") {
      playEnemyHitSfx();
    }
    const damageText = options?.damageText || null;
    const hpBar = this.getHpBarMetrics();
    const defaultDamageOffset =
      (hpBar?.offsetY || 0) + (hpBar?.height || 0) / 2;
    showDamage(this, amount, {
      color: damageText?.color || UI_COLOR.damageEnemy,
      fontSize: damageText?.fontSize || null,
      fontWeight: damageText?.fontWeight || null,
      offsetY:
        typeof damageText?.offsetY === "number"
          ? damageText.offsetY
          : defaultDamageOffset,
      fadeDelay: damageText?.fadeDelay || 0,
      priority: damageText?.priority || 0,
    });
    if (this.health <= 0) {
      this.beginDeath();
      return;
    }
    if (this.state !== "hurt" && this.state !== "attack") {
      this.state = "hurt";
      this.animator.play("hurt", { restart: true });
    }
    this.checkPhaseTransition();
  }

  beginDeath() {
    if (this.state === "death") return;
    this.state = "death";
    // Ensure boss death animation plays once and does not loop
    this.animator.play("death", { restart: true, loop: false });
    startBossDeathMusic();
    if (!this.victoryAnnounced) {
      queueLevelAnnouncement("Victory!", "The boss has fallen.", {
        duration: 2.0,
        skipMissionBrief: true,
        allowDuringSuppression: true,
      });
      this.victoryAnnounced = true;
    }
    const highHealth = (this.maxHealth || 0) > 400;
    if (highHealth && typeof playHighHealthEnemyDeathSfx === "function") {
      playHighHealthEnemyDeathSfx(1.0);
    } else if (typeof playEnemyDeathSfx === "function") {
      playEnemyDeathSfx(0.4);
    }
    this.dying = true;
    lastEnemyDeathPosition = { x: this.x, y: this.y };
    if (!this.deathNotified) {
      levelManager?.notifyEnemyDefeated();
      checkKillMilestoneBurst();
      const bossBaseHp = Math.max(0, Number(this.maxHealth) || Number(this.config?.health) || 0);
      if (bossBaseHp > 0) levelManager?.notifyEnemyDamaged?.(bossBaseHp);
      spawnPowerUpDrops(4 + Math.min(3, this.level));
      spawnMagicSplashEffect(this.x, this.y, this.radius * 2.8);
      spawnImpactDustEffect(this.x, this.y, this.radius * 1.2);
      this.deathNotified = true;
    }
    this.deathExplosionTimer = 5;
    this.deathPostDelay = 1;
    this.deathExplosionAccumulator = 0;
    this.deathVisualTotal = this.deathExplosionTimer + this.deathPostDelay;
    this.deathGraceRainTimer = GRACE_BOSS_DEATH_RAIN_INITIAL_DELAY;
    this.deathGraceRainInterval = GRACE_BOSS_DEATH_RAIN_INTERVAL_ACTIVE;
    if (!this.deathStageNotified) {
      levelManager?.markBossDefeated?.();
      this.deathStageNotified = true;
    }
    eliminateActiveEnemiesForBossVictory();
    // compute fallback death timer from clip (prefer explicit frameMap length)
    try {
      const clip = this.animator.currentClip || {};
      const framesFromMap =
        Array.isArray(clip.frameMap) && clip.frameMap.length ? clip.frameMap.length : null;
      const frames = framesFromMap || clip.frameCount || 0 || 10;
      const rate = clip && clip.frameRate ? clip.frameRate : 8;
      const expected = Math.max(0.05, frames / Math.max(0.0001, rate));
      this.deathTimer = expected + 0.3;
    } catch (e) {}
  }

  spawnDeathExplosionBurst() {
    const hitbox = this.hitbox || this.config?.hitbox || null;
    const hbOffsetX = hitbox && Number.isFinite(hitbox.offsetX) ? hitbox.offsetX : 0;
    const hbOffsetY = hitbox && Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0;
    const hbHalfW = hitbox && Number.isFinite(hitbox.width) ? hitbox.width * 0.5 : this.radius;
    const hbHalfH = hitbox && Number.isFinite(hitbox.height) ? hitbox.height * 0.5 : this.radius;
    // Hitbox is tiny versus the rendered boss sprite, so apply an explicit
    // screen-space lift to keep explosions over the visible corpse.
    const corpseVisualLift = -72;
    const burstCenterX = this.x + hbOffsetX - 70;
    const burstCenterY = this.y + hbOffsetY + hbHalfH * 0.0 + corpseVisualLift;
    const burstCount = 2 + Math.floor(Math.random() * 3);
    const burstRadius = Math.max(hbHalfW, hbHalfH) * 1.05;
    for (let i = 0; i < burstCount; i += 1) {
      const burstX = burstCenterX + (Math.random() * 2 - 1) * hbHalfW * 1.2;
      const burstY = burstCenterY + (Math.random() * 2 - 1) * hbHalfH * 0.45;
      spawnEnemyDeathExplosion(burstX, burstY, {
        radius: burstRadius,
        scaleMultiplier: 1.2,
      });
      if (Math.random() < 0.45) {
        spawnImpactDustEffect(burstX, burstY, this.radius * 0.4);
      }
      if (Math.random() < 0.25) {
        spawnRayboltEffect(burstX, burstY, this.radius * 0.55);
      }
    }
    const sfxVolume = 0.55 + Math.random() * 0.35;
    playPooledSfx(bossDeathExplosionSfxPool, BOSS_DEATH_EXPLOSION_SFX_SRCS, BOSS_DEATH_EXPLOSION_SFX_POOL_SIZE, { volume: sfxVolume, matchSrc: true });
  }

  updateDeathVisuals(dt) {
    if (this.deathExplosionTimer > 0) {
      this.deathExplosionTimer = Math.max(0, this.deathExplosionTimer - dt);
      this.deathExplosionAccumulator += dt;
      this.deathGraceRainTimer = Math.max(0, (this.deathGraceRainTimer || 0) - dt);
      while (this.deathGraceRainTimer <= 0 && this.deathExplosionTimer > 0) {
        this.deathGraceRainTimer += this.deathGraceRainInterval;
        spawnVictoryGraceBurst({
          reason: "boss",
          amount: GRACE_BOSS_DEATH_BURST_AMOUNT,
          life: GRACE_BOSS_DEATH_BURST_LIFE,
          centerX: this.x,
          centerY: this.y,
        });
      }
      const progress = 1 - Math.max(0, this.deathExplosionTimer) / 5;
      const interval = Math.max(0.07, 0.22 - progress * 0.12);
      while (this.deathExplosionAccumulator >= interval) {
        this.deathExplosionAccumulator -= interval;
        this.spawnDeathExplosionBurst();
      }
      return;
    }
    if (this.deathPostDelay > 0) {
      this.deathPostDelay = Math.max(0, this.deathPostDelay - dt);
    }
  }

  getDeathFadeAlpha() {
    if (this.state !== "death") return 1;
    const total = Number.isFinite(this.deathVisualTotal) ? this.deathVisualTotal : 0;
    if (total <= 0) return 1;
    const remaining =
      Math.max(0, Number.isFinite(this.deathExplosionTimer) ? this.deathExplosionTimer : 0) +
      Math.max(0, Number.isFinite(this.deathPostDelay) ? this.deathPostDelay : 0);
    const linear = Math.max(0, Math.min(1, remaining / total));
    const fastFadeExponent = 2.2;
    return Math.pow(linear, fastFadeExponent);
  }

  update(dt) {
    if (!this.isActive()) return;
    if (this.hpDamageFlash?.timer > 0) {
      this.hpDamageFlash.timer = Math.max(0, this.hpDamageFlash.timer - dt);
    }

    if (this.spawnIntro?.active) {
      this.spawnIntro.timer = Math.max(0, this.spawnIntro.timer + dt);
      const precursorDuration = Math.max(0, this.spawnIntro.precursorDuration || 0);
      const finalTimer = Math.max(0, this.spawnIntro.timer - precursorDuration);
      const frameDuration = Math.max(0.01, this.spawnIntro.frameDuration || 0.06);
      const introFrame = Math.floor(finalTimer / frameDuration) + 1;
      const opaqueBy = Math.max(1, Math.round(this.spawnIntro.opaqueByFrame || 4));
      this.spawnIntro.bossAlpha = this.spawnIntro.timer >= precursorDuration
        ? Math.max(0, Math.min(1, introFrame / opaqueBy))
        : 0;
      const events = Array.isArray(this.spawnIntro.events) ? this.spawnIntro.events : [];
      events.forEach((event) => {
        if (!event || event.sfxPlayed || this.spawnIntro.timer < (event.startTime || 0)) return;
        event.sfxPlayed = true;
        const sfxVolume = 0.48 + Math.random() * 0.28;
        playPooledSfx(
          bossDeathExplosionSfxPool,
          BOSS_DEATH_EXPLOSION_SFX_SRCS,
          BOSS_DEATH_EXPLOSION_SFX_POOL_SIZE,
          { volume: sfxVolume, matchSrc: true },
        );
      });
      const frameCount = Math.max(1, Math.round(this.spawnIntro.frameCount || 5));
      if (this.spawnIntro.timer >= precursorDuration + frameCount * frameDuration) {
        this.spawnIntro.active = false;
        this.spawnIntro.bossAlpha = 1;
      }
      this.animator.update(dt);
      return;
    }

    if (this.state === "death") {
      this.animator.update(dt);
      this.updateDeathVisuals(dt);
      if (typeof this.deathTimer === 'number') {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0 && !this.animator.isFinished()) {
          this.animator.finished = true;
        }
      }
      const animationFinished = this.animator.isFinished();
      const explosionsFinished = this.deathExplosionTimer <= 0;
      const holdFinished = explosionsFinished && this.deathPostDelay <= 0;
      if (animationFinished && explosionsFinished && holdFinished) {
        this.dead = true;
        this.removed = true;
        this.defeated = true;
        levelManager?.markBossDefeated();
      }
      return;
    }

    if (this.state === "hurt" && this.animator.isFinished()) {
      this.state = "walk";
      this.animator.play("walk");
    }
    if (this.state === "attack" && this.animator.isFinished()) {
      markCounterHitWindow(this);
      this.state = "walk";
      this.animator.play("walk");
    }

    this.projectileTimer -= dt;
    this.meleeAttackTimer = Math.max(0, (this.meleeAttackTimer || 0) - dt);
    this.summonTimer -= dt;
    this.hazardTimer -= dt;
    this.touchCooldown = Math.max(0, this.touchCooldown - dt);
    this.shieldHitCooldown = Math.max(0, (this.shieldHitCooldown || 0) - dt);
    this.tauntCooldown = Math.max(0, (this.tauntCooldown || 0) - dt);

    if (player && player.state !== "death") {
      this.performMeleeAttack();
      this.tickMeleeAttackHit();
      this.moveTowardPlayer(dt);
      this.applyContactDamage();
    } else {
      this.state = "idle";
      this.animator.play("idle");
    }

    if (this.projectileTimer <= 0) {
      this.performProjectileAttack();
      this.projectileTimer = this.getProjectileCooldown();
    }

    const _bcd = this.getCatalogDef();
    const _p2SummonOk = _bcd?.p2SummonEnabled !== false;
    const _p3SummonOk = _bcd?.p3SummonEnabled !== false;
    const _p3SunburstOk = _bcd?.p3SunburstEnabled !== false;

    if (this.phase === 2 && _p2SummonOk && this.summonTimer <= 0) {
      this.summonMinions();
      this.summonTimer = this.getSummonCooldown();
    } else if (this.phase >= 3 && _p3SummonOk && this.summonTimer <= 0) {
      this.summonMinions();
      this.summonTimer = this.getSummonCooldown();
    }

    if (this.phase >= 3 && _p3SunburstOk && this.hazardTimer <= 0) {
      this.spawnHazard();
      this.hazardTimer = this.getHazardCooldown();
    }

    this.animator.update(dt);
  }

  draw(context) {
    if (!this.isActive()) return;
    const flip = this.facing === "left";
    const fadeAlpha = this.getDeathFadeAlpha();
    const spawnIntro = this.spawnIntro || null;
    const spawnAlpha = spawnIntro?.active
      ? Math.max(0, Math.min(1, spawnIntro.bossAlpha ?? 0))
      : 1;
    const drawAlpha = Math.max(0, Math.min(1, fadeAlpha * spawnAlpha));
    this.animator.draw(context, this.x, this.y, { flipX: flip, alpha: drawAlpha });

    if (spawnIntro?.active) {
      const introTimer = Math.max(0, Number(spawnIntro.timer) || 0);
      const hitbox = this.hitbox || this.config?.hitbox || null;
      const hbOffsetY = hitbox && Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0;
      const hbHalfH = hitbox && Number.isFinite(hitbox.height) ? hitbox.height * 0.5 : this.radius;
      const activeClip = this.animator?.currentClip || null;
      const clipRenderScale =
        activeClip && Number.isFinite(activeClip.renderScale) && activeClip.renderScale > 0
          ? activeClip.renderScale
          : 1;
      const animatorScale =
        this.animator && Number.isFinite(this.animator.scale) && this.animator.scale > 0
          ? this.animator.scale
          : 1;
      const spriteHalfH =
        activeClip && Number.isFinite(activeClip.frameHeight) && activeClip.frameHeight > 0
          ? (activeClip.frameHeight * clipRenderScale * animatorScale) / 2
          : null;
      const groundAnchorY = Number.isFinite(spriteHalfH) && spriteHalfH > 0
        ? this.y + spriteHalfH * 0.98
        : this.y + hbOffsetY + hbHalfH * 0.95;
      const events = Array.isArray(spawnIntro.events) ? spawnIntro.events : [];
      events.forEach((event) => {
        if (!event) return;
        const eventStart = Math.max(0, Number(event.startTime) || 0);
        const eventDuration = Math.max(0.05, Number(event.duration) || 0.2);
        const localTimer = introTimer - eventStart;
        if (localTimer < 0 || localTimer > eventDuration) return;
        const frames = assets?.effects?.[event.key] || assets?.effects?.prayerBombExplosion;
        if (!Array.isArray(frames) || !frames.length) return;
        const eventFrameDuration = Math.max(0.01, Number(event.frameDuration) || 0.04);
        const frameIndex = Math.max(
          0,
          Math.min(
            frames.length - 1,
            Math.floor(localTimer / eventFrameDuration),
          ),
        );
        const frame = frames[frameIndex];
        if (!frame) return;
        const lifeRatio = Math.max(0, Math.min(1, localTimer / eventDuration));
        const size = Math.max(64, Number(event.size) || 240);
        context.save();
        context.globalAlpha = 1 - lifeRatio * 0.15;
        context.drawImage(
          frame,
          this.x + (Number(event.offsetX) || 0) - size / 2,
          groundAnchorY + (Number(event.offsetY) || 0) - size,
          size,
          size,
        );
        context.restore();
      });

      const frames = assets?.effects?.prayerBombExplosion;
      const precursorDuration = Math.max(0, spawnIntro.precursorDuration || 0);
      const finalTimer = Math.max(0, introTimer - precursorDuration);
      if (Array.isArray(frames) && frames.length && introTimer >= precursorDuration) {
        const frameDuration = Math.max(0.01, spawnIntro.frameDuration || 0.06);
        const frameCount = Math.max(1, Math.round(spawnIntro.frameCount || 5));
        const frameIndex = Math.max(
          0,
          Math.min(
            frameCount - 1,
            Math.floor(finalTimer / frameDuration),
          ),
        );
        const frame = frames[Math.min(frameIndex, frames.length - 1)];
        if (frame) {
          const size = Math.max(64, Number(spawnIntro.explosionSize) || 420);
          const mainExplosionGroundRatio = Math.max(
            0.4,
            Math.min(1.2, Number(spawnIntro.mainExplosionGroundRatio) || 1),
          );
          const mainExplosionOffsetY = Number(spawnIntro.mainExplosionOffsetY) || 0;
          context.save();
          context.globalAlpha = 1;
          context.drawImage(
            frame,
            this.x - size / 2,
            groundAnchorY + mainExplosionOffsetY - size * mainExplosionGroundRatio,
            size,
            size,
          );
          context.restore();
        }
      }
    }

    this.drawHealthBar(context, drawAlpha);
  }

  drawHealthBar(context, alpha = 1) {
    if (alpha <= 0) return;
    const hpLabelType = window.UIStyles?.typography?.enemyHealthBarLabel || {};
    const ratio = this.maxHealth > 0 ? Math.max(0, this.health / this.maxHealth) : 0;
    const metrics = this.getHpBarMetrics();
    const width = metrics.width;
    const height = metrics.height;
    const barX = this.x - width / 2;
    const barY = this.y - this.radius + metrics.offsetY;
    const labelName = this.config?.displayName || this.type || "Boss";
    const hpValue = Math.max(0, Math.round(this.health));
    const hpMax = Math.max(1, Math.round(this.maxHealth || 1));
    const label = `${labelName} (${hpValue}/${hpMax})`;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, alpha));
    context.fillStyle = UI_COLOR.hpBarBg;
    context.lineWidth = 2.5;
    context.strokeStyle = UI_COLOR.hpBarBorder;
    roundRect(context, barX, barY, width, height, 6, true, true);
    const fillWidth = Math.max(0, Math.floor((width - 4) * ratio));
    if (fillWidth > 0) {
      context.fillStyle = UI_COLOR.healthFill;
      context.fillRect(barX + 2, barY + 2, fillWidth, height - 4);
    }
    const hpFlash = this.hpDamageFlash;
    if (hpFlash?.timer > 0 && hpFlash.duration > 0) {
      const startRatio = Math.max(0, Math.min(1, hpFlash.startRatio || 0));
      const endRatio = Math.max(0, Math.min(1, hpFlash.endRatio || 0));
      const delta = Math.max(0, startRatio - endRatio);
      if (delta > 0) {
        const progress = 1 - hpFlash.timer / hpFlash.duration;
        const pulse = Math.abs(Math.sin(progress * Math.PI * (hpFlash.flashes || 3)));
        const alpha = 0.2 + 0.8 * pulse;
        const segmentX = barX + 2 + Math.floor((width - 4) * endRatio);
        const segmentW = Math.max(1, Math.floor((width - 4) * delta));
        context.fillStyle = `rgba(255, 246, 170, ${alpha.toFixed(3)})`;
        context.fillRect(segmentX, barY + 2, segmentW, height - 4);
      }
    }
    context.font = `${hpLabelType.weight ?? 400} ${hpLabelType.size ?? 12}px ${PIXEL_UI_FONT_FAMILY}`;
    context.fillStyle = UI_COLOR.softWhite;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, barX + width / 2, barY + height / 2 + 1);
    context.restore();
  }
}

function spawnProjectile(type, x, y, dx, dy, overrides = {}) {
  if (!assets) return null;
  const baseConfig = PROJECTILE_CONFIG[type];
  if (!baseConfig) return null;

  const clip = assets.projectiles[type];
  if (!clip) return null;
  const config = { ...baseConfig, ...overrides };
  const bossStageActive =
    levelManager?.getStatus &&
    ["bossIntro", "bossActive"].includes(levelManager.getStatus().stage);
  const bossRangeMultiplier =
    bossStageActive && config.friendly && config.source?.isPlayer ? 1.5 : 1;
  const priority = overrides.priority ?? baseConfig.priority ?? 0;
  config.priority = priority;
  const isDivineShot = overrides.isDivineShot ?? baseConfig.isDivineShot ?? false;
  config.isDivineShot = isDivineShot;
  if (overrides.damage === undefined && baseConfig && baseConfig.damage !== undefined) {
    config.damage = baseConfig.damage;
  }
  if (overrides.scale === undefined && baseConfig && baseConfig.scale !== undefined) {
    config.scale = baseConfig.scale;
  }
  config.friendly = overrides.friendly ?? true;
  config.source = overrides.source || null;
  if (isDevMeleeArenaActive() && config.friendly && type !== "divine_shot" && type !== "fire" && type !== "wisdom_missle" && type !== "faith_cannon") {
    return null;
  }
  if (overrides.scriptureFeedback !== undefined) {
    config.scriptureFeedback = Boolean(overrides.scriptureFeedback);
  } else {
    config.scriptureFeedback = Boolean(
      type === "fire" &&
      config.friendly === true &&
      config.source?.isPlayer &&
      player?.weaponMode === "fire",
    );
  }
  if (
    config.friendly &&
    config.source &&
    (config.source.isPlayer || config.source.isCozyNpc)
  ) {
    config.source.projectileGlowTimer = Math.max(config.source.projectileGlowTimer || 0, 0.22);
  }
  if (config.friendly && config.source?.isPlayer) {
    if (type === "faith_cannon") {
      config.hitShakeMultiplier = Number.isFinite(player?.faithHitShakeMultiplier) ? player.faithHitShakeMultiplier : 1;
    } else if (type === "wisdom_missle") {
      config.hitShakeMultiplier = Number.isFinite(player?.wisdomHitShakeMultiplier) ? player.wisdomHitShakeMultiplier : 1;
    } else if (type === "fire") {
      config.hitShakeMultiplier = Number.isFinite(player?.scriptureHitShakeMultiplier) ? player.scriptureHitShakeMultiplier : 1;
    }
  }
  if (bossRangeMultiplier > 1) {
    if (Number.isFinite(config.life)) {
      config.life *= bossRangeMultiplier;
    } else if (Number.isFinite(config.speed) && config.speed > 0) {
      const direction = normalizeVector(dx, dy);
      const travel = distanceToEdge(x, y, direction.x, direction.y);
      if (travel > 0) {
        config.life = (travel / config.speed) * bossRangeMultiplier;
      }
    }
  }
  const frames = projectileFrames[type] || clip.frames;
  // If caller explicitly provided frames override, use those. Otherwise use
  // pre-extracted frames from projectileFrames or clip.frames.
  if (Array.isArray(overrides.frames) && overrides.frames.length) {
    config.frames = overrides.frames;
    config.frameDuration = config.frameDuration ?? PROJECTILE_FRAME_DURATIONS[type] ?? 0.05;
    config.flipHorizontal = overrides.flipHorizontal ?? dx < 0;
    if (config.loopFrames === undefined) config.loopFrames = Boolean(overrides.loopFrames) || false;
  } else if (frames && frames.length) {
    config.frames = frames;
    config.frameDuration = config.frameDuration ?? PROJECTILE_FRAME_DURATIONS[type] ?? 0.05;
    config.flipHorizontal = overrides.flipHorizontal ?? dx < 0;
    if (config.loopFrames === undefined) config.loopFrames = true;
  } else {
    config.flipHorizontal = overrides.flipHorizontal ?? dx < 0;
  }
  const isBossSource =
    typeof BossEncounter !== "undefined" && config.source instanceof BossEncounter;
  if (isBossSource && config.friendly === false) {
    const direction = normalizeVector(dx, dy);
    const travel = distanceToEdge(x, y, direction.x, direction.y);
    const effectiveSpeed = Number.isFinite(config.speed) && config.speed > 0 ? config.speed : 1;
    const desiredLife = travel > 0 ? travel / effectiveSpeed : 0;
    const currentLife = Number.isFinite(config.life) ? config.life : 0;
    config.life = Math.max(currentLife, desiredLife, 1);
  }
  if (
    isBossSource &&
    (!Array.isArray(overrides.frames) || overrides.frames.length === 0)
  ) {
    const bossFrames = projectileFrames.fire;
    if (bossFrames && bossFrames.length) {
      config.frames = bossFrames;
      config.frameDuration =
        config.frameDuration ?? PROJECTILE_FRAME_DURATIONS.fire ?? 0.05;
      config.flipHorizontal = overrides.flipHorizontal ?? dx < 0;
      config.loopFrames = true;
    }
  }
  if (isBossSource && config.friendly === false && !config.onExpire) {
    config.onExpire = (proj) => {
      const radius = proj?.radius || proj?.config?.radius || 40;
      spawnBossProjectilePuffEffect(proj?.x ?? x, proj?.y ?? y, { radius: radius * 2 });
    };
  }
  const projectile = new Projectile(type, config, clip, x, y, dx, dy);
  projectiles.push(projectile);
  // Keep the hit chain alive during slow-projectile travel time so the chain
  // doesn't expire mid-flight between wisdom/scripture shots.
  if (config.friendly && config.source?.isPlayer && (type === "wisdom_missle" || type === "fire")) {
    const travelMs = Number.isFinite(config.life) ? config.life * 1000 : 1500;
    const now = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now() : Date.now();
    if (chainTracker.state) {
      chainTracker.state.expiresAt = Math.max(chainTracker.state.expiresAt, now + travelMs + HIT_CHAIN_WINDOW_MS);
    }
  }
  return projectile;
}

function projectilesIntersect(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radiusA = a.radius || 16;
  const radiusB = b.radius || 16;
  return Math.hypot(dx, dy) <= radiusA + radiusB;
}

function isBossProjectile(projectile) {
  return Boolean(projectile && projectile.source instanceof BossEncounter);
}

function randomChoice(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getEnemySpawnPoints() {
  const offset = ENEMY_SPAWN_MARGIN;
  const width = canvas.width;
  const height = canvas.height;
  const centerX = typeof player?.x === "number" ? player.x : width / 2;
  const bufferX = Math.max(width * 1.8, 1200);
  const bufferY = Math.max(height * 1.4, 900);
  return [
    {
      x: centerX - bufferX - offset,
      y: HUD_HEIGHT - bufferY - offset,
      anchors: ["left", "top"],
      label: "1",
    },
    {
      x: centerX + bufferX + offset,
      y: HUD_HEIGHT - bufferY - offset,
      anchors: ["right", "top"],
      label: "2",
    },
    {
      x: centerX - bufferX - offset,
      y: height + bufferY + offset,
      anchors: ["left", "bottom"],
      label: "3",
    },
    {
      x: centerX + bufferX + offset,
      y: height + bufferY + offset,
      anchors: ["right", "bottom"],
      label: "4",
    },
  ];
}

function randomSpawnPosition() {
  const width = canvas.width;
  const height = canvas.height;
  // Spawn bounds are world-anchored to the arena/floor, not camera-anchored.
  const viewMinX = 0;
  const viewMaxX = width;
  const horizontalMargin = Math.max(320, Math.floor(width * 0.24));
  // Bottom spawns should appear sooner so they are visible before NPCs clear them.
  const verticalMargin = Math.max(28, Math.floor(height * 0.05));
  const bottomCutoff = Math.max(
    HUD_HEIGHT + 16,
    HUD_HEIGHT + (height - HUD_HEIGHT) * (1 / 3) - 150,
  );
  const sideMaxY = height - Math.max(32, Math.floor(height * 0.1));
  const pickBottomSideX = () => {
    const minX = viewMinX + horizontalMargin;
    const maxX = viewMaxX - horizontalMargin;
    const span = Math.max(0, maxX - minX);
    const gapWidth = Math.min(span * 0.62, Math.max(320, Math.floor(width * 0.32)));
    const centerX = (minX + maxX) * 0.5;
    const leftMin = minX;
    const leftMax = Math.max(leftMin, centerX - gapWidth * 0.5);
    const rightMin = Math.min(maxX, centerX + gapWidth * 0.5);
    const rightMax = maxX;
    const canLeft = leftMax > leftMin;
    const canRight = rightMax > rightMin;
    if (!canLeft && !canRight) return (minX + maxX) * 0.5;
    const useLeft = canLeft && (!canRight || Math.random() < 0.5);
    return useLeft
      ? pickLane(leftMin, leftMax, 3, 42)
      : pickLane(rightMin, rightMax, 3, 42);
  };
  const pickLane = (min, max, laneCount = 4, jitter = 0) => {
    if (max <= min) return min;
    const count = Math.max(1, Math.round(laneCount));
    if (count === 1) return (min + max) * 0.5;
    const step = (max - min) / (count - 1);
    const laneIndex = Math.floor(Math.random() * count);
    const center = min + step * laneIndex;
    return Math.max(min, Math.min(max, center + randomInRange(-jitter, jitter)));
  };
  const edge = Math.floor(Math.random() * 3);
  if (edge === 0) {
    // left wall
    return {
      x: viewMinX - horizontalMargin,
      y: pickLane(bottomCutoff, sideMaxY, 4, 42),
      __spawnEdge: "left",
    };
  }
  if (edge === 1) {
    // right wall
    return {
      x: viewMaxX + horizontalMargin,
      y: pickLane(bottomCutoff, sideMaxY, 4, 42),
      __spawnEdge: "right",
    };
  }
  return {
    x: pickBottomSideX(),
    y: height + verticalMargin,
    __spawnEdge: "bottom",
  };
}

// (moved to npcs.js)

const _devActivationSequence = { count: 0, lastTime: 0 };
function checkDevActivationSequence() {
  if (keysJustPressed.has("`")) {
    const now = Date.now();
    if (now - _devActivationSequence.lastTime > 2000) _devActivationSequence.count = 0;
    _devActivationSequence.count += 1;
    _devActivationSequence.lastTime = now;
    keysJustPressed.delete("`");
    if (_devActivationSequence.count >= 3) {
      _devActivationSequence.count = 0;
      devSessionActive = !devSessionActive;
      if (typeof window !== "undefined") window.devSessionActive = devSessionActive;
      setDevStatus(devSessionActive ? "Dev session ON" : "Dev session OFF", 2.5);
    }
  }
}
function handleDeveloperHotkeys() {
  if (!devSessionActive) return;
  if (typeof window !== "undefined" && window.DialogOverlay?.isVisible?.()) {
    return;
  }
  if (typeof window !== "undefined" && window.PaperdollSandbox?.isOpen?.()) {
    keysJustPressed.clear();
    return;
  }
  if (typeof window !== "undefined" && window.__BC_ENEMY_EDITOR_ACTIVE) {
    keysJustPressed.clear();
    return;
  }
  if (!keysJustPressed.size) return;
  const modifiers = typeof Input !== "undefined" ? Input.modifiers : null;
  const pressed = typeof Input !== "undefined" ? Input.keysPressed : null;
  const shiftHeld = Boolean(modifiers?.shift || pressed?.has?.("Shift"));
  if (!shiftHeld) return;
  if (keysJustPressed.has("1")) {
    devTools.godMode = !devTools.godMode;
    setDevStatus(devTools.godMode ? "God mode enabled" : "God mode disabled", 2.5);
  }
  if (keysJustPressed.has("2")) {
    let bossDamaged = false;
    if (
      activeBoss &&
      !activeBoss.dead &&
      activeBoss.state !== "death" &&
      typeof activeBoss.takeDamage === "function"
    ) {
      const healthBefore = Number.isFinite(activeBoss.health) ? activeBoss.health : null;
      activeBoss.takeDamage(1000);
      if (healthBefore !== null && Number.isFinite(activeBoss.health)) {
        bossDamaged = activeBoss.health < healthBefore;
      } else {
        bossDamaged = true;
      }
    }
    devClearOpponents({ includeBoss: false });
    setDevStatus(
      bossDamaged
        ? "On-screen enemies eliminated, boss -1000 HP"
        : "On-screen enemies eliminated",
      2.0,
    );
  }
  if (keysJustPressed.has("3")) {
    const result = levelManager?.devAdvanceToNextWaveWithBreak?.();
    if (result?.success) {
      if (result.mode === "started_first_wave") {
        setDevStatus("Wave 1 started", 2.0);
      } else {
        setDevStatus("Advanced to next wave", 2.0);
      }
    } else if (result?.reason === "last_wave") {
      setDevStatus("Already on final wave", 2.0);
    } else if (result?.reason === "boss") {
      setDevStatus("Cannot advance wave during boss phase", 2.0);
    } else {
      setDevStatus("Wave advance unavailable", 2.0);
    }
  }
  if (keysJustPressed.has("4")) {
    if (levelManager?.devSkipWave?.()) {
      setDevStatus("Battle skipped", 2.0);
    }
  }
  if (keysJustPressed.has("5")) {
    const result = levelManager?.devSkipToBoss?.({ showExterior: false });
    if (result?.success) {
      const currentLevel = levelManager?.getLevelNumber ? levelManager.getLevelNumber() : 1;
      setDevStatus(`Battle ${currentLevel} boss engaged`, 2.3);
    } else {
      setDevStatus("Battle boss skip failed", 2.0);
    }
  }
  if (keysJustPressed.has("6")) {
    if (!levelManager?.isActive?.()) {
      setDevStatus("Act 3 Battle 3 boss skip failed (level inactive)", 2.0);
    } else {
      if (levelManager?.devSkipToDistrictFinalBoss?.({ showExterior: false })?.success) {
        setDevStatus("Act 3 Battle 3 boss engaged", 2.4);
      } else {
        setDevStatus("Act 3 Battle 3 boss skip failed", 2.0);
      }
    }
  }
  if (keysJustPressed.has("t")) {
    if (typeof window !== "undefined" && typeof window.MapScreen?.devAwardNextDistrict === "function") {
      void (async () => {
        const result = await window.MapScreen.devAwardNextDistrict({
          congregationCount: 100,
          campaign: "p1",
          churchPowerupLevels: Object.fromEntries(churchPowerupLevels),
        });
        if (result?.awardedDistrictName) {
          setDevStatus(`Awarded town: ${result.awardedDistrictName}`, 2.3);
        } else {
          setDevStatus("No eligible town to award", 2.0);
        }
      })();
    }
  }
  if (keysJustPressed.has("y")) {
    speedrunTimer.visible = !speedrunTimer.visible;
    setDevStatus(speedrunTimer.visible ? "Timer shown" : "Timer hidden", 2.0);
  }
  if (keysJustPressed.has("c")) {
    adjustCongregationSize(5);
    setDevStatus("Congregation +5", 2.0);
  }
  if (keysJustPressed.has("9")) {
    if (levelManager?.devSkipToGraceRush?.()) {
      setDevStatus("Grace rush engaged", 2.0);
    }
  }
  if (keysJustPressed.has("o")) {
    if (typeof Input?.setVirtualControlsVisible === "function") {
      const nextEnabled = !Input.virtualInput?.enabled;
      Input.setVirtualControlsVisible(nextEnabled);
      setDevStatus(`Touch controls ${nextEnabled ? "ON" : "OFF"}`, 1.4);
    }
  }
  if (keysJustPressed.has("n")) {
    window.NpcPaperdollSandbox?.toggle?.();
  }
  if (keysJustPressed.has("p")) {
    if (devSwapPowerups()) {
      setDevStatus("Powerups swapped", 1.6);
    }
  }
  if (keysJustPressed.has("b")) {
    if (player && typeof player.addPrayerCharge === "function") {
      const required = Math.max(1, player.prayerChargeRequired || PRAYER_BOMB_CHARGE_REQUIRED || 60);
      const ratio = Math.max(0, Math.min(1, (player.prayerCharge || 0) / required));
      let targetRatio = PRAYER_BOMB_LEVEL1_THRESHOLD || 0.5;
      if (ratio >= (PRAYER_BOMB_LEVEL1_THRESHOLD || 0.5) && ratio < (PRAYER_BOMB_LEVEL2_THRESHOLD || 0.8)) {
        targetRatio = PRAYER_BOMB_LEVEL2_THRESHOLD || 0.8;
      } else if (ratio >= (PRAYER_BOMB_LEVEL2_THRESHOLD || 0.8)) {
        targetRatio = PRAYER_BOMB_LEVEL3_THRESHOLD || 1.0;
      }
      player.prayerCharge = Math.min(required, Math.max(0, Math.round(required * targetRatio)));
      const levelLabel = targetRatio >= (PRAYER_BOMB_LEVEL3_THRESHOLD || 1.0)
        ? "Prayer bomb maxed"
        : targetRatio >= (PRAYER_BOMB_LEVEL2_THRESHOLD || 0.8)
        ? "Prayer bomb level 2"
        : "Prayer bomb level 1";
      setDevStatus(levelLabel, 2.0);
    }
  }
  if (keysJustPressed.has("v")) {
    if (visitorSession.active) {
      completeVisitorSession("devCancel");
      setDevStatus("Visitor session cancelled", 1.6);
    } else if (beginVisitorSession({ autoTriggered: false })) {
      setDevStatus("Visitor session started (dev)", 1.8);
    }
  }
  if (keysJustPressed.has("s")) {
    // show overrides hotkey pressed (silenced)
  }
}

function isAnyDialogActive() {
  return Boolean(
    window.DialogOverlay?.isVisible?.() ||
    window.UpgradeScreen?.isVisible?.() ||
    window.PaperdollSandbox?.isOpen?.()
  );
}

function updateDebugSystems(dt) {
  if (DEBUG && debugOverlayVisible) {
    debugOverlayUpdateAccumulator += dt;
    if (debugOverlayUpdateAccumulator >= DEBUG_OVERLAY_UPDATE_INTERVAL) {
      debugOverlayUpdateAccumulator = 0;
      updateDebugOverlayData();
    }
  }
}

function updateDistrictIntroTransition(dt) {
  if (!districtIntroTransitionActive) return false;

  districtIntroTransitionTimer = Math.min(
    DISTRICT_INTRO_ZOOM_DURATION + DISTRICT_INTRO_FADE_DURATION,
    districtIntroTransitionTimer + dt,
  );
  if (wasActionJustPressed("pause") || wasActionJustPressed("restart")) {
    districtIntroTransitionTimer = DISTRICT_INTRO_ZOOM_DURATION + DISTRICT_INTRO_FADE_DURATION;
  }
  if (districtIntroTransitionTimer >= DISTRICT_INTRO_ZOOM_DURATION + DISTRICT_INTRO_FADE_DURATION) {
    districtIntroTransitionActive = false;
    // Check if we need to trigger boss intro after exterior shot (dev hotkey 5)
    if (pendingBossIntroAfterExterior) {
      pendingBossIntroAfterExterior = false;
      if (levelManager?.triggerBossIntro) {
        levelManager.triggerBossIntro();
      }
    }
  }
  try {
    const status = levelManager?.getStatus ? levelManager.getStatus() : null;
    if (status?.stage === "levelIntro") {
      if (!powerUpsClearedForCongregation) {
        clearAllPowerUps();
        powerUpsClearedForCongregation = true;
      }
      updateCongregationMembers(dt);
      resolveCongregationMemberCollisions();
      updatePlayerDuringCongregation(dt);
      resolveCongregationCollisions();
    }
  } catch (e) {}
  keysJustPressed.delete(" ");
  keysJustPressed.delete("pause");
  keysJustPressed.delete("restart");
  return true;
}

function updateDeathFadeEffects(dt) {
  if (player) {
    const target = player.state === "death" ? PLAYER_DEATH_FADE_TARGET : 0;
    const step = Math.min(1, dt * PLAYER_DEATH_FADE_SPEED);
    playerDeathFadeAlpha += (target - playerDeathFadeAlpha) * step;
    if (Math.abs(playerDeathFadeAlpha - target) < 0.01) {
      playerDeathFadeAlpha = target;
    }
  }
}

function updateDeathBellAudio(dt) {
  if (playerDeathBellFadeTimer > 0 && playerDeathBellAudio) {
    playerDeathBellFadeTimer = Math.max(0, playerDeathBellFadeTimer - dt);
    if (playerDeathBellFadeTimer <= PLAYER_DEATH_BELL_FADE_DURATION) {
      const t = playerDeathBellFadeTimer / Math.max(0.001, PLAYER_DEATH_BELL_FADE_DURATION);
      playerDeathBellAudio.volume = Math.max(0, Math.min(1, playerDeathBellFadeVolume * t));
      if (playerDeathBellFadeTimer <= 0.001) {
        try {
          playerDeathBellAudio.pause();
          playerDeathBellAudio.currentTime = 0;
        } catch (err) {}
        if (playerDeathBellResume) {
          if (playerDeathBellResume.intro && musicState.intro) {
            playMusic(musicState.intro, { volume: MUSIC_VOLUME_INTRO, loop: false });
          }
          if (playerDeathBellResume.battle) {
            const activeBattleAudio = getCurrentBattleAudio();
            if (activeBattleAudio) {
              playMusic(activeBattleAudio, { volume: MUSIC_VOLUME_BATTLE, loop: true });
            }
          }
          if (playerDeathBellResume.recap && musicState.recap) {
            playMusic(musicState.recap, { volume: MUSIC_VOLUME_BATTLE, loop: false });
          }
          playerDeathBellResume = null;
        }
        playerDeathBellActive = false;
      }
    }
  }
}

function showBattlefieldIntro(battlefieldNumber) {
  battlefieldIntroActive = true;
  battlefieldIntroNumber = battlefieldNumber;
  battlefieldIntroImage = battlefieldNumber === 2 ? assets?.backgrounds?.mission2 : battlefieldNumber === 3 ? assets?.backgrounds?.mission3 : assets?.backgrounds?.mission1;
  keysJustPressed.delete(" ");
}

function startActBreakTeaser(battlefieldNumber) {
  const targetBattlefield = Math.max(2, Math.floor(battlefieldNumber));
  const mapData = typeof window !== "undefined" ? window.BattlechurchMapData : null;
  const districtList = mapData?.districts || [];
  const districtIndex = districtList.findIndex((t) => t?.id === activeDistrictId);
  const levelNumber = districtIndex >= 0 ? districtIndex + 1 : 1;
  if (Array.isArray(levelAnnouncements)) levelAnnouncements.length = 0;
  if (levelManager && typeof levelManager.beginBattleFromDistrictIntro === "function") {
    levelManager.beginBattleFromDistrictIntro(levelNumber, targetBattlefield);
  }
}

function handleChapterBreak() {
  if (!battlefieldIntroActive) return false;

  const buttons =
    typeof window !== "undefined" && window.__announcementButtons?.key === "chapterBreak"
      ? window.__announcementButtons.buttons
      : null;
  const handled = handleAnnouncementButtons({
    key: "chapterBreak",
    buttons,
    allowSpace: true,
    onActivate: () => {
      battlefieldIntroActive = false;
      battlefieldIntroImage = null;
      if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
        window.playMenuAdvanceSfx(0.55);
      }
      startActBreakTeaser(battlefieldIntroNumber);
    },
  });
  if (handled) return false;

  // Check for space press to dismiss immediately
  if (wasActionJustPressed("pause") || wasActionJustPressed("restart")) {
    battlefieldIntroActive = false;
    battlefieldIntroImage = null;
    if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
      window.playMenuAdvanceSfx(0.55);
    }
    startActBreakTeaser(battlefieldIntroNumber);
    keysJustPressed.delete(" ");
    return false;
  }

  // Continue blocking game loop while chapter break is active
  return true;
}

function checkDialogOverlays() {
  if (window.PaperdollSandbox?.consumeAction?.()) {
    keysJustPressed.clear();
    return true;
  }
  if (window.DialogOverlay?.consumeAction?.() || window.UpgradeScreen?.consumeAction?.()) {
    keysJustPressed.delete(" ");
    keysJustPressed.delete("pause");
    keysJustPressed.delete("restart");
    keysJustPressed.delete("ArrowDown");
    return true;
  }
  if (isAnyDialogActive()) {
    keysJustPressed.delete(" ");
    keysJustPressed.delete("ArrowDown");
    return true;
  }
  if (pendingUpgradeAfterSummary && window.UpgradeScreen && !window.UpgradeScreen.isVisible() && !PastorUpgradeScreen.isVisible() && !DenominationScreen.isVisible()) {
    clearAllPowerUps();
    Effects.clear();

    // Check if this is final town level - show pastor upgrade first, then church upgrade, then pastor post-recap
    if (pendingPastorPostRecapAfterUpgrade) {
      const targetLevel = lastCompletedLevel || levelManager?.getLevelNumber?.() || 1;
      const showChurchUpgrade = () => {
        window.UpgradeScreen.show(() => {
          stopRecapMusic();
          pendingPostUpgradeTransition = true;
          runPostUpgradeSaveThen(() => {
            pendingPostUpgradeTransition = false;
            queuePastorBossPostRecapAnnouncement(targetLevel, false);
          });
        });
      };
      const showDenomThenChurch = () => {
        if (DenominationScreen.shouldShow()) {
          DenominationScreen.show(showChurchUpgrade);
        } else {
          showChurchUpgrade();
        }
      };
      PastorUpgradeScreen.show(showDenomThenChurch);
      pendingPastorPostRecapAfterUpgrade = false;
    // Check if we need to show chapter break after upgrade
    // lastCompletedLevel was set when the battle summary showed
    // Show chapter break after level 1 (month 4) and level 2 (month 8)
    // Level 1 complete → Mission 2, Level 2 complete → Mission 3
    } else if (lastCompletedLevel === 1 || lastCompletedLevel === 2) {
      const actNumber = lastCompletedLevel + 1; // Level 1 done → Mission 2, Level 2 done → Mission 3
      window.UpgradeScreen.show(() => {
        stopRecapMusic();
        pendingPostUpgradeTransition = true;
        runPostUpgradeSaveThen(() => {
          pendingPostUpgradeTransition = false;
          if (lastCompletedLevel === 2 && !districtVisitorMinigamePlayed) {
            districtVisitorMinigamePlayed = true;
            if (levelManager?.triggerVisitorMinigame) {
              const started = levelManager.triggerVisitorMinigame(() => {
                showBattlefieldIntro(actNumber);
              });
              if (started) return;
            }
          }
          showBattlefieldIntro(actNumber);
        });
      });
    } else {
      window.UpgradeScreen.show(() => {
        stopRecapMusic();
        runPostUpgradeSaveThen(() => {
          if (typeof levelManager?.requestUpgradeToTeaserTransition === "function") {
            levelManager.requestUpgradeToTeaserTransition();
          }
          queueExteriorShotAnnouncement();
        });
      });
    }

    pendingUpgradeAfterSummary = false;
    lastSummaryWasLevelEnd = false;
    keysJustPressed.delete(" ");
    return true;
  }
  return false;
}

function updatePostDeathSequence(dt) {
  if (postDeathAnimLeadActive) {
    postDeathAnimLeadTimer = Math.max(0, postDeathAnimLeadTimer - dt);
    if (postDeathAnimLeadTimer <= 0) {
      postDeathAnimLeadActive = false;
      postDeathSequenceActive = true;
      postDeathTimer = POST_DEATH_HANG;
      miniImpWaveDispatched = false;
      arenaFadeTimer = -1;
      arenaFadeAlpha = 0;
      if (player) {
        player.lockedPosition = { x: player.x, y: player.y };
      }
      console.log("Death animation lead complete; starting post-death transition");
    }
  }
  if (postDeathSequenceActive) {
    postDeathTimer = Math.max(0, postDeathTimer - dt);
    if (postDeathTimer <= 0 && !miniImpWaveDispatched) {
      console.log("Death hang complete, spawning mini-imp swarms");
      triggerPostDeathMiniSwarm();
      miniImpWaveDispatched = true;
      arenaFadeTimer = ARENA_FADE_DURATION;
      arenaFadeAlpha = 0;
    }
    if (miniImpWaveDispatched && arenaFadeTimer >= 0) {
      arenaFadeTimer = Math.max(0, arenaFadeTimer - dt);
      const progress = Math.min(1, Math.max(0, 1 - arenaFadeTimer / ARENA_FADE_DURATION));
      arenaFadeAlpha = progress;
      if (arenaFadeTimer <= 0) {
        arenaFadeAlpha = 1;
        postDeathSequenceActive = false;
        gameOver = true;
        window.gameOverReady = true;
        damageHitFlash = 0;
        console.log("Arena fade complete, gameOver ready");
      }
    }
  } else {
    arenaFadeAlpha = 0;
  }
}

function updateFadeEffects(dt) {
  if (battlefieldIntroFadeTimer > 0) {
    battlefieldIntroFadeTimer = Math.max(0, battlefieldIntroFadeTimer - dt);
    const elapsed = battlefieldIntroFadeDuration - battlefieldIntroFadeTimer;
    const fadeIn = Math.min(battlefieldIntroFadeDuration, MISSION_INTRO_FADE_IN);
    const fadeOut = Math.min(battlefieldIntroFadeDuration, MISSION_INTRO_FADE_OUT);
    if (elapsed < fadeIn) {
      battlefieldIntroFadeAlpha = fadeIn > 0 ? Math.min(1, elapsed / fadeIn) : 1;
    } else if (battlefieldIntroFadeTimer <= fadeOut) {
      battlefieldIntroFadeAlpha = fadeOut > 0 ? Math.min(1, battlefieldIntroFadeTimer / fadeOut) : 0;
    } else {
      battlefieldIntroFadeAlpha = 1;
    }
  } else {
    battlefieldIntroFadeAlpha = 0;
  }

  if (graceRushFadeTimer > 0) {
    graceRushFadeTimer = Math.max(0, graceRushFadeTimer - dt);
    const progress = Math.min(1, Math.max(0, 1 - graceRushFadeTimer / graceRushFadeDuration));
    graceRushFadeAlpha = Math.max(0, Math.min(1, progress));
    if (graceRushFadeTimer <= 0) {
      graceRushFadeHold = true;
      graceRushFadeAlpha = 1;
      graceRushBlackout = true;
    }
  } else if (graceRushFadeHold) {
    graceRushFadeAlpha = 1;
  } else {
    graceRushFadeAlpha = 0;
  }

  const hardBlackoutActive = graceRushHardBlackoutTimer > 0 || graceRushBlackout;
  if (hardBlackoutActive) {
    if (graceRushHardBlackoutTimer > 0) {
      graceRushHardBlackoutTimer = Math.max(0, graceRushHardBlackoutTimer - dt);
    }
    try {
      Effects.clear();
      floatingTexts.forEach((ft) => {
        if (!ft.critical) ft.life = 0;
      });
    } catch (e) {}
  }

  if (pastorDashBuffTimer > 0) {
    pastorDashBuffTimer = Math.max(0, pastorDashBuffTimer - dt);
    if (typeof window !== "undefined") window.pastorDashBuffTimer = pastorDashBuffTimer;
  }

  if (bossBonusTransitionFadeTimer > 0) {
    bossBonusTransitionFadeTimer = Math.max(0, bossBonusTransitionFadeTimer - dt);
    const progress = Math.min(
      1,
      Math.max(
        0,
        1 - bossBonusTransitionFadeTimer / Math.max(0.001, bossBonusTransitionFadeDuration),
      ),
    );
    bossBonusTransitionFadeAlpha = progress;
  } else {
    bossBonusTransitionFadeAlpha = 0;
  }

  if (recapIntroFadeTimer > 0) {
    recapIntroFadeTimer = Math.max(0, recapIntroFadeTimer - dt);
    recapIntroFadeAlpha = Math.min(
      1,
      Math.max(0, recapIntroFadeTimer / Math.max(0.001, recapIntroFadeDuration)),
    );
  } else {
    recapIntroFadeAlpha = 0;
  }
}

function updateSpeedrunTimer(levelStatus) {
  if (!speedrunTimer.running) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const currentSection = getSpeedrunSectionName(levelStatus);
  if (speedrunTimer.startTime == null) {
    speedrunTimer.startTime = now;
    speedrunTimer.sectionStart = now;
    speedrunTimer.currentSection = currentSection;
    speedrunTimer.splits = [];
  } else if (speedrunTimer.currentSection !== currentSection && currentSection) {
    const duration = Math.max(0, now - (speedrunTimer.sectionStart || now));
    speedrunTimer.splits.push({ name: speedrunTimer.currentSection, duration });
    speedrunTimer.sectionStart = now;
    speedrunTimer.currentSection = currentSection;
  }
  if (speedrunTimer.startTime != null) {
    speedrunTimer.totalElapsed = Math.max(0, now - speedrunTimer.startTime);
    speedrunTimer.sectionElapsed = Math.max(0, now - (speedrunTimer.sectionStart || now));
  }
}

function updateMusicState(levelStatus) {
  const stage = levelStatus?.stage;
  const desiredBattleTrack = getDesiredBattleTrack(levelStatus);
  if (playerDeathBellActive) {
    pauseAllMusic();
    return;
  }
  if (visitorSession?.active) {
    if (musicState.battleStarted && !musicState.battleStopped) {
      fadeOutBattleMusic();
    }
    if (musicState.introStarted && !musicState.introStopped) {
      stopIntroMusic();
    }
    if (musicState.recapStarted && !musicState.recapStopped) {
      stopRecapMusic();
    }
    startVisitorMusic();
    return;
  }
  const battleShouldPlay =
    stage === "npcArrival" ||
    stage === "waveIntro" ||
    stage === "waveActive" ||
    stage === "allKillBreak" ||
    stage === "waveCleared" ||
    stage === "bossIntro" ||
    stage === "bossActive" ||
    musicState.battlePrimed;
  if (battleShouldPlay && formationState?.current) {
    if (stage && stage !== "briefing") {
      musicState.battlePrimed = false;
    }
    if (musicState.recapStarted && !musicState.recapStopped) stopRecapMusic();
    if (musicState.visitorStarted && !musicState.visitorStopped) stopVisitorMusic();
    if (musicState.introStarted && !musicState.introStopped) stopIntroMusic();
    if (musicState.unlocked) {
      startBattleMusic(desiredBattleTrack);
    }
  } else if (musicState.battleStarted && !musicState.battleStopped) {
    fadeOutBattleMusic();
  }
  if (stage === "levelIntro" || stage === "briefing" || stage === "npcArrival") {
    // Keep exterior/map-chain music alive through town intro + congregation + briefing.
    // It will be faded out naturally when battle music starts.
    if (musicState.recapStarted && !musicState.recapStopped) stopRecapMusic();
    if (musicState.visitorStarted && !musicState.visitorStopped) stopVisitorMusic();
  }
}

function updateGraceRushFadeRelease(dt) {
  if (!graceRushFadeHold) return;
  const announcementConfirmActive = Boolean(
    Array.isArray(levelAnnouncements) &&
      levelAnnouncements.length &&
      levelAnnouncements[0]?.requiresConfirm,
  );
  if (window.DialogOverlay?.isVisible?.() || announcementConfirmActive) {
    if (graceRushFadeReleaseTimer <= 0) {
      graceRushFadeReleaseTimer = 0.2;
    }
    graceRushFadeReleaseTimer = Math.max(0, graceRushFadeReleaseTimer - dt);
    if (graceRushFadeReleaseTimer <= 0) {
      graceRushFadeHold = false;
      graceRushFadeDuration = 0;
      graceRushFadeAlpha = 0;
    }
  }
}

function updateLevelManagement() {
  const currentLevelNumber = levelManager?.getLevelNumber ? levelManager.getLevelNumber() : 1;
  if (lastLevelNumber === null) lastLevelNumber = currentLevelNumber;
  if (currentLevelNumber !== lastLevelNumber) {
    Spawner.resetLevelFlags(currentLevelNumber);
    lastLevelNumber = currentLevelNumber;
  }
}

function updatePlayerRespawn(dt) {
  if (!playerRespawnPending) return false;
  respawnTimer = Math.max(0, respawnTimer - dt);
  respawnIndicatorTimer -= dt;
  if (player && respawnIndicatorTimer <= 0) {
    addStatusText(player, "Exhausted", {
      color: UI_COLOR.crimson,
      bgColor: "rgba(60, 20, 20, 0.88)",
      life: Math.min(0.6, RESPAWN_STATUS_INTERVAL),
      offsetY: player.radius + 34,
    });
    respawnIndicatorTimer = RESPAWN_STATUS_INTERVAL;
  }
  if (respawnTimer <= 0) {
    const oldPlayer = player;
    const respawnX = canvas.width / 2;
    const respawnY = HUD_HEIGHT + 40;
    player = createPlayerInstance(respawnX, respawnY, assets.player);
    player.x = respawnX;
    const respawnTop = HUD_HEIGHT + Math.max(player.radius + 16, 28);
    player.y = Math.max(respawnTop, respawnY);
    player.shieldTimer = 0;
    player.invulnerableTimer = RESPAWN_SHIELD_DURATION;
    player.health = player.maxHealth;
    player.state = "idle";
    playerRespawnPending = false;
    respawnIndicatorTimer = 0;
    floatingTexts.forEach((ft) => {
      if (ft.entity === oldPlayer && !ft.critical) ft.life = 0;
    });
  }
  return true;
}

function applyDefaultHellfirePanelStyle(overlay, enabled, styleKey = "default") {
  if (!overlay) return;
  overlay.classList.remove("dialog-overlay--panel-default");
  const setOverlayCssVar = (key, value) => {
    if (value === null || value === undefined || value === "") {
      overlay.style.removeProperty(key);
      return;
    }
    overlay.style.setProperty(key, String(value));
  };
  if (!enabled) {
    setOverlayCssVar("--hellfire-default-panel-width-max", null);
    setOverlayCssVar("--hellfire-default-panel-width-ratio", null);
    setOverlayCssVar("--hellfire-default-title-transform", null);
    setOverlayCssVar("--hellfire-default-title-align", null);
    setOverlayCssVar("--hellfire-default-title-color", null);
    setOverlayCssVar("--hellfire-default-title-size", null);
    setOverlayCssVar("--hellfire-default-divider-inset-x", null);
    setOverlayCssVar("--hellfire-default-divider-margin-top", null);
    return;
  }
  overlay.classList.add("dialog-overlay--panel-default");
  const hellfirePanels = window.UIStyles?.panels?.hellfire || {};
  const defaultPanelStyle = hellfirePanels[styleKey] || hellfirePanels.default || {};
  const widthMax = Number(defaultPanelStyle.panelWidthMax);
  const widthRatio = Number(defaultPanelStyle.panelWidthRatio);
  setOverlayCssVar(
    "--hellfire-default-panel-width-max",
    Number.isFinite(widthMax) ? `${widthMax}px` : null,
  );
  setOverlayCssVar(
    "--hellfire-default-panel-width-ratio",
    Number.isFinite(widthRatio) ? `${Math.round(widthRatio * 100)}%` : null,
  );
  setOverlayCssVar(
    "--hellfire-default-title-transform",
    defaultPanelStyle.titleTextTransform || null,
  );
  setOverlayCssVar(
    "--hellfire-default-title-align",
    defaultPanelStyle.titleAlign || null,
  );
  setOverlayCssVar(
    "--hellfire-default-title-color",
    defaultPanelStyle.titleColor || null,
  );
  setOverlayCssVar(
    "--hellfire-default-title-size",
    Number.isFinite(defaultPanelStyle.titleFontSize) ? `${defaultPanelStyle.titleFontSize}px` : null,
  );
  setOverlayCssVar(
    "--hellfire-default-divider-inset-x",
    Number.isFinite(defaultPanelStyle.dividerInsetX) ? `${Math.max(0, defaultPanelStyle.dividerInsetX)}px` : null,
  );
  const dividerMarginTop = Number(defaultPanelStyle.dividerY) - 56;
  setOverlayCssVar(
    "--hellfire-default-divider-margin-top",
    Number.isFinite(dividerMarginTop) ? `${Math.max(0, dividerMarginTop)}px` : null,
  );
}

function showSettingsOverlay({ source = "title" } = {}) {
  if (!window.DialogOverlay) return;
  const bodyHtml = `
    <div class="settings-panel">
      <div class="settings-row">
        <span class="settings-row__icon">🎵</span>
        <div class="settings-row__text">
          <div class="settings-row__label">Music</div>
          <div class="settings-row__desc">Enable or disable background music</div>
        </div>
        <div class="settings-row__control">
          <label class="settings-toggle">
            <input type="checkbox" data-setting="musicEnabled">
            <span>On</span>
          </label>
        </div>
      </div>
      <div class="settings-row settings-row--slider">
        <span class="settings-row__icon">🎚️</span>
        <div class="settings-row__text">
          <label class="settings-row__label" for="settingsMusicVolume">Music Volume</label>
          <div class="settings-row__desc">Set soundtrack level</div>
          <div class="settings-slider">
            <input type="range" id="settingsMusicVolume" min="0" max="100" value="100" step="1" data-setting="musicVolume">
            <span class="settings-slider__value" data-setting-value="musicVolume">100%</span>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <span class="settings-row__icon">🔊</span>
        <div class="settings-row__text">
          <div class="settings-row__label">Sound Effects</div>
          <div class="settings-row__desc">Enable or disable SFX</div>
        </div>
        <div class="settings-row__control">
          <label class="settings-toggle">
            <input type="checkbox" data-setting="sfxEnabled">
            <span>On</span>
          </label>
        </div>
      </div>
      <div class="settings-row settings-row--slider">
        <span class="settings-row__icon">📢</span>
        <div class="settings-row__text">
          <label class="settings-row__label" for="settingsSfxVolume">SFX Volume</label>
          <div class="settings-row__desc">Set effects level</div>
          <div class="settings-slider">
            <input type="range" id="settingsSfxVolume" min="0" max="100" value="100" step="1" data-setting="sfxVolume">
            <span class="settings-slider__value" data-setting-value="sfxVolume">100%</span>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <span class="settings-row__icon">📘</span>
        <div class="settings-row__text">
          <div class="settings-row__label">About</div>
          <div class="settings-row__desc">View controls and gameplay guide</div>
        </div>
        <div class="settings-row__control">
          <button class="settings-btn--hellfire" id="settingsAboutBtn">About</button>
        </div>
      </div>
      ${devSessionActive ? `
      <div class="settings-row">
        <span class="settings-row__icon">🛠️</span>
        <div class="settings-row__text">
          <div class="settings-row__label">Developer</div>
          <div class="settings-row__desc">Open debug and development tools</div>
        </div>
        <div class="settings-row__control">
          <button class="settings-btn--hellfire" id="settingsDeveloperBtn">Developer</button>
        </div>
      </div>` : ""}
    </div>
  `;
  window.DialogOverlay.show({
    title: "Settings",
    bodyHtml,
    buttonText: "Back",
    variant: "settings",
    onRender: ({ bodyEl, overlay }) => {
      if (!bodyEl) return;
      const setSliderValue = (key, value) => {
        const valueEl = bodyEl.querySelector(`[data-setting-value="${key}"]`);
        if (valueEl) valueEl.textContent = `${Math.round(value * 100)}%`;
      };
      if (overlay) {
        applyDefaultHellfirePanelStyle(overlay, source === "title", "default");
        let footerHint = overlay.querySelector(".dialog-overlay__footer-hint");
        if (!footerHint) {
          footerHint = document.createElement("div");
          footerHint.className = "dialog-overlay__footer-hint";
          overlay.appendChild(footerHint);
        }
        const controlsHint =
          typeof window.Renderer?.getControlsHintText === "function"
            ? window.Renderer.getControlsHintText()
            : "Keyboard: Navigation/Movement: WASD | Action Buttons: Left, Down, Right | Select: Space | Back: Esc";
        footerHint.textContent = controlsHint;
      }
      const musicToggle = bodyEl.querySelector('[data-setting="musicEnabled"]');
      const musicSlider = bodyEl.querySelector('[data-setting="musicVolume"]');
      const sfxToggle = bodyEl.querySelector('[data-setting="sfxEnabled"]');
      const sfxSlider = bodyEl.querySelector('[data-setting="sfxVolume"]');
      if (musicToggle) musicToggle.checked = Boolean(audioSettings.musicEnabled);
      if (musicSlider) musicSlider.value = String(Math.round(audioSettings.musicVolume * 100));
      if (sfxToggle) sfxToggle.checked = Boolean(audioSettings.sfxEnabled);
      if (sfxSlider) sfxSlider.value = String(Math.round(audioSettings.sfxVolume * 100));
      setSliderValue("musicVolume", audioSettings.musicVolume);
      setSliderValue("sfxVolume", audioSettings.sfxVolume);
      const updateSetting = (key, value) => {
        audioSettings[key] = value;
        saveAudioSettings();
        applyAudioSettings();
      };

      if (musicToggle) {
        musicToggle.addEventListener("change", (event) => {
          updateSetting("musicEnabled", event.target.checked);
        });
      }
      if (musicSlider) {
        musicSlider.addEventListener("input", (event) => {
          const next = clamp01(Number(event.target.value) / 100);
          setSliderValue("musicVolume", next);
          updateSetting("musicVolume", next);
        });
      }
      if (sfxToggle) {
        sfxToggle.addEventListener("change", (event) => {
          updateSetting("sfxEnabled", event.target.checked);
        });
      }
      if (sfxSlider) {
        sfxSlider.addEventListener("input", (event) => {
          const next = clamp01(Number(event.target.value) / 100);
          setSliderValue("sfxVolume", next);
          updateSetting("sfxVolume", next);
        });
      }
      const aboutBtn = bodyEl.querySelector("#settingsAboutBtn");
      if (aboutBtn) {
        aboutBtn.addEventListener("click", () => {
          window.DialogOverlay?.hide?.();
          if (window.PlayingInstructions) window.PlayingInstructions.open();
        });
      }
      const developerBtn = bodyEl.querySelector("#settingsDeveloperBtn");
      if (developerBtn) {
        developerBtn.addEventListener("click", () => {
          window.DialogOverlay?.hide?.();
          showDeveloperOverlay();
        });
      }
    },
    onContinue: () => {
      if (source === "pause") {
        window.isPauseOverlayActive = true;
      }
    },
  });
}

function isDeveloperToolActive() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (window.__battlechurchHitboxEditorActive) return true;
  if (window.__BC_ENEMY_EDITOR_ACTIVE) return true;
  if (window.PaperdollSandbox?.isOpen?.()) return true;
  if (window.NpcPaperdollSandbox?.isOpen?.()) return true;
  if (window.BattlechurchClassEditor?.isOpen?.()) return true;
  const levelBuilderOverlay = document.getElementById("levelBuilderOverlay");
  return Boolean(levelBuilderOverlay && levelBuilderOverlay.style.display === "block");
}

function showDeveloperShortcutsOverlay() {
  if (!window.DialogOverlay) return;
  const shortcutCards = [
    { key: "1", label: "God Mode" },
    { key: "2", label: "Kill On-Screen + Boss -1000" },
    { key: "3", label: "Skip Wave" },
    { key: "4", label: "Skip Battle" },
    { key: "5", label: "Current Battle Boss" },
    { key: "6", label: "Act 3 Battle 3 Boss (current town)" },
    { key: "9", label: "Grace Rush" },
    { key: "T", label: "Award Next Town" },
    { key: "Y", label: "Toggle Timer" },
    { key: "C", label: "+5 Congregation" },
    { key: "O", label: "Touch Controls" },
    { key: "P", label: "Swap Powerups" },
    { key: "B", label: "Purge Charge" },
    { key: "V", label: "Visitor Session" },
    { key: "M", label: "Debug Overlay" },
    { key: "G", label: "+500 Grace" },
    { key: "H", label: "Hitbox Editor", note: "Title Only" },
  ];
  const bodyHtml = `
    <div class="settings-panel settings-panel--dev-shortcuts">
      <div class="dev-shortcuts-hint">Press Shift</div>
      <div class="dev-shortcuts-grid">
        ${shortcutCards
          .map(
            ({ key, label, note }) => `
              <div class="dev-shortcut-card">
                <div class="dev-shortcut-card__key">${key}</div>
                <div class="dev-shortcut-card__label">${label}</div>
                ${note ? `<div class="dev-shortcut-card__note">${note}</div>` : ""}
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
  window.DialogOverlay.show({
    title: "Developer Shortcuts",
    bodyHtml,
    buttonText: "Back",
    variant: "settings",
    onContinue: () => {
      showDeveloperOverlay();
    },
  });
}

function showDeveloperOverlay() {
  if (!devSessionActive) return;
  if (!window.DialogOverlay) return;
  const bodyHtml = `
    <div class="settings-panel settings-panel--developer">
      <div class="dev-action-grid">
        <button class="dialog-overlay__button dev-action-grid__button" data-dev-action="classDev">Class Dev Editor</button>
        <button class="dialog-overlay__button dev-action-grid__button" data-dev-action="pastorDev">Pastor Paperdoll</button>
        <button class="dialog-overlay__button dev-action-grid__button" data-dev-action="enemy">Enemy Editor</button>
        <button class="dialog-overlay__button dev-action-grid__button" data-dev-action="level">Level Editor</button>
<button class="dialog-overlay__button dev-action-grid__button" data-dev-action="hitbox">Hitbox Editor</button>
        <button class="dialog-overlay__button dev-action-grid__button" data-dev-action="bossHitbox">Boss Hitbox Editor</button>
        <button class="dialog-overlay__button dev-action-grid__button" data-dev-action="boss">Boss Editor</button>
        <button class="dialog-overlay__button dev-action-grid__button" data-dev-action="npcPaperdoll">NPC Paperdoll (Shift+N)</button>
        <button class="dialog-overlay__button dev-action-grid__button" data-dev-action="shortcuts">Developer Shortcuts</button>
      </div>
      <div class="settings-row"><div class="settings-row__label"><strong>Run Rules</strong></div></div>
      <div class="settings-row" data-dev-lives-row></div>
      <div class="settings-row"><div class="settings-row__label"><strong>Debug Toggles</strong></div></div>
      <div class="settings-row" data-hitbox-debug-row></div>
    </div>
  `;
  window.DialogOverlay.show({
    title: "Developer",
    bodyHtml,
    buttonText: "Back",
    variant: "settings",
    onRender: ({ bodyEl, overlay }) => {
      if (!bodyEl) return;
      applyDefaultHellfirePanelStyle(overlay, true, "defaultWide");
      const livesRow = bodyEl.querySelector("[data-dev-lives-row]");
      if (livesRow) {
        livesRow.style.display = "flex";
        livesRow.style.flexWrap = "wrap";
        livesRow.style.gap = "8px";
        const livesButton = document.createElement("button");
        livesButton.type = "button";
        livesButton.className = "dialog-overlay__button";
        const syncLivesButton = () => {
          const enabled = Boolean(devTools.threeLivesMode);
          livesButton.textContent = `Lives Mode: ${enabled ? "Dev (3 Lives)" : "Standard (1 Life)"}`;
          livesButton.style.opacity = enabled ? "1" : "0.85";
        };
        syncLivesButton();
        livesButton.addEventListener("click", () => {
          devTools.threeLivesMode = !devTools.threeLivesMode;
          persistDevThreeLivesMode(devTools.threeLivesMode);
          heroLives = getConfiguredHeroLives();
          syncLivesButton();
        });
        livesRow.appendChild(livesButton);
      }
      const hitboxRow = bodyEl.querySelector("[data-hitbox-debug-row]");
      if (hitboxRow) {
        const defs = [
          { key: "npcZones", label: "NPC Zones", custom: true },
          { key: "spawnDebug", label: "Spawn Borders", custom: true },
          { key: "ambientSmoke", label: "Red Smoke", custom: true },
          { key: "floorPicker", label: "Floor Picker Overlay", custom: true },
          { key: "cameraScroll", label: "Camera Scroll", custom: true },
          { key: "typographyLabels", label: "Typography Labels", custom: true },
          { key: "speedrunTimer", label: "Speedrun Timer", custom: true },
          { key: "playerMelee", label: "Player / Melee" },
          { key: "npcs", label: "NPCs" },
          { key: "enemies", label: "Enemies" },
          { key: "projectiles", label: "Projectiles" },
        ];
        hitboxRow.style.display = "flex";
        hitboxRow.style.flexWrap = "wrap";
        hitboxRow.style.gap = "8px";
        defs.forEach(({ key, label, custom }) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "dialog-overlay__button";
          const sync = () => {
            const active = custom
              ? key === "npcZones"
                ? Boolean(devTools.showNpcZones)
                : key === "spawnDebug"
                  ? Boolean(devTools.showSpawnDebug)
                  : key === "ambientSmoke"
                    ? Boolean(devTools.ambientSmokeEnabled)
                    : key === "floorPicker"
                      ? Boolean(devTools.floorPickerOverlay)
                    : key === "cameraScroll"
                      ? !Boolean(devTools.disableCameraScroll)
                    : key === "typographyLabels"
                      ? Boolean(window.UIStyles?.debug?.typographyLabels)
                      : key === "speedrunTimer"
                        ? Boolean(speedrunTimer.visible)
                        : false
              : Boolean(window.BattlechurchHitboxDebug?.[key]);
            button.textContent = `${label}: ${active ? "On" : "Off"}`;
            button.style.opacity = active ? "1" : "0.7";
          };
          sync();
          button.addEventListener("click", () => {
            if (custom) {
              if (key === "npcZones") {
                devTools.showNpcZones = !devTools.showNpcZones;
              } else if (key === "spawnDebug") {
                devTools.showSpawnDebug = !devTools.showSpawnDebug;
              } else if (key === "ambientSmoke") {
                devTools.ambientSmokeEnabled = !devTools.ambientSmokeEnabled;
              } else if (key === "floorPicker") {
                devTools.floorPickerOverlay = !devTools.floorPickerOverlay;
                if (typeof window !== "undefined") {
                  window.__battlechurchFloorPickerOverlayEnabled = Boolean(devTools.floorPickerOverlay);
                }
              } else if (key === "cameraScroll") {
                devTools.disableCameraScroll = !devTools.disableCameraScroll;
              } else if (key === "typographyLabels") {
                if (window.UIStyles?.debug) {
                  window.UIStyles.debug.typographyLabels = !window.UIStyles.debug.typographyLabels;
                }
              } else if (key === "speedrunTimer") {
                speedrunTimer.visible = !speedrunTimer.visible;
              }
            } else {
              window.BattlechurchToggleHitboxDebug?.(key);
            }
            sync();
          });
          hitboxRow.appendChild(button);
        });
      }
      bodyEl.querySelectorAll("[data-dev-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-dev-action");
          if (action === "pastorDev") {
            window.DialogOverlay.hide();
            window.PaperdollSandbox?.open?.();
          } else if (action === "classDev") {
            window.DialogOverlay.hide();
            window.BattlechurchClassEditor?.show?.();
          } else if (action === "enemy") {
            window.DialogOverlay.hide();
            window.BattlechurchEnemyEditor?.show?.();
          } else if (action === "level") {
            window.DialogOverlay.hide();
            window.BattlechurchLevelBuilder?.show?.();
          } else if (action === "arena") {
            window.DialogOverlay.hide();
            requestTutorialArenaLaunch();
          } else if (action === "hitbox") {
            window.DialogOverlay.hide();
            window.BattlechurchHitboxEditor?.setActive?.(true);
          } else if (action === "bossHitbox") {
            window.DialogOverlay.hide();
            window.BattlechurchBossHitboxEditor?.setActive?.(true);
          } else if (action === "boss") {
            window.DialogOverlay.hide();
            window.BattlechurchBossEditor?.show?.();
          } else if (action === "npcPaperdoll") {
            window.DialogOverlay.hide();
            window.NpcPaperdollSandbox?.open?.();
          } else if (action === "shortcuts") {
            showDeveloperShortcutsOverlay();
          }
        });
      });
    },
  });
}

function handleTitleScreen() {
  if (!titleScreenActive) return false;
  if (!hasSelectedClassStorageKey()) {
    markClassSelectionHintShown();
  }
  if (typeof window !== "undefined" && window.PlayingInstructions?.state?.open) {
    const SCROLL_SPEED = 180;
    if (isActionActive("up")) window.PlayingInstructions.scrollBy(-SCROLL_SPEED * (1 / 60));
    if (isActionActive("down")) window.PlayingInstructions.scrollBy(SCROLL_SPEED * (1 / 60));
    const floorPicker = window.BattlechurchDevArenaFloorPicker;
    if (floorPicker) {
      if (keysJustPressed.has("ArrowLeft") || keysJustPressed.has("a") || keysJustPressed.has("A")) {
        floorPicker.cycle(-1);
        keysJustPressed.delete("ArrowLeft");
        keysJustPressed.delete("a");
        keysJustPressed.delete("A");
      } else if (keysJustPressed.has("ArrowRight") || keysJustPressed.has("d") || keysJustPressed.has("D")) {
        floorPicker.cycle(1);
        keysJustPressed.delete("ArrowRight");
        keysJustPressed.delete("d");
        keysJustPressed.delete("D");
      }
    }
    if (keysJustPressed.has("Escape") || keysJustPressed.has("escape") || keysJustPressed.has(" ")) {
      window.PlayingInstructions.close();
      keysJustPressed.delete("Escape");
      keysJustPressed.delete("escape");
      keysJustPressed.delete(" ");
    }
    return true;
  }
  if (window.DialogOverlay?.isVisible?.()) {
    // While any dialog is open, block title-menu navigation/confirm keys and canvas clicks underneath it.
    keysJustPressed.delete(" ");
    keysJustPressed.delete("enter");
    keysJustPressed.delete("Enter");
    keysJustPressed.delete("escape");
    keysJustPressed.delete("Escape");
    Input.consumeCanvasClick?.();
    window.DialogOverlay?.consumeAction?.();
    return true;
  }
  if (window.DialogOverlay?.consumeAction?.()) {
    keysJustPressed.delete(" ");
    keysJustPressed.delete("enter");
    keysJustPressed.delete("Enter");
    keysJustPressed.delete("escape");
    keysJustPressed.delete("Escape");
    return true;
  }
  const developerToolActive = isDeveloperToolActive();
  if (!developerToolActive && !window.DialogOverlay?.isVisible()) {
    const buttons =
      typeof window !== "undefined" && window.__announcementButtons?.key === "title"
        ? window.__announcementButtons.buttons
        : null;
    const getFocusedCloudSaveId = () => {
      const focus =
        typeof window !== "undefined" && window.__announcementFocus?.key === "title"
          ? window.__announcementFocus
          : null;
      if (!focus || !Array.isArray(buttons)) return null;
      const focusedButton = buttons[focus.index] || null;
      const key = String(focusedButton?.key || "");
      if (!key.startsWith("cloudsave:")) return null;
      const saveId = key.slice("cloudsave:".length);
      return saveId || null;
    };
    const resolveCloudTargetSaveId = () =>
      getFocusedCloudSaveId() ||
      titleCloudSelectedSaveId ||
      titleCloudActiveSaveId ||
      titleCloudSaveRows[0]?.id ||
      null;
    const getFocusedTitleRowKey = () => {
      const focus =
        typeof window !== "undefined" && window.__announcementFocus?.key === "title"
          ? window.__announcementFocus
          : null;
      if (!focus || !Array.isArray(buttons)) return null;
      const focusedButton = buttons[focus.index] || null;
      return String(focusedButton?.key || "") || null;
    };
    const setTitleFocusByButtonKey = (targetKey) => {
      if (!targetKey || !Array.isArray(buttons) || typeof window === "undefined") return false;
      const idx = buttons.findIndex((btn) => String(btn?.key || "") === String(targetKey));
      if (idx < 0) return false;
      window.__announcementFocus = { key: "title", index: idx };
      window.__announcementFocusedButtonKey = String(buttons[idx]?.key || "");
      return true;
    };
    const updateAudioSetting = (key, value) => {
      audioSettings[key] = value;
      saveAudioSettings();
      applyAudioSettings();
    };
    const adjustCanvasSettingByFocusedKey = (delta) => {
      if (titleUtilityPanelMode !== "settings") return false;
      const focusedKey = getFocusedTitleRowKey();
      if (!focusedKey) return false;
      if (focusedKey === "settingsMusicVolume") {
        const next = clamp01((Number(audioSettings.musicVolume) || 0) + delta);
        updateAudioSetting("musicVolume", next);
        return true;
      }
      if (focusedKey === "settingsSfxVolume") {
        const next = clamp01((Number(audioSettings.sfxVolume) || 0) + delta);
        updateAudioSetting("sfxVolume", next);
        return true;
      }
      return false;
    };
    if (titleUtilityPanelMode === "settings") {
      const sliderStep = 0.05;
      if (keysJustPressed.has("ArrowLeft") || keysJustPressed.has("a") || keysJustPressed.has("A")) {
        if (adjustCanvasSettingByFocusedKey(-sliderStep)) return true;
      }
      if (keysJustPressed.has("ArrowRight") || keysJustPressed.has("d") || keysJustPressed.has("D")) {
        if (adjustCanvasSettingByFocusedKey(sliderStep)) return true;
      }
    }
    const handled = handleAnnouncementButtons({
      key: "title",
      buttons,
      allowSpace: true,
      resolveFocusIndex: ({ buttons, focusIndex, direction }) => {
        if (!Array.isArray(buttons) || buttons.length === 0) return focusIndex;
        if (!titleDemoSaveMenuActive) {
          if (titleUtilityPanelMode === "settings") {
            const linearDirection = direction === "left" || direction === "up" ? -1 : 1;
            return (focusIndex + linearDirection + buttons.length) % buttons.length;
          }
          if (buttons.length <= 1) return focusIndex;
          const linearDirection = direction === "left" || direction === "up" ? -1 : 1;
          if (titleClassMenuActive) {
            return Math.max(0, Math.min(buttons.length - 1, focusIndex + linearDirection));
          }
          return (focusIndex + linearDirection + buttons.length) % buttons.length;
        }
        const current = buttons[focusIndex] || null;
        if (titleUtilityPanelMode === "more") {
          const linearDirection = direction === "left" || direction === "up" ? -1 : 1;
          return (focusIndex + linearDirection + buttons.length) % buttons.length;
        }
        // Save rows: navZone "rows". More chips + action buttons: navZone "actions".
        const saveRows = buttons
          .map((button, index) => ({ button, index }))
          .filter((entry) => entry.button?.navZone === "rows")
          .sort((a, b) => (Number(a.button?.navRow) || 0) - (Number(b.button?.navRow) || 0));
        const actionBtns = buttons
          .map((button, index) => ({ button, index }))
          .filter((entry) => entry.button?.navZone === "actions" && !String(entry.button?.key || "").startsWith("cloudrowmore:"))
          .sort((a, b) => (Number(a.button?.navCol) || 0) - (Number(b.button?.navCol) || 0));

        if (current?.navZone === "rows") {
          const rowPos = saveRows.findIndex((entry) => entry.index === focusIndex);
          if (rowPos < 0) return focusIndex;
          if (direction === "up") return saveRows[(rowPos - 1 + saveRows.length) % saveRows.length].index;
          if (direction === "down") {
            // Wrap from last save down into action buttons
            if (rowPos === saveRows.length - 1 && actionBtns.length) return actionBtns[0].index;
            return saveRows[(rowPos + 1) % saveRows.length].index;
          }
          if (direction === "right") {
            // Focus the more chip for this save row
            const rowKey = String(current.key || "");
            if (rowKey.startsWith("cloudsave:")) {
              const saveId = rowKey.slice("cloudsave:".length);
              const moreIdx = buttons.findIndex((btn) => String(btn?.key || "") === `cloudrowmore:${saveId}`);
              if (moreIdx >= 0) return moreIdx;
            }
          }
          return focusIndex;
        }

        if (current?.navZone === "actions") {
          const curKey = String(current.key || "");
          // More chip — left returns to its save row, up/down behaves like the save row
          if (curKey.startsWith("cloudrowmore:")) {
            if (direction === "left" || direction === "up" || direction === "down") {
              const saveId = curKey.slice("cloudrowmore:".length);
              const saveIdx = buttons.findIndex((btn) => String(btn?.key || "") === `cloudsave:${saveId}`);
              return saveIdx >= 0 ? saveIdx : focusIndex;
            }
            return focusIndex;
          }
          // Bottom action buttons — left/right cycles, up returns to last save row
          const curCol = Number(current.navCol) || 0;
          if (direction === "left") {
            const prev = actionBtns.find((e) => (Number(e.button?.navCol) || 0) === curCol - 1);
            return prev?.index ?? focusIndex;
          }
          if (direction === "right") {
            const next = actionBtns.find((e) => (Number(e.button?.navCol) || 0) === curCol + 1);
            return next?.index ?? focusIndex;
          }
          if (direction === "up" && saveRows.length) return saveRows[saveRows.length - 1].index;
          return focusIndex;
        }

        return focusIndex;
      },
      onFocusChange: (button) => {
        if (!titleDemoSaveMenuActive) return;
        const key = String(button?.key || "");
        if (!key.startsWith("cloudsave:")) return;
        const saveId = key.slice("cloudsave:".length);
        if (saveId) titleCloudSelectedSaveId = saveId;
      },
      onActivate: (button) => {
        if (titleClassMenuActive) {
          if (button.key === "back") {
            titleClassMenuActive = false;
            if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
              window.playMenuAdvanceSfx(0.55);
            }
            return;
          }
          if (String(button.key || "").startsWith("class:")) {
            const classId = String(button.key).slice("class:".length);
            if (classId) {
              const selectedClass = window.BattlechurchClasses?.setActive?.(classId) || null;
              if (typeof window !== "undefined" && typeof window.playMenuItemPickSfx === "function") {
                window.playMenuItemPickSfx(0.55);
              }
              const selectedName =
                selectedClass?.classTitle ||
                window.BattlechurchClassConfig?.byId?.[classId]?.classTitle ||
                classId;
              showProgressSaveToast(`Class Selected: ${selectedName}`, 1.8);
            }
            return;
          }
        }
        if (button.key === "continue" || button.key === "play") {
          setDemoSandboxRunActive(false);
          titleDemoSaveMenuActive = true;
          titleUtilityPanelMode = null;
          if (typeof window !== "undefined" && typeof window.playMenuItemPickSfx === "function") {
            window.playMenuItemPickSfx(0.55);
          }
          void refreshTitleCloudSaveOption();
          return;
        }
        if (button.key === "back") {
          if (titleUtilityPanelMode) {
            titleUtilityPanelMode = null;
            if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
              window.playMenuAdvanceSfx(0.55);
            }
            return;
          }
          setDemoSandboxRunActive(false);
          titleDemoSaveMenuActive = false;
          titleClassMenuActive = false;
          if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
            window.playMenuAdvanceSfx(0.55);
          }
          return;
        }
        if (button.key === "loginGoogle") {
          void (async () => {
            if (typeof window !== "undefined" && typeof window.playMenuItemPickSfx === "function") {
              window.playMenuItemPickSfx(0.55);
            }
            try {
              if (window.cloudAuthProvider === "google") {
                await refreshTitleCloudSaveOption();
              } else if (window.Cloud?.signInWithGoogle) {
                await window.Cloud.signInWithGoogle();
                await refreshTitleCloudSaveOption();
              }
            } catch (e) {
              const code = e?.code || window.cloudLastAuthErrorCode || "";
              let message = "Google sign-in failed. Please try again.";
              if (code === "auth/operation-not-allowed") {
                message = "Google sign-in isn't set up on this site yet (GOOGLE_CLIENT_ID).";
              } else if (code === "auth/invalid-credential") {
                message = "Google sign-in couldn't be verified. Please try again.";
              } else if (code === "auth/popup-blocked") {
                message = "Popup was blocked. Allow popups for this site and try again.";
              }
              setDevStatus(message, 5);
              if (typeof window?.alert === "function") {
                window.alert(message);
              }
            }
          })();
          return;
        }
        if (button.key === "viewCloudSaveDetails") {
          const focusedKey = getFocusedTitleRowKey();
          const focusedCloudId =
            focusedKey && focusedKey.startsWith("cloudsave:")
              ? focusedKey.slice("cloudsave:".length)
              : null;
          const targetCloudId = focusedCloudId || resolveCloudTargetSaveId();
          const cloudRow = targetCloudId
            ? titleCloudSaveRows.find((row) => row.id === targetCloudId) || null
            : null;
          let title = "Save Details";
          let lines = [];
          if (cloudRow?.details) {
            const d = cloudRow.details;
            const districtRows = Array.isArray(d.districtRows) ? d.districtRows : [];
            title = `${d.saveName || "Save"} - Full Details`;
            lines.push(`Player: ${d.playerName || "Pastor"}`);
            lines.push(`Denomination: ${d.classTitle || "Unknown"}`);
            const _vdTerms = window.BattlechurchCampaignLabels?.terms || {};
            const _vdDistrict = _vdTerms.district || "District";
            const _vdDistricts = _vdTerms.districts || "Districts";
            lines.push(`${_vdDistricts} Cleared: ${Number(d.completedDistricts) || 0}/${Number(d.totalDistricts) || 10}`);
            lines.push(`Congregation Total: ${Number(d.totalCongregationBest) || 0}`);
            lines.push(`Runs: ${Number(d.totalReplayCompletions) || 0}`);
            lines.push(`Upgrade Levels: ${Number(d.totalUpgradeLevels) || 0}`);
            lines.push("");
            lines.push(`${_vdDistrict} Breakdown:`);
            districtRows.forEach((row) => {
              lines.push(
                `${row?.districtName || _vdDistrict} | ${row?.p1Completed ? "DONE" : "--"} | C:${Number(row?.bestCount) || 0} R:${Number(row?.completions) || 0} U:${Number(row?.upgradeLevelTotal) || 0}`,
              );
            });
          } else {
            const demoKey = focusedKey && focusedKey.startsWith("slot") ? focusedKey : null;
            const demoSlot = demoKey ? TITLE_DEMO_SAVE_SLOTS.find((slot) => slot.key === demoKey) : null;
            if (demoSlot) {
              const campaignData = demoSlot.campaignData || {};
              title = `${demoSlot.label || "Demo Slot"} - Details`;
              lines.push(`Start Town: ${demoSlot.districtId || "unknown"}`);
              const _dsTerms = window.BattlechurchCampaignLabels?.terms || {};
              lines.push(`Preset ${_dsTerms.districts || "Districts"} Cleared: ${Math.max(0, Number(demoSlot.completedDistricts) || 0)}/10`);
              const campaignId = String(campaignData.campaign || "p1").toLowerCase();
              const _phases = window.BattlechurchCampaignLabels?.phases || {};
              const visitLabel = _phases[campaignId] || campaignId.toUpperCase();
              lines.push(`Visit: ${visitLabel}`);
              lines.push(`Start Congregation: ${Math.max(0, Number(campaignData.startCount) || 0)}`);
              lines.push(`Visit Multiplier: x${Number(campaignData.campaignMultiplier || 1).toFixed(2).replace(/\\.00$/, "")}`);
              const upgrades = Object.entries(campaignData.restoredChurchPowerupLevels || {});
              lines.push(
                `Upgrades: ${
                  upgrades.length
                    ? upgrades.map(([id, level]) => `${id} ${Number(level) || 0}`).join(", ")
                    : "None"
                }`,
              );
            }
          }
          if (!lines.length) {
            lines = ["Select a save row first, then choose View Full Details."];
          }
          if (window.DialogOverlay?.show) {
            window.DialogOverlay.show({
              title,
              bodyHtml: `<div class="settings-panel"><pre style="white-space: pre-wrap; max-height: 58vh; overflow-y: auto; margin: 0;">${escapeHtml(lines.join("\n"))}</pre></div>`,
              buttonText: "Close",
              variant: "settings",
            });
          } else if (typeof window?.alert === "function") {
            window.alert(`${title}\n\n${lines.join("\n")}`);
          }
          return;
        }
        if (button.key === "logoutGoogle") {
          void (async () => {
            try {
              if (typeof window !== "undefined" && typeof window.playMenuItemPickSfx === "function") {
                window.playMenuItemPickSfx(0.55);
              }
              setDemoSandboxRunActive(false);
              titleDemoSaveOverride = null;
              if (window.Cloud?.signOut) {
                await window.Cloud.signOut();
              }
              await refreshTitleCloudSaveOption();
            } catch (e) {
              if (typeof window?.alert === "function") {
                window.alert(`Logout failed: ${e?.message || "Unknown error"}`);
              }
            }
          })();
          return;
        }
        if (String(button.key || "").startsWith("cloudsave:")) {
          void (async () => {
            const saveId = String(button.key).slice("cloudsave:".length);
            await openMapFromCloudSave(saveId);
          })();
          return;
        }
        if (button.key === "newCloudSave") {
          showNewCloudSaveDialog();
          return;
        }
        if (String(button.key || "").startsWith("cloudrowmore:")) {
          const saveId = String(button.key).slice("cloudrowmore:".length);
          if (saveId) {
            titleCloudSelectedSaveId = saveId;
            titleUtilityPanelMode = "more";
          }
          return;
        }
        if (button.key === "utilityPanelClose") {
          if (titleUtilityPanelMode === "editSave") {
            titleUtilityPanelMode = "more";
          } else if (titleUtilityPanelMode === "newSave") {
            titleUtilityPanelMode = null;
            titleNewSaveDraft = null;
          } else {
            titleUtilityPanelMode = null;
            titleEditSaveDraft = null;
          }
          return;
        }
        if (button.key === "settingsMusicEnabled") {
          updateAudioSetting("musicEnabled", !audioSettings.musicEnabled);
          return;
        }
        if (button.key === "settingsMusicVolume" || button.key === "settingsSfxVolume") {
          return;
        }
        if (button.key === "settingsSfxEnabled") {
          updateAudioSetting("sfxEnabled", !audioSettings.sfxEnabled);
          return;
        }
        if (button.key === "settingsSpeedrunTimer") {
          updateAudioSetting("showSpeedrunTimer", !audioSettings.showSpeedrunTimer);
          return;
        }
        if (button.key === "settingsAbout") {
          if (window.PlayingInstructions) window.PlayingInstructions.open();
          return;
        }
        if (button.key === "settingsCustomize") {
          window.PaperdollSandbox?.loadCustomFaceFromStorage?.();
          window.PaperdollSandbox?.openCustomize?.();
          return;
        }
        if (button.key === "settingsDeveloper") {
          showDeveloperOverlay();
          return;
        }
        if (button.key === "editCloudSave") {
          const saveId = resolveCloudTargetSaveId();
          if (saveId) showEditCloudSaveDialog(saveId);
          return;
        }
        if (button.key === "renameCloudSave") {
          titleUtilityPanelMode = null;
          titleEditSaveDraft = null;
          void (async () => {
            const saveId = resolveCloudTargetSaveId();
            if (!saveId) return;
            const current = titleCloudSaveRows.find((row) => row.id === saveId);
            const currentName = current?.label?.split(" (")[0] || "Save";
            const nextName = typeof window?.prompt === "function"
              ? window.prompt("Rename save file:", currentName)
              : null;
            if (!nextName || !nextName.trim()) return;
            if (typeof window.MapScreen?.renameSaveFile === "function") {
              await window.MapScreen.renameSaveFile(saveId, nextName.trim());
            }
            await refreshTitleCloudSaveOption();
          })();
          return;
        }
        if (button.key === "deleteCloudSave") {
          titleUtilityPanelMode = null;
          titleEditSaveDraft = null;
          void (async () => {
            const saveId = resolveCloudTargetSaveId();
            if (!saveId || typeof window.MapScreen?.deleteSaveFile !== "function") return;
            const confirmed =
              typeof window === "undefined" ||
              typeof window.confirm !== "function" ||
              window.confirm("Delete selected save file? This cannot be undone.");
            if (!confirmed) return;
            try {
              const deleted = await window.MapScreen.deleteSaveFile(saveId);
              if (!deleted && typeof window?.alert === "function") {
                window.alert("Could not delete save. You must keep at least one save file.");
              }
            } catch (e) {
              if (typeof window?.alert === "function") {
                window.alert(`Delete failed: ${e?.message || "Unknown error"}`);
              }
            }
            await refreshTitleCloudSaveOption();
          })();
          return;
        }
        if (button.key === "resetGoogleSave") {
          titleUtilityPanelMode = null;
          titleEditSaveDraft = null;
          void (async () => {
            const saveId = resolveCloudTargetSaveId();
            if (!saveId) return;
            const confirmed =
              typeof window === "undefined" ||
              typeof window.confirm !== "function" ||
              window.confirm("Reset highlighted save file progress to a fresh start? This cannot be undone.");
            if (!confirmed) return;
            try {
              if (typeof window !== "undefined" && typeof window.playMenuItemPickSfx === "function") {
                window.playMenuItemPickSfx(0.55);
              }
              if (typeof window.MapScreen?.resetSaveFile === "function") {
                const ok = await window.MapScreen.resetSaveFile(saveId);
                if (!ok && typeof window?.alert === "function") {
                  window.alert("Reset failed. Please try again.");
                }
              } else if (window.Cloud?.resetPlayerProgress) {
                // Legacy fallback only if per-save reset is unavailable.
                const ok = await window.Cloud.resetPlayerProgress();
                if (!ok && typeof window?.alert === "function") {
                  window.alert("Reset failed. Please try again.");
                }
              }
              titleCloudSelectedSaveId = saveId;
              titleDemoSaveOverride = null;
              await refreshTitleCloudSaveOption();
            } catch (e) {
              if (typeof window?.alert === "function") {
                window.alert(`Reset failed: ${e?.message || "Unknown error"}`);
              }
            }
          })();
          return;
        }
        if (button.key === "map") {
          // Loading-state fallback: open map directly.
          setDemoSandboxRunActive(false);
          titleScreenActive = false;
          mapActive = true;
          if (window.MapScreen) window.MapScreen.open();
          titleDemoSaveMenuActive = false;
          titleDemoSaveOverride = null;
        } else if (TITLE_DEMO_SAVE_SLOTS.some((entry) => entry.key === button.key)) {
          const slot = TITLE_DEMO_SAVE_SLOTS.find((entry) => entry.key === button.key);
          if (slot?.districtId) {
            // First-time players get the tutorial before the map.
            void openMapFromDemoSlot(slot);
          }
        } else if (button.key === "settings") {
          titleDemoSaveMenuActive = false;
          titleClassMenuActive = false;
          showSettingsOverlay({ source: "title" });
        } else if (button.key === "developer") {
          showDeveloperOverlay();
        } else if (String(button.key || "").toLowerCase() === "howtoplay") {
          requestTutorialArenaLaunch("title");
        }
      },
    });
    if (handled) return true;
  }
  keysJustPressed.delete(" ");
  return true;
}

function handleVisitorSessionSkip() {
  if (!visitorSession.active || !keysJustPressed.has("7")) return false;
  visitorSession.summaryReason = visitorSession.summaryReason || "skipped";
  completeVisitorSession("skipped");
  keysJustPressed.delete(" ");
  keysJustPressed.delete("7");
  return true;
}

function prepareVisitorSummaryRecap(announcement) {
  if (announcement?.recapPrepared) return;
  startRecapMusic();
  const saved = visitorSession.savedVisitors || 0;
  const portraits = Array.isArray(visitorSession.newMemberPortraits) ? visitorSession.newMemberPortraits : [];
  const names = Array.isArray(visitorSession.newMemberNames) ? visitorSession.newMemberNames : [];
  const congregationTotal = getCongregationSize();
  const startCount = Math.max(0, congregationTotal - saved);
  const npcHealthBreakdown = portraits.map((portrait, i) => ({
    name: names[i] || "",
    portrait,
    active: true,
  }));
  announcement.recapData = {
    id: `visitor-recap-${Date.now()}`,
    title: "Visitor Report",
    startCount,
    totalDelta: saved,
    totalCount: congregationTotal,
    problemTitle: "",
    lines: [{
      label: "New Members:",
      delta: saved,
      kind: "visitorProfiles",
      affectsTotal: true,
      npcHealthBreakdown,
    }],
    graceBonus: 0,
    graceBonusCongregants: 0,
    graceApplied: false,
    graceAppliedCount: 0,
    graceSpawned: false,
  };
  announcement.recapPrepared = true;
}

function handleVisitorSummary() {
  if (!visitorSession.active || !visitorSession.summaryActive) return false;
  if (!visitorSession.recapShown) {
    visitorSession.recapShown = true;
    const announcement = {
      requiresConfirm: true,
      isVisitorSummary: true,
      title: "Visitor Report",
      skipMissionBrief: true,
      summaryReason: visitorSession.summaryReason || "summary",
    };
    prepareVisitorSummaryRecap(announcement);
    levelAnnouncements.push(announcement);
  }
  // Once the announcement is queued, let handleLevelAnnouncements take over
  // so it can handle Continue/dismiss input normally.
  return false;
}

function handleVisitorIntro() {
  if (!visitorSession.active || !visitorSession.introActive) return false;
  const buttons =
    typeof window !== "undefined" && window.__announcementButtons?.key === "visitorIntro"
      ? window.__announcementButtons.buttons
      : null;
  const handled = handleAnnouncementButtons({
    key: "visitorIntro",
    buttons,
    allowSpace: true,
    onActivate: () => {
      visitorSession.introActive = false;
      keysJustPressed.delete(" ");
      if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
        window.playMenuAdvanceSfx(0.55);
      }
    },
  });
  if (handled) return true;
  if (
    wasActionJustPressed("restart") ||
    wasActionJustPressed("pause") ||
    keysJustPressed.has("7")
  ) {
    visitorSession.introActive = false;
    keysJustPressed.delete(" ");
    keysJustPressed.delete("7");
  }
  return true;
}

function getAnnouncementNavDirection() {
  let direction = 0;
  const leftKeys = ["arrowleft", "a", "arrowup", "w"];
  const rightKeys = ["arrowright", "d", "arrowdown", "s"];
  if (leftKeys.some((key) => keysJustPressed.has(key))) direction = -1;
  if (rightKeys.some((key) => keysJustPressed.has(key))) direction = 1;
  if (direction !== 0) {
    leftKeys.forEach((key) => keysJustPressed.delete(key));
    rightKeys.forEach((key) => keysJustPressed.delete(key));
    return direction;
  }
  if (typeof Input === "undefined" || typeof Input.isActionActive !== "function") {
    announcementNavHoldDir = null;
    announcementNavNextTime = 0;
    return 0;
  }
  const hasHoldInputSource =
    Boolean(Input.virtualInput?.enabled) || Boolean(Input.gamepadState?.movement?.active);
  if (!hasHoldInputSource) {
    announcementNavHoldDir = null;
    announcementNavNextTime = 0;
    return 0;
  }
  const leftActive = Input.isActionActive("left") || Input.isActionActive("up");
  const rightActive = Input.isActionActive("right") || Input.isActionActive("down");
  const nextDir = leftActive ? -1 : rightActive ? 1 : 0;
  if (!nextDir) {
    announcementNavHoldDir = null;
    announcementNavNextTime = 0;
    return 0;
  }
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const initialDelayMs = 280;
  const repeatDelayMs = 140;
  if (announcementNavHoldDir !== nextDir) {
    announcementNavHoldDir = nextDir;
    announcementNavNextTime = now + initialDelayMs;
    return nextDir;
  }
  if (now >= announcementNavNextTime) {
    announcementNavNextTime = now + repeatDelayMs;
    return nextDir;
  }
  return 0;
}

function getAnnouncementNavCardinal() {
  const leftKeys = ["arrowleft", "a"];
  const rightKeys = ["arrowright", "d"];
  const upKeys = ["arrowup", "w"];
  const downKeys = ["arrowdown", "s"];
  if (leftKeys.some((key) => keysJustPressed.has(key))) {
    leftKeys.forEach((key) => keysJustPressed.delete(key));
    return "left";
  }
  if (rightKeys.some((key) => keysJustPressed.has(key))) {
    rightKeys.forEach((key) => keysJustPressed.delete(key));
    return "right";
  }
  if (upKeys.some((key) => keysJustPressed.has(key))) {
    upKeys.forEach((key) => keysJustPressed.delete(key));
    return "up";
  }
  if (downKeys.some((key) => keysJustPressed.has(key))) {
    downKeys.forEach((key) => keysJustPressed.delete(key));
    return "down";
  }
  return null;
}

function handleAnnouncementButtons({ key, buttons, onActivate, onFocusChange, resolveFocusIndex, allowSpace = true }) {
  if (!Array.isArray(buttons) || buttons.length === 0) return false;
  const focus = typeof window !== "undefined" ? window.__announcementFocus : null;
  let focusIndex = focus && focus.key === key ? focus.index : 0;
  if (!Number.isFinite(focusIndex) || focusIndex < 0 || focusIndex >= buttons.length) {
    focusIndex = 0;
  }
  const previousIndex = focusIndex;
  const cardinalDirection = getAnnouncementNavCardinal();
  if (cardinalDirection) {
    if (typeof resolveFocusIndex === "function") {
      const resolved = resolveFocusIndex({ buttons, focusIndex, direction: cardinalDirection });
      if (
        Number.isFinite(resolved) &&
        resolved >= 0 &&
        resolved < buttons.length
      ) {
        focusIndex = resolved;
      }
    } else if (buttons.length > 1) {
      const linearDirection = cardinalDirection === "left" || cardinalDirection === "up" ? -1 : 1;
      focusIndex = (focusIndex + linearDirection + buttons.length) % buttons.length;
    }
  } else {
    const direction = getAnnouncementNavDirection();
    if (direction !== 0 && buttons.length > 1) {
      focusIndex = (focusIndex + direction + buttons.length) % buttons.length;
    }
  }
  if (focusIndex !== previousIndex && typeof window?.playMenuMoveSfx === "function") {
    window.playMenuMoveSfx(0.45);
  }
  if (typeof window !== "undefined") {
    window.__announcementFocus = { key, index: focusIndex };
    window.__announcementFocusedButtonKey = String(buttons[focusIndex]?.key || "");
  }
  if (
    typeof onFocusChange === "function" &&
    (
      focusIndex !== previousIndex ||
      !focus ||
      focus.key !== key ||
      !Number.isFinite(focus.index)
    )
  ) {
    onFocusChange(buttons[focusIndex], focusIndex);
  }
  const clickPos = Input.consumeCanvasClick?.();
  if (clickPos) {
    // Resolve top-most/smallest target first so inline chips (like row ellipsis)
    // are not swallowed by larger parent row hitboxes.
    let hitIndex = -1;
    let hitArea = Number.POSITIVE_INFINITY;
    for (let i = buttons.length - 1; i >= 0; i -= 1) {
      const btn = buttons[i];
      if (!btn) continue;
      const inside =
        clickPos.x >= btn.x &&
        clickPos.x <= btn.x + btn.width &&
        clickPos.y >= btn.y &&
        clickPos.y <= btn.y + btn.height;
      if (!inside) continue;
      const area = Math.max(1, Number(btn.width) || 1) * Math.max(1, Number(btn.height) || 1);
      if (area <= hitArea) {
        hitArea = area;
        hitIndex = i;
      }
    }
    if (hitIndex >= 0) {
      focusIndex = hitIndex;
      if (typeof window !== "undefined") {
        window.__announcementFocus = { key, index: focusIndex };
      }
      if (typeof onActivate === "function") {
        onActivate(buttons[hitIndex], hitIndex);
      }
      return true;
    }
  }
  const confirmKeys = [" ", "enter", "Enter"];
  if (window.__battlechurchSuppressMenuConfirmUntilRelease) {
    const confirmStillHeld = confirmKeys.some((k) => keysPressed.has(k));
    if (confirmStillHeld) {
      return false;
    }
    window.__battlechurchSuppressMenuConfirmUntilRelease = false;
  }
  if (allowSpace && confirmKeys.some((k) => keysJustPressed.has(k))) {
    confirmKeys.forEach((k) => keysJustPressed.delete(k));
    if (typeof onActivate === "function") {
      onActivate(buttons[focusIndex], focusIndex);
    }
    return true;
  }
  const cancelKeys = ["escape", "Escape"];
  if (cancelKeys.some((k) => keysJustPressed.has(k))) {
    cancelKeys.forEach((k) => keysJustPressed.delete(k));
    const cancelIndex = buttons.findIndex((button) =>
      ["back", "resume", "continue", "close"].includes(String(button?.key || "").toLowerCase())
    );
    if (cancelIndex >= 0 && typeof onActivate === "function") {
      onActivate(buttons[cancelIndex], cancelIndex);
      return true;
    }
  }
  return false;
}

function handleLevelAnnouncements() {
  const missionButtons =
    typeof window !== "undefined" ? window.__missionBriefButtonBounds : null;
  const missionActive =
    typeof window !== "undefined" ? window.__missionBriefActive : false;
  const currentAnnouncement = levelAnnouncements.length ? levelAnnouncements[0] : null;
  const currentIsSummary = isBattleSummaryAnnouncement(currentAnnouncement);
  const missionAnnouncementActive = Boolean(
    currentAnnouncement &&
    currentAnnouncement.requiresConfirm &&
    !currentIsSummary &&
    !currentAnnouncement.isVisitorSummary &&
    !currentAnnouncement.battlefieldIntro &&
    !currentAnnouncement.exteriorShot &&
    !currentAnnouncement.pastorFinal &&
    !currentAnnouncement.pastorPostRecap &&
    !currentAnnouncement.skipMissionBrief,
  );
  if (missionActive && !missionAnnouncementActive && typeof window !== "undefined") {
    // Prevent stale mission-brief state from hijacking recap/other overlays.
    window.__missionBriefActive = false;
    window.__missionBriefButtonBounds = null;
  }
  if (missionAnnouncementActive && missionActive && Array.isArray(missionButtons) && missionButtons.length) {
    const handled = handleAnnouncementButtons({
      key: "missionBrief",
      buttons: missionButtons,
      allowSpace: true,
      onActivate: (button) => {
        if (button.key === "continue") {
          dismissCurrentLevelAnnouncement();
          if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
            window.playMenuAdvanceSfx(0.55);
          }
          return;
        }
        if (typeof window !== "undefined" && typeof window.playMenuItemPickSfx === "function") {
          window.playMenuItemPickSfx(0.55);
        }
        if (typeof window.selectFormation === "function") {
          window.selectFormation(button.key);
        }
        if (typeof window.startBattleMusicFromFormation === "function") {
          window.startBattleMusicFromFormation();
        }
        if (typeof window.applyFormationAnchors === "function") {
          try { window.applyFormationAnchors(); } catch (e) {}
        }
        dismissCurrentLevelAnnouncement();
      },
    });
    if (handled) return true;
  }
  if (!levelAnnouncements.length || !levelAnnouncements[0].requiresConfirm) return false;
  const isSummary = currentIsSummary;
  if (isSummary) {
    if (!currentAnnouncement.recapPrepared) {
      const battleSummary = levelManager?.getLastBattleSummary?.() || {};
      const savedCount = Number.isFinite(battleSummary?.savedCount) ? battleSummary.savedCount : 0;
      const lostCount = Number.isFinite(battleSummary?.lostCount) ? battleSummary.lostCount : 0;
      const upgradeAfter = Boolean(window.UpgradeScreen);
      showBattleSummaryDialog(currentAnnouncement, savedCount, lostCount, upgradeAfter);
    }
    if (!currentAnnouncement._recapIntroFadeStarted) {
      currentAnnouncement._recapIntroFadeStarted = true;
      startRecapIntroFade(0.95);
    }
    const buttons =
      typeof window !== "undefined" && window.__announcementButtons?.key === "recap"
        ? window.__announcementButtons.buttons
        : null;
    const canContinueRecap = typeof window !== "undefined" && window.__recapAllowContinue;
    const recapSkipKeys = [" ", "enter", "Enter"];
    if (!canContinueRecap && recapSkipKeys.some((k) => keysJustPressed.has(k))) {
      recapSkipKeys.forEach((k) => keysJustPressed.delete(k));
      if (typeof window !== "undefined") {
        window.__recapSkipRequested = true;
      }
      return true;
    }
    const handled = handleAnnouncementButtons({
      key: "recap",
      buttons,
      allowSpace: Boolean(canContinueRecap),
      onActivate: () => {
        graceRushBlackout = false;
        graceRushFadeHold = false;
        graceRushFadeTimer = 0;
        graceRushFadeDuration = 0;
        graceRushFadeAlpha = 0;
        // Determine if this is the final level of the current town
        const levelsPerDistrict = Number.isFinite(window.BATTLES_PER_DISTRICT) ? window.BATTLES_PER_DISTRICT : 3;
        const isFinalDistrictLevel = lastCompletedLevel >= levelsPerDistrict;

        let missionSaveContext = null;
        if (currentAnnouncement.levelSummary) {
          const recapData = currentAnnouncement.recapData;
          const finalScore = Number.isFinite(recapData?.totalCount)
            ? recapData.totalCount
            : getCongregationSize();
          if (typeof window !== "undefined") {
            window.lastRunScore = finalScore;
          }
          if (!demoSandboxRunActive && activeDistrictId) {
            if (isFinalDistrictLevel) {
              missionSaveContext = {
                kind: "finalTown",
                districtId: activeDistrictId,
                campaign: activeCampaign,
                finalScore,
              };
            } else {
              missionSaveContext = {
                kind: "missionCheckpoint",
                districtId: activeDistrictId,
                campaign: activeCampaign,
                resumeLocalBattleNumber: lastCompletedLevel + 1,
                startCount: finalScore,
              };
            }
          }
        }
        if (currentAnnouncement.recapFinalYear) {
          // Campaign final (Level 25 / capital)
          pendingUpgradeAfterSummary = false;
          queuePastorFinalAnnouncement();
        } else if (currentAnnouncement.levelSummary && isFinalDistrictLevel) {
          // Final level of this town - show upgrade screen first, then pastor post-recap
          pendingUpgradeAfterSummary = true;
          pendingPastorPostRecapAfterUpgrade = true;
        } else if (currentAnnouncement.levelSummary) {
          // Mid-town level (Level 1 or 2) - trigger upgrade screen + chapter break
          pendingUpgradeAfterSummary = true;
        } else {
          pendingUpgradeAfterSummary = Boolean(currentAnnouncement.recapUpgradeAfter);
        }
        // Level-editor playtests should still keep the standard upgrade step
        // after recap, but avoid extra pastor/chapter detours.
        if (devPlaytestSession?.active) {
          pendingPastorPostRecapAfterUpgrade = false;
        }
        if (pendingUpgradeAfterSummary) {
          pendingMissionSaveContext = missionSaveContext;
        } else {
          pendingMissionSaveContext = null;
          if (missionSaveContext) {
            void saveMissionProgressContext(missionSaveContext);
          }
        }
        const recapData = currentAnnouncement.recapData;
        if (recapData && !recapData.graceApplied && recapData.graceBonus > 0) {
          const appliedCount = Number.isFinite(recapData.graceAppliedCount)
            ? recapData.graceAppliedCount
            : 0;
          const remaining = Math.max(0, recapData.graceBonus - appliedCount);
          if (remaining > 0) {
            addGrace(remaining);
          }
          recapData.graceApplied = true;
        }
        dismissCurrentLevelAnnouncement();
        if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
          window.playMenuAdvanceSfx(0.55);
        }
      },
    });
    if (handled) return true;
    return true;
  }
  if (currentAnnouncement.isVisitorSummary) {
    if (!currentAnnouncement.recapPrepared) {
      prepareVisitorSummaryRecap(currentAnnouncement);
    }
    const buttons =
      typeof window !== "undefined" && window.__announcementButtons?.key === "recap"
        ? window.__announcementButtons.buttons
        : null;
    const canContinueRecap = typeof window !== "undefined" && window.__recapAllowContinue;
    const recapSkipKeys = [" ", "enter", "Enter"];
    if (!canContinueRecap && recapSkipKeys.some((k) => keysJustPressed.has(k))) {
      recapSkipKeys.forEach((k) => keysJustPressed.delete(k));
      if (typeof window !== "undefined") window.__recapSkipRequested = true;
      return true;
    }
    const handled = handleAnnouncementButtons({
      key: "recap",
      buttons,
      allowSpace: Boolean(canContinueRecap),
      onActivate: () => {
        graceRushBlackout = false;
        graceRushFadeHold = false;
        graceRushFadeTimer = 0;
        graceRushFadeDuration = 0;
        graceRushFadeAlpha = 0;
        stopRecapMusic();
        dismissCurrentLevelAnnouncement();
        if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
          window.playMenuAdvanceSfx(0.55);
        }
      },
    });
    if (handled) return true;
    return true;
  }
  if (currentAnnouncement.pastorFinal) {
    if (!currentAnnouncement._revealComplete) return true;
    const buttons =
      typeof window !== "undefined" && window.__announcementButtons?.key === "pastorFinal"
        ? window.__announcementButtons.buttons
        : null;
    const handled = handleAnnouncementButtons({
      key: "pastorFinal",
      buttons,
      allowSpace: true,
      onActivate: () => {
        dismissCurrentLevelAnnouncement();
        activateEpilogue();
      },
    });
    if (handled) return true;
    const clickPos = Input.consumeCanvasClick?.();
    if (clickPos) {
      dismissCurrentLevelAnnouncement();
      activateEpilogue();
      return true;
    }
    return true;
  }
  if (currentAnnouncement.pastorPostRecap) {
    if (currentAnnouncement.pastorPostRecapDelay) {
      const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const lastTick = currentAnnouncement._lastTick || now;
      const dt = Math.max(0, (now - lastTick) / 1000);
      currentAnnouncement._lastTick = now;
      const remaining =
        typeof currentAnnouncement.pastorPostRecapDelayRemaining === "number"
          ? currentAnnouncement.pastorPostRecapDelayRemaining
          : currentAnnouncement.pastorPostRecapDelay;
      const nextRemaining = Math.max(0, remaining - dt);
      currentAnnouncement.pastorPostRecapDelayRemaining = nextRemaining;
      if (nextRemaining > 0) {
        return true;
      }
    }
    if (!currentAnnouncement._revealComplete) return true;
    const buttons =
      typeof window !== "undefined" && window.__announcementButtons?.key === "pastorPostRecap"
        ? window.__announcementButtons.buttons
        : null;
    const handled = handleAnnouncementButtons({
      key: "pastorPostRecap",
      buttons,
      allowSpace: true,
      onActivate: () => {
        dismissCurrentLevelAnnouncement();
        if (!IS_DEV && activeDistrictId === BETA_EPILOGUE_DISTRICT_ID) {
          activateBetaEpilogue();
          return;
        }
        // Activate town victory scene before returning to map
        const mapData = typeof window !== "undefined" ? window.BattlechurchMapData : null;
        const districtName = mapData?.districts?.find((t) => t.id === activeDistrictId)?.name || "This town";
        const score = typeof window !== "undefined" && Number.isFinite(window.lastRunScore) ? window.lastRunScore : 0;
        activateDistrictVictory(districtName, score, activeCampaign);
      },
    });
    if (handled) return true;
    const clickPos = Input.consumeCanvasClick?.();
    if (clickPos) {
      dismissCurrentLevelAnnouncement();
      if (!IS_DEV && activeDistrictId === BETA_EPILOGUE_DISTRICT_ID) {
        activateBetaEpilogue();
        return true;
      }
      // Activate town victory scene before returning to map
      const mapData = typeof window !== "undefined" ? window.BattlechurchMapData : null;
      const districtName = mapData?.districts?.find((t) => t.id === activeDistrictId)?.name || "This town";
      const score = typeof window !== "undefined" && Number.isFinite(window.lastRunScore) ? window.lastRunScore : 0;
      activateDistrictVictory(districtName, score, activeCampaign);
      return true;
    }
    return true;
  }
  if (currentAnnouncement.exteriorShot) {
    if (!currentAnnouncement._musicStarted) {
      currentAnnouncement._musicStarted = true;
      // Keep currently playing map/intro music active during exterior shot.
    }
    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const lastTick = currentAnnouncement._lastTick || now;
    const dt = Math.max(0, (now - lastTick) / 1000);
    currentAnnouncement._lastTick = now;
    currentAnnouncement.timer = Math.max(0, (currentAnnouncement.timer || 0) - dt);
    if (currentAnnouncement.timer <= 0) {
      startDistrictIntroTransition();
      return true;
    }
    const clickPos = Input.consumeCanvasClick?.();
    if (clickPos) {
      startDistrictIntroTransition();
      return true;
    }
    const skipKeys = ["enter", "Enter"];
    if (wasActionJustPressed("pause") || wasActionJustPressed("restart") || skipKeys.some((k) => keysJustPressed.has(k))) {
      skipKeys.forEach((k) => keysJustPressed.delete(k));
      keysJustPressed.delete(" ");
      keysJustPressed.delete("pause");
      keysJustPressed.delete("restart");
      startDistrictIntroTransition();
      return true;
    }
    return true;
  }
  if (currentAnnouncement.battlefieldIntro) {
    const buttons =
      typeof window !== "undefined" && window.__announcementButtons?.key === "chapterBreak"
        ? window.__announcementButtons.buttons
      : null;
    const handled = handleAnnouncementButtons({
      key: "chapterBreak",
      buttons,
      allowSpace: true,
      onActivate: () => {
        startDistrictIntroTransition();
        if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
          window.playMenuAdvanceSfx(0.55);
        }
      },
    });
    if (handled) return true;
  }
  if (wasActionJustPressed("pause") || wasActionJustPressed("restart")) {
    if (currentAnnouncement.battlefieldIntro) {
      startDistrictIntroTransition();
    } else {
      dismissCurrentLevelAnnouncement();
    }
    if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
      window.playMenuAdvanceSfx(0.55);
    }
    keysJustPressed.delete(" ");
  }
  return true;
}

function updateCongregationStage(dt, levelStatus) {
  let stage = levelStatus?.stage;
  let congregationStageActive = stage === "levelIntro";
  if (!congregationStageActive) return { updated: false, levelStatus };
  if (isDevMeleeArenaActive() && typeof levelManager?.advanceFromCongregation === "function") {
    levelManager.advanceFromCongregation();
    levelStatus = levelManager?.getStatus ? levelManager.getStatus() : levelStatus;
    return { updated: true, levelStatus };
  }
  if (!mapAmbientFadeQueued && typeof window !== "undefined" && window.MapScreen?.stopAmbient) {
    mapAmbientFadeQueued = true;
    window.MapScreen.stopAmbient({ fade: true });
  }
  const congregationSpiritRealmActive = Boolean(
    typeof window !== "undefined" && window.__congregationSpiritRealmActive === true,
  );
  const congregationMonsterAmbientBaseVolume = 0.45;
  const updateCongregationMonsterAmbientMix = (rawVolume) => {
    const effective = Math.max(0, Math.min(1, getEffectiveSfxVolume(rawVolume)));
    for (const audio of enemySpawnSfxPool) {
      if (!audio || audio.paused || audio.ended) continue;
      const src = String(audio.src || "");
      const isCongregationAmbient = CONGREGATION_MONSTER_AMBIENT_SRCS.some((entry) => src.includes(entry));
      if (!isCongregationAmbient) continue;
      audio.volume = effective;
    }
  };

  const buttons =
    typeof window !== "undefined" && window.__announcementButtons?.key === "congregation"
      ? window.__announcementButtons.buttons
      : null;
  const handled = handleAnnouncementButtons({
    key: "congregation",
    buttons,
    allowSpace: true,
    onActivate: (button) => {
      if (button?.key === "tutorial") {
        requestTutorialArenaLaunch("congregation");
        return;
      }
      if (typeof levelManager?.advanceFromCongregation !== "function") return;
      const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      if (pendingDistrictIntroStart && now - districtIntroDismissedAt < 300) {
        Input.consumeCanvasClick?.();
        return;
      }
      if (pendingDistrictIntroStart) {
        pendingDistrictIntroStart = false;
        suppressInitialAnnouncements = false;
      }
      // Clear any pending prayer bomb input to prevent accidental activation
      if (typeof Input !== "undefined" && "prayerBombClickQueued" in Input) {
        Input.prayerBombClickQueued = false;
      }
      if (player) { player.prayerCharge = 0; player.prayerHoldLocked = false; }
      if (typeof window !== "undefined") window.__congregationTutorialActive = false;
      clearCongregationSpeechBubbles();
      stopCongregationMusic();
      levelManager.advanceFromCongregation();
      playCongregationFightSfx(0.65);
      levelStatus = levelManager?.getStatus ? levelManager.getStatus() : null;
      stage = levelStatus?.stage;
    },
  });
  if (handled) return { updated: true, levelStatus };
  if (!powerUpsClearedForCongregation) {
    clearAllPowerUps();
    powerUpsClearedForCongregation = true;
  }
  if (typeof window !== "undefined") window.__congregationTutorialActive = false;
  const activeWelcomeLines = getCongregationIntroLinesForCampaign(activeCampaign)
    .filter((line) => typeof line === "string" && line.trim());
  const welcomeHintLimit = activeWelcomeLines.length;
  if (!congregationGreetingShown) {
    congregationGreetingShown = true;
    congregationWelcomeTimer = 0.0;
    congregationMonsterAmbientTimer = 0.6 + Math.random() * 0.9;
  }
  congregationMonsterAmbientTimer = Math.max(0, congregationMonsterAmbientTimer - dt);
  if (congregationMonsterAmbientTimer <= 0) {
    const src =
      CONGREGATION_MONSTER_AMBIENT_SRCS[
        Math.floor(Math.random() * CONGREGATION_MONSTER_AMBIENT_SRCS.length)
      ] || CONGREGATION_MONSTER_AMBIENT_SRCS[0];
    const spawnVolume = congregationSpiritRealmActive ? congregationMonsterAmbientBaseVolume : 0;
    playPooledSfx(enemySpawnSfxPool, src, ENEMY_SPAWN_SFX_POOL_SIZE, {
      volume: spawnVolume,
      allowSilentStart: true,
    });
    congregationMonsterAmbientTimer = 0.6 + Math.random() * 0.9;
  }
  // Keep growls running continuously and only gate audibility by spirit-realm state.
  updateCongregationMonsterAmbientMix(
    congregationSpiritRealmActive ? congregationMonsterAmbientBaseVolume : 0,
  );
  congregationWelcomeTimer -= dt;
  if (congregationWelcomeTimer <= 0 && congregationGreetingCount < welcomeHintLimit && activeWelcomeLines.length && congregationMembers.length) {
    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    // Clear stale refs so expired bubbles don't block teaser eligibility forever.
    congregationMembers.forEach((member) => {
      if (!member?.dialogueBubble) return;
      const bubbleLife = Number(member.dialogueBubble.life || 0);
      if (!(bubbleLife > 0)) {
        member.dialogueBubble = null;
      }
    });
    const maxConcurrentSpeakers = Math.max(
      1,
      Math.floor(Number(CONGREGATION_TEASER_DIALOGUE.maxConcurrentSpeakers) || 2),
    );
    const activeSpeakers = congregationMembers.filter(
      (m) => m && m.dialogueBubble && Number((m.dialogueBubble.life || 0)) > 0,
    ).length;
    if (activeSpeakers >= maxConcurrentSpeakers) {
      const minIntervalSec = Math.max(0.6, Number(CONGREGATION_TEASER_DIALOGUE.minIntervalSec) || 2.8);
      const maxIntervalSec = Math.max(minIntervalSec, Number(CONGREGATION_TEASER_DIALOGUE.maxIntervalSec) || 4.2);
      congregationWelcomeTimer = minIntervalSec + Math.random() * Math.max(0, maxIntervalSec - minIntervalSec);
    } else {
      const available = congregationMembers.filter(
        (m) => m && (!Number.isFinite(m.dialogueCooldownUntil) || now >= m.dialogueCooldownUntil) && !m.dialogueBubble
      );
      if (available.length) {
        const member = available[Math.floor(Math.random() * available.length)];
        const line = activeWelcomeLines[congregationGreetingCount % activeWelcomeLines.length];
        if (member.dialogueBubble) {
          member.dialogueBubble.life = 0;
          member.dialogueBubble = null;
        }
        const bubble = addFloatingTextAt(
          member.x,
          member.y - member.radius - 20,
          line,
          UI_COLOR.speechBubbleText,
          {
            speechBubble: true,
            vy: 0,
            life: Math.max(1.2, Number(CONGREGATION_TEASER_DIALOGUE.bubbleLifeSec) || 3.9),
            fadeDelay: Math.max(0.8, Number(CONGREGATION_TEASER_DIALOGUE.bubbleFadeDelaySec) || 2.8),
            entity: member,
            offsetY: -member.radius - 20,
            bubbleTheme: "npc",
          }
        );
        member.dialogueBubble = bubble || null;
        member.dialogueCooldownUntil = now + CONGREGATION_DIALOGUE_COOLDOWN_MS;
        congregationGreetingCount += 1;
      }
    }
    const minIntervalSec = Math.max(0.6, Number(CONGREGATION_TEASER_DIALOGUE.minIntervalSec) || 2.8);
    const maxIntervalSec = Math.max(minIntervalSec, Number(CONGREGATION_TEASER_DIALOGUE.maxIntervalSec) || 4.2);
    congregationWelcomeTimer = minIntervalSec + Math.random() * Math.max(0, maxIntervalSec - minIntervalSec);
  }
  updateCongregationMembers(dt);
  resolveCongregationMemberCollisions();
  updatePlayerDuringCongregation(dt);
  resolveCongregationCollisions();

  if (wasActionJustPressed("pause") || wasActionJustPressed("restart")) {
    try {
      const status = levelManager?.getStatus ? levelManager.getStatus() : null;
      if (status?.stage === 'briefing' && typeof levelManager.advanceFromBriefing === 'function') {
        levelManager.advanceFromBriefing();
        if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
          window.playMenuAdvanceSfx(0.55);
        }
        paused = false;
        keysJustPressed.delete(' ');
        levelStatus = levelManager?.getStatus ? levelManager.getStatus() : null;
        stage = levelStatus?.stage;
      } else if (wasActionJustPressed("pause")) {
        const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
        if (pendingDistrictIntroStart && now - districtIntroDismissedAt < 300) {
          keysJustPressed.delete(" ");
          keysJustPressed.delete("pause");
          keysJustPressed.delete("restart");
          return { updated: true, levelStatus };
        }
        if (pendingDistrictIntroStart) {
          pendingDistrictIntroStart = false;
          suppressInitialAnnouncements = false;
        }
        // Clear any pending prayer bomb input to prevent accidental activation
        if (typeof Input !== "undefined" && "prayerBombClickQueued" in Input) {
          Input.prayerBombClickQueued = false;
        }
        if (player) { player.prayerCharge = 0; player.prayerHoldLocked = false; }
        if (typeof window !== "undefined") window.__congregationTutorialActive = false;
        clearCongregationSpeechBubbles();
        levelManager?.advanceFromCongregation?.();
        playCongregationFightSfx(0.65);
        keysJustPressed.delete(" ");
        levelStatus = levelManager?.getStatus ? levelManager.getStatus() : null;
        stage = levelStatus?.stage;
      }
    } catch (e) {}
  }
  congregationStageActive = stage === "levelIntro";
  if (!congregationStageActive) {
    powerUpsClearedForCongregation = false;
    congregationGreetingShown = false;
    congregationWelcomeTimer = 0;
    congregationGreetingCount = 0;
    mapAmbientFadeQueued = false;
    congregationTutorialPrayerInit = false;
    congregationMonsterAmbientTimer = 0;
    updateCongregationMonsterAmbientMix(0);
    if (typeof window !== "undefined") window.__congregationTutorialActive = false;
  }
  return { updated: true, levelStatus };
}

function updateCameraAndVisualEffects(dt) {
  updateBossLightningAtmosphere(dt);
  if (cameraShakeTimer > 0) {
    cameraShakeTimer = Math.max(0, cameraShakeTimer - dt);
  }

  try {
    if (devTools.disableCameraScroll) {
      cameraOffsetX = 0;
    } else {
      const desired = player.x - canvas.width / 2;
      const clamped = Math.max(-CAMERA_SCROLL_LIMIT, Math.min(CAMERA_SCROLL_LIMIT, desired));
      cameraOffsetX += (clamped - cameraOffsetX) * Math.min(1, dt * 8);
    }
    backgroundPan.mid = backgroundPan.mid || { x: 0 };
    backgroundPan.far = backgroundPan.far || { x: 0 };
    backgroundPan.mid.x = cameraOffsetX * 0.45;
    backgroundPan.far.x = cameraOffsetX * 0.18;
  } catch (e) {}

  if (hitFreezeTimer > 0) {
    hitFreezeTimer = Math.max(0, hitFreezeTimer - dt);
  }

  hpFlashTimer = Math.max(0, hpFlashTimer - dt);
  damageHitFlash = Math.max(0, damageHitFlash - dt);
  heroRescueCooldown = Math.max(0, heroRescueCooldown - dt);
  prayerBombScreenFadeTimer = Math.max(0, prayerBombScreenFadeTimer - dt);
  smiteBombFlashTimer = Math.max(0, smiteBombFlashTimer - dt);
}

function handlePauseMenu() {
  if (typeof window !== "undefined" && window.PlayingInstructions?.state?.open) {
    const SCROLL_SPEED = 180;
    if (isActionActive("up")) window.PlayingInstructions.scrollBy(-SCROLL_SPEED * (1 / 60));
    if (isActionActive("down")) window.PlayingInstructions.scrollBy(SCROLL_SPEED * (1 / 60));
    const floorPicker = window.BattlechurchDevArenaFloorPicker;
    if (floorPicker) {
      if (keysJustPressed.has("ArrowLeft") || keysJustPressed.has("a") || keysJustPressed.has("A")) {
        floorPicker.cycle(-1);
        keysJustPressed.delete("ArrowLeft");
        keysJustPressed.delete("a");
        keysJustPressed.delete("A");
      } else if (keysJustPressed.has("ArrowRight") || keysJustPressed.has("d") || keysJustPressed.has("D")) {
        floorPicker.cycle(1);
        keysJustPressed.delete("ArrowRight");
        keysJustPressed.delete("d");
        keysJustPressed.delete("D");
      }
    }
    if (keysJustPressed.has("Escape") || keysJustPressed.has("escape") || keysJustPressed.has(" ")) {
      window.PlayingInstructions.close();
      keysJustPressed.delete("Escape");
      keysJustPressed.delete("escape");
      keysJustPressed.delete(" ");
    }
    return true;
  }
  if (typeof window !== "undefined" && window.MovesList?.isOpen) {
    if (keysJustPressed.has("Escape") || keysJustPressed.has("escape") || keysJustPressed.has(" ")) {
      window.MovesList.isOpen = false;
      keysJustPressed.delete("Escape");
      keysJustPressed.delete("escape");
      keysJustPressed.delete(" ");
    }
    return true;
  }
  if (window.DialogOverlay?.consumeAction?.() || window.UpgradeScreen?.consumeAction?.()) {
    return true;
  }
  const overlayActive = Boolean(
    window.DialogOverlay?.isVisible?.() || window.UpgradeScreen?.isVisible?.(),
  );
  if (overlayActive) {
    keysJustPressed.delete(" ");
  }
  const _pauseBlockStage = levelManager?.getStatus?.()?.stage;
  if (!overlayActive && !paused && wasActionJustPressed("pause") && _pauseBlockStage !== "congregationToTeaser") {
    paused = true;
    if (!gameOver) {
      window.isPauseOverlayActive = true;
      pauseRestartConfirmActive = false;
      window.__announcementFocus = { key: "pause", index: 0 };
      window.__pauseIgnoreInitialHover = true;
      // Pick a random tip each time pause opens
      if (Array.isArray(window.BattlechurchTips) && window.BattlechurchTips.length > 0) {
        window._pauseTipIndex = Math.floor(Math.random() * window.BattlechurchTips.length);
      }
      // Prevent the same Space press that opened pause from auto-confirming a menu action.
      window.__battlechurchSuppressMenuConfirmUntilRelease = true;
      if (typeof window !== "undefined" && typeof window.pauseAllMusic === "function") {
        window.pauseAllMusic();
      }
    }
  }
  if (paused && !gameOver) {
    const buttons =
      typeof window !== "undefined" && window.__announcementButtons?.key === "pause"
        ? window.__announcementButtons.buttons
        : null;
    const handled = handleAnnouncementButtons({
      key: "pause",
      buttons,
      allowSpace: true,
      onActivate: (button) => {
        if (button.key === "tipPrev" || button.key === "tipNext") {
          const tips = Array.isArray(window.BattlechurchTips) ? window.BattlechurchTips : [];
          if (tips.length > 0) {
            const current = typeof window._pauseTipIndex === "number" ? window._pauseTipIndex : 0;
            const delta = button.key === "tipNext" ? 1 : -1;
            window._pauseTipIndex = ((current + delta) % tips.length + tips.length) % tips.length;
          }
          return;
        }
        if (String(button.key || "").toLowerCase() === "howtoplay") {
          pauseRestartConfirmActive = false;
          requestTutorialArenaLaunch("pause");
          return;
        }
        if (button.key === "movesList") {
          pauseRestartConfirmActive = false;
          if (typeof window !== "undefined" && window.MovesList) {
            window.MovesList.isOpen = true;
          }
          return;
        }
        if (button.key === "settings") {
          pauseRestartConfirmActive = false;
          showSettingsOverlay({ source: "pause" });
          return;
        }
        pauseRestartConfirmActive = false;
        resumeFromPause();
      },
    });
    if (handled) return true;
  }
  return false;
}

function updatePlayer(dt, deathFreezeActive, playerUpdatedDuringCongregation) {
  const playerDt = consumeEntityMeleeHitstopDt(player, dt);
  window.__battlechurchPlayerMeleeHitstopActive = Boolean(player && playerDt <= 0 && dt > 0);

  // Suppress prayer bomb BEFORE player.update consumes it, for combos that intercept C input.
  if (window._meleeAttackState && player && typeof Input !== "undefined") {
    const _ms = window._meleeAttackState;
    const nowPre = typeof performance !== "undefined" ? performance.now() : Date.now();
    const comboWinMs = (typeof MELEE_DOUBLE_TAP_WINDOW === "number" ? MELEE_DOUBLE_TAP_WINDOW : 0.18) * 1000;

    // A+C super: arm when both meters are simultaneously full with enough prayer
    const prayerSuperCost = (player.prayerChargeRequired || 6000) / 3;
    const bothFull =
      _ms.isCharging &&
      _ms.buttonDown &&
      _ms.chargeTimer >= (_ms.holdTime || 0) &&
      player.prayerHoldLocked &&
      (player.prayerCharge || 0) >= prayerSuperCost;
    if (bothFull) _ms.acSuperArmed = true;

    // A+B Blitz: arm when both A and B charge meters are simultaneously full
    const abBothFull =
      _ms.isCharging &&
      _ms.buttonDown &&
      _ms.chargeTimer >= (_ms.holdTime || 0) &&
      _ms.spinButtonDown &&
      _ms.spinCharging &&
      _ms.spinChargeTimer >= (_ms.spinHoldTime || 0);
    const cHeldForAbc = keysPressed.has("ArrowRight");
    if (abBothFull && !cHeldForAbc) _ms.abSuperArmed = true;

    // C→A combo: C was pressed recently and A is being pressed this frame
    const cLastPressed = (_ms.lastComboTimes && _ms.lastComboTimes.C) || 0;
    const cRecentForCombo = cLastPressed > 0 && (nowPre - cLastPressed) <= comboWinMs;
    const aJustPressedNow = keysJustPressed.has("ArrowLeft") || keysJustPressed.has(" ");
    const prayerStrikeBlocking = cRecentForCombo && aJustPressedNow &&
      (player.prayerCharge || 0) >= (player.prayerChargeRequired || 6000) / 12;

    // Suppress prayer bomb whenever either intercept is active, or B is charging (holdB+holdC teleport)
    const bChargingSuppressBomb = Boolean(
      ((_ms.spinButtonDown || _ms.spinCharging) && keysPressed.has("ArrowRight")) ||
      _ms.bcTeleportArmed ||
      (_ms.bcTeleportBlockTimer || 0) > 0 ||
      (_ms.cBHolyDashBlockTimer || 0) > 0
    );
    const acPostReleaseBlocking = (_ms.acSuperPrayerBombBlockTimer || 0) > 0;
    if (_ms.acSuperArmed || prayerStrikeBlocking || acPostReleaseBlocking || bChargingSuppressBomb) {
      Input.prayerBombClickQueued = false;
    }
    // Cancel any pending congregation tap whenever a C+A or C+B combo is intercepting C.
    if ((_ms.acSuperArmed || prayerStrikeBlocking || acPostReleaseBlocking) && typeof cancelCongregationTap === "function") {
      cancelCongregationTap();
    }
  }

  if (playerUpdatedDuringCongregation) {
    updateAimAssist();
    return;
  }
  if (!deathFreezeActive) {
    updateAimFromKeyboard();
    updateAimAssist();

    if (keysJustPressed.has("ArrowDown")) {
      playerDashState.pendingDashTimer = DASH_COMBO_GRACE;
      playerDashState.pendingDashDir = getDashButtonDirection();
    }
    if (playerDashState.pendingDashTimer > 0) {
        const comboSwipe = window.Input?.peekComboSwipe?.();
        const comboSwipeActive =
          keysPressed.has("ArrowLeft") ||
          (comboSwipe && ((comboSwipe.from === "A" && comboSwipe.to === "B") || (comboSwipe.from === "B" && comboSwipe.to === "A")));
      if (comboSwipeActive) {
        playerDashState.pendingDashTimer = 0;
      } else {
        playerDashState.pendingDashTimer = Math.max(0, playerDashState.pendingDashTimer - playerDt);
        if (playerDashState.pendingDashTimer === 0) {
          if (tryStartDash(playerDashState.pendingDashDir)) {
            keysJustPressed.delete("ArrowDown");
          }
        }
      }
    }

    // Update dash movement
    if (playerDashState.isDashing) {
      updateDashMovement(playerDt);
    }

    player.update(playerDt);
  } else {
    updateAimAssist();
    if (player && player.state === "death") {
      player.animator.update(dt);
    }
  }
}

function shouldFreezeResourceMetersForStage(stageName, hasBlockingConfirmAnnouncement = false) {
  if (hasBlockingConfirmAnnouncement) return true;
  switch (stageName) {
    case "waveIntro":
    case "waveCleared":
    case "allKillBreak":
    case "briefing":
    case "briefingTeaser":
    case "bossIntro":
    case "npcArrival":
    case "levelIntro":
    case "congregationToTeaser":
      return true;
    default:
      return false;
  }
}

function getTormentorFlameOrbitSettings(enemy) {
  const hitboxRect = getEnemyHitboxRect(enemy);
  const hitboxWidth = hitboxRect ? hitboxRect.width : (enemy?.radius || 16) * 2;
  const hitboxHeight = hitboxRect ? hitboxRect.height : (enemy?.radius || 16) * 2;
  const baseRadius = Math.max(12, hitboxWidth * 0.5);
  const topOffset = hitboxRect ? hitboxRect.y - (enemy?.y || 0) : -(hitboxHeight * 0.5);
  return {
    radiusX: baseRadius * 1.08,
    radiusY: baseRadius * 0.24,
    offsetY: topOffset + hitboxHeight * 0.08 + 35,
    lift: Math.max(6, baseRadius * 0.46),
  };
}

function cloneTormentorOrbiterVisualConfig(enemy) {
  const visualConfig = enemy?.orbiterVisual || enemy?.config?.orbiterVisual || null;
  if (!visualConfig || typeof visualConfig !== "object") return null;
  return JSON.parse(JSON.stringify(visualConfig));
}

function getTormentorOrbiterSpawnType(enemy) {
  const configuredType = enemy?.orbiterSpawnType || enemy?.config?.orbiterSpawnType || null;
  return typeof configuredType === "string" && configuredType.trim()
    ? configuredType.trim()
    : "tormentorFlame";
}

function assignTormentorFlameToOrbit(enemy, flame, slotIndex) {
  if (!enemy || !flame) return;
  const seedAngle =
    typeof enemy.tormentorFlameSeedAngle === "number"
      ? enemy.tormentorFlameSeedAngle
      : (enemy.tormentorFlameSeedAngle = Math.random() * Math.PI * 2);
  const angle = seedAngle + (Math.PI * 2 * slotIndex) / TORMENTOR_FLAME_MAX;
  const settings = getTormentorFlameOrbitSettings(enemy);
  flame._orbiting = true;
  flame.orbitParent = enemy;
  flame.orbitSlotIndex = slotIndex;
  flame.orbitAngle = angle;
  flame.orbitSpeed = TORMENTOR_FLAME_ORBIT_SPEED;
  flame.orbitRadiusX = settings.radiusX;
  flame.orbitRadiusY = settings.radiusY;
  flame.orbitOffsetY = settings.offsetY;
  flame.orbitLift = settings.lift;
  flame.orbitScaleMin = TORMENTOR_FLAME_ORBIT_SCALE_MIN;
  flame.orbitScaleMax = TORMENTOR_FLAME_ORBIT_SCALE_MAX;
  flame.tormentorOrbitBound = true;
  flame.tormentorReleasedOnDeath = false;
  flame.orbiterVisual = cloneTormentorOrbiterVisualConfig(enemy);
  flame.spawnOffscreenTimer = 0;
  flame.ignoreEntityCollisions = true;
  flame.ignoreWorldBounds = true;
  flame.touchCooldown = Infinity;
  flame.attackTimer = 0;
  if (flame.animator) {
    flame.state = "walk";
    flame.animator.play("walk");
  }
}

function setTormentorFlameReleasedState(flame, { releasedOnDeath = false } = {}) {
  if (!flame) return;
  flame._orbiting = false;
  flame.orbitParent = null;
  flame.tormentorOrbitBound = false;
  flame.tormentorReleasedOnDeath = releasedOnDeath;
  flame.touchCooldown = 0;
  flame.ignoreEntityCollisions = false;
  flame.ignoreWorldBounds = false;
  flame.attackTimer = 0;
  if (flame.animator) {
    flame.state = "walk";
    flame.animator.play("walk");
    if (flame.config?.scale) {
      flame.animator.scale = flame.config.scale;
    }
  }
}

function releaseTormentorFlame(flame) {
  setTormentorFlameReleasedState(flame, { releasedOnDeath: false });
}

function releaseTormentorFlameOnOwnerDeath(flame) {
  setTormentorFlameReleasedState(flame, { releasedOnDeath: true });
}

if (typeof window !== "undefined") {
  window.releaseTormentorFlameOnOwnerDeath = releaseTormentorFlameOnOwnerDeath;
}

function launchTormentorFlame(flame, owner, target) {
  if (!flame) return;
  releaseTormentorFlame(flame);
  const originX = Number.isFinite(owner?.x) ? owner.x : flame.x;
  const originY = Number.isFinite(owner?.y) ? owner.y : flame.y;
  flame.x = originX;
  flame.y = originY;
  let dirX = 0;
  let dirY = 1;
  if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    dirX = target.x - originX;
    dirY = target.y - originY;
  } else if (Number.isFinite(owner?.facingX) || Number.isFinite(owner?.facingY)) {
    dirX = owner?.facingX || 0;
    dirY = owner?.facingY || 1;
  }
  const dir =
    typeof normalizeVector === "function"
      ? normalizeVector(dirX, dirY)
      : (() => {
          const length = Math.hypot(dirX, dirY) || 1;
          return { x: dirX / length, y: dirY / length };
        })();
  const vx = dir.x * TORMENTOR_FLAME_THROW_SPEED;
  const vy = dir.y * TORMENTOR_FLAME_THROW_SPEED;
  flame.scatterVx = vx;
  flame.scatterVy = vy;
  flame.scatterTimer = Math.max(flame.scatterTimer || 0, TORMENTOR_FLAME_THROW_DURATION);
  flame.scatterDuration = Math.max(
    flame.scatterDuration || 0,
    TORMENTOR_FLAME_THROW_DURATION,
  );
  flame.knockbackVx = vx;
  flame.knockbackVy = vy;
  flame.knockbackTimer = Math.max(
    flame.knockbackTimer || 0,
    TORMENTOR_FLAME_THROW_DURATION,
  );
  flame.knockbackDuration = Math.max(
    flame.knockbackDuration || 0,
    TORMENTOR_FLAME_THROW_DURATION,
  );
  flame.touchCooldown = Math.max(
    flame.touchCooldown || 0,
    TORMENTOR_FLAME_THROW_TOUCH_DELAY,
  );
  if (typeof flame.updateFacing === "function") {
    flame.updateFacing(dir.x, dir.y);
  }
}

function launchNextTormentorFlame(enemy, target) {
  if (!enemy || !Array.isArray(enemy.tormentorFlameSlots) || !enemy.tormentorFlameSlots.length) {
    return false;
  }
  const slots = enemy.tormentorFlameSlots;
  const startIndex = enemy.tormentorFlameLaunchIndex || 0;
  for (let offset = 0; offset < slots.length; offset += 1) {
    const idx = (startIndex + offset) % slots.length;
    const flame = slots[idx];
    if (flame && flame._orbiting && flame.orbitParent === enemy) {
      launchTormentorFlame(flame, enemy, target);
      enemy.tormentorFlameLaunchIndex = (idx + 1) % slots.length;
      slots[idx] = null;
      return true;
    }
  }
  return false;
}

function updateTormentorFlames(enemy, dt) {
  if (!enemy || enemy.dead || enemy.state === "death") return;
  if (!enemy.tormentorFlameSlots) {
    enemy.tormentorFlameSlots = new Array(TORMENTOR_FLAME_MAX).fill(null);
    enemy.tormentorFlameRespawnTimer = TORMENTOR_FLAME_RESPAWN_INTERVAL;
    enemy.tormentorFlameLaunchIndex = 0;
    const orbiterSpawnType = getTormentorOrbiterSpawnType(enemy);
    for (let i = 0; i < TORMENTOR_FLAME_MAX; i += 1) {
      const flame = spawnEnemyOfType(
        orbiterSpawnType,
        { x: enemy.x, y: enemy.y },
        { applyCameraShake: false, skipSpawnEffects: true },
      );
      if (!flame) continue;
      assignTormentorFlameToOrbit(enemy, flame, i);
      enemy.tormentorFlameSlots[i] = flame;
    }
  }

  for (let i = 0; i < enemy.tormentorFlameSlots.length; i += 1) {
    const flame = enemy.tormentorFlameSlots[i];
    if (!flame || flame.dead || flame.state === "death") {
      enemy.tormentorFlameSlots[i] = null;
      continue;
    }
    if (!flame._orbiting || flame.orbitParent !== enemy) {
      enemy.tormentorFlameSlots[i] = null;
    }
  }

  enemy.tormentorFlameRespawnTimer = Math.max(
    0,
    (enemy.tormentorFlameRespawnTimer || 0) - dt,
  );
  if (enemy.tormentorFlameRespawnTimer <= 0) {
    const emptyIndex = enemy.tormentorFlameSlots.findIndex((slot) => !slot);
    if (emptyIndex !== -1) {
      const orbiterSpawnType = getTormentorOrbiterSpawnType(enemy);
      const flame = spawnEnemyOfType(
        orbiterSpawnType,
        { x: enemy.x, y: enemy.y },
        { applyCameraShake: false, skipSpawnEffects: true },
      );
      if (flame) {
        assignTormentorFlameToOrbit(enemy, flame, emptyIndex);
        enemy.tormentorFlameSlots[emptyIndex] = flame;
      }
    }
    enemy.tormentorFlameRespawnTimer = TORMENTOR_FLAME_RESPAWN_INTERVAL;
  }

  const hasOrbitFlames = enemy.tormentorFlameSlots.some(
    (flame) => flame && flame._orbiting && flame.orbitParent === enemy,
  );
  if (
    hasOrbitFlames &&
    enemy.attackTimer <= 0 &&
    enemy.state !== "hurt" &&
    enemy.state !== "attack"
  ) {
    const target = typeof enemy.acquireTarget === "function" ? enemy.acquireTarget() : null;
    if (target) {
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      const targetRadius = target === player ? (player?.radius || 0) : target.radius || NPC_RADIUS;
      const desiredRange = enemy.desiredRange || enemy.config?.attackRange || 180;
      const rangeBuffer = Math.max(0, targetRadius * 0.5);
      if (distance <= desiredRange * 1.1 + rangeBuffer) {
        enemy.state = "attack";
        enemy.animator?.play("attack", { restart: true, loop: false });
        enemy.attackTimer = enemy.projectileCooldown || enemy.config?.attackCooldown || 1.5;
        launchNextTormentorFlame(enemy, target);
        enemy.tormentorFlameAttackLatch = true;
      }
    }
  }

  if (enemy.state === "attack") {
    if (!enemy.tormentorFlameAttackLatch) {
      const target = typeof enemy.acquireTarget === "function" ? enemy.acquireTarget() : null;
      launchNextTormentorFlame(enemy, target);
      enemy.tormentorFlameAttackLatch = true;
    }
  } else {
    enemy.tormentorFlameAttackLatch = false;
  }
}

function updateEnemiesAndEntities(dt) {
  enemies.forEach((enemy) => {
    const enemyDt = consumeEntityMeleeHitstopDt(enemy, dt);
    enemy.update(enemyDt);
    if (enemy.type === "miniDemonTormentor") {
      updateTormentorFlames(enemy, enemyDt);
    }
    if (enemy._orbiting && enemy.orbitParent) {
      enemy.spawnOffscreenTimer = 0;
      return;
    }
    enemy.spawnOffscreenTimer = Math.max(0, (enemy.spawnOffscreenTimer || 0) - enemyDt);
    if (enemy.spawnOffscreenTimer <= 0) {
      // Do not immediately clamp on the same frame spawn grace ends.
      // Keep the enemy out-of-bounds-capable until it naturally enters
      // the playable arena, then re-enable world bounds.
      const radius = Math.max(enemy.radius || 0, 0);
      const lateralMargin = Math.max(radius, 16);
      const verticalMargin = Math.max(radius, 16);
      const insideArenaX = enemy.x >= lateralMargin && enemy.x <= canvas.width - lateralMargin;
      const insideArenaY =
        enemy.y >= HUD_HEIGHT + verticalMargin && enemy.y <= canvas.height - verticalMargin;
      if (insideArenaX && insideArenaY) {
        enemy.ignoreWorldBounds = false;
        enemy.spawnPushGrace = Math.max(enemy.spawnPushGrace || 0, 0.4);
      } else {
        enemy.ignoreWorldBounds = true;
      }
    }
    enemy.touchCooldown = Math.max(0, (enemy.touchCooldown || 0) - enemyDt);
    if (enemy.spawnOffscreenTimer > 0) {
      return;
    }
    if (enemy.ignoreWorldBounds) {
      return;
    }
    enemy.spawnPushGrace = Math.max(0, (enemy.spawnPushGrace || 0) - enemyDt);
    if (enemyDt <= 0) {
      return;
    }
    applyEnemyTouchDamage(enemy);
    resolveEntityCollisions(enemy, [player], { allowPush: true, overlapScale: 0.6 });
    resolveEntityCollisions(enemy, enemies, { allowPush: true, overlapScale: 0.85 });
    resolveEntityObstacles(enemy);
    clampEntityToBounds(enemy);
  });
}

function processDeadEnemies() {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    if (!enemy.dead) continue;

    if (enemy.type === "miniDemoness" && !enemy.batBurstSpawned) {
      enemy.batBurstSpawned = true;
      const smokeScale = Math.max(0.9, (enemy.radius || 24) / 24);
      if (typeof spawnSmokeEffect === "function") {
        spawnSmokeEffect(enemy.x, enemy.y, smokeScale);
      }
      for (let b = 0; b < BAT_SPAWN_COUNT; b += 1) {
        const angle = (Math.PI * 2 * b) / BAT_SPAWN_COUNT + Math.random() * 0.35;
        const spawnPos = {
          x: enemy.x + Math.cos(angle) * 12,
          y: enemy.y + Math.sin(angle) * 12,
        };
        const bat = spawnEnemyOfType("bat", spawnPos, { applyCameraShake: false });
        if (bat) {
          const speed = (bat.config?.speed || 120) * BAT_SCATTER_SPEED_MULTIPLIER;
          bat.scatterTimer = BAT_SCATTER_DURATION;
          bat.scatterVx = Math.cos(angle) * speed;
          bat.scatterVy = Math.sin(angle) * speed;
        }
      }
    }

    const killedByPrayer = Boolean(enemy.killedByPrayerBomb);
    if (!killedByPrayer && player && typeof player.addPrayerCharge === "function") {
      const enemyHp = Math.max(0, Number(enemy.maxHealth) || Number(enemy.config?.health) || 0);
      const formation = getFormationBonuses();
      const rushBonus = enemy.killedByRush ? 0.10 : 0;
      const churchBonus = enemy.killedByChurchPowerup ? 0.05 : 0;
      const chargeScale = 1 + Math.max(0, Number(formation?.prayerChargeGain) || 0) + rushBonus + churchBonus;
      const chargeAmount = applyPrayerGainClassMultiplier(enemyHp * chargeScale);
      if (chargeAmount > 0) player.addPrayerCharge(chargeAmount);
    }
    if (enemy.killedByPrayerBomb) {
      delete enemy.killedByPrayerBomb;
    }
    if (enemy.killedByRush) {
      delete enemy.killedByRush;
    }
    if (enemy.killedByChurchPowerup) {
      delete enemy.killedByChurchPowerup;
    }

    const skipFaithReward = NPC_FAITH_KILL_REWARD_EXCLUSIONS.has(enemy.type);
    if (!skipFaithReward) {
      try {
        const faithPerNpc =
          typeof devTools?.npcFaithPerEnemy === "number"
            ? devTools.npcFaithPerEnemy
            : NPC_FAITH_PER_ENEMY_KILL;
        if (faithPerNpc && npcs && npcs.length) {
          for (const npc of npcs) {
            if (!npc || !npc.active || npc.departed) continue;
            if (typeof npc.faith === "number") {
              const maxFaith = npc.maxFaith || NPC_MAX_FAITH;
              if (npc.faith <= 0) continue;
              if (npc.faith >= maxFaith) continue;
            }
            npc.receiveFaith(faithPerNpc);
          }
        }
      } catch (e) {}
    }

    lastEnemyDeathPosition = { x: enemy.x, y: enemy.y };
    onTutorialArenaEnemyDefeated(enemy);
    maybeDropGraceFromEnemy(enemy);
    enemies.splice(i, 1);
  }
}

function processProjectileCollisions(dt) {
  projectiles.forEach((projectile) => projectile.update(dt));

  for (const projectile of projectiles) {
    if (projectile.dead) continue;
    if (projectile.visualOnly) continue;

    if (projectile.friendly) {
      // Friendly projectiles hitting enemies
      for (const enemy of enemies) {
        if (enemy.dead || enemy.state === "death") continue;
        if (!isEnemyTargetableForAutoAim(enemy)) continue;
        if (projectile.hitEntities.has(enemy)) continue;
        if (!projectile.hitTest(enemy)) continue;
        projectile.hitEntities.add(enemy);

        if (projectile.type === "wisdom_missle") {
          detonateWisdomMissleProjectile(projectile);
          break;
        }

        if (projectile.type === "faith_cannon") {
          detonateFaithCannonProjectile(projectile, { endOfRange: false });
          break;
        }

        const prevHealth = enemy.health;
        const projectileDamage = projectile.getDamage();
        const damageType =
          projectile.damageType || (projectile.isDivineShot ? "charged" : "projectile");
        const hitX = Number.isFinite(projectile.x) ? projectile.x : enemy.x;
        const hitY = Number.isFinite(projectile.y) ? projectile.y : enemy.y;
        const shouldDeflect = isArmoredProjectileDeflectTarget(enemy, projectile, damageType);
        const meleeAttackState = projectile.isDivineShot ? window._meleeAttackState : null;
        const counterHit = projectile.isDivineShot
          ? getCounterHitResult(enemy, projectileDamage, meleeAttackState)
          : { damage: projectileDamage, damageText: null };
        const npcPowerupWasAlive = !enemy.dead && enemy.state !== "death";
        enemy.takeDamage(counterHit.damage, {
          damageType,
          damageText: counterHit.damageText,
          ignoreProjectileResistance: projectile.ignoreProjectileResistance === true,
        });
        if (
          npcPowerupWasAlive &&
          (enemy.dead || enemy.state === "death") &&
          !projectile.source?.isPlayer &&
          projectile.type !== "arrow"
        ) {
          enemy.killedByChurchPowerup = true;
        }
        if (projectile.source?.isPlayer) {
          registerProjectileComboHit(enemy, counterHit.damage, projectile);
          if (projectile.isDivineShot && meleeAttackState) {
            applyMeleeHitstop(enemy, meleeAttackState, counterHit);
            registerPunishComboDamage(enemy, counterHit.damage, meleeAttackState);
            registerDivineShotComboHit(enemy, meleeAttackState, {
              damage: counterHit.damage,
              isCounterHit: Boolean(counterHit?.isCounterHit),
              isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
            });
            if (npcPowerupWasAlive && (enemy.dead || enemy.state === "death")) {
              registerDivineShotKill(meleeAttackState, enemy);
            }
          }
        }
        if (
          projectile.isDivineShot &&
          !shouldDeflect &&
          !enemy.dead &&
          enemy.state !== "death" &&
          Number.isFinite(enemy.health) &&
          enemy.health > 0
        ) {
          applyEnemyMeleeKnockback(enemy, hitX, hitY, MELEE_DAMAGE_KNOCKBACK);
        }

        if (shouldDeflect) {
          spawnArmoredProjectileDeflect(projectile, enemy, hitX, hitY);
        } else if (
          projectile.type === "arrow" ||
          projectile.type === "fire" ||
          projectile.type === "faith_cannon"
        ) {
          spawnEnemyHitEffect(enemy, hitX, hitY, { damageType });
          const encouragementFaithFeedback =
            projectile.encouragementFaithFeedback ||
            (projectile.friendly && projectile.type === "arrow" && npcHarmonyBuffTimer > 0);
          if (encouragementFaithFeedback) {
            if (typeof playFaithHitSfx === "function") {
              playFaithHitSfx(0.8);
            }
            applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_WEAPON_HIT_SHAKE_MAGNITUDE);
          } else if (projectile.perseveranceFeedback) {
            if (typeof playFaithHitSfx === "function") {
              playFaithHitSfx(0.75);
            }
            applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_WEAPON_HIT_SHAKE_MAGNITUDE);
          }
          if (projectile.scriptureFeedback) {
            triggerScriptureHitFeedback(hitX, hitY, {
              isBoss: false,
              shakeScale: Number.isFinite(projectile.hitShakeMultiplier) ? projectile.hitShakeMultiplier : 1,
            });
          }
        }
        if (enemy.health > 0 && enemy.type !== "tormentorFlame") {
          const puffRadius = Math.max(24, getEnemyHitboxRadius(enemy)) * 0.6;
          const center = getEnemyHitboxCenter(enemy);
          spawnPuffEffect(center.x, center.y, puffRadius);
        }
        if (projectile.lightSpreadShot && projectile.splashRadius > 0 && projectile.splashDamageRatio > 0) {
          const splashDmg = projectile.getDamage() * projectile.splashDamageRatio;
          applyProjectileSplashDamage(projectile, projectile.x, projectile.y, projectile.splashRadius, splashDmg, {
            skipBossImpact: true,
            skipEnemy: enemy,
          });
        }
        projectile.onHit(enemy);
        if (shouldDeflect) projectile.dead = true;
        if (projectile.dead) break;
      }

      if (projectile.dead) continue;

      // Friendly projectiles hitting boss
      if (!projectile.dead && activeBoss && !activeBoss.dead && !activeBoss.defeated) {
        const _multiBoss = projectile.maxBossHits > 1;
        const _canHitBoss = _multiBoss
          ? projectile.bossHitCount < projectile.maxBossHits && projectile.bossHitTimer <= 0
          : !projectile.hitEntities.has(activeBoss);
        if (_canHitBoss && projectile.hitTest(activeBoss)) {
          if (_multiBoss) {
            projectile.bossHitCount += 1;
            projectile.bossHitTimer = projectile.bossHitCooldown;
            if (projectile.bossHitCount >= projectile.maxBossHits) projectile.hitEntities.add(activeBoss);
          } else {
            projectile.hitEntities.add(activeBoss);
          }
          if (projectile.type === "wisdom_missle") {
            detonateWisdomMissleProjectile(projectile);
          } else if (projectile.type === "faith_cannon") {
            detonateFaithCannonProjectile(projectile, { endOfRange: false });
          } else {
            const hitX = Number.isFinite(projectile.x) ? projectile.x : activeBoss.x;
            const hitY = Number.isFinite(projectile.y) ? projectile.y : activeBoss.y;
            const damageType =
              projectile.damageType || (projectile.isDivineShot ? "charged" : "projectile");
            const bossDamage = projectile.getDamage();
            const shouldDeflect = isArmoredProjectileDeflectTarget(activeBoss, projectile, damageType);
            const meleeAttackState = projectile.isDivineShot ? window._meleeAttackState : null;
            const counterHit = projectile.isDivineShot
              ? getCounterHitResult(activeBoss, bossDamage, meleeAttackState)
              : { damage: bossDamage, damageText: null };
            const bossWasAlive = !activeBoss.dead && activeBoss.state !== "death";
            activeBoss.takeDamage(counterHit.damage, {
              hitX,
              hitY,
              damageType,
              skipImpactEffect: true,
              damageText: counterHit.damageText,
              ignoreProjectileResistance: projectile.ignoreProjectileResistance === true,
            });
            if (projectile.source?.isPlayer) {
              registerProjectileComboHit(activeBoss, counterHit.damage, projectile);
              if (projectile.isDivineShot && meleeAttackState) {
                applyMeleeHitstop(activeBoss, meleeAttackState, counterHit);
                registerPunishComboDamage(activeBoss, counterHit.damage, meleeAttackState);
                registerDivineShotComboHit(activeBoss, meleeAttackState, {
                  damage: counterHit.damage,
                  isCounterHit: Boolean(counterHit?.isCounterHit),
                  isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
                });
                if (bossWasAlive && (activeBoss.dead || activeBoss.state === "death")) {
                  registerDivineShotKill(meleeAttackState, activeBoss);
                }
              }
            }
            if (
              projectile.isDivineShot &&
              !shouldDeflect &&
              !activeBoss.dead &&
              !activeBoss.defeated &&
              Number.isFinite(activeBoss.health) &&
              activeBoss.health > 0 &&
              typeof activeBoss.knockbackVx === "number"
            ) {
              applyEnemyMeleeKnockback(activeBoss, hitX, hitY, MELEE_DAMAGE_KNOCKBACK);
            }
            if (shouldDeflect) {
              spawnArmoredProjectileDeflect(projectile, activeBoss, hitX, hitY);
            } else if (
              projectile.type === "arrow" ||
              projectile.type === "fire" ||
              projectile.type === "faith_cannon"
            ) {
              spawnFlashEffect(hitX, hitY);
              const encouragementFaithFeedback =
                projectile.encouragementFaithFeedback ||
                (projectile.friendly && projectile.type === "arrow" && npcHarmonyBuffTimer > 0);
              if (encouragementFaithFeedback) {
                if (typeof playFaithHitSfx === "function") {
                  playFaithHitSfx(0.8);
                }
                applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_WEAPON_HIT_SHAKE_MAGNITUDE);
              } else if (projectile.perseveranceFeedback) {
                if (typeof playFaithHitSfx === "function") {
                  playFaithHitSfx(0.75);
                }
                applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_WEAPON_HIT_SHAKE_MAGNITUDE);
              }
              if (projectile.scriptureFeedback) {
                triggerScriptureHitFeedback(hitX, hitY, {
                  isBoss: true,
                  shakeScale: Number.isFinite(projectile.hitShakeMultiplier) ? projectile.hitShakeMultiplier : 1,
                });
              }
            }
            projectile.onHit(activeBoss);
            if (shouldDeflect) projectile.dead = true;
            if (!projectile.pierce) projectile.dead = true;
          }
        }
      }
    } else {
      if (projectile.collisionDisabled) {
        continue;
      }
      // Hostile projectiles hitting player
      if (player && player.state !== "death" && projectile.hitTest(player)) {
        if (player.invulnerableTimer > 0) {
          projectile.dead = true;
        } else if (player.shieldTimer > 0) {
          projectile.dead = true;
          spawnFlashEffect(player.x, player.y - player.radius / 2);
        } else {
          const damage = Math.max(1, Math.round(projectile.getDamage() || 1));
          player.takeDamage(damage);
          projectile.onHit(player);
          projectile.dead = true;
        }
        continue;
      }

      // Hostile projectiles hitting NPCs
      if (!projectile.dead && npcs.length) {
        for (const npc of npcs) {
          if (projectile.dead) break;
          if (!npc.active || npc.departed) continue;
          if (!projectile.hitTest(npc)) continue;
          if (!projectile.hitEntities.has(npc)) {
            projectile.hitEntities.add(npc);
            const damage = Math.max(1, Math.round(projectile.getDamage() || 1));
            if (typeof npc.sufferAttack === "function") {
              npc.sufferAttack(damage, { sourceType: projectile.source?.type });
            }
            projectile.onHit(npc);
          }
          projectile.dead = true;
        }
      }
    }
  }

  const meleeAttackState = window._meleeAttackState;
  if (player && meleeAttackState) {
    const meleeActive =
      meleeAttackState.swooshTimer > 0 ||
      meleeAttackState.spinTimer > 0 ||
      meleeAttackState.isRushing ||
      meleeAttackState.rushDamageEnabled;
    if (meleeActive) {
      const dirVec =
        (meleeAttackState.isRushing && meleeAttackState.rushDir) ||
        meleeAttackState.swooshDir ||
        window.Input?.lastMovementDirection ||
        { x: 1, y: 0 };
      const len = Math.hypot(dirVec.x, dirVec.y) || 1;
      const normalized = { x: dirVec.x / len, y: dirVec.y / len };
      const swooshAngle = Math.atan2(normalized.y, normalized.x);
      const swooshSpread = Math.PI * 0.35 * MELEE_SWOOSH_ARC_SCALE;
      const meleeDeflectDamage = getPlayerProjectileDeflectDamage(meleeAttackState);
      for (const projectile of projectiles) {
        const bossProjectile = isBossProjectile(projectile);
        if (
          projectile.dead ||
          projectile.visualOnly ||
          (projectile.friendly && !bossProjectile)
        ) continue;
        const dx = projectile.x - player.x;
        const dy = projectile.y - player.y;
        const dist = Math.hypot(dx, dy);
        let projectileDestroyed = false;
        if (dist <= MELEE_CLOSE_RANGE) {
          projectileDestroyed =
            projectile.maxDurability > 0
              ? applyProjectileDurabilityDamage(projectile, meleeDeflectDamage)
              : ((projectile.dead = true), true);
        } else if (meleeAttackState.spinTimer > 0) {
          if (dist <= MELEE_SWING_RANGE) {
            projectileDestroyed =
              projectile.maxDurability > 0
                ? applyProjectileDurabilityDamage(projectile, meleeDeflectDamage)
                : ((projectile.dead = true), true);
          }
        } else if (dist <= MELEE_SWING_RANGE) {
          const enemyAngle = Math.atan2(dy, dx);
          let angleDiff = enemyAngle - swooshAngle;
          while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
          if (Math.abs(angleDiff) <= swooshSpread) {
            projectileDestroyed =
              projectile.maxDurability > 0
                ? applyProjectileDurabilityDamage(projectile, meleeDeflectDamage)
                : ((projectile.dead = true), true);
          }
        }
        if (projectileDestroyed || projectile.dead) {
          if (bossProjectile && projectile.onExpire && !projectile.onExpireTriggered) {
            projectile.onExpireTriggered = true;
            projectile.onExpire(projectile);
          }
          spawnImpactEffect(projectile.x, projectile.y);
          spawnFlashEffect(projectile.x, projectile.y);
        }
      }
    }
  }
}

function processProjectileClashing() {
  const friendlyProjectiles = projectiles.filter(
    (proj) => proj.friendly && !proj.dead && !proj.visualOnly,
  );
  const hostileProjectiles = projectiles.filter(
    (proj) => !proj.friendly && !proj.dead && !proj.visualOnly,
  );

  for (const friendly of friendlyProjectiles) {
    if (friendly.dead) continue;
    for (const hostile of hostileProjectiles) {
      if (hostile.dead) continue;
      if (!projectilesIntersect(friendly, hostile)) continue;

      const friendlyPriority = friendly.priority ?? 0;
      const hostilePriority = hostile.priority ?? 0;
      let friendlyDies = false;
      let hostileDies = false;
      const friendlyFromPlayer = Boolean(friendly.source === player);
      const hostileIsBoss = isBossProjectile(hostile);

      if (friendly.type === "word_of_god") {
        hostileDies = hostile.maxDurability > 0
          ? applyProjectileDurabilityDamage(hostile, friendly.getDamage())
          : true;
        friendlyDies = false;
      } else if (friendly.type === "fire" && friendly.friendly) {
        hostileDies = hostile.maxDurability > 0
          ? applyProjectileDurabilityDamage(hostile, friendly.getDamage())
          : true;
        friendlyDies = false;
      } else if (hostileIsBoss && friendlyFromPlayer) {
        hostileDies = hostile.maxDurability > 0
          ? applyProjectileDurabilityDamage(hostile, friendly.getDamage())
          : false;
        friendlyDies = true;
      } else if (friendlyPriority > hostilePriority) {
        hostileDies = hostile.maxDurability > 0
          ? applyProjectileDurabilityDamage(hostile, friendly.getDamage())
          : true;
      } else if (friendlyPriority < hostilePriority) {
        friendlyDies = true;
      } else {
        friendlyDies = true;
        hostileDies = hostile.maxDurability > 0
          ? applyProjectileDurabilityDamage(hostile, friendly.getDamage())
          : true;
      }
      if (hostileDies && hostile.type === "miniTrident") {
        spawnFlashEffect(hostile.x, hostile.y);
      }

      if (hostileDies) hostile.dead = true;
      if (friendlyDies) friendly.dead = true;

      const hitX = (friendly.x + hostile.x) / 2;
      const hitY = (friendly.y + hostile.y) / 2;
      spawnImpactEffect(hitX, hitY);
      spawnFlashEffect(hitX, hitY);
      if (typeof playEnemyHitSfx === "function") {
        playEnemyHitSfx(0.35);
      }
      break;
    }
  }
}

function cleanupDeadProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    if (projectiles[i].dead) {
      projectiles.splice(i, 1);
    }
  }
}

// ============================================================================
// MELEE ATTACK SYSTEM - Helper Functions
// ============================================================================

// (moved to combat.js)

function handleDevArenaFloorPickerInput() {
  if (typeof window === "undefined") return false;
  const overlayEnabled = Boolean(window.__battlechurchFloorPickerOverlayEnabled);
  if (!isDevMeleeArenaActive() && !overlayEnabled) return false;
  const picker = window.BattlechurchDevArenaFloorPicker;
  if (!picker) return false;

  let changed = false;
  if (keysJustPressed.has("q") || keysJustPressed.has("Q")) {
    picker.cycle(-1);
    keysJustPressed.delete("q");
    keysJustPressed.delete("Q");
    changed = true;
  } else if (keysJustPressed.has("e") || keysJustPressed.has("E")) {
    picker.cycle(1);
    keysJustPressed.delete("e");
    keysJustPressed.delete("E");
    changed = true;
  }

  const click = Input.consumeCanvasClick?.();
  const bounds = window.__devArenaFloorPickerBounds;
  if (click && bounds) {
    const inside =
      click.x >= bounds.x &&
      click.x <= bounds.x + bounds.w &&
      click.y >= bounds.y &&
      click.y <= bounds.y + bounds.h;
    if (inside) {
      if (click.x < bounds.rightZoneX) picker.cycle(-1);
      else picker.cycle(1);
      changed = true;
    }
  }

  return changed;
}

function updateGame(dt) {
  if (typeof window !== "undefined") {
    window.__battlechurchTutorialArenaActive = isTutorialArenaActive();
    window.__battlechurchTutorialLastMove = getTutorialArenaCurrentMoveContext();
    window.onTutorialArenaEnemyKilledInstant = onTutorialArenaEnemyKilledInstant;
  }
  syncDevPlaytestQuickActions();
  if (window.MapScreen?.updateAmbient) {
    window.MapScreen.updateAmbient(dt);
  }
  if (fireOverlay) {
    fireOverlay.update(dt * 1000);
  }
  // Handle title screen even before player/assets are loaded
  if (titleScreenActive) {
    if (musicState.unlocked && !musicState.introStarted && !musicState.introStopped) {
      startIntroMusic();
    }
    if (handleTitleScreen()) {
      return;
    }
  }
  if (mapActive) {
    if (!musicState.introStarted && !musicState.introStopped) {
      startIntroMusic();
    }
    // Map-screen dev shortcuts
    if (keysJustPressed.size && !(typeof window !== "undefined" && window.DialogOverlay?.isVisible?.())) {
      const _mapModifiers = typeof Input !== "undefined" ? Input.modifiers : null;
      const _mapPressed = typeof Input !== "undefined" ? Input.keysPressed : null;
      const _mapShift = Boolean(_mapModifiers?.shift || _mapPressed?.has?.("Shift"));
      if (_mapShift && keysJustPressed.has("t")) {
        if (typeof window !== "undefined" && typeof window.MapScreen?.devAwardNextDistrict === "function") {
          void (async () => {
            const result = await window.MapScreen.devAwardNextDistrict({
              congregationCount: 100,
              campaign: "p1",
              churchPowerupLevels: {},
            });
            if (result?.awardedDistrictName) {
              setDevStatus(`Awarded town: ${result.awardedDistrictName}`, 2.3);
            } else {
              setDevStatus("No eligible town to award", 2.0);
            }
          })();
        }
        keysJustPressed.delete("t");
      }
    }
    if (window.MapScreen) {
      window.MapScreen.update(dt);
    }
    return;
  }
  if (pendingDevMeleeArenaLaunch && player && !titleScreenActive && !mapActive) {
    pendingDevMeleeArenaLaunch = false;
    activateDevMeleeArenaMode();
  }
  if (!isTutorialArenaActive() && pendingTutorialArenaLaunch && player && !titleScreenActive && !mapActive) {
    activateTutorialArenaMode();
  }
  handleDevArenaFloorPickerInput();
  if (handleTutorialArenaButtons()) return;
  if (!player) return;
  if (isDevMeleeArenaActive()) {
    enforceDevMeleeArenaVitals();
    maintainDevArenaImpHorde();
    maintainDevArenaDemonLord();
    maintainDevArenaFireKeeper();
    maintainDevArenaPickups();
    powerUpRespawnTimer = 0;
    powerUpStaggerTimer = 0;
    clearGracePickups();
    projectiles.forEach((projectile) => {
      if (!projectile?.friendly) return;
      if (projectile.type === "divine_shot") return;
      if (projectile.type === "fire") return;
      if (projectile.type === "wisdom_missle") return;
      if (projectile.type === "faith_cannon") return;
      projectile.dead = true;
    });
  }
  if (isTutorialArenaActive()) {
    // Keep objective HUD pinned every frame in tutorial mode.
    updateTutorialArenaHudState();
    // Card steps: Space/Enter (or controller A) continues.
    if (!tutorialArenaState?.pendingStart && tutorialArenaState?.currentObjective?.type === "card") {
      const continuePressed =
        keysJustPressed.has(" ") ||
        keysJustPressed.has("enter") ||
        keysJustPressed.has("Enter");
      if (continuePressed) {
        keysJustPressed.delete(" ");
        keysJustPressed.delete("enter");
        keysJustPressed.delete("Enter");
        stepTutorialArenaObjective(1);
      }
      updateTutorialArenaHudState();
      enforceTutorialArenaVitals();
      return;
    }
    if (tutorialArenaState?.pendingStart) {
      const startPressed =
        keysJustPressed.has(" ") ||
        keysJustPressed.has("enter") ||
        keysJustPressed.has("Enter");
      if (startPressed) {
        keysJustPressed.delete(" ");
        keysJustPressed.delete("enter");
        keysJustPressed.delete("Enter");
        tutorialArenaState.pendingStart = false;
        startTutorialArenaObjective(tutorialArenaState.objectiveIndex || 0);
      }
      updateTutorialArenaHudState();
      enforceTutorialArenaVitals();
      enemies.splice(0, enemies.length);
      projectiles.splice(0, projectiles.length);
      bossHazards.splice(0, bossHazards.length);
      clearGracePickups();
      return;
    }
    updateTutorialArenaMoveObjectiveProgress();
    enforceTutorialArenaVitals();
    maintainTutorialArenaWaveSpawns();
    // Re-apply after objective progression/spawn updates in the same frame.
    updateTutorialArenaHudState();
    const completionAt = Number(tutorialArenaState?.completionQueuedAt) || 0;
    if (completionAt > 0) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now >= completionAt) {
        startTutorialArenaObjective((tutorialArenaState?.objectiveIndex || 0) + 1);
      }
    }
    const finishedReturnAt = Number(tutorialArenaState?.finishedReturnAt) || 0;
    if (finishedReturnAt > 0) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now >= finishedReturnAt) {
        exitTutorialArenaToGame();
        return;
      }
    }
  }
  handleDeveloperHotkeys();

  updateDebugSystems(dt);

  if (ashOverlay) {
    ashOverlay.update(dt * 1000);
  }

  updateCongregationOverlay(dt);

  if (epilogueActive) {
    // Toggle pause with spacebar (before scrolling is complete)
    if (!epilogueScroll.showButton && keysJustPressed.has(" ")) {
      epilogueScroll.paused = !epilogueScroll.paused;
      keysJustPressed.delete(" ");
    }
    // Update epilogue/credits scroll
    if (epilogueScroll.phase !== "done" && !epilogueScroll.paused) {
      // Handle start delay
      if (epilogueScroll.delayTimer < epilogueScroll.startDelay) {
        epilogueScroll.delayTimer += dt;
      } else {
        // Scroll the content (hold S to fast-forward)
        const fastForward =
          (typeof Input !== "undefined" && Input.keysPressed?.has?.("s")) || false;
        const speedMultiplier = fastForward ? 3 : 1;
        epilogueScroll.scrollY += epilogueScroll.scrollSpeed * dt * speedMultiplier;
      }
    }
    // Allow restart/continue when button is shown
    if (epilogueScroll.showButton && wasActionJustPressed("restart")) {
      restartGame();
    }
    return;
  }

  // Town Victory scene update (mini-epilogue after completing a town)
  if (districtVictoryActive) {
    // Keep grace pickups alive/visible behind the victory card flow.
    updateGracePickups(dt);
    updateGraceHudFlyEffects(dt);
    updateGraceSpendFlyEffects(dt);
    // Allow continue when button is shown (check FIRST before consuming keys)
    if (districtVictoryScroll.showButton) {
      const spacePressed =
        keysJustPressed.has(" ") || keysJustPressed.has("enter") || keysJustPressed.has("Enter");
      const actionPressed = wasActionJustPressed("restart");
      const clickPos = Input.consumeCanvasClick?.();
      if (spacePressed || actionPressed || clickPos) {
        keysJustPressed.delete(" ");
        keysJustPressed.delete("enter");
        keysJustPressed.delete("Enter");
        districtVictoryActive = false;
        stopRecapMusic();
        returnToMapWithNextTown();
        return;
      }
    } else {
      // Update scroll (only when button not yet shown)
      // Handle start delay
      if (districtVictoryScroll.delayTimer < districtVictoryScroll.startDelay) {
        districtVictoryScroll.delayTimer += dt;
      } else {
        // Scroll the content (hold spacebar to fast-forward - no skipping)
        const fastForward =
          (typeof Input !== "undefined" && Input.keysPressed?.has?.(" ")) || false;
        const speedMultiplier = fastForward ? 3 : 1;
        districtVictoryScroll.scrollY += districtVictoryScroll.scrollSpeed * dt * speedMultiplier;
      }
    }
    return;
  }

  updatePrayerBombFireRain(dt);

  if (updateDistrictIntroTransition(dt)) {
    return;
  }

  updateDeathFadeEffects(dt);
  updateDeathBellAudio(dt);
  npcHarmonyBuffTimer = Math.max(0, npcHarmonyBuffTimer - dt);
  if (!paused && weaponPickupAnnouncement.timer > 0) {
    weaponPickupAnnouncement.timer = Math.max(0, weaponPickupAnnouncement.timer - dt);
  }

  if (PastorUpgradeScreen.isVisible()) {
    PastorUpgradeScreen.update();
    return;
  }

  if (DenominationScreen.isVisible()) {
    DenominationScreen.update();
    return;
  }

  if (window.UpgradeScreen?.isVisible?.() && typeof Input?.consumeCanvasClick === "function") {
    const clickPos = Input.consumeCanvasClick();
    if (clickPos && typeof window.UpgradeScreen.handleCanvasClick === "function") {
      window.UpgradeScreen.handleCanvasClick(clickPos);
    }
    if (typeof window.UpgradeScreen.update === "function") {
      window.UpgradeScreen.update(dt);
    }
    updateGraceHudFlyEffects(dt);
    updateGraceSpendFlyEffects(dt);
  }

  if (checkDialogOverlays()) {
    return;
  }

  updatePostDeathSequence(dt);
  updateFadeEffects(dt);

  if (handleChapterBreak()) {
    return;
  }

  const deathFreezeActive = postDeathSequenceActive;
  if (deathFreezeActive) {
    keysJustPressed.clear();
  }

  window.postDeathSequenceActive = postDeathSequenceActive;

  let levelStatus = levelManager?.getStatus ? levelManager.getStatus() : null;
  updateSpeedrunTimer(levelStatus);
  updateMusicState(levelStatus);
  if (levelStatus?.stage !== "graceRush" && (graceRushBlackout || graceRushFadeHold)) {
    graceRushBlackout = false;
    graceRushFadeHold = false;
    graceRushFadeTimer = 0;
    graceRushFadeDuration = 0;
    graceRushFadeAlpha = 0;
    graceRushFadeReleaseTimer = 0;
    graceRushHardBlackoutTimer = 0;
  }
  if (
    levelStatus?.stage === "graceRush" &&
    keysJustPressed.has(" ") &&
    (graceRushState.elapsed || 0) >= (graceRushState.skipLockDuration || 0)
  ) {
    keysJustPressed.delete(" ");
    if (levelManager?.skipGraceRush) levelManager.skipGraceRush();
    graceRushState.active = false;
    graceRushState.timer = 0;
    graceRushState.elapsed = 0;
    graceRushState.spawnTimer = 0;
    graceRushState.centerX = null;
    graceRushState.centerY = null;
    resetGraceRushNpcFarewellState({ resetAlpha: false });
    graceRushFadeTimer = 0;
    graceRushFadeDuration = 0;
    graceRushFadeAlpha = 0;
    graceRushFadeHold = false;
    graceRushFadeReleaseTimer = 0;
    graceRushBlackout = false;
    graceRushHardBlackoutTimer = 0;
  }
  const _bossVictoryStage = levelStatus?.stage === "bossVictoryCelebrate" || levelStatus?.stage === "bossBonusTransition";
  if (_bossVictoryStage) {
    bossVictoryElapsed += dt;
  } else {
    bossVictoryElapsed = 0;
  }
  if (_bossVictoryStage && keysJustPressed.has(" ") && bossVictoryElapsed >= 1.5) {
    keysJustPressed.delete(" ");
    bossBonusTransitionFadeTimer = 0;
    bossBonusTransitionFadeDuration = 0;
    bossBonusTransitionFadeAlpha = 0;
    bossVictoryElapsed = 0;
    if (levelManager?.skipBossVictory) levelManager.skipBossVictory();
  }
  updateGraceRushFadeRelease(dt);
  if (!isDevMeleeArenaActive()) {
    updateLevelManagement();
  }

  if (updatePlayerRespawn(dt)) {
    // Player respawn is in progress, continue with rest of update
  }

  if (handleTitleScreen()) {
    return;
  }

  if (handleVisitorSessionSkip()) {
    return;
  }

  if (handleVisitorSummary()) {
    return;
  }

  if (handleVisitorIntro()) {
    return;
  }

  if (
    levelAnnouncements.length &&
    levelAnnouncements[0]?.requiresConfirm &&
    Array.isArray(npcs) &&
    npcs.length
  ) {
    const previewStage = levelStatus?.stage;
    const freezeNpcPreview =
      previewStage === "battleIntro" ||
      previewStage === "bossIntro" ||
      previewStage === "briefingTeaser";
    if (!freezeNpcPreview) {
      updateCozyNpcs(dt, { previewOnly: true });
    }
  }

  // Keep queued victory chatter progressing even while confirm overlays are active.
  updateBattleVictoryNpcDialogue(dt);
  const confirmAnnouncementActive = Boolean(
    levelAnnouncements.length && levelAnnouncements[0]?.requiresConfirm,
  );
  if (confirmAnnouncementActive) {
    // Keep grace gems updating while recap/victory confirm overlays are active.
    updateGracePickups(dt);
    updateGraceHudFlyEffects(dt);
    updateGraceSpendFlyEffects(dt);
  }

  // Run teaser chatter before announcement early-return path so speech still
  // appears while teaser overlays are showing.
  if (
    levelStatus?.stage === "briefingTeaser" ||
    levelStatus?.stage === "congregationToTeaser"
  ) {
    updateBriefTeaserNpcDialogue(dt, levelStatus);
  }

  if (handleLevelAnnouncements()) {
    return;
  }

  let stage = levelStatus?.stage;
  const congregationResult = updateCongregationStage(dt, levelStatus);
  const playerUpdatedDuringCongregation = congregationResult.updated;
  if (congregationResult.updated) {
    levelStatus = congregationResult.levelStatus;
    stage = levelStatus?.stage;
  }
  const briefTeaserStage = stage === "briefingTeaser";
  window.__suppressDamageNumbers = briefTeaserStage;
  if (briefTeaserStage) {
    if (!briefTeaserState.active) {
      briefTeaserState.active = true;
      briefTeaserState.spawnScheduled = false;
      briefTeaserState.introTextQueued = false;
      clearBriefTeaserSpawnTimers();
      if (!briefTeaserState.introTextQueued) {
        queueLevelAnnouncement("Somewhere on the frontline...", "", {
          duration: 2.8,
          fadeOutDuration: 0.6,
          skipMissionBrief: true,
          showSubtitle: false,
        });
        briefTeaserState.introTextQueued = true;
      }
      if ((!Array.isArray(npcs) || npcs.length === 0) && typeof resetCozyNpcs === "function") {
        resetCozyNpcs(5);
      }
      try {
        if (typeof setCozyNpcsToFrontlineFormation === "function") {
          setCozyNpcsToFrontlineFormation();
        }
      } catch (error) {}
      scheduleBriefTeaserSpawns();
    }
    updateBriefTeaserNpcDialogue(dt, levelStatus);
    const teaserSkipPressed =
      keysJustPressed.has(" ") ||
      keysJustPressed.has("enter") ||
      keysJustPressed.has("Enter") ||
      wasActionJustPressed("pause") ||
      wasActionJustPressed("restart") ||
      Boolean(Input.consumeCanvasClick?.());
    if (teaserSkipPressed && typeof levelManager?.advanceFromBriefTeaser === "function") {
      keysJustPressed.delete(" ");
      keysJustPressed.delete("enter");
      keysJustPressed.delete("Enter");
      keysJustPressed.delete("pause");
      keysJustPressed.delete("restart");
      levelManager.advanceFromBriefTeaser();
      levelStatus = levelManager?.getStatus ? levelManager.getStatus() : levelStatus;
      stage = levelStatus?.stage;
    }
  } else if (briefTeaserState.active) {
    briefTeaserState.active = false;
    briefTeaserState.spawnScheduled = false;
    briefTeaserState.introTextQueued = false;
    clearBriefTeaserSpawnTimers();
  }
  npcDamageImmuneForBriefTeaser = briefTeaserStage;
  const congregationStageActive = stage === "levelIntro";

  const visualDt = dt;
  const freezeFrameActive = hitFreezeTimer > 0;
  updateCameraAndVisualEffects(visualDt);
  if (freezeFrameActive) {
    dt = 0;
  }

  if (handlePauseMenu()) {
    return;
  }

  if (gameOver) {
    player.animator.update(dt);
    const buttons =
      typeof window !== "undefined" && window.__announcementButtons?.key === "gameOver"
        ? window.__announcementButtons.buttons
        : null;
    handleAnnouncementButtons({
      key: "gameOver",
      buttons,
      allowSpace: true,
      onActivate: () => {
        if (typeof window !== "undefined" && typeof window.playMenuAdvanceSfx === "function") {
          window.playMenuAdvanceSfx(0.6);
        }
        returnToMapFromGameOver();
      },
    });
    return;
  }

  if (paused && !briefTeaserStage) return;

  const blockingConfirmAnnouncement =
    Boolean(levelAnnouncements.length && levelAnnouncements[0]?.requiresConfirm);
  const meterFreezeActive = shouldFreezeResourceMetersForStage(stage, blockingConfirmAnnouncement);
  if (typeof window !== "undefined") {
    window.__battlechurchFreezeResourceMeters = meterFreezeActive;
  }
  if (
    !isDevMeleeArenaActive() &&
    !isTutorialArenaActive() &&
    !gameOver &&
    levelManager &&
    (!paused || briefTeaserStage) &&
    !congregationStageActive &&
    !blockingConfirmAnnouncement
  ) {
    levelManager.update(dt);
    levelStatus = levelManager.getStatus ? levelManager.getStatus() : null;
    stage = levelStatus?.stage;
  }
  updateBattlefieldFloorSelection(levelStatus);
  ensurePlayerPrayerFloorForBattleStart(levelStatus, 2);

  updateCongregationWaveIntroDialogue(dt, levelStatus);

  // Process pickups BEFORE player update so weapon changes apply immediately
  if (!isDevMeleeArenaActive() && !isTutorialArenaActive()) {
    updateChurchPowerupPickups(dt);
    updatePastorPowerupPickups(dt);
  }
  updateWeaponPickups(dt);
  updateUtilityPowerUps(dt);

  if (!briefTeaserStage) {
    updatePlayer(dt, deathFreezeActive, playerUpdatedDuringCongregation);
    if (gameOver) return;
    resolveEntityObstacles(player);
    resolveEntityCollisions(player, enemies, { allowPush: false, overlapScale: 0.6 });
    clampEntityToBounds(player);
  }

  if (visitorSession.active) {
    updateVisitorSession(dt);
    return;
  }

  updateEnemiesAndEntities(dt);
  collectTutorialArenaInstantDeaths();
  updateSmiteBombSweep(dt);
  updateRingOfFireHazards(dt);
  updatePrayerStormGroundFires(dt);

  if (player.shieldTimer > 0) {
    enemies.forEach((enemy) => {
      if (enemy.dead || enemy.state === "death") return;
      applyShieldImpact(enemy);
    });
  }

  if (activeBoss) {
    const bossDt = consumeEntityMeleeHitstopDt(activeBoss, dt);
    activeBoss.update(bossDt);
    if (activeBoss.removed) {
      activeBoss = null;
    }
  }

  updateHaloBlade(dt);
  updateShieldTrails(dt);
  updateCozyNpcs(dt);
  updateGracePickups(dt);
  updateSpearDart(dt);
  updateSentryTurret(dt);
  updateGraceHudFlyEffects(visualDt);
  updateGraceSpendFlyEffects(visualDt);
  updatePowerupHudFlyEffects(visualDt);
  updateGraceRushState(dt);
  powerUpRespawnTimer = Math.max(0, powerUpRespawnTimer - dt);
  powerUpStaggerTimer = Math.max(0, powerUpStaggerTimer - dt);
  visitorWelcomeSayCooldown = Math.max(0, visitorWelcomeSayCooldown - dt);
  const powerUpSpawnedThisFrame = isDevMeleeArenaActive()
    ? false
    : processQueuedPowerUpDrops();
  // Ensure power-ups obey spawn rules per stage
  try {
    const stageName = levelStatus?.stage;
    const battleStageAllowsPowerUps =
      stageName === "waveIntro" ||
      stageName === "waveActive" ||
      stageName === "bossActive" ||
      stageName === "visitorMinigame";
    const powerUpsEnabled = typeof levelManager?.arePowerUpsEnabled === "function"
      ? levelManager.arePowerUpsEnabled()
      : true;
    const shouldEnsurePowerUp =
      !isDevMeleeArenaActive() &&
      !titleScreenActive &&
      !paused &&
      !gameOver &&
      player &&
      player.state !== "death" &&
      battleStageAllowsPowerUps &&
      powerUpsEnabled &&
      !congregationStageActive;
    const delayingForNpcProcession = stageName === "npcArrival" && npcProcessionActive;
    if (shouldEnsurePowerUp && !delayingForNpcProcession) {
      const queueBusy = queuedPowerUpDrops > 0;
      if (!powerUpSpawnedThisFrame && !queueBusy && powerUpStaggerTimer <= 0) {
        spawnNextEnsuredPowerUp();
      }
      // Church powerup runs on its own independent timer — completely separate from
      // the Utility/Weapon cycle so neither affects the other's timing.
      churchPowerupEnsureTimer = Math.max(0, churchPowerupEnsureTimer - dt);
      if (churchPowerupEnsureTimer <= 0) {
        if (getUnlockedChurchPowerupKeys().length > 0 && canSpawnChurchPowerup()) {
          spawnChurchPowerupPickup();
        }
        churchPowerupEnsureTimer = POWERUP_STAGGER_DELAY * 2;
      }
      // Pastor powerups — one shared pool, fixed interval. Only unlocked types (level > 0) enter the pool.
      const unlockedPastorTypes = Object.keys(PASTOR_POWERUP_DEFS).filter((k) => getPastorPowerupLevel(k) > 0);
      if (unlockedPastorTypes.length > 0) {
        pastorPowerupSpawnTimer = Math.max(0, pastorPowerupSpawnTimer - dt);
        if (pastorPowerupSpawnTimer <= 0) {
          const type = unlockedPastorTypes[Math.floor(Math.random() * unlockedPastorTypes.length)];
          spawnPastorPowerupPickup(type);
          const interval = window.GameBalance?.pastorPowerups?.spawnInterval ?? PASTOR_PICKUP_SPAWN_INTERVAL;
          pastorPowerupSpawnTimer = interval;
        }
      }
    }
  } catch (err) {
    console.warn && console.warn('ensure-powerup check failed', err);
  }
  updateBossHazards(dt);
  updateFloatingTexts(visualDt);
  updateLevelAnnouncements(dt);
  updateDevStatus(dt);
  updateAimAssist();
  updateEffects(visualDt);
  // The tutorial spawns its own waves; the background imp horde would mix in
  // stray imps and count them toward the tutorial's objectives.
  if (!isDevMeleeArenaActive() && !isTutorialArenaActive() && !levelManager?.isActive()) {
    maintainMiniImpHorde(levelStatus);
  }

  processDeadEnemies();


  chainTracker.update(
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now(),
  );
  const meleeSystemDt =
    window.__battlechurchPlayerMeleeHitstopActive
      ? 0
      : dt;
  updateMeleeAttackSystem(meleeSystemDt);

  processProjectileCollisions(dt);
  processProjectileClashing();
  cleanupDeadProjectiles();
}

function getFramesForClip(clip) {
  if (!clip || !clip.image) return [];
  const key = `${clip.image.src}::${clip.frameWidth}x${clip.frameHeight}`;
  if (devFrameCache.has(key)) return devFrameCache.get(key);
  const frames = [];
  const cols = Math.max(1, Math.floor(clip.image.width / clip.frameWidth));
  const rows = Math.max(1, Math.floor(clip.image.height / clip.frameHeight));
  const total = clip.frameCount || cols * rows;
  for (let i = 0; i < total; i += 1) {
    const sx = (i % cols) * clip.frameWidth;
    const sy = Math.floor(i / cols) * clip.frameHeight;
    const canvasFrame = document.createElement('canvas');
    canvasFrame.width = clip.frameWidth;
    canvasFrame.height = clip.frameHeight;
    const fctx = canvasFrame.getContext('2d');
    fctx.drawImage(clip.image, sx, sy, clip.frameWidth, clip.frameHeight, 0, 0, clip.frameWidth, clip.frameHeight);
    frames.push(canvasFrame);
  }
  devFrameCache.set(key, frames);
  return frames;
}

// Utility: draw rounded rectangle (optional fill/stroke)
function roundRect(ctx, x, y, width, height, radius, fill = true, stroke = true) {
  if (typeof radius === 'number') radius = { tl: radius, tr: radius, br: radius, bl: radius };
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawHUD() {
  // Rendering handled by renderer.js
}

function drawMissionBriefInArena() {
  // Rendering handled by renderer.js
}

function drawPauseHint() {
  // Rendering handled by renderer.js
}

function drawStartPrompt() {
  // Rendering handled by renderer.js
}

function drawGameOver() {
  // Rendering handled by renderer.js
}

function triggerPostDeathMiniSwarm() {
  if (!window.Spawner?.spawnMiniImpGroup) return;
  const groupCount = 36;
  for (let i = 0; i < 3; i += 1) {
    window.Spawner.spawnMiniImpGroup(groupCount);
  }
}

function onPlayerDeath() {
  heroLives -= 1;
  if (heroLives > 0) {
    if (!playerRespawnPending) {
      playerRespawnPending = true;
      respawnTimer = RESPAWN_DELAY;
      respawnIndicatorTimer = 0;
      if (player) {
        addStatusText(player, "Exhausted", {
          color: UI_COLOR.crimson,
          bgColor: "rgba(60, 20, 20, 0.88)",
          life: Math.min(0.6, RESPAWN_STATUS_INTERVAL),
          offsetY: player.radius + 34,
        });
      }
    }


    damageHitFlash = 0;
    return;
  }
  heroLives = 0;
  playPlayerDeathBell(1.0);
  playerRespawnPending = false;
  respawnTimer = 0;
  respawnIndicatorTimer = 0;
  postDeathAnimLeadActive = true;
  postDeathAnimLeadTimer = POST_DEATH_ANIM_LEAD;
  postDeathSequenceActive = false;
  postDeathTimer = 0;
  miniImpWaveDispatched = false;
  arenaFadeTimer = -1;
  arenaFadeAlpha = 0;
  console.log("Death sequence triggered: lead", POST_DEATH_ANIM_LEAD);
  if (player) {
    player.lockedPosition = { x: player.x, y: player.y };
  }
  gameOver = false;
  paused = false;
  damageHitFlash = 0;
}


function restartGame() {
  devMeleeArenaMode = false;
  tutorialArenaMode = false;
  if (musicState.devArena) musicState.devArena.pause();
  pendingDevMeleeArenaLaunch = false;
  pendingTutorialArenaLaunch = false;
  tutorialArenaState = null;
  tutorialArenaReturnSnapshot = null;
  tutorialArenaExitContinuation = null;
  tutorialArenaFirstRun = false;
  resetDevMeleeMoveFeed();
  if (typeof window !== "undefined") {
    window.__battlechurchDevMeleeArenaMode = false;
    window.__battlechurchTutorialArenaMode = false;
    window.__tutorialArenaHud = null;
  }
  teardownGame();
  endVisitorSession({ reason: "reset" });
  clearBriefTeaserSpawnTimers();
  briefTeaserState.active = false;
  briefTeaserState.spawnScheduled = false;
  briefTeaserState.introTextQueued = false;
  npcDamageImmuneForBriefTeaser = false;
  resetMusicState();
  stopPlayerDeathBell();
  prayerBombRainTimer = 0;
  prayerBombRainSpawnTimer = 0;
  prayerStormGroundFireTargetThisCast = 0;
  prayerStormGroundFireSpawnedThisCast = 0;
  prayerStormRainImpactCountThisCast = 0;
  prayerStormGroundFireNextSpawnAtImpact = Infinity;
  prayerStormGroundFireImpactSpacing = Infinity;
  resetCongregationSize();
  resetYearNpcPool();
  enemies.splice(0, enemies.length);
  projectiles.splice(0, projectiles.length);
  weaponPickups.splice(0, weaponPickups.length);
  churchPowerupPickups.splice(0, churchPowerupPickups.length);
  pastorPowerupPickups.splice(0, pastorPowerupPickups.length);
  utilityPowerUps.splice(0, utilityPowerUps.length);
  ringOfFireHazards.splice(0, ringOfFireHazards.length);
  prayerStormGroundFires.splice(0, prayerStormGroundFires.length);
  clearGracePickups();
  resetChurchPowerups();
  playerGraceCount = 0;
  graceDropHpBudget = 0;
  Spawner.resetAllFlags();
  Effects.clear();
  bossHazards.splice(0, bossHazards.length);
  activeBoss = null;
  graceRushState.active = false;
  graceRushState.timer = 0;
  graceRushState.duration = 0;
  graceRushState.elapsed = 0;
  resetGraceRushNpcFarewellState();
  lastEnemyDeathPosition = null;
  cancelStartCountdown();
  needsCountdown = false;
  hpFlashTimer = 0;
  spawnTimer = 3.6;
  gameOver = false;
  paused = true;
  gameStarted = false;
  npcsSuspended = false;
  playerRespawnPending = false;
  respawnTimer = 0;
  respawnIndicatorTimer = 0;
  postDeathSequenceActive = false;
  postDeathAnimLeadActive = false;
  postDeathAnimLeadTimer = 0;
  postDeathTimer = 0;
  miniImpWaveDispatched = false;
  arenaFadeTimer = 0;
  arenaFadeAlpha = 0;
  battlefieldIntroFadeTimer = 0;
  battlefieldIntroFadeDuration = 0;
  battlefieldIntroFadeAlpha = 0;
  battlefieldIntroActive = false;
  battlefieldIntroNumber = 2;
  battlefieldIntroImage = null;
  lastCompletedLevel = 0;
  pendingPostUpgradeTransition = false;
  graceRushFadeTimer = 0;
  graceRushFadeDuration = 0;
  graceRushFadeAlpha = 0;
  graceRushFadeHold = false;
  graceRushFadeReleaseTimer = 0;
  graceRushBlackout = false;
  npcWeaponState.mode = null;
  npcWeaponState.timer = 0;
  npcWeaponState.duration = 0;
  npcWeaponState.damageMultiplier = 1;
  npcWeaponState.cooldownMultiplier = 1;
  npcWeaponState.speedMultiplier = 1;
  floatingTexts.forEach((ft) => {
    if (!ft.critical) ft.life = 0;
  });
  player = createPlayerInstance(
    canvas.width / 2,
    HUD_HEIGHT + (canvas.height - HUD_HEIGHT) * 0.5 - 100,
    assets.player,
  );
  player.health = player.maxHealth;
  heroLives = getConfiguredHeroLives();
  resetCozyNpcs(5);
  clearCongregationMembers();
  heroRescueCooldown = 0;
  levelAnnouncements.length = 0;
  weaponPickupAnnouncement.timer = 0;
  weaponPickupAnnouncement.title = "";
  weaponPickupAnnouncement.description = "";
  weaponPickupAnnouncement.iconSrc = "";
  npcHarmonyBuffTimer = 0;
  npcHarmonyBuffDuration = 0;
  levelManager = Levels.createLevelManager();
  levelManager.begin();
  titleScreenActive = true;
  titleDemoSaveMenuActive = false;
  paused = true;
  gameStarted = false;
  congregationOverlay.active = false;
  congregationOverlay.timer = 0;
  congregationOverlay.phase = 0;
  congregationOverlay.countTo = 0;
  congregationOverlay.countValue = 0;
  congregationOverlay.lastPhase = -1;
  congregationOverlay.playedFinal = false;
  congregationGreetingShown = false;
  congregationWelcomeTimer = 0;
  congregationGreetingCount = 0;
  speedrunTimer.running = false;
  speedrunTimer.startTime = null;
  speedrunTimer.sectionStart = null;
  speedrunTimer.currentSection = null;
  speedrunTimer.totalElapsed = 0;
  speedrunTimer.sectionElapsed = 0;
  speedrunTimer.splits = [];
  if (typeof Input !== "undefined" && typeof Input.initialize === "function") {
    Input.initialize({ canvas });
  }
  startGameLoop();
}

function drawGlobalTeaserTransitionOverlay() {
  const status = levelManager?.getStatus ? levelManager.getStatus() : null;
  if (!status || status.stage !== "upgradeToTeaser") return;
  const timer = Number(status.stageTimer) || 0;
  const duration = Math.max(0.001, Number(status.stageDuration) || 0.001);
  const progress = Math.max(0, Math.min(1, 1 - timer / duration));
  if (progress <= 0.001) return;
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${progress})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function gameLoop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  checkDevActivationSequence();
  updateProgressSaveToast(delta);

  if (typeof window !== "undefined") {
    window.__battlechurchTitleScreenActive = Boolean(titleScreenActive);
    window.__battlechurchPauseMenuActive = Boolean(window.isPauseOverlayActive);
    window.__battlechurchMapScreenActive = Boolean(mapActive);
  }

  if (typeof Input?.pollGamepad === "function") {
    Input.pollGamepad();
  }
  updateGame(delta);
  syncSpiritRealmAmbient();
  syncBattleTeaserCreepyAmbient();
  syncVisitorConversationAmbient();
  Renderer.drawFrame();
  if (AMBIENT_SMOKE_CONFIG.enabled && devTools.ambientSmokeEnabled) {
    Renderer.drawAmbientSmokeOverlay?.();
  }
  if (AMBIENT_SMOKE_CONFIG.debugVisible) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 40, 40, 0.92)";
    ctx.fillRect(12, 12, 300, 34);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 16px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("GAMELOOP DEBUG ACTIVE", 18, 29);
    ctx.restore();
  }
  if (PastorUpgradeScreen.isVisible()) {
    PastorUpgradeScreen.draw();
  }
  if (DenominationScreen.isVisible()) {
    DenominationScreen.draw();
  }
  if (window.UpgradeScreen?.isVisible?.()) {
    window.UpgradeScreen.draw();
    Renderer.drawGraceSpendFlyEffectsOverlay?.();
  }
  drawHudMilestoneBurst();
  drawGlobalTeaserTransitionOverlay();
  drawProgressSaveToast();
  Renderer.drawTypographyDebugOverlay?.();
  keysJustPressed.clear();

  gameLoopHandle = requestAnimationFrame(gameLoop);
}

function stopGameLoop() {
  if (gameLoopHandle !== null) {
    cancelAnimationFrame(gameLoopHandle);
    gameLoopHandle = null;
  }
  gameLoopStarted = false;
}

function startGameLoop() {
  if (gameLoopStarted) {
    return;
  }
  stopGameLoop();
  gameLoopStarted = true;
  lastTime = performance.now();
  gameLoopHandle = requestAnimationFrame(gameLoop);
}

function teardownGame() {
  stopGameLoop();
  if (typeof Input !== "undefined" && typeof Input.detachListeners === "function") {
    Input.detachListeners();
  }
}

// Debug overlay functions (DEV-ONLY)
function toggleDebugOverlay() {
  if (!DEBUG) return;
  debugOverlayVisible = !debugOverlayVisible;
  if (debugOverlayVisible && !debugOverlayData) {
    updateDebugOverlayData();
  }
}

function updateDebugOverlayData() {
  if (!DEBUG || !debugOverlayVisible) return;

  // Calculate FPS from last frame delta
  const fps = lastTime > 0 ? Math.round(1000 / (performance.now() - lastTime)) : 0;

  // Get heap memory if available (Chrome)
  let heapUsed = "N/A";
  let heapTotal = "N/A";
  if (typeof performance !== "undefined" && performance.memory) {
    heapUsed = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    heapTotal = (performance.memory.totalJSHeapSize / 1048576).toFixed(1);
  }

  // Count audio pools
  const audioPools = [
    arrowSfxPool, enemyHitSfxPool, enemyDeathSfxPool, swordSfxPool,
    swordKillSfxPool, fireballSfxPool, wisdomSfxPool, faithCannonSfxPool,
    powerupPickupSfxPool, wisdomHitSfxPool, faithHitSfxPool, thrashHitSfxPool, prayerBombSfxPool,
    prayerBombRainSfxPool, bossDeathExplosionSfxPool, menuSelectSfxPool, enemySpawnSfxPool, gracePickupSfxPool,
    visitorHitSfxPool, chattyHitSfxPool, visitorSavedSfxPool, npcHurtSfxPool,
    playerHurtSfxPool
  ];
  const totalAudioInstances = audioPools.reduce((sum, pool) => sum + pool.length, 0);

  debugOverlayData = {
    fps,
    heapUsed,
    heapTotal,
    enemies: enemies.length,
    npcs: npcs.length,
    projectiles: projectiles.length,
    gracePickups: gracePickups.length,
    weaponPickups: weaponPickups.length,
    churchPowerupPickups: churchPowerupPickups.length,
    utilityPowerUps: utilityPowerUps.length,
    effects: effects.length,
    floatingTexts: floatingTexts.length,
    audioPools: audioPools.length,
    audioInstances: totalAudioInstances,
    audioCreatedTotal: audioCreatedTotal
  };
}

function renderDebugOverlay(ctx) {
  if (!DEBUG || !debugOverlayVisible || !debugOverlayData) return;

  const data = debugOverlayData;
  const x = canvas.width - 10;
  const startY = 20;
  const lineHeight = 16;
  const fontSize = 12;

  ctx.save();
  ctx.font = `${fontSize}px monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  const lines = [
    `FPS: ${data.fps}`,
    `Heap: ${data.heapUsed} / ${data.heapTotal} MB`,
    `Enemies: ${data.enemies}`,
    `NPCs: ${data.npcs}`,
    `Projectiles: ${data.projectiles}`,
    `Grace: ${data.gracePickups}`,
    `Weapons: ${data.weaponPickups}`,
    `Upgrades: ${data.churchPowerupPickups}`,
    `Powerups: ${data.utilityPowerUps}`,
    `Effects: ${data.effects}`,
    `Texts: ${data.floatingTexts}`,
    `Audio Pools: ${data.audioPools}`,
    `Audio Instances: ${data.audioInstances}`,
    `Audio Created (total): ${data.audioCreatedTotal}`
  ];

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    // Shadow for readability
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillText(line, x + 1, y + 1);
    // Text
    ctx.fillStyle = "#00ff00";
    ctx.fillText(line, x, y);
  });

  ctx.restore();
}

async function init() {
  try {
    installDesolateCanvasColorLock();
    resetMusicState();
    if (typeof window !== "undefined") startMusicOnFirstClick();
    resetCongregationSize();
    // Ensure canvas is sized before drawing
    resizeCanvas();

    // TWO-PHASE LOADING: Load title/map assets first for faster initial display
    // Phase 1: Load title background and map-essential assets
    const { assets: titleMapAssets, cache } = await loadTitleMapAssets();
    assets = titleMapAssets;
    mapReady = true; // Title screen and map navigation can now work

    // Give MapScreen the partial assets so map animations work
    if (window.MapScreen?.setAssets) {
      window.MapScreen.setAssets(assets);
    }

    startGameLoop();

    // Phase 2: Load remaining gameplay assets in background
    gameplayAssetsPromise = loadGameplayAssets(cache, assets);

    // Wait for gameplay assets before allowing actual gameplay
    await gameplayAssetsPromise;
    assetsLoaded = true;
    if (window.BattlechurchEnemyEditor?.initialize) {
      window.BattlechurchEnemyEditor.initialize({
        getAssets: () => assets,
      });
    }
    if (window.BattlechurchLevelBuilder?.initialize) {
      window.BattlechurchLevelBuilder.initialize({
        getAssets: () => assets,
      });
    }
    if (window.BattlechurchBossHitboxEditor?.initialize) {
      window.BattlechurchBossHitboxEditor.initialize({
        getAssets: () => assets,
        getEnemyCatalog: () => ENEMY_CATALOG,
        getEnemyTypes: () => ENEMY_TYPES,
        onHitboxChange: applyHitboxChange,
      });
    }
    if (window.BattlechurchHitboxEditor?.initialize) {
      window.BattlechurchHitboxEditor.initialize({
        getAssets: () => assets,
        getEnemyCatalog: () => ENEMY_CATALOG,
        getEnemyTypes: () => ENEMY_TYPES,
        getPlayerPreview: () => player,
        getPlayerConfig: () => PLAYER_CONFIG,
        getNpcPreview: () => {
          const liveNpc = Array.isArray(npcs) ? npcs.find((npc) => npc && !npc.departed) || null : null;
          if (liveNpc) return liveNpc;
          if (!hitboxEditorNpcPreview || hitboxEditorNpcPreview.departed) {
            hitboxEditorNpcPreview = createNpcPixelLinePreviewNpc();
            if (hitboxEditorNpcPreview?.animator?.play) {
              hitboxEditorNpcPreview.animator.play("walk", { restart: true });
            }
          }
          return hitboxEditorNpcPreview || null;
        },
        getProjectileConfig: () => PROJECTILE_CONFIG,
        onHitboxChange: applyHitboxChange,
        onPlayerHitboxChange: (hitbox) => {
          if (!hitbox || !Number.isFinite(hitbox.width) || !Number.isFinite(hitbox.height)) return;
          if (hitbox.width <= 0 || hitbox.height <= 0) return;
          const next = {
            width: hitbox.width,
            height: hitbox.height,
            offsetX: Number.isFinite(hitbox.offsetX) ? hitbox.offsetX : 0,
            offsetY: Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0,
          };
          PLAYER_CONFIG.hitbox = { ...next };
          BASE_PLAYER_CONFIG.hitbox = { ...next };
          const derivedRadius = Math.max(next.width, next.height) * 0.5;
          PLAYER_CONFIG.radius = derivedRadius;
          BASE_PLAYER_CONFIG.radius = derivedRadius;
          saveStoredPlayerHitbox(next);
          if (player) {
            player.radius = derivedRadius;
            if (player.config) {
              player.config.radius = derivedRadius;
              player.config.hitbox = { ...next };
            }
          }
        },
        onPlayerWeaponHitboxChange: (weaponHitbox) => {
          if (!weaponHitbox || !Number.isFinite(weaponHitbox.width) || !Number.isFinite(weaponHitbox.height)) return;
          if (weaponHitbox.width <= 0 || weaponHitbox.height <= 0) return;
          const next = {
            width: weaponHitbox.width,
            height: weaponHitbox.height,
            offsetX: Number.isFinite(weaponHitbox.offsetX) ? weaponHitbox.offsetX : 0,
            offsetY: Number.isFinite(weaponHitbox.offsetY) ? weaponHitbox.offsetY : 0,
          };
          PLAYER_CONFIG.weaponHitbox = { ...next };
          BASE_PLAYER_CONFIG.weaponHitbox = { ...next };
          if (player?.config) {
            player.config.weaponHitbox = { ...next };
          }
        },
        onPlayerDashSlashHitboxChange: (dashSlashHitbox) => {
          if (!dashSlashHitbox || !Number.isFinite(dashSlashHitbox.width) || !Number.isFinite(dashSlashHitbox.height)) return;
          if (dashSlashHitbox.width <= 0 || dashSlashHitbox.height <= 0) return;
          const next = {
            width: dashSlashHitbox.width,
            height: dashSlashHitbox.height,
            offsetX: Number.isFinite(dashSlashHitbox.offsetX) ? dashSlashHitbox.offsetX : 0,
            offsetY: Number.isFinite(dashSlashHitbox.offsetY) ? dashSlashHitbox.offsetY : 0,
          };
          PLAYER_CONFIG.dashSlashHitbox = { ...next };
          BASE_PLAYER_CONFIG.dashSlashHitbox = { ...next };
          if (player?.config) {
            player.config.dashSlashHitbox = { ...next };
          }
        },
        onPlayerRushHitboxChange: (rushHitbox) => {
          if (!rushHitbox || !Number.isFinite(rushHitbox.width) || !Number.isFinite(rushHitbox.height)) return;
          if (rushHitbox.width <= 0 || rushHitbox.height <= 0) return;
          const next = {
            width: rushHitbox.width,
            height: rushHitbox.height,
            offsetX: Number.isFinite(rushHitbox.offsetX) ? rushHitbox.offsetX : 0,
            offsetY: Number.isFinite(rushHitbox.offsetY) ? rushHitbox.offsetY : 0,
          };
          PLAYER_CONFIG.rushHitbox = { ...next };
          BASE_PLAYER_CONFIG.rushHitbox = { ...next };
          if (player?.config) {
            player.config.rushHitbox = { ...next };
          }
        },
        onPlayerAttackHitFrameChange: (attackHitFrame) => {
          const next = Number.isFinite(attackHitFrame) ? Math.max(1, Math.round(attackHitFrame)) : DEFAULT_PLAYER_ATTACK_HIT_FRAME;
          PLAYER_CONFIG.attackHitFrame = next;
          BASE_PLAYER_CONFIG.attackHitFrame = next;
          if (player?.config) {
            player.config.attackHitFrame = next;
          }
        },
        onNpcRadiusChange: (radius) => {
          if (!Number.isFinite(radius) || radius <= 0 || !Array.isArray(npcs)) return;
          npcs.forEach((npc) => {
            if (!npc || npc.departed) return;
            npc.radius = radius;
          });
        },
        onProjectileRadiusChange: (type, radius) => {
          if (!type || !Number.isFinite(radius) || radius <= 0) return;
          const config = PROJECTILE_CONFIG[type];
          if (config && typeof config === "object") {
            config.radius = radius;
          }
          if (Array.isArray(projectiles)) {
            projectiles.forEach((projectile) => {
              if (!projectile || projectile.dead || projectile.type !== type) return;
              projectile.radius = radius;
            });
          }
        },
      });
    }
    rebuildObstacles();
  player = createPlayerInstance(
    canvas.width / 2,
    HUD_HEIGHT + (canvas.height - HUD_HEIGHT) * 0.5 - 100,
    assets.player,
  );
  player.health = player.maxHealth;
    heroLives = getConfiguredHeroLives();
    playerRespawnPending = false;
    respawnTimer = 0;
    respawnIndicatorTimer = 0;
    utilityPowerUps.length = 0;
    ringOfFireHazards.length = 0;
    prayerStormGroundFires.length = 0;
    prayerStormGroundFireTargetThisCast = 0;
    prayerStormGroundFireSpawnedThisCast = 0;
    prayerStormRainImpactCountThisCast = 0;
    prayerStormGroundFireNextSpawnAtImpact = Infinity;
    prayerStormGroundFireImpactSpacing = Infinity;
    resetCozyNpcs(5);
    clearCongregationMembers();
    spawnTimer = 3.8;
    cancelStartCountdown();
    needsCountdown = false;
    gameStarted = false;
    paused = true;
    hpFlashTimer = 0;
    heroRescueCooldown = 0;
    lastTime = performance.now();
    levelAnnouncements.length = 0;
    weaponPickupAnnouncement.timer = 0;
    weaponPickupAnnouncement.title = "";
    weaponPickupAnnouncement.description = "";
    weaponPickupAnnouncement.iconSrc = "";
    npcHarmonyBuffTimer = 0;
    npcHarmonyBuffDuration = 0;
    npcWeaponState.mode = null;
    npcWeaponState.timer = 0;
    npcWeaponState.duration = 0;
    npcWeaponState.damageMultiplier = 1;
    npcWeaponState.cooldownMultiplier = 1;
    npcWeaponState.speedMultiplier = 1;
    bossHazards.length = 0;
    activeBoss = null;
    npcsSuspended = false;
    titleScreenActive = true;
    titleDemoSaveMenuActive = false;
    titleUtilityPanelMode = null;
    titleEditSaveDraft = null;
    paused = true;
    gameStarted = false;
    levelManager = Levels.createLevelManager();
    levelManager.begin();
  // Re-apply explicit miniDemonFireThrower frameMaps after clip loading so they take effect
  try {
    if (assets?.enemies?.miniDemonFireThrower) {
      applyExplicitEnemyFrameMaps("miniDemonFireThrower", assets.enemies.miniDemonFireThrower);
    }
    if (assets?.enemies?.miniDemonLord) {
      applyExplicitEnemyFrameMaps("miniDemonLord", assets.enemies.miniDemonLord);
    }
    if (assets?.enemies?.bossDemonLord) {
      applyExplicitEnemyFrameMaps("bossDemonLord", assets.enemies.bossDemonLord);
    }
  } catch (e) {
    // ignore
  }
  } catch (error) {
    console.error(error);
    ctx.save();
    ctx.fillStyle = "#0b0e16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = UI_COLOR.crimson;
    ctx.font = `28px ${UI_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.fillText("Failed to start Battlefield Church", canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle = "#f3f5ff";
    ctx.font = `16px ${UI_FONT_FAMILY}`;
    const message = (error && error.message) || "Unknown error";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2 + 12);
    ctx.restore();
  }
}

init();

// Stop game loop when page is hidden to prevent resource leaks
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopGameLoop();
    } else if (!titleScreenActive && !gameOver) {
      startGameLoop();
    }
  });
}
