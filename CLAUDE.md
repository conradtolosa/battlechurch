# Battlechurch — guide for Claude

A browser action game (plain JS, no build step, no npm deps). `index.html`
loads ~45 classic `<script>` files in order; `game.js` is last. Deployed by
Cloudflare Pages straight from the repo: `main` → test.battlechurch.com, other
branches → their own preview URL (use `/`, not `/index.html`, which redirects).

## Save tokens: how to find things

- **Never read whole big files.** Sizes: `game.js` ~30.6k lines, `tutorial_arena.js` ~2k, `renderer.js`
  ~16k, `level_data.js` ~15k (453 KB of level data, don't read it), `entities.js`
  ~5k, `MapScreen.js` ~4.7k, `levels.js` ~2.6k, `hud.js` ~2.5k, `input.js` ~1.9k.
  Use `grep -n "function name"` then `Read` with offset/limit.
- **Don't read** `level_data.js`, `assets/` (800 files, 74 MB), or
  `playing-instructions.md` (outdated, not loaded by anything).
- Line numbers drift; search by name. Names below are stable.
- `game.js` has no section headers and topics are scattered. Its top-level
  `let`/`const`/functions are globals shared with every other script.
  `input.js` and `renderer.js` are wrapped in IIFEs: their inner functions
  (e.g. `configureArcControl`, `drawGame`) are NOT globals.
- Script load order matters: a top-level initializer can't use a `const` from
  a script loaded later (temporal dead zone); calls inside functions are fine.
  `projectile_config.js` is listed twice in index.html (harmless; leave it).

## Map

| Area | Where |
| --- | --- |
| Main loop / state | `game.js`: `init`, `startGameLoop`, `updateGame`, `updatePlayer`, `updateEnemiesAndEntities`. Globals: `player`, `enemies`, `npcs`, `paused`, `titleScreenActive`, `mapActive` |
| Title / save pick / start | `game.js`: `handleTitleScreen`, `startGameFromTitle`, `startRunForDistrict`, `beginStartCountdown` |
| Map screen | `MapScreen.js`, `mapData.js`; `game.js` `exitMapScreen` |
| Levels / waves | `levels.js`, `spawner.js`, `level_data.js` (data), `game.js` `updateLevelManagement`, `spawnBossForLevel`, `class BossEncounter` |
| Melee + moves | `game.js`: `updateMeleeAttackSystem` (~1.3k lines, combo detection via `meleeAttackState.lastComboTimes`), `execute*Attack` functions, `updateChargeState`, `showMoveBanner`. Constants near `DASH_COMBO_GRACE` |
| Move list | `move_catalog.js` (source of truth; `publicName` = on-screen name, `key` = internal name) |
| Prayer / Purify / Prayer Storm | `entities.js` `castPrayerBomb` (400 ms Purify dedupe); `game.js` `startPrayerBombFireRain`, `markChargedCConsumedByCombo`, `isPrayerBombInputSuppressed` |
| Enemies | `entities.js` (`Enemy.takeDamage` etc.), `enemy_catalog.js` (stats), `hitboxes.js` |
| NPCs / congregation | `game.js` `class CozyNpc`, `updateCozyNpcs`, `updateCongregationMembers`, visitor session functions |
| Drawing | `renderer.js` (`drawGame`, `drawTitleScreen`, `drawMissionBriefScreen`, …); `hud.js` (`drawHUD`, `drawPrayerBombMeter`, `drawTutorialArenaObjective`, `drawMoveAnnouncementBanner`, `drawDevArenaMoveReference` = dev Moves List) |
| Balance / text / styles | `config_balance.js`, `config_text.js`, `config_tips.js`, `config_styles.js`, `config_classes.js`; shared data modules listed in `SHARED_MODULES.md` |
| Keyboard / gamepad / touch | `input.js`. Keys: A = ArrowLeft, B = ArrowDown, C = ArrowRight, Space = pause/select. Game reads `keysPressed` / `keysJustPressed` |
| Touch action pad | `input.js` `configureArcControl` (constants `ABC_PAD_*`, `ABC_INTENT_MS`, `ABC_SLIDE_*`, trail/flash timings) + the `#arcControl` SVG in `index.html` — keep the SVG and the `ABC_PAD_*` angles in sync. Emulates keys via `pressVirtualKey`/`releaseVirtualKey`. Test hook: `arcControl.__abcPoint("A" / "A+B" / "ABC")` |
| Touch movement stick | `input.js` `configureVirtualJoystick` + `#moveStick` SVG in `index.html` |
| Tutorial | `tutorial_arena.js` (moved out of game.js; loads right before it — its top-level values must stay plain literals). Data: `TUTORIAL_ARENA_OBJECTIVES`. Key fns: `startTutorialArenaObjective`, `updateTutorialArenaHudState`, `checkTutorialArenaObjectiveComplete`, `recordTutorialArenaComboMove`, `recordTutorialArenaCounter`, `maintainTutorialArenaComboDummy`, `runFirstTimeTutorialThen`, `exitTutorialArenaToGame`, `requestTutorialArenaLaunch`. Hooks into combat still live in game.js (grep `tutorialArena`). Drawn in `hud.js` `drawTutorialArenaObjective` and `renderer.js` (`drawTutorialArenaCard`, buttons near `drawTotalCongregationPill`). Seen flag: localStorage `battlechurch.tutorialSeen.v1` |
| Dev melee arena | `tutorial_arena.js`: `requestDevMeleeArenaLaunch`, `spawnDevMeleeArenaEnemy`. Same file also has battlefield floor helpers the real game uses (`updateBattlefieldFloorSelection`) |
| Dev editors | `dev/` (level builder, enemy/boss/hitbox editors, paperdoll sandboxes) — loaded by index.html but dev-only UI |

Objective types in `TUTORIAL_ARENA_OBJECTIVES`: card, move_wasd, kill_any,
kill_with_move, dash_plus_kills, kill_armored, combo_string, counter_hit,
punish_counter. Fields: `arena: "dummy"`, `touchLabel`, `touchBody`,
`highlight`, `showButtons`.

## Testing

```bash
dev/tests/run.sh            # everything (~15 min on the slow test box)
dev/tests/run.sh smoke      # ~2 min: loads, no page errors, tutorial + dev arena + a real battle
dev/tests/run.sh touch_moves.js phone --slow --only=Reap
```

- Needs Playwright (preinstalled globally in cloud sessions; `run.sh` adds the
  global `node_modules` to `NODE_PATH`). Starts `python3 -m http.server 8765`
  if nothing is on that port. `BASE_URL=https://<preview>/ dev/tests/run.sh smoke`
  tests a deployed preview.
- Files: `helpers.js` (open game, jump to a tutorial step, pad gestures, move
  log), `touch_moves.js`, `tutorial_flow.js`, `combo_strings.js`, `stick_trail.js`, `smoke.js`.
- The test box runs ~17 fps, so timing checks can flake. Re-run a single miss
  with `--only=` before believing it. Moves are confirmed by
  `window.__moveAnnouncementBanner` (the on-screen move banner).
- Always run at least `smoke` after editing `game.js`; run `touch_moves.js`
  after touching `input.js`, combo code, or the pad SVG.

## Known quirks (not bugs to "fix" without asking)

- No A→C or B→C move exists. On touch those slides do only the first move
  (Slash / Dash) — the user chose this.
- Keyboard Smash (B→A) only fires if A goes down while B is still held; a
  clean tap-tap gives Dash. Same before the touch work.
- Reap (C→A) right after a Slash sometimes comes out as Slash.
- B soon after an A attack cancels into Smash (tutorial drills ignore the echo Slash).
- Tutorial armored skeletons take 0.1× damage from auto-fire
  (`tutorialArmorTest`); auto-fire is gated by `window.__tutorialArenaBlockAutoFire`.

## Conventions

- Develop on the session's assigned branch; don't merge to `main` unless the
  user asks (main deploys to the test site).
- Commit message trailers: use whatever attribution lines the session asks for.
- The user is not a programmer: explain changes in plain words, show
  screenshots for visual changes.
- Background servers in cloud sessions can time out; restart them. Avoid
  `rm -f dir/*` (blocked by the safety check) — delete named files.
