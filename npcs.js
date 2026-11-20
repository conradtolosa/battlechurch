/* Congregation, NPCs and visitors: CozyNpc classes, pixel NPC looks, names, spawning, formations at runtime, visitor sessions, congregation dialogue and commands.
 * Moved out of game.js unchanged. Loaded by index.html BEFORE game.js and
 * shares its globals at runtime. Top-level code here runs before game.js
 * exists: run `node dev/tools/check_load_order.js` after editing.
 */

class CozyNpcAnimator {
  constructor({ animations = {}, shadow = null, scale = NPC_SCALE } = {}) {
    this.animations = animations;
    this.shadow = shadow || null;
    this.scale = scale;
    this.frameWidth = NPC_FRAME_WIDTH;
    this.frameHeight = NPC_FRAME_HEIGHT;
    this.currentState = animations.walk ? "walk" : Object.keys(animations)[0] || null;
    this.stateData = this.currentState ? animations[this.currentState] : null;
    this.frameTimer = 0;
    this.frameIndex = 0;
    this.direction = "down";
    this.moving = false;
  }

  setState(state, { restart = false } = {}) {
    if (!this.animations[state]) return;
    if (!restart && this.currentState === state) return;
    this.currentState = state;
    this.stateData = this.animations[state];
    this.frameTimer = 0;
    this.frameIndex = 0;
  }

  getState() {
    return this.currentState;
  }

  setDirectionFromVector(dx, dy) {
    if (!dx && !dy) return;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX > absY) {
      this.direction = dx >= 0 ? "right" : "left";
    } else {
      this.direction = dy >= 0 ? "down" : "up";
    }
  }

  setMoving(moving) {
    if (this.moving === moving) return;
    this.moving = moving;
    if (!moving) {
      this.frameIndex = 0;
      this.frameTimer = 0;
    }
  }

  update(dt) {
    const data = this.stateData;
    if (!data) return;
    const framesPerDirection = Math.max(1, data.framesPerDirection || 1);
    const animateWhenIdle = Boolean(data.animateWhenIdle);
    if (framesPerDirection <= 1) return;
    if (!this.moving && !animateWhenIdle) return;
    const frameDuration = data.frameDuration || NPC_WALK_FRAME_DURATION;
    this.frameTimer += dt;
    while (this.frameTimer >= frameDuration) {
      this.frameTimer -= frameDuration;
      this.frameIndex = (this.frameIndex + 1) % framesPerDirection;
    }
  }

  draw(context, x, y, options = {}) {
    const { flashWhite = 0, alpha = 1 } = options || {};
    const outerAlpha = context.globalAlpha;
    const data = this.stateData;
    if (!data || !data.layers || !data.layers.length) return;
    const frameWidth = Number.isFinite(data.frameWidth) && data.frameWidth > 0 ? data.frameWidth : this.frameWidth;
    const frameHeight = Number.isFinite(data.frameHeight) && data.frameHeight > 0 ? data.frameHeight : this.frameHeight;
    const framesPerDirection = Math.max(1, data.framesPerDirection || 1);
    if (framesPerDirection <= 0) return;
    if (this.frameIndex >= framesPerDirection) this.frameIndex = 0;
    const rowIndex = NPC_DIRECTION_ROW_MAP[this.direction] ?? 0;
    const sx = this.frameIndex * frameWidth;
    const sy = rowIndex * frameHeight;
    const drawWidth = frameWidth * this.scale;
    const drawHeight = frameHeight * this.scale;

    if (this.shadow) {
      const shadowWidth = this.shadow.width * this.scale;
      const shadowHeight = this.shadow.height * this.scale * 0.8;
      context.save();
      context.globalAlpha = outerAlpha * 0.35 * alpha;
      context.drawImage(
        this.shadow,
        x - shadowWidth / 2,
        y + drawHeight / 2 - shadowHeight * 0.6,
        shadowWidth,
        shadowHeight,
      );
      context.restore();
    }

    context.save();
    context.globalAlpha = outerAlpha * alpha;
    context.translate(x, y);
    data.layers.forEach((image) => {
      const source = image && image.__sourceImage ? image.__sourceImage : image;
      const offsetX = image && typeof image.__frameOffsetX === "number" ? image.__frameOffsetX : 0;
      const offsetY = image && typeof image.__frameOffsetY === "number" ? image.__frameOffsetY : 0;
      context.drawImage(
        source,
        sx + offsetX,
        sy + offsetY,
        frameWidth,
        frameHeight,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight,
      );
    });
    const flashAmount = Math.max(0, Math.min(1, flashWhite * DAMAGE_FLASH_INTENSITY));
    if (flashAmount > 0) {
      const prevComposite = context.globalCompositeOperation;
      const prevAlpha = context.globalAlpha;
      const prevFilter = context.filter || 'none';
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = outerAlpha * flashAmount * alpha;
      context.filter = `brightness(${(1 + flashAmount * 1.4).toFixed(2)}) saturate(${(1 + flashAmount * 0.9).toFixed(2)})`;
      data.layers.forEach((image) => {
        const source = image && image.__sourceImage ? image.__sourceImage : image;
        const offsetX = image && typeof image.__frameOffsetX === "number" ? image.__frameOffsetX : 0;
        const offsetY = image && typeof image.__frameOffsetY === "number" ? image.__frameOffsetY : 0;
        context.drawImage(
          source,
          sx + offsetX,
          sy + offsetY,
          frameWidth,
          frameHeight,
          -drawWidth / 2,
          -drawHeight / 2,
          drawWidth,
          drawHeight,
        );
      });
      context.filter = prevFilter;
      context.globalAlpha = prevAlpha;
      context.globalCompositeOperation = prevComposite;
    }
    context.restore();
  }
}

function captureNpcPortrait(npc) {
  if (!npc) return null;
  const appearance = npc.appearance || null;
  const baseScale = npc.animator?.scale || NPC_SCALE;
  const hasAnimations = appearance?.animations && Object.keys(appearance.animations).length > 0;
  if (!hasAnimations) return null;
  const animator = new CozyNpcAnimator({
    animations: appearance.animations,
    shadow: null,
    scale: baseScale,
  });
  animator.setState("walk", { restart: true });
  animator.setMoving(false);
  animator.setDirectionFromVector(0, 1);
  const walkData = appearance?.animations?.walk || null;
  const portraitFrameWidth =
    Number.isFinite(walkData?.frameWidth) && walkData.frameWidth > 0
      ? walkData.frameWidth
      : NPC_FRAME_WIDTH;
  const portraitFrameHeight =
    Number.isFinite(walkData?.frameHeight) && walkData.frameHeight > 0
      ? walkData.frameHeight
      : NPC_FRAME_HEIGHT;
  const drawWidth = portraitFrameWidth * baseScale;
  const drawHeight = portraitFrameHeight * baseScale;
  const size = Math.ceil(Math.max(drawWidth, drawHeight));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, size, size);
  animator.draw(context, size / 2, size / 2);
  // Tag the canvas with a unique id to aid debugging and de-dup logic.
  try {
    const existingCounter = window.__npcPortraitCounter || 0;
    window.__npcPortraitCounter = existingCounter + 1;
    canvas.__portraitId = `npc_portrait_${window.__npcPortraitCounter}`;
    canvas.__npcName = npc.name || "";
    canvas.npcName = npc.name || "";
    canvas.__battleRosterIndex = Number.isFinite(npc.__battleRosterIndex)
      ? npc.__battleRosterIndex
      : -1;
  } catch (e) {}
  return canvas;
}

function captureVisitorPortrait(entity) {
  if (typeof captureNpcPortrait !== "function" || !entity) return null;
  try {
    return captureNpcPortrait(entity);
  } catch (e) {
    return null;
  }
}

class CozyNpc {
  constructor({ appearance, speed } = {}) {
    const animations = appearance?.animations || {};
    this.animator = new CozyNpcAnimator({
      animations,
      shadow: appearance?.shadow ?? null,
    });
    this.appearance = appearance || null;
    this.isCozyNpc = true;
  this.radius = NPC_RADIUS;
  // Reduce the safeTopMargin so NPCs can walk closer to / above the HUD
  // without being clamped too early by clampEntityToBounds. Previously
  // this used a large margin which prevented natural "walk off" behavior.
  this.safeTopMargin = Math.max(this.radius * 2, 24);
    this.speed = speed ?? randomInRange(42, 58);
    const spawn = this.getRandomWalkPoint();
    this.x = spawn.x;
    this.y = spawn.y;
    this.target = this.getRandomWalkPoint();
    this.idleTimer = randomInRange(0.3, 1.0);
    this.stuckTimer = 0;
    this.state = "wander";
    this.processionTarget = null;
    this.processionSpeed = null;
  this.maxFaith = NPC_MAX_FAITH;
  // Start NPCs at configurable fraction of max faith so they can build up
  // and participate in combat during the level.
    this.faith = this.maxFaith;
    // Per-NPC cooldown timer for firing projectiles (seconds). When <= 0 NPC may fire.
    this.npcArrowCooldown = 0;
    this.faithBarVisible = false;
  this.faithBarTimer = 0; // seconds to force the faith bar visible
    this.drainSource = null;
    this.active = true;
    this.exitTarget = null;
    this.returnTarget = null;
    this.recoveryTextCooldown = 0;
    this.departed = false;
    this.needsPlayerRestore = false;
    this.animator.setState("walk", { restart: true });
    this.statusBubble = null;
    this.statusBubbleTimer = 0;
    this.statusBubblePersistent = false;
    this.statusBubbleCritical = false;
    this.redFaithDialogueTriggered = false;
    this.pendingLossPortrait = null;
    this.lossRecorded = false;
    this.damageFlashTimer = 0;
    this.damageCooldown = 0;
    this.projectileGlowTimer = 0;
    this.attackVisualTimer = 0;
    this.attackVisualDirX = 0;
    this.attackVisualDirY = 1;
    this.knockbackVx = 0;
    this.knockbackVy = 0;
    this.knockbackTimer = 0;
    this.formationWarmupTimer = 0;
    this.zonePatrolCommitTimer = 0;
    this.retreatCommitTimer = 0;
    this.safeRecoveryTimer = 0;
    this.zoneMoveMode = "frontline";
    this.frontlinePatrolTimer = randomInRange(0.35, 0.7);
    this.zonePatrolSide = Math.random() < 0.5 ? -1 : 1;
    this.patrolClock = Math.random() * Math.PI * 2;
    this.ensnaredByEnemy = null;
    this.ensnareResumeState = null;
    this.ensnareDrainTickTimer = 0;
  }

  isEnsnared() {
    return Boolean(this.ensnaredByEnemy && !this.departed && this.active);
  }

  setEnsnaredBy(enemy) {
    if (!enemy || this.departed || !this.active) return false;
    this.ensnaredByEnemy = enemy;
    this.ensnareResumeState = this.state;
    this.state = "ensnared";
    this.ignoreObstacles = true;
    this.ensnareDrainTickTimer = 0.08;
    this.animator.setState("hurt", { restart: true });
    this.animator.setMoving(false);
    this.updateFaithVisibility(true);
    return true;
  }

  clearEnsnare(enemy = null, { resume = true } = {}) {
    if (!this.ensnaredByEnemy) return;
    if (enemy && this.ensnaredByEnemy !== enemy) return;
    this.ensnaredByEnemy = null;
    const priorState = this.ensnareResumeState;
    this.ensnareResumeState = null;
    this.ensnareDrainTickTimer = 0;
    this.ignoreObstacles = false;
    if (!resume || this.departed || !this.active) return;
    if ((this.faith || 0) <= 0) {
      this.loseFaith();
      return;
    }
    if (priorState === "returning") {
      this.beginReturn();
      return;
    }
    this.resumeWander();
  }

  needsAid() {
    if (!this.active || this.departed) return false;
    return this.faith < this.maxFaith || this.state === "drained";
  }

  loseFaith() {
    if (this.state === "lostFaith" || this.state === "departed") return;
    this.faith = 0;
    this.needsPlayerRestore = true;
    this.state = "lostFaith";
    this.exitTarget = this.exitTarget || this.getExitPoint();
    this.animator.setState("walk", { restart: true });
    this.animator.setMoving(true);
    this.updateFaithVisibility(true);
    const _lostFaithLines = window.BattlechurchCongregationDialogue?.lostFaith;
    const _lostFaithText = Array.isArray(_lostFaithLines) && _lostFaithLines.length
      ? _lostFaithLines[Math.floor(Math.random() * _lostFaithLines.length)]
      : "I'm outta here!";
    this.setStatusBubble(_lostFaithText, { color: UI_COLOR.crimson, persist: true, critical: true });
    if (typeof captureNpcPortrait === "function") {
      this.pendingLossPortrait = captureNpcPortrait(this);
    } else {
      this.pendingLossPortrait = null;
    }
    this.lossRecorded = false;
  }

  beginReturn({ announce = false } = {}) {
    if (this.departed) return;
    this.needsPlayerRestore = false;
    this.state = "returning";
    this.returnTarget = this.getReturnPoint();
    this.animator.setState("walk", { restart: true });
    this.animator.setMoving(true);
    this.updateFaithVisibility(this.faith < this.maxFaith);
    const returnLine = randomChoice(NPC_RETURN_LINES) || "I'm heading back.";
    this.setStatusBubble(returnLine, { color: UI_COLOR.ice, duration: 2.6 });
    this.pendingLossPortrait = null;
    this.lossRecorded = false;
    if (announce && this.recoveryTextCooldown <= 0) {
      this.recoveryTextCooldown = 2.5;
      spawnRayboltEffect(this.x, this.y - this.radius / 2, this.radius * 2.2);
    }
  }

  resumeWander() {
    if (this.departed) return;
    this.needsPlayerRestore = false;
    this.state = "wander";
    this.target =
      this.zoneMoveMode === "briefing"
        ? getNpcBriefingPoint(this)
        : getNpcFrontlineDesiredPoint(this);
    this.idleTimer = 0;
    this.stuckTimer = 0;
    this.processionTarget = null;
    this.processionSpeed = null;
    this.ignoreObstacles = false;
    this.animator.setState("walk");
    this.animator.setMoving(false);
    this.updateFaithVisibility(false);
    this.clearStatusBubble();
    this.pendingLossPortrait = null;
    this.lossRecorded = false;
    this.ignoreObstacles = false;
    this.zoneMoveMode = this.zoneMoveMode === "briefing" ? "briefing" : "frontline";
    this.frontlinePatrolTimer = 0;
  }

  beginProcession({ startX, startY, target, speed } = {}) {
    if (typeof startX === "number") this.x = startX;
    if (typeof startY === "number") this.y = startY;
    this.processionTarget = target || this.getReturnPoint();
    this.processionSpeed = speed || this.speed;
    this.ignoreObstacles = true;
    this.state = "procession";
    this.animator.setState("walk", { restart: true });
    this.animator.setMoving(true);
    this.updateFaithVisibility(false);
  }

  isInProcession() {
    return this.state === "procession";
  }

  receiveFaith(amount, options = {}) {
    if (!this.active || this.departed) return false;
    const { allowFromZero = false } = options;
    if (this.needsPlayerRestore && !allowFromZero) return false;
    if (typeof amount !== "number" || amount <= 0) return false;
    const prevFaith = this.faith;
    this.faith = Math.min(this.maxFaith, this.faith + amount);
    if (allowFromZero && this.faith > 0) {
      this.needsPlayerRestore = false;
    }
    const fullFaith = this.faith >= this.maxFaith - 0.01;
    if (this.state === "lostFaith") {
      // If the NPC is in the process of leaving due to lost faith, any
      // positive restoration should cancel the departure and send the NPC
      // back home. Previously we required full faith; change that so a
      // partial restore (>0) triggers a return.
      if (this.faith > 0) {
        // Do not immediately set to max; allow partial faith to persist but
        // transition the NPC back into the returning state so it heads home.
        this.beginReturn({ announce: true });
      } else if (fullFaith) {
        this.faith = this.maxFaith;
        this.beginReturn({ announce: true });
      }
      this.updateFaithVisibility(true);
      return this.faith > prevFaith;
    }
    if (fullFaith && this.state !== "wander") {
      this.faith = this.maxFaith;
      if (this.state !== "returning") {
        this.beginReturn({ announce: true });
      }
    }
    if ((this.maxFaith || 0) > 0) {
      const ratio = this.faith / this.maxFaith;
      if (ratio > getNpcRedFaithThresholdRatio()) {
        this.redFaithDialogueTriggered = false;
      }
    }
    this.updateFaithVisibility(true);
    return this.faith > prevFaith;
  }

  maybeSpeakRedFaithDialogue(prevFaith) {
    if (!this.active || this.departed) return;
    if (this.state === "lostFaith" || this.state === "departed") return;
    if ((this.maxFaith || 0) <= 0) return;
    if (this.redFaithDialogueTriggered) return;
    const thresholdRatio = getNpcRedFaithThresholdRatio();
    const startRatio = Math.max(0, Math.min(1, (prevFaith || 0) / this.maxFaith));
    const endRatio = Math.max(0, Math.min(1, (this.faith || 0) / this.maxFaith));
    if (!(startRatio > thresholdRatio && endRatio > 0 && endRatio <= thresholdRatio)) return;
    const line = getNpcRedFaithDialogueLine();
    if (!line) return;
    this.redFaithDialogueTriggered = true;
    this.setStatusBubble(line, {
      color: "#FFD6D6",
      duration: getNpcRedFaithDialogueLife(),
    });
  }

  tryNpcFire(dt) {
    if (typeof window !== "undefined" && window.__tutorialArenaBlockAutoFire) return false;
    // NPCs can fire arrows once at full faith and respecting cooldowns.
    if (!this.active || this.departed) return false;
    if (this.isEnsnared()) return false;
    if (this.faith <= 0) return false;
    // countdown
    const timerScale = getNpcTimerScale();
    this.npcArrowCooldown = Math.max(0, (this.npcArrowCooldown || 0) - dt * timerScale);
    if (this.npcArrowCooldown > 0) return false;
    // find nearest valid enemy or hostile projectile target
    let best = null;
    let bestDist = Infinity;
    const maxRange = typeof NPC_ARROW_RANGE_DEFAULT === 'number' ? NPC_ARROW_RANGE_DEFAULT : 520;
    for (const e of enemies) {
      if (!isEnemyTargetableForAutoAim(e)) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist && d <= maxRange) {
        bestDist = d;
        best = { e, dx, dy, d };
      }
    }
    for (const proj of projectiles) {
      if (!proj || proj.dead || proj.friendly) continue;
      const dx = proj.x - this.x;
      const dy = proj.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist && d <= maxRange) {
        bestDist = d;
        best = { e: proj, dx, dy, d };
      }
    }
    if (!best) return false;
    const dir = normalizeVector(best.dx, best.dy);
    let baseCooldown =
      typeof devTools?.npcFireCooldown === "number"
        ? devTools.npcFireCooldown
        : typeof NPC_ARROW_COOLDOWN_DEFAULT === "number"
        ? NPC_ARROW_COOLDOWN_DEFAULT
        : 2.4;
    const formation = getFormationBonuses();
    const harmonyMultiplier = npcHarmonyBuffTimer > 0 ? HARMONY_BUFF_MULTIPLIER : 1;
    const fireRateMultiplier = harmonyMultiplier * (1 + (formation.rof || 0));

    // NPC weapon power-up handling
    const weaponMode = npcWeaponState.mode || "arrow";
    const guidedStudyArrowShot =
      weaponMode === "arrow" &&
      formation.armorPierce === true &&
      typeof formation.projectileType === "string" &&
      formation.projectileType.length > 0;
    const shotType = guidedStudyArrowShot ? formation.projectileType : weaponMode;
    const npcDamageMult = npcWeaponState.damageMultiplier || 1;
    const npcCooldownMult = npcWeaponState.cooldownMultiplier || 1;
    const npcSpeedMult = npcWeaponState.speedMultiplier || 1;

    const baseCfg = PROJECTILE_CONFIG[weaponMode] || PROJECTILE_CONFIG.arrow;
    if (weaponMode === "fire") {
      baseCooldown = 1.0;
    } else if (weaponMode !== "arrow" && baseCfg?.cooldownAfterFire) {
      // NPC power weapons fire at 25% of the player base fire rate (4x cooldown),
      // except wisdom NPC power, which is 50% (2x cooldown) to avoid being too slow.
      const npcRateScale = weaponMode === "wisdom_missle" ? 2 : 4;
      baseCooldown = baseCfg.cooldownAfterFire * npcRateScale;
    }

    const cooldown = applyNpcRofClassMultiplier(
      Math.max(0.02, (baseCooldown * npcCooldownMult) / fireRateMultiplier),
    );

    let damageBase =
      weaponMode === "arrow"
        ? NPC_ARROW_DAMAGE
        : (baseCfg?.damage ?? NPC_ARROW_DAMAGE);
    let damage =
      damageBase *
      (weaponMode === "arrow" ? 1 : npcDamageMult) *
      harmonyMultiplier *
      (1 + (formation.damage || 0));
    damage = applyNpcDamageClassMultiplier(Math.max(1, Math.round(damage)));

    const baseScale = weaponMode === "arrow" ? 1.6 : (baseCfg?.scale || 2) * 0.5;
    const scale = baseScale * fireRateMultiplier;
    const speedOverride =
      weaponMode === "arrow"
        ? null
        : (baseCfg?.speed || 0) * npcSpeedMult;

    // spawn projectile from NPC toward the enemy
    const shotOverrides = {
      friendly: true,
      damage,
      source: this,
      scale,
      flipHorizontal: dir.x < 0,
      scriptureFeedback: weaponMode === "fire",
      encouragementFaithFeedback: weaponMode === "arrow" && npcHarmonyBuffTimer > 0,
    };
    if (speedOverride && speedOverride > 0) {
      shotOverrides.speed = speedOverride;
    }
    if (guidedStudyArrowShot) {
      shotOverrides.ignoreArmorDeflect = true;
      shotOverrides.ignoreProjectileResistance = true;
    }
    spawnProjectile(shotType, this.x, this.y, dir.x, dir.y, shotOverrides);
    this.attackVisualTimer = Math.max(this.attackVisualTimer || 0, NPC_FIRE_SWING_VISUAL_DURATION);
    this.attackVisualDirX = dir.x;
    this.attackVisualDirY = dir.y;
    if (weaponMode === "arrow" && typeof playDefaultArrowSfx === "function") {
      playDefaultArrowSfx(0.55);
    }
    if (weaponMode === "fire" && typeof playFireballCastSfx === "function") {
      playFireballCastSfx(0.55);
    }
    if (weaponMode === "wisdom_missle" && typeof playWisdomCastSfx === "function") {
      playWisdomCastSfx(0.55);
    }
    if (weaponMode === "faith_cannon" && typeof playFaithCannonSfx === "function") {
      playFaithCannonSfx(0.55);
    }
    // set cooldown (use devTools value if present)
    this.npcArrowCooldown = cooldown;
    this.updateFaithVisibility(true);
    return true;
  }

  sufferAttack(damage = 1, options = {}) {
    if (!this.active || this.departed) return;
    if (npcDamageImmuneForBriefTeaser) {
      this.damageFlashTimer = Math.max(this.damageFlashTimer || 0, DAMAGE_FLASH_DURATION * 0.75);
      this.faithBarTimer = Math.max(this.faithBarTimer || 0, 1.2);
      this.faithBarVisible = true;
      spawnFlashEffect(this.x, this.y - this.radius / 2);
      return false;
    }
    const { sourceType, bypassCooldown = false } = options || {};
    const noCooldownSource = bypassCooldown || isNoCooldownDamageSource(sourceType);
    if (this.damageCooldown > 0 && !noCooldownSource) return false;
    const prevFaith = this.faith;
    const baseDamage = Math.max(1, Math.round(damage || 1));
    const cappedLoss = Math.min(NPC_MAX_FAITH_LOSS_PER_ATTACK, baseDamage);
    const damageScale = 1;
    const scaledLoss = Math.max(1, Math.round(cappedLoss * damageScale));
    this.faith = Math.max(0, this.faith - scaledLoss);
    if (scaledLoss > 0 && (this.maxFaith || 0) > 0) {
      const startRatio = prevFaith / this.maxFaith;
      const endRatio = this.faith / this.maxFaith;
      this.faithDamageFlash = {
        startRatio,
        endRatio,
        timer: 1.0,
        duration: 1.0,
        flashes: 3,
      };
    }
  // Visual debug: floating text showing faith lost
    try {
      showDamage(this, scaledLoss, {
        color: UI_COLOR.softWhite,
        fadeDelay: 0.5,
      });
    } catch (e) {}
    if (typeof playNpcHurtSfx === "function") {
      playNpcHurtSfx(0.6);
    }
    spawnFlashEffect(this.x, this.y - this.radius / 2);
    this.damageFlashTimer = DAMAGE_FLASH_DURATION;
    this.faithBarTimer = 2.4;
    this.faithBarVisible = true;
    if (!noCooldownSource) {
      this.damageCooldown = NPC_DAMAGE_COOLDOWN;
    }
    if (this.faith <= 0) {
      this.faith = 0;
      this.loseFaith();
      return;
    }
    this.updateFaithVisibility(true);
    // While taking damage, do not trigger speech bubbles (they interrupt gameplay).
    // Keep the cooldown so we don't spam other recovery texts, but avoid the spoken line.
    if (this.state === "wander" && this.recoveryTextCooldown <= 0 && this.faith < prevFaith) {
      this.recoveryTextCooldown = 2.0;
      // intentionally do not call setStatusBubble here to keep NPCs silent while hit
    }
  }

  updateFaithVisibility(force = false) {
    this.faithBarVisible = force || this.faith < this.maxFaith || this.state !== "wander";
  }

  setStatusBubble(message, { color = UI_COLOR.softWhite, duration = 2.5, persist = false, critical = false } = {}) {
    if (this.statusBubble) this.statusBubble.life = 0;
    if (!message) {
      this.statusBubble = null;
      this.statusBubbleTimer = 0;
      this.statusBubblePersistent = false;
      this.statusBubbleCritical = false;
      return;
    }
    const life = Math.max(0.1, duration);
    const bubbleLife = persist ? 9999 : life;
    this.statusBubblePersistent = persist;
    this.statusBubbleCritical = critical;
    this.statusBubbleTimer = persist ? Number.POSITIVE_INFINITY : life;
    this.statusBubble = addFloatingTextAt(this.x, this.y - this.radius - 22, message, color, {
      speechBubble: true,
      vy: 0,
      life: bubbleLife,
      entity: this,
      offsetY: -this.radius - 22,
      bubbleTheme: "npc",
      persist,
      critical: critical || persist,
    });
  }

  clearStatusBubble() {
    if (this.statusBubble) {
      this.statusBubble.life = 0;
      this.statusBubble = null;
    }
    this.statusBubbleTimer = 0;
    this.statusBubblePersistent = false;
    this.statusBubbleCritical = false;
  }

  recordLoss() {
    if (this.lossRecorded) return;
    const portrait = this.pendingLossPortrait || null;
    if (levelManager?.notifyNpcLost) {
      levelManager.notifyNpcLost(portrait);
    }
    this.lossRecorded = true;
    this.pendingLossPortrait = null;
    this.clearStatusBubble();
  }

  update(dt, options = {}) {
    const frameStartX = this.x;
    const frameStartY = this.y;
    const previewOnly = Boolean(options?.previewOnly);
    if (this.departed) return;
    if (previewOnly) {
      this.zonePatrolCommitTimer = Math.max(0, (this.zonePatrolCommitTimer || 0) - dt);
      this.retreatCommitTimer = Math.max(0, (this.retreatCommitTimer || 0) - dt);
      this.frontlinePatrolTimer = Math.max(0, (this.frontlinePatrolTimer || 0) - dt);
    } else {
      this.recoveryTextCooldown = Math.max(0, this.recoveryTextCooldown - dt);
      this.zonePatrolCommitTimer = Math.max(0, (this.zonePatrolCommitTimer || 0) - dt);
      this.retreatCommitTimer = Math.max(0, (this.retreatCommitTimer || 0) - dt);
      this.frontlinePatrolTimer = Math.max(0, (this.frontlinePatrolTimer || 0) - dt);
      const timerScale = getNpcTimerScale();
      this.faithBarTimer = Math.max(0, (this.faithBarTimer || 0) - dt * timerScale);
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
      this.projectileGlowTimer = Math.max(0, (this.projectileGlowTimer || 0) - dt);
      this.attackVisualTimer = Math.max(0, (this.attackVisualTimer || 0) - dt);
      if (this.faithDamageFlash?.timer > 0) {
        this.faithDamageFlash.timer = Math.max(0, this.faithDamageFlash.timer - dt);
      }
    }
    if (this.statusBubblePersistent) {
      this.statusBubbleTimer = Number.POSITIVE_INFINITY;
    } else if (this.statusBubbleTimer > 0) {
      this.statusBubbleTimer = Math.max(0, this.statusBubbleTimer - dt);
      if (this.statusBubbleTimer <= 0) this.clearStatusBubble();
    }

    const attackVisualActive = (this.attackVisualTimer || 0) > 0;
    switch (this.state) {
      case "wander":
        this.updateWander(dt, { preserveAttackVisual: attackVisualActive });
        break;
      case "ensnared":
        this.updateEnsnared(dt);
        break;
      case "procession":
        this.updateProcession(dt, { preserveAttackVisual: attackVisualActive });
        break;
      case "drained":
        this.updateDrained(dt);
        break;
      case "lostFaith":
        this.updateLostFaith(dt, { preserveAttackVisual: attackVisualActive });
        break;
      case "returning":
        this.updateReturning(dt, { preserveAttackVisual: attackVisualActive });
        break;
      default:
        break;
    }

    if (this.knockbackTimer > 0) {
      const step = Math.min(this.knockbackTimer, dt);
      this.x += this.knockbackVx * step;
      this.y += this.knockbackVy * step;
      this.knockbackTimer = Math.max(0, this.knockbackTimer - dt);
      if (this.knockbackTimer <= 0) {
        this.knockbackVx = 0;
        this.knockbackVy = 0;
      }
      clampEntityToBounds(this);
    }

    const movedDx = this.x - frameStartX;
    const movedDy = this.y - frameStartY;
    const movedDistance = Math.hypot(movedDx, movedDy);
    const hasMeaningfulMovement = movedDistance > 0.05;
    if (attackVisualActive) {
      this.animator.setState("attack", { restart: this.animator.getState() !== "attack" });
      this.animator.setMoving(false);
      this.animator.setDirectionFromVector(this.attackVisualDirX || 0, this.attackVisualDirY || 1);
    } else {
      this.animator.setMoving(hasMeaningfulMovement);
      if (hasMeaningfulMovement) {
        this.animator.setDirectionFromVector(movedDx, movedDy);
      }
    }

    this.animator.update(dt);
  }

  updateProcession(dt, options = {}) {
    const preserveAttackVisual = Boolean(options?.preserveAttackVisual);
    if (!preserveAttackVisual) this.animator.setState("walk");
    const target = this.processionTarget || this.getReturnPoint();
    if (!target) {
      this.resumeWander();
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);
    if (!distance || distance < 8) {
      this.resumeWander();
      return;
    }
    const dirX = dx / distance;
    const dirY = dy / distance;
    const speed = this.processionSpeed || this.speed;
    this.x += dirX * speed * dt;
    this.y += dirY * speed * dt;
    if (!preserveAttackVisual) {
      this.animator.setDirectionFromVector(dirX, dirY);
      this.animator.setMoving(true);
    }
    resolveEntityObstacles(this);
    clampEntityToBounds(this);
    this.updateFaithVisibility(false);
  }

  updateWander(dt, options = {}) {
    const preserveAttackVisual = Boolean(options?.preserveAttackVisual);
    if (!preserveAttackVisual) this.animator.setState("walk");
    this.patrolClock = (this.patrolClock || 0) + dt * 1.45;
    if ((this.formationWarmupTimer || 0) > 0 && this.formationAnchor) {
      this.formationWarmupTimer = Math.max(0, this.formationWarmupTimer - dt);
      this.x = this.formationAnchor.x;
      this.y = this.formationAnchor.y;
      this.target = { x: this.x, y: this.y };
      this.zoneMoveMode = "frontline";
      if (!preserveAttackVisual) this.animator.setMoving(false);
      this.updateFaithVisibility(false);
      return;
    }
    if (this.zoneMoveMode === "briefing") {
      this.target = getNpcBriefingPoint(this);
    }
    const threatRetreatTarget = getNpcThreatAvoidanceTarget(this);
    if (threatRetreatTarget) {
      this.safeRecoveryTimer = 0;
      this.zoneMoveMode = "retreat";
    } else if (this.zoneMoveMode !== "briefing") {
      this.safeRecoveryTimer = Math.min(1, (this.safeRecoveryTimer || 0) + dt);
      if ((this.safeRecoveryTimer || 0) >= 0.22) {
        this.zoneMoveMode = "frontline";
      }
    }
    this.target =
      this.zoneMoveMode === "briefing"
        ? getNpcBriefingPoint(this)
        : this.zoneMoveMode === "retreat" && threatRetreatTarget
        ? threatRetreatTarget
        : getNpcFrontlineDesiredPoint(this);
    if (!this.target) {
      if (!preserveAttackVisual) this.animator.setMoving(false);
      this.updateFaithVisibility(false);
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (!distance || distance < 4) {
      this.animator.setMoving(false);
      this.updateFaithVisibility(false);
      return;
    }

    const prevX = this.x;
    const prevY = this.y;
    const dirX = dx / distance;
    const dirY = dy / distance;

    const movementSpeed = this.speed * (this.zoneMoveMode === "retreat" ? 1.3 : 1.04);
    this.x += dirX * movementSpeed * dt;
    this.y += dirY * movementSpeed * dt;
    if (!preserveAttackVisual) {
      this.animator.setDirectionFromVector(dirX, dirY);
      this.animator.setMoving(true);
    }

    resolveEntityObstacles(this);
    clampEntityToBounds(this);

    const travelled = Math.hypot(this.x - prevX, this.y - prevY);
    if (travelled < 0.5) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) {
        this.patrolClock += Math.PI * 0.65;
        if (this.zoneMoveMode !== "retreat") {
          this.zonePatrolSide *= -1;
        }
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }

    this.updateFaithVisibility(false);
  }

  updateEnsnared(dt) {
    this.animator.setState("hurt");
    this.animator.setMoving(false);
    const source = this.ensnaredByEnemy;
    const sourceValid =
      source &&
      !source.dead &&
      source.state !== "death" &&
      source.demonessGrabTarget === this;
    if (!sourceValid) {
      this.clearEnsnare(source, { resume: true });
      return;
    }
    this.knockbackVx = 0;
    this.knockbackVy = 0;
    this.knockbackTimer = 0;
    const dx = source.x - this.x;
    const dy = source.y - this.y;
    const distance = Math.hypot(dx, dy);
    const drainRange = Math.max(72, (source.radius || 0) + (this.radius || 0) + 18);
    if (distance <= drainRange) {
      this.ensnareDrainTickTimer = Math.max(0, (this.ensnareDrainTickTimer || 0) - dt);
      if (this.ensnareDrainTickTimer <= 0 && this.faith > 0) {
        const prevFaith = this.faith;
        this.sufferAttack(1, {
          sourceType: source.type,
          bypassCooldown: true,
        });
        if (
          Number.isFinite(prevFaith) &&
          Number.isFinite(this.faith) &&
          this.faith < prevFaith &&
          Number.isFinite(source.demonessDrainedFaith)
        ) {
          source.demonessDrainedFaith += prevFaith - this.faith;
        }
        this.ensnareDrainTickTimer = 0.34;
      }
    } else {
      this.ensnareDrainTickTimer = Math.min(this.ensnareDrainTickTimer || 0.08, 0.08);
    }
    this.updateFaithVisibility(true);
  }

  updateDrained(dt) {
    this.animator.setState("hurt");
    this.animator.setMoving(false);
    const draining = this.isDraining();
    if (draining) {
      const prevFaith = this.faith;
      this.faith = Math.max(0, this.faith - NPC_FAITH_DRAIN_RATE * dt);
      if (this.faith <= 0) {
        this.loseFaith();
        return;
      }
    } else if (this.faith >= NPC_FAITH_RETURN_THRESHOLD) {
      this.beginReturn({ announce: true });
      return;
    }
    this.updateFaithVisibility(true);
  }

  updateLostFaith(dt, options = {}) {
    const preserveAttackVisual = Boolean(options?.preserveAttackVisual);
    if (!preserveAttackVisual) this.animator.setState("walk");
    if (!preserveAttackVisual) this.animator.setMoving(true);
    this.updateFaithVisibility(true);
    if (!this.exitTarget) this.exitTarget = this.getExitPoint();
    const prevX = this.x;
    const prevY = this.y;
    const dx = this.exitTarget.x - this.x;
    const dy = this.exitTarget.y - this.y;
    const distance = Math.hypot(dx, dy) || 1;
    const dirX = dx / distance;
    const dirY = dy / distance;
    if (!preserveAttackVisual) this.animator.setDirectionFromVector(dirX, dirY);
    this.x += dirX * (this.speed * 0.92) * dt;
    this.y += dirY * (this.speed * 0.92) * dt;
    const margin = 160;
    const exitX = this.exitTarget ? this.exitTarget.x : (prevX < canvas.width / 2 ? -margin : canvas.width + margin);
    const exitingLeft = exitX <= prevX;
    const reachedExitTarget = exitingLeft ? this.x <= exitX : this.x >= exitX;
    const edgeBuffer = Math.max(12, (this.radius || 24) * 0.6);
    const leftEdge = edgeBuffer;
    const rightEdge = canvas.width - edgeBuffer;
    const exitedLeftVisibly = exitingLeft && prevX > leftEdge && this.x <= leftEdge;
    const exitedRightVisibly = !exitingLeft && prevX < rightEdge && this.x >= rightEdge;
    if (reachedExitTarget || exitedLeftVisibly || exitedRightVisibly || this.x <= -margin || this.x >= canvas.width + margin) {
      // spawn smoke effect at NPC's feet so they vanish into smoke
      try {
        const puffX = exitingLeft ? leftEdge : rightEdge;
        const playableTop = HUD_HEIGHT + Math.max(this.radius || 0, 16);
        const playableBottom = canvas.height - Math.max(this.radius || 0, 16);
        const puffY = Math.max(playableTop, Math.min(playableBottom, this.y));
        spawnSmokeEffect(puffX, puffY, Math.max(0.8, (this.radius || 24) / 24));
        this.x = puffX;
        this.y = puffY;
      } catch (e) {}
      this.state = "departed";
      this.departed = true;
      this.active = false;
      this.recordLoss();
      return;
    }
  }

  updateReturning(dt, options = {}) {
    const preserveAttackVisual = Boolean(options?.preserveAttackVisual);
    if (!preserveAttackVisual) this.animator.setState("walk");
    if (!this.returnTarget) this.returnTarget = this.getReturnPoint();
    const dx = this.returnTarget.x - this.x;
    const dy = this.returnTarget.y - this.y;
    const distance = Math.hypot(dx, dy);
    if (!distance || distance < 16) {
      this.faith = Math.min(this.faith, this.maxFaith);
      this.resumeWander();
      return;
    }
    const dirX = dx / distance;
    const dirY = dy / distance;
    if (!preserveAttackVisual) {
      this.animator.setDirectionFromVector(dirX, dirY);
      this.animator.setMoving(true);
    }
    this.x += dirX * this.speed * dt;
    this.y += dirY * this.speed * dt;
    resolveEntityObstacles(this);
    clampEntityToBounds(this);
    this.updateFaithVisibility(this.faith < this.maxFaith);
  }

  getRandomWalkPoint() {
    const bounds = getNpcHomeBounds();
    const anchor = this.formationAnchor || null;
    const jitter = formationState?.jitterRadius ?? 0;
    if (anchor) {
      const inwardBias = Math.max(0, Math.min(1, formationState?.homePressure || 0));
      const point = getNpcZoneWanderPoint(this, { inwardBias });
      return {
        x: clamp(point.x + randomInRange(-jitter * 0.35, jitter * 0.35), bounds.minX, bounds.maxX),
        y: clamp(point.y + randomInRange(-jitter * 0.25, jitter * 0.25), bounds.minY, bounds.maxY),
      };
    }
    return {
      x: randomInRange(bounds.x - bounds.radius * 0.8, bounds.x + bounds.radius * 0.8),
      y: randomInRange(bounds.y - bounds.radius * 0.8, bounds.y + bounds.radius * 0.8),
    };
  }

  getReturnPoint() {
    return getNpcZoneWanderPoint(this, { inwardBias: 0.5, angleJitterScale: 0.24 });
  }

  getExitPoint() {
    const margin = 140;
    const exitYMin = HUD_HEIGHT + this.radius + 8;
    const exitYMax = canvas.height - this.radius - 8;
    const clampedY = Math.max(exitYMin, Math.min(exitYMax, this.y));
    const left = { x: -margin, y: clampedY };
    const right = { x: canvas.width + margin, y: clampedY };
    const distToLeft = Math.abs(this.x - left.x);
    const distToRight = Math.abs(right.x - this.x);
    return distToLeft <= distToRight ? left : right;
  }

  shouldShowFaithBar() {
  // Always show the NPC faith bar during gameplay unless the NPC has departed.
  // Previously visibility depended on timers/flags which made the bar disappear and
  // hard to read during tests. Keep it visible for easier playtesting.
  return !this.departed;
  }

  drawFaithBar() {
    const ratio = this.maxFaith > 0 ? Math.max(0, Math.min(1, this.faith / this.maxFaith)) : 0;
    const width = NPC_FAITH_BAR_WIDTH;
    const height = NPC_FAITH_BAR_HEIGHT;
    const barX = this.x - width / 2;
    const barY = this.y - this.radius - 14;
    if (LOG_NPC_FAITH_BAR && typeof console !== 'undefined' && console.debug) {
      console.debug &&
        console.debug('NPC.drawFaithBar', {
          type: this.type,
          faith: this.faith,
          maxFaith: this.maxFaith,
          ratio,
          barX,
          barY,
        });
    }
    const overlays = typeof window !== 'undefined' ? window.__battlechurchNpcFaithOverlays : null;
    if (Array.isArray(overlays)) {
      overlays.push({
        ratio,
        width,
        height,
        x: barX,
        y: barY,
        owner: this,
        damageFlash: this.damageFlashTimer > 0
          ? Math.min(1, this.damageFlashTimer / DAMAGE_FLASH_DURATION)
          : 0,
      });
      return;
    }
    ctx.save();
    const radius = Math.max(6, Math.floor(height / 2));
    ctx.fillStyle = 'rgba(10, 15, 31, 0.6)';
    roundRect(ctx, barX, barY, width, height, radius, true, false);
    const fillW = Math.max(0, Math.floor((width - 4) * ratio));
    if (fillW > 0) {
      ctx.fillStyle = NPC_FAITH_FILL_COLOR;
      ctx.fillRect(barX + 2, barY + 2, fillW, height - 4);
    }
    const faithFlash = this.faithDamageFlash;
    if (faithFlash?.timer > 0 && faithFlash.duration > 0) {
      const startRatio = Math.max(0, Math.min(1, faithFlash.startRatio || 0));
      const endRatio = Math.max(0, Math.min(1, faithFlash.endRatio || 0));
      const delta = Math.max(0, startRatio - endRatio);
      if (delta > 0) {
        const progress = 1 - faithFlash.timer / faithFlash.duration;
        const pulse = Math.abs(Math.sin(progress * Math.PI * (faithFlash.flashes || 3)));
        const alpha = 0.2 + 0.8 * pulse;
        const segmentX = barX + 2 + Math.floor((width - 4) * endRatio);
        const segmentW = Math.max(1, Math.floor((width - 4) * delta));
        ctx.fillStyle = `rgba(255, 246, 170, ${alpha.toFixed(3)})`;
        ctx.fillRect(segmentX, barY + 2, segmentW, height - 4);
      }
    }
    if (ratio > 0 && ratio <= 0.33) {
      try {
        const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const alpha = Math.abs(Math.sin(t * 0.01)) * 0.65;
        ctx.fillStyle = `rgba(255,60,60,${alpha.toFixed(3)})`;
        roundRect(
          ctx,
          barX + 2,
          barY + 2,
          width - 4,
          height - 4,
          Math.max(4, Math.floor((height - 4) / 2)),
          true,
          false,
        );
      } catch (e) {}
    } else if (ratio <= 0) {
      try {
        const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const alpha = 0.25 + Math.abs(Math.sin(t * 0.005)) * 0.45;
        ctx.fillStyle = `rgba(255,60,60,${alpha.toFixed(3)})`;
        roundRect(
          ctx,
          barX + 2,
          barY + 2,
          width - 4,
          height - 4,
          Math.max(4, Math.floor((height - 4) / 2)),
          true,
          false,
        );
      } catch (e) {}
    }
    if (this.damageFlashTimer > 0) {
      try {
        const t = (performance.now ? performance.now() : Date.now());
        const blinkOn = Math.sin(t * 0.03) > 0;
        if (blinkOn) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = "rgba(0,0,0,0.9)";
          roundRect(
            ctx,
            barX + 2,
            barY + 2,
            width - 4,
            height - 4,
            Math.max(4, Math.floor((height - 4) / 2)),
            true,
            false,
          );
          ctx.globalCompositeOperation = "source-over";
        }
      } catch (e) {}
    }
    // No special highlight for full health; keep the same fill color.
    ctx.restore();
  }

  draw() {
      if (this.departed) return;
      const flashStrength = this.damageFlashTimer > 0
        ? Math.min(1, Math.pow(this.damageFlashTimer / DAMAGE_FLASH_DURATION, 0.6))
        : 0;
      const glowTimer = this.projectileGlowTimer || 0;
      if (glowTimer > 0 && typeof drawProjectileGlow === "function") {
        const strength = Math.min(1, glowTimer / 0.22);
        const glowSize = Math.max(this.radius * 3.2, 76);
        ctx.save();
        ctx.translate(this.x, this.y);
        drawProjectileGlow(glowSize, glowSize, {
          radiusScale: 1.2,
          baseAlpha: 0.24 * strength,
          pulseScale: 0.28 * strength,
        });
        ctx.restore();
      }
      this.animator.draw(ctx, this.x, this.y, { flashWhite: flashStrength });
      if (this.shouldShowFaithBar()) {
        this.drawFaithBar();
      }
      // Ensure window.npcs is always up to date for renderer
      if (typeof window !== 'undefined') {
        window.npcs = npcs;
      }
    }
}

function getGenderedVariantBases(folder, gender) {
  const normalized = normalizeNpcGender(gender);
  const byGender = folder === "hair" ? npcVariants.hairByGender : npcVariants.clothingByGender;
  if (!byGender) return null;
  const base = byGender[normalized] || [];
  const unisex = byGender.unisex || [];
  const combined = [...base, ...unisex].filter(Boolean);
  return combined.map((entry) => entry.replace("_walk.png", "").replace(".png", ""));
}

const NPC_PIXEL_LAYER_ORDER = ["base", "legs", "chest", "hair", "head", "weapon"];
const NPC_PIXEL_MALE_BASES = {
  pale: "Base_character_Itchio_all_Male_Pale.png",
  pinkish: "Base_character_Itchio_all_Male_Pinkish.png",
  medium: "Base_character_Itchio_all_Male_medium.png",
  tanned: "Base_character_Itchio_all_Male_tanned.png",
  dark: "Base_character_Itchio_all_Male_dark.png",
};
const NPC_PIXEL_FEMALE_BASES = {
  pale: "Base_character_Itchio_all_Female_Pale.png",
  pinkish: "Base_character_Itchio_all_Female_Pinkish.png",
  medium: "Base_character_Itchio_all_Female_Medium.png",
  tanned: "Base_character_Itchio_all_Female_Tanned.png",
  dark: "Base_character_Itchio_all_Female_Dark.png",
};
const NPC_PIXEL_LAYER_CATALOG = {
  male: {
    base: Object.values(NPC_PIXEL_MALE_BASES),
    hair: [
      "Hair Male/Base_character_Male_Short_Brown.png",
      "Hair Male/Base_character_Male_Short_Dark_Blonde.png",
      "Hair Male/Base_character_Male_Long_Hair_Black_Unisex.png",
      "Hair Male/Base_character_Male_Hair_Blonde_with_beard.png",
      "Hair Male/Base_character_Male_Old_Man_Hair_Elegant.png",
    ],
    head: [
      "none",
      "Clothes Male/Head/Base_character_Male_Hat_Adventurer.png",
      "Clothes Male/Head/Base_character_Male_Hat_Wizard.png",
      "Clothes Male/Head/Base_character_Male_Helmet_Knight_Closed.png",
      "Clothes Male/Head/Base_character_Male_King_Crown.png",
      "Clothes Male/Head/Base_character_Male_Spooky_Pumpkin.png",
    ],
    chest: [
      "Clothes Male/Chest/Base_character_Male_Cape_Black.png",
      "Clothes Male/Chest/Base_character_Male_Cape_Green_Ranger.png",
      "Clothes Male/Chest/Base_character_Male_Fur_Armor.png",
      "Clothes Male/Chest/Base_character_Male_King_Cloak.png",
      "Clothes Male/Chest/Base_character_Male_Knight_Cape.png",
      "Clothes Male/Chest/Base_character_Male_Shirt_Royal_Blue.png",
      "Clothes Male/Chest/Base_character_Male_Shirt_Royal_Red.png",
      "Clothes Male/Chest/Base_character_Male_Shirt_beige.png",
      "Clothes Male/Chest/Base_character_Male_Shirt_with_Vest_RED_Elegant.png",
      "Clothes Male/Chest/Base_character_Male_Shirt_with_Vest_brown.png",
      "Clothes Male/Chest/Base_character_Male_Steel_Armor_Chest.png",
    ],
    legs: [
      "Clothes Male/Pants/Base_character_Male_Pants_Fur_Pants.png",
      "Clothes Male/Pants/Base_character_Male_Pants_Noble_Gold.png",
      "Clothes Male/Pants/Base_character_Male_Pants_Peasant.png",
      "Clothes Male/Pants/Base_character_Male_Pants_Villager.png",
      "Clothes Male/Pants/Base_character_Male_Pants_Villager_red.png",
      "Clothes Male/Pants/Base_character_Male_Steel_Armor_Legs.png",
    ],
    weapon: ["none"],
  },
  female: {
    base: Object.values(NPC_PIXEL_FEMALE_BASES),
    hair: [
      "Hair Female/Base_character_Female_Hair_Bun_Peasant_Brown.png",
      "Hair Female/Base_character_Female_Hair_Gray_Bun.png",
      "Hair Female/Base_character_Female_Hair_Long_Blond_Glossy.png",
      "Hair Female/Base_character_Female_Hair_Long_Purple_witchy.png",
      "Hair Female/Base_character_Female_Hair_Long_Unisex_Black.png",
      "Hair Female/Base_character_Female_Hair_Queen_Crown_Bun.png",
      "Hair Female/Base_character_Female_Hair_Short_Pixie.png",
    ],
    head: [
      "none",
      "Clothes Female/Head/Base_character_Female_Crown.png",
      "Clothes Female/Head/Base_character_Female_Hat_Adventurer.png",
      "Clothes Female/Head/Base_character_Female_Hat_Light_Brown_Turqoiuse.png",
      "Clothes Female/Head/Base_character_Female_Hat_White_red.png",
      "Clothes Female/Head/Base_character_Female_Hat_Witch.png",
      "Clothes Female/Head/Base_character_Female_Spooky_Pumpkin.png",
    ],
    chest: [
      "Clothes Female/Chest/Base_character_Female_Beige_Shirt_Adventurer.png",
      "Clothes Female/Chest/Base_character_Female_Black_Cape.png",
      "Clothes Female/Chest/Base_character_Female_Dress_Royal_Blue.png",
      "Clothes Female/Chest/Base_character_Female_Fur_Armor_Chest.png",
      "Clothes Female/Chest/Base_character_Female_Green_Ranger_Cape.png",
      "Clothes Female/Chest/Base_character_Female_Peasant_Red_Shirt.png",
      "Clothes Female/Chest/Base_character_Female_Peasant_White_Shirt.png",
      "Clothes Female/Chest/Base_character_Female_Purple_Witch_Dress.png",
      "Clothes Female/Chest/Base_character_Female_Villager_Pink_Skirt.png",
    ],
    legs: [
      "Clothes Female/Legs/Base_character_Female_Fur_Armor_Pants.png",
      "Clothes Female/Legs/Base_character_Female_Gold_Pants.png",
      "Clothes Female/Legs/Base_character_Female_Pants_Peasant.png",
      "Clothes Female/Legs/Base_character_Female_Pants_Villager.png",
      "Clothes Female/Legs/Base_character_Female_Peasant_Skirt_with_Apron.png",
    ],
    weapon: ["none"],
  },
};

function getNpcPixelConfig() {
  const cfg =
    typeof window !== "undefined" &&
    window.BATTLECHURCH_NPC_PAPERDOLL &&
    typeof window.BATTLECHURCH_NPC_PAPERDOLL === "object"
      ? window.BATTLECHURCH_NPC_PAPERDOLL
      : null;
  return cfg;
}

function normalizeNpcPixelRenderStyle(style) {
  if (!style || typeof style !== "object") return null;
  const shadowCrush = Number(style.shadowCrush);
  const shadowThreshold = Number(style.shadowThreshold);
  return {
    shadowCrush: Number.isFinite(shadowCrush) ? Math.max(0, Math.min(1, shadowCrush)) : 0,
    shadowThreshold: Number.isFinite(shadowThreshold) ? Math.max(0.02, Math.min(1, shadowThreshold)) : 0.5,
  };
}

function resolveNpcPixelRenderStyle(config) {
  const preferred = normalizeNpcPixelRenderStyle(config?.renderStyle);
  if (preferred) return preferred;
  return MASTER_ASSET_SHADOW_STYLE;
}

function applyShadowCrushToNpcSheet(context2d, width, height, renderStyle) {
  if (!context2d || !width || !height) return;
  const shadowCrush = Number.isFinite(renderStyle?.shadowCrush)
    ? Math.max(0, Math.min(1, renderStyle.shadowCrush))
    : 0;
  if (shadowCrush <= 0) return;
  const shadowThreshold = Number.isFinite(renderStyle?.shadowThreshold)
    ? Math.max(0.02, Math.min(1, renderStyle.shadowThreshold))
    : 0.5;
  let imageData = null;
  try {
    imageData = context2d.getImageData(0, 0, width, height);
  } catch (_e) {
    return;
  }
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (!a) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luminance >= shadowThreshold) continue;
    const under = (shadowThreshold - luminance) / shadowThreshold;
    const darken = Math.max(0, Math.min(1, under * shadowCrush));
    const mult = 1 - darken;
    pixels[i] = Math.max(0, Math.min(255, Math.round(r * mult)));
    pixels[i + 1] = Math.max(0, Math.min(255, Math.round(g * mult)));
    pixels[i + 2] = Math.max(0, Math.min(255, Math.round(b * mult)));
  }
  context2d.putImageData(imageData, 0, 0);
}

function buildNpcPixelAllowedPool(gender, layerKey, config, seed = []) {
  const catalog = (NPC_PIXEL_LAYER_CATALOG[gender]?.[layerKey] || []).slice();
  const includeMaleLegsForFemale = gender === "female" && layerKey === "legs";
  if (includeMaleLegsForFemale) {
    const maleLegs = NPC_PIXEL_LAYER_CATALOG?.male?.legs || [];
    catalog.push(...maleLegs);
  }
  const set = new Set([...catalog, ...(Array.isArray(seed) ? seed : [])].filter(Boolean));
  const full = [...set];
  const poolDef = config?.assetPool?.[layerKey] || null;
  const include = Array.isArray(poolDef?.include) ? poolDef.include.filter(Boolean) : [];
  const exclude = new Set(Array.isArray(poolDef?.exclude) ? poolDef.exclude.filter(Boolean) : []);
  let pool = include.length ? include.filter((t) => full.includes(t)) : full.filter((t) => !exclude.has(t));
  if (layerKey === "hair" || layerKey === "chest" || layerKey === "legs") {
    pool = pool.filter((t) => t !== "none");
  }
  if (!pool.length) {
    pool = full.filter((t) => (layerKey === "hair" || layerKey === "chest" || layerKey === "legs") ? t !== "none" : true);
  }
  if (includeMaleLegsForFemale) {
    const maleLegSet = new Set(NPC_PIXEL_LAYER_CATALOG?.male?.legs || []);
    const maleTokens = pool.filter((t) => maleLegSet.has(t));
    const femaleTokens = pool.filter((t) => !maleLegSet.has(t));
    if (maleTokens.length && femaleTokens.length) {
      // Weight male-leg picks to roughly a 2:1 ratio versus female-leg picks.
      const weightedPool = [];
      const maleRepeat = Math.max(1, femaleTokens.length * 2);
      const femaleRepeat = Math.max(1, maleTokens.length);
      maleTokens.forEach((token) => {
        for (let i = 0; i < maleRepeat; i += 1) weightedPool.push(token);
      });
      femaleTokens.forEach((token) => {
        for (let i = 0; i < femaleRepeat; i += 1) weightedPool.push(token);
      });
      pool = weightedPool;
    }
  }
  return pool;
}

function composeNpcPixelLayerSheet(layerTokens, sourceImages, rowBase = 0, renderStyle = null) {
  const frameW = NPC_PIXEL_FRAME_WIDTH;
  const frameH = NPC_PIXEL_FRAME_HEIGHT;
  const framesPerDir = 6;
  const dirs = ["front", "left", "right", "back"];
  const dirRowMap = { front: 0, back: 1, right: 2, left: 2 };
  const canvas = document.createElement("canvas");
  canvas.width = frameW * framesPerDir;
  canvas.height = frameH * dirs.length;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return null;
  ctx2d.imageSmoothingEnabled = false;
  for (const token of layerTokens) {
    if (!token || token === "none") continue;
    const img = sourceImages?.get?.(token) || null;
    if (!img || !img.complete || !img.naturalWidth) continue;
    for (let d = 0; d < dirs.length; d += 1) {
      const dir = dirs[d];
      const srcRow = (dirRowMap[dir] || 0) + rowBase;
      const mirror = dir === "left";
      for (let f = 0; f < framesPerDir; f += 1) {
        const sx = f * frameW;
        const sy = srcRow * frameH;
        const dx = f * frameW;
        const dy = d * frameH;
        if (sx + frameW > img.naturalWidth || sy + frameH > img.naturalHeight) continue;
        if (!mirror) {
          ctx2d.drawImage(img, sx, sy, frameW, frameH, dx, dy, frameW, frameH);
        } else {
          ctx2d.save();
          ctx2d.translate(dx + frameW, dy);
          ctx2d.scale(-1, 1);
          ctx2d.drawImage(img, sx, sy, frameW, frameH, 0, 0, frameW, frameH);
          ctx2d.restore();
        }
      }
    }
  }
  applyShadowCrushToNpcSheet(ctx2d, canvas.width, canvas.height, renderStyle);
  return canvas;
}

function createNpcPixelAppearance(gender = null) {
  const cfg = getNpcPixelConfig();
  const renderStyle = resolveNpcPixelRenderStyle(cfg);
  const sourceImages = assets?.npcs?.pixelLineImages;
  if (!cfg || !sourceImages || !(sourceImages instanceof Map)) return null;
  const g = normalizeNpcGender(gender);
  const seedTokensByLayer = {};
  if (Array.isArray(cfg.presets)) {
    cfg.presets.forEach((p) => {
      if (!p || typeof p !== "object") return;
      if (String(p.gender || "").toLowerCase() !== g) return;
      for (const layerKey of NPC_PIXEL_LAYER_ORDER) {
        const token = p?.layers?.[layerKey]?.asset;
        if (!seedTokensByLayer[layerKey]) seedTokensByLayer[layerKey] = [];
        if (token) seedTokensByLayer[layerKey].push(token);
      }
    });
  }
  if (cfg.current && typeof cfg.current === "object" && String(cfg.current.gender || "").toLowerCase() === g) {
    for (const layerKey of NPC_PIXEL_LAYER_ORDER) {
      const token = cfg?.current?.layers?.[layerKey]?.asset;
      if (!seedTokensByLayer[layerKey]) seedTokensByLayer[layerKey] = [];
      if (token) seedTokensByLayer[layerKey].push(token);
    }
  }
  const picks = {};
  for (const layerKey of NPC_PIXEL_LAYER_ORDER) {
    const pool = buildNpcPixelAllowedPool(g, layerKey, cfg, seedTokensByLayer[layerKey] || []);
    if (g === "female" && layerKey === "head") {
      const hasNone = pool.includes("none");
      const nonNonePool = pool.filter((token) => token !== "none");
      if (hasNone && nonNonePool.length > 0) {
        picks[layerKey] = Math.random() < 0.7
          ? "none"
          : (randomChoice(nonNonePool) || nonNonePool[0] || "none");
      } else {
        picks[layerKey] = randomChoice(pool) || pool[0] || "none";
      }
    } else {
      picks[layerKey] = randomChoice(pool) || pool[0] || "none";
    }
  }
  const walkLayers = [];
  const swingLayers = [];
  for (const layerKey of NPC_PIXEL_LAYER_ORDER) {
    if (layerKey === "weapon") continue;
    // Walk animation rows in this pack start after idle rows.
    const walkRowBase = 3;
    const sheet = composeNpcPixelLayerSheet([picks[layerKey]], sourceImages, walkRowBase, renderStyle);
    if (sheet) walkLayers.push(sheet);
    const swingSheet = composeNpcPixelLayerSheet(
      [picks[layerKey]],
      sourceImages,
      NPC_PIXEL_SWING_ROW_BASE,
      renderStyle,
    );
    if (swingSheet) swingLayers.push(swingSheet);
  }
  if (!walkLayers.length) return null;
  return {
    shadow: null,
    animations: {
      walk: {
        layers: walkLayers,
        frameDuration: NPC_WALK_FRAME_DURATION,
        framesPerDirection: 6,
        frameWidth: NPC_PIXEL_FRAME_WIDTH,
        frameHeight: NPC_PIXEL_FRAME_HEIGHT,
      },
      hurt: {
        layers: walkLayers,
        frameDuration: NPC_HURT_FRAME_DURATION,
        framesPerDirection: 1,
        frameWidth: NPC_PIXEL_FRAME_WIDTH,
        frameHeight: NPC_PIXEL_FRAME_HEIGHT,
      },
      attack: {
        layers: swingLayers.length ? swingLayers : walkLayers,
        frameDuration: NPC_PIXEL_SWING_FRAME_DURATION,
        framesPerDirection: NPC_PIXEL_SWING_FRAME_COUNT,
        frameWidth: NPC_PIXEL_FRAME_WIDTH,
        frameHeight: NPC_PIXEL_FRAME_HEIGHT,
        animateWhenIdle: true,
      },
    },
  };
}

function createNpcPixelAppearanceFromPresetName(presetName = "") {
  const cfg = getNpcPixelConfig();
  const renderStyle = resolveNpcPixelRenderStyle(cfg);
  const sourceImages = assets?.npcs?.pixelLineImages;
  if (!cfg || !sourceImages || !(sourceImages instanceof Map)) return null;
  const target = String(presetName || "").trim().toLowerCase();
  if (!target) return null;
  const preset = Array.isArray(cfg.presets)
    ? cfg.presets.find((p) => String(p?.name || "").trim().toLowerCase() === target)
    : null;
  if (!preset || typeof preset !== "object") return null;
  const g = normalizeNpcGender(preset.gender);
  const picks = {};
  for (const layerKey of NPC_PIXEL_LAYER_ORDER) {
    const token = preset?.layers?.[layerKey]?.asset;
    if (token && token !== "none") {
      picks[layerKey] = token;
      continue;
    }
    const pool = buildNpcPixelAllowedPool(g, layerKey, cfg, []);
    picks[layerKey] = randomChoice(pool) || pool[0] || "none";
  }
  const walkLayers = [];
  const swingLayers = [];
  for (const layerKey of NPC_PIXEL_LAYER_ORDER) {
    if (layerKey === "weapon") continue;
    const walkRowBase = 3;
    const sheet = composeNpcPixelLayerSheet([picks[layerKey]], sourceImages, walkRowBase, renderStyle);
    if (sheet) walkLayers.push(sheet);
    const swingSheet = composeNpcPixelLayerSheet(
      [picks[layerKey]],
      sourceImages,
      NPC_PIXEL_SWING_ROW_BASE,
      renderStyle,
    );
    if (swingSheet) swingLayers.push(swingSheet);
  }
  if (!walkLayers.length) return null;
  return {
    shadow: null,
    animations: {
      walk: {
        layers: walkLayers,
        frameDuration: NPC_WALK_FRAME_DURATION,
        framesPerDirection: 6,
        frameWidth: NPC_PIXEL_FRAME_WIDTH,
        frameHeight: NPC_PIXEL_FRAME_HEIGHT,
      },
      hurt: {
        layers: walkLayers,
        frameDuration: NPC_HURT_FRAME_DURATION,
        framesPerDirection: 1,
        frameWidth: NPC_PIXEL_FRAME_WIDTH,
        frameHeight: NPC_PIXEL_FRAME_HEIGHT,
      },
      attack: {
        layers: swingLayers.length ? swingLayers : walkLayers,
        frameDuration: NPC_PIXEL_SWING_FRAME_DURATION,
        framesPerDirection: NPC_PIXEL_SWING_FRAME_COUNT,
        frameWidth: NPC_PIXEL_FRAME_WIDTH,
        frameHeight: NPC_PIXEL_FRAME_HEIGHT,
        animateWhenIdle: true,
      },
    },
  };
}

function createRandomNpcLayers(gender = null) {
  const pixelAppearance = createNpcPixelAppearance(gender);
  if (pixelAppearance) return pixelAppearance;
  if (!assets?.npcs) return null;
  const { walk, hurt, eyes, shadow } = assets.npcs;
  if (!walk?.base || !hurt?.base) return null;

  const hairKeys = Object.keys(walk.hair || {});
  const clothesKeys = Object.keys(walk.clothes || {});
  const accessoryKeys = Object.keys(walk.accessories || {});

  const genderHairBases = getGenderedVariantBases("hair", gender);
  const genderClothingBases = getGenderedVariantBases("clothes", gender);
  const matchingHairKeys = genderHairBases
    ? hairKeys.filter((key) => genderHairBases.some((base) => key === base || key.startsWith(`${base}__`)))
    : hairKeys;
  const matchingClothesKeys = genderClothingBases
    ? clothesKeys.filter((key) => genderClothingBases.includes(key))
    : clothesKeys;

  const selectedHair = randomChoice(matchingHairKeys.length ? matchingHairKeys : hairKeys);
  const selectedClothing = randomChoice(matchingClothesKeys.length ? matchingClothesKeys : clothesKeys);
  let selectedAccessory = null;
  if (accessoryKeys.length && Math.random() < 0.35) {
    selectedAccessory = randomChoice(accessoryKeys);
  }

  const collectLayer = (collection, key) => {
    if (!collection) return null;
    return key ? collection[key] || null : null;
  };

  const walkLayers = [
    walk.base,
    eyes,
    walk.shoes,
    collectLayer(walk.clothes, selectedClothing),
    collectLayer(walk.hair, selectedHair),
    selectedAccessory ? collectLayer(walk.accessories, selectedAccessory) : null,
  ].filter(Boolean);

  const hurtLayers = [
    hurt.base,
    eyes,
    hurt.shoes || walk.shoes,
    collectLayer(hurt.clothes, selectedClothing) || collectLayer(walk.clothes, selectedClothing),
    collectLayer(hurt.hair, selectedHair) || collectLayer(walk.hair, selectedHair),
    selectedAccessory
      ? collectLayer(hurt.accessories, selectedAccessory) ||
        collectLayer(walk.accessories, selectedAccessory)
      : null,
  ].filter(Boolean);

  return {
    shadow,
    animations: {
      walk: {
        layers: walkLayers,
        frameDuration: NPC_WALK_FRAME_DURATION,
        framesPerDirection: NPC_COZY_WALK_FRAME_COUNT,
      },
      hurt: {
        layers: hurtLayers.length ? hurtLayers : walkLayers,
        frameDuration: NPC_HURT_FRAME_DURATION,
        framesPerDirection: 1,
      },
    },
  };
}

function normalizeNpcGender(gender) {
  if (gender === "male" || gender === "female") return gender;
  return Math.random() < 0.5 ? "male" : "female";
}

function ensureNpcNamesList() {
  if (!window.npcNamesByGender) {
    const maleNames = [
      "Aaron", "Adam", "Alex", "Ben", "Blake", "Brock", "Brad", "Carl", "Chris", "Cody", "Dave",
      "Derek", "Drew", "Ethan", "Frank", "Felix", "Fred", "Gabe", "Gary", "Gavin", "Greg", "Hank",
      "Henry", "Isaac", "Ivan", "Jesse", "Jonah", "Kevin", "Lance", "Logan", "Mason", "Miles", "Micah",
      "Nolan", "Oscar", "Owen", "Peter", "Perry", "Quinn", "Robin", "Roger", "Simon", "Scott", "Steve",
      "Terry", "Tony", "Trent", "Todd", "Ulis", "Vince", "Wade", "Wayne", "Zack", "Zane", "Yuri",
    ];
    const femaleNames = [
      "Abby", "Clara", "Diana", "Emma", "Emily", "Erin", "Fiona", "Helen", "Holly", "Irene", "Janet",
      "Jill", "Karen", "Katie", "Kelly", "Laura", "Linda", "Megan", "Naomi", "Nancy", "Olive", "Paige",
      "Rose", "Sarah", "Vicky", "Vera", "Wendy", "Xena", "Yael", "Zelda", "Erick", "Grace", "Avery",
      "Ashley", "Daisy", "Elise", "Ellen", "Jenna", "Julie", "Julia", "Lucy", "Maddie", "Maria",
    ];
    window.npcNamesByGender = {
      male: maleNames,
      female: femaleNames,
    };
    window.npcNamesList = [...maleNames, ...femaleNames];
  }
}

function pickNameForGender(gender) {
  ensureNpcNamesList();
  const normalized = normalizeNpcGender(gender);
  const list = window.npcNamesByGender?.[normalized] || window.npcNamesList || [];
  const key = `${normalized}NameIndex`;
  if (!Number.isFinite(window[key])) window[key] = 0;
  const name = list[window[key] % Math.max(1, list.length)] || "Friend";
  window[key] += 1;
  return name;
}

function resetYearNpcPool() {
  ensureNpcNamesList();
  window.npcYearNamePoolByGender = {
    male: shuffleArray(window.npcNamesByGender?.male || []),
    female: shuffleArray(window.npcNamesByGender?.female || []),
  };
  window.npcYearNamesUsedByGender = {
    male: new Set(),
    female: new Set(),
  };
}

function pickYearNpcName(gender) {
  ensureNpcNamesList();
  const normalized = normalizeNpcGender(gender);
  if (!window.npcYearNamePoolByGender || !window.npcYearNamePoolByGender[normalized]?.length) {
    resetYearNpcPool();
  }
  if (!window.npcYearNamesUsedByGender || !(window.npcYearNamesUsedByGender[normalized] instanceof Set)) {
    resetYearNpcPool();
  }
  const pool = window.npcYearNamePoolByGender[normalized] || [];
  const used = window.npcYearNamesUsedByGender[normalized];
  while (pool.length) {
    const name = pool.shift();
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const list = window.npcNamesByGender?.[normalized] || [];
  const remaining = list.filter((name) => !used.has(name));
  if (remaining.length) {
    window.npcYearNamePoolByGender[normalized] = shuffleArray(remaining);
    return pickYearNpcName(normalized);
  }
  resetYearNpcPool();
  const fallback = window.npcYearNamePoolByGender[normalized]?.shift();
  if (fallback) used.add(fallback);
  return fallback;
}

function getOffscreenNpcInviteName(excludedNames = []) {
  ensureNpcNamesList();
  const exclude = new Set(
    (Array.isArray(excludedNames) ? excludedNames : [])
      .map((name) => String(name || "").trim())
      .filter(Boolean),
  );
  const fullList = Array.isArray(window.npcNamesList) ? window.npcNamesList : [];
  const candidates = fullList.filter((name) => !exclude.has(name));
  if (!candidates.length) return null;
  return randomChoice(candidates) || candidates[0] || null;
}

function createCozyNpc() {
  const gender = normalizeNpcGender();
  const appearance = createRandomNpcLayers(gender);
  if (!appearance) return null;
  const name = pickYearNpcName(gender);
  const npc = new CozyNpc({ appearance });
  npc.name = name || "Friend";
  npc.gender = gender;
  return npc;
}

function createNpcPixelLinePreviewNpc() {
  const appearance =
    createNpcPixelAppearanceFromPresetName("Test1") ||
    createNpcPixelAppearance(normalizeNpcGender());
  if (!appearance) return null;
  const name = "Test1 NPC";
  const npc = new CozyNpc({ appearance });
  npc.name = name || "Friend";
  npc.gender = normalizeNpcGender("male");
  return npc;
}

function spawnCozyNpc() {
  const npc = createCozyNpc();
  if (!npc) return null;
  npcs.push(npc);
  return npc;
}

function resetCozyNpcs(count = 5) {
  npcs.splice(0, npcs.length);
  const targetCount = count ?? 5;
  for (let i = 0; i < targetCount; i += 1) {
    if (!spawnCozyNpc()) break;
  }
  if (!formationState.current) {
    formationState.current = "circle";
  }
  applyFormationAnchors();
}

function applyFormationAnchors() {
  if (!npcs.length) return;
  formationState.homePressure = 0;
  formationState.combatSpreadScaleCurrent = formationState.combatSpreadScale || 1.18;
  const anchors = computeFormationAnchors(npcs.length);
  if (!anchors.length) return;
  const jitter = formationState?.jitterRadius ?? 0;
  resetFormationSwaps();
  npcs.forEach((npc, idx) => {
    const anchor = anchors[idx % anchors.length];
    if (!anchor || !npc) return;
    npc.formationAnchor = { ...anchor };
    npc.x = anchor.x + randomInRange(-jitter * 0.12, jitter * 0.12);
    npc.y = anchor.y + randomInRange(-jitter * 0.1, jitter * 0.1);
    npc.baseX = npc.x;
    npc.baseY = npc.y;
    npc.zonePatrolSide = idx % 2 === 0 ? -1 : 1;
    npc.patrolClock = (idx / Math.max(1, npcs.length)) * Math.PI * 2;
    const briefingPoint = getNpcBriefingPoint(npc);
    npc.x = briefingPoint.x;
    npc.y = briefingPoint.y;
    npc.baseX = npc.x;
    npc.baseY = npc.y;
    npc.target = briefingPoint;
    npc.state = "wander";
    npc.formationWarmupTimer = 0;
    npc.idleTimer = 0;
    npc.zonePatrolCommitTimer = randomInRange(0.45, 0.75);
    npc.zoneMoveMode = "briefing";
    npc.hasSwappedThisBattle = false;
  });
}

function resetCongregationSize() {
  congregationSize = Number.isFinite(districtStartCongregation)
    ? districtStartCongregation
    : INITIAL_CONGREGATION_SIZE;
}

const NPC_LOSS_CONGREGATION_PENALTY = 5;

function adjustCongregationSize(delta) {
  if (!Number.isFinite(delta) || delta === 0) return congregationSize;
  congregationSize = Math.max(0, Math.round(congregationSize + delta));
  return congregationSize;
}

function handleNpcLostFromCongregation() {
  adjustCongregationSize(-NPC_LOSS_CONGREGATION_PENALTY);
}

function getCongregationSize() {
  return congregationSize;
}

function prepareNpcProcession() {
  if (!npcs.length) return false;
  const bounds = getPlayfieldBounds();
  const startXBase = -NPC_PROCESSION_ENTRY_MARGIN;
  npcs.forEach((npc, index) => {
    if (typeof npc.beginProcession !== "function") return;
    const laneY = randomInRange(bounds.minY, bounds.maxY);
    const homeBounds = getNpcHomeBounds();
    const target = {
      x: randomInRange(homeBounds.minX, homeBounds.maxX),
      y: randomInRange(homeBounds.minY, homeBounds.maxY),
    };
    const offset = index * 28;
    npc.beginProcession({
      startX: startXBase - offset,
      startY: laneY,
      target,
      speed: randomInRange(60, 90) * NPC_PROCESSION_SPEED_MULTIPLIER,
    });
  });
  npcProcessionActive = true;
  return true;
}

function areNpcProcessionsComplete() {
  if (!npcProcessionActive) return true;
  const allDone = npcs.every((npc) => (typeof npc.isInProcession === "function" ? !npc.isInProcession() : true));
  if (allDone) {
    npcProcessionActive = false;
  }
  return allDone;
}

function beginVisitorSession(options = {}) {
  if (visitorSession.active) return false;
  const { duration = VISITOR_SESSION_DURATION, autoTriggered = false, onComplete = null, level = 0 } = options || {};
  // Always use initial congregation size for consistent minigame difficulty
  const congregationCount = INITIAL_CONGREGATION_SIZE;
  const targetVisitors = VISITOR_GUEST_COUNT;
  const areaSpec = getCongregationSpawnAreaSpecs(Math.max(congregationCount, targetVisitors));
  const bounds = areaSpec.bounds;
  visitorSession.active = true;
  visitorSession.duration = duration;
  visitorSession.timer = duration;
  visitorSession.visitors = [];
  visitorSession.blockers = [];
  visitorSession.targetVisitors = targetVisitors;
  visitorSession.savedVisitors = 0;
  visitorSession.quietedBlockers = 0;
  visitorSession.onComplete = typeof onComplete === "function" ? onComplete : null;
  visitorSession.autoTriggered = Boolean(autoTriggered);
  visitorSession.sourceLevel = level || 0;
  visitorSession.bounds = bounds;
  visitorSession.ended = false;
  visitorSession.activeChatty = new Set();
  visitorSession.lockingBlockers = new Set();
  visitorSession.movementLock = false;
  visitorSession.summaryActive = false;
  visitorSession.introShown = false;
  visitorSession.summaryReason = null;
  visitorSession.awaitingSummaryConfirm = false;
  visitorSession.summaryReason = null;
  visitorSession.awaitingSummaryConfirm = false;
  visitorSession.newMemberPortraits = [];
  visitorSession.newMemberNames = [];
  visitorSession.introActive = true;
  visitorSession.usedNpcIds = new Set();
  visitorSession.usedChattyLines = new Set();
  visitorSession.recapShown = false;
  enemies.splice(0, enemies.length);
  projectiles.splice(0, projectiles.length);
  bossHazards.splice(0, bossHazards.length);
  clearAllPowerUps();
  clearGracePickups();
  activeBoss = null;
  if (player) {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    player.x = centerX;
    player.y = centerY;
    player.lockedPosition = null;
    clampEntityToBounds(player);
  }
  spawnVisitorGuests(bounds);
  spawnVisitorBlockers(bounds);
  if (player) {
    player.arrowCooldown = 0;
  }
  stopBattleMusicFast();
  startVisitorMusic();
  setDevStatus("Welcoming new visitors...", 3.2);
  return true;
}

function endVisitorSession({ reason = "completed" } = {}) {
  if (!visitorSession.active) return;
  try {
    visitorSession.visitors.forEach((guest) => {
      if (!guest) return;
      guest.removed = true;
      if (guest.speechBubble) {
        guest.speechBubble.life = 0;
        guest.speechBubble = null;
      }
    });
    visitorSession.blockers.forEach((blocker) => {
      if (!blocker) return;
      blocker.removed = true;
      if (blocker.speechBubble) {
        blocker.speechBubble.life = 0;
        blocker.speechBubble = null;
      }
    });
  } catch (err) {
    console.warn && console.warn("Failed to clear visitor speech bubbles", err);
  }
  visitorSession.active = false;
  visitorSession.visitors.length = 0;
  visitorSession.blockers.length = 0;
  visitorSession.timer = 0;
  visitorSession.ended = true;
  visitorSession.bounds = null;
  visitorSession.targetVisitors = VISITOR_GUEST_COUNT;
  visitorSession.activeChatty = new Set();
  visitorSession.lockingBlockers = new Set();
  visitorSession.movementLock = false;
  visitorSession.summaryActive = false;
  visitorSession.summaryReason = null;
  visitorSession.awaitingSummaryConfirm = false;
  visitorSession.introActive = false;
  visitorSession.newMemberPortraits = [];
  visitorSession.usedChattyLines = new Set();
  visitorSession.recapShown = false;
  clearAllPowerUps();
  clearGracePickups();
  stopRecapMusic();
  stopVisitorMusic();
  if (typeof window !== "undefined" && typeof window.resumeBattleMusicIfNeeded === "function") {
    window.resumeBattleMusicIfNeeded();
  }
  if (reason !== "reset" && reason !== "devCancel") {
    const message =
      reason === "timer"
        ? "Visitation hour ended"
        : reason === "allSaved"
          ? "Well done! Welcome new members!"
          : "Visitors welcomed";
    setDevStatus(message, 2.8);
  }
  if (pendingExteriorShotAfterVisitor) {
    queueExteriorShotAnnouncement({ force: true });
  }
  const callback = visitorSession.onComplete;
  visitorSession.onComplete = null;
  if (typeof callback === "function") {
    try {
      callback(reason);
    } catch (err) {
      console.warn && console.warn("Visitor session completion callback failed", err);
    }
  }
}

function completeVisitorSession(reason = "completed") {
  if (!visitorSession.active) return;
  endVisitorSession({ reason });
}

function spawnVisitorGuests(bounds) {
  const total = visitorSession.targetVisitors || VISITOR_GUEST_COUNT;
  for (let i = 0; i < total; i += 1) {
    const guest = createVisitorGuest(bounds, i, total);
    if (guest) visitorSession.visitors.push(guest);
  }
}

function spawnVisitorBlockers(bounds) {
  // Always use initial congregation size for consistent minigame difficulty
  const baseCount = INITIAL_CONGREGATION_SIZE;
  for (let i = 0; i < baseCount; i += 1) {
    const blocker = createVisitorBlocker(bounds, i, baseCount);
    if (blocker) visitorSession.blockers.push(blocker);
  }
  ensureChattyAssignments();
}

function distributedSpawnPosition(index, total, bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const columns = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / columns));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const col = index % columns;
  const row = Math.floor(index / columns);
  const baseX = bounds.minX + cellWidth * (col + 0.5);
  const baseY = bounds.minY + cellHeight * (row + 0.5);
  const jitterX = (Math.random() - 0.5) * cellWidth * 0.5;
  const jitterY = (Math.random() - 0.5) * cellHeight * 0.5;
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, baseX + jitterX)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, baseY + jitterY)),
  };
}

function getPlayfieldBounds() {
  const paddingX = 48;
  const paddingY = 48;
  return {
    minX: paddingX,
    maxX: canvas.width - paddingX,
    minY: HUD_HEIGHT + paddingY,
    maxY: canvas.height - paddingY,
  };
}

function randomSpreadPosition(bounds = null) {
  const area = bounds || getPlayfieldBounds();
  const minX = area.minX;
  const maxX = area.maxX;
  const minY = area.minY;
  const maxY = area.maxY;
  return {
    x: randomInRange(minX, Math.max(minX + 1, maxX)),
    y: randomInRange(minY, Math.max(minY + 1, maxY)),
  };
}

function clampPointToBounds(area, x, y) {
  return {
    x: Math.max(area.minX, Math.min(area.maxX, x)),
    y: Math.max(area.minY, Math.min(area.maxY, y)),
  };
}

function pushPointAwayFromCenter(area, point, ratio) {
  if (!ratio || ratio <= 0) return point;
  const centerX = (area.minX + area.maxX) / 2;
  const centerY = (area.minY + area.maxY) / 2;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const dist = Math.hypot(dx, dy);
  const maxRadius = Math.min(area.maxX - area.minX, area.maxY - area.minY) * 0.5;
  const avoidRadius = maxRadius * ratio;
  if (dist === 0) {
    return clampPointToBounds(area, centerX + avoidRadius, centerY);
  }
  if (dist >= avoidRadius) return point;
  const pushAmount = (avoidRadius - dist) + avoidRadius * 0.2;
  const nx = dx / dist;
  const ny = dy / dist;
  return clampPointToBounds(area, point.x + nx * pushAmount, point.y + ny * pushAmount);
}

function gridSpreadPosition(index, total, bounds = null, options = {}) {
  const area = bounds || getPlayfieldBounds();
  const width = Math.max(1, area.maxX - area.minX);
  const height = Math.max(1, area.maxY - area.minY);
  const totalCount = Math.max(1, total);
  const columnsOverride = Number.isFinite(options.columns) && options.columns > 0 ? Math.floor(options.columns) : null;
  const minColumns = Math.max(1, options.minColumns || 1);
  const baseColumns = Math.max(1, Math.ceil(Math.sqrt(totalCount)));
  const columns = columnsOverride || Math.max(minColumns, baseColumns);
  const rowsOverride = Number.isFinite(options.rows) && options.rows > 0 ? Math.floor(options.rows) : null;
  const rows = rowsOverride || Math.max(1, Math.ceil(totalCount / columns));
  const slotCount = columns * rows;
  const seed = Number.isFinite(options.seed) ? options.seed : 0;
  const slotIndex = ((index + seed) % slotCount + slotCount) % slotCount;
  const col = slotIndex % columns;
  const row = Math.floor(slotIndex / columns);
  const clampRange = (value) => Math.max(0, Math.min(1, value));
  const xRange = options.xRange || [0, 1];
  const yRange = options.yRange || [0, 1];
  const xStart = area.minX + width * clampRange(xRange[0] ?? 0);
  const xEnd = area.minX + width * clampRange(xRange[1] ?? 1);
  const yStart = area.minY + height * clampRange(yRange[0] ?? 0);
  const yEnd = area.minY + height * clampRange(yRange[1] ?? 1);
  const spanWidth = Math.max(1, xEnd - xStart);
  const spanHeight = Math.max(1, yEnd - yStart);
  const cellWidth = spanWidth / columns;
  const cellHeight = spanHeight / rows;
  const jitterRatio = Math.max(0, Math.min(0.48, options.jitterRatio ?? 0.35));
  const baseX = xStart + cellWidth * (col + 0.5);
  const baseY = yStart + cellHeight * (row + 0.5);
  const jitterX = (Math.random() - 0.5) * cellWidth * jitterRatio * 2;
  const jitterY = (Math.random() - 0.5) * cellHeight * jitterRatio * 2;
  let point = {
    x: baseX + jitterX,
    y: baseY + jitterY,
  };
  point = pushPointAwayFromCenter(area, point, options.avoidCenterRatio || 0);
  return clampPointToBounds(area, point.x, point.y);
}

function pickAnchorWanderPoint(entity, bounds, maxRadius = 150) {
  const area = bounds || getPlayfieldBounds();
  const anchorX = Math.max(area.minX, Math.min(area.maxX, entity.homeX ?? entity.x ?? (area.minX + area.maxX) / 2));
  const anchorY = Math.max(area.minY, Math.min(area.maxY, entity.homeY ?? entity.y ?? (area.minY + area.maxY) / 2));
  const radius = Math.max(20, maxRadius);
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;
  const targetX = anchorX + Math.cos(angle) * distance;
  const targetY = anchorY + Math.sin(angle) * distance;
  return clampPointToBounds(area, targetX, targetY);
}

function assignHomeWanderTarget(entity, bounds, radius = 140) {
  const point = pickAnchorWanderPoint(entity, bounds, radius);
  entity.targetX = point.x;
  entity.targetY = point.y;
  return point;
}

function getCongregationSpawnAreaSpecs(total = CONGREGATION_MEMBER_COUNT) {
  const paddingX = 60;
  const paddingTop = HUD_HEIGHT + 140;
  const paddingBottom = 100;
  const areaWidth = Math.max(120, canvas.width - paddingX * 2);
  const areaHeight = Math.max(120, canvas.height - paddingTop - paddingBottom);
  const bounds = {
    minX: paddingX,
    maxX: paddingX + areaWidth,
    minY: paddingTop,
    maxY: paddingTop + areaHeight,
  };
  const minColumns = 5;
  const totalCount = Math.max(1, total);
  const columns = Math.max(minColumns, Math.ceil(Math.sqrt(totalCount)));
  const rows = Math.max(1, Math.ceil(totalCount / columns));
  const cellWidth = areaWidth / columns;
  const cellHeight = areaHeight / rows;
  return { bounds, columns, rows, cellWidth, cellHeight };
}

function congregationStyleGridPosition(index, total, { jitterRatio = 0.3 } = {}) {
  const spec = getCongregationSpawnAreaSpecs(Math.max(1, total));
  return gridSpreadPosition(index, total, spec.bounds, {
    columns: spec.columns,
    rows: spec.rows,
    jitterRatio,
  });
}

function ensureChattyAssignments() {
  if (visitorSession.summaryActive) return;
  if (!Array.isArray(visitorSession.blockers)) return;
  const desired = 1;
  if (!(visitorSession.activeChatty instanceof Set)) {
    visitorSession.activeChatty = new Set();
  }
  const activeSet = visitorSession.activeChatty;
  visitorSession.blockers.forEach((blocker) => {
    if (!blocker || !blocker.id) return;
    if (
      !blocker.isChatty ||
      blocker.quieted ||
      !blocker.crowding
    ) {
      if (activeSet.has(blocker.id)) {
        activeSet.delete(blocker.id);
        clearChattyLine(blocker);
      }
      if (!blocker.quieted) {
        blocker.crowding = false;
        blocker.ignoreEntityCollisions = false;
        blocker.waiting = blocker.isChatty;
      }
    }
  });
  for (const blocker of visitorSession.blockers) {
    if (activeSet.size >= desired) break;
    if (!blocker || !blocker.isChatty || blocker.quieted || blocker.crowding) continue;
    const wasActive = activeSet.has(blocker.id);
    blocker.crowding = true;
    blocker.ignoreEntityCollisions = true;
    blocker.waiting = false;
    activeSet.add(blocker.id);
    const line = ensureChattyLine(blocker);
    if (!wasActive || !blocker.speechBubble) {
      blocker.chattyLine = line;
      showBlockerSpeech(blocker);
    }
  }
}

function ensureChattyLine(blocker) {
  if (!blocker || !blocker.id) return randomChoice(VISITOR_BLOCKER_LINES) || VISITOR_BLOCKER_LINES[0];
  if (!(visitorSession.chattyLines instanceof Map)) {
    visitorSession.chattyLines = new Map();
  }
  if (!(visitorSession.usedChattyLines instanceof Set)) {
    visitorSession.usedChattyLines = new Set();
  }
  const map = visitorSession.chattyLines;
  const usedChattyLines = visitorSession.usedChattyLines;
  if (map.has(blocker.id)) {
    blocker.chattyLine = map.get(blocker.id);
    return blocker.chattyLine;
  }
  const used = new Set([...map.values(), ...usedChattyLines]);
  const candidates = VISITOR_BLOCKER_LINES.filter((line) => !used.has(line));
  const line =
    randomChoice(candidates.length ? candidates : VISITOR_BLOCKER_LINES) ||
    VISITOR_BLOCKER_LINES[0];
  map.set(blocker.id, line);
  usedChattyLines.add(line);
  blocker.chattyLine = line;
  return line;
}

function clearChattyLine(blocker) {
  if (!(visitorSession.chattyLines instanceof Map)) return;
  if (!blocker || !blocker.id) return;
  visitorSession.chattyLines.delete(blocker.id);
  blocker.chattyLine = "";
}

function releaseChattyBlocker(blocker) {
  if (!blocker) return;
  const activeSet =
    visitorSession.activeChatty instanceof Set ? visitorSession.activeChatty : (visitorSession.activeChatty = new Set());
  activeSet.delete(blocker.id);
  clearChattyLine(blocker);
  blocker.crowding = false;
  blocker.ignoreEntityCollisions = false;
  blocker.waiting = false;
  blocker.engaged = false;
  const locking =
    visitorSession.lockingBlockers instanceof Set ? visitorSession.lockingBlockers : (visitorSession.lockingBlockers = new Set());
  locking.delete(blocker.id);
  visitorSession.movementLock = locking.size > 0;
  ensureChattyAssignments();
}

function createVisitorGuest(bounds, index = 0, total = VISITOR_GUEST_COUNT) {
  // NOTE: Names are assigned to visitor guests via 'name', but currently not showing up in-game.
  // TODO: Fix visitor NPC name display in future update.
  const gender = normalizeNpcGender();
  const appearance = createRandomNpcLayers(gender);
  if (!appearance) return null;
  const animator = new CozyNpcAnimator({
    animations: appearance.animations,
    shadow: appearance.shadow ?? null,
  });
  animator.setState("walk", { restart: true });
  animator.setMoving(true);
  const spawnPoint = congregationStyleGridPosition(index, total);
  // Assign a name from the global NPC name list
  const name = pickNameForGender(gender);
  const guest = {
    id: `guest_${Date.now()}_${index}`,
    type: "guest",
    animator,
    appearance,
    radius: NPC_RADIUS,
    maxFaith: VISITOR_GUEST_MAX_FAITH,
    faith: 0,
    x: spawnPoint.x,
    y: spawnPoint.y,
    targetX: spawnPoint.x,
    targetY: spawnPoint.y,
    speed: randomInRange(44, 62),
    saved: false,
    highlightTimer: 0,
    portrait: null,
    homeX: spawnPoint.x,
    homeY: spawnPoint.y,
    wanderRadius: 120,
    name,
    gender,
  };
  assignHomeWanderTarget(guest, bounds, guest.wanderRadius);
  guest.portrait = captureVisitorPortrait(guest);
  return guest;
}

function createVisitorFromNpcOffscreen(bounds, npc, side = "left") {
  if (!npc || !npc.appearance) return null;
  const appearance = npc.appearance;
  const animator = new CozyNpcAnimator({
    animations: appearance.animations,
    shadow: appearance.shadow ?? null,
  });
  animator.setState("walk", { restart: true });
  animator.setMoving(true);
  const margin = 60;
  const startX = side === "left" ? bounds.minX - margin : bounds.maxX + margin;
  const startY = randomInRange(bounds.minY, bounds.maxY);
  const targetX = (bounds.minX + bounds.maxX) / 2 + randomInRange(-40, 40);
  const targetY = (bounds.minY + bounds.maxY) / 2 + randomInRange(-40, 40);
  const name = npc.name || `Guest ${Math.floor(Math.random() * 1000)}`;
  const guest = {
    id: `guest_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    type: "guest",
    animator,
    appearance,
    radius: NPC_RADIUS,
    maxFaith: VISITOR_GUEST_MAX_FAITH,
    faith: 0,
    x: startX,
    y: startY,
    targetX,
    targetY,
    speed: randomInRange(44, 62),
    saved: false,
    highlightTimer: 0,
    portrait: null,
    homeX: targetX,
    homeY: targetY,
    wanderRadius: 120,
    name,
  };
  return guest;
}

function createVisitorBlocker(bounds, index = 0, total = VISITOR_GUEST_COUNT) {
  const appearance = createRandomNpcLayers();
  if (!appearance) return null;
  const animator = new CozyNpcAnimator({
    animations: appearance.animations,
    shadow: appearance.shadow ?? null,
  });
  animator.setState("walk", { restart: true });
  animator.setMoving(true);
  const isChatty = index < Math.ceil(Math.max(1, total) / 2);
  const spawnPoint = congregationStyleGridPosition(index, total);
  const blocker = {
    id: `blocker_${Date.now()}_${index}`,
    type: "blocker",
    animator,
    radius: NPC_RADIUS,
    x: Math.max(bounds.minX, Math.min(bounds.maxX, spawnPoint.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, spawnPoint.y)),
    speed: randomInRange(36, 58),
    crowding: false,
    hitsTaken: 0,
    speechBubble: null,
    targetX: spawnPoint.x,
    targetY: spawnPoint.y,
    quieted: false,
    isChatty,
    waiting: isChatty,
    engaged: false,
    homeX: Math.max(bounds.minX, Math.min(bounds.maxX, spawnPoint.x)),
    homeY: Math.max(bounds.minY, Math.min(bounds.maxY, spawnPoint.y)),
    wanderRadius: 160,
  };
  assignHomeWanderTarget(blocker, bounds, blocker.wanderRadius);
  return blocker;
}

function updateVisitorSession(dt) {
  if (!visitorSession.active) return;
  visitorWelcomeSayCooldown = Math.max(0, visitorWelcomeSayCooldown - dt);
  if (visitorSession.summaryActive) {
    visitorSession.timer = 0;
    return;
  }
  visitorSession.timer = Math.max(0, visitorSession.timer - dt);
  if (visitorSession.timer <= 0 && !visitorSession.summaryActive) {
    visitorSession.timer = 0;
    visitorSession.summaryActive = true;
    visitorSession.summaryReason = "timer";
    visitorSession.lockingBlockers = new Set();
    visitorSession.movementLock = false;
    visitorSession.activeChatty = new Set();
    visitorSession.blockers.forEach((blocker) => {
      blocker.crowding = false;
      blocker.ignoreEntityCollisions = false;
      blocker.engaged = false;
      blocker.waiting = false;
    });
    visitorSession.awaitingSummaryConfirm = true;
    return;
  }
  updateVisitorGuests(dt);
  updateVisitorBlockers(dt);
  updateVisitorProjectiles(dt);
  updateBossHazards(dt);
  updateFloatingTexts(dt);
  updateLevelAnnouncements(dt);
  updateDevStatus(dt);
  updateEffects(dt);
  if (!visitorSession.summaryActive && visitorSession.visitors.length && visitorSession.visitors.every((guest) => guest.saved)) {
    visitorSession.summaryActive = true;
    visitorSession.timer = 0;
    visitorSession.summaryReason = "allSaved";
    visitorSession.lockingBlockers = new Set();
    visitorSession.movementLock = false;
    visitorSession.activeChatty = new Set();
    visitorSession.blockers.forEach((blocker) => {
      blocker.crowding = false;
      blocker.ignoreEntityCollisions = false;
      blocker.engaged = false;
      blocker.waiting = false;
    });
    visitorSession.awaitingSummaryConfirm = true;
    return;
  }
}

function updateVisitorGuests(dt) {
  const bounds = visitorSession.bounds || getNpcHomeBounds();
  const guests = visitorSession.visitors;
  // Maintain at least 3 unsaved visitors by spawning new ones offscreen (left/right).
  const unsaved = guests.filter((g) => g && !g.saved);
  const needed = Math.max(0, 3 - unsaved.length);
  if (needed > 0) {
    const used = visitorSession.usedNpcIds instanceof Set ? visitorSession.usedNpcIds : (visitorSession.usedNpcIds = new Set());
    const candidates = npcs.filter(
      (npc) =>
        npc &&
        npc.active &&
        !npc.departed &&
        npc.state !== "lostFaith" &&
        npc.state !== "drained" &&
        !used.has(npc.id || npc.name),
    );
    for (let i = 0; i < needed; i += 1) {
      if (!candidates.length) break;
      const side = Math.random() < 0.5 ? "left" : "right";
      const idx = Math.floor(Math.random() * candidates.length);
      const npc = candidates.splice(idx, 1)[0];
      const guest = createVisitorFromNpcOffscreen(bounds, npc, side);
      if (guest) {
        visitorSession.visitors.push(guest);
        if (npc.id) used.add(npc.id);
        else if (npc.name) used.add(npc.name);
      }
    }
  }
  guests.forEach((guest) => {
    guest.animator.update(dt);
    const dx = (guest.targetX ?? guest.x) - guest.x;
    const dy = (guest.targetY ?? guest.y) - guest.y;
    const dist = Math.hypot(dx, dy);
    if (!dist || dist < 6) {
      assignHomeWanderTarget(guest, bounds, guest.wanderRadius || 130);
    } else {
      const step = guest.speed * dt;
      const nx = dx / dist;
      const ny = dy / dist;
      guest.x += nx * step;
      guest.y += ny * step;
      guest.animator.setDirectionFromVector(nx, ny);
      guest.animator.setMoving(true);
    }
    if (guest.highlightTimer > 0) guest.highlightTimer = Math.max(0, guest.highlightTimer - dt);
    resolveEntityObstacles(guest);
    clampEntityToBounds(guest);
  });
  guests.forEach((guest) => {
    resolveEntityCollisions(guest, guests, { allowPush: true, overlapScale: 0.9 });
    resolveEntityCollisions(guest, visitorSession.blockers, { allowPush: true, overlapScale: 0.9 });
  });
}

function updateVisitorBlockers(dt) {
  const bounds = visitorSession.bounds || getNpcHomeBounds();
  const blockers = visitorSession.blockers;
  ensureChattyAssignments();
  blockers.forEach((blocker) => {
    blocker.animator.update(dt);
    const isActiveChatter = blocker.isChatty && blocker.crowding && !blocker.quieted;
    if (isActiveChatter && player) {
      if (blocker.engaged) {
        alignBlockerAtPlayer(blocker);
      } else {
        const dx = player.x - blocker.x;
        const dy = player.y - blocker.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speedScale = blocker.isChatty ? 0.7 : 1;
        const speed = blocker.speed * 2.0 * speedScale;
        blocker.x += (dx / dist) * speed * dt;
        blocker.y += (dy / dist) * speed * dt;
        blocker.animator.setDirectionFromVector(dx, dy);
        blocker.animator.setMoving(true);
        if (circleIntersectsPlayerHurtbox(blocker.x, blocker.y, blocker.radius + 6, player)) {
          blocker.engaged = true;
          const locking =
            visitorSession.lockingBlockers instanceof Set
              ? visitorSession.lockingBlockers
              : (visitorSession.lockingBlockers = new Set());
          locking.add(blocker.id);
          visitorSession.movementLock = locking.size > 0;
          alignBlockerAtPlayer(blocker);
          showBlockerSpeech(blocker);
          // Start 'conversation' timer if not already started
          if (!blocker.conversationTimer) {
            blocker.conversationTimer = 2.0; // seconds
          }
        }
      }
    } else {
      wanderBlocker(blocker, bounds, dt);
      if (blocker.speechBubble && !blocker.crowding) {
        blocker.speechBubble.life = 0;
        blocker.speechBubble = null;
      }
    }
    // Handle conversation timer and appeasement
    if (blocker.engaged && blocker.conversationTimer) {
      blocker.conversationTimer -= dt;
      if (blocker.conversationTimer <= 0) {
        blocker.conversationTimer = null;
        blocker.quieted = true;
        blocker.engaged = false;
        releaseChattyBlocker(blocker);
        const bounds = visitorSession.bounds || getNpcHomeBounds();
        blocker.targetX = randomInRange(bounds.minX, bounds.maxX);
        blocker.targetY = randomInRange(bounds.minY, bounds.maxY);
        if (blocker.speechBubble) {
          blocker.speechBubble.life = 0;
          blocker.speechBubble = null;
        }
        visitorSession.lockingBlockers.delete(blocker.id);
        visitorSession.movementLock = visitorSession.lockingBlockers.size > 0;
        visitorSession.quietedBlockers += 1;
        npcCheer(blocker, "Thanks, pastor!", UI_COLOR.speechBubbleText, { life: 0.9 });
      }
    }
    resolveEntityObstacles(blocker);
    clampEntityToBounds(blocker);
  });
  blockers.forEach((blocker) => {
    resolveEntityCollisions(blocker, blockers, { allowPush: true, overlapScale: 0.95 });
  });
  if (player) {
    resolveEntityCollisions(player, blockers, { allowPush: true, overlapScale: 0.95 });
  }
}

function wanderBlocker(blocker, bounds, dt) {
  const dx = (blocker.targetX ?? blocker.x) - blocker.x;
  const dy = (blocker.targetY ?? blocker.y) - blocker.y;
  const dist = Math.hypot(dx, dy);
  if (!dist || dist < 8) {
    assignHomeWanderTarget(blocker, bounds, blocker.wanderRadius || 170);
  } else {
    const nx = dx / dist;
    const ny = dy / dist;
    const speedScale = blocker.isChatty ? 0.7 : 1;
    blocker.x += nx * blocker.speed * 0.8 * speedScale * dt;
    blocker.y += ny * blocker.speed * 0.8 * speedScale * dt;
    blocker.animator.setDirectionFromVector(nx, ny);
    blocker.animator.setMoving(true);
  }
}

function alignBlockerAtPlayer(blocker) {
  if (!player) return;
  const dx = player.x - blocker.x;
  const dy = player.y - blocker.y;
  const dist = Math.hypot(dx, dy) || 1;
  const playerHurtbox = getPlayerHitboxRect(player);
  const contactDistance = (playerHurtbox
    ? Math.max(playerHurtbox.width, playerHurtbox.height) * 0.5
    : player.radius || 24) + blocker.radius + 4;
  blocker.x = player.x - (dx / dist) * contactDistance;
  blocker.y = player.y - (dy / dist) * contactDistance;
  blocker.animator.setDirectionFromVector(dx, dy);
  blocker.animator.setMoving(false);
  showBlockerSpeech(blocker);
}

function updateVisitorProjectiles(dt) {
  if (!projectiles.length) return;
  const visitors = visitorSession.visitors;
  const blockers = visitorSession.blockers;
  const checkList = visitors.concat(blockers);
  projectiles.forEach((projectile) => {
    projectile.update(dt);
    if (!projectile.friendly) {
      projectile.dead = true;
      return;
    }
    if (projectile.dead) return;
    for (const entity of checkList) {
      if (!entity || entity.removed) continue;
      if (projectile.hitEntities && projectile.hitEntities.has(entity)) continue;
      if (visitorSession.movementLock) {
        const activeChatty =
          entity.type === "blocker" &&
          entity.isChatty &&
          !entity.quieted &&
          entity.crowding;
        if (!activeChatty) continue;
      }
      const hitRadius = (entity.radius || NPC_RADIUS) + (projectile.radius || 12);
      const dx = entity.x - projectile.x;
      const dy = entity.y - projectile.y;
      if (Math.hypot(dx, dy) <= hitRadius) {
        if (projectile.hitEntities) {
          projectile.hitEntities.add(entity);
        }
        applyHeartToEntity(entity, { flash: true });
        playVisitorHitSfx(0.85);
        projectile.onHit(entity);
        if (projectile.dead) break;
      }
    }
  });
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    if (projectiles[i].dead) {
      projectiles.splice(i, 1);
    }
  }
}

function showBlockerSpeech(blocker) {
  if (!blocker || blocker.speechBubble) return;
  const line = blocker.chattyLine || ensureChattyLine(blocker);
  blocker.speechBubble = addFloatingTextAt(blocker.x, blocker.y - blocker.radius - 24, line, UI_COLOR.speechBubbleText, {
    speechBubble: true,
    bubbleTheme: "npc",
    entity: blocker,
    offsetY: -blocker.radius - 24,
    life: 999,
    persist: true,
    priority: 140,
  });
}

function markVisitorGuestSaved(guest) {
  if (!guest || guest.saved) return;
  guest.saved = true;
  playVisitorSavedSfx(0.85);
  if (visitorSession) {
    visitorSession.savedVisitors = (visitorSession.savedVisitors || 0) + 1;
    visitorSession.newMemberPortraits = visitorSession.newMemberPortraits || [];
    visitorSession.newMemberNames = visitorSession.newMemberNames || [];
    if (guest.portrait) {
      visitorSession.newMemberPortraits.push(guest.portrait);
      visitorSession.newMemberNames.push(guest.name || "");
    }
  }
  seasonStats.visitorAdded = (seasonStats.visitorAdded || 0) + 1;
  adjustCongregationSize(1);
  spawnRayboltEffect(guest.x, guest.y - guest.radius / 2, (guest.radius || 28) * 1.5);
  npcCheer(guest, "I love it here!", UI_COLOR.speechBubbleText, { life: 1.3 });
}

function applyHeartToEntity(entity, options = {}) {
  if (!entity) return;
  if (entity.type === "guest") {
    if (entity.saved) {
      spawnVisitorHeartHitEffect(entity.x, entity.y - entity.radius / 2, { radius: entity.radius || 28 });
      return;
    }
    entity.faith = Math.min(entity.maxFaith, entity.faith + HEART_FAITH_PER_HIT);
    entity.highlightTimer = 0.4;
    if (visitorWelcomeSayCooldown <= 0) {
      heroSay("Welcome!", { life: 1.8 });
      visitorWelcomeSayCooldown = 2.5;
    }
    addFloatingTextAt(entity.x, entity.y - entity.radius - 18, "Welcome +1", UI_COLOR.teal, {
      life: 0.6,
      vy: -18,
    });
    if (options.flash) {
      try {
        if (typeof entity.animator?.flash === "function") {
          entity.animator.flash({ duration: 0.25, intensity: 1 });
        }
      } catch (e) {
        entity.highlightTimer = 0.4;
      }
      spawnFlashEffect(entity.x, entity.y - (entity.radius || 28) / 2);
    }
    if (!entity.saved && entity.faith >= entity.maxFaith) {
      markVisitorGuestSaved(entity);
    }
    return;
  }
  if (entity.type === "blocker") {
    const isActiveChatty = Boolean(entity.isChatty && entity.crowding && !entity.quieted);
    entity.hitsTaken = (entity.hitsTaken || 0) + 1;
    if (options.flash) {
      if (isActiveChatty) {
        try {
          if (typeof entity.animator?.flash === "function") {
            entity.animator.flash({ color: UI_COLOR.ice, duration: 0.35, intensity: 1.6 });
          }
        } catch (e) {}
        spawnMagicImpactEffect(entity.x, entity.y - (entity.radius || 26) / 2);
        spawnChattyHeartHitEffect(entity.x, entity.y - (entity.radius || 26) / 2, {
          radius: entity.radius || 26,
        });
      } else {
        try {
          if (typeof entity.animator?.flash === "function") {
            entity.animator.flash({ duration: 0.28, intensity: 1.2 });
          }
        } catch (e) {}
        spawnVisitorHeartHitEffect(entity.x, entity.y - (entity.radius || 26) / 2, {
          radius: entity.radius || 26,
        });
      }
    }
    if (entity.hitsTaken >= VISITOR_BLOCKER_HITS_REQUIRED && entity.crowding) {
      spawnChattyAppeaseEffect(entity.x, entity.y - entity.radius / 2, {
        radius: entity.radius || 26,
      });
      entity.quieted = true;
      releaseChattyBlocker(entity);
      const bounds = visitorSession.bounds || getNpcHomeBounds();
      entity.targetX = randomInRange(bounds.minX, bounds.maxX);
      entity.targetY = randomInRange(bounds.minY, bounds.maxY);
      if (entity.speechBubble) {
        entity.speechBubble.life = 0;
        entity.speechBubble = null;
      }
      visitorSession.quietedBlockers += 1;
      npcCheer(entity, "Thanks, pastor!", UI_COLOR.speechBubbleText, { life: 0.9 });
    }
  }
}

function boostVisitorFaithFromPrayerBomb(ratio = 0.5) {
  if (!visitorSession || !visitorSession.active) return;
  const guests = Array.isArray(visitorSession.visitors) ? visitorSession.visitors : [];
  const boostRatio = Math.max(0, ratio);
  if (!guests.length || boostRatio <= 0) return;
  guests.forEach((guest) => {
    if (!guest || guest.saved) return;
    const maxFaith = Math.max(1, guest.maxFaith || VISITOR_GUEST_MAX_FAITH);
    const gain = Math.max(1, Math.round(maxFaith * boostRatio));
    const previousFaith = guest.faith || 0;
    const nextFaith = Math.min(maxFaith, previousFaith + gain);
    if (nextFaith <= previousFaith) return;
    guest.faith = nextFaith;
    guest.highlightTimer = 0.6;
    const percent = Math.round((gain / maxFaith) * 100);
    addFloatingTextAt(guest.x, guest.y - guest.radius - 24, `Prayer Boost +${percent}%`, UI_COLOR.softWhite, {
      life: 0.9,
      vy: -14,
    });
    if (guest.faith >= maxFaith) {
      markVisitorGuestSaved(guest);
    }
  });
}

if (typeof window !== "undefined") {
  window.boostVisitorFaithFromPrayerBomb = boostVisitorFaithFromPrayerBomb;
}

function buildCongregationMembers(count = CONGREGATION_MEMBER_COUNT) {
  congregationMembers.splice(0, congregationMembers.length);
  congregationWanderBounds = null;
  congregationDialogueIndex = 0;
  if (isDevMeleeArenaActive()) return;
  if (!assets?.npcs) return;
  const total = Math.max(0, count);
  if (total === 0) return;
  const spec = getCongregationSpawnAreaSpecs(total);
  const { bounds, columns, rows, cellWidth, cellHeight } = spec;

  congregationWanderBounds = bounds;

  // Name assignment setup
  ensureNpcNamesList();
  if (!Number.isFinite(window.npcNameIndex)) window.npcNameIndex = 0;
  for (let i = 0; i < total; i += 1) {
    const gender = normalizeNpcGender();
    const appearance = createRandomNpcLayers(gender);
    if (!appearance) break;
    const animator = new CozyNpcAnimator({
      animations: appearance.animations,
      shadow: appearance.shadow ?? null,
    });
    animator.setState("walk", { restart: true });
    animator.setMoving(true);
    const column = i % columns;
    const row = Math.floor(i / columns);
    const jitterX = (Math.random() - 0.5) * cellWidth * 0.3;
    const jitterY = (Math.random() - 0.5) * cellHeight * 0.3;
    const rawBaseX = bounds.minX + cellWidth * (column + 0.5) + jitterX;
    const rawBaseY = bounds.minY + cellHeight * (row + 0.5) + jitterY;
    const baseResolved = resolvePointAgainstCornerCutoffs(
      rawBaseX,
      rawBaseY,
      {
        topY: Math.max(HUD_HEIGHT + 1, Number(CONGREGATION_PLAYER_TOP_Y) || HUD_HEIGHT + 1),
        sideInset: CONGREGATION_PLAYER_CORNER_CUTOFF_SIDE_INSET,
        depth: CONGREGATION_PLAYER_CORNER_CUTOFF_DEPTH,
      },
      canvas.width,
    );
    const baseX = baseResolved.x;
    const baseY = baseResolved.y;
    const name = pickNameForGender(gender) || `Friend ${i + 1}`;
    const member = {
      animator,
      x: baseX,
      y: baseY,
      baseX,
      baseY,
      radius: CONGREGATION_MEMBER_RADIUS,
      bobTimer: Math.random() * Math.PI * 2,
      wanderPause: Math.random() * 1.5,
      speed: randomInRange(11, 18) * WORLD_SCALE,
      name,
      gender,
    };
    assignCongregationTarget(member, { immediate: true });
    congregationMembers.push(member);
  }
}

function clearCongregationMembers() {
  congregationMembers.splice(0, congregationMembers.length);
  congregationWanderBounds = null;
}

function clearCongregationSpeechBubbles() {
  const congregationSet = new Set(congregationMembers);
  floatingTexts.forEach((ft) => {
    if (!ft?.speechBubble) return;
    if (ft.entity === player || congregationSet.has(ft.entity)) {
      ft.life = 0;
    }
  });
  congregationMembers.forEach((member) => {
    if (member?.dialogueBubble) {
      member.dialogueBubble.life = 0;
      member.dialogueBubble = null;
    }
  });
}

function assignCongregationTarget(member, { immediate = false } = {}) {
  if (!congregationWanderBounds) return;
  const targetX = randomInRange(congregationWanderBounds.minX, congregationWanderBounds.maxX);
  const targetY = randomInRange(congregationWanderBounds.minY, congregationWanderBounds.maxY);
  const resolved = resolvePointAgainstCornerCutoffs(
    targetX,
    targetY,
    {
      topY: Math.max(HUD_HEIGHT + 1, Number(CONGREGATION_PLAYER_TOP_Y) || HUD_HEIGHT + 1),
      sideInset: CONGREGATION_PLAYER_CORNER_CUTOFF_SIDE_INSET,
      depth: CONGREGATION_PLAYER_CORNER_CUTOFF_DEPTH,
    },
    canvas.width,
  );
  member.targetX = resolved.x;
  member.targetY = resolved.y;
  member.wanderPause = immediate ? 0 : randomInRange(0.18, 0.65);
}

function updateCongregationMembers(dt) {
  if (!congregationMembers.length) return;
  const bobSpeed = 2.0;
  congregationMembers.forEach((member) => {
    const prevBaseX = member.baseX;
    const prevBaseY = member.baseY;
    member.bobTimer += dt * bobSpeed;
    member.animator.update(dt);
    member.wanderPause = Math.max(0, (member.wanderPause || 0) - dt);
    const dx = (member.targetX ?? member.baseX) - member.baseX;
    const dy = (member.targetY ?? member.baseY) - member.baseY;
    const dist = Math.hypot(dx, dy);
    // Randomly insert brief idle breaks while wandering so members don't move nonstop.
    member.idleBreakTimer = Math.max(0, (member.idleBreakTimer || 0) - dt);
    if (member.wanderPause <= 0 && dist > 10 && member.idleBreakTimer <= 0) {
      if (Math.random() < 0.14) {
        member.wanderPause = randomInRange(2.8, 4.6);
        member.idleBreakTimer = randomInRange(2.2, 4.2);
      } else {
        member.idleBreakTimer = randomInRange(0.45, 1.1);
      }
    }
    // Periodically retarget while moving so members naturally change direction more often.
    member.retargetTimer = Math.max(0, (member.retargetTimer || 0) - dt);
    if (member.wanderPause <= 0 && dist > 18 && member.retargetTimer <= 0) {
      if (Math.random() < 0.22) {
        assignCongregationTarget(member, { immediate: true });
        member.retargetTimer = randomInRange(0.45, 0.95);
      } else {
        member.retargetTimer = randomInRange(0.25, 0.6);
      }
    }
    if (member.wanderPause <= 0 && dist > 2) {
      const step = Math.min(dist, (member.speed || 28) * dt);
      const nx = dx / dist;
      const ny = dy / dist;
      member.baseX += nx * step;
      member.baseY += ny * step;
    } else if (dist <= 2) {
      assignCongregationTarget(member);
    }
    const movedDx = member.baseX - prevBaseX;
    const movedDy = member.baseY - prevBaseY;
    const isMoving = Math.hypot(movedDx, movedDy) > 0.01;
    member.animator.setMoving(isMoving);
    if (isMoving) {
      member.animator.setDirectionFromVector(movedDx, movedDy);
    }
    member.x = member.baseX;
    member.y = member.baseY + (isMoving ? Math.sin(member.bobTimer) * 4 : 0);
  });
}

function updatePlayerDuringCongregation(dt) {
  if (!player) return;
  updateAimFromKeyboard();
  updateAimAssist();

    if (keysJustPressed.has("ArrowDown")) {
      playerDashState.pendingDashTimer = DASH_COMBO_GRACE;
      playerDashState.pendingDashDir = getDashButtonDirection();
      playerDashState.pendingComboCPressed = false;
    }
    if (playerDashState.pendingDashTimer > 0 && keysJustPressed.has("ArrowRight")) {
      playerDashState.pendingComboCPressed = true;
    }
    if (playerDashState.pendingDashTimer > 0) {
      const comboSwipe = window.Input?.peekComboSwipe?.();
      const comboSwipeActive =
        keysPressed.has("ArrowLeft") ||
        playerDashState.pendingComboCPressed ||
        (comboSwipe && ((comboSwipe.from === "A" && comboSwipe.to === "B") || (comboSwipe.from === "B" && comboSwipe.to === "A")));
      if (comboSwipeActive) {
        playerDashState.pendingDashTimer = 0;
      } else {
        playerDashState.pendingDashTimer = Math.max(0, playerDashState.pendingDashTimer - dt);
        if (playerDashState.pendingDashTimer === 0) {
          if (tryStartDash(playerDashState.pendingDashDir)) {
            keysJustPressed.delete("ArrowDown");
          }
        }
      }
    }

  // Update dash movement
  if (playerDashState.isDashing) {
    updateDashMovement(dt);
  }

  // Suppress prayer bomb before player.update consumes it.
  // Must re-derive bothFull here rather than relying on acSuperArmed, because acSuperArmed
  // is set by updatePlayer's pre-suppression block which runs AFTER this player.update() call.
  if (window._meleeAttackState && player && typeof Input !== "undefined") {
    const _ms = window._meleeAttackState;
    const prayerSuperCost = (player.prayerChargeRequired || 6000) / 3;
    const aFullyCharged =
      _ms.isCharging &&
      _ms.buttonDown &&
      _ms.chargeTimer >= (_ms.holdTime || 0);
    const acComboActive =
      _ms.acSuperArmed ||
      (aFullyCharged && player.prayerHoldLocked && (player.prayerCharge || 0) >= prayerSuperCost) ||
      (aFullyCharged && keysPressed.has("ArrowRight"));
    const acPostReleaseBlocking = (_ms.acSuperPrayerBombBlockTimer || 0) > 0;
    const cHeldNow = keysPressed.has("ArrowRight");
    const bCInterceptActive = Boolean((_ms.spinButtonDown || _ms.spinCharging) && cHeldNow);
    if (acComboActive || acPostReleaseBlocking || bCInterceptActive || _ms.bcTeleportArmed) {
      Input.prayerBombClickQueued = false;
    }
    if ((acComboActive || acPostReleaseBlocking) && typeof cancelCongregationTap === "function") {
      cancelCongregationTap();
    }
  }
  player.update(dt);
  clampEntityToBounds(player);
}

function clampToWanderBounds(member) {
  if (!congregationWanderBounds || !member) return;
  member.baseX = Math.max(congregationWanderBounds.minX, Math.min(congregationWanderBounds.maxX, member.baseX));
  member.baseY = Math.max(congregationWanderBounds.minY, Math.min(congregationWanderBounds.maxY, member.baseY));
  const resolved = resolvePointAgainstCornerCutoffs(
    member.baseX,
    member.baseY,
    {
      topY: Math.max(HUD_HEIGHT + 1, Number(CONGREGATION_PLAYER_TOP_Y) || HUD_HEIGHT + 1),
      sideInset: CONGREGATION_PLAYER_CORNER_CUTOFF_SIDE_INSET,
      depth: CONGREGATION_PLAYER_CORNER_CUTOFF_DEPTH,
    },
    canvas.width,
  );
  member.baseX = resolved.x;
  member.baseY = resolved.y;
}

function getCongregationBobOffset(member) {
  return member?.animator?.moving ? Math.sin(member.bobTimer) * 4 : 0;
}

function resolveCongregationCollisions() {
  if (!player || !congregationMembers.length) return;
  const playerRadius = player.radius || 24;
  congregationMembers.forEach((member) => {
    const dx = player.x - member.x;
    const dy = player.y - member.y;
    const distance = Math.hypot(dx, dy);
    const minDistance = (member.radius || CONGREGATION_MEMBER_RADIUS) + playerRadius * 0.85;
    if (distance === 0) {
      player.x += (Math.random() - 0.5) * 0.5;
      player.y += (Math.random() - 0.5) * 0.5;
      return;
    }
    if (distance < minDistance) {
      const overlap = minDistance - distance;
      const nx = dx / distance;
      const ny = dy / distance;
      player.x += nx * overlap;
      player.y += ny * overlap;
      player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
      const stage = levelManager?.getStatus?.()?.stage || "";
      const isCongregationStage = isCongregationBoundsStage(stage);
      const congregationTopLimit = Math.max(HUD_HEIGHT + 1, Number(CONGREGATION_PLAYER_TOP_Y) || (HUD_HEIGHT + (player.radius || 0)));
      const defaultTopLimit = HUD_HEIGHT + (player.radius || 0);
      const topLimit = isCongregationStage ? congregationTopLimit : defaultTopLimit;
      player.y = Math.max(topLimit, Math.min(canvas.height - player.radius, player.y));
      member.baseX -= nx * overlap * 0.35;
      member.baseY -= ny * overlap * 0.35;
      clampToWanderBounds(member);
      member.x = member.baseX;
      member.y = member.baseY + getCongregationBobOffset(member);
    }
  });
}

function resolveCongregationMemberCollisions() {
  const count = congregationMembers.length;
  if (count <= 1) return;
  for (let i = 0; i < count; i += 1) {
    const a = congregationMembers[i];
    for (let j = i + 1; j < count; j += 1) {
      const b = congregationMembers[j];
      const dx = a.baseX - b.baseX;
      const dy = a.baseY - b.baseY;
      const distance = Math.hypot(dx, dy);
      const minDistance = (a.radius || CONGREGATION_MEMBER_RADIUS) + (b.radius || CONGREGATION_MEMBER_RADIUS);
      if (distance === 0) {
        const nudge = 0.5;
        a.baseX += nudge;
        b.baseX -= nudge;
        continue;
      }
      if (distance < minDistance) {
        const overlap = (minDistance - distance) * 0.5;
        const nx = dx / distance;
        const ny = dy / distance;
        a.baseX += nx * overlap;
        a.baseY += ny * overlap;
        b.baseX -= nx * overlap;
        b.baseY -= ny * overlap;
        clampToWanderBounds(a);
        clampToWanderBounds(b);
      }
    }
    a.x = a.baseX;
    a.y = a.baseY + getCongregationBobOffset(a);
  }
  const last = congregationMembers[count - 1];
  last.x = last.baseX;
  last.y = last.baseY + getCongregationBobOffset(last);
}

function getNextCongregationDialogueLine() {
  if (!Array.isArray(CONGREGATION_DIALOGUE_LINES) || !CONGREGATION_DIALOGUE_LINES.length) return null;
  const line = CONGREGATION_DIALOGUE_LINES[congregationDialogueIndex % CONGREGATION_DIALOGUE_LINES.length];
  congregationDialogueIndex = (congregationDialogueIndex + 1) % CONGREGATION_DIALOGUE_LINES.length;
  return line;
}

function triggerCongregationMemberDialogue(member) {
  if (!member) return false;
  const line = getNextCongregationDialogueLine();
  if (!line) return false;
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
      life: 6.4,
      entity: member,
      offsetY: -member.radius - 20,
      bubbleTheme: "npc",
    },
  );
  member.dialogueBubble = bubble || null;
  member.dialogueCooldownUntil =
    (typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now()) + CONGREGATION_DIALOGUE_COOLDOWN_MS;
  return Boolean(bubble);
}

function tryTriggerCongregationDialogueFromMelee(dir, swingCenterX, swingCenterY, attackRect) {
  if (!player || !congregationMembers.length) return false;
  const status = typeof levelManager?.getStatus === "function" ? levelManager.getStatus() : null;
  if (status?.stage === "levelIntro") return false;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const attackAngle = Math.atan2(dir.y, dir.x);
  const cos = Math.cos(-attackAngle);
  const sin = Math.sin(-attackAngle);
  let bestMember = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  congregationMembers.forEach((member) => {
    if (!member) return;
    if (Number.isFinite(member.dialogueCooldownUntil) && now < member.dialogueCooldownUntil) return;
    const relX = member.x - player.x;
    const relY = member.y - player.y;
    const hitRadius = member.radius || CONGREGATION_MEMBER_RADIUS;
    let hit = false;
    if (attackRect) {
      const localX = relX * cos - relY * sin;
      const localY = relX * sin + relY * cos;
      hit = circleIntersectsRect(localX, localY, hitRadius, attackRect);
    } else {
      const dx = member.x - swingCenterX;
      const dy = member.y - swingCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= MELEE_SWING_RANGE + hitRadius) {
        const dotProduct = dx * dir.x + dy * dir.y;
        hit = !(dotProduct < 0 && dist > MELEE_CLOSE_RANGE + hitRadius);
      }
    }
    if (!hit) return;
    const distance = Math.hypot(relX, relY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMember = member;
    }
  });
  if (!bestMember) return false;
  return triggerCongregationMemberDialogue(bestMember);
}

function updateCozyNpcs(dt, options = {}) {
  const previewOnly = Boolean(options?.previewOnly);
  const levelStatus = typeof levelManager?.getStatus === "function" ? levelManager.getStatus() : null;
  const stageName = levelStatus?.stage || "";
  const isVictoryCalmStage =
    stageName === "victoryCelebrate" ||
    (stageName === "graceRush" && graceRushState.reason !== "boss");
  const npcMotionTimeScale = isVictoryCalmStage ? 0.25 : 1;
  const shouldRestoreVictoryNpcAlpha = stageName !== "victoryCelebrate" && stageName !== "graceRush";
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const freezeResourceMeters =
    typeof window !== "undefined" && Boolean(window.__battlechurchFreezeResourceMeters);
  const npcResourceDt = freezeResourceMeters ? 0 : dt;
  if (npcsSuspended) return;
  if (!previewOnly && formationState) {
    formationState.swapCooldown = Math.max(0, (formationState.swapCooldown || 0) - dt);
  }
  if (!previewOnly) {
    updateNpcFormationPressure(dt);
  }
  if (!previewOnly && npcWeaponState.timer > 0) {
    npcWeaponState.timer = Math.max(0, npcWeaponState.timer - npcResourceDt);
    if (npcWeaponState.timer <= 0) {
      npcWeaponState.mode = null;
      npcWeaponState.duration = 0;
      npcWeaponState.damageMultiplier = 1;
      npcWeaponState.cooldownMultiplier = 1;
      npcWeaponState.speedMultiplier = 1;
    }
  }
  if (!previewOnly) {
    maybeSwapNpcPositions();
  }
  function applyEnemyCollisionDamageToNpc(npcEntity) {
    if (!npcEntity || npcEntity.departed || !npcEntity.active) return;
    if (typeof npcEntity.isEnsnared === "function" && npcEntity.isEnsnared()) return false;
    let damageApplied = false;
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    for (const enemy of enemies) {
      if (!enemy || enemy.dead || enemy.state === "death") continue;
      if (enemy.type === "ghost") continue;
      const center = getEnemyHitboxCenter(enemy);
      const dx = center.x - npcEntity.x;
      const dy = center.y - npcEntity.y;
      const distance = Math.hypot(dx, dy);
      const overlapRadius = getEnemyHitboxRadius(enemy) + (npcEntity.radius || 0);
      if (distance > overlapRadius) continue;
      enemy._forcedTarget = npcEntity;
      enemy._forcedTargetUntil = now + 800;
      if (!enemy.isRanged && enemy.attackTimer <= 0 && enemy.state !== "attack") {
        enemy.state = "attack";
        if (enemy.animator) enemy.animator.play("attack", { restart: true });
        enemy.attackHitApplied = false;
      }
      if (
        enemy.state === "attack" &&
        Number.isFinite(enemy.config?.attackHitFrame) &&
        enemy.config.attackHitFrame > 0
      ) {
        continue;
      }
      if (isEnemyInKnockback(enemy)) continue;
      if ((npcEntity.damageCooldown || 0) > 0) continue;
      if (npcEntity.faith <= 0) continue;
      const enemyDamage = getEnemyContactDamageValue(enemy);
      if (!enemyDamage) continue;
      // Apply the full configured enemy damage to NPCs (no reduction).
      const scaled = Math.max(1, Math.round(enemyDamage));
      npcEntity.sufferAttack(scaled, { sourceType: enemy.type });
      damageApplied = true;
      break;
    }
    return damageApplied;
  }

  function updateNpcCongregationVolley(npcEntity) {
    const volley = npcEntity?.pendingCongregationVolley || null;
    if (!volley) return false;
    volley.delay = Math.max(0, (volley.delay || 0) - dt);
    if (volley.delay > 0) return true;
    fireCongregationVolleyShot(npcEntity, volley);
    npcEntity.pendingCongregationVolley = null;
    return false;
  }

  function resolveCozyNpcCrowding() {
    if (npcs.length <= 1) return;
    for (let i = 0; i < npcs.length; i += 1) {
      const a = npcs[i];
      if (!a || a.departed || !a.active) continue;
      for (let j = i + 1; j < npcs.length; j += 1) {
        const b = npcs[j];
        if (!b || b.departed || !b.active) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = ((a.radius || NPC_RADIUS) + (b.radius || NPC_RADIUS)) * 0.92;
        if (distance === 0) {
          a.x += 0.75;
          b.x -= 0.75;
          continue;
        }
        if (distance >= minDistance) continue;
        const overlap = (minDistance - distance) * 0.5;
        const nx = dx / distance;
        const ny = dy / distance;
        a.x += nx * overlap;
        a.y += ny * overlap;
        b.x -= nx * overlap;
        b.y -= ny * overlap;
        clampEntityToBounds(a);
        clampEntityToBounds(b);
      }
    }
  }

  for (let i = npcs.length - 1; i >= 0; i -= 1) {
    const npc = npcs[i];
    if (shouldRestoreVictoryNpcAlpha && Number.isFinite(npc?.graceRushNpcFadeAlpha)) {
      npc.graceRushNpcFadeAlpha = 1;
      npc.graceRushFarewellIndex = null;
      npc.graceRushNpcFadeStartAt = null;
      npc.graceRushNpcFadeDurationMs = null;
    } else if (isVictoryCalmStage && Number.isFinite(npc?.graceRushNpcFadeStartAt)) {
      const fadeStartAt = npc.graceRushNpcFadeStartAt;
      const fadeDurationMs = Math.max(300, Number(npc.graceRushNpcFadeDurationMs) || 1200);
      const progress = Math.max(0, Math.min(1, (now - fadeStartAt) / fadeDurationMs));
      npc.graceRushNpcFadeAlpha = Math.max(0, 1 - progress);
    }
    if (!previewOnly) {
      const timerScale = getNpcTimerScale();
      npc.damageCooldown = Math.max(0, (npc.damageCooldown || 0) - dt * timerScale);
    }
    npc.update(dt * npcMotionTimeScale, { previewOnly });

    // Player-touch restores NPCs to full faith
    try {
      if (!previewOnly) {
      const inGraceRush = stageName === "graceRush";
      if (
        ((npc.state === "lostFaith" || npc.state === "drained") || inGraceRush) &&
        player &&
        npc &&
        !npc.departed &&
        npc.active
      ) {
        if (circleIntersectsPlayerHurtbox(npc.x, npc.y, (npc.radius || 20) * 0.7, player)) {
          // Restore up to 50% max faith when touched by the player (drained or not).
          const maxFaith = npc.maxFaith || 1;
          const targetHalf = Math.floor(maxFaith * 0.5);
          const missingToHalf = Math.max(0, targetHalf - (npc.faith || 0));
          if (missingToHalf > 0) {
            const restoredFaith = npc.receiveFaith(missingToHalf, {
              allowFromZero: true,
              bypassSuppression: true,
            });
            if (restoredFaith) {
              spawnFlashEffect(npc.x, npc.y - npc.radius / 2);
            }
          }
        }
      }
      }
    } catch (err) {
      console.warn && console.warn('npc touch restore failed', err);
    }

    // Collision handling: let NPCs interact with other entities and obstacles.
    try {
      const leaving = npc.state === "lostFaith" || (typeof npc.isEnsnared === "function" && npc.isEnsnared());
      if (!leaving) {
        // NPCs should collide with the player (can be pushed), enemies (allow push),
        // other weapon pickups, and utility power-ups so they can't pass through pickups.
        if (!previewOnly) {
          const trashPhasingThroughNpcs = Boolean(window?._meleeAttackState?.blankaRollActive);
          if (player && !npc.departed && npc.active && !trashPhasingThroughNpcs) {
            resolveEntityCollisions(npc, [player], { allowPush: true, overlapScale: 0.85 });
          }
          resolveEntityCollisions(npc, enemies, { allowPush: true, overlapScale: 0.85 });
          resolveEntityCollisions(npc, weaponPickups, { allowPush: true, overlapScale: 0.9 });
          resolveEntityCollisions(npc, churchPowerupPickups, { allowPush: true, overlapScale: 0.9 });
          resolveEntityCollisions(npc, utilityPowerUps, { allowPush: false, overlapScale: 0.9 });
        }
        // Respect world obstacles (trees, walls, etc.) so NPCs don't walk through them.
        resolveEntityObstacles(npc);
        clampEntityToBounds(npc);
        if (!previewOnly) {
          applyEnemyCollisionDamageToNpc(npc);
        }
      }
    } catch (err) {
      console.warn && console.warn('NPC collision resolution failed', err);
    }

    // allow NPCs at full faith to attempt firing at enemies
    const congregationVolleyPending = previewOnly ? false : updateNpcCongregationVolley(npc);
    try {
      if (!previewOnly && !congregationVolleyPending) {
        npc.tryNpcFire(dt);
      }
    } catch (e) {}

    if (npc.departed) {
      npcs.splice(i, 1);
    }
  }
  resolveCozyNpcCrowding();
}

function getCongregationVolleyDirectionForNpc(npc, clusterCenter, playerAim) {
  const laneBase = normalizeVector((npc.x || 0) - clusterCenter.x, (npc.y || 0) - clusterCenter.y);
  const laneDir = laneBase.x !== 0 || laneBase.y !== 0 ? laneBase : playerAim;
  let preferredDir = null;
  let preferredScore = Infinity;
  let fallbackDir = null;
  let fallbackScore = Infinity;

  const evaluate = (targetX, targetY) => {
    const dx = targetX - npc.x;
    const dy = targetY - npc.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const dir = normalizeVector(dx, dy);
    const dot = dir.x * laneDir.x + dir.y * laneDir.y;
    const anglePenalty = 1 - Math.max(-1, Math.min(1, dot));
    const score = anglePenalty * 900 + dist;
    if (dot >= 0.55) {
      if (score < preferredScore) {
        preferredScore = score;
        preferredDir = dir;
      }
    } else if (score < fallbackScore) {
      fallbackScore = score;
      fallbackDir = dir;
    }
  };

  enemies.forEach((enemy) => {
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    const center = getEnemyHitboxCenter(enemy);
    evaluate(center.x, center.y);
  });
  projectiles.forEach((proj) => {
    if (!proj || proj.dead || proj.friendly || proj.visualOnly) return;
    evaluate(proj.x, proj.y);
  });

  return preferredDir || fallbackDir || laneDir;
}

function getCongregationPathCommandTarget(playerEntity = player) {
  if (!playerEntity) return null;
  const pickupCandidates = [];
  const addPickup = (pickup) => {
    if (!pickup || pickup.active === false || pickup.visible === false || pickup.expired) return;
    const dx = (pickup.x || 0) - playerEntity.x;
    const dy = (pickup.y || 0) - playerEntity.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0 || dist > 280) return;
    pickupCandidates.push({ x: pickup.x, y: pickup.y, dist });
  };
  utilityPowerUps.forEach(addPickup);
  weaponPickups.forEach(addPickup);
  churchPowerupPickups.forEach(addPickup);
  pickupCandidates.sort((a, b) => a.dist - b.dist);
  if (pickupCandidates.length) {
    return { x: pickupCandidates[0].x, y: pickupCandidates[0].y, pickupBias: true };
  }

  let bestTarget = null;
  let bestScore = Infinity;
  const evaluate = (x, y) => {
    const dx = x - playerEntity.x;
    const dy = y - playerEntity.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0 || dist > 320) return;
    const score = dist;
    if (score < bestScore) {
      bestScore = score;
      bestTarget = { x, y, pickupBias: false };
    }
  };
  enemies.forEach((enemy) => {
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    const center = getEnemyHitboxCenter(enemy);
    evaluate(center.x, center.y);
  });
  projectiles.forEach((proj) => {
    if (!proj || proj.dead || proj.friendly || proj.visualOnly) return;
    evaluate(proj.x, proj.y);
  });
  return bestTarget;
}

function getCongregationPathDirectionForNpc(npc, volley, fallbackAim) {
  const targetX = Number.isFinite(volley?.targetX) ? volley.targetX : npc.x + fallbackAim.x * 180;
  const targetY = Number.isFinite(volley?.targetY) ? volley.targetY : npc.y + fallbackAim.y * 180;
  const playerX = Number.isFinite(volley?.playerX) ? volley.playerX : npc.x;
  const playerY = Number.isFinite(volley?.playerY) ? volley.playerY : npc.y;
  const playerToTarget = normalizeVector(targetX - playerX, targetY - playerY);
  const baseCorridorDir =
    playerToTarget.x !== 0 || playerToTarget.y !== 0 ? playerToTarget : fallbackAim;
  const perpDir = { x: -baseCorridorDir.y, y: baseCorridorDir.x };
  const laneSpacing = volley?.pickupBias ? 52 : 34;
  const laneOffset = (Number(volley?.pathSlot) || 0) * laneSpacing;
  const desiredX = targetX + perpDir.x * laneOffset;
  const desiredY = targetY + perpDir.y * laneOffset;
  const corridorDir = normalizeVector(desiredX - npc.x, desiredY - npc.y);
  const laneDir = corridorDir.x !== 0 || corridorDir.y !== 0 ? corridorDir : baseCorridorDir;
  let bestDir = null;
  let bestScore = Infinity;

  const evaluate = (targetEntityX, targetEntityY) => {
    const dx = targetEntityX - npc.x;
    const dy = targetEntityY - npc.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const dir = normalizeVector(dx, dy);
    const dot = dir.x * laneDir.x + dir.y * laneDir.y;
    if (dot < 0.15) return;
    const relX = targetEntityX - playerX;
    const relY = targetEntityY - playerY;
    const along = relX * baseCorridorDir.x + relY * baseCorridorDir.y;
    const perp = Math.abs((relX * -baseCorridorDir.y + relY * baseCorridorDir.x) - laneOffset);
    const corridorPenalty = perp * 2.8 + Math.max(0, -along) * 4.5;
    const forwardPenalty = (1 - dot) * 520;
    const score = corridorPenalty + forwardPenalty + dist * 0.3;
    if (score < bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  };

  enemies.forEach((enemy) => {
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    const center = getEnemyHitboxCenter(enemy);
    evaluate(center.x, center.y);
  });
  projectiles.forEach((proj) => {
    if (!proj || proj.dead || proj.friendly || proj.visualOnly) return;
    evaluate(proj.x, proj.y);
  });

  return bestDir || laneDir;
}

function fireCongregationVolleyShot(npc, volley) {
  if (!npc || npc.departed || !npc.active || (npc.faith || 0) <= 0) return false;
  const playerAim = normalizeVector(volley?.aimX || 1, volley?.aimY || 0);
  const clusterCenter = {
    x: Number.isFinite(volley?.clusterCenterX) ? volley.clusterCenterX : npc.x,
    y: Number.isFinite(volley?.clusterCenterY) ? volley.clusterCenterY : npc.y,
  };
  const mode = volley?.mode || "volley";
  const dir =
    mode === "path"
      ? getCongregationPathDirectionForNpc(npc, volley, playerAim)
      : getCongregationVolleyDirectionForNpc(npc, clusterCenter, playerAim);
  if (!dir || (!dir.x && !dir.y)) return false;
  const originOffset = (npc.radius || 24) * 0.72;
  const originX = npc.x + dir.x * originOffset;
  const originY = npc.y + dir.y * originOffset;
  const baseSpeed = PROJECTILE_CONFIG.fire?.speed || 420;
  const travel = distanceToEdge(originX, originY, dir.x, dir.y);
  const speed = baseSpeed * CONGREGATION_COMMAND_SPEED_MULTIPLIER;
  const life = travel / Math.max(1, speed);
  const fireFrames = assets?.projectiles?.fire?.frames || null;
  const baseFireRadius = PROJECTILE_CONFIG.fire?.radius || 18;
  const widenedRadius = Math.max(1, baseFireRadius * CONGREGATION_COMMAND_RADIUS_MULTIPLIER);
  spawnProjectile("fire", originX, originY, dir.x, dir.y, {
    friendly: true,
    damage: CONGREGATION_COMMAND_DAMAGE,
    radius: widenedRadius,
    speed,
    life,
    pierce: true,
    frames: fireFrames,
    frameDuration: 0.05,
    flipHorizontal: dir.x < 0,
    source: npc,
    scale: CONGREGATION_COMMAND_SCALE * CONGREGATION_COMMAND_VISUAL_SCALE_MULTIPLIER,
  });
  npc.projectileGlowTimer = Math.max(npc.projectileGlowTimer || 0, 0.2);
  if (npc.animator) {
    if (typeof npc.animator.setState === "function") {
      npc.animator.setState("attack", { restart: true });
      if (typeof npc.animator.setMoving === "function") {
        npc.animator.setMoving(false);
      }
    } else if (typeof npc.animator.play === "function") {
      npc.animator.play("attack", { restart: true });
    }
  }
  npc.npcArrowCooldown = Math.max(npc.npcArrowCooldown || 0, 0.35);
  spawnFlashEffect(originX, originY);
  return true;
}

function triggerCongregationCommand(playerEntity = player, options = {}) {
  if (!playerEntity || playerEntity.state === "death") return false;
  const mode = options?.mode === "path" ? "path" : "volley";
  const activeNpcs = npcs.filter(
    (npc) => npc && npc.active && !npc.departed && (npc.faith || 0) > 0,
  );
  if (!activeNpcs.length) return false;

  const hostilesExist =
    enemies.some((enemy) => enemy && !enemy.dead && enemy.state !== "death") ||
    projectiles.some((proj) => proj && !proj.dead && !proj.friendly && !proj.visualOnly);
  const isTutorial = typeof window !== "undefined" && window.__congregationTutorialActive;
  if (!hostilesExist && !isTutorial) return false;

  const playerAim =
    typeof playerEntity.getAimDirection === "function"
      ? playerEntity.getAimDirection()
      : normalizeVector(playerEntity.aim?.x || 1, playerEntity.aim?.y || 0);

  const clusterCenter = activeNpcs.reduce(
    (acc, npc) => {
      acc.x += npc.x || 0;
      acc.y += npc.y || 0;
      return acc;
    },
    { x: 0, y: 0 },
  );
  clusterCenter.x /= Math.max(1, activeNpcs.length);
  clusterCenter.y /= Math.max(1, activeNpcs.length);
  const aimAngle = Math.atan2(playerAim.y, playerAim.x);
  const pathTarget = mode === "path" ? getCongregationPathCommandTarget(playerEntity) : null;
  const sortedNpcs = [...activeNpcs].sort((a, b) => {
    const angleA = Math.atan2((a.y || 0) - clusterCenter.y, (a.x || 0) - clusterCenter.x);
    const angleB = Math.atan2((b.y || 0) - clusterCenter.y, (b.x || 0) - clusterCenter.x);
    const deltaA = Math.abs(Math.atan2(Math.sin(angleA - aimAngle), Math.cos(angleA - aimAngle)));
    const deltaB = Math.abs(Math.atan2(Math.sin(angleB - aimAngle), Math.cos(angleB - aimAngle)));
    return deltaA - deltaB;
  });

  const tutorialVolleyNpcs = (isTutorial && mode === "volley") ? sortedNpcs.slice(0, 5) : sortedNpcs;
  const tutorialBaseAngle = Math.random() * Math.PI * 2;
  tutorialVolleyNpcs.forEach((npc, index) => {
    const count = tutorialVolleyNpcs.length;
    const tutorialAimX = (isTutorial && mode === "volley")
      ? Math.cos(tutorialBaseAngle + (index / count) * Math.PI * 2)
      : playerAim.x;
    const tutorialAimY = (isTutorial && mode === "volley")
      ? Math.sin(tutorialBaseAngle + (index / count) * Math.PI * 2)
      : playerAim.y;
    npc.pendingCongregationVolley = {
      delay: index * CONGREGATION_COMMAND_STAGGER,
      mode,
      pathSlot: index - (sortedNpcs.length - 1) * 0.5,
      clusterCenterX: clusterCenter.x,
      clusterCenterY: clusterCenter.y,
      aimX: tutorialAimX,
      aimY: tutorialAimY,
      playerX: playerEntity.x,
      playerY: playerEntity.y,
      targetX: pathTarget?.x,
      targetY: pathTarget?.y,
      pickupBias: Boolean(pathTarget?.pickupBias),
    };
  });

  if (typeof playFireballCastSfx === "function") {
    playFireballCastSfx(0.7);
  }
  applyCameraShake(CONGREGATION_COMMAND_SHAKE_DURATION, CONGREGATION_COMMAND_SHAKE_MAGNITUDE);
  return true;
}

if (typeof window !== "undefined") {
  window.triggerCongregationCommand = triggerCongregationCommand;
}
