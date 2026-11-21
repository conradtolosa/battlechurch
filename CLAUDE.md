# Battlechurch — guide for AI assistants

Browser action game: plain JS, no build step, no npm deps. `index.html` loads
~50 classic `<script>` files in order; `game.js` is last and calls `init()` at
its end. Cloudflare Pages deploys the repo as-is: `main` → test.battlechurch.com,
other branches → their own preview (use `/`, not `/index.html`).

## Finding code cheaply

- Never read a whole big file. `grep -n "function name"` then Read with
  offset/limit. Line numbers drift; names below are stable.
- Don't read: `level_data.js` (453 KB data), `assets/` (74 MB),
  `playing-instructions.md` (outdated, unused). `.ignore` keeps them out of
  directory-wide searches; search them by name when needed
  (`rg pattern level_data.js`).
- All classic scripts share one global scope (top-level `let`/`const`/functions
  are globals). `input.js` and `renderer.js` are IIFEs: their inner functions
  (`configureArcControl`, `drawGame`, …) are not globals.

## Where things are (file → topic)

| File (lines) | What's in it |
| --- | --- |
| `game.js` (~16k) | Globals/state (`player`, `enemies`, `npcs`, `paused`, `titleScreenActive`, `mapActive`), tuning constants (`MELEE_*`, `DASH_*`, `RUSH_*`, read from config_balance via `_gb`), title/save screens (`handleTitleScreen`, `startGameFromTitle`, save pickers), level flow (`startRunForDistrict`, `updateLevelManagement`, `spawnBossForLevel`, announcements, recap/battle summary), `class Projectile`, `class BossEncounter`, collisions, `updatePlayer`, `updateGame`, Prayer bomb/Purify helpers (`startPrayerBombFireRain`, `markChargedCConsumedByCombo`, `isPrayerBombInputSuppressed`), pickup drawing + `WeaponPickup`/`UtilityPowerUp` classes, dev hotkeys, `init` |
| `combat.js` (~5.4k) | Melee: `updateMeleeAttackSystem` (combo detection via `meleeAttackState.lastComboTimes`), `updateChargeState`, every `execute*Attack`, dash/rush, Thrash, ring of fire (Hedge), counter hits, hitstop, combo HUD, `showMoveBanner` + `MOVE_BANNER_TOKENS`, `recordTutorialArenaComboMove`, `updateArcControlCooldowns` |
| `npcs.js` (~3.7k) | `class CozyNpc`, NPC looks/names, spawning, congregation updates/dialogue/commands, visitor sessions |
| `powerups.js` (~2.9k) | Drops, weapon/utility/church/pastor power-ups, halo blade, shield, sentry, spear, grace pickups |
| `audio.js` (~1.6k) | SFX lists/pools, `play*Sfx`, music start/stop/fade, audio settings |
| `asset_loading.js` (~1.3k) | `loadImage`, `loadAnimationClip`, `load*Assets`, `loadAssets` |
| `tutorial_arena.js` (~2k) | Tutorial (`TUTORIAL_ARENA_OBJECTIVES` with `label`/`touchLabel`/`why`/`sequence`, `startTutorialArenaObjective`, `updateTutorialArenaHudState`, first-run flow) + dev melee arena + battlefield floor helpers |
| `renderer.js` (~16k) | All drawing (`drawGame`, title, mission brief, recap, tutorial card/text near `drawTotalCongregationPill`) |
| `hud.js` (~2.5k) | `drawHUD`, prayer meter, move banner, dev Moves List |
| `input.js` (~1.9k) | Keyboard/gamepad/touch. A=ArrowLeft, B=ArrowDown, C=ArrowRight, Space=pause/select. Touch pad `configureArcControl` (`ABC_PAD_*` angles must match the `#arcControl` SVG in index.html), stick `configureVirtualJoystick` |
| `cloud.js` + `functions/api/[[path]].js` | Cloud saves + sign-in on Cloudflare (D1 database, Pages Functions). `cloud.js` keeps the old `window.Cloud` interface (`initCloud`, `loadPlayerDoc`, `savePlayerDoc`, `resetPlayerProgress`, `signInWithGoogle`, `signOut`) and reports crashes to `/api/error`. Google popup returns to `auth/google/index.html` |
| `entities.js` (~5k) | `Enemy` (`takeDamage`…), player `castPrayerBomb` |
| `MapScreen.js`, `mapData.js` | Map screen |
| `levels.js`, `spawner.js`, `level_data.js` | Waves and level data (edit level data with the dev level builder or targeted grep) |
| `move_catalog.js` | Move list: `publicName` = on-screen name, `key` = internal |
| `config_balance.js` | Balance numbers (damage, cooldowns, spawns) — first stop for tuning |
| `enemy_catalog.js`, `hitboxes.js` | Enemy stats and hitboxes |
| text | `config_text.js`, `config_tips.js`, `mission_brief_data.js`, `npc_dialogue_lines.js`, `congregation_dialogue_lines.js`, `visitor_blocker_lines.js` |
| `dev/` | Dev editors (loaded by index.html), `dev/tests/`, `dev/tools/` |

## Move → code

Combo/charge input detection for every move is in `combat.js`
`updateMeleeAttackSystem`. The move itself:

| Move | Code |
| --- | --- |
| Slash (A) | `executeBasicMeleeAttack` |
| Dash (B) | `updateDashMovement`; started in `updateMeleeAttackSystem` |
| Blast (charge A) | `executeDivineShot` |
| Crash (charge B) | `executeProtectedDash` |
| Smash (B→A) | `executeRushAttack`, `updateRushMovement` |
| Cleave (A→B) | `executeCleaveAttack` |
| Reap (C→A) | `executeSpinAttack` |
| Clash (C→B) | `forceStartHolyDash` (detected under "C/B Holy Dash") |
| Thrash (charge B+A) | `executeSwordRush`, `updateThrashFlurry` |
| Hedge (charge A+C) | `executeRingOfFireAttack` (`MOVE_NAME_AC_SUPER`) |
| Trash (charge B+C) | `executeBlankaRoll` |
| Unity Strike / Pastor Protect (C / C C) | `entities.js` (grep `"Unity Strike"`), `npcs.js` `triggerCongregationCommand` |
| Purify (charge C) | `entities.js` `castPrayerBomb` |
| Prayer Storm (charge A+B+C) | `updateMeleeAttackSystem` (grep `"Prayer Storm"`), `game.js` `startPrayerBombFireRain` |

## Common edits

- Tutorial wording/steps → `tutorial_arena.js` `TUTORIAL_ARENA_OBJECTIVES`.
- Damage/cooldowns/timing → `config_balance.js` (game.js `_gb('path', default)`).
- How a move behaves → `combat.js` (`execute<Move>`; names map via `move_catalog.js`).
- Touch controls → `input.js`; their look → `style.css` + SVG in `index.html`.
- On-screen text/HUD → `hud.js` / `renderer.js`.

## Cloud (Cloudflare)

- D1 databases: `battlechurch-saves` (main → test site) and
  `battlechurch-saves-preview` (branch previews). Bindings and
  `GOOGLE_CLIENT_ID` are in `wrangler.toml` (not the dashboard). Schema:
  `db/schema.sql`. Tables: `players` (save JSON in `data`), `sessions`,
  `errors` (crash reports, kept 90 days).
- Query them: `python3 dev/tools/cf_d1.py prod|preview "SQL"` (uses the
  Cloudflare API token; in cloud sessions the network proxy supplies it).
- Run the API locally: `npx wrangler pages dev . --port 8788`, then
  `BASE_URL=http://localhost:8788/ node dev/tests/cloud_saves.js`.
  Sign-in logic test: `node --experimental-sqlite dev/tests/api_google.mjs`.
- The plain test server (python) has no `/api`; the game must keep working
  offline (cloud calls fail quietly).

## Moving or adding top-level code

New/split files load before `game.js` (it runs `init()` as soon as it loads).
Top-level code runs at load, so it may only use globals from earlier scripts.
After moving code between files or adding a script, run
`node dev/tools/check_load_order.js` (also runs in `dev/tests/run.sh`).

## Testing

```bash
dev/tests/run.sh smoke      # ~2 min: load order, page loads with no errors, tutorial, dev arena, a real battle
dev/tests/run.sh            # everything (~15 min)
dev/tests/run.sh touch_moves.js phone --slow --only=Reap
```

- Prints only failures + a summary (`VERBOSE=1` for every check). Starts a
  local server on 8765; `BASE_URL=https://<preview>/` tests a deployed preview.
- Files: `helpers.js`, `smoke.js`, `touch_moves.js`, `tutorial_flow.js`,
  `combo_strings.js`, `stick_trail.js`.
- Test box runs ~17 fps; re-run a single miss with `--only=` before believing it.
- Run `smoke` after any code change; `touch_moves.js` after input/combo changes.

## Known quirks (don't "fix" without asking)

- No A→C / B→C move: on touch those slides do only Slash / Dash (user's choice).
- Keyboard Smash (B→A) needs A pressed while B is still held.
- Reap (C→A) right after a Slash sometimes comes out as Slash.
- B soon after an A attack cancels into Smash (combo drill ignores that echo Slash once).
- Tutorial armored skeletons take 0.1× auto-fire damage (`tutorialArmorTest`).

## Conventions

- Work on the session's branch; merge to `main` only when the user asks.
- The user isn't a programmer: plain words, screenshots for visual changes.
- Avoid `rm -f dir/*` (blocked); delete named files.
