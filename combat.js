/* Melee combat: attack directions, combo HUD, Prayer combo, dash/rush, knockback, counter hits, hitstop, move banners, every execute*Attack, Thrash, ring of fire, charging, updateMeleeAttackSystem, touch pad cooldowns.
 * Moved out of game.js unchanged. Loaded by index.html BEFORE game.js and
 * shares its globals at runtime. Top-level code here runs before game.js
 * exists: run `node dev/tools/check_load_order.js` after editing.
 */

function getMeleeAttackDirection() {
  const input = window.Input;
  if (!input || !player) return { x: 1, y: 0 };
  // If player is actively pressing a movement key/stick, use that direction.
  const moveDir = input.movementDirection || { x: 0, y: 0 };
  if (moveDir.x !== 0 || moveDir.y !== 0) {
    return normalizeVector(moveDir.x, moveDir.y);
  }
  // No live directional input: use last movement/facing, not aim (aim may be auto-target-adjusted).
  const lastMoveDir = input.lastMovementDirection || { x: 0, y: 0 };
  if (lastMoveDir.x !== 0 || lastMoveDir.y !== 0) {
    return normalizeVector(lastMoveDir.x, lastMoveDir.y);
  }
  const facing = String(player.facing || "right").toLowerCase();
  if (facing === "left") return { x: -1, y: 0 };
  if (facing === "up") return { x: 0, y: -1 };
  if (facing === "down") return { x: 0, y: 1 };
  if (facing === "right") return { x: 1, y: 0 };
  const aim = player.aim || { x: 1, y: 0 };
  if (aim.x !== 0 || aim.y !== 0) {
    return normalizeVector(aim.x, aim.y);
  }
  return { x: 1, y: 0 };
}

function getSpinAttackDirection() {
  return getMeleeAttackDirection();
}

function getDashButtonDirection() {
  return getMeleeAttackDirection();
}

function getChainLabelFontSize(hits) {
  const h = Math.max(1, Math.round(hits || 0));
  // Grows by ~0.6px every 10 hits, capped at 56px at ~400 hits
  return Math.min(56, 32 + Math.floor(h / 10) * 0.6);
}

function getChainLabelColor(hits) {
  const comboHits = Math.max(2, Math.round(hits || 0));
  const tier = Math.floor(comboHits / 10);
  if (tier >= 5) return "#FFF7F0";
  if (tier >= 4) return "#FFF0C9";
  if (tier >= 3) return "#FFE6A3";
  if (tier >= 2) return "#FFD982";
  if (tier >= 1) return UI_COLOR.softWhite;
  return UI_COLOR.gold;
}

function updateHudComboDisplay({ hits, damage, fontSize, color, durationMs }) {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const labelHits = Number.isFinite(hits) ? Math.max(2, Math.round(hits)) : 2;
  const damageValue = Number.isFinite(damage) ? Math.round(damage) : 0;
  const labelText = `${labelHits} Hit Chain`;
  const prevHits = hudComboDisplay ? (hudComboDisplay._hits || 0) : 0;
  const prevMilestone = Math.floor(prevHits / 100);
  const newMilestone = Math.floor(labelHits / 100);
  const crossedMilestone = newMilestone > prevMilestone && newMilestone > 0;
  hudComboDisplay = {
    labelText,
    color: color || UI_COLOR.softWhite,
    fontSize: fontSize || 32,
    updatedAt: now,
    expiresAt: now + (Number.isFinite(durationMs) ? durationMs : 1100),
    milestoneFlashAt: crossedMilestone ? now : (hudComboDisplay?.milestoneFlashAt || null),
    _hits: labelHits,
  };
  if (typeof window !== "undefined") {
    window.__hudComboDisplay = hudComboDisplay;
  }
  if (crossedMilestone) {
    const milestoneCount = newMilestone * 100;
    window.__hudMilestoneBurst = {
      label: `${milestoneCount}`,
      startedAt: now,
      life: 1.2,
      fadeDelay: 0.5,
      vy: -90,
      screenX: Number.isFinite(window.__comboTextFixedX) ? window.__comboTextFixedX : canvas.width * 0.5,
      screenY: Number.isFinite(window.__comboTextFixedY) ? window.__comboTextFixedY : 90,
    };
  }
}

function drawHudMilestoneBurst() {
  const burst = window.__hudMilestoneBurst;
  if (!burst) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = (now - burst.startedAt) / 1000;
  if (elapsed >= burst.life) {
    window.__hudMilestoneBurst = null;
    return;
  }
  const fadeStart = burst.fadeDelay;
  const alpha = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / (burst.life - fadeStart));
  const y = burst.screenY + burst.vy * elapsed;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.font = `900 52px ${UI_FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = UI_COLOR.comboMilestone;
  ctx.shadowColor = "rgba(255, 200, 80, 0.85)";
  ctx.shadowBlur = 18;
  ctx.fillText(burst.label, burst.screenX, y);
  ctx.restore();
}

function checkKillMilestoneBurst() {
  const total = levelManager?.getStats?.()?.enemiesDefeated;
  if (!Number.isFinite(total) || total <= 0) return;
  const prev = window.__killMilestoneLastTotal ?? 0;
  window.__killMilestoneLastTotal = total;
  const prevMilestone = Math.floor(prev / 500);
  const newMilestone = Math.floor(total / 500);
  if (newMilestone <= prevMilestone || newMilestone === 0) return;
  const milestoneCount = newMilestone * 500;
  const px = typeof player !== "undefined" && Number.isFinite(player?.x) ? player.x : (cameraOffsetX + canvas.width / 2);
  const py = typeof player !== "undefined" && Number.isFinite(player?.y) ? player.y - (player.radius || 24) - 20 : canvas.height / 2;
  addFloatingTextAt(px, py, `${milestoneCount} Kills`, "#76D98F", {
    vy: -80,
    life: 1.6,
    fontSize: 48,
    fontWeight: "900",
    fadeDelay: 0.6,
    speechBubble: false,
    priority: 9,
  });
}
window.checkKillMilestoneBurst = checkKillMilestoneBurst;

function showWaveKillCountBurst() {
  const total = levelManager?.getStats?.()?.enemiesDefeated;
  if (!Number.isFinite(total) || total <= 0) return;
  const px = typeof player !== "undefined" && Number.isFinite(player?.x) ? player.x : (cameraOffsetX + canvas.width / 2);
  const py = typeof player !== "undefined" && Number.isFinite(player?.y) ? player.y - (player.radius || 24) - 20 : canvas.height / 2;
  addFloatingTextAt(px, py, `${total} Kills`, "#76D98F", {
    vy: -70,
    life: 1.4,
    fontSize: 40,
    fontWeight: "700",
    fadeDelay: 0.4,
    speechBubble: false,
    priority: 8,
  });
}

function withAlpha(hexColor, alpha) {
  if (!hexColor || hexColor[0] !== "#" || hexColor.length !== 7) return hexColor;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  if (![r, g, b].every(Number.isFinite)) return hexColor;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updatePrayerBombComboDisplay() {
  if (!prayerBombComboState.active) return;
  const hits = Math.max(1, Math.round(prayerBombComboState.hits || 0));
  if (!Number.isFinite(prayerBombComboState.anchorX) || !Number.isFinite(prayerBombComboState.anchorY)) {
    prayerBombComboState.anchorX = cameraOffsetX + canvas.width / 2;
    prayerBombComboState.anchorY = canvas.height / 2;
  }
  const centerX = prayerBombComboState.anchorX;
  const centerY = prayerBombComboState.anchorY;
  const fontSize = getChainLabelFontSize(hits) * 2;
  const color = getChainLabelColor(hits);
  const labelText = `${formatNumberWithCommas(hits)} HIT\nCOMBO`;
  if (!prayerBombComboState.label) {
    const label = addFloatingTextAt(centerX, centerY, labelText, color, {
      speechBubble: false,
      vy: 0,
      life: 1.4,
      fontSize,
      fontWeight: "800",
      priority: 7,
      fadeDelay: 0,
      clampToScreen: true,
      persist: true,
    });
    if (label) {
      label.floorLayer = true;
      label.noStroke = true;
      label.floorPerspective = 0;
      label.floorRotate = 0;
      label.floorPitch = 0.35;
      label.floorShear = 0;
    }
    prayerBombComboState.label = label;
    return;
  }
  prayerBombComboState.label.text = labelText;
  prayerBombComboState.label.x = centerX;
  prayerBombComboState.label.y = centerY;
  prayerBombComboState.label.fontSize = fontSize;
  prayerBombComboState.label.color = color;
  prayerBombComboState.label.persist = true;
  prayerBombComboState.label.floorLayer = true;
  prayerBombComboState.label.noStroke = true;
  prayerBombComboState.label.floorPerspective = 0;
  prayerBombComboState.label.floorRotate = 0;
  prayerBombComboState.label.floorPitch = 0.35;
  prayerBombComboState.label.floorShear = 0;
}

function startPrayerBombCombo() {
  if (!prayerBombComboState.active) {
    prayerBombComboState.hits = 0;
    prayerBombComboState.label = null;
    prayerBombComboState.anchorX = null;
    prayerBombComboState.anchorY = null;
  }
  prayerBombComboState.active = true;
}

function endPrayerBombCombo() {
  if (!prayerBombComboState.active) return;
  const finalHits = Math.max(0, Math.round(prayerBombComboState.hits || 0));
  if (finalHits > 0 && levelManager?.recordPrayerBombComboContribution) {
    levelManager.recordPrayerBombComboContribution(finalHits);
  }
  if (prayerBombComboState.label) {
    prayerBombComboState.label.persist = false;
    prayerBombComboState.label.life = Math.min(prayerBombComboState.label.life || 4.5, 4.5);
    prayerBombComboState.label.fadeDelay = 3.0;
    prayerBombComboState.label.floorFlash = true;
  }
  prayerBombComboState.active = false;
  prayerBombComboState.hits = 0;
  prayerBombComboState.label = null;
  prayerBombComboState.anchorX = null;
  prayerBombComboState.anchorY = null;
}

function recordPrayerBombComboHits(count) {
  if (!prayerBombComboState.active) return;
  const addCount = Math.max(0, Math.round(count || 0));
  if (!addCount) return;
  prayerBombComboState.hits += addCount;
  updatePrayerBombComboDisplay();
}

function showPrayerBombBlastCombo(count, x, y) {
  const hits = Math.max(0, Math.round(count || 0));
  if (!hits) return;
  const fontSize = getChainLabelFontSize(hits) * 2;
  const color = getChainLabelColor(hits);
  const labelText = `${formatNumberWithCommas(hits)} HIT\nCOMBO`;
  const label = addFloatingTextAt(x, y, labelText, color, {
    speechBubble: false,
    vy: -28,
    life: 1.2,
    fontSize,
    fontWeight: "800",
    priority: 7,
    fadeDelay: 0,
    clampToScreen: true,
  });
  if (label) {
    label.floorLayer = true;
    label.noStroke = true;
    label.floorPerspective = 0;
    label.floorRotate = 0;
    label.floorPitch = 0.35;
    label.floorShear = 0;
  }
  maybeUpdateMaxChainInTown(hits, x, y, { skipHudFly: true });
}

function maybeUpdateMaxChainInTown(hits, x, y, options = {}) {
  const comboHits = Math.max(2, Math.round(hits || 0));
  if (!Number.isFinite(comboHits)) return;
  if (levelManager?.setBattleMaxChain) {
    levelManager.setBattleMaxChain(comboHits);
  }
  if (comboHits <= maxChainThisTown) return;
  maxChainThisTown = comboHits;
  // HUD fly effect disabled per design; keep max combo updated without animation.
}

function updateLiveChainText(state, target) {
  if (!state || !target || state.hits < 2) return;
  const label = `${Math.max(2, Math.round(state.hits))} Hit Chain`;
  const labelFontSize = getChainLabelFontSize(state.hits);
  const labelColor = getChainLabelColor(state.hits);
  maybeUpdateMaxChainInTown(state.hits, target.x, target.y);
  updateHudComboDisplay({
    hits: state.hits,
    damage: state.damage,
    fontSize: labelFontSize,
    color: labelColor,
    durationMs: HIT_CHAIN_WINDOW_MS * 4,
  });
}

function finalizeComboState(state) {
  if (!state || state.hits < 2) return;
  updateHudComboDisplay({
    hits: state.hits,
    damage: state.damage,
    fontSize: getChainLabelFontSize(state.hits),
    color: getChainLabelColor(state.hits),
    durationMs: 800,
  });
}

const PROJECTILE_CHIP_CHAIN_INCREMENT = 0.1;
const PROJECTILE_CHIP_CHAIN_WINDOW_MS = 2000;
const PROJECTILE_CHIP_CHAIN_CAP_PER_WINDOW = 1.0;

function isComboTargetDefeated(target) {
  if (!target) return false;
  if (target instanceof Projectile || (target && target.visualOnly !== undefined && target.friendly !== undefined)) {
    return Boolean(target.dead);
  }
  if (target.dead || target.state === "death") return true;
  return Number.isFinite(target.health) ? target.health <= 0 : false;
}

function getProjectileComboIncrement(target) {
  if (!target) return 1;
  if (isComboTargetDefeated(target)) return 1;
  const damageClass = String(target.damageClass || target.config?.damageClass || "").toLowerCase();
  if (damageClass === "armored" || damageClass === "tank") {
    return PROJECTILE_CHIP_CHAIN_INCREMENT;
  }
  return 1;
}

const chainTracker = window.chainTracker = {
  state: null,
  flush(now) {
    if (!this.state) return;
    const timeNow =
      typeof now === "number"
        ? now
        : typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
    const state = this.state;
    this.state = null;
    if (timeNow <= state.expiresAt) {
      finalizeComboState(state);
    } else {
      finalizeComboState(state);
    }
  },
  registerHit(target, damage, now, options = {}) {
    if (!target || !Number.isFinite(damage) || damage <= 0) return;
    const timeNow =
      typeof now === "number"
        ? now
        : typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
    let current =
      this.state && timeNow <= this.state.expiresAt
        ? this.state
        : {
            hits: 0,
            damage: 0,
            expiresAt: 0,
            killed: false,
            lastX: null,
            lastY: null,
            chipGainByTarget: new Map(),
          };
    // Directional gating removed: combos now accumulate regardless of projectile direction.
    let comboIncrement = Number.isFinite(options.increment)
      ? Math.max(0, options.increment)
      : 1;
    if (comboIncrement > 0 && comboIncrement < 1) {
      const chipWindowMs = Number.isFinite(options.chipWindowMs)
        ? Math.max(100, options.chipWindowMs)
        : PROJECTILE_CHIP_CHAIN_WINDOW_MS;
      const chipCapPerWindow = Number.isFinite(options.chipCapPerWindow)
        ? Math.max(0, options.chipCapPerWindow)
        : PROJECTILE_CHIP_CHAIN_CAP_PER_WINDOW;
      let chipState = current.chipGainByTarget.get(target);
      if (!chipState || timeNow - chipState.windowStart > chipWindowMs) {
        chipState = { windowStart: timeNow, gain: 0 };
      }
      const remaining = Math.max(0, chipCapPerWindow - chipState.gain);
      comboIncrement = Math.min(comboIncrement, remaining);
      chipState.gain += comboIncrement;
      current.chipGainByTarget.set(target, chipState);
    }
    if (comboIncrement <= 0) return;
    current.hits += comboIncrement;
    current.damage += damage;
    current.lastX = Number.isFinite(target.x) ? target.x : current.lastX;
    current.lastY = Number.isFinite(target.y) ? target.y : current.lastY;
    if (
      isComboTargetDefeated(target)
    ) {
      current.killed = true;
    }
    current.expiresAt = timeNow + HIT_CHAIN_WINDOW_MS;
    this.state = current;
    if (current.hits >= 2) {
      updateLiveChainText(current, target);
    }
  },
  update(now) {
    if (!this.state) return;
    const timeNow =
      typeof now === "number"
        ? now
        : typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
    if (timeNow <= this.state.expiresAt) return;
    const state = this.state;
    this.state = null;
    finalizeComboState(state);
  },
};

function registerChainHit(target, damage) {
  if (prayerBombComboState.active && target) {
    recordPrayerBombComboHits(1);
  }
  if (!window.BattlechurchComboTrackerEnabled) return;
  if (prayerBombComboState.active) return;
  chainTracker.registerHit(target, damage);
}

function registerProjectileComboHit(target, damage, projectile) {
  if (prayerBombComboState.active && target) {
    recordPrayerBombComboHits(1);
  }
  if (!window.BattlechurchComboTrackerEnabled) return;
  if (prayerBombComboState.active) return;
  chainTracker.registerHit(target, damage, undefined, {
    increment: getProjectileComboIncrement(target),
    chipWindowMs: PROJECTILE_CHIP_CHAIN_WINDOW_MS,
    chipCapPerWindow: PROJECTILE_CHIP_CHAIN_CAP_PER_WINDOW,
  });
}

function spawnGraceArcBurst(baseX, baseY, count, spread) {
  if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return;
  const burstCount = Math.max(0, Math.round(count || 0));
  if (!burstCount) return;
  const burstSpread = Number.isFinite(spread) ? spread : Math.min(80, 24 + burstCount * 8);
  for (let i = 0; i < burstCount; i += 1) {
    const spawnOffsetX = randomInRange(-burstSpread, burstSpread);
    const angle = randomInRange(-Math.PI * 1.15, -Math.PI * 0.05);
    const speed = randomInRange(160, 220);
    const horizontalBias = Math.sign(spawnOffsetX || 1) * randomInRange(25, 60);
    const vx = Math.cos(angle) * speed + horizontalBias;
    const vy = Math.sin(angle) * speed - randomInRange(320, 420);
    const floorJitter = randomInRange(-0.15, 0.15);
    const floorY = Math.max(
      HUD_HEIGHT + 24,
      Math.min(canvas.height - 24, baseY + baseY * floorJitter),
    );
    spawnGracePickup(
      baseX + spawnOffsetX,
      baseY + randomInRange(-burstSpread * 0.3, burstSpread * 0.3),
      {
        vx,
        vy,
        scatter: false,
        value: 1,
        useGravity: true,
        bounce: true,
        gravity: GRACE_PICKUP_GRAVITY * 2.2,
        floorY,
        bounceDamp: 0.55,
        airDrag: 0.985,
      },
    );
  }
}

function spawnComboGraceBurst(target, hits, fallbackX, fallbackY, killedOnCombo = false) {
  const comboHits = Math.max(2, Math.round(hits || 0));
  const minPerHit = killedOnCombo ? 3 : 2;
  const maxPerHit = killedOnCombo ? 5 : 2;
  const minGems = comboHits * minPerHit;
  const maxGems = comboHits * maxPerHit;
  const gemCount = Math.max(minGems, randomInRange(minGems, maxGems));
  const baseX = Number.isFinite(target?.x) ? target.x : fallbackX;
  const baseY = Number.isFinite(target?.y) ? target.y : fallbackY;
  if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return;
  const spread = Math.min(140, 40 + comboHits * 12);
  spawnGraceArcBurst(baseX, baseY, gemCount, spread);
}

function applyProjectileSplashDamage(
  projectile,
  centerX,
  centerY,
  radius,
  damage,
  { skipBossImpact = false, churchPowerup = false, skipEnemy = null } = {},
) {
  if (!projectile) return;
  const fromPlayer = Boolean(projectile?.source?.isPlayer);
  const damageType = projectile.damageType || (projectile.isDivineShot ? "charged" : "projectile");
  enemies.forEach((enemy) => {
    if (enemy.dead || enemy.state === "death") return;
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    if (skipEnemy && enemy === skipEnemy) return;
    const center = getEnemyHitboxCenter(enemy);
    const distance = Math.hypot(center.x - centerX, center.y - centerY);
    const threshold = radius + getEnemyHitboxRadius(enemy) * 0.6;
    if (distance <= threshold) {
      const splashWasAlive = !enemy.dead && enemy.state !== "death";
      enemy.takeDamage(damage, { damageType });
      if (churchPowerup && splashWasAlive && (enemy.dead || enemy.state === "death")) {
        enemy.killedByChurchPowerup = true;
      }
      if (fromPlayer) {
        registerProjectileComboHit(enemy, damage, projectile);
      }
    }
  });
  if (activeBoss && !activeBoss.dead && !activeBoss.removed) {
    const distance = Math.hypot(activeBoss.x - centerX, activeBoss.y - centerY);
    const threshold = radius + (activeBoss.radius || 0) * 0.6;
    if (distance <= threshold) {
      activeBoss.takeDamage(damage, {
        hitX: centerX,
        hitY: centerY,
        damageType,
        skipImpactEffect: skipBossImpact,
      });
      if (fromPlayer) {
        registerProjectileComboHit(activeBoss, damage, projectile);
      }
    }
  }
}

function getHeldMovementDirection() {
  const input = window.Input;
  if (!input) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  if (input.isActionActive?.("left")) x -= 1;
  if (input.isActionActive?.("right")) x += 1;
  if (input.isActionActive?.("up")) y -= 1;
  if (input.isActionActive?.("down")) y += 1;
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  return normalizeVector(x, y);
}

function getPastorDashCooldownMultiplier() {
  return pastorDashBuffTimer > 0 ? PASTOR_PICKUP_DASH_REDUCTION : 1;
}

function setSharedBButtonCooldown(duration) {
  const scaledDuration = applyPlayerCooldownClassMultiplier(duration * getPastorDashCooldownMultiplier());
  const next = Math.max(
    Number(scaledDuration) || 0,
    playerDashState?.dashCooldown || 0,
    window._meleeAttackState?.rushCooldown || 0,
    window._meleeAttackState?.spinCooldown || 0,
  );
  if (playerDashState) playerDashState.dashCooldown = next;
  if (window._meleeAttackState) {
    window._meleeAttackState.rushCooldown = next;
    window._meleeAttackState.spinCooldown = next;
  }
}

function isSharedBButtonReady() {
  const current = Math.max(
    playerDashState?.dashCooldown || 0,
    window._meleeAttackState?.rushCooldown || 0,
    window._meleeAttackState?.spinCooldown || 0,
  );
  return current <= 0;
}

function updateSharedBButtonCooldown(dt) {
  const current = Math.max(
    playerDashState?.dashCooldown || 0,
    window._meleeAttackState?.rushCooldown || 0,
    window._meleeAttackState?.spinCooldown || 0,
  );
  if (current <= 0) return false;
  const next = Math.max(0, current - dt);
  if (playerDashState) playerDashState.dashCooldown = next;
  if (window._meleeAttackState) {
    window._meleeAttackState.rushCooldown = next;
    window._meleeAttackState.spinCooldown = next;
  }
  return next === 0;
}

function applyMeleeInvulnerability(meleeAttackState, type, duration) {
  if (!player || !meleeAttackState) return;
  const safeDuration = Math.max(0, Number(duration) || 0);
  if (safeDuration <= 0) return;
  player.invulnerableTimer = Math.max(player.invulnerableTimer || 0, safeDuration);
  if (type === "swoosh") {
    meleeAttackState.swooshShieldDebugTimer = Math.max(
      meleeAttackState.swooshShieldDebugTimer || 0,
      safeDuration,
    );
  } else if (type === "rush") {
    meleeAttackState.rushShieldDebugTimer = Math.max(
      meleeAttackState.rushShieldDebugTimer || 0,
      safeDuration,
    );
  }
}

function getDashSwooshInvulnerabilityDuration() {
  const dashRemaining =
    playerDashState && playerDashState.isDashing
      ? Math.max(
          0,
          (playerDashState.dashDistanceRemaining || 0) / Math.max(1, DASH_SPEED || 1),
        )
      : 0;
  return Math.max(MELEE_SWOOSH_INVULNERABILITY, dashRemaining + MELEE_SWOOSH_EXIT_INVULNERABILITY);
}

function tryStartDash(direction) {
  if (playerDashState.isDashing || playerDashState.dashCooldown > 0) return false;
  if (!direction || (direction.x === 0 && direction.y === 0)) return false;
  if (player && typeof player.updateFacing === "function") {
    player.updateFacing(direction.x, direction.y);
  }
  playerDashState.isDashing = true;
  playerDashState.isHolyDash = false;
  playerDashState.dashDir = direction;
  playerDashState.dashDistanceRemaining = DASH_DISTANCE;
  playerDashState.dashDustAccumulator = 0;
  setSharedBButtonCooldown(DASH_COOLDOWN);
  playDashSfx(0.9);
  return true;
}

function forceStartHolyDash(direction, distance = DASH_DISTANCE * 2.5 + 200 * WORLD_SCALE) {
  if (playerDashState.isDashing) return false;
  if (!direction || (direction.x === 0 && direction.y === 0)) return false;
  if (player && typeof player.updateFacing === "function") {
    player.updateFacing(direction.x, direction.y);
  }
  playerDashState.isDashing = true;
  playerDashState.isHolyDash = true;
  playerDashState.dashDir = direction;
  playerDashState.dashDistanceRemaining = Math.max(DASH_DISTANCE, distance);
  playerDashState.dashDustAccumulator = 0;
  playerDashState.crashDashActive = true;
  playerDashState.crashDashHitEntities = new Set();
  playerDashState.crashDashDamage = 250;
  playerDashState.clashFeedbackCooldown = 0;
  playerDashState.clashHitAccum = 0;
  setSharedBButtonCooldown(DASH_COOLDOWN);
  playDashSfx(0.9);
  if (player) player.ignoreEntityCollisions = true;
  return true;
}

function updateDashMovement(dt) {
  if (!playerDashState.isDashing || !player) return;

  // Opposite-direction cancel for Crash/Clash (mirrors Thrash cancel in updateRushMovement)
  if (playerDashState.crashDashActive) {
    const liveInput = window.Input?.movementDirection;
    if (liveInput && (liveInput.x !== 0 || liveInput.y !== 0)) {
      const dot = liveInput.x * playerDashState.dashDir.x + liveInput.y * playerDashState.dashDir.y;
      if (dot < -0.3) {
        playerDashState.isDashing = false;
        playerDashState.isHolyDash = false;
        playerDashState.crashDashActive = false;
        playerDashState.crashDashHitEntities = null;
        playerDashState.crashDashDamage = 0;
        if (window._meleeAttackState) {
          window._meleeAttackState.swooshDamageEnabled = false;
          window._meleeAttackState.swooshHitEntities = null;
          window._meleeAttackState.clashVisualActive = false;
        }
        setSharedBButtonCooldown(DASH_COOLDOWN);
        if (player) player.ignoreEntityCollisions = false;
        return;
      }
    }
  }

  const movement = Math.min(playerDashState.dashDistanceRemaining, DASH_SPEED * dt);
  player.x += playerDashState.dashDir.x * movement;
  player.y += playerDashState.dashDir.y * movement;
  resolveEntityObstacles(player);
  clampEntityToBounds(player);
  playerDashState.dashDistanceRemaining -= movement;
  playerDashState.dashDustAccumulator += movement;

  // Spawn trail effects along the path
  while (playerDashState.dashDustAccumulator >= DASH_DUST_SPACING) {
    playerDashState.dashDustAccumulator -= DASH_DUST_SPACING;
    if (playerDashState.isHolyDash) {
      spawnFlashEffect(player.x, player.y);
    } else {
      spawnPuffEffect(player.x, player.y, 20 * WORLD_SCALE);
    }
  }

  applyDashSlashTravelDamage(window._meleeAttackState);

  // Crash body-contact damage: anything the player's body touches during the protected dash
  if (playerDashState.crashDashActive && playerDashState.crashDashHitEntities) {
    const hitSet = playerDashState.crashDashHitEntities;
    const hitFwdOffset = 100 * WORLD_SCALE;
    const hitCenterX = player.x + playerDashState.dashDir.x * hitFwdOffset;
    const hitCenterY = player.y + playerDashState.dashDir.y * hitFwdOffset;
    const contactRadius = (player.radius || 24) * (playerDashState.isHolyDash ? 1.875 : 1.1);
    enemies.forEach((enemy) => {
      if (!enemy || enemy.dead || enemy.state === "death") return;
      if (hitSet.has(enemy)) return;
      if (Math.hypot(enemy.x - hitCenterX, enemy.y - hitCenterY) <= contactRadius + (enemy.radius || 20)) {
        hitSet.add(enemy);
        const dashMoveName = playerDashState.isHolyDash ? "Clash" : "Crash";
        const dashDmg = (playerDashState.crashDashDamage || 20) * getMoveMultiplier(dashMoveName);
        enemy.takeDamage(dashDmg, { damageType: "melee" });
        if (window._meleeAttackState) {
          registerMeleeComboHit(enemy, window._meleeAttackState, dashMoveName, { damage: dashDmg });
        }
        applyEnemyMeleeKnockback(enemy, hitCenterX, hitCenterY, MELEE_DAMAGE_KNOCKBACK * 2);
        if (playerDashState.isHolyDash) {
          playerDashState.clashHitAccum = (playerDashState.clashHitAccum || 0) + 1;
          if ((playerDashState.clashFeedbackCooldown || 0) <= 0) {
            const shakeMult = Math.min(1 + (playerDashState.clashHitAccum - 1) * 0.2, 2.5);
            playThrashHitSfx(0.8);
            applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_HIT_SHAKE_MAGNITUDE * shakeMult);
            playerDashState.clashFeedbackCooldown = 0.18;
            playerDashState.clashHitAccum = 0;
          }
        }
      }
    });
  }
  if ((playerDashState.clashFeedbackCooldown || 0) > 0) {
    playerDashState.clashFeedbackCooldown = Math.max(0, playerDashState.clashFeedbackCooldown - dt);
  }

  // End dash when distance complete
    if (playerDashState.dashDistanceRemaining <= 0) {
      playerDashState.isDashing = false;
      playerDashState.isHolyDash = false;
      if (window._meleeAttackState) {
        window._meleeAttackState.swooshDamageEnabled = false;
        window._meleeAttackState.swooshHitEntities = null;
        window._meleeAttackState.clashVisualActive = false;
      }
      playerDashState.crashDashActive = false;
      playerDashState.crashDashHitEntities = null;
      playerDashState.crashDashDamage = 0;
      setSharedBButtonCooldown(DASH_COOLDOWN);
      if (player) player.ignoreEntityCollisions = false;
  }
}

function applyRushDamageFromSwoosh(direction, meleeAttackState) {
  if (!meleeAttackState.rushDamageEnabled || !meleeAttackState.rushHitEntities) return;
  if (!player) return;
  const isBlitz = Boolean(meleeAttackState.swordRushActive);
  const isRoll = Boolean(meleeAttackState.blankaRollActive);
  const rushMoveName = isBlitz ? "Thrash" : (isRoll ? "Trash" : "Smash");
  const rushHitDamage = (isBlitz ? BLITZ_DAMAGE : RUSH_DAMAGE) * getMoveMultiplier(rushMoveName);
  meleeAttackState.currentAttackHitboxType = isBlitz ? "swordRush" : "rush";
  const dir = normalizeVector(direction.x, direction.y);
  const angle = Math.atan2(dir.y, dir.x);
  const hitboxRect = getPlayerRushHitboxLocalRect(player);
  if (!hitboxRect) return;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const applyRushHitstopOnce = (target, counterHit) => {
    if (!meleeAttackState || meleeAttackState.rushHitstopConsumed) return;
    beginMeleeHitstopSequence(meleeAttackState);
    applyMeleeHitstop(target, meleeAttackState, counterHit);
    meleeAttackState.rushHitstopConsumed = true;
  };
  enemies.forEach((enemy) => {
    if (enemy.dead || enemy.state === "death") return;
    if (meleeAttackState.rushHitEntities.has(enemy)) return;
    const hitCenter = getEnemyHitboxCenter(enemy);
    const relX = hitCenter.x - player.x;
    const relY = hitCenter.y - player.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    const hit = circleIntersectsRect(localX, localY, 0, hitboxRect);
    if (!hit) return;
    meleeAttackState.rushHitEntities.add(enemy);
    const counterHit = getCounterHitResult(enemy, rushHitDamage, meleeAttackState);
    const damage = counterHit.damage;
    const wasAlive = !enemy.dead && enemy.state !== "death";
    enemy.takeDamage(damage, { damageType: "charged", damageText: counterHit.damageText });
    meleeAttackState.thrashHitAccum = (meleeAttackState.thrashHitAccum || 0) + 1;
    if ((meleeAttackState.thrashFeedbackCooldown || 0) <= 0) {
      const shakeMult = Math.min(1 + (meleeAttackState.thrashHitAccum - 1) * 0.2, 2.5);
      playThrashHitSfx(0.8);
      applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_HIT_SHAKE_MAGNITUDE * shakeMult);
      meleeAttackState.thrashFeedbackCooldown = 0.18;
      meleeAttackState.thrashHitAccum = 0;
    }
    if (wasAlive && (enemy.dead || enemy.state === "death")) {
      enemy.killedByRush = true;
      meleeAttackState.rushKillCount = (meleeAttackState.rushKillCount || 0) + 1;
      meleeAttackState.rushKillSumX = (meleeAttackState.rushKillSumX || 0) + enemy.x;
      meleeAttackState.rushKillSumY = (meleeAttackState.rushKillSumY || 0) + enemy.y;
    }
    if (player?.animator) {
      player.animator.frameIndex = 2;
      player.animator.accumulator = 0;
      player.animator.finished = false;
    }
    applyRushHitstopOnce(enemy, counterHit);
    if (Number.isFinite(meleeAttackState.rushForceEndAt) && meleeAttackState.rushForceEndAt > 0) {
      const hitstopMs = (Number(player?.meleeHitstopTimer) || MELEE_HITSTOP_DURATION) * 1000;
      meleeAttackState.rushForceEndAt += hitstopMs;
    }
    registerPunishComboDamage(enemy, damage, meleeAttackState);
    registerMeleeComboHit(enemy, meleeAttackState, rushMoveName, {
      damage,
      isCounterHit: Boolean(counterHit?.isCounterHit),
      isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
    });
    registerChainHit(enemy, damage);
    if (!enemy.dead && enemy.state !== "death") {
      applyEnemyMeleeKnockback(enemy, player.x, player.y, RUSH_PUSHBACK_STRENGTH);
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!enemy.dead && enemy.state === "hurt") {
      const meleeCancelActive =
        meleeAttackState.meleeCancelUntil &&
        now <= meleeAttackState.meleeCancelUntil &&
        (!meleeAttackState.meleeCancelTarget || meleeAttackState.meleeCancelTarget === enemy);
      meleeAttackState.rushComboDamage = meleeCancelActive
        ? meleeAttackState.meleeCancelDamage + damage
        : damage;
      meleeAttackState.rushComboActiveUntil = now + 450;
      meleeAttackState.rushComboShown = false;
      meleeAttackState.rushComboHits = isBlitz ? 1 : (meleeCancelActive ? 2 : 1);
      meleeAttackState.rushComboTarget = enemy;
      if (meleeCancelActive) {
        meleeAttackState.meleeCancelUntil = 0;
        meleeAttackState.meleeCancelTarget = null;
      }
    }
    if (
      !meleeAttackState.divineComboShown &&
      meleeAttackState.divineComboDamage > 0 &&
      meleeAttackState.divineComboActiveUntil &&
      now <= meleeAttackState.divineComboActiveUntil &&
      meleeAttackState.divineComboTarget === enemy
    ) {
      meleeAttackState.divineComboDamage += damage;
      meleeAttackState.divineComboActiveUntil = now + 450;
      meleeAttackState.divineComboTarget = enemy;
      meleeAttackState.divineComboHits = Math.max(2, (meleeAttackState.divineComboHits || 1) + 1);
    }
    spawnEnemyHitEffect(enemy);
    if (typeof playEnemyHitSfx === "function") {
      playEnemyHitSfx(0.6);
    }
  });
  if (activeBoss && !activeBoss.dead && !activeBoss.defeated && !activeBoss.removed) {
    if (!meleeAttackState.rushHitEntities.has(activeBoss)) {
      const hitCenter = getEnemyHitboxCenter(activeBoss);
      const relX = hitCenter.x - player.x;
      const relY = hitCenter.y - player.y;
      const localX = relX * cos - relY * sin;
      const localY = relX * sin + relY * cos;
      const hit = circleIntersectsRect(localX, localY, 0, hitboxRect);
      if (hit) {
        meleeAttackState.rushHitEntities.add(activeBoss);
        const counterHit = getCounterHitResult(activeBoss, rushHitDamage, meleeAttackState);
        const damage = counterHit.damage;
        activeBoss.takeDamage(damage, {
          hitX: activeBoss.x,
          hitY: activeBoss.y,
          damageType: "charged",
          damageText: counterHit.damageText,
        });
        applyRushHitstopOnce(activeBoss, counterHit);
        registerPunishComboDamage(activeBoss, damage, meleeAttackState);
        registerMeleeComboHit(activeBoss, meleeAttackState, rushMoveName, {
          damage,
          isCounterHit: Boolean(counterHit?.isCounterHit),
          isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
        });
        registerChainHit(activeBoss, damage);
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (!activeBoss.dead && activeBoss.state === "hurt") {
          const meleeCancelActive =
            meleeAttackState.meleeCancelUntil &&
            now <= meleeAttackState.meleeCancelUntil &&
            (!meleeAttackState.meleeCancelTarget ||
              meleeAttackState.meleeCancelTarget === activeBoss);
          meleeAttackState.rushComboDamage = meleeCancelActive
            ? meleeAttackState.meleeCancelDamage + damage
            : damage;
          meleeAttackState.rushComboActiveUntil = now + 450;
          meleeAttackState.rushComboShown = false;
          meleeAttackState.rushComboHits = isBlitz ? 1 : (meleeCancelActive ? 2 : 1);
          meleeAttackState.rushComboTarget = activeBoss;
          if (meleeCancelActive) {
            meleeAttackState.meleeCancelUntil = 0;
            meleeAttackState.meleeCancelTarget = null;
          }
        }
        if (typeof activeBoss.knockbackVx === "number") {
          applyEnemyMeleeKnockback(activeBoss, player.x, player.y, RUSH_PUSHBACK_STRENGTH);
        }
        if (
          !meleeAttackState.divineComboShown &&
          meleeAttackState.divineComboDamage > 0 &&
          meleeAttackState.divineComboActiveUntil &&
          now <= meleeAttackState.divineComboActiveUntil &&
          meleeAttackState.divineComboTarget === activeBoss
        ) {
          meleeAttackState.divineComboDamage += damage;
          meleeAttackState.divineComboActiveUntil = now + 450;
          meleeAttackState.divineComboTarget = activeBoss;
          meleeAttackState.divineComboHits = Math.max(
            2,
            (meleeAttackState.divineComboHits || 1) + 1,
          );
        }
        const comboNow = now;
        spawnEnemyHitEffect(activeBoss);
        if (typeof playEnemyHitSfx === "function") {
          playEnemyHitSfx(0.6);
        }
      }
    }
  }
}

function applySwordRushBlastWaveDamage(direction, meleeAttackState) {
  if (!meleeAttackState?.swordRushActive || !meleeAttackState?.swordRushBlastHitEntities || !player) return;
  meleeAttackState.currentAttackHitboxType = "swordRush";
  const dir = normalizeVector(direction.x, direction.y);
  const angle = Math.atan2(dir.y, dir.x);
  const hitboxRect = {
    x: 56 * WORLD_SCALE,
    y: -62 * WORLD_SCALE,
    width: 240 * WORLD_SCALE,
    height: 124 * WORLD_SCALE,
  };
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  enemies.forEach((enemy) => {
    if (enemy.dead || enemy.state === "death") return;
    if (meleeAttackState.swordRushBlastHitEntities.has(enemy)) return;
    const hitCenter = getEnemyHitboxCenter(enemy);
    const relX = hitCenter.x - player.x;
    const relY = hitCenter.y - player.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    if (!circleIntersectsRect(localX, localY, 0, hitboxRect)) return;
    meleeAttackState.swordRushBlastHitEntities.add(enemy);
    const counterHit = getCounterHitResult(enemy, SWORD_RUSH_BLAST_DAMAGE * getMoveMultiplier("Thrash"), meleeAttackState);
    const damage = counterHit.damage;
    enemy.takeDamage(damage, { damageType: "charged", damageText: counterHit.damageText });
    meleeAttackState.wardHitAccum = (meleeAttackState.wardHitAccum || 0) + 1;
    if ((meleeAttackState.wardFeedbackCooldown || 0) <= 0) {
      const shakeMult = Math.min(1 + (meleeAttackState.wardHitAccum - 1) * 0.2, 2.5);
      playThrashHitSfx(0.8);
      applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_HIT_SHAKE_MAGNITUDE * shakeMult);
      meleeAttackState.wardFeedbackCooldown = 0.18;
      meleeAttackState.wardHitAccum = 0;
    }
    applyMeleeHitstop(enemy, meleeAttackState, counterHit);
    registerPunishComboDamage(enemy, damage, meleeAttackState);
    registerMeleeComboHit(enemy, meleeAttackState, "Thrash", {
      damage,
      isCounterHit: Boolean(counterHit?.isCounterHit),
      isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
    });
    registerChainHit(enemy, damage);
    spawnEnemyHitEffect(enemy);
  });
  if (activeBoss && !activeBoss.dead && !activeBoss.defeated && !activeBoss.removed) {
    if (!meleeAttackState.swordRushBlastHitEntities.has(activeBoss)) {
      const hitCenter = getEnemyHitboxCenter(activeBoss);
      const relX = hitCenter.x - player.x;
      const relY = hitCenter.y - player.y;
      const localX = relX * cos - relY * sin;
      const localY = relX * sin + relY * cos;
      if (circleIntersectsRect(localX, localY, 0, hitboxRect)) {
        meleeAttackState.swordRushBlastHitEntities.add(activeBoss);
        const counterHit = getCounterHitResult(activeBoss, SWORD_RUSH_BLAST_DAMAGE * getMoveMultiplier("Thrash"), meleeAttackState);
        const damage = counterHit.damage;
        activeBoss.takeDamage(damage, {
          hitX: activeBoss.x,
          hitY: activeBoss.y,
          damageType: "charged",
          damageText: counterHit.damageText,
        });
        applyMeleeHitstop(activeBoss, meleeAttackState, counterHit);
        registerPunishComboDamage(activeBoss, damage, meleeAttackState);
        registerMeleeComboHit(activeBoss, meleeAttackState, "Thrash", {
          damage,
          isCounterHit: Boolean(counterHit?.isCounterHit),
          isPunishCounter: Boolean(counterHit?.isPunishCounter),
          baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
        });
        registerChainHit(activeBoss, damage);
        spawnEnemyHitEffect(activeBoss);
      }
    }
  }
}

function releasePlayerFromRushPoseLock(playerEntity) {
  if (!playerEntity) return;
  playerEntity._paperdollSmashFrame3HoldUntil = 0;
  playerEntity._paperdollThrustHoldUntil = 0;
  if (playerEntity.animator) {
    playerEntity.animator.finished = false;
  }
  if (playerEntity.state === "attackMelee") {
    const moveDir = window.Input?.movementDirection;
    const moving = Boolean(moveDir) && (Math.hypot(moveDir.x || 0, moveDir.y || 0) > 0.01);
    const nextState = moving ? "walk" : "idle";
    playerEntity.state = nextState;
    playerEntity.animator?.play(nextState, { restart: true });
  }
}

function updateRushMovement(dt, direction, meleeAttackState) {
  if (!meleeAttackState.isRushing || !player) return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  if (player.animator) {
    // Prevent rare stuck frame after rush hitfreeze.
    player.animator.finished = false;
  }

  const resetRushState = () => {
    meleeAttackState.isRushing = false;
    meleeAttackState.rushJustEnded = true;
    meleeAttackState.rushDamageEnabled = false;
    meleeAttackState.rushInvulnerable = false;
    meleeAttackState.rushHitEntities = null;
    meleeAttackState.swordRushActive = false;
    meleeAttackState.swordRushBlastHitEntities = null;
    meleeAttackState.rushKillCount = 0;
    meleeAttackState.rushKillSumX = 0;
    meleeAttackState.rushKillSumY = 0;
    meleeAttackState.projectileBlockTimer = MELEE_PROJECTILE_COOLDOWN_AFTER;
    meleeAttackState.cooldown = 0;
    meleeAttackState.rushLockTimer = 0;
    meleeAttackState.rushDistanceRemaining = 0;
    meleeAttackState.pendingComboMoveName = null;
    releasePlayerFromRushPoseLock(player);
    if (player) player.ignoreEntityCollisions = false;
  };

  if (!Number.isFinite(meleeAttackState.rushDistanceRemaining) || meleeAttackState.rushDistanceRemaining <= 0) {
    resetRushState();
    return;
  }

  // Blitz cancel: pressing the opposite direction stops the blitz early
  if (meleeAttackState.swordRushActive) {
    const liveInput = window.Input?.movementDirection;
    if (liveInput && (liveInput.x !== 0 || liveInput.y !== 0)) {
      const rushDir = meleeAttackState.rushDir || direction;
      const dot = liveInput.x * rushDir.x + liveInput.y * rushDir.y;
      if (dot < -0.3) {
        resetRushState();
        return;
      }
    }
  }

  applyMeleeInvulnerability(meleeAttackState, "rush", RUSH_EXIT_INVULNERABILITY);

  const startX = player.x;
  const startY = player.y;
  const movement = Math.min(meleeAttackState.rushDistanceRemaining, RUSH_SPEED * dt);
  player.x += direction.x * movement;
  player.y += direction.y * movement;
  resolveEntityObstacles(player);
  clampEntityToBounds(player);
  const actualMoved = Math.hypot(player.x - startX, player.y - startY);
  const blockedByBounds = movement > 0.001 && actualMoved < movement * 0.35;
  meleeAttackState.rushSegment = {
    x1: startX,
    y1: startY,
    x2: player.x,
    y2: player.y,
  };
  meleeAttackState.rushHitboxTimer = Math.max(
    meleeAttackState.rushHitboxTimer || 0,
    RUSH_HITBOX_DEBUG_DURATION,
  );
  applyRushDamageFromSwoosh(direction, meleeAttackState);
  if (!meleeAttackState.swordRushActive) {
    applySwordRushBlastWaveDamage(direction, meleeAttackState);
  }
  meleeAttackState.rushDistanceRemaining -= actualMoved;
  meleeAttackState.rushDustAccumulator += actualMoved;

  while (meleeAttackState.rushDustAccumulator >= RUSH_DUST_SPACING) {
    meleeAttackState.rushDustAccumulator -= RUSH_DUST_SPACING;
    if (meleeAttackState.swordRushActive) {
      spawnFlashEffect(player.x, player.y);
    } else {
      const rushAngle = meleeAttackState.blankaRollActive && Number.isFinite(meleeAttackState.blankaRollVisualAngle)
        ? meleeAttackState.blankaRollVisualAngle
        : Math.atan2(direction.y, direction.x);
      const forwardAngle = Math.atan2(direction.y, direction.x);
      // Anchor at the rush hitbox front so Trash reads as a forward clearing blade, not a rear trail.
      const rushBox = getPlayerRushHitboxLocalRect(player);
      const frontOffset = rushBox
        ? Math.max(24, (rushBox.x || 0) + (rushBox.width || 0) * 0.9)
        : Math.max(24, (player.radius || 24) * 1.8);
      const trailX = player.x + Math.cos(forwardAngle) * frontOffset;
      const trailY = player.y + Math.sin(forwardAngle) * frontOffset;
      if (typeof spawnSlashBurstEffect === "function") {
        const isTrashRush = Boolean(meleeAttackState.blankaRollActive);
        const slashTint = isTrashRush ? "#67b8ff" : "#ff9a2f";
        const slashGlow = isTrashRush ? "#8fd3ff" : "#ffb25a";
        spawnSlashBurstEffect(trailX, trailY, rushAngle, RUSH_GLOW_TRAIL_SCALE, {
          scaleX: RUSH_GLOW_TRAIL_SCALE_X,
          scaleY: RUSH_GLOW_TRAIL_SCALE_Y,
          tintColor: slashTint,
          tintAlpha: 0.97,
          glowColor: slashGlow,
          glowBlur: RUSH_GLOW_TRAIL_GLOW_BLUR,
          glowAlpha: RUSH_GLOW_TRAIL_GLOW_ALPHA,
          blendMode: "lighter",
        });
      } else {
        spawnPuffEffect(player.x, player.y + player.radius * 0.5, 18 * WORLD_SCALE);
      }
    }
  }

  if (meleeAttackState.rushDistanceRemaining <= 0 || blockedByBounds) {
    const rushKillCount = Math.max(0, Math.round(meleeAttackState.rushKillCount || 0));
    if (rushKillCount > 0) {
      const rushKillSumX = Number(meleeAttackState.rushKillSumX) || 0;
      const rushKillSumY = Number(meleeAttackState.rushKillSumY) || 0;
      const popX = rushKillSumX / rushKillCount;
      const popY = rushKillSumY / rushKillCount;
      const edgeMargin = 20;
      const sx = popX - cameraOffsetX;
      const sy = popY - 28;
      const clampedSx = Math.max(edgeMargin, Math.min(canvas.width - edgeMargin, sx));
      const clampedSy = Math.max(HUD_HEIGHT + edgeMargin, Math.min(canvas.height - edgeMargin, sy));
      addFloatingTextAt(clampedSx + cameraOffsetX, clampedSy, `${rushKillCount}`, "#FFE6A3", {
        speechBubble: false,
        vy: 0,
        life: 0.9,
        fadeDelay: 0.2,
        fontSize: 34,
        fontWeight: "900",
        priority: 7,
        clampToScreen: true,
      });
    }
    resetRushState();
  }
}

function applyEnemyMeleeKnockback(enemy, sourceX, sourceY, strength, options = null) {
  if (!enemy || enemy.dead || enemy.state === "death") return;
  const knockOptions = options && typeof options === "object" ? options : null;
  const consumeQueuedKnockdown = enemy.pendingComboKnockdownLaunch === true;
  if (consumeQueuedKnockdown) {
    enemy.pendingComboKnockdownLaunch = false;
  }
  const effectiveStrength = consumeQueuedKnockdown
    ? Math.max(strength, strength * MELEE_KNOCKDOWN_LAUNCH_MULTIPLIER)
    : strength;
  const dx = enemy.x - sourceX;
  const dy = enemy.y - sourceY;
  const distance = Math.hypot(dx, dy);
  if (!distance) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const knockDurationBase = Number.isFinite(knockOptions?.duration)
    ? Math.max(0.02, knockOptions.duration)
    : 0.16;
  const knockDuration = consumeQueuedKnockdown
    ? Math.max(knockDurationBase, MELEE_KNOCKDOWN_LAUNCH_DURATION)
    : knockDurationBase;
  const knockStrength = effectiveStrength * 6.0;
  const vx = nx * knockStrength;
  const vy = ny * knockStrength;
  const nudgeScaleBase = Number.isFinite(knockOptions?.nudgeScale) ? Math.max(0, knockOptions.nudgeScale) : 1;
  const nudgeScale = consumeQueuedKnockdown ? Math.max(nudgeScaleBase, 1.35) : nudgeScaleBase;
  const nudge = (typeof WORLD_SCALE === "number" ? WORLD_SCALE : 1) * 30 * nudgeScale;
  enemy.x += nx * nudge;
  enemy.y += ny * nudge;
  enemy.knockbackVx = vx;
  enemy.knockbackVy = vy;
  enemy.knockbackTimer = Math.max(enemy.knockbackTimer || 0, knockDuration);
  enemy.knockbackDuration = Math.max(enemy.knockbackDuration || 0, knockDuration);
  enemy.knockbackLift = Math.max(
    enemy.knockbackLift || 0,
    Number.isFinite(knockOptions?.lift)
      ? Math.max(
        0,
        consumeQueuedKnockdown
          ? Math.max(knockOptions.lift, MELEE_KNOCKDOWN_LIFT)
          : knockOptions.lift,
      )
      : Math.min(28, Math.max(12, strength * 0.24)),
  );
  enemy.scatterVx = vx;
  enemy.scatterVy = vy;
  enemy.scatterTimer = Math.max(enemy.scatterTimer || 0, knockDuration);
  enemy.scatterDuration = Math.max(enemy.scatterDuration || 0, knockDuration);
}

function triggerMeleeComboKnockdown(target, meleeAttackState, comboHits) {
  if (!target || !meleeAttackState || target.dead || target.state === "death") return;
  if (target === activeBoss || target.isBoss === true) return;
  const hits = Math.max(0, Math.round(comboHits || 0));
  if (hits < MELEE_KNOCKDOWN_MIN_HITS) return;
  const localHits = hits - MELEE_KNOCKDOWN_MIN_HITS;
  if (localHits % MELEE_KNOCKDOWN_REPEAT_INTERVAL !== 0) return;
  const comboId = meleeAttackState.devArenaComboId || null;
  if (comboId && target.lastComboKnockdownComboId === comboId) {
    const lastThreshold = Math.max(0, Math.round(target.lastComboKnockdownHitThreshold || 0));
    if (lastThreshold >= hits) return;
  }

  target.lastComboKnockdownComboId = comboId;
  target.lastComboKnockdownHitThreshold = hits;
  target.knockdownActive = true;
  target.knockdownEndAt = Date.now() + Math.round(MELEE_KNOCKDOWN_HURT_LOCK * 1000);
  target.hurtTimer = Math.max(Number(target.hurtTimer) || 0, MELEE_KNOCKDOWN_HURT_LOCK);
  target.hurtTimerActive = true;
  if (target.state !== "death") {
    target.state = "hurt";
    if (typeof target.animator?.play === "function") {
      target.animator.play("hurt", { restart: true });
    }
  }
  target.comboKnockdown = {
    active: true,
    source: "meleeCombo",
    downRatio: 0.58,
    frameRate: 18,
  };
  target.pendingComboKnockdownLaunch = true;
}

function triggerEnemyComboDizzy(target, comboHits = 0) {
  if (!target || target.dead || target.state === "death") return;
  if (target === activeBoss || target.isBoss === true) return;
  const hits = Math.max(0, Math.round(comboHits || 0));
  if (hits < MELEE_DIZZY_MIN_CHAIN_HITS) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  if (Number.isFinite(target.dizzyUntil) && target.dizzyUntil > now + 120) return;
  target.dizzyTimer = Math.max(Number(target.dizzyTimer) || 0, MELEE_DIZZY_DURATION);
  target.dizzyDuration = Math.max(Number(target.dizzyDuration) || 0, MELEE_DIZZY_DURATION);
  target.dizzyUntil = now + Math.round(MELEE_DIZZY_DURATION * 1000);
  target.state = "dizzy";
  target.hurtTimer = 0;
  target.hurtTimerActive = false;
  target.knockbackTimer = 0;
  target.scatterTimer = 0;
  target.pendingComboKnockdownLaunch = false;
  if (typeof target.animator?.play === "function") {
    target.animator.play("walk", { restart: true });
  }
}

function markCounterHitWindow(target, duration = COUNTER_HIT_WINDOW) {
  if (!target) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  target.counterHitUntil = now + Math.max(0, duration) * 1000;
}

function clearPunishCounterState(meleeAttackState) {
  if (!meleeAttackState) return;
  meleeAttackState.punishCounterTarget = null;
  meleeAttackState.punishCounterExpiresAt = 0;
  meleeAttackState.punishCounterPrimed = false;
  meleeAttackState.punishCounterTextShown = false;
  meleeAttackState.punishComboDamage = 0;
  meleeAttackState.pendingCounterHitTarget = null;
  meleeAttackState.pendingCounterHitShowAt = 0;
  if (meleeAttackState.activeCounterHitKind === "punish") {
    clearActiveCounterHitText(meleeAttackState);
  }
}

function getMultiplierBonusLabel(multiplier) {
  const bonusPercent = Math.max(0, Math.round((Math.max(0, Number(multiplier) || 1) - 1) * 100));
  return `+${bonusPercent}%`;
}

function triggerPunishCounterText(target, meleeAttackState = null) {
  if (!target || !meleeAttackState) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  meleeAttackState.activeCounterHitTarget = target;
  meleeAttackState.activeCounterHitKind = "punish";
  meleeAttackState.activeCounterHitUntil =
    now + Math.max(PUNISH_COUNTER_TEXT_LIFE, MELEE_COMBO_TEXT_LIFE) * 1000;
  updateMeleeComboLabel(meleeAttackState);
}

function triggerCounterHitText(target, meleeAttackState = null) {
  if (!target || !meleeAttackState) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  meleeAttackState.activeCounterHitTarget = target;
  meleeAttackState.activeCounterHitKind = "counter";
  meleeAttackState.activeCounterHitUntil =
    now + Math.max(COUNTER_HIT_TEXT_LIFE, MELEE_COMBO_TEXT_LIFE) * 1000;
  updateMeleeComboLabel(meleeAttackState);
}

function clearActiveCounterHitText(meleeAttackState, target = null, immediate = false) {
  if (!meleeAttackState || !meleeAttackState.activeCounterHitTarget) return;
  if (target && meleeAttackState.activeCounterHitTarget !== target) return;
  meleeAttackState.activeCounterHitLabel = null;
  meleeAttackState.activeCounterHitTarget = null;
  meleeAttackState.activeCounterHitKind = null;
  meleeAttackState.activeCounterHitUntil = 0;
  if (!immediate) {
    updateMeleeComboLabel(meleeAttackState);
  }
}

function registerPunishComboDamage(target, damage, meleeAttackState) {
  if (!target || !meleeAttackState) return;
  const damageValue = Math.max(0, Math.round(damage || 0));
  if (!damageValue) return;
  if (meleeAttackState.punishCounterTarget !== target) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  if (
    !Number.isFinite(meleeAttackState.punishCounterExpiresAt) ||
    now > meleeAttackState.punishCounterExpiresAt
  ) {
    clearPunishCounterState(meleeAttackState);
    return;
  }
  meleeAttackState.punishComboDamage =
    Math.max(0, Math.round(meleeAttackState.punishComboDamage || 0)) + damageValue;
}

function rewardMeleeGraceBurst(target, count, spread = null) {
  const gemCount = Math.max(0, Math.round(count || 0));
  if (!target || !gemCount) return;
  const baseX = Number.isFinite(target.x) ? target.x : null;
  const baseY = Number.isFinite(target.y) ? target.y : null;
  if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return;
  spawnGraceArcBurst(baseX, baseY, gemCount, spread);
}

function beginMeleeHitstopSequence(meleeAttackState) {
  if (!meleeAttackState) return;
  meleeAttackState.hitstopSequenceId = (meleeAttackState.hitstopSequenceId || 0) + 1;
  meleeAttackState.hitstopAppliedSequenceId = 0;
}

function consumeEntityMeleeHitstopDt(entity, dt) {
  if (!entity || !Number.isFinite(dt) || dt <= 0) return dt;
  const remaining = Number(entity.meleeHitstopTimer) || 0;
  if (remaining <= 0) return dt;
  entity.meleeHitstopTimer = Math.max(0, remaining - dt);
  return 0;
}

function applyMeleeHitstop(target, meleeAttackState, counterHit) {
  if (!target) return;
  if (
    meleeAttackState &&
    meleeAttackState.hitstopSequenceId &&
    meleeAttackState.hitstopAppliedSequenceId === meleeAttackState.hitstopSequenceId
  ) {
    return;
  }
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const comboFollowUp = Boolean(
    meleeAttackState &&
      meleeAttackState.meleeComboTarget === target &&
      (meleeAttackState.meleeComboHits || 0) >= 1 &&
      Number.isFinite(meleeAttackState.meleeComboExpiresAt) &&
      now <= meleeAttackState.meleeComboExpiresAt,
  );
  let duration = comboFollowUp ? MELEE_COMBO_HITSTOP_DURATION : MELEE_HITSTOP_DURATION;
  let shake = comboFollowUp ? MELEE_COMBO_HITSTOP_SHAKE : MELEE_HITSTOP_SHAKE;
  if (counterHit?.isPunishCounter) {
    duration = MELEE_PUNISH_HITSTOP_DURATION;
    shake = MELEE_PUNISH_HITSTOP_SHAKE;
  } else if (counterHit?.isCounterHit) {
    duration = MELEE_COUNTER_HITSTOP_DURATION;
    shake = MELEE_COUNTER_HITSTOP_SHAKE;
  }
  target.meleeHitstopTimer = Math.max(Number(target.meleeHitstopTimer) || 0, duration);
  if (player && player !== target) {
    player.meleeHitstopTimer = Math.max(Number(player.meleeHitstopTimer) || 0, duration);
  }
  if (meleeAttackState && meleeAttackState.hitstopSequenceId) {
    meleeAttackState.hitstopAppliedSequenceId = meleeAttackState.hitstopSequenceId;
  }
  applyCameraShake(Math.max(0.08, duration * 2.5), shake);
}

function queueCounterHitText(target, meleeAttackState, delayMs = 110) {
  if (!target) return;
  if (!meleeAttackState) {
    triggerCounterHitText(target);
    return;
  }
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  meleeAttackState.pendingCounterHitTarget = target;
  meleeAttackState.pendingCounterHitShowAt = now + Math.max(0, delayMs);
}

function getCounterHitResult(target, baseDamage, meleeAttackState = null) {
  const base = Math.max(0, Math.round(baseDamage || 0));
  if (!target || base <= 0) {
    return { damage: base, baseDamage: base, isCounterHit: false, damageText: null };
  }
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const punishActive =
    meleeAttackState &&
    meleeAttackState.punishCounterTarget === target &&
    Number.isFinite(meleeAttackState.punishCounterExpiresAt) &&
    now <= meleeAttackState.punishCounterExpiresAt;
  if (punishActive) {
    recordTutorialArenaCounter("punish");
    return {
      damage: Math.max(1, Math.round(base * PUNISH_COUNTER_MULTIPLIER)),
      baseDamage: base,
      isCounterHit: true,
      isPunishCounter: true,
      damageText: {
        color: UI_COLOR.damageCounter,
        offsetY: 8,
        fontWeight: "800",
        priority: 1,
      },
    };
  }
  const counterUntil = Number(target.counterHitUntil) || 0;
  if (counterUntil <= 0 || now > counterUntil) {
    return { damage: base, baseDamage: base, isCounterHit: false, damageText: null };
  }
  target.counterHitUntil = 0;
  if (meleeAttackState) {
    meleeAttackState.punishCounterTarget = target;
    meleeAttackState.punishCounterExpiresAt = now + MELEE_COMBO_WINDOW_MS;
    meleeAttackState.punishCounterPrimed = true;
    meleeAttackState.punishCounterTextShown = false;
  }
  rewardMeleeGraceBurst(target, COUNTER_HIT_GRACE_GEMS, 48);
  queueCounterHitText(target, meleeAttackState);
  recordTutorialArenaCounter("counter");
  return {
    damage: Math.max(1, Math.round(base * PUNISH_COUNTER_MULTIPLIER)),
    baseDamage: base,
    isCounterHit: true,
    isPunishCounter: false,
    damageText: {
      color: UI_COLOR.damageCounter,
      offsetY: 8,
      fontWeight: "800",
      priority: 1,
    },
  };
}

function clearMeleeComboLabel(meleeAttackState) {
  if (!meleeAttackState) return;
  if (meleeAttackState.meleeComboLabel) {
    meleeAttackState.meleeComboLabel.persist = false;
    meleeAttackState.meleeComboLabel.life = Math.max(
      meleeAttackState.meleeComboLabel.life || 0,
      MELEE_COMBO_TEXT_LIFE,
    );
    meleeAttackState.meleeComboLabel.fadeDelay = 0;
  }
  meleeAttackState.meleeComboLabel = null;
  if (meleeAttackState.meleeComboMap) {
    for (const entry of meleeAttackState.meleeComboMap.values()) {
      releaseEntryComboLabel(entry);
    }
  }
}

function releaseEntryComboLabel(entry) {
  if (!entry?.label) return;
  entry.label.persist = false;
  entry.label.life = Math.max(entry.label.life || 0, MELEE_COMBO_TEXT_LIFE);
  entry.label.fadeDelay = 0;
  entry.label = null;
}

function resetComboMoveNames(meleeAttackState) {
  if (!meleeAttackState) return;
  meleeAttackState.comboMoveNames = [];
  meleeAttackState.comboMovesWindowUntil = 0;
  meleeAttackState.pendingComboMoveName = null;
}

function getComboMoveCalloutColor(moveCount) {
  if (moveCount >= 4) return "#ffd166";
  if (moveCount >= 3) return "#ffe08a";
  if (moveCount >= 2) return "#fff0b8";
  return "#f8fbff";
}

function updateComboMoveCallout(meleeAttackState) {
  if (!meleeAttackState || !heroComboCallout) return;
  const names = Array.isArray(meleeAttackState.comboMoveNames)
    ? meleeAttackState.comboMoveNames.filter((name) => typeof name === "string" && name.length)
    : [];
  if (names.length < 2) return;
  heroComboCallout(names.join(" / "), {
    life: 2.4,
    color: getComboMoveCalloutColor(names.length),
  });
}

function registerComboMoveName(meleeAttackState, moveName) {
  if (!meleeAttackState || !moveName) return;
  pushDevMeleeMove(moveName);
  meleeAttackState.pendingComboMoveName = String(moveName);
}

function getComboMoveNameForHit(meleeAttackState, explicitMoveName = null) {
  if (explicitMoveName) return String(explicitMoveName);
  const hitboxType = String(meleeAttackState?.currentAttackHitboxType || "").trim();
  if (hitboxType === "swordRush") return "Thrash";
  if (hitboxType === "rush") return "Smash";
  if (hitboxType === "holyGround") return MOVE_NAME_AC_SUPER;
  if (hitboxType === "slash" || hitboxType === "dashSlash") return "Slash";
  if (hitboxType === "spin") return "Reap";
  return "Slash";
}

function maybeAnnounceComboMoveNames(meleeAttackState, hits) {
  if (!meleeAttackState || !heroComboCallout) return;
  const hitCount = Math.max(0, Math.round(hits || 0));
  if (hitCount < 2) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const names = Array.isArray(meleeAttackState.comboMoveNames)
    ? meleeAttackState.comboMoveNames.filter((name) => typeof name === "string" && name.length)
    : [];
  if (!names.length) return;
  if (
    Number.isFinite(meleeAttackState.lastComboMoveCalloutAt) &&
    now - meleeAttackState.lastComboMoveCalloutAt < 120
  ) {
    return;
  }
  heroComboCallout(names.join(" / "), {
    life: 2.4,
    color: getComboMoveCalloutColor(names.length),
  });
  meleeAttackState.lastComboMoveCalloutAt = now;
  resetComboMoveNames(meleeAttackState);
}

function getMeleeCombatLabelConfig(meleeAttackState, target) {
  if (!meleeAttackState || !target) return null;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  let specialText = "";
  let specialKind = null;
  if (
    meleeAttackState.activeCounterHitTarget === target &&
    Number.isFinite(meleeAttackState.activeCounterHitUntil) &&
    now <= meleeAttackState.activeCounterHitUntil
  ) {
    specialKind = meleeAttackState.activeCounterHitKind || "counter";
    specialText =
      specialKind === "punish"
        ? `Punish Counter ${getMultiplierBonusLabel(PUNISH_COUNTER_MULTIPLIER)}`
        : `Counter Hit ${getMultiplierBonusLabel(COUNTER_HIT_MULTIPLIER)}`;
  } else if (meleeAttackState.activeCounterHitTarget === target) {
    meleeAttackState.activeCounterHitTarget = null;
    meleeAttackState.activeCounterHitKind = null;
    meleeAttackState.activeCounterHitUntil = 0;
  }
  const mapEntry = meleeAttackState.meleeComboMap?.get(target);
  const targetHits = (mapEntry && mapEntry.expiresAt >= now) ? mapEntry.hits : 0;
  const hits = Math.max(0, Math.round(targetHits || 0));

  let labelText = "";
  if (hits >= 2 && specialKind) {
    // Merged: ×4 PC or ×2 CA
    const tag = specialKind === "punish" ? "PC" : "CA";
    labelText = `×${hits} ${tag}`;
  } else if (hits >= 2) {
    labelText = `×${hits}`;
  } else if (specialKind) {
    labelText = specialKind === "punish" ? "PC" : "CA";
  }
  if (!labelText) return null;

  const hitboxRect = getEnemyHitboxRect(target);
  const centerOffsetY = hitboxRect
    ? (hitboxRect.y - target.y) + hitboxRect.height * (3 / 4)
    : (target.radius || target.config?.hitRadius || 24) * (1 / 3);
  return {
    text: labelText,
    color:
      specialKind === "punish"
        ? "#FFD84F"
        : specialKind === "counter"
          ? UI_COLOR.damageCounter
          : "#FFE083",
    fontSize: 28,
    fontWeight: specialKind === "punish" ? "900" : "800",
    offsetY: centerOffsetY,
  };
}

function updateMeleeComboLabel(meleeAttackState) {
  if (!meleeAttackState) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const map = meleeAttackState.meleeComboMap;
  if (!map || map.size === 0) {
    clearMeleeComboLabel(meleeAttackState);
    return;
  }
  for (const [target, entry] of map) {
    if (target.dead || target.state === "death" || target.removed) {
      releaseEntryComboLabel(entry);
      map.delete(target);
      if (meleeAttackState.punishCounterTarget === target) clearPunishCounterState(meleeAttackState);
      if (meleeAttackState.meleeComboTarget === target) meleeAttackState.meleeComboTarget = null;
      continue;
    }
    if (entry.expiresAt < now) {
      releaseEntryComboLabel(entry);
      map.delete(target);
      continue;
    }
    const labelConfig = getMeleeCombatLabelConfig(meleeAttackState, target);
    if (!labelConfig) {
      releaseEntryComboLabel(entry);
      continue;
    }
    const comboLabelY = target.y + labelConfig.offsetY;
    if (!entry.label) {
      entry.label = addFloatingTextAt(
        target.x,
        comboLabelY,
        labelConfig.text,
        labelConfig.color,
        {
          speechBubble: false,
          vy: 0,
          life: MELEE_COMBO_TEXT_LIFE,
          entity: target,
          offsetY: labelConfig.offsetY,
          fontSize: labelConfig.fontSize,
          fontWeight: labelConfig.fontWeight,
          priority: 6,
          persist: true,
        },
      );
    } else {
      entry.label.text = labelConfig.text;
      entry.label.x = target.x;
      entry.label.y = comboLabelY;
      entry.label.entity = target;
      entry.label.offsetY = labelConfig.offsetY;
      entry.label.color = labelConfig.color;
      entry.label.persist = true;
      entry.label.life = Math.max(entry.label.life || 0, MELEE_COMBO_TEXT_LIFE);
      entry.label.fontSize = labelConfig.fontSize;
      entry.label.fontWeight = labelConfig.fontWeight;
    }
  }
  meleeAttackState.meleeComboHits = getMaxLiveMeleeComboHits(meleeAttackState, now);
}

function getMaxLiveMeleeComboHits(meleeAttackState, now) {
  if (!meleeAttackState?.meleeComboMap) return 0;
  let max = 0;
  for (const entry of meleeAttackState.meleeComboMap.values()) {
    if (entry.expiresAt >= now) max = Math.max(max, entry.hits);
  }
  return max;
}

function registerMeleeComboHit(target, meleeAttackState, moveNameOverride = null, hitMeta = null) {
  if (!target || !meleeAttackState) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  if (!meleeAttackState.meleeComboMap) meleeAttackState.meleeComboMap = new Map();
  const map = meleeAttackState.meleeComboMap;
  const existing = map.get(target);
  const chainActive = existing && existing.expiresAt >= now;
  const previousHits = chainActive ? existing.hits : 0;
  const previousTotalHits = chainActive
    ? Math.max(0, Math.round(existing.totalHits || existing.hits || 0))
    : 0;
  const newTotalHits = previousTotalHits + 1;
  let newHits = chainActive ? previousHits + 1 : 1;
  const comboId = chainActive && existing.comboId
    ? existing.comboId
    : (() => { devMeleeComboSerial += 1; return `confirmed-${devMeleeComboSerial}`; })();
  const names = chainActive && Array.isArray(existing.names) ? existing.names : [];
  const detailEntries = chainActive && Array.isArray(existing.details) ? existing.details : [];
  if (!chainActive) { names.length = 0; detailEntries.length = 0; }
  meleeAttackState.meleeComboTarget = target;
  meleeAttackState.meleeComboExpiresAt = now + MELEE_COMBO_WINDOW_MS;
  meleeAttackState.devArenaComboId = comboId;
  meleeAttackState.comboMoveNames = names;
  meleeAttackState.devArenaComboEntries = detailEntries;
  const moveName = getComboMoveNameForHit(meleeAttackState, moveNameOverride);
  // Tutorial objective attribution: remember the most recent resolved move that hit this enemy.
  if (target && typeof target === "object") {
    target.tutorialLastMove = moveName;
    target.tutorialLastMoveAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  }
  const lastMoveName = names.length > 0 ? names[names.length - 1] : null;
  const isRepeatMove = chainActive && lastMoveName === moveName;
  const suppressRepeatCalloutMove = isRepeatMove && (moveName === "Trash" || moveName === "Thrash");
  if (isRepeatMove) { newHits = previousHits; }
  if (!suppressRepeatCalloutMove) {
    names.push(moveName);
  }
  detailEntries.push({
    move: moveName,
    damage: Math.max(0, Math.round(Number(hitMeta?.damage) || 0)),
    baseDamage: Math.max(
      0,
      Math.round(Number(hitMeta?.baseDamage) || Number(hitMeta?.damage) || 0),
    ),
    bonusDamage: Math.max(
      0,
      Math.round(
        (Number(hitMeta?.damage) || 0) -
        (Number(hitMeta?.baseDamage) || Number(hitMeta?.damage) || 0),
      ),
    ),
    isCounterHit: Boolean(hitMeta?.isCounterHit),
    isPunishCounter: Boolean(hitMeta?.isPunishCounter),
  });
  if (isDevMeleeArenaActive() && typeof window !== "undefined") {
    const finalDamage = Math.max(0, Math.round(Number(hitMeta?.damage) || 0));
    const baseDamage = Math.max(
      0,
      Math.round(Number(hitMeta?.baseDamage) || Number(hitMeta?.damage) || 0),
    );
    const bonusDamage = Math.max(0, finalDamage - baseDamage);
    const isPunishCounter = Boolean(hitMeta?.isPunishCounter);
    const isCounterHit = Boolean(hitMeta?.isCounterHit);
    const counterMultiplier = isPunishCounter
      ? PUNISH_COUNTER_MULTIPLIER
      : isCounterHit
        ? COUNTER_HIT_MULTIPLIER
        : 1;
    window.__devArenaLastMeleeHit = {
      at:
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now(),
      move: moveName,
      damage: finalDamage,
      baseDamage,
      bonusDamage,
      isCounterHit,
      isPunishCounter,
      counterMultiplier,
    };
  }
  const targetLen = 8;
  while (names.length > targetLen) names.shift();
  while (detailEntries.length > targetLen) detailEntries.shift();
  const existingLabel = chainActive ? (existing?.label || null) : null;
  if (!chainActive && existing?.label) releaseEntryComboLabel(existing);
  map.set(target, {
    hits: newHits,
    totalHits: newTotalHits,
    expiresAt: now + MELEE_COMBO_WINDOW_MS,
    comboId,
    names,
    details: detailEntries,
    label: existingLabel,
    enemy: target,
  });
  triggerMeleeComboKnockdown(target, meleeAttackState, newTotalHits);
  meleeAttackState.meleeComboHits = getMaxLiveMeleeComboHits(meleeAttackState, now);
  meleeAttackState.comboMoveNames = names;
  meleeAttackState.devArenaComboEntries = detailEntries;
  meleeAttackState.comboMovesWindowUntil = now + MELEE_COMBO_WINDOW_MS;
  meleeAttackState.pendingComboMoveName = null;
  updateComboMoveCallout(meleeAttackState);
  if (meleeAttackState.meleeComboHits >= 2) {
    let bestEntry = null;
    for (const entry of map.values()) {
      if (entry.expiresAt >= now && (!bestEntry || entry.hits > bestEntry.hits)) bestEntry = entry;
    }
    if (bestEntry) {
      const bestEnemyName = bestEntry.enemy?.config?.displayName || bestEntry.enemy?.type || null;
      upsertDevArenaConfirmedCombo(
        bestEntry.comboId,
        bestEntry.hits,
        bestEntry.names || [],
        bestEntry.details || [],
        bestEnemyName,
      );
      syncHudConfirmedCombo(
        bestEntry.comboId,
        bestEntry.hits,
        bestEntry.details || [],
        bestEnemyName,
      );
    }
  }
  if (meleeAttackState.meleeComboHits >= 2) {
    rewardMeleeGraceBurst(target, MELEE_COMBO_GRACE_GEMS, 40);
  }
  if (meleeAttackState.punishCounterTarget === target) {
    meleeAttackState.punishCounterExpiresAt = meleeAttackState.meleeComboExpiresAt;
    if (
      meleeAttackState.punishCounterPrimed &&
      !meleeAttackState.punishCounterTextShown &&
      meleeAttackState.meleeComboHits >= 2
    ) {
      meleeAttackState.pendingCounterHitTarget = null;
      meleeAttackState.pendingCounterHitShowAt = 0;
      clearActiveCounterHitText(meleeAttackState, target, true);
      triggerPunishCounterText(target, meleeAttackState);
      rewardMeleeGraceBurst(target, PUNISH_COUNTER_GRACE_GEMS, 72);
      meleeAttackState.punishCounterTextShown = true;
    }
  } else if (meleeAttackState.punishCounterTarget) {
    clearPunishCounterState(meleeAttackState);
  }
  updateMeleeComboLabel(meleeAttackState);
}

function getNormalSlashChainHits(target, meleeAttackState, now) {
  if (!target || !meleeAttackState) return 0;
  const expiresAt = Number(meleeAttackState.normalSlashExpiresAt) || 0;
  if (expiresAt <= 0 || now > expiresAt) return 0;
  if (meleeAttackState.normalSlashTarget !== target) return 0;
  return Math.max(0, Math.round(meleeAttackState.normalSlashHits || 0));
}

function registerNormalSlashChainHit(target, meleeAttackState, now) {
  if (!target || !meleeAttackState) return 0;
  const timeNow =
    typeof now === "number"
      ? now
      : typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
  const priorHits = getNormalSlashChainHits(target, meleeAttackState, timeNow);
  const nextHits = priorHits + 1;
  meleeAttackState.normalSlashTarget = target;
  meleeAttackState.normalSlashHits = nextHits;
  meleeAttackState.normalSlashExpiresAt = timeNow + NORMAL_A_CHAIN_WINDOW_MS;
  return nextHits;
}

function registerDivineShotComboHit(target, meleeAttackState, hitMeta = null) {
  if (!target || !meleeAttackState) return;
  registerMeleeComboHit(target, meleeAttackState, "Blast", hitMeta);
  if (
    meleeAttackState.punishCounterTarget === target &&
    meleeAttackState.punishCounterPrimed &&
    !meleeAttackState.punishCounterTextShown
  ) {
    meleeAttackState.pendingCounterHitTarget = null;
    meleeAttackState.pendingCounterHitShowAt = 0;
    clearActiveCounterHitText(meleeAttackState, target, true);
    triggerPunishCounterText(target, meleeAttackState);
    rewardMeleeGraceBurst(target, PUNISH_COUNTER_GRACE_GEMS, 72);
    meleeAttackState.punishCounterTextShown = true;
  }
}

function registerDivineShotKill(meleeAttackState, target) {
  if (!meleeAttackState || !target) return;
  meleeAttackState.divineKillCount = Math.max(
    0,
    Math.round((meleeAttackState.divineKillCount || 0) + 1),
  );
  const tx = Number.isFinite(target.x) ? target.x : player?.x || 0;
  const ty = Number.isFinite(target.y) ? target.y : player?.y || 0;
  meleeAttackState.divineKillAnchorX = tx;
  meleeAttackState.divineKillAnchorY = ty;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  meleeAttackState.divineKillDisplayUntil = now + 1400;
}

function updateDivineShotKillLabel(meleeAttackState, now) {
  if (!meleeAttackState) return;
  const count = Math.max(0, Math.round(meleeAttackState.divineKillCount || 0));
  const showUntil = Number(meleeAttackState.divineKillDisplayUntil) || 0;
  if (!count || !showUntil || now > showUntil) {
    if (meleeAttackState.divineKillLabel) {
      meleeAttackState.divineKillLabel.persist = false;
      meleeAttackState.divineKillLabel.life = Math.min(
        meleeAttackState.divineKillLabel.life || 0.2,
        0.2,
      );
      meleeAttackState.divineKillLabel = null;
    }
    meleeAttackState.divineKillCount = 0;
    meleeAttackState.divineKillDisplayUntil = 0;
    return;
  }
  let anchorX = Number(meleeAttackState.divineKillAnchorX) || (player?.x || cameraOffsetX + canvas.width * 0.5);
  let anchorY = Number(meleeAttackState.divineKillAnchorY) || (player?.y || canvas.height * 0.5);
  const activeDivineShot = projectiles.find(
    (proj) =>
      proj &&
      !proj.dead &&
      proj.friendly &&
      proj.isDivineShot &&
      proj.source?.isPlayer,
  );
  if (activeDivineShot && Number.isFinite(activeDivineShot.x) && Number.isFinite(activeDivineShot.y)) {
    anchorX = activeDivineShot.x;
    anchorY = activeDivineShot.y;
    meleeAttackState.divineKillAnchorX = anchorX;
    meleeAttackState.divineKillAnchorY = anchorY;
  }
  const edgeMargin = 20;
  const sx = anchorX - cameraOffsetX;
  const sy = anchorY;
  const clampedSx = Math.max(edgeMargin, Math.min(canvas.width - edgeMargin, sx));
  const clampedSy = Math.max(HUD_HEIGHT + edgeMargin, Math.min(canvas.height - edgeMargin, sy));
  const clampedAtEdge = Math.abs(clampedSx - sx) > 0.5 || Math.abs(clampedSy - sy) > 0.5;
  if (clampedAtEdge) {
    if (!Number.isFinite(meleeAttackState.divineKillEdgeClampedAt)) {
      meleeAttackState.divineKillEdgeClampedAt = now;
    }
  } else {
    meleeAttackState.divineKillEdgeClampedAt = null;
    meleeAttackState.divineKillFadeStartAt = null;
  }
  const edgeHoldMs = 200;
  if (
    Number.isFinite(meleeAttackState.divineKillEdgeClampedAt) &&
    now - meleeAttackState.divineKillEdgeClampedAt >= edgeHoldMs
  ) {
    if (!Number.isFinite(meleeAttackState.divineKillFadeStartAt)) {
      meleeAttackState.divineKillFadeStartAt = now;
    }
  }
  const labelX = clampedSx + cameraOffsetX;
  const labelY = clampedSy;
  let textColor = UI_COLOR.softWhite;
  if (Number.isFinite(meleeAttackState.divineKillFadeStartAt)) {
    const fadeMs = 700;
    const t = Math.max(0, Math.min(1, (now - meleeAttackState.divineKillFadeStartAt) / fadeMs));
    const alpha = 1 - t;
    textColor = `rgba(255, 242, 184, ${alpha.toFixed(3)})`;
  }
  const text = `${formatNumberWithCommas(count)}`;
  if (!meleeAttackState.divineKillLabel) {
    meleeAttackState.divineKillLabel = addFloatingTextAt(labelX, labelY, text, textColor, {
      speechBubble: false,
      vy: 0,
      life: 2.0,
      fadeDelay: 0.25,
      fontSize: 36,
      fontWeight: "900",
      priority: 8,
      persist: true,
      clampToScreen: true,
    });
    return;
  }
  meleeAttackState.divineKillLabel.text = text;
  meleeAttackState.divineKillLabel.x = labelX;
  meleeAttackState.divineKillLabel.y = labelY;
  meleeAttackState.divineKillLabel.color = textColor;
  meleeAttackState.divineKillLabel.entity = null;
  meleeAttackState.divineKillLabel.persist = true;
  meleeAttackState.divineKillLabel.vy = 0;
  meleeAttackState.divineKillLabel.life = Math.max(
    meleeAttackState.divineKillLabel.life || 0,
    0.4,
  );
}

function showComboTextAt(entity, comboDamage, hitCount, lastHitDamage = 0, forceImmediate = false) {
  if (!entity || !Number.isFinite(comboDamage) || comboDamage <= 0) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  if (window.BattlechurchComboTrackerEnabled) {
    if (!forceImmediate || !window.BattlechurchComboTrackerAllow) return;
  }
  const meleeState = window._meleeAttackState;
  if (
    meleeState &&
    !forceImmediate &&
    meleeState.comboLockoutUntil &&
    now < meleeState.comboLockoutUntil
  ) {
    return;
  }
  if (meleeState && !forceImmediate && hitCount === 2) {
    const pendingTarget = meleeState.pendingComboTarget;
    const pendingShowAt = meleeState.pendingComboShowAt || 0;
    if (pendingTarget === entity && now <= pendingShowAt) {
      const addDamage = Number.isFinite(lastHitDamage) ? lastHitDamage : 0;
      const lastAt = meleeState.pendingComboLastAt || 0;
      if (now - lastAt < 80) {
        // Likely duplicate trigger for the same hit pair; don't upgrade hit count.
        meleeState.pendingComboDamage = Math.max(
          meleeState.pendingComboDamage || 0,
          comboDamage,
        );
        meleeState.pendingComboLastAt = now;
        return;
      }
      const currentHits = meleeState.pendingComboHits || 2;
      meleeState.pendingComboDamage = (meleeState.pendingComboDamage || 0) + addDamage;
      meleeState.pendingComboHits = Math.max(currentHits + 1, 3);
      meleeState.pendingComboShowAt = now + 80;
      meleeState.pendingComboLastAt = now;
      return;
    }
    meleeState.pendingComboTarget = entity;
    meleeState.pendingComboDamage = comboDamage;
    meleeState.pendingComboShowAt = now + 140;
    meleeState.pendingComboHits = 2;
    meleeState.pendingComboLastAt = now;
    return;
  }
  if (
    meleeState &&
    meleeState.lastComboTextTarget === entity &&
    typeof meleeState.lastComboTextAt === "number" &&
    now - meleeState.lastComboTextAt < 150
  ) {
    return;
  }
  if (meleeState && hitCount >= 3 && meleeState.pendingComboTarget === entity) {
    meleeState.pendingComboTarget = null;
    meleeState.pendingComboDamage = 0;
    meleeState.pendingComboShowAt = 0;
    meleeState.pendingComboHits = 0;
    meleeState.pendingComboLastAt = 0;
  }
  if (meleeState) {
    meleeState.lastComboTextTarget = entity;
    meleeState.lastComboTextAt = now;
    meleeState.comboLockoutUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
  }
  const hits = Number.isFinite(hitCount) && hitCount > 0 ? Math.round(hitCount) : 2;
  maybeAnnounceComboMoveNames(meleeState, hits);
  const labelFontSize = getChainLabelFontSize(hits);
  const labelColor = getChainLabelColor(hits);
  maybeUpdateMaxChainInTown(hits, entity.x, entity.y);
  updateHudComboDisplay({
    hits,
    damage: comboDamage,
    fontSize: labelFontSize,
    color: labelColor,
    durationMs: 1800,
  });
}

function executeBasicMeleeAttack(dir, meleeAttackState, swingCenterX, swingCenterY, options = {}) {
  // Canonical move name: "Slash" is the default A melee attack.
  const moveName = String(options?.moveNameOverride || "Slash");
  if (isTutorialArenaActive()) {
    if (moveName === "Slash") {
      openTutorialArenaMoveKillWindow("Slash", TUTORIAL_ARENA_SLASH_KILL_WINDOW_MS);
    } else if (moveName === "Cleave") {
      openTutorialArenaMoveKillWindow("Cleave", TUTORIAL_ARENA_CLEAVE_KILL_WINDOW_MS);
    }
  }
  showMoveBanner(moveName);
  registerComboMoveName(meleeAttackState, moveName);
  const damageMultiplier = Math.max(0.1, Number(options?.damageMultiplier) || 1) * getMoveMultiplier(moveName);
  const rangeMultiplier = Math.max(0.5, Number(options?.rangeMultiplier) || 1);
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  meleeAttackState.active = true;
  meleeAttackState.fade = MELEE_DAMAGE_DURATION;
  meleeAttackState.swingId += 1;
  meleeAttackState.currentAttackHitboxType = "slash";
  beginMeleeHitstopSequence(meleeAttackState);
  meleeAttackState.didAttackThisPress = true;
  meleeAttackState.cooldown = applyPlayerCooldownClassMultiplier(MELEE_COOLDOWN);
  meleeAttackState.swooshTimer = GAME_MELEE_SWING_DURATION;
  meleeAttackState.swooshDir = { x: dir.x, y: dir.y };

  // Trigger player attack animation
  if (player && player.animator) {
    player.state = "attackMelee";
    player.animator.play("attackMelee", { restart: true });
  }
  if (player && typeof spawnSlashBurstEffect === "function" && !options.skipSlash) {
    const attackAngle = Math.atan2(dir.y, dir.x);
    const wHitbox = player.config?.weaponHitbox;
    const hbOffsetX = (wHitbox && Number.isFinite(wHitbox.offsetX)) ? wHitbox.offsetX : 0;
    const hbWidth = (wHitbox && Number.isFinite(wHitbox.width) && wHitbox.width > 0) ? wHitbox.width : 80;
    const cos = Math.cos(attackAngle);
    const sin = Math.sin(attackAngle);
    const burstX = player.x + cos * hbOffsetX;
    const burstY = player.y + sin * hbOffsetX;
    const burstScale = hbWidth / 48;
    const isNormalSlash = moveName === "Slash";
    const slashAngle = isNormalSlash
      ? attackAngle + NORMAL_SLASH_VFX_DOWNWARD_ANGLE_OFFSET
      : attackAngle;
    const normalSlashFlipY = Math.cos(attackAngle) < 0;
    if (isNormalSlash) {
      spawnSlashBurstEffect(burstX, burstY, slashAngle, burstScale, {
        flipY: normalSlashFlipY,
        tintColor: options.slashTint || "#ffd37a",
        tintAlpha: options.slashTintAlpha ?? 0.82,
        glowColor: "#ffe7a6",
        glowBlur: NORMAL_SLASH_VFX_GLOW_BLUR,
        glowAlpha: NORMAL_SLASH_VFX_GLOW_ALPHA,
        blendMode: "lighter",
      });
    } else {
      spawnSlashBurstEffect(burstX, burstY, slashAngle, burstScale, {
        flipY: Boolean(options.flipSlash),
        tintColor: options.slashTint || null,
        tintAlpha: options.slashTintAlpha,
      });
    }
  }
  maybeFireWordOfGodProjectile(dir, Math.atan2(dir.y, dir.x));

  const hitEnemies = [];
  let hitBoss = false;
  let survivorHit = false;
  let meleeDamageTotal = 0;
  let meleePrimaryTarget = null;
  const attackAngle = Math.atan2(dir.y, dir.x);
  const attackRectRaw = getPlayerWeaponHitboxLocalRect(player);
  const attackRect = attackRectRaw
    ? {
        x: attackRectRaw.x - (attackRectRaw.width * (rangeMultiplier - 1)) * 0.5,
        y: attackRectRaw.y - (attackRectRaw.height * (rangeMultiplier - 1)) * 0.5,
        width: attackRectRaw.width * rangeMultiplier,
        height: attackRectRaw.height * rangeMultiplier,
      }
    : null;
  const cos = Math.cos(-attackAngle);
  const sin = Math.sin(-attackAngle);
  enemies.forEach((enemy) => {
    if (enemy.dead || enemy.state === "death") return;
    const hitCenter = getEnemyHitboxCenter(enemy);
    const relX = hitCenter.x - player.x;
    const relY = hitCenter.y - player.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    const hitRadius = getEnemyHitboxRadius(enemy);
    if (attackRect) {
      if (!circleIntersectsRect(localX, localY, hitRadius, attackRect)) return;
    } else {
      const dx = enemy.x - swingCenterX;
      const dy = enemy.y - swingCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MELEE_SWING_RANGE * rangeMultiplier + hitRadius) return;
      const dotProduct = dx * dir.x + dy * dir.y;
      if (dotProduct < 0 && dist > MELEE_CLOSE_RANGE * rangeMultiplier + hitRadius) return;
    }
    hitEnemies.push(enemy);
    if (!meleePrimaryTarget) meleePrimaryTarget = enemy;
    const counterHit = getCounterHitResult(
      enemy,
      applyPlayerMeleeClassMultiplier(Math.round(MELEE_BASE_DAMAGE * damageMultiplier)),
      meleeAttackState,
    );
    const damage = counterHit.damage;
    const slashChainHitsBefore = getNormalSlashChainHits(enemy, meleeAttackState, now);
    const repeatedSlashPressure = slashChainHitsBefore >= 1;
    enemy.takeDamage(damage, {
      damageType: "melee",
      damageText: counterHit.damageText,
      hurtDuration: repeatedSlashPressure ? NORMAL_A_REHIT_HURT_DURATION : undefined,
    });
    applyMeleeHitstop(enemy, meleeAttackState, counterHit);
    registerPunishComboDamage(enemy, damage, meleeAttackState);
    registerMeleeComboHit(enemy, meleeAttackState, moveName, {
      damage,
      isCounterHit: Boolean(counterHit?.isCounterHit),
      isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
    });
    registerNormalSlashChainHit(enemy, meleeAttackState, now);
    registerChainHit(enemy, damage);
    meleeDamageTotal += damage;
    if (
      !meleeAttackState.divineComboShown &&
      meleeAttackState.divineComboDamage > 0 &&
      meleeAttackState.divineComboActiveUntil &&
      now <= meleeAttackState.divineComboActiveUntil &&
      meleeAttackState.divineComboTarget === enemy &&
      enemy.state === "hurt"
    ) {
      const hits = (meleeAttackState.divineComboHits || 2) + 1;
      showComboTextAt(enemy, meleeAttackState.divineComboDamage + damage, hits);
      meleeAttackState.divineComboShown = true;
      meleeAttackState.divineComboActiveUntil = 0;
      meleeAttackState.divineComboDamage = 0;
      meleeAttackState.divineComboTarget = null;
      meleeAttackState.divineComboHits = 0;
      meleeAttackState.spinComboShown = true;
      meleeAttackState.spinComboActiveUntil = 0;
      meleeAttackState.spinComboDamage = 0;
      meleeAttackState.rushComboShown = true;
      meleeAttackState.rushComboActiveUntil = 0;
      meleeAttackState.rushComboDamage = 0;
    } else if (
      meleeAttackState.spinComboDamage > 0 &&
      meleeAttackState.spinComboActiveUntil &&
      now <= meleeAttackState.spinComboActiveUntil &&
      !meleeAttackState.spinComboShown &&
      enemy.state === "hurt"
    ) {
      showComboTextAt(enemy, meleeAttackState.spinComboDamage + damage, 2, damage);
      meleeAttackState.spinComboShown = true;
      meleeAttackState.spinComboActiveUntil = 0;
      meleeAttackState.spinComboDamage = 0;
    } else if (
      !meleeAttackState.rushComboShown &&
      meleeAttackState.rushComboDamage > 0 &&
      meleeAttackState.rushComboActiveUntil &&
      now <= meleeAttackState.rushComboActiveUntil &&
      enemy.state === "hurt"
    ) {
      const baseHits = meleeAttackState.rushComboHits || 1;
      showComboTextAt(enemy, meleeAttackState.rushComboDamage + damage, baseHits + 1, damage);
      meleeAttackState.rushComboShown = true;
      meleeAttackState.rushComboActiveUntil = 0;
      meleeAttackState.rushComboDamage = 0;
      meleeAttackState.rushComboHits = 0;
      meleeAttackState.rushComboTarget = null;
    }
    if (!enemy.dead && enemy.state !== "death") {
      if (!repeatedSlashPressure || options.forceKnockback) {
        applyEnemyMeleeKnockback(enemy, swingCenterX, swingCenterY, MELEE_PUSHBACK_STRENGTH);
      }
      survivorHit = true;
    }
    spawnEnemyHitEffect(enemy);
  });
  if (tryTriggerCongregationDialogueFromMelee(dir, swingCenterX, swingCenterY, attackRect)) {
    congregationWelcomeTimer = Infinity;
  }
  if (activeBoss && !activeBoss.dead && !activeBoss.defeated && !activeBoss.removed) {
    const hitCenter = getEnemyHitboxCenter(activeBoss);
    const relX = hitCenter.x - player.x;
    const relY = hitCenter.y - player.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    const hitRadius = activeBoss.radius || 0;
    const bossHit = attackRect
      ? circleIntersectsRect(localX, localY, hitRadius, attackRect)
      : (() => {
          const dx = activeBoss.x - swingCenterX;
          const dy = activeBoss.y - swingCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > MELEE_SWING_RANGE * rangeMultiplier + hitRadius) return false;
          const dotProduct = dx * dir.x + dy * dir.y;
          return !(dotProduct < 0 && dist > MELEE_CLOSE_RANGE * rangeMultiplier + hitRadius);
        })();
    if (bossHit) {
        const counterHit = getCounterHitResult(
          activeBoss,
          applyPlayerMeleeClassMultiplier(Math.round(MELEE_BASE_DAMAGE * damageMultiplier)),
          meleeAttackState,
        );
        const damage = counterHit.damage;
        const slashChainHitsBefore = getNormalSlashChainHits(activeBoss, meleeAttackState, now);
        const repeatedSlashPressure = slashChainHitsBefore >= 1;
        activeBoss.takeDamage(damage, {
          hitX: activeBoss.x,
          hitY: activeBoss.y,
          damageType: "melee",
          damageText: counterHit.damageText,
          hurtDuration: repeatedSlashPressure ? NORMAL_A_REHIT_HURT_DURATION : undefined,
        });
        applyMeleeHitstop(activeBoss, meleeAttackState, counterHit);
        registerPunishComboDamage(activeBoss, damage, meleeAttackState);
        registerMeleeComboHit(activeBoss, meleeAttackState, moveName, {
          damage,
          isCounterHit: Boolean(counterHit?.isCounterHit),
          isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
        });
        registerNormalSlashChainHit(activeBoss, meleeAttackState, now);
        registerChainHit(activeBoss, damage);
        meleeDamageTotal += damage;
        if (
          !meleeAttackState.divineComboShown &&
          meleeAttackState.divineComboDamage > 0 &&
          meleeAttackState.divineComboActiveUntil &&
          now <= meleeAttackState.divineComboActiveUntil &&
          meleeAttackState.divineComboTarget === activeBoss &&
          activeBoss.state === "hurt"
        ) {
          const hits = (meleeAttackState.divineComboHits || 2) + 1;
          showComboTextAt(activeBoss, meleeAttackState.divineComboDamage + damage, hits);
          meleeAttackState.divineComboShown = true;
          meleeAttackState.divineComboActiveUntil = 0;
          meleeAttackState.divineComboDamage = 0;
          meleeAttackState.divineComboTarget = null;
          meleeAttackState.divineComboHits = 0;
          meleeAttackState.spinComboShown = true;
          meleeAttackState.spinComboActiveUntil = 0;
          meleeAttackState.spinComboDamage = 0;
          meleeAttackState.rushComboShown = true;
          meleeAttackState.rushComboActiveUntil = 0;
          meleeAttackState.rushComboDamage = 0;
        } else if (
          meleeAttackState.spinComboDamage > 0 &&
          meleeAttackState.spinComboActiveUntil &&
          now <= meleeAttackState.spinComboActiveUntil &&
          !meleeAttackState.spinComboShown &&
          activeBoss.state === "hurt"
        ) {
          showComboTextAt(activeBoss, meleeAttackState.spinComboDamage + damage, 2, damage);
          meleeAttackState.spinComboShown = true;
          meleeAttackState.spinComboActiveUntil = 0;
          meleeAttackState.spinComboDamage = 0;
        } else if (
          !meleeAttackState.rushComboShown &&
          meleeAttackState.rushComboDamage > 0 &&
          meleeAttackState.rushComboActiveUntil &&
          now <= meleeAttackState.rushComboActiveUntil &&
          activeBoss.state === "hurt"
        ) {
          const baseHits = meleeAttackState.rushComboHits || 1;
          showComboTextAt(activeBoss, meleeAttackState.rushComboDamage + damage, baseHits + 1, damage);
          meleeAttackState.rushComboShown = true;
          meleeAttackState.rushComboActiveUntil = 0;
          meleeAttackState.rushComboDamage = 0;
          meleeAttackState.rushComboHits = 0;
          meleeAttackState.rushComboTarget = null;
        }
        hitBoss = true;
        if (!meleePrimaryTarget) meleePrimaryTarget = activeBoss;
        if (typeof activeBoss.knockbackVx === "number") {
          if (!repeatedSlashPressure) {
            applyEnemyMeleeKnockback(activeBoss, swingCenterX, swingCenterY, MELEE_PUSHBACK_STRENGTH);
          }
        }
        if (!activeBoss.dead && !activeBoss.defeated) {
          survivorHit = true;
        }
        spawnEnemyHitEffect(activeBoss);
    }
  }
  if (hitEnemies.length > 0 || hitBoss) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    meleeAttackState.awaitRush = true;
    meleeAttackState.awaitTimer = MELEE_DOUBLE_TAP_WINDOW;
    meleeAttackState.rushBypassUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
    meleeAttackState.comboDamage = meleeDamageTotal;
    meleeAttackState.comboActiveUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
    meleeAttackState.comboShown = false;
    meleeAttackState.meleeCancelUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
    meleeAttackState.meleeCancelDamage = meleeDamageTotal;
    meleeAttackState.meleeCancelTarget = meleePrimaryTarget;
  }
  if (hitEnemies.length > 0 || hitBoss) {
    playMeleeWhiffSfx(0.6);
    if (typeof playSwordSfx === "function") {
      const swingVolume =
        moveName === "Cleave" ? A_MOVE_SFX_VOLUME_CLEAVE : A_MOVE_SFX_VOLUME_SLASH;
      playSwordSfx(swingVolume);
    }
    if (typeof playEnemyHitSfx === "function") {
      playEnemyHitSfx(0.6);
    }
  } else {
    playMeleeWhiffSfx(0.6);
  }
  meleeAttackState.projectileBlockTimer = MELEE_PROJECTILE_COOLDOWN_AFTER;
}

function executeCleaveAttack(dir, meleeAttackState) {
  if (!player || !dir) return false;
  playerYell("Cleave");
  showMoveBanner("Cleave");
  // Retire legacy arc renderer for Cleave; use slash-based glow VFX instead.
  meleeAttackState.cleaveArcDuration = 0;
  meleeAttackState.cleaveArcTimer = 0;
  meleeAttackState.cleaveArcDir = 1;
  const angleRad = Math.atan2(dir.y, dir.x);
  const swingCenterX = player.x + Math.cos(angleRad) * MELEE_OFFSET;
  const swingCenterY = player.y + Math.sin(angleRad) * MELEE_OFFSET;
  if (typeof spawnSlashBurstEffect === "function") {
    const upslashAngle = angleRad + CLEAVE_VFX_UPSLASH_ANGLE_OFFSET;
    const downslashAngle = angleRad;
    const cleaveFlipY = Math.cos(angleRad) >= 0;
    const wHitbox = player.config?.weaponHitbox;
    const hbOffsetX = (wHitbox && Number.isFinite(wHitbox.offsetX)) ? wHitbox.offsetX : 0;
    const hbWidth = (wHitbox && Number.isFinite(wHitbox.width) && wHitbox.width > 0) ? wHitbox.width : 80;
    const vfxX = player.x + Math.cos(angleRad) * hbOffsetX;
    const vfxY = player.y + Math.sin(angleRad) * hbOffsetX;
    const baseScale = hbWidth / 48;
    spawnSlashBurstEffect(vfxX, vfxY, upslashAngle, Math.max(baseScale, CLEAVE_VFX_SCALE), {
      scaleX: Math.max(CLEAVE_VFX_SCALE_X, 1),
      scaleY: CLEAVE_VFX_SCALE_Y,
      flipY: cleaveFlipY,
      tintColor: "#5faeff",
      tintAlpha: 0.8,
      glowColor: "#9cd0ff",
      glowBlur: CLEAVE_VFX_GLOW_BLUR,
      glowAlpha: CLEAVE_VFX_GLOW_ALPHA * 0.72,
      blendMode: "lighter",
    });
    // Extra crossing cut to sell Cleave's heavy/double-damage identity.
    const vfx2X = vfxX + Math.cos(angleRad) * CLEAVE_VFX_SECONDARY_FORWARD_OFFSET;
    const vfx2Y = vfxY + Math.sin(angleRad) * CLEAVE_VFX_SECONDARY_FORWARD_OFFSET + CLEAVE_VFX_SECONDARY_VERTICAL_OFFSET;
    spawnSlashBurstEffect(vfx2X, vfx2Y, downslashAngle, Math.max(baseScale * 0.9, CLEAVE_VFX_SCALE * 0.78), {
      scaleX: Math.max(CLEAVE_VFX_SCALE_X * 0.94, 0.9),
      scaleY: CLEAVE_VFX_SCALE_Y * 0.84,
      flipY: !cleaveFlipY,
      tintColor: "#2f7fff",
      tintAlpha: 0.84,
      glowColor: "#6fb0ff",
      glowBlur: CLEAVE_VFX_GLOW_BLUR * 0.68,
      glowAlpha: CLEAVE_VFX_GLOW_ALPHA * 0.82,
      blendMode: "lighter",
      delay: 0.22,
    });
  }
  executeBasicMeleeAttack(dir, meleeAttackState, swingCenterX, swingCenterY, {
    missSwingSfx: "rush",
    moveNameOverride: "Cleave",
    damageMultiplier: CLEAVE_DAMAGE_MULTIPLIER,
    rangeMultiplier: CLEAVE_RANGE_MULTIPLIER,
    skipSlash: true,
    slashTint: "#ffe866",
    slashTintAlpha: 0.7,
    forceKnockback: true,
  });
  return true;
}

function executeSwooshAttack(dir, meleeAttackState, angleRad) {
  // Canonical move name: "Dash Slash" is the normal B/A follow-up from an active dash.
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  meleeAttackState.swooshTimer = GAME_MELEE_SWING_DURATION;
  meleeAttackState.swooshDir = { x: dir.x, y: dir.y };
  meleeAttackState.currentAttackHitboxType = "dashSlash";
  beginMeleeHitstopSequence(meleeAttackState);
  applyMeleeInvulnerability(meleeAttackState, "swoosh", getDashSwooshInvulnerabilityDuration());

  // Trigger player attack animation
  if (player && player.animator) {
    player.state = "attackMelee";
    player.animator.play("attackMelee", { restart: true });
  }
  maybeFireWordOfGodProjectile(dir, angleRad);
  if (typeof playRushAttackSfx === "function") {
    playRushAttackSfx(A_MOVE_SFX_VOLUME_DASH_SLASH);
  }
  meleeAttackState.swooshDamageEnabled = true;
  meleeAttackState.swooshHitEntities = new Set();

  const swooshAngle = angleRad;
  const swooshDamage = Math.round(MELEE_BASE_DAMAGE * MELEE_SWOOSH_DAMAGE_SCALE);
  const hitboxRect = getPlayerDashSlashHitboxLocalRect(player);
  if (!hitboxRect) return;
  const cos = Math.cos(-swooshAngle);
  const sin = Math.sin(-swooshAngle);
  let hitBoss = false;
  let survivorHit = false;
  let meleeDamageTotal = 0;
  enemies.forEach((enemy) => {
    if (enemy.dead || enemy.state === "death") return;
    if (meleeAttackState.swooshHitEntities?.has(enemy)) return;
    const relX = enemy.x - player.x;
    const relY = enemy.y - player.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    const hitRadius = getEnemyHitboxRadius(enemy) || enemy.radius || 0;
    if (!circleIntersectsRect(localX, localY, hitRadius, hitboxRect)) return;
    meleeAttackState.swooshHitEntities?.add(enemy);
    const counterHit = getCounterHitResult(enemy, swooshDamage, meleeAttackState);
    const finalDamage = counterHit.damage;
    enemy.takeDamage(finalDamage, { damageType: "melee", damageText: counterHit.damageText });
    applyMeleeHitstop(enemy, meleeAttackState, counterHit);
    registerPunishComboDamage(enemy, finalDamage, meleeAttackState);
    registerMeleeComboHit(enemy, meleeAttackState, null, {
      damage: finalDamage,
      isCounterHit: Boolean(counterHit?.isCounterHit),
      isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
    });
    registerChainHit(enemy, finalDamage);
    meleeDamageTotal += finalDamage;
    if (
      !meleeAttackState.divineComboShown &&
      meleeAttackState.divineComboDamage > 0 &&
      meleeAttackState.divineComboActiveUntil &&
      now <= meleeAttackState.divineComboActiveUntil &&
      meleeAttackState.divineComboTarget === enemy &&
      enemy.state === "hurt"
    ) {
      const hits = (meleeAttackState.divineComboHits || 2) + 1;
      showComboTextAt(enemy, meleeAttackState.divineComboDamage + finalDamage, hits);
      meleeAttackState.divineComboShown = true;
      meleeAttackState.divineComboActiveUntil = 0;
      meleeAttackState.divineComboDamage = 0;
      meleeAttackState.divineComboTarget = null;
      meleeAttackState.divineComboHits = 0;
      meleeAttackState.rushComboShown = true;
      meleeAttackState.rushComboActiveUntil = 0;
      meleeAttackState.rushComboDamage = 0;
    } else if (
      !meleeAttackState.rushComboShown &&
      meleeAttackState.rushComboDamage > 0 &&
      meleeAttackState.rushComboActiveUntil &&
      now <= meleeAttackState.rushComboActiveUntil &&
      enemy.state === "hurt"
    ) {
      showComboTextAt(enemy, meleeAttackState.rushComboDamage + finalDamage, 2, finalDamage);
      meleeAttackState.rushComboShown = true;
      meleeAttackState.rushComboActiveUntil = 0;
      meleeAttackState.rushComboDamage = 0;
    }
    if (!enemy.dead && enemy.state !== "death") {
      applyEnemyMeleeKnockback(enemy, player.x, player.y, MELEE_DAMAGE_KNOCKBACK);
      survivorHit = true;
    }
    spawnEnemyHitEffect(enemy);
    if (typeof playEnemyHitSfx === "function") {
      playEnemyHitSfx(0.6);
    }
  });
  if (activeBoss && !activeBoss.dead && !activeBoss.defeated && !activeBoss.removed) {
    if (meleeAttackState.swooshHitEntities?.has(activeBoss)) {
      // Already hit this dash.
    } else {
    const relX = activeBoss.x - player.x;
    const relY = activeBoss.y - player.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    const hitRadius = activeBoss.radius || 0;
    if (circleIntersectsRect(localX, localY, hitRadius, hitboxRect)) {
      meleeAttackState.swooshHitEntities?.add(activeBoss);
      const counterHit = getCounterHitResult(activeBoss, swooshDamage, meleeAttackState);
      const finalDamage = counterHit.damage;
      activeBoss.takeDamage(finalDamage, {
        hitX: activeBoss.x,
        hitY: activeBoss.y,
        damageType: "melee",
        damageText: counterHit.damageText,
      });
      applyMeleeHitstop(activeBoss, meleeAttackState, counterHit);
      registerPunishComboDamage(activeBoss, finalDamage, meleeAttackState);
      registerMeleeComboHit(activeBoss, meleeAttackState, null, {
        damage: finalDamage,
        isCounterHit: Boolean(counterHit?.isCounterHit),
        isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
      });
      registerChainHit(activeBoss, finalDamage);
      meleeDamageTotal += finalDamage;
      if (
        !meleeAttackState.divineComboShown &&
        meleeAttackState.divineComboDamage > 0 &&
        meleeAttackState.divineComboActiveUntil &&
        now <= meleeAttackState.divineComboActiveUntil &&
        meleeAttackState.divineComboTarget === activeBoss &&
        activeBoss.state === "hurt"
      ) {
        const hits = (meleeAttackState.divineComboHits || 2) + 1;
        showComboTextAt(activeBoss, meleeAttackState.divineComboDamage + finalDamage, hits);
        meleeAttackState.divineComboShown = true;
        meleeAttackState.divineComboActiveUntil = 0;
        meleeAttackState.divineComboDamage = 0;
        meleeAttackState.divineComboTarget = null;
        meleeAttackState.divineComboHits = 0;
        meleeAttackState.rushComboShown = true;
        meleeAttackState.rushComboActiveUntil = 0;
        meleeAttackState.rushComboDamage = 0;
      } else if (
        !meleeAttackState.rushComboShown &&
        meleeAttackState.rushComboDamage > 0 &&
        meleeAttackState.rushComboActiveUntil &&
        now <= meleeAttackState.rushComboActiveUntil &&
        activeBoss.state === "hurt"
      ) {
        showComboTextAt(activeBoss, meleeAttackState.rushComboDamage + finalDamage, 2, finalDamage);
        meleeAttackState.rushComboShown = true;
        meleeAttackState.rushComboActiveUntil = 0;
        meleeAttackState.rushComboDamage = 0;
      }
      hitBoss = true;
      if (typeof activeBoss.knockbackVx === "number") {
        applyEnemyMeleeKnockback(activeBoss, player.x, player.y, MELEE_DAMAGE_KNOCKBACK);
      }
      if (!activeBoss.dead && !activeBoss.defeated) {
        survivorHit = true;
      }
      spawnEnemyHitEffect(activeBoss);
    }
    }
  }
  if (survivorHit) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    meleeAttackState.rushBypassUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
    meleeAttackState.comboDamage = meleeDamageTotal;
    meleeAttackState.comboActiveUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
    meleeAttackState.comboShown = false;
  }
  if (hitBoss && typeof playEnemyHitSfx === "function") {
    playEnemyHitSfx(0.6);
  }
  if (typeof playSwooshSfx === "function") {
    playSwooshSfx(0.6);
  }
  meleeAttackState.cooldown = applyPlayerCooldownClassMultiplier(MELEE_COOLDOWN);
  meleeAttackState.projectileBlockTimer = MELEE_PROJECTILE_COOLDOWN_AFTER;
  meleeAttackState.awaitRush = true;
  meleeAttackState.awaitTimer = MELEE_DOUBLE_TAP_WINDOW;
}

function applyDashSlashTravelDamage(meleeAttackState) {
  if (!player || !playerDashState.isDashing || !meleeAttackState?.swooshDamageEnabled) return;
  const angleRad = Math.atan2(playerDashState.dashDir.y, playerDashState.dashDir.x);
  const swooshDamage = Math.round(MELEE_BASE_DAMAGE * MELEE_SWOOSH_DAMAGE_SCALE);
  const hitboxRect = getPlayerDashSlashHitboxLocalRect(player);
  if (!hitboxRect) return;
  if (!meleeAttackState.swooshHitEntities) {
    meleeAttackState.swooshHitEntities = new Set();
  }
  const hitSet = meleeAttackState.swooshHitEntities;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const cos = Math.cos(-angleRad);
  const sin = Math.sin(-angleRad);

  enemies.forEach((enemy) => {
    if (enemy.dead || enemy.state === "death" || hitSet.has(enemy)) return;
    const relX = enemy.x - player.x;
    const relY = enemy.y - player.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    const hitRadius = getEnemyHitboxRadius(enemy) || enemy.radius || 0;
    if (!circleIntersectsRect(localX, localY, hitRadius, hitboxRect)) return;
    hitSet.add(enemy);
    const counterHit = getCounterHitResult(enemy, swooshDamage, meleeAttackState);
    const finalDamage = counterHit.damage;
    enemy.takeDamage(finalDamage, { damageType: "melee", damageText: counterHit.damageText });
    applyMeleeHitstop(enemy, meleeAttackState, counterHit);
    registerPunishComboDamage(enemy, finalDamage, meleeAttackState);
    registerMeleeComboHit(enemy, meleeAttackState, null, {
      damage: finalDamage,
      isCounterHit: Boolean(counterHit?.isCounterHit),
      isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
    });
    registerChainHit(enemy, finalDamage);
    if (!enemy.dead && enemy.state !== "death") {
      applyEnemyMeleeKnockback(enemy, player.x, player.y, MELEE_DAMAGE_KNOCKBACK);
    }
    if (
      !meleeAttackState.divineComboShown &&
      meleeAttackState.divineComboDamage > 0 &&
      meleeAttackState.divineComboActiveUntil &&
      now <= meleeAttackState.divineComboActiveUntil &&
      meleeAttackState.divineComboTarget === enemy &&
      enemy.state === "hurt"
    ) {
      const hits = (meleeAttackState.divineComboHits || 2) + 1;
      showComboTextAt(enemy, meleeAttackState.divineComboDamage + finalDamage, hits);
      meleeAttackState.divineComboShown = true;
      meleeAttackState.divineComboActiveUntil = 0;
      meleeAttackState.divineComboDamage = 0;
      meleeAttackState.divineComboTarget = null;
      meleeAttackState.divineComboHits = 0;
    }
    spawnEnemyHitEffect(enemy);
  });

  if (
    activeBoss &&
    !activeBoss.dead &&
    !activeBoss.defeated &&
    !activeBoss.removed &&
    !hitSet.has(activeBoss)
  ) {
    const relX = activeBoss.x - player.x;
    const relY = activeBoss.y - player.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    const hitRadius = activeBoss.radius || 0;
    if (circleIntersectsRect(localX, localY, hitRadius, hitboxRect)) {
      hitSet.add(activeBoss);
      const counterHit = getCounterHitResult(activeBoss, swooshDamage, meleeAttackState);
      const finalDamage = counterHit.damage;
      activeBoss.takeDamage(finalDamage, {
        hitX: activeBoss.x,
        hitY: activeBoss.y,
        damageType: "melee",
        damageText: counterHit.damageText,
      });
      applyMeleeHitstop(activeBoss, meleeAttackState, counterHit);
      registerPunishComboDamage(activeBoss, finalDamage, meleeAttackState);
      registerMeleeComboHit(activeBoss, meleeAttackState, null, {
        damage: finalDamage,
        isCounterHit: Boolean(counterHit?.isCounterHit),
        isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
      });
      registerChainHit(activeBoss, finalDamage);
      if (typeof activeBoss.knockbackVx === "number") {
        applyEnemyMeleeKnockback(activeBoss, player.x, player.y, MELEE_DAMAGE_KNOCKBACK);
      }
      spawnEnemyHitEffect(activeBoss);
    }
  }
}

function executeRushAttack(
  dir,
  meleeAttackState,
  { skipYell = false, moveName = "Smash", bypassCooldown = false } = {},
) {
  if (playerDashState?.isDashing) return false;
  if (!bypassCooldown && !isSharedBButtonReady()) return false;
  if (!dir || (dir.x === 0 && dir.y === 0)) return false;
  const displayName = String(moveName || "Smash");
  if (!skipYell) playerYell(displayName, 2.4);
  showMoveBanner(displayName);
  registerComboMoveName(meleeAttackState, displayName);
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const rushTravelMs = Math.ceil((RUSH_DISTANCE / Math.max(1, RUSH_SPEED || 1)) * 1000);
  const rushComboCarryUntil = now + rushTravelMs + MELEE_COMBO_WINDOW_MS;
  if (meleeAttackState.meleeComboTarget && (meleeAttackState.meleeComboHits || 0) > 0) {
    meleeAttackState.meleeComboExpiresAt = Math.max(
      Number(meleeAttackState.meleeComboExpiresAt) || 0,
      rushComboCarryUntil,
    );
  }
  if (meleeAttackState.punishCounterTarget) {
    meleeAttackState.punishCounterExpiresAt = Math.max(
      Number(meleeAttackState.punishCounterExpiresAt) || 0,
      rushComboCarryUntil,
    );
  }
  if (player && dir && typeof player.updateFacing === "function") {
    player.updateFacing(dir.x, dir.y);
  }
  meleeAttackState.isRushing = true;
  if (player) player.ignoreEntityCollisions = true;
  beginMeleeHitstopSequence(meleeAttackState);
  meleeAttackState.rushDir = { x: dir.x, y: dir.y };
  meleeAttackState.rushDistanceRemaining = RUSH_DISTANCE;
  meleeAttackState.rushDustAccumulator = 0;
  meleeAttackState.rushHitEntities = new Set();
  meleeAttackState.rushHitstopConsumed = false;
  meleeAttackState.rushKillCount = 0;
  meleeAttackState.rushKillSumX = 0;
  meleeAttackState.rushKillSumY = 0;
  meleeAttackState.thrashFeedbackCooldown = 0;
  meleeAttackState.thrashHitAccum = 0;
  if (meleeAttackState.lastComboTimes) {
    meleeAttackState.lastComboTimes.A = 0;
    meleeAttackState.lastComboTimes.B = 0;
  }
  setSharedBButtonCooldown(RUSH_COOLDOWN);
  meleeAttackState.rushDamageEnabled = true;
  meleeAttackState.rushInvulnerable = true;
  meleeAttackState.swordRushActive = false;
  meleeAttackState.swordRushBlastHitEntities = null;
  meleeAttackState.rushForceEndAt = now + rushTravelMs + 250;
  applyMeleeInvulnerability(meleeAttackState, "rush", RUSH_EXIT_INVULNERABILITY);
  meleeAttackState.rushLockTimer = MELEE_RUSH_LOCKOUT;
  maybeFireWordOfGodProjectile(dir, Math.atan2(dir.y, dir.x));
  if (player && typeof spawnRushBurstEffect === "function") {
    const attackAngle = Math.atan2(dir.y, dir.x);
    const rHitbox = player.config?.rushHitbox;
    const hbOffsetX = (rHitbox && Number.isFinite(rHitbox.offsetX)) ? rHitbox.offsetX : 88;
    const hbWidth = (rHitbox && Number.isFinite(rHitbox.width) && rHitbox.width > 0) ? rHitbox.width : 437;
    // Place burst at the far edge of the hitbox (offsetX + half-width) so it reads as "out in front"
    const burstDist = hbOffsetX + hbWidth * 0.5;
    const burstX = player.x + Math.cos(attackAngle) * burstDist;
    const burstY = player.y + Math.sin(attackAngle) * burstDist;
    spawnRushBurstEffect(burstX, burstY, attackAngle, hbWidth / 64);
  }
  playRushAttackSfx(A_MOVE_SFX_VOLUME_SMASH);
  return true;
}

function getTeleportFallbackTarget() {
  if (!player) return null;
  const angle = Math.random() * Math.PI * 2;
  const dist = 400 + Math.random() * 200;
  const margin = 40;
  const topLimit = (typeof HUD_HEIGHT === "number" ? HUD_HEIGHT : 80) + margin;
  const cw = canvas?.width || 1920;
  const ch = canvas?.height || 1080;
  return {
    x: Math.max(margin, Math.min(cw - margin, player.x + Math.cos(angle) * dist)),
    y: Math.max(topLimit, Math.min(ch - margin, player.y + Math.sin(angle) * dist)),
  };
}

function getNearestActivePowerup() {
  if (!player) return null;
  let nearest = null;
  let nearestDist = Infinity;
  const check = (arr, isActive) => {
    arr.forEach((p) => {
      if (!p || !isActive(p)) return;
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d < nearestDist) { nearestDist = d; nearest = p; }
    });
  };
  check(weaponPickups, (p) => p.active && !p.expired);
  check(utilityPowerUps, (p) => !p.collected && !p.dead);
  check(churchPowerupPickups, (p) => !p.collected && !p.dead);
  return nearest;
}

function getActiveTeleportPowerups() {
  const targets = [];
  const collect = (arr, isActive) => {
    arr.forEach((p) => {
      if (!p || !isActive(p)) return;
      targets.push(p);
    });
  };
  collect(weaponPickups, (p) => p.active && !p.expired);
  collect(utilityPowerUps, (p) => !p.collected && !p.dead);
  collect(churchPowerupPickups, (p) => !p.collected && !p.dead);
  return targets;
}

function getNearestTeleportTargetIndex(targets) {
  if (!player || !Array.isArray(targets) || !targets.length) return -1;
  let nearestIndex = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const d = Math.hypot(target.x - player.x, target.y - player.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIndex = i;
    }
  }
  return nearestIndex;
}

function executeProtectedDash(meleeAttackState) {
  if (!player) return;
  playerYell("Crash");
  showMoveBanner("Crash");
  const dir = getDashButtonDirection();
  if (!dir || (dir.x === 0 && dir.y === 0)) return;
  if (tryStartDash(dir)) {
    playerDashState.dashDistanceRemaining = PROTECTED_DASH_DISTANCE;
    const dashDuration = PROTECTED_DASH_DISTANCE / Math.max(1, DASH_SPEED);
    applyMeleeInvulnerability(meleeAttackState, "rush", dashDuration + RUSH_EXIT_INVULNERABILITY);
    playerDashState.crashDashActive = true;
    playerDashState.crashDashHitEntities = new Set();
    playerDashState.crashDashDamage = 100;
    player.ignoreEntityCollisions = true;
  }
}

function playerYell(text, life = 1.6) {
  const meleeState = window?._meleeAttackState || null;
  const comboBubbleActive = Boolean(
    meleeState &&
    Array.isArray(meleeState.comboMoveNames) &&
    meleeState.comboMoveNames.length > 0 &&
    Number.isFinite(meleeState.comboMovesWindowUntil) &&
    ((typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now()) <= meleeState.comboMovesWindowUntil),
  );
  if (comboBubbleActive) {
    const normalized = String(text || "").replace(/[!]/g, "").trim().toLowerCase();
    if (
      normalized === "rush" ||
      normalized === "blast"
    ) {
      return;
    }
  }
  window.FloatingText?.heroSay(text, { life });
}

const _MB = {
  btn: (label) => ({ type: "btn", label }),
  seq: () => ({ type: "seq" }),
  sim: () => ({ type: "sim" }),
  chg: () => ({ type: "chg" }),
  tap: () => ({ type: "tap" }),
};
const MOVE_NAME_AC_SUPER = "Hedge";
const MOVE_BANNER_TOKENS = Object.freeze({
  Slash:           [_MB.tap(), _MB.btn("A")],
  Dash:            [_MB.tap(), _MB.btn("B")],
  Blast:           [_MB.chg(), _MB.btn("A")],
  Crash:           [_MB.chg(), _MB.btn("B")],
  Smash:           [_MB.btn("B"), _MB.seq(), _MB.btn("A")],
  Thrash:          [_MB.chg(), _MB.btn("B"), _MB.sim(), _MB.btn("A")],
  Reap:            [_MB.btn("C"), _MB.seq(), _MB.btn("A")],
  Clash:           [_MB.btn("C"), _MB.seq(), _MB.btn("B")],
  Trash:           [_MB.chg(), _MB.btn("B"), _MB.sim(), _MB.btn("C")],
  [MOVE_NAME_AC_SUPER]: [_MB.chg(), _MB.btn("A"), _MB.sim(), _MB.btn("C")],
  Cleave:          [_MB.btn("A"), _MB.seq(), _MB.btn("B")],
  "Unity Strike":  [_MB.btn("C")],
  "Pastor Protect":[_MB.btn("C"), _MB.seq(), _MB.btn("C")],
  "Prayer Storm":  [_MB.chg(), _MB.btn("A"), _MB.sim(), _MB.btn("B"), _MB.sim(), _MB.btn("C")],
  // Purify is the unified player-facing label for Charged-C prayer actions.
  "Purify":        [_MB.chg(), _MB.btn("C")],
  "Purge":         [_MB.chg(), _MB.btn("C")],
});
if (typeof window !== "undefined") {
  window.__battlechurchMoveBannerTokens = MOVE_BANNER_TOKENS;
}

// Combo string drills: advance when the player performs the next move in the
// sequence soon enough after the previous one.
function recordTutorialArenaComboMove(moveName) {
  if (!isTutorialArenaActive() || !tutorialArenaState) return;
  const objective = tutorialArenaState.currentObjective;
  if (!objective || objective.type !== "combo_string" || tutorialArenaState.completionQueuedAt > 0) return;
  const seq = Array.isArray(objective.sequence) ? objective.sequence : [];
  if (!seq.length) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  // Pressing B right after an A attack already cancels into Smash, so the A
  // of a "B then A" slide lands as an extra Slash just after it. Ignore that
  // echo instead of breaking the string.
  // Only a Smash that cancelled out of a Slash has that echo, and only once,
  // so a real Slash after a plain B -> A Smash still counts.
  if (
    moveName === "Slash" &&
    tutorialArenaState.comboEchoArmed &&
    tutorialArenaState.comboLastMove === "Smash" &&
    now - (Number(tutorialArenaState.comboLastAt) || 0) < 450
  ) {
    tutorialArenaState.comboEchoArmed = false;
    return;
  }
  tutorialArenaState.comboEchoArmed =
    moveName === "Smash" &&
    tutorialArenaState.comboLastMove === "Slash" &&
    now - (Number(tutorialArenaState.comboLastAt) || 0) < 800;
  tutorialArenaState.comboLastMove = moveName;
  let step = Number(tutorialArenaState.comboStep) || 0;
  if (step > 0 && now - (Number(tutorialArenaState.comboLastAt) || 0) > TUTORIAL_ARENA_COMBO_STRING_GAP_MS) {
    step = 0;
  }
  if (moveName === seq[step]) {
    step += 1;
  } else if (moveName === seq[0]) {
    step = 1;
  } else {
    step = 0;
  }
  tutorialArenaState.comboLastAt = now;
  if (step >= seq.length) {
    tutorialArenaState.moveKillCount += 1;
    step = 0;
    window.FloatingText?.heroSay?.("Combo!", { life: 1.2 });
  }
  tutorialArenaState.comboStep = step;
  updateTutorialArenaHudState();
  checkTutorialArenaObjectiveComplete();
}

// Recent moves in order, shown under the move box (e.g. Slash > Smash > Reap).
const MOVE_TRAIL_RESET_MS = 1600;
function recordMoveTrail(moveName) {
  if (typeof window === "undefined" || !moveName) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const trail = window.__moveTrail || { moves: [], lastAt: 0 };
  if (now - trail.lastAt > MOVE_TRAIL_RESET_MS) trail.moves = [];
  trail.moves.push(String(moveName));
  while (trail.moves.length > 5) trail.moves.shift();
  trail.lastAt = now;
  window.__moveTrail = trail;
}

function showMoveBanner(moveName) {
  recordTutorialArenaComboMove(moveName);
  recordMoveTrail(moveName);
  const tokens = MOVE_BANNER_TOKENS[moveName];
  if (!tokens) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  window.__moveAnnouncementBanner = { moveName, tokens, shownAt: now, duration: 2000 };
  setTutorialArenaMoveContext(moveName);
  if (isTutorialArenaActive() && tutorialArenaState?.currentObjective?.type === "dash_plus_kills" && moveName === "Dash") {
    tutorialArenaState.dashCount += 1;
    updateTutorialArenaHudState();
    checkTutorialArenaObjectiveComplete();
  }
}

function clearDualChargeReadyPreview(meleeAttackState, { force = false } = {}) {
  if (!meleeAttackState) return;
  const bubble = meleeAttackState.dualChargeReadyBubble;
  const shouldClearBubble = Boolean(
    bubble &&
    (force || meleeAttackState.dualChargeReadyMove || bubble.persist),
  );
  if (shouldClearBubble) {
    bubble.persist = false;
    bubble.life = Math.min(bubble.life || 0.2, 0.2);
  }
  meleeAttackState.dualChargeReadyBubble = null;
  meleeAttackState.dualChargeReadyMove = "";
}

function showDualChargeReadyPreview(meleeAttackState, moveName, { executed = false } = {}) {
  if (!meleeAttackState || !moveName) return;
  const text = executed ? moveName : `${moveName}...`;
  const bubble = window.FloatingText?.heroComboCallout?.(text, { life: executed ? 0.9 : 1.2 });
  if (bubble) {
    bubble.persist = !executed;
    if (!executed) {
      bubble.life = Math.max(bubble.life || 0, 1.2);
      bubble.initialLife = Math.max(bubble.initialLife || 0, 1.2);
      bubble.fadeLength = Math.max(bubble.fadeLength || 0, 1.2);
    }
  }
  meleeAttackState.dualChargeReadyBubble = bubble || null;
  meleeAttackState.dualChargeReadyMove = executed ? "" : moveName;
}

function npcsYell(text, life = 1.6) {
  if (!Array.isArray(npcs)) return;
  npcs.forEach((npc) => {
    if (npc && !npc.departed && npc.active) {
      window.FloatingText?.npcCheer(npc, text, UI_COLOR.speechBubbleText, { life });
    }
  });
}
window.npcsYell = npcsYell;
window.showMoveBanner = showMoveBanner;

// Duration (seconds) for the Charged C+B move, also called "Trash" / "Roll".
const BLANKA_ROLL_DURATION = 2.5;
// Visual-only spin rate for Trash slash swooshes (turns per second).
const BLANKA_ROLL_SWOOSH_TURNS_PER_SECOND = 5.5;

function executeBlankaRoll(meleeAttackState) {
  if (!player) return;
  markChargedCConsumedByCombo(meleeAttackState);
  showDualChargeReadyPreview(meleeAttackState, "Trash", { executed: true });
  showMoveBanner("Trash");
  const rollCost = (player.prayerChargeRequired || 6000) / 6;
  player.prayerCharge = Math.max(0, (player.prayerCharge || 0) - rollCost);
  player.prayerHoldTimer = 0;
  player.prayerHoldLocked = false;
  if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
  meleeAttackState.blankaRollActive = true;
  meleeAttackState.blankaRollTimer = BLANKA_ROLL_DURATION;
  meleeAttackState.blankaRollStartedAt =
    (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
  meleeAttackState.blankaRollSawCHeld = false;
  // Kick off rush state so all existing damage/invuln/hitbox systems are live
  const dir = getMeleeAttackDirection();
  meleeAttackState.isRushing = true;
  meleeAttackState.rushDamageEnabled = true;
  meleeAttackState.rushInvulnerable = true;
  meleeAttackState.rushDir = { x: dir.x, y: dir.y };
  meleeAttackState.rushDistanceRemaining = RUSH_SPEED; // will be refreshed every frame
  meleeAttackState.rushHitEntities = new Set();
  meleeAttackState.rushHitstopConsumed = false;
  meleeAttackState.rushKillCount = 0;
  meleeAttackState.rushKillSumX = 0;
  meleeAttackState.rushKillSumY = 0;
  meleeAttackState.rushDustAccumulator = 0;
  meleeAttackState.thrashFeedbackCooldown = 0;
  meleeAttackState.thrashHitAccum = 0;
  meleeAttackState.swordRushActive = false;
  meleeAttackState.swordRushBlastHitEntities = null;
  meleeAttackState.rushForceEndAt = Infinity; // we control the end
  meleeAttackState.rushLockTimer = 0;
  player.ignoreEntityCollisions = true;
  meleeAttackState.bcTeleportArmed = false;
  meleeAttackState.bcTeleportBlockTimer = 0.4;
  meleeAttackState.blankaRollVisualAngle = Math.atan2(dir.y, dir.x);
  spawnFlashEffect(player.x, player.y);
  applyCameraShake(0.15, 0.4);
}

function updateBlankaRoll(dt) {
  const ms = window._meleeAttackState;
  if (!ms?.blankaRollActive || !player) return;
  if (keysPressed.has("ArrowRight")) {
    ms.blankaRollSawCHeld = true;
  }

  ms.blankaRollTimer = Math.max(0, ms.blankaRollTimer - dt);

  // Lock player into the attack animation, pinned on the hit frame (sword-out pose)
  player.state = "attackMelee";
  if (player.animator?.currentName !== "attackMelee") {
    player.animator?.play("attackMelee", { restart: true });
  }
  const _hitFrame = Math.max(0,
    (Number.isFinite(player.config?.attackHitFrame) ? player.config.attackHitFrame : DEFAULT_PLAYER_ATTACK_HIT_FRAME) - 1
  );
  if (player.animator && Number.isFinite(player.animator.frameIndex)) {
    player.animator.frameIndex = _hitFrame;
    player.animator.accumulator = 0;
    player.animator.finished = true;
  }

  // Steer: redirect rush direction to live input each frame
  const liveInput = window.Input?.movementDirection;
  const len = liveInput ? Math.hypot(liveInput.x, liveInput.y) : 0;
  if (len > 0.01) {
    ms.rushDir = { x: liveInput.x / len, y: liveInput.y / len };
  }

  // Keep rush alive: cap distance per frame to walk speed so movement feels like rolling, not blasting
  ms.rushDistanceRemaining = (player.config?.speed || 299 * SPEED_SCALE) * dt;
  // Keep flags alive
  ms.rushInvulnerable = true;
  ms.rushDamageEnabled = true;
  ms.isRushing = true;
  // Rotate the slash visual continuously so Trash reads like a spinning blade.
  const spinStep = (Math.PI * 2) * BLANKA_ROLL_SWOOSH_TURNS_PER_SECOND * Math.max(0, Number(dt) || 0);
  ms.blankaRollVisualAngle = Number.isFinite(ms.blankaRollVisualAngle)
    ? ms.blankaRollVisualAngle + spinStep
    : Math.atan2(ms.rushDir?.y || 0, ms.rushDir?.x || 1);
  // Fresh hit set every frame so enemies can be hit each pass as the player spins through them
  ms.rushHitEntities = new Set();

  // Let the existing rush system handle movement, damage, and invuln this frame
  // (called by the main loop right after this returns)

  if (ms.blankaRollTimer <= 0) {
    endBlankaRoll(ms);
  }
}

function endBlankaRoll(ms) {
  if (!ms) return;
  ms.blankaRollActive = false;
  ms.blankaRollTimer = 0;
  ms.blankaRollSawCHeld = false;
  ms.blankaRollStartedAt = 0;
  ms.blankaRollVisualAngle = null;
  ms.isRushing = false;
  ms.rushDamageEnabled = false;
  ms.rushInvulnerable = false;
  ms.rushDistanceRemaining = 0;
  ms.rushHitEntities = null;
  if (player) player.ignoreEntityCollisions = false;
}

function spawnRingOfFireHazard(centerX, centerY, radius, options = null) {
  const opts = options && typeof options === "object" ? options : null;
  const life = Number.isFinite(opts?.life) ? Math.max(0.05, opts.life) : RING_OF_FIRE_LINGER_DURATION;
  const band = Number.isFinite(opts?.band) ? Math.max(1, opts.band) : RING_OF_FIRE_BAND;
  const damage = Number.isFinite(opts?.damage) ? Math.max(0, opts.damage) : RING_OF_FIRE_DAMAGE;
  const bossDamage = Number.isFinite(opts?.bossDamage) ? Math.max(0, opts.bossDamage) : RING_OF_FIRE_BOSS_DAMAGE;
  const hitCooldown = Number.isFinite(opts?.hitCooldown)
    ? Math.max(0, opts.hitCooldown)
    : RING_OF_FIRE_HIT_COOLDOWN;
  const sourceTag = String(opts?.sourceTag || "churchPowerup");
  const growthSpeed = Number.isFinite(opts?.growthSpeed) ? Math.max(0, opts.growthSpeed) : 0;
  const maxRadius = Number.isFinite(opts?.maxRadius) ? Math.max(0, opts.maxRadius) : Infinity;
  const spawnDelay = Number.isFinite(opts?.spawnDelay) ? Math.max(0, opts.spawnDelay) : 0;
  ringOfFireHazards.push({
    x: centerX,
    y: centerY,
    radius,
    life,
    duration: life,
    band,
    damage,
    bossDamage,
    hitCooldown,
    hitMap: new WeakMap(),
    sourceTag,
    growthSpeed,
    maxRadius,
    spawnDelay,
    blinkWindow: Math.min(1.2, life),
    blinkTimer: 0,
    visible: true,
    blinkAlpha: 1,
  });
}

function startSmiteBombSweep({
  centerX,
  centerY,
  damage,
  bossDamage,
  duration = SMITE_BOMB_SWEEP_DURATION,
  maxRadius: maxRadiusLimit = null,
  sourceTag = "churchPowerup",
} = {}) {
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;
  const playWidth = Math.max(1, canvas?.width || 1);
  const playHeight = Math.max(1, canvas?.height || 1);
  const corners = [
    { x: 0, y: HUD_HEIGHT },
    { x: playWidth, y: HUD_HEIGHT },
    { x: 0, y: playHeight },
    { x: playWidth, y: playHeight },
  ];
  let computedMaxRadius = 0;
  for (const corner of corners) {
    const d = Math.hypot(corner.x - centerX, corner.y - centerY);
    if (d > computedMaxRadius) computedMaxRadius = d;
  }
  const capRadius = Number.isFinite(maxRadiusLimit) ? Math.max(0, Number(maxRadiusLimit)) : null;
  if (capRadius !== null) {
    computedMaxRadius = Math.min(computedMaxRadius, capRadius);
  }
  const sweepDuration = Math.max(0.2, Number(duration) || SMITE_BOMB_SWEEP_DURATION);
  const worldScale = Number.isFinite(WORLD_SCALE) && WORLD_SCALE > 0 ? WORLD_SCALE : 1;
  const sweepBand = SMITE_BOMB_SWEEP_BAND * worldScale;
  const ringCount = Math.max(1, Math.round(Number(SMITE_BOMB_SWEEP_RING_COUNT) || 3));
  const ringDamage = Math.max(0, Math.round(Number(SMITE_BOMB_SWEEP_RING_DAMAGE) || 100));
  const ringDelay = Math.max(0, Number(SMITE_BOMB_SWEEP_RING_DELAY) || 0.22);
  const growthSpeed = computedMaxRadius / sweepDuration;
  const ringLife = sweepDuration + ringDelay * Math.max(0, ringCount - 1) + 0.25;
  for (let i = 0; i < ringCount; i += 1) {
    spawnRingOfFireHazard(centerX, centerY, 0, {
      life: ringLife,
      band: sweepBand,
      damage: ringDamage,
      bossDamage: ringDamage,
      // One impact per ring crossing.
      hitCooldown: 99,
      sourceTag,
      growthSpeed,
      maxRadius: computedMaxRadius,
      spawnDelay: i * ringDelay,
    });
  }
  smiteBombSweepState = null;
}

function updateSmiteBombSweep(dt) {
  return;
}

function executeRingOfFireAttack(meleeAttackState) {
  if (!player) return false;
  const centerX = player.x;
  const centerY = player.y;
  executeSpinAttack(meleeAttackState, null, { skipYell: true });
  // executeSpinAttack announces the base spin move ("Reap"); override to AC-super label.
  showMoveBanner(MOVE_NAME_AC_SUPER);
  // Preserve Refuge identity for callouts/feed instead of generic Spin.
  meleeAttackState.currentAttackHitboxType = "holyGround";
  registerComboMoveName(meleeAttackState, MOVE_NAME_AC_SUPER);
  meleeAttackState.ringFireActive = true;
  meleeAttackState.ringFirePhase = "trace";
  meleeAttackState.ringFireCenterX = centerX;
  meleeAttackState.ringFireCenterY = centerY;
  meleeAttackState.ringFireRadius = RING_OF_FIRE_RADIUS;
  meleeAttackState.ringFireStartAngle = -Math.PI * 0.5;
  meleeAttackState.ringFireDirection = meleeAttackState.spinVisualDirection || 1;
  meleeAttackState.ringFireAngle = meleeAttackState.ringFireStartAngle;
  meleeAttackState.ringFireTraceProgress = 0;
  player.invulnerableTimer = Math.max(player.invulnerableTimer || 0, RING_OF_FIRE_INVULNERABILITY);
  return true;
}

function executeSpinAttack(meleeAttackState, moveDir, { skipYell = false } = {}) {
  if (!player) return;
  if (!skipYell) playerYell("Reap");
  showMoveBanner("Reap");
  registerComboMoveName(meleeAttackState, "Reap");
  meleeAttackState.currentAttackHitboxType = "spin";
  meleeAttackState.swingLength = null;
  const dir = getSpinAttackDirection();
  if (typeof player.updateFacing === "function") {
    player.updateFacing(dir.x, dir.y);
  }
  const facingLeft = player.facing === "left" || player.flipHorizontal === true;
  meleeAttackState.spinVisualDirection = facingLeft ? -1 : 1;
  beginMeleeHitstopSequence(meleeAttackState);
  maybeFireWordOfGodProjectile(dir, Math.atan2(dir.y, dir.x));
  if (moveDir && (moveDir.x !== 0 || moveDir.y !== 0)) {
    const normalized = normalizeVector(moveDir.x, moveDir.y);
    meleeAttackState.spinMoveDir = normalized;
    meleeAttackState.spinMoveDistanceRemaining = SPIN_MOVE_DISTANCE;
  } else {
    meleeAttackState.spinMoveDir = null;
    meleeAttackState.spinMoveDistanceRemaining = 0;
  }
  // Spin should not consume shared B cooldown; keep dash/rush dot available after C/A.
  meleeAttackState.buttonDown = false;
  meleeAttackState.isCharging = false;
  meleeAttackState.chargeTimer = 0;
  meleeAttackState.awaitRush = false;
  meleeAttackState.awaitTimer = 0;
  meleeAttackState.spinTimer = MELEE_SPIN_DURATION;
  meleeAttackState.spinDuration = MELEE_SPIN_DURATION;
  meleeAttackState.spinHitEntities = new Set();
  {
    const d = MELEE_SPIN_DURATION;
    if (facingLeft) {
      // Counterclockwise: up → up-left → left → down-left → down → down-right → right → up-right
      meleeAttackState.spinBurstQueue = [
        { fireAt: d - 0.001,    angle: -Math.PI / 2       },  // up
        { fireAt: d * (6 / 7), angle: -Math.PI * 3 / 4   },  // up-left
        { fireAt: d * (5 / 7), angle:  Math.PI            },  // left
        { fireAt: d * (4 / 7), angle:  Math.PI * 3 / 4   },  // down-left
        { fireAt: d * (3 / 7), angle:  Math.PI / 2        },  // down
        { fireAt: d * (2 / 7), angle:  Math.PI / 4        },  // down-right
        { fireAt: d * (1 / 7), angle:  0                  },  // right
        { fireAt: d * 0.00,    angle: -Math.PI / 4        },  // up-right
      ];
    } else {
      // Clockwise: up → up-right → right → down-right → down → down-left → left → up-left
      meleeAttackState.spinBurstQueue = [
        { fireAt: d - 0.001,    angle: -Math.PI / 2       },  // up
        { fireAt: d * (6 / 7), angle: -Math.PI / 4        },  // up-right
        { fireAt: d * (5 / 7), angle:  0                  },  // right
        { fireAt: d * (4 / 7), angle:  Math.PI / 4        },  // down-right
        { fireAt: d * (3 / 7), angle:  Math.PI / 2        },  // down
        { fireAt: d * (2 / 7), angle:  Math.PI * 3 / 4   },  // down-left
        { fireAt: d * (1 / 7), angle:  Math.PI            },  // left
        { fireAt: d * 0.00,    angle: -Math.PI * 3 / 4   },  // up-left
      ];
    }
  }
  meleeAttackState.spinFacingDir = { x: dir.x, y: dir.y };
  meleeAttackState.projectileBlockTimer = MELEE_PROJECTILE_COOLDOWN_AFTER;
  if (player && player.animator) {
    player.state = "attackMelee";
    player.animator.play("attackMelee", { restart: true });
  }
  playRushAttackSfx(0.8);
}

function executeDivineShot(dir, meleeAttackState, angleRad, { skipYell = false } = {}) {
  if (!skipYell) playerYell("Blast");
  showMoveBanner("Blast");
  registerComboMoveName(meleeAttackState, "Blast");
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const spawnX = player.x + Math.cos(angleRad) * MELEE_OFFSET;
  const spawnY = player.y + Math.sin(angleRad) * MELEE_OFFSET;
  const vx = Math.cos(angleRad) * DIVINE_SHOT_SPEED;
  const vy = Math.sin(angleRad) * DIVINE_SHOT_SPEED;
  meleeAttackState.pendingDivineShot = {
    delay: 0.1,
    spawnX,
    spawnY,
    vx,
    vy,
  };

  meleeAttackState.divineShotFollowUpUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
  meleeAttackState.cooldown = 0;
}

function flushPendingDivineShot(meleeAttackState, dt) {
  if (!meleeAttackState?.pendingDivineShot) return;
  meleeAttackState.pendingDivineShot.delay = Math.max(
    0,
    Number(meleeAttackState.pendingDivineShot.delay || 0) - Math.max(0, dt),
  );
  if (meleeAttackState.pendingDivineShot.delay > 0) return;

  const pending = meleeAttackState.pendingDivineShot;
  meleeAttackState.pendingDivineShot = null;
  spawnProjectile("divine_shot", pending.spawnX, pending.spawnY, pending.vx, pending.vy, {
    friendly: true,
    damage: applyPlayerProjectileClassMultiplier(DIVINE_SHOT_DAMAGE) * getMoveMultiplier("Blast"),
    life: DIVINE_SHOT_LIFE,
    speed: DIVINE_SHOT_SPEED,
    radius: DIVINE_CHAKRAM_HIT_RADIUS,
    source: player,
    damageType: "charged",
    autoAimDuration: DIVINE_SHOT_AUTO_AIM_DURATION,
    autoAimStrength: DIVINE_SHOT_AUTO_AIM_STRENGTH,
    autoAimMinDot: DIVINE_SHOT_AUTO_AIM_MIN_DOT,
    priority: DIVINE_SHOT_PROJECTILE_PRIORITY,
    isDivineShot: true,
    loopFrames: true,
  });
  if (typeof playDivineShotSfx === "function") {
    playDivineShotSfx(A_MOVE_SFX_VOLUME_CHARGE_A);
  }
}

function executeSwordRush(meleeAttackState) {
  if (!player) return;
  const dir = getDashButtonDirection();
  const normDir = normalizeVector(dir.x, dir.y);
  showMoveBanner("Thrash");
  registerComboMoveName(meleeAttackState, "Thrash");
  showDualChargeReadyPreview(meleeAttackState, "Thrash", { executed: true });
  // Thrash refactor: stationary rapid slash flurry (no dash travel).
  meleeAttackState.isRushing = false;
  meleeAttackState.rushJustEnded = false;
  meleeAttackState.rushDamageEnabled = false;
  meleeAttackState.rushInvulnerable = false;
  meleeAttackState.rushHitEntities = null;
  meleeAttackState.rushDistanceRemaining = 0;
  meleeAttackState.rushLockTimer = 0;
  meleeAttackState.thrashFlurryActive = true;
  meleeAttackState.thrashFlurryDir = normDir;
  meleeAttackState.thrashFlurryStepTimer = 0;
  meleeAttackState.thrashFlurryStepIndex = 0;
  meleeAttackState.thrashFlurryTotalSteps = THRASH_FLURRY_STEP_SEQUENCE.length * THRASH_FLURRY_CYCLES;
  meleeAttackState.thrashFlurryHitCooldowns = new WeakMap();
  meleeAttackState.thrashFlurryTouchedEntities = new Set();
  // Keep legacy rush flags off so paperdoll doesn't lock to thrust frame 3.
  meleeAttackState.swordRushActive = false;
  meleeAttackState.swordRushBlastHitEntities = null;
  meleeAttackState.currentAttackHitboxType = "slash";
  if (player && player.animator) {
    player.state = "attackMelee";
    player.animator.play("attackMelee", { restart: true });
  }
}

function finalizeThrashFlurryKnockback(meleeAttackState) {
  if (!player || !(meleeAttackState?.thrashFlurryTouchedEntities instanceof Set)) return;
  meleeAttackState.thrashFlurryTouchedEntities.forEach((entity) => {
    if (!entity) return;
    if (entity === activeBoss) {
      if (activeBoss.dead || activeBoss.defeated || activeBoss.removed) return;
      if (typeof activeBoss.knockbackVx === "number") {
        applyEnemyMeleeKnockback(activeBoss, player.x, player.y, MELEE_DAMAGE_KNOCKBACK);
      }
      return;
    }
    if (entity.dead || entity.state === "death") return;
    applyEnemyMeleeKnockback(entity, player.x, player.y, MELEE_DAMAGE_KNOCKBACK);
  });
  meleeAttackState.thrashFlurryTouchedEntities.clear();
}

function applyThrashFlurryLaneDamage(meleeAttackState, laneCenterX, laneCenterY, laneAngle, laneLength, laneThickness) {
  if (!player || !meleeAttackState) return false;
  let didHitAny = false;
  const nowSec = (typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()) / 1000;
  if (!(meleeAttackState.thrashFlurryHitCooldowns instanceof WeakMap)) {
    meleeAttackState.thrashFlurryHitCooldowns = new WeakMap();
  }
  const hitCooldowns = meleeAttackState.thrashFlurryHitCooldowns;
  const cos = Math.cos(-laneAngle);
  const sin = Math.sin(-laneAngle);
  const laneRect = {
    x: -laneLength * 0.5,
    y: -laneThickness * 0.5,
    width: laneLength,
    height: laneThickness,
  };
  const hitMoveName = "Thrash";
  // Flurry design: flat per-hit damage, no Thrash move multiplier.
  const hitDamage = Math.max(1, Math.round(THRASH_FLURRY_STEP_DAMAGE));

  enemies.forEach((enemy) => {
    if (!enemy || enemy.dead || enemy.state === "death") return;
    const lastHitAt = Number(hitCooldowns.get(enemy) || 0);
    if ((nowSec - lastHitAt) < THRASH_FLURRY_REHIT_COOLDOWN) return;
    const hitCenter = getEnemyHitboxCenter(enemy);
    const relX = hitCenter.x - laneCenterX;
    const relY = hitCenter.y - laneCenterY;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;
    const hitRadius = getEnemyHitboxRadius(enemy) || enemy.radius || 0;
    if (!circleIntersectsRect(localX, localY, hitRadius, laneRect)) return;
    hitCooldowns.set(enemy, nowSec);
    didHitAny = true;
    const counterHit = getCounterHitResult(enemy, hitDamage, meleeAttackState);
    const appliedDamage = counterHit.damage;
    enemy.takeDamage(appliedDamage, {
      damageType: "melee",
      damageText: counterHit.damageText,
    });
    applyMeleeHitstop(enemy, meleeAttackState, counterHit);
    registerPunishComboDamage(enemy, appliedDamage, meleeAttackState);
    registerMeleeComboHit(enemy, meleeAttackState, hitMoveName, {
      damage: appliedDamage,
      isCounterHit: Boolean(counterHit?.isCounterHit),
      isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
    });
    registerChainHit(enemy, appliedDamage);
    if (!enemy.dead && enemy.state !== "death" && meleeAttackState.thrashFlurryTouchedEntities instanceof Set) {
      meleeAttackState.thrashFlurryTouchedEntities.add(enemy);
    }
    spawnEnemyHitEffect(enemy);
    if (typeof playEnemyHitSfx === "function") playEnemyHitSfx(0.62);
  });

  if (activeBoss && !activeBoss.dead && !activeBoss.defeated && !activeBoss.removed) {
    const lastHitAt = Number(hitCooldowns.get(activeBoss) || 0);
    if ((nowSec - lastHitAt) >= THRASH_FLURRY_REHIT_COOLDOWN) {
      const relX = activeBoss.x - laneCenterX;
      const relY = activeBoss.y - laneCenterY;
      const localX = relX * cos - relY * sin;
      const localY = relX * sin + relY * cos;
      const hitRadius = activeBoss.radius || 0;
      if (circleIntersectsRect(localX, localY, hitRadius, laneRect)) {
        hitCooldowns.set(activeBoss, nowSec);
        didHitAny = true;
        const counterHit = getCounterHitResult(activeBoss, hitDamage, meleeAttackState);
        const appliedDamage = counterHit.damage;
        activeBoss.takeDamage(appliedDamage, {
          hitX: activeBoss.x,
          hitY: activeBoss.y,
          damageType: "melee",
          damageText: counterHit.damageText,
        });
        applyMeleeHitstop(activeBoss, meleeAttackState, counterHit);
        registerPunishComboDamage(activeBoss, appliedDamage, meleeAttackState);
        registerMeleeComboHit(activeBoss, meleeAttackState, hitMoveName, {
          damage: appliedDamage,
          isCounterHit: Boolean(counterHit?.isCounterHit),
          isPunishCounter: Boolean(counterHit?.isPunishCounter),
          baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
        });
        registerChainHit(activeBoss, appliedDamage);
        if (meleeAttackState.thrashFlurryTouchedEntities instanceof Set) {
          meleeAttackState.thrashFlurryTouchedEntities.add(activeBoss);
        }
        spawnEnemyHitEffect(activeBoss);
        if (typeof playEnemyHitSfx === "function") playEnemyHitSfx(0.62);
      }
    }
  }
  return didHitAny;
}

function updateThrashFlurry(dt, meleeAttackState) {
  if (!player || !meleeAttackState?.thrashFlurryActive) return;
  // Keep body animation pinned to melee while flurry is active.
  player.state = "attackMelee";
  if (player.animator?.currentName !== "attackMelee") {
    player.animator.play("attackMelee", { restart: true });
  }
  meleeAttackState.thrashFlurryStepTimer = Math.max(
    0,
    Number(meleeAttackState.thrashFlurryStepTimer || 0) - Math.max(0, Number(dt) || 0),
  );
  if (meleeAttackState.thrashFlurryStepTimer > 0) return;

  const stepIndex = Number(meleeAttackState.thrashFlurryStepIndex || 0);
  const totalSteps = Math.max(1, Number(meleeAttackState.thrashFlurryTotalSteps || 0));
  if (stepIndex >= totalSteps) {
    finalizeThrashFlurryKnockback(meleeAttackState);
    meleeAttackState.thrashFlurryActive = false;
    meleeAttackState.swordRushActive = false;
    meleeAttackState.currentAttackHitboxType = "slash";
    meleeAttackState.thrashFlurryStepIndex = 0;
    meleeAttackState.thrashFlurryStepTimer = 0;
    meleeAttackState.thrashFlurryTouchedEntities = null;
    player._paperdollThrashFlurryFrameCursor = null;
    meleeAttackState.pendingComboMoveName = "Thrash";
    return;
  }
  const movePreset = THRASH_FLURRY_STEP_SEQUENCE[stepIndex % THRASH_FLURRY_STEP_SEQUENCE.length];
  meleeAttackState.currentAttackHitboxType = "slash";
  // Animation-only pass: drive paperdoll preset sequence and lock to frames 2/3.
  meleeAttackState.pendingComboMoveName = movePreset;
  player._paperdollThrashFlurryFrameCursor = stepIndex % 2 === 0 ? 1 : 2;
  if (typeof spawnSlashBurstEffect === "function") {
    const baseAngle = Math.atan2(
      Number(meleeAttackState?.thrashFlurryDir?.y) || 0,
      Number(meleeAttackState?.thrashFlurryDir?.x) || 1,
    );
    const isDown = movePreset === "SlashDown";
    const isUp = movePreset === "SlashUp";
    const isBash = movePreset === "SlashBash";
    const isThrust = movePreset === "Thrust";
    const slashAngle = isDown
      ? baseAngle + 0.9
      : isUp
        ? baseAngle - 0.9
        : isBash
          ? baseAngle + Math.PI / 2
          : baseAngle;
    const maxOffset = isThrust ? THRASH_FLURRY_VFX_OFFSET * 1.25 : THRASH_FLURRY_VFX_OFFSET;
    const centerX = player.x + Math.cos(baseAngle) * (maxOffset * 0.5);
    const centerY = player.y + Math.sin(baseAngle) * (maxOffset * 0.5);
    const stepsRemaining = Math.max(0, totalSteps - stepIndex);
    const isTailStep = stepsRemaining <= THRASH_FLURRY_AFTERIMAGE_TAIL_STEPS;
    const frameDuration = isTailStep
      ? THRASH_FLURRY_VFX_FRAME_DURATION_TAIL
      : THRASH_FLURRY_VFX_FRAME_DURATION_BASE;
    const slashFrames = assets?.effects?.swordSlash;
    const baseFrameWidth = Math.max(1, Number(slashFrames?.[0]?.width) || 1);
    // One elongated swoosh from player -> edge of the hit lane.
    const scaleX = Math.max(1, maxOffset / Math.max(1, baseFrameWidth * THRASH_FLURRY_VFX_SCALE));
    spawnSlashBurstEffect(centerX, centerY, slashAngle, THRASH_FLURRY_VFX_SCALE, {
      scaleX,
      scaleY: THRASH_FLURRY_VFX_THICKNESS_SCALE_Y,
      tintColor: "#ffd37a",
      tintAlpha: 0.82,
      glowColor: "#ffe7a6",
      glowBlur: THRASH_FLURRY_VFX_GLOW_BLUR,
      glowAlpha: THRASH_FLURRY_VFX_GLOW_ALPHA,
      blendMode: "lighter",
      frameDuration,
    });
    if (isTailStep) {
      for (let i = 1; i <= THRASH_FLURRY_AFTERIMAGE_COUNT; i += 1) {
        const fade = Math.pow(THRASH_FLURRY_AFTERIMAGE_ALPHA_FALLOFF, i);
        spawnSlashBurstEffect(centerX, centerY, slashAngle, THRASH_FLURRY_VFX_SCALE, {
          scaleX,
          scaleY: THRASH_FLURRY_VFX_THICKNESS_SCALE_Y,
          tintColor: "#ffd37a",
          tintAlpha: 0.82 * fade,
          glowColor: "#ffe7a6",
          glowBlur: Math.max(0, THRASH_FLURRY_VFX_GLOW_BLUR * fade),
          glowAlpha: THRASH_FLURRY_VFX_GLOW_ALPHA * fade,
          blendMode: "lighter",
          delay: i * THRASH_FLURRY_AFTERIMAGE_DELAY,
          frameDuration,
        });
      }
    }
    const didLandHit = applyThrashFlurryLaneDamage(
      meleeAttackState,
      centerX,
      centerY,
      slashAngle,
      maxOffset,
      THRASH_FLURRY_HITBOX_THICKNESS,
    );
    if (didLandHit) {
      playThrashLandSfx(0.86);
    } else {
      playThrashSwipeSfx(stepIndex, 0.82);
    }
  }
  // Restart melee animation each step for stronger body motion readability.
  if (player.animator) {
    player.animator.play("attackMelee", { restart: true });
  }
  meleeAttackState.thrashFlurryStepIndex += 1;
  meleeAttackState.thrashFlurryStepTimer = THRASH_FLURRY_STEP_INTERVAL;
}

function updateRingOfFireMotion(dt, meleeAttackState) {
  if (!player || !meleeAttackState?.ringFireActive) return;
  const centerX = meleeAttackState.ringFireCenterX;
  const centerY = meleeAttackState.ringFireCenterY;
  const radius = Math.max(1, meleeAttackState.ringFireRadius || RING_OF_FIRE_RADIUS);
  if (meleeAttackState.spinTimer > 0) {
    const duration = Math.max(0.001, meleeAttackState.spinDuration || MELEE_SPIN_DURATION);
    const progress = 1 - Math.min(1, meleeAttackState.spinTimer / duration);
    meleeAttackState.ringFireTraceProgress = progress;
    meleeAttackState.ringFireAngle =
      meleeAttackState.ringFireStartAngle +
      progress * Math.PI * 2 * (meleeAttackState.ringFireDirection || 1);
  } else {
    meleeAttackState.ringFireActive = false;
    meleeAttackState.ringFirePhase = null;
    meleeAttackState.ringFireTraceProgress = 1;
    spawnRingOfFireHazard(centerX, centerY, radius);
    spawnFlashEffect(centerX, centerY);
    applyCameraShake(Math.max(CAMERA_SHAKE_DURATION, 0.16), CAMERA_SHAKE_INTENSITY);
  }
}

function updateRingOfFireHazards(dt) {
  if (!ringOfFireHazards.length) return;
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  for (let i = ringOfFireHazards.length - 1; i >= 0; i -= 1) {
    const hazard = ringOfFireHazards[i];
    if ((hazard.spawnDelay || 0) > 0) {
      hazard.spawnDelay = Math.max(0, (hazard.spawnDelay || 0) - dt);
      continue;
    }
    if ((hazard.growthSpeed || 0) > 0) {
      hazard.radius = (hazard.radius || 0) + hazard.growthSpeed * dt;
    }
    if (Number.isFinite(hazard.maxRadius) && (hazard.radius || 0) > hazard.maxRadius + (hazard.band || 0)) {
      ringOfFireHazards.splice(i, 1);
      continue;
    }
    hazard.life = Math.max(0, (hazard.life || 0) - dt);
    const exiting = hazard.life <= Math.max(0, hazard.blinkWindow || 0);
    if (exiting) {
      const blinkWindow = Math.max(0.001, hazard.blinkWindow || 0.001);
      const urgency = 1 - Math.max(0, Math.min(1, hazard.life / blinkWindow));
      const blinkRate = 5 + urgency * 17;
      hazard.blinkTimer = (hazard.blinkTimer || 0) + dt * blinkRate;
      hazard.blinkAlpha = Math.sin(hazard.blinkTimer) > 0 ? 1 : 0.16;
      hazard.visible = true;
    } else {
      hazard.blinkAlpha = 1;
      hazard.visible = true;
    }
    const band = Math.max(1, hazard.band || RING_OF_FIRE_BAND);
    const outerRadius = (hazard.radius || RING_OF_FIRE_RADIUS) + band * 0.5;
    const innerRadius = Math.max(0, (hazard.radius || RING_OF_FIRE_RADIUS) - band * 0.5);
    const canHit = (entity) => {
      if (!entity || entity.dead || entity.state === "death") return false;
      const lastAtRaw = hazard.hitMap?.get(entity);
      const lastAt = Number.isFinite(lastAtRaw) ? lastAtRaw : -Infinity;
      return now - lastAt >= (hazard.hitCooldown || RING_OF_FIRE_HIT_COOLDOWN) * 1000;
    };
    const markHit = (entity) => {
      if (hazard.hitMap) hazard.hitMap.set(entity, now);
    };
    enemies.forEach((enemy) => {
      if (!canHit(enemy)) return;
      const center = getEnemyHitboxCenter(enemy);
      const dist = Math.hypot(center.x - hazard.x, center.y - hazard.y);
      const targetRadius = getEnemyHitboxRadius(enemy);
      if (dist + targetRadius < innerRadius || dist - targetRadius > outerRadius) return;
      markHit(enemy);
      const ringWasAlive = !enemy.dead && enemy.state !== "death";
      enemy.takeDamage(hazard.damage, { damageType: "charged" });
      if (ringWasAlive && (enemy.dead || enemy.state === "death")) {
        if (hazard.sourceTag === "prayerBomb") {
          enemy.killedByPrayerBomb = true;
        } else {
          enemy.killedByChurchPowerup = true;
        }
      }
      if (!enemy.dead && enemy.state !== "death") {
        applyEnemyMeleeKnockback(enemy, hazard.x, hazard.y, MELEE_DAMAGE_KNOCKBACK * 0.75);
      }
      spawnEnemyHitEffect(enemy, center.x, center.y, { damageType: "charged" });
    });
    if (activeBoss && !activeBoss.dead && !activeBoss.defeated && !activeBoss.removed && canHit(activeBoss)) {
      const center = getEnemyHitboxCenter(activeBoss);
      const dist = Math.hypot(center.x - hazard.x, center.y - hazard.y);
      const targetRadius = activeBoss.radius || 0;
      if (dist + targetRadius >= innerRadius && dist - targetRadius <= outerRadius) {
        markHit(activeBoss);
        activeBoss.takeDamage(hazard.bossDamage, {
          hitX: center.x,
          hitY: center.y,
          damageType: "charged",
        });
        if (typeof activeBoss.knockbackVx === "number" && !activeBoss.dead && !activeBoss.defeated) {
          applyEnemyMeleeKnockback(activeBoss, hazard.x, hazard.y, MELEE_DAMAGE_KNOCKBACK * 0.45);
        }
        spawnEnemyHitEffect(activeBoss, center.x, center.y, { damageType: "charged" });
      }
    }
    projectiles.forEach((projectile) => {
      if (!projectile || projectile.dead || projectile.friendly || projectile.visualOnly) return;
      const pr = Math.max(0, projectile.radius || 0);
      const dist = Math.hypot((projectile.x || 0) - hazard.x, (projectile.y || 0) - hazard.y);
      if (dist + pr < innerRadius || dist - pr > outerRadius) return;
      projectile.dead = true;
      spawnImpactEffect(projectile.x, projectile.y);
      spawnFlashEffect(projectile.x, projectile.y);
    });
    if (hazard.life <= 0) {
      ringOfFireHazards.splice(i, 1);
    }
  }
}

if (typeof window !== "undefined") {
  window.startPurifyShockwave = (options = {}) =>
    startSmiteBombSweep({
      ...options,
      sourceTag: options?.sourceTag || "prayerBomb",
    });
}

function maybeFireWordOfGodProjectile(dir, angleRad) {
  return;
}

function updateMeleeTimers(dt, meleeAttackState) {
  meleeAttackState.cooldown = Math.max(0, (meleeAttackState.cooldown || 0) - dt);

  const readyNow = updateSharedBButtonCooldown(dt) && !meleeAttackState.isRushing;
  if (readyNow && player) {
    spawnFlashEffect(player.x, player.y + (player.radius || 24));
  }

  if (meleeAttackState.active && meleeAttackState.fade > 0) {
    meleeAttackState.fade = Math.max(0, meleeAttackState.fade - dt);
    if (meleeAttackState.fade === 0) {
      meleeAttackState.active = false;
    }
  }

  if (meleeAttackState.swooshTimer > 0) {
    meleeAttackState.swooshTimer = Math.max(0, meleeAttackState.swooshTimer - dt);
  }
  if (meleeAttackState.cleaveArcTimer > 0) {
    meleeAttackState.cleaveArcTimer = Math.max(0, meleeAttackState.cleaveArcTimer - dt);
  }
  if (meleeAttackState.swooshShieldDebugTimer > 0) {
    meleeAttackState.swooshShieldDebugTimer = Math.max(0, meleeAttackState.swooshShieldDebugTimer - dt);
  }
  if (meleeAttackState.spinTimer > 0) {
    const prevSpin = meleeAttackState.spinTimer;
    meleeAttackState.spinTimer = Math.max(0, meleeAttackState.spinTimer - dt);
    const queue = meleeAttackState.spinBurstQueue;
    if (queue && queue.length && player && typeof spawnSlashBurstEffect === "function") {
      const wHitbox = player.config?.weaponHitbox;
      const hbOffsetX = (wHitbox && Number.isFinite(wHitbox.offsetX)) ? wHitbox.offsetX : 62;
      const hbWidth = (wHitbox && Number.isFinite(wHitbox.width) && wHitbox.width > 0) ? wHitbox.width : 80;
      const burstScale = hbWidth / 48;
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        const entry = queue[i];
        if (prevSpin > entry.fireAt && meleeAttackState.spinTimer <= entry.fireAt) {
          const bx = player.x + Math.cos(entry.angle) * hbOffsetX;
          const by = player.y + Math.sin(entry.angle) * hbOffsetX;
          const warmPass = i % 2 === 0;
          spawnSlashBurstEffect(bx, by, entry.angle, burstScale, {
            scaleX: 1.18,
            scaleY: 0.92,
            tintColor: warmPass ? "#ff9d4d" : "#ffd37a",
            tintAlpha: 0.84,
            glowColor: warmPass ? "#ffbf7a" : "#ffe7a6",
            glowBlur: 16,
            glowAlpha: 0.92,
            blendMode: "lighter",
            frameDuration: 0.036,
          });
          queue.splice(i, 1);
        }
      }
    }
  }

  if (meleeAttackState.projectileBlockTimer > 0) {
    meleeAttackState.projectileBlockTimer = Math.max(0, meleeAttackState.projectileBlockTimer - dt);
  }

  meleeAttackState.rushLockTimer = Math.max(0, meleeAttackState.rushLockTimer - dt);
  if ((meleeAttackState.thrashFeedbackCooldown || 0) > 0) {
    meleeAttackState.thrashFeedbackCooldown = Math.max(0, meleeAttackState.thrashFeedbackCooldown - dt);
  }
  if ((meleeAttackState.wardFeedbackCooldown || 0) > 0) {
    meleeAttackState.wardFeedbackCooldown = Math.max(0, meleeAttackState.wardFeedbackCooldown - dt);
  }
  if (meleeAttackState.rushShieldDebugTimer > 0) {
    meleeAttackState.rushShieldDebugTimer = Math.max(0, meleeAttackState.rushShieldDebugTimer - dt);
  }
  if (meleeAttackState.rushHitboxTimer > 0) {
    meleeAttackState.rushHitboxTimer = Math.max(0, meleeAttackState.rushHitboxTimer - dt);
  }
  if (meleeAttackState.bcTeleportBlockTimer > 0) {
    meleeAttackState.bcTeleportBlockTimer = Math.max(0, meleeAttackState.bcTeleportBlockTimer - dt);
  }
  if (meleeAttackState.cBHolyDashBlockTimer > 0) {
    meleeAttackState.cBHolyDashBlockTimer = Math.max(0, meleeAttackState.cBHolyDashBlockTimer - dt);
  }
  if (meleeAttackState.acSuperPrayerBombBlockTimer > 0) {
    meleeAttackState.acSuperPrayerBombBlockTimer = Math.max(0, meleeAttackState.acSuperPrayerBombBlockTimer - dt);
  }

  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const rushForcedExpired =
    Number.isFinite(meleeAttackState.rushForceEndAt) && now >= meleeAttackState.rushForceEndAt;
  if (rushForcedExpired && (meleeAttackState.isRushing || meleeAttackState.rushDamageEnabled)) {
    meleeAttackState.isRushing = false;
    meleeAttackState.rushJustEnded = true;
    meleeAttackState.rushDamageEnabled = false;
    meleeAttackState.rushInvulnerable = false;
    meleeAttackState.rushHitEntities = null;
    meleeAttackState.swordRushActive = false;
    meleeAttackState.swordRushBlastHitEntities = null;
    meleeAttackState.rushDistanceRemaining = 0;
    meleeAttackState.rushLockTimer = 0;
    releasePlayerFromRushPoseLock(player);
    if (player) player.ignoreEntityCollisions = false;
  }
  if (rushForcedExpired) {
    meleeAttackState.rushForceEndAt = 0;
  }

  // Safety cleanup: if rush ended/interrupted but damage flag stayed on, clear rush visuals/hit state.
  if (!meleeAttackState.isRushing && meleeAttackState.rushDamageEnabled) {
    meleeAttackState.rushDamageEnabled = false;
    meleeAttackState.rushInvulnerable = false;
    meleeAttackState.rushHitEntities = null;
    meleeAttackState.swordRushActive = false;
    meleeAttackState.swordRushBlastHitEntities = null;
    meleeAttackState.rushDistanceRemaining = 0;
    meleeAttackState.rushForceEndAt = 0;
    releasePlayerFromRushPoseLock(player);
    if (player) player.ignoreEntityCollisions = false;
  }
}

function updateChargeState(dt, meleeAttackState) {
  const chargingA = meleeAttackState.isCharging;
  const chargingB = meleeAttackState.spinCharging;
  if (!chargingA && !chargingB) {
    clearDualChargeReadyPreview(meleeAttackState);
    return;
  }

  if (chargingA) {
    meleeAttackState.chargeTimer += dt;
  }

  const chargeTimer = chargingA ? meleeAttackState.chargeTimer : meleeAttackState.spinChargeTimer;
  const holdTime = chargingA ? meleeAttackState.holdTime : meleeAttackState.spinHoldTime;
  const flashTriggered = chargingA
    ? meleeAttackState.chargeFlashTriggered
    : meleeAttackState.spinChargeFlashTriggered;
  const chargeComplete = chargeTimer >= holdTime;

  if (chargeComplete && !flashTriggered) {
    if (chargingA) {
      meleeAttackState.chargeFlashTriggered = true;
    } else {
      meleeAttackState.spinChargeFlashTriggered = true;
    }
    if (typeof playChargeCompleteSfx === "function") {
      playChargeCompleteSfx(0.6);
    }

    // Stop the Raybolt animation and spawn flash effect to show charge is ready
    if (player && divineChargeSparkEffect) {
      const sparkX = divineChargeSparkEffect.x;
      const sparkY = divineChargeSparkEffect.y;

      // Kill the Raybolt effect
      divineChargeSparkEffect.dead = true;
      divineChargeSparkEffect = null;

      // Spawn flash effect
      if (divineChargeFlashEffect && !divineChargeFlashEffect.dead) {
        divineChargeFlashEffect.dead = true;
      }
      divineChargeFlashEffect = null;
      const readyEffect = spawnDivineChargeReadyVisual("melee");
      if (readyEffect) {
        readyEffect.x = sparkX;
        readyEffect.y = sparkY;
      }
    }
  }

  // Only show Raybolt after melee swing animation completes (0.2s) and before charge complete
  if (!chargeComplete && chargeTimer >= GAME_MELEE_SWING_DURATION) {
    updateDivineChargeSparkVisual(dt, chargeTimer, holdTime);
  }

  // Update flash position if it exists
  if (divineChargeFlashEffect && !divineChargeFlashEffect.dead && player) {
    const anchor = getPlayerChargeVisualAnchor(player);
    if (anchor) {
      divineChargeFlashEffect.x = anchor.x;
      divineChargeFlashEffect.y = anchor.y;
    }
  }

  const holdA = Math.max(0.001, meleeAttackState.holdTime || 0);
  const holdB = Math.max(0.001, meleeAttackState.spinHoldTime || 0);
  const aFull =
    Boolean(meleeAttackState.buttonDown && meleeAttackState.isCharging) &&
    (meleeAttackState.chargeTimer || 0) >= holdA;
  const bFull =
    Boolean(meleeAttackState.spinButtonDown && meleeAttackState.spinCharging) &&
    (meleeAttackState.spinChargeTimer || 0) >= holdB;
  const prayerSuperCost = player ? (player.prayerChargeRequired || 6000) / 3 : 0;
  const acReady =
    Boolean(meleeAttackState.acSuperArmed) ||
    Boolean(aFull && player && player.prayerHoldLocked && (player.prayerCharge || 0) >= prayerSuperCost);
  const abReady = Boolean(meleeAttackState.abSuperArmed) || Boolean(aFull && bFull);
  const teleportReady = Boolean(meleeAttackState.bcTeleportArmed);
  const abcFullReadyNow = Boolean(
    aFull &&
    bFull &&
    keysPressed.has("ArrowRight") &&
    player &&
    (player.prayerCharge || 0) >= (player.prayerChargeRequired || 6000),
  );
  const abcReady = Boolean(
    abcFullReadyNow ||
    meleeAttackState.abcSmiteArmed ||
    meleeAttackState.abcSmitePendingRelease,
  );
  const readyMove = abcReady
    ? "Prayer Storm"
    : abReady
      ? "Thrash"
      : acReady
        ? MOVE_NAME_AC_SUPER
        : teleportReady
          ? "Trash"
          : "";
  if (readyMove) {
    showDualChargeReadyPreview(meleeAttackState, readyMove);
  } else {
    clearDualChargeReadyPreview(meleeAttackState);
  }
}

function updateMeleeAttackSystem(dt) {
  // Melee attack logic: only trigger once per key press, deal damage once, and disappear
    if (!window._meleeAttackState)
    window._meleeAttackState = {
      active: false,
      fade: 0,
      cooldown: 0,
      buttonDown: false,
      didAttackThisPress: false,
      swingId: 0,
      hitstopSequenceId: 0,
      hitstopAppliedSequenceId: 0,
      chargeTimer: 0,
      isCharging: false,
      spinChargeTimer: 0,
      spinCharging: false,
      spinButtonDown: false,
      isRushing: false,
      rushJustEnded: false,
      rushDir: { x: 1, y: 0 },
      rushDistanceRemaining: 0,
      rushForceEndAt: 0,
      rushHitEntities: null,
      rushHitstopConsumed: false,
      rushCooldown: 0,
      rushDustAccumulator: 0,
      rushShieldDebugTimer: 0,
      chargeFlashTriggered: false,
      spinChargeFlashTriggered: false,
      abcSmiteArmed: false,
      abcSmiteLatch: false,
      abcSmitePendingRelease: false,
      abcPrevCHeld: false,
      rushInvulnerable: false,
      swordRushActive: false,
      swordRushBlastHitEntities: null,
      thrashFlurryActive: false,
      thrashFlurryDir: { x: 1, y: 0 },
      thrashFlurryStepTimer: 0,
      thrashFlurryStepIndex: 0,
      thrashFlurryTotalSteps: 0,
      thrashFlurryHitCooldowns: null,
      thrashFlurryTouchedEntities: null,
      spinTimer: 0,
      spinDuration: 0,
      spinHitEntities: null,
      spinCooldown: 0,
      spinVisualDirection: 1,
      ringFireActive: false,
      ringFirePhase: null,
      ringFireCenterX: 0,
      ringFireCenterY: 0,
      ringFireRadius: 0,
      ringFireStartAngle: 0,
      ringFireDirection: 1,
      ringFireAngle: 0,
      ringFireTraceProgress: 0,
      clashVisualActive: false,
      spinMoveDir: null,
    spinMoveDistanceRemaining: 0,
    spinMeleeQueued: false,
    pendingComboTarget: null,
    pendingComboDamage: 0,
    pendingComboShowAt: 0,
    pendingComboHits: 0,
    pendingComboLastAt: 0,
    comboMoveNames: [],
    devArenaComboEntries: [],
    comboMovesWindowUntil: 0,
    pendingComboMoveName: null,
    lastComboMoveCalloutAt: 0,
    comboLockoutUntil: 0,
    lastComboTextTarget: null,
    lastComboTextAt: 0,
      rushHitboxTimer: 0,
      rushSegment: null,
    awaitRush: false,
    awaitTimer: 0,
    rushBypassUntil: 0,
    swooshTimer: 0,
    swooshDir: { x: 1, y: 0 },
    swooshDamageEnabled: false,
    swooshHitEntities: null,
    projectileBlockTimer: 0,
    rushLockTimer: 0,
    rushDamageEnabled: false,
    comboDamage: 0,
    comboActiveUntil: 0,
    comboShown: false,
    spinComboDamage: 0,
    spinComboActiveUntil: 0,
    spinComboShown: false,
      rushComboDamage: 0,
      rushComboActiveUntil: 0,
      rushComboShown: false,
      rushComboHits: 0,
      rushComboTarget: null,
      swooshShieldDebugTimer: 0,
      meleeCancelUntil: 0,
    meleeCancelDamage: 0,
    meleeCancelTarget: null,
    divineShotFollowUpUntil: 0,
    divineComboDamage: 0,
    divineComboActiveUntil: 0,
    divineComboShown: false,
    divineComboTarget: null,
    divineComboHits: 0,
    divineKillCount: 0,
    divineKillAnchorX: 0,
    divineKillAnchorY: 0,
    divineKillDisplayUntil: 0,
    divineKillLabel: null,
    pendingDivineShot: null,
    normalSlashTarget: null,
    normalSlashHits: 0,
    normalSlashExpiresAt: 0,
    meleeComboTarget: null,
    meleeComboHits: 0,
    meleeComboExpiresAt: 0,
    meleeComboMap: new Map(),
    meleeComboLabel: null,
    punishCounterTarget: null,
    punishCounterExpiresAt: 0,
    punishCounterPrimed: false,
    punishCounterTextShown: false,
    punishComboDamage: 0,
    pendingCounterHitTarget: null,
    pendingCounterHitShowAt: 0,
    activeCounterHitLabel: null,
    activeCounterHitTarget: null,
    activeCounterHitKind: null,
    activeCounterHitUntil: 0,
    pendingBasicAttack: null,
    currentAttackHitboxType: "slash",
    abSuperArmed: false,
    holyDashArmUntil: 0,
    dualChargeReadyMove: "",
    dualChargeReadyBubble: null,
    acSuperPrayerBombBlockTimer: 0,
    bcTeleportArmed: false,
    bcTeleportBlockTimer: 0,
    cBHolyDashBlockTimer: 0,
    blankaRollActive: false,
    blankaRollTimer: 0,
    blankaRollHitEntities: null,
    blankaRollVisualAngle: null,
    cbHeldAtBPress: false,
    cbClashPendingOnCRelease: false,
    cleaveArcTimer: 0,
    cleaveArcDuration: 0,
    cleaveArcDir: 1,
  };
  const meleeAttackState = window._meleeAttackState;
  const input = window.Input;

  if (input && player) {
    const playerAlive = Boolean(player && player.state !== "death");
    if (!playerAlive) {
      clearDualChargeReadyPreview(meleeAttackState, { force: true });
      meleeAttackState.buttonDown = false;
      meleeAttackState.isCharging = false;
      meleeAttackState.thrashFlurryActive = false;
      meleeAttackState.swordRushActive = false;
      meleeAttackState.awaitRush = false;
      clearMeleeComboLabel(meleeAttackState);
      resetComboMoveNames(meleeAttackState);
      meleeAttackState.pendingBasicAttack = null;
      meleeAttackState.meleeComboTarget = null;
      meleeAttackState.meleeComboHits = 0;
      meleeAttackState.meleeComboExpiresAt = 0;
      meleeAttackState.meleeComboMap?.clear();
      clearActiveCounterHitText(meleeAttackState);
      clearPunishCounterState(meleeAttackState);
      if (meleeAttackState.divineKillLabel) {
        meleeAttackState.divineKillLabel.persist = false;
        meleeAttackState.divineKillLabel.life = Math.min(
          meleeAttackState.divineKillLabel.life || 0.2,
          0.2,
        );
        meleeAttackState.divineKillLabel = null;
      }
      meleeAttackState.divineKillCount = 0;
      meleeAttackState.divineKillDisplayUntil = 0;
      clearDivineChargeSparkVisual();
      return;
    }
    meleeAttackState.holdTime = MELEE_HOLD_CHARGE_TIME;
    meleeAttackState.spinHoldTime = SPIN_HOLD_CHARGE_TIME;
    flushPendingDivineShot(meleeAttackState, dt);
    const prevSpinTimer = meleeAttackState.spinTimer || 0;
    updateMeleeTimers(dt, meleeAttackState);
    const spinJustEnded = prevSpinTimer > 0 && meleeAttackState.spinTimer <= 0;
    if (!meleeAttackState.lastComboTimes) {
      meleeAttackState.lastComboTimes = { A: 0, B: 0, C: 0 };
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!meleeAttackState.isRushing && (keysJustPressed.has("ArrowLeft") || keysJustPressed.has(" "))) {
      meleeAttackState.lastComboTimes.A = now;
    }
    if (!meleeAttackState.isRushing && keysJustPressed.has("ArrowDown")) {
      meleeAttackState.lastComboTimes.B = now;
    }
    if ((!meleeAttackState.isRushing || meleeAttackState.blankaRollActive) && keysJustPressed.has("ArrowRight")) {
      meleeAttackState.lastComboTimes.C = now;
      meleeAttackState.holyDashArmUntil = now + HOLY_DASH_COMBO_WINDOW * 1000;
    }
    const comboWindowMs = MELEE_DOUBLE_TAP_WINDOW * 1000;
    const aRecent = now - meleeAttackState.lastComboTimes.A <= comboWindowMs;
    const bRecent = now - meleeAttackState.lastComboTimes.B <= comboWindowMs;
    const cRecent = now - (meleeAttackState.lastComboTimes.C || 0) <= comboWindowMs;
    const comboRushKeyOrder = aRecent && bRecent && meleeAttackState.lastComboTimes.B < meleeAttackState.lastComboTimes.A;
    const cCurrentlyHeld = keysPressed.has("ArrowRight");
    const comboPrayerStrikeOrder = cRecent && aRecent && meleeAttackState.lastComboTimes.C > 0 && meleeAttackState.lastComboTimes.C < meleeAttackState.lastComboTimes.A;
    const comboDoubleStrikeOrder = aRecent && bRecent && meleeAttackState.lastComboTimes.A > 0 && meleeAttackState.lastComboTimes.A < meleeAttackState.lastComboTimes.B;
    updateArcControlCooldowns();
    resolveQueuedBasicMeleeAttack(meleeAttackState);

    let rushCancelledIntoMove = false;
    if (meleeAttackState.isRushing && player) {
      const direction = meleeAttackState.rushDir;
      const aJustPressed = keysJustPressed.has("ArrowLeft") || keysJustPressed.has(" ");
      const cJustPressed = keysJustPressed.has("ArrowRight");
      // A during any rush cancels it and fires melee immediately
      // C during Blitz cancels it and arms the holy dash combo
      if (aJustPressed || (cJustPressed && meleeAttackState.swordRushActive)) {
        meleeAttackState.isRushing = false;
        meleeAttackState.rushJustEnded = true;
        meleeAttackState.rushDamageEnabled = false;
        meleeAttackState.rushInvulnerable = false;
        meleeAttackState.rushHitEntities = null;
        meleeAttackState.swordRushActive = false;
        meleeAttackState.swordRushBlastHitEntities = null;
        meleeAttackState.rushKillCount = 0;
        meleeAttackState.rushKillSumX = 0;
        meleeAttackState.rushKillSumY = 0;
        meleeAttackState.projectileBlockTimer = MELEE_PROJECTILE_COOLDOWN_AFTER;
        meleeAttackState.cooldown = 0;
        meleeAttackState.rushLockTimer = 0;
        meleeAttackState.rushDistanceRemaining = 0;
        meleeAttackState.pendingComboMoveName = null;
        releasePlayerFromRushPoseLock(player);
        rushCancelledIntoMove = true;
        if (cJustPressed) {
          meleeAttackState.lastComboTimes.C = now;
          meleeAttackState.holyDashArmUntil = now + HOLY_DASH_COMBO_WINDOW * 1000;
        }
        if (aJustPressed) {
          // Zero B so comboRushKeyOrder can't re-trigger a rush this frame; leave A intact for next B/A combo
          meleeAttackState.lastComboTimes.B = 0;
          keysJustPressed.delete("ArrowLeft");
          keysJustPressed.delete(" ");
          if (meleeAttackState.cooldown <= 0 && !meleeAttackState.buttonDown) {
            queueBasicMeleeAttack(getMeleeAttackDirection(), meleeAttackState);
            player.state = "attackMelee";
            player.animator?.play("attackMelee", { restart: true });
          }
        }
      }
      if (meleeAttackState.isRushing) {
        updateRushMovement(dt, direction, meleeAttackState);
      }
    }

    if (meleeAttackState.blankaRollActive) {
      updateBlankaRoll(dt);
    }

    if (meleeAttackState.thrashFlurryActive) {
      updateThrashFlurry(dt, meleeAttackState);
      keysJustPressed.delete("ArrowDown");
      keysJustPressed.delete("ArrowLeft");
      keysJustPressed.delete(" ");
      return;
    }

    // A-cancel for Crash/Clash: pressing A during the dash stops it and fires a melee (same pattern as Thrash → A)
    if (playerDashState.isDashing && playerDashState.crashDashActive) {
      const aJustPressed = keysJustPressed.has("ArrowLeft") || keysJustPressed.has(" ");
      if (aJustPressed) {
        playerDashState.isDashing = false;
        playerDashState.isHolyDash = false;
        playerDashState.crashDashActive = false;
        playerDashState.crashDashHitEntities = null;
        playerDashState.crashDashDamage = 0;
        if (window._meleeAttackState) {
          window._meleeAttackState.swooshDamageEnabled = false;
          window._meleeAttackState.swooshHitEntities = null;
          window._meleeAttackState.clashVisualActive = false;
        }
        setSharedBButtonCooldown(DASH_COOLDOWN);
        if (player) player.ignoreEntityCollisions = false;
        meleeAttackState.cooldown = 0;
        meleeAttackState.lastComboTimes.B = 0;
        keysJustPressed.delete("ArrowLeft");
        keysJustPressed.delete(" ");
        if (meleeAttackState.cooldown <= 0 && !meleeAttackState.buttonDown) {
          queueBasicMeleeAttack(getMeleeAttackDirection(), meleeAttackState);
          player.state = "attackMelee";
          player.animator?.play("attackMelee", { restart: true });
        }
      }
    }

    const trashActive = Boolean(meleeAttackState.blankaRollActive);
    if (!rushCancelledIntoMove && (meleeAttackState.isRushing || meleeAttackState.rushJustEnded) && !trashActive) {
      keysJustPressed.delete("ArrowDown");
      keysJustPressed.delete("ArrowLeft");
      keysJustPressed.delete(" ");
      if (meleeAttackState.isRushing && meleeAttackState.lastComboTimes) {
        meleeAttackState.lastComboTimes.A = 0;
        meleeAttackState.lastComboTimes.B = 0;
      }
    }

    if (meleeAttackState.ringFireActive) {
      updateRingOfFireMotion(dt, meleeAttackState);
      keysJustPressed.delete("ArrowDown");
      keysJustPressed.delete("ArrowLeft");
      keysJustPressed.delete(" ");
    }

    if (meleeAttackState.spinTimer > 0) {
      let spinDamageTotal = 0;
      let spinSurvivorHit = false;
      if (
        meleeAttackState.spinMoveDir &&
        meleeAttackState.spinMoveDistanceRemaining > 0 &&
        player
      ) {
        const dir = meleeAttackState.spinMoveDir;
        const movement = Math.min(
          meleeAttackState.spinMoveDistanceRemaining,
          SPIN_MOVE_SPEED * dt,
        );
        player.x += dir.x * movement;
        player.y += dir.y * movement;
        resolveEntityObstacles(player);
        clampEntityToBounds(player);
        if (player.lockedPosition) {
          player.lockedPosition.x = player.x;
          player.lockedPosition.y = player.y;
        }
        meleeAttackState.spinMoveDistanceRemaining -= movement;
        if (meleeAttackState.spinMoveDistanceRemaining <= 0) {
          meleeAttackState.spinMoveDistanceRemaining = 0;
          meleeAttackState.spinMoveDir = null;
        }
      }
      const duration = Math.max(0.001, meleeAttackState.spinDuration || MELEE_SPIN_DURATION);
      const progress = 1 - Math.min(1, meleeAttackState.spinTimer / duration);
      const angle = progress * Math.PI * 2;
      const targetLength = (meleeAttackState.swingLength ?? MELEE_SWING_LENGTH) * WORLD_SCALE;
      const swooshImg = assets?.effects?.meleeSwoosh;
      let drawWidth = targetLength;
      let drawHeight = targetLength * 0.6 * MELEE_SWOOSH_ARC_SCALE;
      if (swooshImg) {
        const swingScale = meleeAttackState.swingScale ?? targetLength / Math.max(1, swooshImg.width);
        drawWidth = swooshImg.width * swingScale;
        drawHeight = swooshImg.height * swingScale * MELEE_SWOOSH_ARC_SCALE;
      }
      const hitSet = meleeAttackState.spinHitEntities || new Set();
      meleeAttackState.spinHitEntities = hitSet;
      const spinHitboxType = String(meleeAttackState.currentAttackHitboxType || "");
      const spinMoveName = spinHitboxType === "holyGround" ? MOVE_NAME_AC_SUPER : "Reap";
      const spinMoveMultiplier = getMoveMultiplier(spinMoveName);
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      enemies.forEach((enemy) => {
        if (enemy.dead || enemy.state === "death") return;
        if (hitSet.has(enemy)) return;
        const relX = enemy.x - player.x;
        const relY = enemy.y - player.y;
        const localX = relX * cos - relY * sin;
        const localY = relX * sin + relY * cos;
        const hitRadius = getEnemyHitboxRadius(enemy) || enemy.radius || 0;
        const hit = circleIntersectsRect(localX, localY, hitRadius, {
          x: 0,
          y: -drawHeight * 0.5,
          width: drawWidth,
          height: drawHeight,
        });
        if (!hit) return;
        hitSet.add(enemy);
        const counterHit = getCounterHitResult(
          enemy,
          MELEE_BASE_DAMAGE * MELEE_SPIN_DAMAGE_MULTIPLIER * spinMoveMultiplier,
          meleeAttackState,
        );
        const spinDamage = counterHit.damage;
        enemy.takeDamage(spinDamage, { damageType: "charged", damageText: counterHit.damageText });
        applyMeleeHitstop(enemy, meleeAttackState, counterHit);
        registerPunishComboDamage(enemy, spinDamage, meleeAttackState);
        registerMeleeComboHit(enemy, meleeAttackState, null, {
          damage: spinDamage,
          isCounterHit: Boolean(counterHit?.isCounterHit),
          isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
        });
        registerChainHit(enemy, spinDamage);
        spinDamageTotal += spinDamage;
        if (!enemy.dead && enemy.state !== "death") {
          applyEnemyMeleeKnockback(enemy, player.x, player.y, MELEE_DAMAGE_KNOCKBACK);
          spinSurvivorHit = true;
        }
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (
          !meleeAttackState.divineComboShown &&
          meleeAttackState.divineComboDamage > 0 &&
          meleeAttackState.divineComboActiveUntil &&
          now <= meleeAttackState.divineComboActiveUntil &&
          meleeAttackState.divineComboTarget === enemy &&
          enemy.state === "hurt"
        ) {
          const hits = Math.max(2, (meleeAttackState.divineComboHits || 1) + 1);
          showComboTextAt(enemy, meleeAttackState.divineComboDamage + spinDamage, hits);
          meleeAttackState.divineComboShown = true;
          meleeAttackState.divineComboActiveUntil = 0;
          meleeAttackState.divineComboDamage = 0;
          meleeAttackState.divineComboTarget = null;
          meleeAttackState.divineComboHits = 0;
          meleeAttackState.rushComboShown = true;
          meleeAttackState.rushComboActiveUntil = 0;
          meleeAttackState.rushComboDamage = 0;
        } else
        if (
          meleeAttackState.comboDamage > 0 &&
          meleeAttackState.comboActiveUntil &&
          now <= meleeAttackState.comboActiveUntil &&
          !meleeAttackState.comboShown
        ) {
          showComboTextAt(enemy, meleeAttackState.comboDamage + spinDamage, 2, spinDamage);
          meleeAttackState.comboShown = true;
          meleeAttackState.comboActiveUntil = 0;
          meleeAttackState.comboDamage = 0;
        }
        spawnEnemyHitEffect(enemy);
        if (typeof playEnemyHitSfx === "function") {
          playEnemyHitSfx(0.6);
        }
      });
      if (activeBoss && !activeBoss.dead && !activeBoss.defeated && !activeBoss.removed) {
        if (!hitSet.has(activeBoss)) {
          const relX = activeBoss.x - player.x;
          const relY = activeBoss.y - player.y;
          const localX = relX * cos - relY * sin;
          const localY = relX * sin + relY * cos;
          const hitRadius = activeBoss.radius || 0;
          const hit = circleIntersectsRect(localX, localY, hitRadius, {
            x: 0,
            y: -drawHeight * 0.5,
            width: drawWidth,
            height: drawHeight,
          });
          if (hit) {
            hitSet.add(activeBoss);
            const counterHit = getCounterHitResult(
              activeBoss,
              MELEE_BASE_DAMAGE * MELEE_SPIN_DAMAGE_MULTIPLIER * spinMoveMultiplier,
              meleeAttackState,
            );
            const spinDamage = counterHit.damage;
            activeBoss.takeDamage(spinDamage, {
              hitX: activeBoss.x,
              hitY: activeBoss.y,
              damageType: "charged",
              damageText: counterHit.damageText,
            });
            applyMeleeHitstop(activeBoss, meleeAttackState, counterHit);
            registerPunishComboDamage(activeBoss, spinDamage, meleeAttackState);
            registerMeleeComboHit(activeBoss, meleeAttackState, null, {
              damage: spinDamage,
              isCounterHit: Boolean(counterHit?.isCounterHit),
              isPunishCounter: Boolean(counterHit?.isPunishCounter),
      baseDamage: Math.max(0, Math.round(Number(counterHit?.baseDamage) || 0)),
            });
            registerChainHit(activeBoss, spinDamage);
            spinDamageTotal += spinDamage;
            if (typeof activeBoss.knockbackVx === "number") {
              applyEnemyMeleeKnockback(activeBoss, player.x, player.y, MELEE_DAMAGE_KNOCKBACK);
            }
            if (!activeBoss.dead && !activeBoss.defeated) {
              spinSurvivorHit = true;
            }
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            if (
              !meleeAttackState.divineComboShown &&
              meleeAttackState.divineComboDamage > 0 &&
              meleeAttackState.divineComboActiveUntil &&
              now <= meleeAttackState.divineComboActiveUntil &&
              meleeAttackState.divineComboTarget === activeBoss &&
              activeBoss.state === "hurt"
            ) {
              const hits = Math.max(2, (meleeAttackState.divineComboHits || 1) + 1);
              showComboTextAt(activeBoss, meleeAttackState.divineComboDamage + spinDamage, hits);
              meleeAttackState.divineComboShown = true;
              meleeAttackState.divineComboActiveUntil = 0;
              meleeAttackState.divineComboDamage = 0;
              meleeAttackState.divineComboTarget = null;
              meleeAttackState.divineComboHits = 0;
              meleeAttackState.rushComboShown = true;
              meleeAttackState.rushComboActiveUntil = 0;
              meleeAttackState.rushComboDamage = 0;
            } else
            if (
              meleeAttackState.comboDamage > 0 &&
              meleeAttackState.comboActiveUntil &&
              now <= meleeAttackState.comboActiveUntil &&
              !meleeAttackState.comboShown
            ) {
              showComboTextAt(activeBoss, meleeAttackState.comboDamage + spinDamage, 2, spinDamage);
              meleeAttackState.comboShown = true;
              meleeAttackState.comboActiveUntil = 0;
              meleeAttackState.comboDamage = 0;
            }
            spawnEnemyHitEffect(activeBoss);
            if (typeof playEnemyHitSfx === "function") {
              playEnemyHitSfx(0.6);
            }
          }
        }
      }
      if (spinSurvivorHit) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        meleeAttackState.spinComboDamage = spinDamageTotal;
        meleeAttackState.spinComboActiveUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
        meleeAttackState.spinComboShown = false;
      }
    }
    const dir = getMeleeAttackDirection();
    if (spinJustEnded && meleeAttackState.spinComboDamage > 0 && !meleeAttackState.spinComboShown) {
      meleeAttackState.spinComboActiveUntil = now + MELEE_DOUBLE_TAP_WINDOW * 1000;
    }
    if (spinJustEnded && meleeAttackState.spinMeleeQueued) {
      meleeAttackState.spinMeleeQueued = false;
      if (!meleeAttackState.isCharging && player) {
        queueBasicMeleeAttack(dir, meleeAttackState);
        player.state = "attackMelee";
        player.animator.play("attackMelee", { restart: true });
      }
    }

    const comboSwipe = input?.consumeComboSwipe?.();
    let comboTriggered = false;
    const holdAForAbc = Math.max(0.001, meleeAttackState.holdTime || 0);
    const holdBForAbc = Math.max(0.001, meleeAttackState.spinHoldTime || 0);
    const aFull =
      Boolean(meleeAttackState.buttonDown && meleeAttackState.isCharging) &&
      (meleeAttackState.chargeTimer || 0) >= holdAForAbc;
    const bFull =
      Boolean(meleeAttackState.spinButtonDown && meleeAttackState.spinCharging) &&
      (meleeAttackState.spinChargeTimer || 0) >= holdBForAbc;
    const cHeldForAbc = keysPressed.has("ArrowRight");
    updateChargedCConsumedByCombo(meleeAttackState);
    // Tell the touch buttons which buttons are fully charged, so they can glow
    // and treat a slide as "Charge X + Y" instead of "X then Y".
    if (typeof window !== "undefined") {
      const cFull = Boolean(
        cHeldForAbc &&
        player &&
        (player.prayerHoldLocked ||
          Number(player.prayerHoldTimer || 0) >= (Number(PRAYER_BOMB_HOLD_TIME) || 1.0) - 0.02),
      );
      const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
      window.__battlechurchChargeReady = {
        A: Boolean(aFull),
        B: Boolean(bFull),
        C: cFull,
        // 0..1 charge meter for each button (drives the touch-button rings).
        progress: {
          A: meleeAttackState.buttonDown && meleeAttackState.isCharging
            ? clamp01((meleeAttackState.chargeTimer || 0) / holdAForAbc)
            : 0,
          B: meleeAttackState.spinButtonDown && meleeAttackState.spinCharging
            ? clamp01((meleeAttackState.spinChargeTimer || 0) / holdBForAbc)
            : 0,
          C: cHeldForAbc
            ? (cFull ? 1 : clamp01(Number(player?.prayerHoldTimer || 0) / (Number(PRAYER_BOMB_HOLD_TIME) || 1.0)))
            : 0,
        },
        at: typeof performance !== "undefined" ? performance.now() : Date.now(),
      };
    }
    const fullPrayerReadyNow =
      Number(player?.prayerCharge || 0) >= Number(player?.prayerChargeRequired || 6000);
    const abcHoldReadyNow = Boolean(aFull && bFull && cHeldForAbc && fullPrayerReadyNow);
    // Prevent stale combo-intercept flags from suppressing Charged-C Purify input.
    if (!(meleeAttackState.buttonDown && meleeAttackState.isCharging)) {
      meleeAttackState.acSuperArmed = false;
    }
    const cJustReleasedForAbc = !cHeldForAbc && Boolean(meleeAttackState.abcPrevCHeld);
    meleeAttackState.abcPrevCHeld = cHeldForAbc;
    if (abcHoldReadyNow) {
      // Hard-priority gate: once full A+B+C is armed, suppress other release branches.
      meleeAttackState.abcSmiteArmed = true;
      meleeAttackState.abcSmitePendingRelease = true;
      meleeAttackState.abSuperArmed = false;
      meleeAttackState.acSuperArmed = false;
      meleeAttackState.bcTeleportArmed = false;
      if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
      comboTriggered = true;
    }
    const abcReleaseReadyNow =
      Boolean(cJustReleasedForAbc && aFull && bFull && fullPrayerReadyNow);
    const purifyReleaseReadyNow =
      Boolean(
        cJustReleasedForAbc &&
        !aFull &&
        !bFull &&
        player &&
        (
          Boolean(player.prayerHoldLocked) ||
          (Number(player.prayerHoldTimer || 0) >= (Number(PRAYER_BOMB_HOLD_TIME) || 1.0) - 0.02)
        ) &&
        (player.getPrayerChargeRatio?.() || 0) >=
          (typeof PRAYER_BOMB_LEVEL1_THRESHOLD === "number" ? PRAYER_BOMB_LEVEL1_THRESHOLD : 0.5) &&
        typeof player.castPrayerBomb === "function" &&
        !meleeAttackState.isRushing &&
        !playerDashState.isDashing,
      );
    if (abcReleaseReadyNow && typeof player?.castPrayerBomb === "function") {
      if (typeof cancelCongregationTap === "function") cancelCongregationTap();
      if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
      const casted = player.castPrayerBomb({ forceLevel3: true, allowWhileInvulnerable: true });
      if (casted) {
        meleeAttackState.abcSmiteArmed = false;
        meleeAttackState.abcSmitePendingRelease = false;
        meleeAttackState.abcSmiteLatch = false;
        window.FloatingText?.heroSay?.("Prayer Storm");
        window.showMoveBanner?.("Prayer Storm");
        meleeAttackState.buttonDown = false;
        meleeAttackState.isCharging = false;
        meleeAttackState.chargeTimer = 0;
        meleeAttackState.spinButtonDown = false;
        meleeAttackState.spinCharging = false;
        meleeAttackState.spinChargeTimer = 0;
        meleeAttackState.abSuperArmed = false;
        meleeAttackState.acSuperArmed = false;
        meleeAttackState.acSuperPrayerBombBlockTimer = 0;
        meleeAttackState.bcTeleportArmed = false;
        meleeAttackState.bcTeleportBlockTimer = 0;
        meleeAttackState.cBHolyDashBlockTimer = 0;
        meleeAttackState.holyDashArmUntil = 0;
        if (meleeAttackState.lastComboTimes) {
          meleeAttackState.lastComboTimes.A = 0;
          meleeAttackState.lastComboTimes.B = 0;
          meleeAttackState.lastComboTimes.C = 0;
        }
        clearDivineChargeSparkVisual();
        keysJustPressed.delete("ArrowRight");
        keysJustPressed.delete("ArrowDown");
        keysJustPressed.delete("ArrowLeft");
        keysJustPressed.delete(" ");
        return;
      }
    } else if (purifyReleaseReadyNow && !meleeAttackState.cConsumedByCombo) {
      if (typeof cancelCongregationTap === "function") cancelCongregationTap();
      if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
      const casted = player.castPrayerBomb({ allowWhileInvulnerable: true });
      if (casted) {
        window.FloatingText?.heroSay?.("Purify");
        window.showMoveBanner?.("Purify");
        keysJustPressed.delete("ArrowRight");
        comboTriggered = true;
      }
    }
    // Allow Charged-C Purify to fire during Trash lifetime without relying on click-queue plumbing.
    if (
      cJustReleasedForAbc &&
      !meleeAttackState.cConsumedByCombo &&
      meleeAttackState.blankaRollActive &&
      meleeAttackState.blankaRollSawCHeld === true &&
      ((typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - (Number(meleeAttackState.blankaRollStartedAt) || 0)) > 120 &&
      !meleeAttackState.abcSmitePendingRelease &&
      !meleeAttackState.abcSmiteArmed &&
      !playerDashState.isDashing &&
      player &&
      typeof player.castPrayerBomb === "function"
    ) {
      const castedDuringTrash = player.castPrayerBomb({ allowWhileInvulnerable: true });
      if (castedDuringTrash) {
        window.FloatingText?.heroSay?.("Purify");
        window.showMoveBanner?.("Purify");
        comboTriggered = true;
      }
    }
    if (cJustReleasedForAbc) {
      meleeAttackState.holyDashArmUntil = now + HOLY_DASH_COMBO_WINDOW * 1000;
      if (
        meleeAttackState.cbClashPendingOnCRelease &&
        !meleeAttackState.isRushing &&
        !playerDashState.isDashing &&
        player &&
        (player.prayerCharge || 0) >= ((player.prayerChargeRequired || 6000) / 12)
      ) {
        const holyDir = getDashButtonDirection();
        if (forceStartHolyDash(holyDir, DASH_DISTANCE * 2.5 + 200 * WORLD_SCALE)) {
          if (typeof cancelCongregationTap === "function") cancelCongregationTap();
          player.prayerCharge = Math.max(0, (player.prayerCharge || 0) - ((player.prayerChargeRequired || 6000) / 12));
          playerYell("Clash");
          showMoveBanner("Clash");
          registerComboMoveName(meleeAttackState, "Clash");
          meleeAttackState.clashVisualActive = true;
          keysJustPressed.delete("ArrowDown");
          meleeAttackState.cBHolyDashBlockTimer = 0.5;
          meleeAttackState.cbClashPendingOnCRelease = false;
          comboTriggered = true;
        }
      } else {
        meleeAttackState.cbClashPendingOnCRelease = false;
      }
    }
    const aHeldForAbc = Boolean(meleeAttackState.buttonDown);
    const bHeldForAbc = Boolean(meleeAttackState.spinButtonDown);
    const allThreeHeldForAbc = aHeldForAbc && bHeldForAbc && cHeldForAbc;
    const fullPrayerReady = fullPrayerReadyNow;
    if (!allThreeHeldForAbc) {
      meleeAttackState.abcSmiteLatch = false;
    }
    const abcChargeReady =
      !meleeAttackState.isRushing &&
      !playerDashState.isDashing &&
      aFull &&
      bFull &&
      allThreeHeldForAbc &&
      fullPrayerReady;
    if (abcChargeReady) {
      meleeAttackState.abcSmiteArmed = true;
      meleeAttackState.abcSmitePendingRelease = true;
    }
    if (
      meleeAttackState.abcSmitePendingRelease &&
      cJustReleasedForAbc &&
      !meleeAttackState.isRushing &&
      !playerDashState.isDashing
    ) {
      if (typeof cancelCongregationTap === "function") cancelCongregationTap();
      if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
      const casted = typeof player?.castPrayerBomb === "function"
        ? player.castPrayerBomb({ forceLevel3: true, allowWhileInvulnerable: true })
        : false;
      meleeAttackState.abcSmiteArmed = false;
      meleeAttackState.abcSmitePendingRelease = false;
      if (casted) {
        meleeAttackState.abcSmiteLatch = false;
        window.FloatingText?.heroSay?.("Prayer Storm");
        window.showMoveBanner?.("Prayer Storm");
        meleeAttackState.buttonDown = false;
        meleeAttackState.isCharging = false;
        meleeAttackState.chargeTimer = 0;
        meleeAttackState.spinButtonDown = false;
        meleeAttackState.spinCharging = false;
        meleeAttackState.spinChargeTimer = 0;
        meleeAttackState.abSuperArmed = false;
        meleeAttackState.acSuperArmed = false;
        meleeAttackState.acSuperPrayerBombBlockTimer = 0;
        meleeAttackState.bcTeleportArmed = false;
        meleeAttackState.bcTeleportBlockTimer = 0;
        meleeAttackState.cBHolyDashBlockTimer = 0;
        meleeAttackState.holyDashArmUntil = 0;
        if (meleeAttackState.lastComboTimes) {
          meleeAttackState.lastComboTimes.A = 0;
          meleeAttackState.lastComboTimes.B = 0;
          meleeAttackState.lastComboTimes.C = 0;
        }
        clearDivineChargeSparkVisual();
        keysJustPressed.delete("ArrowRight");
        keysJustPressed.delete("ArrowDown");
        keysJustPressed.delete("ArrowLeft");
        keysJustPressed.delete(" ");
        return;
      }
    }
    if (meleeAttackState.abcSmitePendingRelease && allThreeHeldForAbc) {
      // Keep other combo resolvers from claiming this input stack.
      comboTriggered = true;
    }
    const abcStateActive = Boolean(
      meleeAttackState.abcSmitePendingRelease || meleeAttackState.abcSmiteArmed,
    );
    const comboRush =
      (!meleeAttackState.isRushing &&
        !meleeAttackState.ringFireActive &&
        !abcStateActive &&
        !keysPressed.has("ArrowRight") &&
        !(meleeAttackState.spinCharging && !comboRushKeyOrder) &&
        !(meleeAttackState.spinButtonDown && !comboRushKeyOrder) &&
        meleeAttackState.rushLockTimer <= 0 &&
        playerDashState.dashCooldown <= 0 &&
        !playerDashState.isDashing &&
        (comboRushKeyOrder ||
          (comboSwipe && comboSwipe.from === "B" && comboSwipe.to === "A")));
    if (comboRush && !comboTriggered) {
      playerDashState.pendingDashTimer = 0;
      meleeAttackState.spinButtonDown = false;
      meleeAttackState.spinCharging = false;
      meleeAttackState.spinChargeTimer = 0;
      const startedRush = executeRushAttack(getDashButtonDirection(), meleeAttackState, {
        bypassCooldown: true,
      });
      if (startedRush) {
        meleeAttackState.awaitRush = false;
        meleeAttackState.awaitTimer = 0;
        meleeAttackState.rushBypassUntil = 0;
        keysJustPressed.delete("ArrowLeft");
        keysJustPressed.delete(" ");
        comboTriggered = true;
      }
    }
    const holyDashCost = player ? (player.prayerChargeRequired || 6000) / 12 : 5;
    // C/B Holy Dash mirrors the working B/A style:
    // detect ordered key timing (C then B) and require C not currently held.
    const bJustPressedRaw = keysJustPressed.has("ArrowDown");
    const holyDashArmed =
      Number.isFinite(meleeAttackState.holyDashArmUntil) &&
      now <= meleeAttackState.holyDashArmUntil;
    const comboHolyDashOrder = holyDashArmed && !cCurrentlyHeld;
    const comboHolyDashSwipe = comboSwipe && comboSwipe.from === "C" && comboSwipe.to === "B";
    const comboHolyDash =
      !comboTriggered &&
      !abcStateActive &&
      !playerDashState.isDashing &&
      !meleeAttackState.isRushing &&
      player &&
      (player.prayerCharge || 0) >= holyDashCost &&
      (
        (comboHolyDashOrder && bJustPressedRaw) ||
        comboHolyDashSwipe
      );
    if (comboHolyDash) {
      const holyDir = getDashButtonDirection();
      if (forceStartHolyDash(holyDir, DASH_DISTANCE * 2.5 + 200 * WORLD_SCALE)) {
        if (typeof cancelCongregationTap === "function") cancelCongregationTap();
        player.prayerCharge = Math.max(0, (player.prayerCharge || 0) - holyDashCost);
        playerYell("Clash");
        showMoveBanner("Clash");
        registerComboMoveName(meleeAttackState, "Clash");
        meleeAttackState.clashVisualActive = true;
        meleeAttackState.holyDashArmUntil = 0;
        keysJustPressed.delete("ArrowDown");
        meleeAttackState.cBHolyDashBlockTimer = 0.5;
        comboTriggered = true;
      }
    }
    const comboDoubleStrike =
      !comboTriggered &&
      !abcStateActive &&
      comboDoubleStrikeOrder &&
      !meleeAttackState.isRushing &&
      !meleeAttackState.spinButtonDown &&
      playerDashState.dashCooldown <= 0;
    if (comboDoubleStrike) {
      executeCleaveAttack(dir, meleeAttackState);
      meleeAttackState.lastComboTimes.A = 0;
      meleeAttackState.lastComboTimes.B = 0;
      setSharedBButtonCooldown(DASH_COOLDOWN);
      keysJustPressed.delete("ArrowDown");
      comboTriggered = true;
    }
    const prayerStrikeCost = player ? (player.prayerChargeRequired || 6000) / 6 : 5;
    const comboPrayerStrike =
      !comboTriggered &&
      !abcStateActive &&
      comboPrayerStrikeOrder &&
      !meleeAttackState.isRushing &&
      !meleeAttackState.spinCharging &&
      !meleeAttackState.spinButtonDown &&
      meleeAttackState.spinTimer <= 0 &&
      meleeAttackState.rushLockTimer <= 0 &&
      player &&
      (player.prayerCharge || 0) >= prayerStrikeCost;
    if (comboPrayerStrike) {
      meleeAttackState.lastComboTimes.C = 0;
      meleeAttackState.lastComboTimes.A = 0;
      if (typeof cancelCongregationTap === "function") cancelCongregationTap();
      player.prayerCharge = Math.max(0, (player.prayerCharge || 0) - prayerStrikeCost);
      executeSpinAttack(meleeAttackState, null);
      meleeAttackState.swingLength = MELEE_SWING_LENGTH_BASE * 1.5;
      keysJustPressed.delete("ArrowLeft");
      keysJustPressed.delete(" ");
      comboTriggered = true;
    }
    const bJustPressed = keysJustPressed.has("ArrowDown") && (!meleeAttackState.isRushing || trashActive) && !meleeAttackState.ringFireActive;
    const bHeld = keysPressed.has("ArrowDown") && (!meleeAttackState.isRushing || trashActive) && !meleeAttackState.ringFireActive;
    if (bJustPressed && !meleeAttackState.spinButtonDown && !comboTriggered) {
      meleeAttackState.cbHeldAtBPress = Boolean(keysPressed.has("ArrowRight"));
      const clashPreempt =
        !abcStateActive &&
        !playerDashState.isDashing &&
        holyDashArmed &&
        !keysPressed.has("ArrowRight") &&
        player &&
        (player.prayerCharge || 0) >= holyDashCost;
      if (clashPreempt) {
        const holyDir = getDashButtonDirection();
        if (forceStartHolyDash(holyDir, DASH_DISTANCE * 2.5 + 200 * WORLD_SCALE)) {
          if (typeof cancelCongregationTap === "function") cancelCongregationTap();
          player.prayerCharge = Math.max(0, (player.prayerCharge || 0) - holyDashCost);
          playerYell("Clash");
          showMoveBanner("Clash");
          registerComboMoveName(meleeAttackState, "Clash");
          meleeAttackState.clashVisualActive = true;
          meleeAttackState.holyDashArmUntil = 0;
          keysJustPressed.delete("ArrowDown");
          meleeAttackState.cBHolyDashBlockTimer = 0.5;
          comboTriggered = true;
        }
      }
      if (comboTriggered) {
        // Clash consumed B press; do not enter normal B dash/charge pipeline.
        return;
      }
      const startedCancelRush =
        meleeAttackState.meleeCancelUntil &&
        now <= meleeAttackState.meleeCancelUntil &&
        executeRushAttack(getDashButtonDirection(), meleeAttackState);
      if (startedCancelRush) {
        meleeAttackState.spinCharging = false;
        meleeAttackState.spinButtonDown = false;
        meleeAttackState.spinChargeTimer = 0;
      } else {
      meleeAttackState.spinButtonDown = true;
      meleeAttackState.spinCharging = true;
      meleeAttackState.spinChargeTimer = 0;
      meleeAttackState.spinChargeFlashTriggered = false;
      playerDashState.pendingDashTimer = 0;
      playerDashState.pendingDashDir = null;
      if (keysPressed.has("ArrowRight") && typeof cancelCongregationTap === "function") cancelCongregationTap();
      }
    }
    if (meleeAttackState.spinButtonDown && bHeld && meleeAttackState.spinCharging) {
      meleeAttackState.spinChargeTimer += dt;
      const rollCost = player ? (player.prayerChargeRequired || 6000) / 6 : 20;
      const bFullyCharged = meleeAttackState.spinChargeTimer >= (meleeAttackState.spinHoldTime || 0);
      const cHeld = keysPressed.has("ArrowRight");
      const hasPrayerForRoll = player && (player.prayerCharge || 0) >= rollCost;
      if (!meleeAttackState.bcTeleportArmed && bFullyCharged && cHeld && hasPrayerForRoll) {
        meleeAttackState.bcTeleportArmed = true;
        showDualChargeReadyPreview(meleeAttackState, "Trash");
        if (typeof cancelCongregationTap === "function") cancelCongregationTap();
      }
    }
    if (!abcStateActive && meleeAttackState.spinButtonDown && !bHeld) {
      const fullyCharged = meleeAttackState.spinChargeTimer >= meleeAttackState.spinHoldTime;
      const cHeldOnBRelease = keysPressed.has("ArrowRight");
      const cHeldAtBPress = Boolean(meleeAttackState.cbHeldAtBPress);
      const holdAForAbcOnBRelease = Math.max(0.001, meleeAttackState.holdTime || 0);
      const aFullOnBRelease =
        Boolean(meleeAttackState.buttonDown && meleeAttackState.isCharging) &&
        (meleeAttackState.chargeTimer || 0) >= holdAForAbcOnBRelease;
      const fullPrayerReadyOnBRelease =
        Number(player?.prayerCharge || 0) >= Number(player?.prayerChargeRequired || 6000);
      const abcFullIntentOnBRelease =
        Boolean(fullyCharged && cHeldOnBRelease && aFullOnBRelease && fullPrayerReadyOnBRelease);
      const rollCost = player ? (player.prayerChargeRequired || 6000) / 6 : 40;
      const hasPrayerForRoll = player && (player.prayerCharge || 0) >= rollCost;
      const shouldRoll = meleeAttackState.bcTeleportArmed ||
        (fullyCharged && cHeldOnBRelease && hasPrayerForRoll);
      const abcIntentActiveOnBRelease =
        Boolean(cHeldAtBPress || cHeldOnBRelease) &&
        Number(player?.prayerCharge || 0) >= Number(player?.prayerChargeRequired || 6000);
      const canABSuper = Boolean(meleeAttackState.abSuperArmed) &&
        !meleeAttackState.abcSmitePendingRelease &&
        !meleeAttackState.abcSmiteArmed &&
        !abcIntentActiveOnBRelease;
      meleeAttackState.abSuperArmed = false;
      meleeAttackState.spinButtonDown = false;
      if (meleeAttackState.spinCharging) {
        meleeAttackState.spinCharging = false;
        if (abcFullIntentOnBRelease) {
          // Prioritize full A+B+C path over B+C Thrash path.
          meleeAttackState.abcSmiteArmed = true;
          meleeAttackState.abcSmitePendingRelease = true;
          if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
          comboTriggered = true;
        } else if (canABSuper) {
          // Cancel A charge so it doesn't also fire independently
          meleeAttackState.isCharging = false;
          meleeAttackState.buttonDown = false;
          meleeAttackState.chargeTimer = 0;
          meleeAttackState.acSuperArmed = false;
          clearDivineChargeSparkVisual();
          executeSwordRush(meleeAttackState);
        } else if (shouldRoll) {
          executeBlankaRoll(meleeAttackState);
        } else if (cHeldAtBPress && !fullyCharged) {
          const clashCost = player ? (player.prayerChargeRequired || 6000) / 12 : 5;
          if (!cHeldOnBRelease && player && (player.prayerCharge || 0) >= clashCost) {
            const holyDir = getDashButtonDirection();
            if (forceStartHolyDash(holyDir, DASH_DISTANCE * 2.5 + 200 * WORLD_SCALE)) {
              if (typeof cancelCongregationTap === "function") cancelCongregationTap();
              player.prayerCharge = Math.max(0, (player.prayerCharge || 0) - clashCost);
              playerYell("Clash");
              showMoveBanner("Clash");
              registerComboMoveName(meleeAttackState, "Clash");
              meleeAttackState.clashVisualActive = true;
              meleeAttackState.cBHolyDashBlockTimer = 0.5;
            }
          } else {
            meleeAttackState.cbClashPendingOnCRelease = true;
          }
        } else if (fullyCharged) {
          executeProtectedDash(meleeAttackState);
        } else if (!meleeAttackState.isRushing) {
          if (tryStartDash(getDashButtonDirection())) {
            showMoveBanner("Dash");
          }
        }
      }
      meleeAttackState.cbHeldAtBPress = false;
      meleeAttackState.bcTeleportArmed = false;
      if (!meleeAttackState.isCharging) {
        clearDivineChargeSparkVisual();
      }
      meleeAttackState.spinChargeTimer = 0;
    }
    const spaceJustPressed =
      (keysJustPressed.has(" ") || keysJustPressed.has("ArrowLeft")) &&
      (!meleeAttackState.isRushing || trashActive) &&
      !meleeAttackState.ringFireActive &&
      meleeAttackState.rushLockTimer <= 0;
    const spaceHeld = (keysPressed.has(" ") || keysPressed.has("ArrowLeft")) && (!meleeAttackState.isRushing || trashActive) && !meleeAttackState.ringFireActive;
    const rushLockActive = meleeAttackState.rushLockTimer > 0;
    const rushBypassActive =
      meleeAttackState.rushBypassUntil && now <= meleeAttackState.rushBypassUntil;
    if (meleeAttackState.awaitRush || rushBypassActive) {
      meleeAttackState.awaitTimer -= dt;
      if (meleeAttackState.awaitTimer <= 0) {
        meleeAttackState.awaitRush = false;
        meleeAttackState.awaitTimer = 0;
        meleeAttackState.rushBypassUntil = 0;
      }
    }

    if (spaceJustPressed && !meleeAttackState.buttonDown && !rushLockActive) {
      meleeAttackState.acSuperArmed = false;
      if (meleeAttackState.spinTimer > 0) {
        const attemptedSpinToRush =
          comboRushKeyOrder &&
          !meleeAttackState.isRushing &&
          executeRushAttack(getDashButtonDirection(), meleeAttackState, {
            bypassCooldown: true,
          });
        if (attemptedSpinToRush) {
          meleeAttackState.awaitRush = false;
          meleeAttackState.awaitTimer = 0;
          meleeAttackState.rushBypassUntil = 0;
          keysJustPressed.delete("ArrowLeft");
          keysJustPressed.delete(" ");
          comboTriggered = true;
        } else {
          meleeAttackState.spinTimer = 0;
          meleeAttackState.spinMoveDir = null;
          meleeAttackState.spinMoveDistanceRemaining = 0;
          meleeAttackState.spinHitEntities = new Set();
          meleeAttackState.spinMeleeQueued = false;
          if (player && !meleeAttackState.isRushing) {
            queueBasicMeleeAttack(dir, meleeAttackState);
            player.state = "attackMelee";
            player.animator.play("attackMelee", { restart: true });
          }
        }
      } else {
      if (playerDashState.isDashing) {
        applyMeleeInvulnerability(
          meleeAttackState,
          "swoosh",
          getDashSwooshInvulnerabilityDuration(),
        );
      }
      if (player && player.animator) {
        player.state = "attackMelee";
        player.animator.play("attackMelee", { restart: true });
      }
      meleeAttackState.buttonDown = true;
      meleeAttackState.chargeTimer = 0;
      meleeAttackState.isCharging = true;
      meleeAttackState.chargeFlashTriggered = false;
      }
    }
    if (!abcStateActive && !spaceHeld && meleeAttackState.buttonDown) {
      meleeAttackState.buttonDown = false;
      const fullyCharged = meleeAttackState.chargeTimer >= meleeAttackState.holdTime;
      const divineShotFollowUpActive =
        meleeAttackState.divineShotFollowUpUntil &&
        now <= meleeAttackState.divineShotFollowUpUntil;
      if (meleeAttackState.isCharging) {
        meleeAttackState.isCharging = false;
        clearDivineChargeSparkVisual();
        const abcIntentActiveOnARelease =
          keysPressed.has("ArrowRight") &&
          Number(player?.prayerCharge || 0) >= Number(player?.prayerChargeRequired || 6000);
        const canABSuper = Boolean(meleeAttackState.abSuperArmed) &&
          !meleeAttackState.abcSmitePendingRelease &&
          !meleeAttackState.abcSmiteArmed &&
          !abcIntentActiveOnARelease;
        meleeAttackState.abSuperArmed = false;
        const canACSuper = Boolean(meleeAttackState.acSuperArmed);
        meleeAttackState.acSuperArmed = false;
        if (canABSuper) {
          // Cancel B charge so it doesn't also fire independently
          meleeAttackState.spinButtonDown = false;
          meleeAttackState.spinCharging = false;
          meleeAttackState.spinChargeTimer = 0;
          executeSwordRush(meleeAttackState);
        } else if (canACSuper) {
          const acSuperCost = player ? (player.prayerChargeRequired || 6000) / 3 : 20;
          if (player) player.prayerCharge = Math.max(0, player.prayerCharge - acSuperCost);
          if (player) { player.prayerHoldLocked = false; player.prayerHoldTimer = 0; }
          meleeAttackState.acSuperPrayerBombBlockTimer = Math.max(
            meleeAttackState.acSuperPrayerBombBlockTimer || 0,
            AC_SUPER_PRAYER_BOMB_BLOCK_TIME,
          );
          if (typeof Input !== "undefined") Input.prayerBombClickQueued = false;
          if (typeof cancelCongregationTap === "function") cancelCongregationTap();
          markChargedCConsumedByCombo(meleeAttackState);
          showDualChargeReadyPreview(meleeAttackState, MOVE_NAME_AC_SUPER, { executed: true });
          showMoveBanner(MOVE_NAME_AC_SUPER);
          executeRingOfFireAttack(meleeAttackState);
        } else if (fullyCharged) {
          const angleRad = Math.atan2(dir.y, dir.x);
          executeDivineShot(dir, meleeAttackState, angleRad);
        } else if (meleeAttackState.cooldown <= 0 || divineShotFollowUpActive) {
          const angleRad = Math.atan2(dir.y, dir.x);
          meleeAttackState.divineShotFollowUpUntil = 0;
          // Check if player is dashing when pressing melee
          const shouldSwoosh = playerDashState.isDashing;
          if (shouldSwoosh) {
            executeSwooshAttack(dir, meleeAttackState, angleRad);
          } else {
            queueBasicMeleeAttack(dir, meleeAttackState);
            if (player && player.animator) {
              player.state = "attackMelee";
              player.animator.play("attackMelee", { restart: true });
            }
          }
        }
      }
    }
    updateChargeState(dt, meleeAttackState);
    if (!meleeAttackState.isCharging && !meleeAttackState.spinCharging) {
      clearDivineChargeSparkVisual();
    }
    const showPrayerBombReadyVisual = Boolean(
      player &&
      player.state !== "death" &&
      player.state !== "attackPrayer" &&
      !meleeAttackState.isCharging &&
      !meleeAttackState.spinCharging &&
      player.prayerHoldLocked,
    );
    if (showPrayerBombReadyVisual) {
      spawnDivineChargeReadyVisual("prayerBomb");
    } else {
      clearPrayerBombReadyVisual();
    }
    const comboNow = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (
      meleeAttackState.divineShotFollowUpUntil &&
      comboNow > meleeAttackState.divineShotFollowUpUntil
    ) {
      meleeAttackState.divineShotFollowUpUntil = 0;
    }
    if (
      meleeAttackState.normalSlashExpiresAt &&
      comboNow > meleeAttackState.normalSlashExpiresAt
    ) {
      meleeAttackState.normalSlashTarget = null;
      meleeAttackState.normalSlashHits = 0;
      meleeAttackState.normalSlashExpiresAt = 0;
    }
    if (meleeAttackState.meleeCancelUntil && comboNow > meleeAttackState.meleeCancelUntil) {
      meleeAttackState.meleeCancelUntil = 0;
      meleeAttackState.meleeCancelTarget = null;
      meleeAttackState.meleeCancelDamage = 0;
    }
    const comboCarryActive =
      meleeAttackState.isRushing ||
      (meleeAttackState.awaitRush && meleeAttackState.awaitTimer > 0) ||
      (meleeAttackState.rushBypassUntil && comboNow <= meleeAttackState.rushBypassUntil) ||
      (meleeAttackState.meleeCancelUntil && comboNow <= meleeAttackState.meleeCancelUntil);
    if (
      meleeAttackState.meleeComboExpiresAt &&
      comboNow > meleeAttackState.meleeComboExpiresAt &&
      !comboCarryActive
    ) {
      if (meleeAttackState.meleeComboMap) {
        for (const [enemy, entry] of meleeAttackState.meleeComboMap) {
          if (entry.expiresAt < comboNow) {
            const chainHits = Math.max(
              0,
              Math.round(entry.totalHits || entry.hits || 0),
            );
            triggerEnemyComboDizzy(enemy, chainHits);
            releaseEntryComboLabel(entry);
            meleeAttackState.meleeComboMap.delete(enemy);
          }
        }
      }
      const liveMax = getMaxLiveMeleeComboHits(meleeAttackState, comboNow);
      if (liveMax > 0) {
        meleeAttackState.meleeComboHits = liveMax;
      } else {
        clearMeleeComboLabel(meleeAttackState);
        meleeAttackState.meleeComboTarget = null;
        meleeAttackState.meleeComboHits = 0;
        meleeAttackState.meleeComboExpiresAt = 0;
        resetComboMoveNames(meleeAttackState);
        clearActiveCounterHitText(meleeAttackState);
        clearPunishCounterState(meleeAttackState);
      }
    } else if (
      meleeAttackState.meleeComboLabel &&
      (meleeAttackState.meleeComboTarget || meleeAttackState.activeCounterHitTarget)
    ) {
      if (comboCarryActive) {
        meleeAttackState.meleeComboExpiresAt = Math.max(
          Number(meleeAttackState.meleeComboExpiresAt) || 0,
          comboNow + MELEE_COMBO_WINDOW_MS,
        );
        if (meleeAttackState.punishCounterTarget === meleeAttackState.meleeComboTarget) {
          meleeAttackState.punishCounterExpiresAt = Math.max(
            Number(meleeAttackState.punishCounterExpiresAt) || 0,
            meleeAttackState.meleeComboExpiresAt,
          );
        }
      }
      updateMeleeComboLabel(meleeAttackState);
    }
    if (
      meleeAttackState.punishCounterExpiresAt &&
      comboNow > meleeAttackState.punishCounterExpiresAt
    ) {
      clearPunishCounterState(meleeAttackState);
    }
    if (
      meleeAttackState.pendingCounterHitTarget &&
      meleeAttackState.pendingCounterHitShowAt &&
      comboNow >= meleeAttackState.pendingCounterHitShowAt
    ) {
      triggerCounterHitText(meleeAttackState.pendingCounterHitTarget, meleeAttackState);
      meleeAttackState.pendingCounterHitTarget = null;
      meleeAttackState.pendingCounterHitShowAt = 0;
    }
    meleeAttackState.rushJustEnded = false;
    if (
      meleeAttackState.pendingComboTarget &&
      meleeAttackState.pendingComboShowAt &&
      comboNow >= meleeAttackState.pendingComboShowAt
    ) {
      showComboTextAt(
        meleeAttackState.pendingComboTarget,
        meleeAttackState.pendingComboDamage,
        meleeAttackState.pendingComboHits || 2,
        0,
        true,
      );
      meleeAttackState.pendingComboTarget = null;
      meleeAttackState.pendingComboDamage = 0;
      meleeAttackState.pendingComboShowAt = 0;
      meleeAttackState.pendingComboHits = 0;
      meleeAttackState.pendingComboLastAt = 0;
    }
    if (
      meleeAttackState.rushComboDamage > 0 &&
      !meleeAttackState.rushComboShown &&
      meleeAttackState.rushComboActiveUntil &&
      comboNow > meleeAttackState.rushComboActiveUntil
    ) {
      const hits = Math.max(2, meleeAttackState.rushComboHits || 2);
      showComboTextAt(
        meleeAttackState.rushComboTarget || null,
        meleeAttackState.rushComboDamage,
        hits,
        0,
        true,
      );
      meleeAttackState.rushComboShown = true;
      meleeAttackState.rushComboActiveUntil = 0;
      meleeAttackState.rushComboDamage = 0;
      meleeAttackState.rushComboHits = 0;
      meleeAttackState.rushComboTarget = null;
    }
    if (
      meleeAttackState.divineComboDamage > 0 &&
      !meleeAttackState.divineComboShown &&
      meleeAttackState.divineComboActiveUntil &&
      comboNow > meleeAttackState.divineComboActiveUntil &&
      meleeAttackState.divineComboTarget
    ) {
      if ((meleeAttackState.divineComboHits || 0) >= 2) {
        showComboTextAt(
          meleeAttackState.divineComboTarget,
          meleeAttackState.divineComboDamage,
          meleeAttackState.divineComboHits,
        );
      }
      meleeAttackState.divineComboShown = true;
      meleeAttackState.divineComboActiveUntil = 0;
      meleeAttackState.divineComboDamage = 0;
      meleeAttackState.divineComboTarget = null;
      meleeAttackState.divineComboHits = 0;
    }
    updateDivineShotKillLabel(meleeAttackState, comboNow);
  }
}

function updateArcControlCooldowns() {
  if (!arcControl) return;
  const cooldown = Math.max(0, Number(playerDashState?.dashCooldown) || 0);
  const dashCooling = cooldown > 0;
  // Track the full length of the current cooldown to show how far it has refilled.
  if (!dashCooling) {
    updateArcControlCooldowns.total = 0;
  } else if (cooldown > (updateArcControlCooldowns.total || 0)) {
    updateArcControlCooldowns.total = cooldown;
  }
  const bSegment = arcControl.querySelector(".arc-segment.arc-b");
  const bLabel = arcControl.querySelector(".arc-label[data-seg=\"B\"]");
  if (bSegment) bSegment.classList.toggle("is-cooldown", dashCooling);
  if (bLabel) bLabel.classList.toggle("is-cooldown", dashCooling);
  // Touch: a ring refills around B and its caption reads WAIT until it's ready.
  const ring = arcControl.querySelector(".abc-cooldown-ring[data-seg=\"B\"]");
  if (ring && ring.__circumference) {
    const refilled = dashCooling
      ? 1 - cooldown / Math.max(0.001, updateArcControlCooldowns.total || cooldown)
      : 0;
    ring.style.strokeDashoffset = String(ring.__circumference * (1 - refilled));
    ring.classList.toggle("is-visible", dashCooling);
  }
  const sub = arcControl.querySelector(".abc-sub[data-seg=\"B\"]");
  const held = bSegment && bSegment.classList.contains("is-active");
  if (sub && !held) {
    const text = dashCooling ? "WAIT" : sub.getAttribute("data-label") || sub.textContent;
    if (sub.textContent !== text) sub.textContent = text;
  }
}
