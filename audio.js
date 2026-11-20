/* Sound effects and music: SFX source lists, sound pools, play*Sfx helpers, music start/stop/fade, audio settings.
 * Moved out of game.js unchanged. Loaded by index.html BEFORE game.js and
 * shares its globals at runtime. Top-level code here runs before game.js
 * exists: run `node dev/tools/check_load_order.js` after editing.
 */

const ENEMY_HIT_SFX_SRCS = [
  "assets/sfx/rpg/Impacts/impact_5.wav",
  "assets/sfx/rpg/Impacts/impact_6.wav",
  "assets/sfx/rpg/Impacts/impact_7.wav",
  "assets/sfx/rpg/Impacts/impact_8.wav",
];
const ENEMY_DEATH_MONSTER_SRCS = [
  "assets/sfx/rpg/Monsters/monster_5.wav",
  "assets/sfx/rpg/Monsters/monster_6.wav",
  "assets/sfx/rpg/Monsters/monster_7.wav",
  "assets/sfx/rpg/Monsters/monster_8.wav",
  "assets/sfx/rpg/Monsters/monster_9.wav",
];
const ENEMY_DEATH_GRUNT_SRCS = [
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_13.wav",
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_14.wav",
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_15.wav",
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_16.wav",
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_17.wav",
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_18.wav",
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_19.wav",
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_20.wav",
  "assets/sfx/rpg/Battle Grunts/Battle_grunt_21.wav",
];
const ENEMY_DEATH_SFX_SRCS = [
  ...ENEMY_DEATH_MONSTER_SRCS,
  ...ENEMY_DEATH_GRUNT_SRCS,
];
const SWORD_SWING_SFX_SRC = "assets/sfx/Weapons/attack10.mp3";
const MELEE_WHIFF_SFX_SRC = "assets/sfx/Weapons/attack1.mp3";
const RUSH_ATTACK_SFX_SRC = "assets/sfx/Weapons/spell3.mp3";
const DASH_SFX_SRC = "assets/sfx/Weapons/attack10.mp3";
const SWORD_KILL_SFX_SRCS = [
  "assets/sfx/rpg/Impacts/impact_5.wav",
  "assets/sfx/rpg/Impacts/impact_6.wav",
  "assets/sfx/rpg/Impacts/impact_7.wav",
  "assets/sfx/rpg/Impacts/impact_8.wav",
];
const FIREBALL_CAST_SFX_SRCS = [
  "assets/sfx/Weapons/spell2.mp3",
  "assets/sfx/Weapons/spell3.mp3",
];
const WISDOM_CAST_SFX_SRCS = [
  "assets/sfx/rpg/Magic/fireball_whoosh_01.wav",
  "assets/sfx/rpg/Magic/fireball_whoosh_02.wav",
  "assets/sfx/rpg/Magic/fireball_whoosh_03.wav",
];
const WISDOM_HIT_SFX_SRCS = [
  "assets/sfx/rpg/Explosions/Explosions_38.wav",
  "assets/sfx/rpg/Explosions/Explosions_39.wav",
  "assets/sfx/rpg/Explosions/Explosions_40.wav",
];
const PRAYER_BOMB_RAIN_SFX_SRCS = [
  "assets/sfx/rpg/Explosions/Explosions_38.wav",
  "assets/sfx/rpg/Explosions/Explosions_39.wav",
  "assets/sfx/rpg/Explosions/Explosions_40.wav",
];
const FAITH_CANNON_SFX_SRCS = [
  "assets/sfx/rpg/Magic/fireball_whoosh_04.wav",
  "assets/sfx/rpg/Magic/fireball_whoosh_05.wav",
  "assets/sfx/rpg/Magic/fireball_whoosh_06.wav",
];
const RECAP_GRACE_FLY_SFX_SRC = "assets/sfx/rpg/Magic/fireball_whoosh_05.wav";
const FAITH_HIT_SFX_SRCS = [
  "assets/sfx/rpg/Explosions/Explosions_22.wav",
  "assets/sfx/rpg/Explosions/Explosions_23.wav",
  "assets/sfx/rpg/Explosions/Explosions_24.wav",
];
const THRASH_HIT_SFX_SRCS = [
  "assets/sfx/rpg/Explosions/Explosions_38.wav",
  "assets/sfx/rpg/Explosions/Explosions_39.wav",
  "assets/sfx/rpg/Explosions/Explosions_40.wav",
  "assets/sfx/rpg/Impacts/impact_5.wav",
  "assets/sfx/rpg/Impacts/impact_6.wav",
];
const THRASH_SWIPE_SFX_SRCS = [
  "assets/sfx/Weapons/swoosh-pool/sword_swosh_2.wav",
  "assets/sfx/Weapons/swoosh-pool/sword_swosh_10.wav",
  "assets/sfx/Weapons/swoosh-pool/sword_swosh_17.wav",
  "assets/sfx/Weapons/swoosh-pool/sword_swosh_18.wav",
  "assets/sfx/Weapons/swoosh-pool/sword_swosh_19.wav",
];
const THRASH_HIT_SFX_POOL_SIZE = 6;
const THRASH_SWIPE_SFX_POOL_SIZE = 6;
const THRASH_LAND_SFX_SRCS = [
  "assets/sfx/Weapons/splatter/impact_1.wav",
  "assets/sfx/Weapons/splatter/impact_2.wav",
  "assets/sfx/Weapons/splatter/impact_3.wav",
  "assets/sfx/Weapons/splatter/impact_4.wav",
];
const THRASH_LAND_SFX_POOL_SIZE = 6;
const SENTRY_BEAM_SFX_SRCS = [
  "assets/sfx/Weapons/spell11.mp3",
  "assets/sfx/Weapons/spell12.mp3",
];
const SENTRY_BORE_LOOP_SFX_SRCS = [
  "assets/sfx/Weapons/spell2.mp3",
  "assets/sfx/Weapons/spell3.mp3",
  "assets/sfx/Weapons/spell10.mp3",
];
const SPEAR_TURN_SFX_SRCS = [
  "assets/sfx/Weapons/spell2.mp3",
  "assets/sfx/Weapons/spell3.mp3",
  "assets/sfx/Weapons/spell11.mp3",
  "assets/sfx/Weapons/spell12.mp3",
];
const SPEAR_HIT_SFX_SRCS = [
  "assets/sfx/rpg/Explosions/Explosions_22.wav",
  "assets/sfx/rpg/Explosions/Explosions_23.wav",
  "assets/sfx/rpg/Explosions/Explosions_24.wav",
];
const SENTRY_BORE_KILL_SFX_SRC = "assets/sfx/rpg/Explosions/Explosions_22.wav";
const PRAYER_BOMB_SFX_SRC = "assets/sfx/rpg/Explosions/Explosions_8.wav";
const BOSS_DEATH_EXPLOSION_SFX_SRCS = [
  "assets/sfx/rpg/Explosions/Explosions_8.wav",
  "assets/sfx/rpg/Explosions/Explosions_40.wav",
  "assets/sfx/rpg/Explosions/Explosions_24.wav",
];
const BOSS_LIGHTNING_THUNDER_SFX_SRCS = [
  // Boss lightning core hits
  "assets/sfx/rpg/Explosions/Explosions_8.wav",
  "assets/sfx/rpg/Explosions/Explosions_40.wav",
  // Layer in Smite/Purify-adjacent explosions so rapid flickers feel varied
  "assets/sfx/rpg/Explosions/Explosions_22.wav",
  "assets/sfx/rpg/Explosions/Explosions_23.wav",
  "assets/sfx/rpg/Explosions/Explosions_24.wav",
];
const BOSS_DEATH_EXPLOSION_SFX_POOL_SIZE = 6;
const POWERUP_PICKUP_SFX_SRC = "assets/sfx/utility/utility16.mp3";
const POWERUP_SPAWN_SFX_SRC = "assets/sfx/utility/spell7.mp3";
const GRACE_PICKUP_SFX_SRC = "assets/sfx/utility/utility10.mp3";
const GRACE_LAND_SFX_SRC = "assets/sfx/utility/diamond.mp3";
const SAVE_PROGRESS_SFX_SRC = "assets/sfx/utility/utility16.mp3";
const RECAP_TICK_SFX_SRC = "assets/sfx/utility/utility9.mp3";
const RECAP_FINAL_SFX_SRC = "assets/sfx/rpg/Explosions/Explosions_22.wav";
const INTRO_MUSIC_SRC = "assets/music/boss-fight-3.mp3";
const BATTLE_MUSIC_SRC = "assets/music/boss-fight-1.mp3";
const WAVE3_BATTLE_MUSIC_SRC = "assets/music/boss-fight-4.mp3";
const BOSS_PHASE3_MUSIC_SRC = "assets/music/boss-fight-1.mp3";
const CONGREGATION_MUSIC_SRC = "assets/music/suspense.mp3";
const SPIRIT_REALM_AMBIENT_SRC = "assets/sfx/environment/spirit_realm.mp3";
const BATTLE_TEASER_CREEPY_SFX_SRC = "assets/sfx/environment/creepy-1.mp3";
const RECAP_MUSIC_SRC = "assets/music/town-cleared-music.mp3";
const VISITOR_MUSIC_SRC = "assets/music/visitor-music-2.mp3";
const VISITOR_CONVERSATION_SFX_SRC = "assets/sfx/environment/church-conversation.mp3";
const EXTERIOR_MUSIC_SRC = "assets/music/boss-fight-1.mp3";
const EXTERIOR_BOSS_MUSIC_SRC = "assets/music/boss-fight-3.mp3";
const BOSS_DEATH_MUSIC_SRC = "assets/music/boss-fight-2.mp3";
const MENU_SELECT_SFX_SRC = "assets/sfx/rpg/Explosions/Explosions_22.wav";
const MENU_MOVE_SFX_SRC = "assets/sfx/utility/cursor_5.mp3";
const ENEMY_SPAWN_SFX_SRC = "assets/sfx/rpg/Monsters/monster_1.wav";
const VISITOR_HIT_SFX_SRC = "assets/sfx/npcs/fireball_release_1.wav";
const CHATTY_HIT_SFX_SRC = "assets/sfx/utility/utility3.mp3";
const VISITOR_SAVED_SFX_SRC = "assets/sfx/npcs/healing_spell_2.wav";
const NPC_HURT_SFX_SRC = "assets/sfx/npcs/ow1.wav";
const PLAYER_HURT_SFX_SRC = "assets/sfx/rpg/player/ouch_voice.wav";
const PLAYER_DEATH_BELL_SFX_SRC = "assets/sfx/rpg/player/bells-2.wav";
const HIGH_HEALTH_DEATH_GRUNT_SRC = "assets/sfx/rpg/Battle Grunts/Battle_grunt_9.wav";
const DIVINE_SHOT_SFX_SRC = "assets/sfx/Weapons/spell2.mp3";
const WAVE_TRANSITION_SFX_SRC = "assets/sfx/Weapons/spell3.mp3";
const CONGREGATION_OVERLAY_WORD_SFX_SRC = "assets/sfx/rpg/Explosions/Explosions_24.wav";
const CONGREGATION_OVERLAY_FINAL_SFX_SRC = "assets/sfx/rpg/Explosions/Explosions_8.wav";
const CONGREGATION_FIGHT_SFX_SRC = "assets/sfx/rpg/Explosions/Explosions_40.wav";
const CONGREGATION_COUNT_POP_UP_SFX_SRC = "assets/sfx/rpg/Explosions/Explosions_24.wav";
const CONGREGATION_COUNT_POP_DOWN_SFX_SRC = "assets/sfx/utility/utility3.mp3";
const CONGREGATION_MONSTER_AMBIENT_SRCS = [
  "assets/sfx/rpg/Monsters/monster_1.wav",
  "assets/sfx/rpg/Monsters/monster_1.wav",
  "assets/sfx/rpg/Monsters/monster_10.wav",
  "assets/sfx/rpg/Monsters/monster_11.wav",
  "assets/sfx/rpg/Monsters/monster_12.wav",
];
const ENEMY_SPAWN_HIGH_SFX = [
  { minHealth: 500, src: "assets/sfx/rpg/Monsters/monster_12.wav" },
  { minHealth: 400, src: "assets/sfx/rpg/Monsters/monster_11.wav" },
  { minHealth: 300, src: "assets/sfx/rpg/Monsters/monster_10.wav" },
];
const ARROW_SFX_POOL_SIZE = 6;
const ENEMY_HIT_SFX_POOL_SIZE = 8;
const ENEMY_DEATH_SFX_POOL_SIZE = 6;
const SWORD_SFX_POOL_SIZE = 4;
const MELEE_WHIFF_SFX_POOL_SIZE = 4;
const RUSH_ATTACK_SFX_POOL_SIZE = 2;
const DASH_SFX_POOL_SIZE = 2;
const SWORD_KILL_SFX_POOL_SIZE = 6;
const FIREBALL_SFX_POOL_SIZE = 6;
const WISDOM_SFX_POOL_SIZE = 4;
const FAITH_CANNON_SFX_POOL_SIZE = 4;
const POWERUP_PICKUP_SFX_POOL_SIZE = 4;
const POWERUP_SPAWN_SFX_POOL_SIZE = 4;
const WISDOM_HIT_SFX_POOL_SIZE = 5;
const FAITH_HIT_SFX_POOL_SIZE = 5;
const PRAYER_BOMB_SFX_POOL_SIZE = 4;
const PRAYER_BOMB_RAIN_SFX_POOL_SIZE = 4;
const MENU_SELECT_SFX_POOL_SIZE = 4;
const ENEMY_SPAWN_SFX_POOL_SIZE = 4;
const GRACE_PICKUP_SFX_POOL_SIZE = 4;
const GRACE_LAND_SFX_POOL_SIZE = 4;
const SAVE_PROGRESS_SFX_POOL_SIZE = 3;
const RECAP_TICK_SFX_POOL_SIZE = 6;
const RECAP_FINAL_SFX_POOL_SIZE = 3;
const RECAP_GRACE_FLY_SFX_POOL_SIZE = 6;
const VISITOR_HIT_SFX_POOL_SIZE = 4;
const CHATTY_HIT_SFX_POOL_SIZE = 4;
const VISITOR_SAVED_SFX_POOL_SIZE = 4;
const NPC_HURT_SFX_POOL_SIZE = 4;
const PLAYER_HURT_SFX_POOL_SIZE = 4;
const WAVE_TRANSITION_SFX_POOL_SIZE = 3;
const CONGREGATION_OVERLAY_SFX_POOL_SIZE = 4;
const CONGREGATION_FIGHT_SFX_POOL_SIZE = 3;
const CONGREGATION_COUNT_POP_SFX_POOL_SIZE = 3;
const SENTRY_BEAM_SFX_POOL_SIZE = 3;
const SENTRY_BORE_LOOP_SFX_POOL_SIZE = 4;
const SPEAR_TURN_SFX_POOL_SIZE = 4;
const SPEAR_HIT_SFX_POOL_SIZE = 4;
const BOSS_LIGHTNING_THUNDER_SFX_POOL_SIZE = 8;
const PLAYER_DEATH_BELL_FADE_DELAY = 7;
const PLAYER_DEATH_BELL_FADE_DURATION = 1.2;
const MUSIC_VOLUME_INTRO = 0.65;
const MUSIC_VOLUME_BATTLE = 0.7;
const AUDIO_SETTINGS_STORAGE_KEY = "battlechurch_audio_settings";
const DEFAULT_AUDIO_SETTINGS = {
  musicEnabled: true,
  musicVolume: 1,
  sfxEnabled: true,
  sfxVolume: 1,
  showSpeedrunTimer: false,
};
let audioSettings = { ...DEFAULT_AUDIO_SETTINGS };
const MUSIC_FADE_OUT_MS = 1200;
const MUSIC_FADE_FAST_MS = 450;
const arrowSfxPool = [];
const enemyHitSfxPool = [];
const enemyDeathSfxPool = [];
const enemyDeathGruntChannel =
  typeof Audio !== "undefined" ? new Audio() : null;
const swordSfxPool = [];
const meleeWhiffSfxPool = [];
const rushAttackSfxPool = [];
const dashSfxPool = [];
const swordKillSfxPool = [];
const fireballSfxPool = [];
const wisdomSfxPool = [];
const faithCannonSfxPool = [];
const powerupPickupSfxPool = [];
const powerupSpawnSfxPool = [];
const wisdomHitSfxPool = [];
const faithHitSfxPool = [];
const thrashHitSfxPool = [];
const thrashSwipeSfxPool = [];
const thrashLandSfxPool = [];
const prayerBombSfxPool = [];
const prayerBombRainSfxPool = [];
const bossDeathExplosionSfxPool = [];
const menuSelectSfxPool = [];
const menuMoveSfxPool = [];
const enemySpawnSfxPool = [];
const gracePickupSfxPool = [];
const graceLandSfxPool = [];
const saveProgressSfxPool = [];
const recapTickSfxPool = [];
const recapFinalSfxPool = [];
const recapGraceFlySfxPool = [];
const visitorHitSfxPool = [];
const chattyHitSfxPool = [];
let visitorWelcomeSayCooldown = 0;
const visitorSavedSfxPool = [];
const npcHurtSfxPool = [];
const playerHurtSfxPool = [];
const waveTransitionSfxPool = [];
const congregationOverlaySfxPool = [];
const congregationFightSfxPool = [];
const congregationCountPopUpSfxPool = [];
const congregationCountPopDownSfxPool = [];
const sentryBeamSfxPool = [];
const sentryBoreLoopSfxPool = [];
const sentryBoreKillSfxPool = [];
const spearTurnSfxPool = [];
const spearHitSfxPool = [];
const bossLightningThunderSfxPool = [];
const playerDeathBellAudio = typeof Audio !== "undefined" ? new Audio(PLAYER_DEATH_BELL_SFX_SRC) : null;
const spiritRealmAmbientAudio = typeof Audio !== "undefined" ? new Audio(SPIRIT_REALM_AMBIENT_SRC) : null;
const battleTeaserCreepyAudio = typeof Audio !== "undefined" ? new Audio(BATTLE_TEASER_CREEPY_SFX_SRC) : null;
const visitorConversationAmbientAudio =
  typeof Audio !== "undefined" ? new Audio(VISITOR_CONVERSATION_SFX_SRC) : null;
let playerDeathBellFadeTimer = 0;
let playerDeathBellFadeVolume = 1;
let playerDeathBellResume = null;
let playerDeathBellActive = false;
let spiritRealmAmbientPlaying = false;
let spiritRealmAmbientFadingOut = false;
const SPIRIT_REALM_AMBIENT_VOLUME_SCALE = 0.54; // 25% lower than previous 0.72 mix
const BATTLE_TEASER_CREEPY_VOLUME_SCALE = 2.0; // loud teaser bed
const VISITOR_CONVERSATION_SFX_VOLUME_SCALE = 0.7;
let battleTeaserCreepyPlaying = false;
let visitorConversationAmbientPlaying = false;
if (playerDeathBellAudio) {
  playerDeathBellAudio.preload = "auto";
  playerDeathBellAudio.volume = 1;
}
if (spiritRealmAmbientAudio) {
  spiritRealmAmbientAudio.preload = "auto";
  spiritRealmAmbientAudio.loop = true;
}
if (battleTeaserCreepyAudio) {
  battleTeaserCreepyAudio.preload = "auto";
  battleTeaserCreepyAudio.loop = true;
}
if (visitorConversationAmbientAudio) {
  visitorConversationAmbientAudio.preload = "auto";
  visitorConversationAmbientAudio.loop = true;
}
const DEV_ARENA_MUSIC_SRC = "assets/music/suspense.mp3";
const musicState = {
  intro: typeof Audio !== "undefined" ? new Audio(INTRO_MUSIC_SRC) : null,
  battle: typeof Audio !== "undefined" ? new Audio(BATTLE_MUSIC_SRC) : null,
  battleWave3: typeof Audio !== "undefined" ? new Audio(WAVE3_BATTLE_MUSIC_SRC) : null,
  battleBossPhase3: typeof Audio !== "undefined" ? new Audio(BOSS_PHASE3_MUSIC_SRC) : null,
  congregation: typeof Audio !== "undefined" ? new Audio(CONGREGATION_MUSIC_SRC) : null,
  recap: typeof Audio !== "undefined" ? new Audio(RECAP_MUSIC_SRC) : null,
  visitor: typeof Audio !== "undefined" ? new Audio(VISITOR_MUSIC_SRC) : null,
  exterior: typeof Audio !== "undefined" ? new Audio(EXTERIOR_MUSIC_SRC) : null,
  exteriorBoss: typeof Audio !== "undefined" ? new Audio(EXTERIOR_BOSS_MUSIC_SRC) : null,
  bossDeath: typeof Audio !== "undefined" ? new Audio(BOSS_DEATH_MUSIC_SRC) : null,
  devArena: typeof Audio !== "undefined" ? new Audio(DEV_ARENA_MUSIC_SRC) : null,
  introStarted: false,
  battleStarted: false,
  congregationStarted: false,
  recapStarted: false,
  visitorStarted: false,
  exteriorStarted: false,
  exteriorBossStarted: false,
  bossDeathStarted: false,
  introStopped: false,
  battleStopped: false,
  congregationStopped: false,
  recapStopped: false,
  visitorStopped: false,
  exteriorStopped: false,
  exteriorBossStopped: false,
  bossDeathStopped: false,
  exteriorKind: "normal",
  battleTrack: "base",
  battlePrimed: false,
  awaitingUserGesture: false,
  unlocked: false,
  fadeHandles: new Map(),
};
if (musicState.intro) musicState.intro.preload = "auto";
if (musicState.battle) {
  musicState.battle.preload = "auto";
  musicState.battle.loop = true;
}
if (musicState.battleWave3) {
  musicState.battleWave3.preload = "auto";
  musicState.battleWave3.loop = true;
}
if (musicState.battleBossPhase3) {
  musicState.battleBossPhase3.preload = "auto";
  musicState.battleBossPhase3.loop = true;
}
if (musicState.recap) {
  musicState.recap.preload = "auto";
  musicState.recap.loop = false;
}
if (musicState.visitor) {
  musicState.visitor.preload = "auto";
  musicState.visitor.loop = true;
}
if (musicState.exterior) {
  musicState.exterior.preload = "auto";
  musicState.exterior.loop = true;
}
if (musicState.exteriorBoss) {
  musicState.exteriorBoss.preload = "auto";
  musicState.exteriorBoss.loop = false;
}
if (musicState.bossDeath) {
  musicState.bossDeath.preload = "auto";
  musicState.bossDeath.loop = false;
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function loadAudioSettings() {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    audioSettings = {
      ...DEFAULT_AUDIO_SETTINGS,
      ...parsed,
    };
    audioSettings.musicVolume = clamp01(audioSettings.musicVolume);
    audioSettings.sfxVolume = clamp01(audioSettings.sfxVolume);
  } catch (e) {}
}

function formatNumberWithCommas(value) {
  const number = Number.isFinite(value) ? Math.round(value) : 0;
  const sign = number < 0 ? "-" : "";
  const digits = String(Math.abs(number));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}`;
}

function saveAudioSettings() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(audioSettings));
  } catch (e) {}
}

function getEffectiveSfxVolume(volume) {
  if (!audioSettings.sfxEnabled) return 0;
  return clamp01((Number.isFinite(volume) ? volume : 1) * audioSettings.sfxVolume);
}

if (typeof window !== "undefined") {
  window.getEffectiveSfxVolume = getEffectiveSfxVolume;
  window.isSfxEnabled = () => Boolean(audioSettings.sfxEnabled);
  Object.defineProperty(window, "audioSettings", { get: () => audioSettings, configurable: true });
}

function getEffectiveMusicVolume(volume) {
  if (!audioSettings.musicEnabled) return 0;
  return clamp01((Number.isFinite(volume) ? volume : 1) * audioSettings.musicVolume);
}

function getBattleTrackAudio(track = musicState.battleTrack) {
  if (track === "wave3") return musicState.battleWave3;
  if (track === "bossPhase3") return musicState.battleBossPhase3;
  return musicState.battle;
}

function getCurrentBattleAudio() {
  return getBattleTrackAudio(musicState.battleTrack);
}

function getDesiredBattleTrack(levelStatus) {
  const stage = levelStatus?.stage || "";
  const bossStage = stage === "bossIntro" || stage === "bossActive";
  if (bossStage) {
    const bossPhase = Math.max(0, Number(levelStatus?.bossPhase) || 0);
    return bossPhase >= 3 ? "bossPhase3" : "wave3";
  }
  const waveNum = Math.max(0, Number(levelStatus?.waveNum) || 0);
  return waveNum >= 3 ? "wave3" : "base";
}

function refreshMusicPlayback() {
  if (!musicState.unlocked) return;
  if (!audioSettings.musicEnabled) {
    pauseAllMusic();
    return;
  }
  const tracks = [
    { audio: musicState.intro, started: musicState.introStarted, stopped: musicState.introStopped, volume: MUSIC_VOLUME_INTRO },
    {
      audio: musicState.battle,
      started: musicState.battleStarted && musicState.battleTrack === "base",
      stopped: musicState.battleStopped,
      volume: MUSIC_VOLUME_BATTLE,
    },
    {
      audio: musicState.battleWave3,
      started: musicState.battleStarted && musicState.battleTrack === "wave3",
      stopped: musicState.battleStopped,
      volume: MUSIC_VOLUME_BATTLE,
    },
    {
      audio: musicState.battleBossPhase3,
      started: musicState.battleStarted && musicState.battleTrack === "bossPhase3",
      stopped: musicState.battleStopped,
      volume: MUSIC_VOLUME_BATTLE,
    },
    { audio: musicState.recap, started: musicState.recapStarted, stopped: musicState.recapStopped, volume: MUSIC_VOLUME_BATTLE },
    { audio: musicState.visitor, started: musicState.visitorStarted, stopped: musicState.visitorStopped, volume: MUSIC_VOLUME_BATTLE },
    { audio: musicState.exterior, started: musicState.exteriorStarted, stopped: musicState.exteriorStopped, volume: MUSIC_VOLUME_INTRO },
    { audio: musicState.exteriorBoss, started: musicState.exteriorBossStarted, stopped: musicState.exteriorBossStopped, volume: MUSIC_VOLUME_INTRO },
    { audio: musicState.bossDeath, started: musicState.bossDeathStarted, stopped: musicState.bossDeathStopped, volume: MUSIC_VOLUME_BATTLE },
  ];
  tracks.forEach((track) => {
    if (!track.audio) return;
    const effective = getEffectiveMusicVolume(track.volume);
    track.audio.volume = effective;
    if (track.started && !track.stopped && track.audio.paused && effective > 0) {
      playMusic(track.audio, { volume: track.volume, loop: track.audio.loop });
    }
  });
  if (spiritRealmAmbientAudio) {
    spiritRealmAmbientAudio.volume = getEffectiveMusicVolume(MUSIC_VOLUME_INTRO * SPIRIT_REALM_AMBIENT_VOLUME_SCALE);
  }
  if (battleTeaserCreepyAudio) {
    battleTeaserCreepyAudio.volume = getEffectiveMusicVolume(MUSIC_VOLUME_BATTLE * BATTLE_TEASER_CREEPY_VOLUME_SCALE);
  }
  if (visitorConversationAmbientAudio) {
    visitorConversationAmbientAudio.volume = getEffectiveSfxVolume(VISITOR_CONVERSATION_SFX_VOLUME_SCALE);
  }
}

function syncSpiritRealmAmbient() {
  if (!spiritRealmAmbientAudio) return;
  const stage = levelManager?.getStatus ? String(levelManager.getStatus()?.stage || "") : "";
  const isCongregationToTeaser = stage === "congregationToTeaser";
  const shouldPlay = Boolean(
    musicState.unlocked &&
      audioSettings.musicEnabled &&
      typeof window !== "undefined" &&
      window.__congregationSpiritRealmActive === true,
  );
  if (isCongregationToTeaser && (spiritRealmAmbientPlaying || !spiritRealmAmbientAudio.paused)) {
    if (!spiritRealmAmbientFadingOut) {
      spiritRealmAmbientFadingOut = true;
      fadeAudio(spiritRealmAmbientAudio, { to: 0, durationMs: 700, stopOnZero: true });
    }
    return;
  }
  spiritRealmAmbientFadingOut = false;
  spiritRealmAmbientAudio.volume = getEffectiveMusicVolume(MUSIC_VOLUME_INTRO * SPIRIT_REALM_AMBIENT_VOLUME_SCALE);
  if (shouldPlay) {
    cancelFade(spiritRealmAmbientAudio);
    if (!spiritRealmAmbientPlaying || spiritRealmAmbientAudio.paused) {
      spiritRealmAmbientPlaying = true;
      try {
        const playPromise = spiritRealmAmbientAudio.play();
        if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
      } catch (e) {}
    }
    return;
  }
  if (spiritRealmAmbientPlaying || !spiritRealmAmbientAudio.paused) {
    spiritRealmAmbientPlaying = false;
    try {
      spiritRealmAmbientAudio.pause();
    } catch (e) {}
  }
}

function syncBattleTeaserCreepyAmbient() {
  if (!battleTeaserCreepyAudio) return;
  const stage = levelManager?.getStatus ? String(levelManager.getStatus()?.stage || "") : "";
  const inTeaserStage =
    stage === "congregationToTeaser" ||
    stage === "upgradeToTeaser" ||
    stage === "briefingTeaser";
  const targetVolume = getEffectiveMusicVolume(MUSIC_VOLUME_BATTLE * BATTLE_TEASER_CREEPY_VOLUME_SCALE);
  if (musicState.unlocked && audioSettings.musicEnabled && inTeaserStage) {
    if (!battleTeaserCreepyPlaying || battleTeaserCreepyAudio.paused) {
      battleTeaserCreepyPlaying = true;
      battleTeaserCreepyAudio.volume = 0;
      cancelFade(battleTeaserCreepyAudio);
      try {
        const playPromise = battleTeaserCreepyAudio.play();
        if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
      } catch (e) {}
      fadeAudio(battleTeaserCreepyAudio, { to: targetVolume, durationMs: 420, stopOnZero: false });
      return;
    }
    battleTeaserCreepyAudio.volume = targetVolume;
    return;
  }
  if (battleTeaserCreepyPlaying || !battleTeaserCreepyAudio.paused) {
    battleTeaserCreepyPlaying = false;
    fadeAudio(battleTeaserCreepyAudio, { to: 0, durationMs: 280, stopOnZero: true });
  }
}

function syncVisitorConversationAmbient() {
  if (!visitorConversationAmbientAudio) return;
  const shouldPlay = Boolean(
    musicState.unlocked && audioSettings.sfxEnabled && visitorSession?.active,
  );
  const targetVolume = getEffectiveSfxVolume(VISITOR_CONVERSATION_SFX_VOLUME_SCALE);
  if (shouldPlay) {
    cancelFade(visitorConversationAmbientAudio);
    visitorConversationAmbientAudio.volume = targetVolume;
    if (!visitorConversationAmbientPlaying || visitorConversationAmbientAudio.paused) {
      visitorConversationAmbientPlaying = true;
      try {
        const playPromise = visitorConversationAmbientAudio.play();
        if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
      } catch (e) {}
    }
    return;
  }
  if (visitorConversationAmbientPlaying || !visitorConversationAmbientAudio.paused) {
    visitorConversationAmbientPlaying = false;
    fadeAudio(visitorConversationAmbientAudio, { to: 0, durationMs: 220, stopOnZero: true });
  }
}

function applyAudioSettings() {
  refreshMusicPlayback();
  if (playerDeathBellAudio) {
    playerDeathBellAudio.volume = getEffectiveSfxVolume(1);
  }
}

loadAudioSettings();
applyAudioSettings();

function playDefaultArrowSfx(volume = 0.6) {
  return;
}

if (typeof window !== "undefined") {
  window.playDefaultArrowSfx = playDefaultArrowSfx;
}
if (typeof window !== "undefined") {
  window.formatNumberWithCommas = formatNumberWithCommas;
}

/**
 * Play audio from a pool with automatic management
 * @param {Array} pool - The audio pool array to manage
 * @param {string|string[]} src - Audio source path(s). If array, picks randomly
 * @param {number} maxPoolSize - Maximum number of Audio instances in pool
 * @param {Object} options - Playback options
 * @param {number} options.volume - Volume (0-1), default 1.0
 * @param {number} options.playbackRate - Playback speed, default 1.0
 * @param {boolean} options.matchSrc - If true, only reuse audio with matching src
 * @returns {Audio|null} The audio element played, or null if failed
 */
function playPooledSfx(pool, src, maxPoolSize, options = {}) {
  const {
    volume = 1.0,
    playbackRate = 1.0,
    matchSrc = false,
    allowSilentStart = false,
  } = options;

  if (typeof Audio === "undefined") return null;
  const effectiveVolume = getEffectiveSfxVolume(volume);
  if (effectiveVolume <= 0 && !allowSilentStart) return null;

  // Handle random source selection from array
  const selectedSrc = Array.isArray(src)
    ? src[Math.floor(Math.random() * src.length)]
    : src;

  // Find available audio element
  let audio = null;
  if (matchSrc) {
    // Only reuse audio with matching source
    audio = pool.find(
      (entry) => entry.src && entry.src.includes(selectedSrc) && (entry.paused || entry.ended)
    );
  } else {
    // Reuse any available audio
    audio = pool.find((entry) => entry.paused || entry.ended);
  }

  if (!audio) {
    // Create new audio if pool not full
    if (pool.length < maxPoolSize) {
      audio = new Audio(selectedSrc);
      audio.preload = "auto";
      pool.push(audio);
    } else {
      // Reuse oldest audio from pool
      audio = pool[0];
      if (audio.src !== selectedSrc) {
        audio.src = selectedSrc;
      }
    }
  }

  try {
    audio.currentTime = 0;
    audio.volume = Math.max(0, Math.min(1, effectiveVolume));
    audio.playbackRate = playbackRate;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
    return audio;
  } catch (err) {
    return null;
  }
}

function playEnemyHitSfx(volume = 1) {
  playPooledSfx(enemyHitSfxPool, ENEMY_HIT_SFX_SRCS, ENEMY_HIT_SFX_POOL_SIZE, { volume, matchSrc: true });
}

function playSentryBoreKillSfx(volume = 0.75) {
  playPooledSfx(sentryBoreKillSfxPool, SENTRY_BORE_KILL_SFX_SRC, 2, { volume, matchSrc: true });
}

function playSentryBeamSfx(volume = 0.55) {
  playPooledSfx(
    sentryBeamSfxPool,
    SENTRY_BEAM_SFX_SRCS,
    SENTRY_BEAM_SFX_POOL_SIZE,
    { volume, matchSrc: true },
  );
}

function playSentryBoreLoopSfx(volume = 0.55) {
  playPooledSfx(
    sentryBoreLoopSfxPool,
    SENTRY_BORE_LOOP_SFX_SRCS,
    SENTRY_BORE_LOOP_SFX_POOL_SIZE,
    { volume, matchSrc: true },
  );
}

function playSpearTurnSfx(volume = 0.6) {
  playPooledSfx(
    spearTurnSfxPool,
    SPEAR_TURN_SFX_SRCS,
    SPEAR_TURN_SFX_POOL_SIZE,
    { volume, matchSrc: true },
  );
}

function playSpearHitSfx(volume = 0.75) {
  playPooledSfx(
    spearHitSfxPool,
    SPEAR_HIT_SFX_SRCS,
    SPEAR_HIT_SFX_POOL_SIZE,
    { volume, matchSrc: true },
  );
}

function playBossLightningThunderSfx(volume = 0.5) {
  playPooledSfx(
    bossLightningThunderSfxPool,
    BOSS_LIGHTNING_THUNDER_SFX_SRCS,
    BOSS_LIGHTNING_THUNDER_SFX_POOL_SIZE,
    // Keep overlaps layered; do not force same-src matching for this stuttery lightning use-case.
    { volume, matchSrc: false },
  );
}

if (typeof window !== "undefined") {
  window.playEnemyHitSfx = playEnemyHitSfx;
  window.playBossLightningThunderSfx = playBossLightningThunderSfx;
}

function playHighHealthEnemyDeathSfx(volume = 1.0) {
  if (typeof Audio === "undefined") return;
  const effectiveVolume = getEffectiveSfxVolume(volume);
  if (effectiveVolume <= 0) return;
  const channel = enemyDeathGruntChannel;
  if (channel && !channel.paused && !channel.ended) return;
  const audio = channel || new Audio();
  try {
    audio.src = HIGH_HEALTH_DEATH_GRUNT_SRC;
    audio.currentTime = 0;
    audio.volume = effectiveVolume;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch (err) {}
}

if (typeof window !== "undefined") {
  window.playHighHealthEnemyDeathSfx = playHighHealthEnemyDeathSfx;
}

function playNpcHurtSfx(volume = 0.6) {
  playPooledSfx(npcHurtSfxPool, NPC_HURT_SFX_SRC, NPC_HURT_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  window.playNpcHurtSfx = playNpcHurtSfx;
}

function playPlayerHurtSfx(volume = 1.0) {
  playPooledSfx(playerHurtSfxPool, PLAYER_HURT_SFX_SRC, PLAYER_HURT_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  window.playPlayerHurtSfx = playPlayerHurtSfx;
}

function playPrayerBombSfx(volume = 0.7) {
  playPooledSfx(prayerBombSfxPool, PRAYER_BOMB_SFX_SRC, PRAYER_BOMB_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  window.playPrayerBombSfx = playPrayerBombSfx;
}

function playPrayerBombRainSfx(volume = 0.6) {
  playPooledSfx(prayerBombRainSfxPool, PRAYER_BOMB_RAIN_SFX_SRCS, PRAYER_BOMB_RAIN_SFX_POOL_SIZE, { volume, matchSrc: true });
}

if (typeof window !== "undefined") {
  window.playPrayerBombRainSfx = playPrayerBombRainSfx;
}

function playPlayerDeathBell(volume = 1.0) {
  if (!playerDeathBellAudio) return;
  const effectiveVolume = getEffectiveSfxVolume(volume);
  const activeBattleAudio = getCurrentBattleAudio();
  playerDeathBellResume = {
    intro: Boolean(musicState.intro && !musicState.intro.paused && !musicState.introStopped),
    battle: Boolean(activeBattleAudio && !activeBattleAudio.paused && !musicState.battleStopped),
    recap: Boolean(musicState.recap && !musicState.recap.paused && !musicState.recapStopped),
  };
  playerDeathBellActive = true;
  pauseAllMusic();
  try {
    playerDeathBellAudio.pause();
    playerDeathBellAudio.currentTime = 0;
    playerDeathBellAudio.volume = effectiveVolume;
    playerDeathBellAudio.playbackRate = 1;
    playerDeathBellAudio.loop = false;
    const playPromise = playerDeathBellAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch (err) {}
  playerDeathBellFadeTimer = PLAYER_DEATH_BELL_FADE_DELAY + PLAYER_DEATH_BELL_FADE_DURATION;
  playerDeathBellFadeVolume = effectiveVolume;
}

function stopPlayerDeathBell() {
  if (!playerDeathBellAudio) return;
  try {
    playerDeathBellAudio.pause();
    playerDeathBellAudio.currentTime = 0;
  } catch (err) {}
  playerDeathBellFadeTimer = 0;
  playerDeathBellResume = null;
  playerDeathBellActive = false;
}

function playEnemyDeathSfx(volume = 0.35) {
  if (typeof Audio === "undefined") return;
  const effectiveVolume = getEffectiveSfxVolume(volume);
  if (effectiveVolume <= 0) return;
  const gruntChannel = enemyDeathGruntChannel;
  const isGruntPlaying = enemyDeathSfxPool.some(
    (entry) =>
      entry.src &&
      ENEMY_DEATH_GRUNT_SRCS.some((grunt) => entry.src.includes(grunt)) &&
      !entry.paused &&
      !entry.ended,
  );
  let src = ENEMY_DEATH_SFX_SRCS[Math.floor(Math.random() * ENEMY_DEATH_SFX_SRCS.length)];
  const gruntBusy =
    gruntChannel && !gruntChannel.paused && !gruntChannel.ended;
  if (ENEMY_DEATH_GRUNT_SRCS.includes(src) && (isGruntPlaying || gruntBusy)) {
    if (!ENEMY_DEATH_MONSTER_SRCS.length) return;
    src = ENEMY_DEATH_MONSTER_SRCS[Math.floor(Math.random() * ENEMY_DEATH_MONSTER_SRCS.length)];
  }
  const isGrunt = ENEMY_DEATH_GRUNT_SRCS.includes(src);
  let audio = null;
  if (isGrunt && gruntChannel) {
    audio = gruntChannel;
    audio.src = src;
  } else {
    audio = enemyDeathSfxPool.find(
      (entry) => entry.src && entry.src.includes(src) && (entry.paused || entry.ended),
    );
    if (!audio) {
      if (enemyDeathSfxPool.length < ENEMY_DEATH_SFX_POOL_SIZE) {
        audio = new Audio(src);
        audio.preload = "auto";
        enemyDeathSfxPool.push(audio);
      } else {
        audio = enemyDeathSfxPool[0];
        audio.src = src;
      }
    }
  }
  try {
    audio.currentTime = 0;
    audio.volume = isGrunt ? effectiveVolume * 0.6 : effectiveVolume;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch (err) {}
}

if (typeof window !== "undefined") {
  window.playEnemyDeathSfx = playEnemyDeathSfx;
}

function playSwordSwingSfx(volume = 0.55) {
  playPooledSfx(swordSfxPool, SWORD_SWING_SFX_SRC, SWORD_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  window.playSwordSwingSfx = playSwordSwingSfx;
}

function playSwordSfx(volume = 0.55) {
  playSwordSwingSfx(volume);
}

function playSwooshSfx(volume = 0.55) {
  playSwordSwingSfx(volume);
}

function playMeleeWhiffSfx(volume = 0.9) {
  playPooledSfx(meleeWhiffSfxPool, MELEE_WHIFF_SFX_SRC, MELEE_WHIFF_SFX_POOL_SIZE, { volume });
}

function playRushAttackSfx(volume = 0.7) {
  playPooledSfx(
    rushAttackSfxPool,
    RUSH_ATTACK_SFX_SRC,
    RUSH_ATTACK_SFX_POOL_SIZE,
    { volume, matchSrc: true },
  );
}

function playDashSfx(volume = 0.7) {
  playPooledSfx(dashSfxPool, DASH_SFX_SRC, DASH_SFX_POOL_SIZE, { volume, matchSrc: true });
}

function playSwordKillSfx(volume = 0.7) {
  playPooledSfx(swordKillSfxPool, SWORD_KILL_SFX_SRCS, SWORD_KILL_SFX_POOL_SIZE, { volume, matchSrc: true });
}

if (typeof window !== "undefined") {
  window.playSwordKillSfx = playSwordKillSfx;
}

function playFireballCastSfx(volume = 0.55) {
  playPooledSfx(fireballSfxPool, FIREBALL_CAST_SFX_SRCS, FIREBALL_SFX_POOL_SIZE, { volume, matchSrc: true });
}

if (typeof window !== "undefined") {
  window.playFireballCastSfx = playFireballCastSfx;
}

function playDivineShotSfx(volume = 1.0) {
  if (typeof Audio === "undefined") return;
  const effectiveVolume = getEffectiveSfxVolume(volume);
  if (effectiveVolume <= 0) return;
  const src = DIVINE_SHOT_SFX_SRC;
  let audio = fireballSfxPool.find(
    (entry) => entry.src && entry.src.includes(src) && (entry.paused || entry.ended),
  );
  if (!audio) {
    if (fireballSfxPool.length < FIREBALL_SFX_POOL_SIZE) {
      audio = new Audio(src);
      audio.preload = "auto";
      fireballSfxPool.push(audio);
    } else {
      audio = fireballSfxPool[0];
      audio.src = src;
    }
  }
  try {
    audio.currentTime = 0;
    audio.volume = effectiveVolume;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch (err) {}
}

if (typeof window !== "undefined") {
  window.playDivineShotSfx = playDivineShotSfx;
}

function playWisdomCastSfx(volume = 0.55) {
  playPooledSfx(wisdomSfxPool, WISDOM_CAST_SFX_SRCS, WISDOM_SFX_POOL_SIZE, { volume, matchSrc: true });
}

if (typeof window !== "undefined") {
  window.playWisdomCastSfx = playWisdomCastSfx;
}

function playWisdomHitSfx(volume = 0.8) {
  playPooledSfx(wisdomHitSfxPool, WISDOM_HIT_SFX_SRCS, WISDOM_HIT_SFX_POOL_SIZE, { volume, matchSrc: true });
}

if (typeof window !== "undefined") {
  window.playWisdomHitSfx = playWisdomHitSfx;
}

function playFaithCannonSfx(volume = 0.55) {
  playPooledSfx(faithCannonSfxPool, FAITH_CANNON_SFX_SRCS, FAITH_CANNON_SFX_POOL_SIZE, { volume, matchSrc: true });
}

if (typeof window !== "undefined") {
  window.playFaithCannonSfx = playFaithCannonSfx;
}

function playFaithHitSfx(volume = 0.8) {
  playPooledSfx(faithHitSfxPool, FAITH_HIT_SFX_SRCS, FAITH_HIT_SFX_POOL_SIZE, { volume, matchSrc: true });
}

if (typeof window !== "undefined") {
  window.playFaithHitSfx = playFaithHitSfx;
}

function playThrashHitSfx(volume = 0.8) {
  playPooledSfx(thrashHitSfxPool, THRASH_HIT_SFX_SRCS, THRASH_HIT_SFX_POOL_SIZE, { volume });
}

function playThrashSwipeSfx(stepIndex = 0, volume = 0.78) {
  const list = Array.isArray(THRASH_SWIPE_SFX_SRCS) ? THRASH_SWIPE_SFX_SRCS : [];
  if (!list.length) return;
  const safeIndex = Math.max(0, Number(stepIndex) || 0) % list.length;
  const src = list[safeIndex];
  playPooledSfx(thrashSwipeSfxPool, src, THRASH_SWIPE_SFX_POOL_SIZE, {
    volume,
    matchSrc: true,
  });
}

function playThrashLandSfx(volume = 0.82) {
  playPooledSfx(thrashLandSfxPool, THRASH_LAND_SFX_SRCS, THRASH_LAND_SFX_POOL_SIZE, {
    volume,
    matchSrc: true,
  });
}

function playPowerupPickupSfx(volume = 1.2) {
  playPooledSfx(powerupPickupSfxPool, POWERUP_PICKUP_SFX_SRC, POWERUP_PICKUP_SFX_POOL_SIZE, { volume });
}

function playPowerupSpawnSfx(volume = 0.8) {
  playPooledSfx(powerupSpawnSfxPool, POWERUP_SPAWN_SFX_SRC, POWERUP_SPAWN_SFX_POOL_SIZE, {
    volume,
    matchSrc: true,
  });
}

if (typeof window !== "undefined") {
  // Keep separate hooks so we can swap SFX independently later.
  window.playWeaponPowerupPickupSfx = playPowerupPickupSfx;
  window.playUtilityPowerupPickupSfx = playPowerupPickupSfx;
}

function playGracePickupSfx(volume = 0.2) {
  playPooledSfx(gracePickupSfxPool, GRACE_PICKUP_SFX_SRC, GRACE_PICKUP_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  window.playGracePickupSfx = playGracePickupSfx;
}

function playGraceLandSfx(volume = 0.28) {
  playPooledSfx(graceLandSfxPool, GRACE_LAND_SFX_SRC, GRACE_LAND_SFX_POOL_SIZE, { volume });
}

function playProgressSavedSfx(volume = 0.55) {
  playPooledSfx(saveProgressSfxPool, SAVE_PROGRESS_SFX_SRC, SAVE_PROGRESS_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  window.playProgressSavedSfx = playProgressSavedSfx;
}

function playMenuSelectSfx(volume = 0.55) {
  playPooledSfx(menuSelectSfxPool, MENU_SELECT_SFX_SRC, MENU_SELECT_SFX_POOL_SIZE, { volume });
}

function playMenuMoveSfx(volume = 0.45) {
  playPooledSfx(menuMoveSfxPool, MENU_MOVE_SFX_SRC, MENU_SELECT_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  // Separate hooks so menu pick vs advance can diverge later.
  window.playMenuItemPickSfx = playMenuSelectSfx;
  window.playMenuAdvanceSfx = playMenuSelectSfx;
  window.playMenuMoveSfx = playMenuMoveSfx;
}

function playWaveTransitionSfx(volume = 0.78) {
  playPooledSfx(
    waveTransitionSfxPool,
    WAVE_TRANSITION_SFX_SRC,
    WAVE_TRANSITION_SFX_POOL_SIZE,
    { volume, matchSrc: true },
  );
}

function playRecapTickSfx(volume = 0.5) {
  playPooledSfx(recapTickSfxPool, RECAP_TICK_SFX_SRC, RECAP_TICK_SFX_POOL_SIZE, { volume });
}

function playRecapFinalSfx(volume = 0.7) {
  playPooledSfx(recapFinalSfxPool, RECAP_FINAL_SFX_SRC, RECAP_FINAL_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  window.playRecapTickSfx = playRecapTickSfx;
  window.playRecapFinalSfx = playRecapFinalSfx;
}

function playRecapGraceFlySfx(volume = 0.5) {
  playPooledSfx(
    recapGraceFlySfxPool,
    RECAP_GRACE_FLY_SFX_SRC,
    RECAP_GRACE_FLY_SFX_POOL_SIZE,
    { volume },
  );
}

if (typeof window !== "undefined") {
  window.playRecapGraceFlySfx = playRecapGraceFlySfx;
}

function playEnemySpawnSfx(volume = 0.55, options = {}) {
  const maxHealth =
    Number.isFinite(options?.maxHealth) ? options.maxHealth : null;
  let src = ENEMY_SPAWN_SFX_SRC;
  if (maxHealth !== null) {
    const match = ENEMY_SPAWN_HIGH_SFX.find((entry) => maxHealth > entry.minHealth);
    if (match) src = match.src;
  }
  playPooledSfx(enemySpawnSfxPool, src, ENEMY_SPAWN_SFX_POOL_SIZE, { volume });
}

if (typeof window !== "undefined") {
  window.playEnemySpawnSfx = playEnemySpawnSfx;
}

function cancelFade(audio) {
  if (!audio) return;
  const prev = musicState.fadeHandles.get(audio);
  if (prev) cancelAnimationFrame(prev);
  musicState.fadeHandles.delete(audio);
}

function fadeAudio(audio, { to = 0, durationMs = 800, stopOnZero = true } = {}) {
  if (!audio) return;
  cancelFade(audio);
  const from = Number.isFinite(audio.volume) ? audio.volume : 0;
  if (durationMs <= 0 || from === to) {
    audio.volume = to;
    if (stopOnZero && to === 0) audio.pause();
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    audio.volume = from + (to - from) * t;
    if (t < 1) {
      const handle = requestAnimationFrame(step);
      musicState.fadeHandles.set(audio, handle);
      return;
    }
    musicState.fadeHandles.delete(audio);
    if (stopOnZero && to === 0) audio.pause();
  };
  const handle = requestAnimationFrame(step);
  musicState.fadeHandles.set(audio, handle);
}

function playMusic(audio, { volume = 0.7, loop = false } = {}) {
  if (!audio) return;
  const effectiveVolume = getEffectiveMusicVolume(volume);
  if (effectiveVolume <= 0) return;
  // Stop all other tracks before starting this one
  const allTracks = [
    musicState.intro, musicState.battle, musicState.battleWave3,
    musicState.battleBossPhase3, musicState.recap, musicState.visitor,
    musicState.exterior, musicState.exteriorBoss, musicState.bossDeath,
    musicState.congregation,
  ];
  allTracks.forEach((track) => {
    if (track && track !== audio && !track.paused) {
      try { track.pause(); } catch (e) {}
    }
  });
  audio.loop = loop;
  audio.volume = effectiveVolume;
  try {
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch (err) {}
}

function startIntroMusic() {
  if (!musicState.intro || musicState.introStarted || musicState.introStopped) return;
  musicState.introStarted = true;
  playMusic(musicState.intro, { volume: MUSIC_VOLUME_INTRO, loop: true });
}

function handleIntroMusicEnded() {
  if (!musicState.unlocked) return;
  if (titleScreenActive) return;
  if (musicState.introStopped) return;
  if (musicState.battleStarted && !musicState.battleStopped) return;
  if (musicState.recapStarted && !musicState.recapStopped) return;
  if (musicState.visitorStarted && !musicState.visitorStopped) return;
  if (musicState.exteriorStarted && !musicState.exteriorStopped) return;
  if (musicState.exteriorBossStarted && !musicState.exteriorBossStopped) return;
  if (musicState.bossDeathStarted && !musicState.bossDeathStopped) return;
  musicState.introStopped = true;
  startExteriorMusic({ boss: false });
}

function startExteriorMusic({ boss = false } = {}) {
  const target = boss ? musicState.exteriorBoss : musicState.exterior;
  if (!target) return;
  if (musicState.battleStarted && !musicState.battleStopped) fadeOutBattleMusic();
  if (musicState.introStarted && !musicState.introStopped) stopIntroMusic();
  if (musicState.recapStarted && !musicState.recapStopped && musicState.recap) {
    fadeAudio(musicState.recap, { to: 0, durationMs: 700, stopOnZero: true });
    musicState.recapStopped = true;
  }
  musicState.exteriorStopped = false;
  musicState.exteriorBossStopped = false;
  musicState.exteriorStarted = !boss;
  musicState.exteriorBossStarted = Boolean(boss);
  musicState.exteriorKind = boss ? "boss" : "normal";
  cancelFade(target);
  try {
    target.currentTime = 0;
  } catch (e) {}
  playMusic(target, { volume: MUSIC_VOLUME_INTRO, loop: !boss });
}

function stopExteriorMusic() {
  if (musicState.exterior && !musicState.exteriorStopped) {
    musicState.exteriorStopped = true;
    fadeAudio(musicState.exterior, { to: 0, durationMs: MUSIC_FADE_OUT_MS, stopOnZero: true });
  }
  if (musicState.exteriorBoss && !musicState.exteriorBossStopped) {
    musicState.exteriorBossStopped = true;
    fadeAudio(musicState.exteriorBoss, { to: 0, durationMs: MUSIC_FADE_OUT_MS, stopOnZero: true });
  }
}

function startMapMusic() {
  if (!musicState.intro) return;
  if (musicState.battleStarted && !musicState.battleStopped) fadeOutBattleMusic();
  if (musicState.recapStarted && !musicState.recapStopped) stopRecapMusic();
  if (musicState.exteriorStarted && !musicState.exteriorStopped) stopExteriorMusic();
  musicState.introStopped = false;
  musicState.introStarted = true;
  cancelFade(musicState.intro);
  playMusic(musicState.intro, { volume: MUSIC_VOLUME_INTRO, loop: false });
}

if (musicState.intro) {
  musicState.intro.addEventListener("ended", handleIntroMusicEnded);
}

function triggerIntroMusicFromInput() {
  if (!musicState.intro || musicState.introStopped) return;
  if (!musicState.introStarted) {
    startIntroMusic();
    return;
  }
  if (musicState.intro.paused) {
    playMusic(musicState.intro, { volume: MUSIC_VOLUME_INTRO, loop: false });
  }
}

function stopIntroMusic() {
  if (!musicState.intro || musicState.introStopped) return;
  musicState.introStopped = true;
  fadeAudio(musicState.intro, { to: 0, durationMs: MUSIC_FADE_OUT_MS, stopOnZero: true });
}

function startBattleMusic(track = "base") {
  const desiredTrack = track === "wave3" || track === "bossPhase3" ? track : "base";
  const desiredAudio = getBattleTrackAudio(desiredTrack);
  if (!desiredAudio) return;
  // If boss exterior music is playing, don't start regular battle music - let boss music continue
  if (musicState.exteriorBossStarted && !musicState.exteriorBossStopped) return;
  if (musicState.bossDeathStarted && !musicState.bossDeathStopped) return;
  const currentAudio = getCurrentBattleAudio();
  if (currentAudio && currentAudio !== desiredAudio) {
    cancelFade(currentAudio);
    fadeAudio(currentAudio, { to: 0, durationMs: MUSIC_FADE_FAST_MS, stopOnZero: true });
  }
  cancelFade(desiredAudio);
  if (musicState.exteriorStarted && !musicState.exteriorStopped) stopExteriorMusic();
  musicState.battleTrack = desiredTrack;
  musicState.battleStopped = false;
  musicState.battleStarted = true;
  playMusic(desiredAudio, { volume: MUSIC_VOLUME_BATTLE, loop: true });
}

function startBossDeathMusic() {
  if (!musicState.bossDeath) return;
  if (musicState.bossDeathStarted && !musicState.bossDeathStopped) return;
  if (musicState.battleStarted && !musicState.battleStopped) fadeOutBattleMusic();
  if (musicState.exteriorStarted && !musicState.exteriorStopped) stopExteriorMusic();
  if (musicState.exteriorBossStarted && !musicState.exteriorBossStopped) stopExteriorMusic();
  musicState.bossDeathStarted = true;
  musicState.bossDeathStopped = false;
  cancelFade(musicState.bossDeath);
  try {
    musicState.bossDeath.currentTime = 0;
  } catch (e) {}
  playMusic(musicState.bossDeath, { volume: MUSIC_VOLUME_BATTLE, loop: false });
}

function startBattleVictoryMusic() {
  if (!musicState.unlocked) return;
  fadeOutBattleMusic();
  startRecapMusic();
}

function startCongregationMusic() {
  if (!musicState.congregation || !musicState.unlocked) return;
  if (musicState.congregationStarted && !musicState.congregationStopped) return;
  musicState.congregationStarted = true;
  musicState.congregationStopped = false;
  playMusic(musicState.congregation, { volume: MUSIC_VOLUME_INTRO, loop: true });
}

function stopCongregationMusic() {
  if (!musicState.congregation || musicState.congregationStopped) return;
  musicState.congregationStopped = true;
  fadeAudio(musicState.congregation, { to: 0, durationMs: MUSIC_FADE_OUT_MS, stopOnZero: true });
}

function startRecapMusic() {
  if (!musicState.recap || !musicState.unlocked) return;
  if (musicState.recapStarted && !musicState.recapStopped) return;
  if (musicState.exteriorStarted || musicState.exteriorBossStarted) {
    stopExteriorMusic();
  }
  if (musicState.bossDeathStarted && !musicState.bossDeathStopped && musicState.bossDeath) {
    musicState.bossDeathStopped = true;
    fadeAudio(musicState.bossDeath, { to: 0, durationMs: 900, stopOnZero: true });
  }
  musicState.recapStarted = true;
  musicState.recapStopped = false;
  playMusic(musicState.recap, { volume: MUSIC_VOLUME_BATTLE, loop: false });
}

function startVisitorMusic() {
  if (!musicState.visitor || !musicState.unlocked) return;
  if (musicState.visitorStarted && !musicState.visitorStopped) return;
  musicState.visitorStarted = true;
  musicState.visitorStopped = false;
  playMusic(musicState.visitor, { volume: MUSIC_VOLUME_BATTLE, loop: true });
}

function startEpilogueMusic() {
  if (!musicState.recap || !musicState.unlocked) return;
  musicState.recapStarted = true;
  musicState.recapStopped = false;
  playMusic(musicState.recap, { volume: MUSIC_VOLUME_BATTLE, loop: true });
}

function stopRecapMusic() {
  if (!musicState.recap || musicState.recapStopped) return;
  musicState.recapStopped = true;
  fadeAudio(musicState.recap, { to: 0, durationMs: MUSIC_FADE_OUT_MS, stopOnZero: true });
}

function stopVisitorMusic() {
  if (!musicState.visitor || musicState.visitorStopped) return;
  musicState.visitorStopped = true;
  fadeAudio(musicState.visitor, { to: 0, durationMs: MUSIC_FADE_OUT_MS, stopOnZero: true });
}

function stopBattleMusicFast() {
  const activeBattleAudio = getCurrentBattleAudio();
  if (!activeBattleAudio || musicState.battleStopped) return;
  musicState.battleStopped = true;
  fadeAudio(activeBattleAudio, { to: 0, durationMs: MUSIC_FADE_FAST_MS, stopOnZero: true });
}

function fadeOutBattleMusic() {
  const activeBattleAudio = getCurrentBattleAudio();
  if (!activeBattleAudio || musicState.battleStopped) return;
  musicState.battleStopped = true;
  musicState.battleStarted = false;
  fadeAudio(activeBattleAudio, { to: 0, durationMs: MUSIC_FADE_OUT_MS, stopOnZero: true });
}

function startMissionIntroFade(holdSeconds = MISSION_INTRO_HOLD_SECONDS) {
  const hold = Math.max(0, Number(holdSeconds) || 0);
  const total = MISSION_INTRO_FADE_IN + MISSION_INTRO_FADE_OUT + hold;
  battlefieldIntroFadeDuration = Math.max(total, MISSION_INTRO_FADE_IN + MISSION_INTRO_FADE_OUT);
  battlefieldIntroFadeTimer = battlefieldIntroFadeDuration;
  battlefieldIntroFadeAlpha = 0;
}

function startGraceRushEndFade(duration = 1) {
  const total = Math.max(0.1, Number(duration) || 1);
  graceRushFadeDuration = total;
  graceRushFadeTimer = total;
  graceRushFadeAlpha = 0;
  graceRushFadeHold = false;
  graceRushFadeReleaseTimer = 0;
  graceRushBlackout = false;
}

function startBossBonusTransition(duration = 1.0) {
  const total = Math.max(0.1, Number(duration) || 1.0);
  bossBonusTransitionFadeDuration = total;
  bossBonusTransitionFadeTimer = total;
  bossBonusTransitionFadeAlpha = 0;
  fadeOutBattleMusic();
  if (musicState.bossDeath && musicState.bossDeathStarted && !musicState.bossDeathStopped) {
    musicState.bossDeathStopped = true;
    fadeAudio(musicState.bossDeath, {
      to: 0,
      durationMs: Math.max(250, Math.round(total * 1000)),
      stopOnZero: true,
    });
  }
}

function startRecapIntroFade(duration = 0.65) {
  const total = Math.max(0.1, Number(duration) || 0.65);
  recapIntroFadeDuration = total;
  recapIntroFadeTimer = total;
  recapIntroFadeAlpha = 1;
}

function pauseAllMusic() {
  if (musicState.intro) musicState.intro.pause();
  if (musicState.battle) musicState.battle.pause();
  if (musicState.battleWave3) musicState.battleWave3.pause();
  if (musicState.battleBossPhase3) musicState.battleBossPhase3.pause();
  if (musicState.recap) musicState.recap.pause();
  if (musicState.visitor) musicState.visitor.pause();
  if (musicState.exterior) musicState.exterior.pause();
  if (musicState.exteriorBoss) musicState.exteriorBoss.pause();
  if (musicState.bossDeath) musicState.bossDeath.pause();
  if (spiritRealmAmbientAudio) spiritRealmAmbientAudio.pause();
  if (battleTeaserCreepyAudio) battleTeaserCreepyAudio.pause();
  if (visitorConversationAmbientAudio) visitorConversationAmbientAudio.pause();
  spiritRealmAmbientPlaying = false;
  spiritRealmAmbientFadingOut = false;
  battleTeaserCreepyPlaying = false;
  visitorConversationAmbientPlaying = false;
}

function resumeBattleMusicIfNeeded() {
  if (!musicState.unlocked) return;
  if (!formationState?.current) return;
  const status = levelManager?.getStatus ? levelManager.getStatus() : null;
  const stage = status?.stage || "";
  const shouldPlay =
    stage === "npcArrival" ||
    stage === "waveIntro" ||
    stage === "waveActive" ||
    stage === "allKillBreak" ||
    stage === "waveCleared" ||
    stage === "bossIntro" ||
    stage === "bossActive" ||
    musicState.battlePrimed;
  if (shouldPlay) {
    const desiredTrack = getDesiredBattleTrack(status);
    if (!musicState.battleStarted) {
      startBattleMusic(desiredTrack);
    } else {
      if (musicState.battleTrack !== desiredTrack) {
        startBattleMusic(desiredTrack);
        return;
      }
      const activeBattleAudio = getCurrentBattleAudio();
      if (activeBattleAudio && activeBattleAudio.paused) {
        playMusic(activeBattleAudio, { volume: MUSIC_VOLUME_BATTLE, loop: true });
      }
    }
  }
}

function shouldStartBattleMusicNow() {
  const status = levelManager?.getStatus ? levelManager.getStatus() : null;
  if (!formationState?.current) return false;
  return Boolean(
    status?.stage === "npcArrival" ||
      status?.stage === "waveIntro" ||
      status?.stage === "waveActive" ||
      status?.stage === "allKillBreak" ||
      status?.stage === "waveCleared" ||
      status?.stage === "bossIntro" ||
      status?.stage === "bossActive" ||
      musicState.battlePrimed,
  );
}

function unlockMusicOnGesture() {
  if (musicState.unlocked) return;
  musicState.unlocked = true;
  // Don't auto-start intro music on first click - wait for Play button
  // But do start battle music if we're already in a battle
  if (!musicState.battleStarted && !musicState.battleStopped && shouldStartBattleMusicNow()) {
    const status = levelManager?.getStatus ? levelManager.getStatus() : null;
    startBattleMusic(getDesiredBattleTrack(status));
  }
}

function startMusicOnFirstClick() {
  if (musicState.awaitingUserGesture) return;
  musicState.awaitingUserGesture = true;
  const handler = () => {
    musicState.awaitingUserGesture = false;
    unlockMusicOnGesture();
  };
  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("touchstart", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });
}

function resetMusicState() {
  if (musicState.intro) {
    cancelFade(musicState.intro);
    musicState.intro.pause();
    musicState.intro.currentTime = 0;
    musicState.intro.volume = 0;
  }
  if (musicState.congregation) {
    cancelFade(musicState.congregation);
    musicState.congregation.pause();
    musicState.congregation.currentTime = 0;
    musicState.congregation.volume = 0;
  }
  if (musicState.battle) {
    cancelFade(musicState.battle);
    musicState.battle.pause();
    musicState.battle.currentTime = 0;
    musicState.battle.volume = 0;
  }
  if (musicState.battleWave3) {
    cancelFade(musicState.battleWave3);
    musicState.battleWave3.pause();
    musicState.battleWave3.currentTime = 0;
    musicState.battleWave3.volume = 0;
  }
  if (musicState.battleBossPhase3) {
    cancelFade(musicState.battleBossPhase3);
    musicState.battleBossPhase3.pause();
    musicState.battleBossPhase3.currentTime = 0;
    musicState.battleBossPhase3.volume = 0;
  }
  if (musicState.recap) {
    cancelFade(musicState.recap);
    musicState.recap.pause();
    musicState.recap.currentTime = 0;
    musicState.recap.volume = 0;
  }
  if (musicState.visitor) {
    cancelFade(musicState.visitor);
    musicState.visitor.pause();
    musicState.visitor.currentTime = 0;
    musicState.visitor.volume = 0;
  }
  if (musicState.exterior) {
    cancelFade(musicState.exterior);
    musicState.exterior.pause();
    musicState.exterior.currentTime = 0;
    musicState.exterior.volume = 0;
  }
  if (musicState.exteriorBoss) {
    cancelFade(musicState.exteriorBoss);
    musicState.exteriorBoss.pause();
    musicState.exteriorBoss.currentTime = 0;
    musicState.exteriorBoss.volume = 0;
  }
  if (musicState.bossDeath) {
    cancelFade(musicState.bossDeath);
    musicState.bossDeath.pause();
    musicState.bossDeath.currentTime = 0;
    musicState.bossDeath.volume = 0;
  }
  if (visitorConversationAmbientAudio) {
    cancelFade(visitorConversationAmbientAudio);
    visitorConversationAmbientAudio.pause();
    visitorConversationAmbientAudio.currentTime = 0;
    visitorConversationAmbientAudio.volume = 0;
  }
  visitorConversationAmbientPlaying = false;
  musicState.introStarted = false;
  musicState.congregationStarted = false;
  musicState.battleStarted = false;
  musicState.recapStarted = false;
  musicState.visitorStarted = false;
  musicState.exteriorStarted = false;
  musicState.exteriorBossStarted = false;
  musicState.bossDeathStarted = false;
  musicState.introStopped = false;
  musicState.congregationStopped = false;
  musicState.battleStopped = false;
  musicState.recapStopped = false;
  musicState.visitorStopped = false;
  musicState.exteriorStopped = false;
  musicState.exteriorBossStopped = false;
  musicState.bossDeathStopped = false;
  musicState.exteriorKind = "normal";
  musicState.battleTrack = "base";
  musicState.awaitingUserGesture = false;
  musicState.unlocked = false;
}

if (typeof window !== "undefined") {
  window.stopIntroMusic = stopIntroMusic;
  window.stopBattleMusicFast = stopBattleMusicFast;
  window.fadeOutBattleMusic = fadeOutBattleMusic;
  window.startMapMusic = startMapMusic;
  window.startExteriorMusic = startExteriorMusic;
  window.startBattleMusicFromFormation = () => {
    musicState.battlePrimed = true;
    musicState.unlocked = true;
    startBattleMusic();
  };
  window.pauseAllMusic = pauseAllMusic;
  window.resumeBattleMusicIfNeeded = resumeBattleMusicIfNeeded;
}

function playVisitorHitSfx(volume = 0.55) {
  playPooledSfx(visitorHitSfxPool, VISITOR_HIT_SFX_SRC, VISITOR_HIT_SFX_POOL_SIZE, { volume });
}

function playChattyHitSfx(volume = 0.55) {
  playPooledSfx(chattyHitSfxPool, CHATTY_HIT_SFX_SRC, CHATTY_HIT_SFX_POOL_SIZE, { volume });
}

function playVisitorSavedSfx(volume = 0.85) {
  playPooledSfx(visitorSavedSfxPool, VISITOR_SAVED_SFX_SRC, VISITOR_SAVED_SFX_POOL_SIZE, { volume });
}
