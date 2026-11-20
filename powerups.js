/* Pickups and power-ups: drops, weapon/utility/church/pastor power-ups, halo blade, shield trail, sentry, spear, grace pickups. (Pickup drawing and the WeaponPickup/UtilityPowerUp classes stay in game.js.)
 * Moved out of game.js unchanged. Loaded by index.html BEFORE game.js and
 * shares its globals at runtime. Top-level code here runs before game.js
 * exists: run `node dev/tools/check_load_order.js` after editing.
 */

function spawnSinglePowerUpDrop() {
  const stageName = levelManager?.getStatus?.().stage;
  if (stageName === "levelIntro" || stageName === "briefing" || stageName === "npcArrival") {
    return false;
  }
  const isBossStage = stageName === "bossIntro" || stageName === "bossActive";
  const weaponPickupEntries = Object.entries(assets?.weaponPickups || {}).filter(([, def]) =>
    isBossStage ? !isNpcWeaponPowerup(def) : true,
  );
  const hasWeaponPickups = weaponPickupEntries.length > 0;
  const hasChurchPowerupPickups = getUnlockedChurchPowerupKeys().length > 0;
  const hasUtility = Object.keys(assets?.utility || {}).length > 0;
  if (!hasWeaponPickups && !hasUtility && !hasChurchPowerupPickups) return false;
  if (hasChurchPowerupPickups && Math.random() < 0.2) {
    if (canSpawnChurchPowerup()) {
      return Boolean(spawnChurchPowerupPickup());
    }
  }
  const spawnUtility = hasUtility && Math.random() < 0.45;
  if (spawnUtility) {
    if (canSpawnUtilityPowerUp()) {
      return Boolean(spawnUtilityPowerUp());
    }
    return false;
  }
  if (!hasWeaponPickups) {
    if (canSpawnUtilityPowerUp()) {
      return Boolean(spawnUtilityPowerUp());
    }
    return false;
  }
  if (!canSpawnWeaponPowerUp()) {
    if (canSpawnUtilityPowerUp()) {
      return Boolean(spawnUtilityPowerUp());
    }
    return false;
  }
  const [type, def] = weaponPickupEntries[Math.floor(Math.random() * weaponPickupEntries.length)];
  if (isWeaponPowerEffect(def?.effect) && !canSpawnWeaponPowerUp()) {
    if (canSpawnUtilityPowerUp()) {
      return Boolean(spawnUtilityPowerUp());
    }
    return false;
  }
  const pickup = new WeaponPickup({ ...def, type });
  const padding = 120;
  pickup.x = Math.random() * (canvas.width - padding * 2) + padding;
  pickup.y = Math.random() * (canvas.height - padding * 2) + padding;
  const pushed = pushPointOutsideNpcHome(pickup.x, pickup.y);
  pickup.x = Math.max(padding, Math.min(canvas.width - padding, pushed.x));
  pickup.y = Math.max(padding, Math.min(canvas.height - padding, pushed.y));
  pickup.baseY = pickup.y;
  weaponPickups.push(pickup);
  playPowerupSpawnSfx();
  return true;
}

function queuePowerUpDrops(count = 1) {
  if (isDevMeleeArenaActive()) {
    queuedPowerUpDrops = 0;
    return;
  }
  const stageName = typeof levelManager?.getStatus === "function" ? levelManager.getStatus()?.stage : "";
  if (stageName === "victoryCelebrate") return;
  queuedPowerUpDrops += Math.max(0, Math.floor(count));
}

function processQueuedPowerUpDrops() {
  if (isDevMeleeArenaActive()) {
    queuedPowerUpDrops = 0;
    powerUpStaggerTimer = 0;
    return false;
  }
  const stageName = typeof levelManager?.getStatus === "function" ? levelManager.getStatus()?.stage : "";
  if (stageName === "victoryCelebrate") {
    queuedPowerUpDrops = 0;
    powerUpStaggerTimer = 0;
    return false;
  }
  if (queuedPowerUpDrops <= 0 || powerUpStaggerTimer > 0) return false;
  const spawned = spawnSinglePowerUpDrop();
  if (!spawned) return false;
  queuedPowerUpDrops = Math.max(0, queuedPowerUpDrops - 1);
  powerUpStaggerTimer = POWERUP_STAGGER_DELAY;
  return spawned;
}

function spawnPowerUpDrops(count = 1) {
  if (isDevMeleeArenaActive()) return false;
  const stageName = typeof levelManager?.getStatus === "function" ? levelManager.getStatus()?.stage : "";
  if (stageName === "victoryCelebrate") return false;
  queuePowerUpDrops(count);
  return processQueuedPowerUpDrops();
}

function spawnWeaponDrops(minCount = 1) {
  if (!canSpawnWeaponPowerUp()) return;
  const stageName = levelManager?.getStatus?.().stage;
  const isBossStage = stageName === "bossIntro" || stageName === "bossActive";
  const entries = Object.entries(assets.weaponPickups || {}).filter(([, def]) =>
    isBossStage ? !isNpcWeaponPowerup(def) : true,
  );
  if (!entries.length) return;
  while (weaponPickups.length < minCount && canSpawnWeaponPowerUp()) {
    const [type, def] = entries[Math.floor(Math.random() * entries.length)];
    weaponPickups.push(new WeaponPickup({ ...def, type }));
    playPowerupSpawnSfx();
  }
}

function isWeaponPowerEffect(effect) {
  return WEAPON_POWERUP_EFFECTS.has(effect);
}

function isNpcWeaponPowerup(def) {
  const effect = typeof def?.effect === "string" ? def.effect : "";
  return effect.startsWith("npc");
}

function getUnlockedChurchPowerupKeys() {
  return Array.from(unlockedChurchPowerups).filter((key) => assets?.churchPowerups?.[key]);
}

function getBossSpawnBlockZone() {
  const boss = levelManager?.getBoss?.();
  if (!boss || boss.dead || boss.defeated || boss.removed) return null;
  const hitbox = boss.hitbox || boss.config?.hitbox || null;
  const hasHitbox =
    hitbox &&
    Number.isFinite(hitbox.width) && hitbox.width > 0 &&
    Number.isFinite(hitbox.height) && hitbox.height > 0;
  const cx = boss.x + (hasHitbox && Number.isFinite(hitbox.offsetX) ? hitbox.offsetX : 0);
  const cy = boss.y + (hasHitbox && Number.isFinite(hitbox.offsetY) ? hitbox.offsetY : 0);
  const radius = (hasHitbox ? Math.hypot(hitbox.width, hitbox.height) / 2 : (boss.radius || 80)) + 50;
  return { x: cx, y: cy, radius };
}

function spawnChurchPowerupPickup(type = null, position = null) {
  if (!canSpawnChurchPowerup()) return null;
  if (!assets?.churchPowerups) return null;
  const keys = type ? [type] : getUnlockedChurchPowerupKeys();
  if (!keys.length) return null;
  const selected = keys[Math.floor(Math.random() * keys.length)];
  const def = assets.churchPowerups[selected];
  if (!def?.image) return null;
  const areaPadding = 120;
  const minX = areaPadding;
  const maxX = Math.max(minX, canvas.width - areaPadding);
  const minY = Math.max(HUD_HEIGHT + POWERUP_PLAYFIELD_MARGIN, areaPadding);
  const maxY = Math.max(minY, canvas.height - areaPadding);
  const homeBounds = getNpcHomeBounds();
  const bossZone = getBossSpawnBlockZone();

  const isInsideHome = (x, y) => {
    const dx = x - homeBounds.x;
    const dy = y - homeBounds.y;
    return Math.hypot(dx, dy) <= homeBounds.radius;
  };
  const isInsideBoss = (x, y) => {
    if (!bossZone) return false;
    return Math.hypot(x - bossZone.x, y - bossZone.y) <= bossZone.radius;
  };
  const pushOutOf = (x, y, zone, margin = 28) => {
    const angle = Math.atan2(y - zone.y, x - zone.x);
    return {
      x: Math.max(minX, Math.min(maxX, zone.x + Math.cos(angle) * (zone.radius + margin))),
      y: Math.max(minY, Math.min(maxY, zone.y + Math.sin(angle) * (zone.radius + margin))),
    };
  };

  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, maxY - minY);

  let spawnX;
  let spawnY;

  if (position?.x !== undefined || position?.y !== undefined) {
    spawnX = Math.max(minX, Math.min(maxX, position?.x ?? minX));
    spawnY = Math.max(minY, Math.min(maxY, position?.y ?? minY));
    if (isInsideHome(spawnX, spawnY)) {
      ({ x: spawnX, y: spawnY } = pushOutOf(spawnX, spawnY, homeBounds));
    }
    if (isInsideBoss(spawnX, spawnY)) {
      ({ x: spawnX, y: spawnY } = pushOutOf(spawnX, spawnY, bossZone));
    }
  } else {
    let attempts = 0;
    do {
      spawnX = minX + (spanX > 0 ? Math.random() * spanX : 0);
      spawnY = minY + (spanY > 0 ? Math.random() * spanY : 0);
      attempts += 1;
    } while ((isInsideHome(spawnX, spawnY) || isInsideBoss(spawnX, spawnY)) && attempts < 50);
    if (isInsideHome(spawnX, spawnY)) {
      ({ x: spawnX, y: spawnY } = pushOutOf(spawnX, spawnY, homeBounds));
    }
    if (isInsideBoss(spawnX, spawnY)) {
      ({ x: spawnX, y: spawnY } = pushOutOf(spawnX, spawnY, bossZone));
    }
  }

  const pickup = new WeaponPickup({ ...def, type: selected });
  pickup.x = spawnX;
  pickup.y = spawnY;
  pickup.baseY = pickup.y;
  clampEntityToBounds(pickup);
  churchPowerupPickups.push(pickup);
  playPowerupSpawnSfx();
  return pickup;
}

function spawnUtilityPowerUp(type = null, position = null) {
  if (!canSpawnUtilityPowerUp()) return null;
  if (!assets?.utility) return null;
  const keys = type ? [type] : Object.keys(UTILITY_POWERUP_DEFS);
  if (!keys.length) return null;
  const selected = keys[Math.floor(Math.random() * keys.length)];
  const asset = assets.utility[selected];
  if (!asset?.image) return null;
  const areaPadding = 120;
  const minX = areaPadding;
  const maxX = Math.max(minX, canvas.width - areaPadding);
  const minY = Math.max(HUD_HEIGHT + POWERUP_PLAYFIELD_MARGIN, areaPadding);
  const maxY = Math.max(minY, canvas.height - areaPadding);
  const homeBounds = getNpcHomeBounds();
  const bossZone = getBossSpawnBlockZone();

  const isInsideHome = (x, y) => {
    const dx = x - homeBounds.x;
    const dy = y - homeBounds.y;
    return Math.hypot(dx, dy) <= homeBounds.radius;
  };
  const isInsideBoss = (x, y) => {
    if (!bossZone) return false;
    return Math.hypot(x - bossZone.x, y - bossZone.y) <= bossZone.radius;
  };
  const pushOutOf = (x, y, zone, margin = 28) => {
    const angle = Math.atan2(y - zone.y, x - zone.x);
    return {
      x: Math.max(minX, Math.min(maxX, zone.x + Math.cos(angle) * (zone.radius + margin))),
      y: Math.max(minY, Math.min(maxY, zone.y + Math.sin(angle) * (zone.radius + margin))),
    };
  };

  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, maxY - minY);

  let spawnX;
  let spawnY;

  if (position?.x !== undefined || position?.y !== undefined) {
    spawnX = Math.max(minX, Math.min(maxX, position?.x ?? minX));
    spawnY = Math.max(minY, Math.min(maxY, position?.y ?? minY));
    if (isInsideHome(spawnX, spawnY)) {
      ({ x: spawnX, y: spawnY } = pushOutOf(spawnX, spawnY, homeBounds));
    }
    if (isInsideBoss(spawnX, spawnY)) {
      ({ x: spawnX, y: spawnY } = pushOutOf(spawnX, spawnY, bossZone));
    }
  } else {
    let attempts = 0;
    do {
      spawnX = minX + (spanX > 0 ? Math.random() * spanX : 0);
      spawnY = minY + (spanY > 0 ? Math.random() * spanY : 0);
      attempts += 1;
    } while ((isInsideHome(spawnX, spawnY) || isInsideBoss(spawnX, spawnY)) && attempts < 50);
    if (isInsideHome(spawnX, spawnY)) {
      ({ x: spawnX, y: spawnY } = pushOutOf(spawnX, spawnY, homeBounds));
    }
    if (isInsideBoss(spawnX, spawnY)) {
      ({ x: spawnX, y: spawnY } = pushOutOf(spawnX, spawnY, bossZone));
    }
  }

  const definition = { ...asset, type: selected };
  const powerUp = new UtilityPowerUp(definition, spawnX, spawnY);
  utilityPowerUps.push(powerUp);
  playPowerupSpawnSfx();
  return powerUp;
}

function spawnWeaponPickup(position = null) {
  if (!assets?.weaponPickups) return null;
  const stageName = levelManager?.getStatus?.().stage;
  const isBossStage = stageName === "bossIntro" || stageName === "bossActive";
  const entries = Object.entries(assets.weaponPickups).filter(([, def]) =>
    isWeaponPowerEffect(def?.effect) && (!isBossStage || !isNpcWeaponPowerup(def)),
  );
  if (!entries.length || !canSpawnWeaponPowerUp()) return null;
  const [type, def] = entries[Math.floor(Math.random() * entries.length)];
  const pickup = new WeaponPickup({ ...def, type });
  if (position?.x !== undefined) pickup.x = position.x;
  if (position?.y !== undefined) pickup.y = position.y;
  const pushed = pushPointOutsideNpcHome(pickup.x, pickup.y);
  pickup.x = pushed.x;
  pickup.y = pushed.y;
  const bossZoneW = getBossSpawnBlockZone();
  if (bossZoneW && Math.hypot(pickup.x - bossZoneW.x, pickup.y - bossZoneW.y) <= bossZoneW.radius) {
    const angle = Math.atan2(pickup.y - bossZoneW.y, pickup.x - bossZoneW.x);
    pickup.x = bossZoneW.x + Math.cos(angle) * (bossZoneW.radius + 28);
    pickup.y = bossZoneW.y + Math.sin(angle) * (bossZoneW.radius + 28);
  }
  pickup.baseY = pickup.y;
  clampEntityToBounds(pickup);
  weaponPickups.push(pickup);
  playPowerupSpawnSfx();
  return pickup;
}

function spawnNextEnsuredPowerUp() {
  const ensureActions = [
    () => (canSpawnUtilityPowerUp() ? spawnUtilityPowerUp() : null),
    () => (canSpawnWeaponPowerUp() ? spawnWeaponPickup() : null),
  ];
  const startIndex = powerUpEnsureCycleIndex % ensureActions.length;
  for (let i = 0; i < ensureActions.length; i += 1) {
    const index = (startIndex + i) % ensureActions.length;
    const spawned = ensureActions[index]?.();
    powerUpEnsureCycleIndex = index + 1;
    if (spawned) {
      powerUpStaggerTimer = POWERUP_STAGGER_DELAY;
      return true;
    }
  }
  return false;
}

function devSwapPowerups() {
  if (!assets) return false;
  const stageName = levelManager?.getStatus?.().stage;
  const isBossStage = stageName === "bossIntro" || stageName === "bossActive";
  const weaponDefs = Object.entries(assets.weaponPickups || {}).filter(([, def]) =>
    isWeaponPowerEffect(def?.effect) && (!isBossStage || !isNpcWeaponPowerup(def)),
  );
  const utilityDefs = Object.entries(assets.utility || {});
  if (!weaponDefs.length && !utilityDefs.length) return false;
  devPowerupSwapIndex += 1;
  if (weaponDefs.length) {
    for (let i = 0; i < weaponPickups.length; i += 1) {
      const [type, def] = weaponDefs[(devPowerupSwapIndex + i) % weaponDefs.length];
      const next = new WeaponPickup({ ...def, type });
      next.x = weaponPickups[i].x;
      next.y = weaponPickups[i].y;
      next.baseY = next.y;
      clampEntityToBounds(next);
      weaponPickups[i] = next;
    }
  }
  if (utilityDefs.length) {
    for (let i = 0; i < utilityPowerUps.length; i += 1) {
      const [type, def] = utilityDefs[(devPowerupSwapIndex + i) % utilityDefs.length];
      const next = new UtilityPowerUp({ ...def, type }, utilityPowerUps[i].x, utilityPowerUps[i].y);
      next.baseY = next.y;
      clampEntityToBounds(next);
      utilityPowerUps[i] = next;
    }
  }
  return true;
}

function showWeaponPowerupFloatingText(text, color = "#fff") {
  return;
}

function applyWeaponPickupEffect(pickup) {
  if (!player) return;
  const def = pickup.definition;
  if (typeof window !== "undefined" && typeof window.playWeaponPowerupPickupSfx === "function") {
    window.playWeaponPowerupPickupSfx(0.55);
  }
  switch (pickup.effect) {
    case "heal": {
      const healAmount =
        typeof def.healAmount === "number" ? def.healAmount : Math.round(HERO_HEALTH_PER_HEART);
      player.health = Math.min(player.maxHealth, player.health + healAmount);
      addStatusText(player, "Health Up!", {
        color: UI_COLOR.teal,
        bgColor: "rgba(30, 70, 50, 0.85)",
        life: 1.8,
      });
      break;
    }
    case "arrowBuff": {
      const config = resolveWeaponPowerupConfig("arrowBuff", def);
      player.arrowBuffTimer = config.duration;
      player.arrowDamageMultiplier = config.damageMultiplier;
      addStatusText(player, config.text, {
        color: config.textColor,
        bgColor: config.statusBgColor,
        life: config.statusLife,
      });
      spawnPowerupHudFlyEffect({
        x: pickup.x,
        y: pickup.y,
        iconImage: def?.iconImage || null,
        targetKey: getPowerupHudTargetKey(pickup.effect),
      });
      break;
    }
    case "wisdomWeapon": {
      const config = resolveWeaponPowerupConfig("wisdomWeapon", def);
      player.weaponMode = "wisdom_missle";
      player.weaponPowerTimer = config.duration;
      player.weaponPowerDuration = config.duration;
      const wisdomShotsMult = Math.max(1, getActiveClassMultiplier("powerups.wisdomMaxShotsMultiplier", 1));
      player.wisdomMissleShotsMax = Math.max(1, Math.round(config.maxShots * wisdomShotsMult));
      player.wisdomDamageMultiplier = config.damageMultiplier * getActiveClassMultiplier("powerups.wisdomDamageMultiplier", 1);
      player.magicCooldownMultiplier = (config.cooldownMultiplier / Math.max(0.05, getActiveClassMultiplier("powerups.wisdomRofMultiplier", 1))) * (config.maxShots / player.wisdomMissleShotsMax);
      player.magicSpeedMultiplier = config.speedMultiplier;
      player.magicBuffTimer = config.duration;
      player.magicCooldown = 0;
      player.wisdomHitShakeMultiplier = Number.isFinite(config.hitShakeMultiplier)
        ? config.hitShakeMultiplier
        : 1;
      showWeaponPowerupConfigText(config);
      spawnPowerupHudFlyEffect({
        x: pickup.x,
        y: pickup.y,
        iconImage: def?.iconImage || null,
        targetKey: getPowerupHudTargetKey(pickup.effect),
      });
      break;
    }
    case "cannonWeapon": {
      const config = resolveWeaponPowerupConfig("cannonWeapon", def);
      player.weaponMode = "faith_cannon";
      player.weaponPowerTimer = config.duration;
      player.weaponPowerDuration = config.duration;
      const faithShotsMult = Math.max(1, getActiveClassMultiplier("powerups.faithMaxShotsMultiplier", 1));
      player.faithCannonShotsMax = Math.max(1, Math.round(config.maxShots * faithShotsMult));
      player.faithCannonCooldownMultiplier = (config.cooldownMultiplier / Math.max(0.05, getActiveClassMultiplier("powerups.faithRofMultiplier", 1))) * (config.maxShots / player.faithCannonShotsMax);
      player.faithCannonSpeedMultiplier = config.speedMultiplier;
      player.faithCannonDamageMultiplier = config.damageMultiplier * getActiveClassMultiplier("powerups.faithDamageMultiplier", 1);
      player.magicCooldown = 0;
      player.faithHitShakeMultiplier = Number.isFinite(config.hitShakeMultiplier)
        ? config.hitShakeMultiplier
        : 1;
      showWeaponPowerupConfigText(config);
      spawnPowerupHudFlyEffect({
        x: pickup.x,
        y: pickup.y,
        iconImage: def?.iconImage || null,
        targetKey: getPowerupHudTargetKey(pickup.effect),
      });
      break;
    }
    case "scriptureWeapon": {
      const config = resolveWeaponPowerupConfig("scriptureWeapon", def);
      player.weaponMode = "fire";
      player.weaponPowerTimer = config.duration;
      player.weaponPowerDuration = config.duration;
      const scriptureShotsMult = Math.max(1, getActiveClassMultiplier("powerups.scriptureMaxShotsMultiplier", 1));
      player.fireShotsMax = Math.max(1, Math.round(config.maxShots * scriptureShotsMult));
      player.fireCooldownMultiplier = (config.cooldownMultiplier / Math.max(0.05, getActiveClassMultiplier("powerups.scriptureRofMultiplier", 1))) * (config.maxShots / player.fireShotsMax);
      player.fireSpeedMultiplier = config.speedMultiplier;
      player.fireDamageMultiplier = config.damageMultiplier * getActiveClassMultiplier("powerups.scriptureDamageMultiplier", 1);
      player.magicCooldown = 0;
      player.scriptureHitShakeMultiplier = Number.isFinite(config.hitShakeMultiplier)
        ? config.hitShakeMultiplier
        : 1;
      showWeaponPowerupConfigText(config);
      spawnPowerupHudFlyEffect({
        x: pickup.x,
        y: pickup.y,
        iconImage: def?.iconImage || null,
        targetKey: getPowerupHudTargetKey(pickup.effect),
      });
      break;
    }
    case "spreadGun": {
      const config = resolveWeaponPowerupConfig("spreadGun", def);
      const sgLevel = Math.min(CHURCH_POWERUP_MAX_LEVEL, churchPowerupLevels.get("spreadGun") || 1);
      const sgDuration = getChurchPowerupInstanceDuration(config.duration, sgLevel, 1);
      if ((player.spreadGunTimer || 0) > 0) {
        // Preserve the currently active instance; queue the next one separately.
        player.spreadGunBonusTimer = Math.max(0, player.spreadGunBonusTimer || 0) + sgDuration;
      } else {
        player.spreadGunTimer = sgDuration;
      }
      player.spreadGunDuration = Math.max(player.spreadGunDuration || 0, sgDuration);
      player.spreadGunMaxDuration = config.duration;
      player.spreadGunLevel = Math.max(player.spreadGunLevel || 0, sgLevel);
      if (def?.tuning) player.spreadGunTuning = { ...def.tuning };
      showWeaponPowerupConfigText(config);
      break;
    }
    case "halo": {
      const config = resolveWeaponPowerupConfig("halo", def);
      const haloLevel = Math.min(CHURCH_POWERUP_MAX_LEVEL, churchPowerupLevels.get("halo") || 1);
      const haloPrimaryDur = getChurchPowerupInstanceDuration(config.duration, haloLevel, 1);
      const haloSecondaryDur = getChurchPowerupInstanceDuration(config.duration, haloLevel, 2);
      const hadPrimary = (player.haloTimer || 0) > 0;
      const hadSecondary = (player.haloTimerSecondary || 0) > 0;
      if (!hadPrimary) {
        player.haloTimer = haloPrimaryDur;
      } else if (!hadSecondary && haloSecondaryDur > 0) {
        player.haloTimerSecondary = haloSecondaryDur;
      } else {
        player.haloTimerBonus = Math.max(0, player.haloTimerBonus || 0) + haloPrimaryDur;
      }
      player.haloDuration = Math.max(player.haloDuration || 0, haloPrimaryDur);
      player.haloMaxDuration = config.duration;
      player.haloLevel = Math.max(player.haloLevel || 0, haloLevel);
      if (def?.tuning) {
        const t = def.tuning;
        for (const state of [haloBladeState, haloBladeStateSecondary, haloBladeStateBonus]) {
          if (Number.isFinite(t.damage)) state.damage = t.damage;
          if (Number.isFinite(t.orbitRadius)) state.radius = t.orbitRadius * WORLD_SCALE;
          if (Number.isFinite(t.rotationSpeed)) state.speed = t.rotationSpeed;
          if (Number.isFinite(t.hitCooldown)) state.hitCooldown = t.hitCooldown;
          if (Number.isFinite(t.hitRadius)) state.hitRadius = t.hitRadius * WORLD_SCALE;
          if (Number.isFinite(t.tetherDamageMultiplier)) state.tetherDamageMultiplier = t.tetherDamageMultiplier;
          if (Number.isFinite(t.tetherHitRadius)) state.tetherHitRadius = t.tetherHitRadius * WORLD_SCALE;
          if (Number.isFinite(t.armoredDamageMultiplier)) state.armoredDamageMultiplier = t.armoredDamageMultiplier;
          if (Number.isFinite(t.armoredHitCooldown)) state.armoredHitCooldown = t.armoredHitCooldown;
          if (Number.isFinite(t.armoredMaxHitsPerSecond)) state.armoredMaxHitsPerSecond = t.armoredMaxHitsPerSecond;
          if (Number.isFinite(t.armoredHitWindowSeconds)) state.armoredHitWindowSeconds = t.armoredHitWindowSeconds;
          if (Number.isFinite(t.spriteScale)) state.scale = t.spriteScale * WORLD_SCALE;
          if (Number.isFinite(t.trailSpacing)) state.trailSpacing = t.trailSpacing * WORLD_SCALE;
          if (Number.isFinite(t.trailLife)) state.trailLife = t.trailLife;
          if (Number.isFinite(t.maxTrail)) state.maxTrail = Math.max(1, Math.floor(t.maxTrail));
        }
      }
      showWeaponPowerupConfigText(config);
      break;
    }
    case "spear": {
      const config = resolveWeaponPowerupConfig("spear", def);
      const spearLevel = Math.min(CHURCH_POWERUP_MAX_LEVEL, churchPowerupLevels.get("spear") || 1);
      const spearPrimaryDur = getChurchPowerupInstanceDuration(config.duration, spearLevel, 1);
      const spearSecondaryDur = getChurchPowerupInstanceDuration(config.duration, spearLevel, 2);
      const hadPrimary = (player.spearTimer || 0) > 0;
      const hadSecondary = (player.spearTimerSecondary || 0) > 0;
      if (!hadPrimary) {
        player.spearTimer = spearPrimaryDur;
      } else if (!hadSecondary && spearSecondaryDur > 0) {
        player.spearTimerSecondary = spearSecondaryDur;
      } else {
        player.spearTimerBonus = Math.max(0, player.spearTimerBonus || 0) + spearPrimaryDur;
      }
      player.spearDuration = Math.max(player.spearDuration || 0, spearPrimaryDur);
      player.spearMaxDuration = config.duration;
      player.spearLevel = Math.max(player.spearLevel || 0, spearLevel);
      if (def?.tuning) {
        const t = def.tuning;
        for (const state of [spearState, spearStateSecondary, spearStateBonus]) {
          if (Number.isFinite(t.damage)) state.damage = t.damage;
          if (Number.isFinite(t.speed)) state.speed = t.speed * WORLD_SCALE;
          if (Number.isFinite(t.hitCooldown)) state.hitCooldown = t.hitCooldown;
          if (Number.isFinite(t.pauseDuration)) state.pauseDuration = t.pauseDuration;
          if (Number.isFinite(t.searchSpinSpeed)) state.searchSpinSpeed = t.searchSpinSpeed;
        }
      }
      showWeaponPowerupConfigText(config);
      break;
    }
    case "sentry": {
      const config = resolveWeaponPowerupConfig("sentry", def);
      const sentryLevel = Math.min(CHURCH_POWERUP_MAX_LEVEL, churchPowerupLevels.get("sentry") || 1);
      const sentryPrimaryDur = getChurchPowerupInstanceDuration(config.duration, sentryLevel, 1);
      const sentrySecondaryDur = getChurchPowerupInstanceDuration(config.duration, sentryLevel, 2);
      const hadPrimary = (player.sentryTimer || 0) > 0;
      const hadSecondary = (player.sentryTimerSecondary || 0) > 0;
      if (!hadPrimary) {
        player.sentryTimer = sentryPrimaryDur;
      } else if (!hadSecondary && sentrySecondaryDur > 0) {
        player.sentryTimerSecondary = sentrySecondaryDur;
      } else {
        player.sentryTimerBonus = Math.max(0, player.sentryTimerBonus || 0) + sentryPrimaryDur;
      }
      player.sentryDuration = Math.max(player.sentryDuration || 0, sentryPrimaryDur);
      player.sentryMaxDuration = config.duration;
      player.sentryLevel = Math.max(player.sentryLevel || 0, sentryLevel);
      if (def?.tuning) {
        const t = def.tuning;
        for (const state of [sentryState, sentryStateSecondary, sentryStateBonus]) {
          if (Number.isFinite(t.damage)) state.damage = t.damage;
          if (Number.isFinite(t.hitInterval)) state.hitInterval = t.hitInterval;
          if (Number.isFinite(t.beamCooldown)) state.beamCooldown = t.beamCooldown;
          if (Number.isFinite(t.beamPulseDuration)) state.beamPulseDuration = t.beamPulseDuration;
          if (Number.isFinite(t.sweepStep)) state.sweepStep = t.sweepStep;
          if (Number.isFinite(t.pulseSweepAmount)) state.pulseSweepAmount = t.pulseSweepAmount;
          if (Number.isFinite(t.pulseSweepSpeed)) state.pulseSweepSpeed = t.pulseSweepSpeed;
        }
      }
      showWeaponPowerupConfigText(config);
      break;
    }
    case "npcScriptureWeapon": {
      applyNpcWeaponPowerup("npcScriptureWeapon", def);
      triggerNpcPowerupDialogue("npcScriptureWeapon");
      showWeaponPowerupConfigText({
        text: def?.label || "Trust Scripture",
        textColor: "#ffa45a",
        description: "Congregants fire piercing flames",
        spokenName: "Scripture",
        iconSrc: def?.iconSrc || "",
      });
      spawnPowerupHudFlyEffect({
        x: pickup.x,
        y: pickup.y,
        iconImage: def?.iconImage || null,
        targetKey: getPowerupHudTargetKey(pickup.effect),
      });
      break;
    }
    case "npcWisdomWeapon": {
      applyNpcWeaponPowerup("npcWisdomWeapon", def);
      triggerNpcPowerupDialogue("npcWisdomWeapon");
      showWeaponPowerupConfigText({
        text: "Apply Wisdom",
        textColor: UI_COLOR.ice,
        description: "Congregants fire wisdom cannons",
        spokenName: "Wisdom",
        iconSrc: def?.iconSrc || "",
      });
      spawnPowerupHudFlyEffect({
        x: pickup.x,
        y: pickup.y,
        iconImage: def?.iconImage || null,
        targetKey: getPowerupHudTargetKey(pickup.effect),
      });
      break;
    }
    case "npcFaithWeapon": {
      applyNpcWeaponPowerup("npcFaithWeapon", def);
      triggerNpcPowerupDialogue("npcFaithWeapon");
      showWeaponPowerupConfigText({
        text: "Act in Faith",
        textColor: "#ff9bf7",
        description: "Congregants fire barrage shots",
        spokenName: "Faith",
        iconSrc: def?.iconSrc || "",
      });
      spawnPowerupHudFlyEffect({
        x: pickup.x,
        y: pickup.y,
        iconImage: def?.iconImage || null,
        targetKey: getPowerupHudTargetKey(pickup.effect),
      });
      break;
    }
    default:
      break;
  }
  triggerPowerUpCooldown();
}

function shuffleArray(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function applyUtilityPowerUp(powerUp) {
  if (!player || !powerUp) return;
  powerUp.active = false;
  powerUp.visible = false;
  powerUp.expired = true;
  if (typeof window !== "undefined" && typeof window.playUtilityPowerupPickupSfx === "function") {
    window.playUtilityPowerupPickupSfx(0.55);
  }
  const { effect, duration = 6, speedMultiplier, extendMultiplier } = powerUp.definition;
  const utilityTitle = powerUp.definition.hudTitle || powerUp.definition.label || "Power Up";
  const utilitySpokenName = powerUp.definition.spokenName || utilityTitle;
  setWeaponPickupAnnouncement({
    title: utilityTitle,
    description: powerUp.definition.description || "",
    color: powerUp.definition.color || UI_COLOR.softWhite,
    iconSrc: powerUp.definition.iconSrc || "",
  });
  if (POWERUP_SPEECH_BUBBLES_ENABLED) {
    playerYell(utilitySpokenName, 3.2);
  }
  switch (effect) {
    case "shield":
      player.shieldTimer = Math.max(player.shieldTimer, duration);
      player.shieldDuration = Math.max(player.shieldDuration || 0, duration);
      spawnPowerupHudFlyEffect({
        x: powerUp.x,
        y: powerUp.y,
        iconImage: powerUp.definition?.iconImage || null,
        targetKey: getPowerupHudTargetKey(effect),
      });
      break;
    case "haste":
      player.speedBoostTimer = Math.max(player.speedBoostTimer, duration);
      player.speedBoostDuration = Math.max(player.speedBoostDuration || 0, duration);
      spawnPowerupHudFlyEffect({
        x: powerUp.x,
        y: powerUp.y,
        iconImage: powerUp.definition?.iconImage || null,
        targetKey: getPowerupHudTargetKey(effect),
      });
      break;
    case "extend":
      const extendDuration = Math.max(
        duration,
        player.powerExtendTimer,
        player.powerExtendDuration,
      );
      player.powerExtendTimer = Math.max(player.powerExtendTimer, extendDuration);
      player.powerExtendDuration = Math.max(player.powerExtendDuration, player.powerExtendTimer);
      if (player.weaponPowerTimer > 0) {
        const factor = Number.isFinite(extendMultiplier) ? extendMultiplier : 1.5;
        player.weaponPowerTimer *= factor;
        player.weaponPowerDuration *= factor;
        const meterDuration = player.weaponPowerDuration;
        if (meterDuration > 0) {
          const ratioAfterFactor = player.weaponPowerTimer / meterDuration;
          if (ratioAfterFactor < 0.25) {
            player.weaponPowerTimer = Math.max(
              player.weaponPowerTimer,
              meterDuration * 0.5,
            );
          } else if (ratioAfterFactor > 0.5) {
            player.weaponPowerTimer = Math.min(
              meterDuration,
              player.weaponPowerTimer + meterDuration * 0.25,
            );
          }
        }
      }
      player.weaponPowerTimer = Math.min(
        player.weaponPowerTimer,
        player.weaponPowerDuration,
      );
      spawnPowerupHudFlyEffect({
        x: powerUp.x,
        y: powerUp.y,
        iconImage: powerUp.definition?.iconImage || null,
        targetKey: getPowerupHudTargetKey(effect),
      });
      break;
    case "harmony":
      npcHarmonyBuffTimer = Math.max(npcHarmonyBuffTimer, duration);
      npcHarmonyBuffDuration = Math.max(npcHarmonyBuffDuration, duration);
      triggerNpcPowerupDialogue("harmony");
      spawnPowerupHudFlyEffect({
        x: powerUp.x,
        y: powerUp.y,
        iconImage: powerUp.definition?.iconImage || null,
        targetKey: getPowerupHudTargetKey(effect),
      });
      break;
    case "smiteBomb": {
      // Utility pickup internally remains "smiteBomb", but player-facing term is Purify.
      const bombDamage = Math.max(0, Math.round(Number(powerUp.definition?.damage) || 200));
      if (typeof playPrayerBombSfx === "function") {
        playPrayerBombSfx(0.85);
      }
      applyCameraShake(CAMERA_SHAKE_DURATION, CAMERA_SHAKE_INTENSITY * 1.35);
      projectiles.forEach((projectile) => {
        if (!projectile || projectile.dead || projectile.friendly || projectile.visualOnly) return;
        projectile.dead = true;
        spawnImpactEffect(projectile.x, projectile.y);
        spawnFlashEffect(projectile.x, projectile.y);
      });
      const bossDamage = Math.max(0, Math.round(bombDamage * 0.8));
      startSmiteBombSweep({
        centerX: player?.x ?? powerUp.x,
        centerY: player?.y ?? powerUp.y,
        damage: bombDamage,
        bossDamage,
      });
      break;
    }
    default:
      break;
  }
  triggerPowerUpCooldown();
}

function evacuateNpcsForBoss() {
  evacuatedNpcCount = npcs.length || 2;
  npcs.splice(0, npcs.length);
  npcsSuspended = true;
}

function restoreNpcsAfterBoss() {
  if (evacuatedNpcCount > 0) {
    npcsSuspended = false;
    resetCozyNpcs(evacuatedNpcCount);
    evacuatedNpcCount = 0;
  }
}

function updateUtilityPowerUps(dt) {
  for (let i = utilityPowerUps.length - 1; i >= 0; i -= 1) {
    const powerUp = utilityPowerUps[i];
    powerUp.update(dt);
    if (powerUp.expired) {
      utilityPowerUps.splice(i, 1);
      triggerPowerUpCooldown();
      continue;
    }
    if (!player) continue;
    const dx = powerUp.x - player.x;
    const dy = powerUp.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= (powerUp.radius || 24) + player.radius * 0.7) {
      powerUp.expired = true;
      applyUtilityPowerUp(powerUp);
      if (isDevMeleeArenaActive() && player) {
        const d = DEV_ARENA_PICKUP_EFFECT_DURATION;
        if ((player.shieldTimer || 0) > d) { player.shieldTimer = d; player.shieldDuration = d; }
        if ((player.speedBoostTimer || 0) > d) { player.speedBoostTimer = d; player.speedBoostDuration = d; }
        if ((player.powerExtendTimer || 0) > d) { player.powerExtendTimer = d; player.powerExtendDuration = d; }
        if ((player.harmonyTimer || 0) > d) player.harmonyTimer = d;
      }
      utilityPowerUps.splice(i, 1);
    }
  }
}

function updateWeaponPickups(dt) {
  weaponPickups.forEach((pickup) => {
    if (!pickup) return;
    pickup.update(dt);
    if (!pickup.active) return;
    resolveEntityCollisions(pickup, weaponPickups, { allowPush: true, overlapScale: 1 });
    resolveEntityCollisions(pickup, enemies, { allowPush: true, overlapScale: 1 });
    resolveEntityCollisions(pickup, [player], { allowPush: true, overlapScale: 1 });
    clampEntityToBounds(pickup);
  });

  for (let i = weaponPickups.length - 1; i >= 0; i -= 1) {
    const pickup = weaponPickups[i];
    if (!pickup) continue;
    if (pickup.expired || !pickup.active) {
      weaponPickups.splice(i, 1);
      triggerPowerUpCooldown();
      continue;
    }
    if (!player) continue;
    const dx = pickup.x - player.x;
    const dy = pickup.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= (pickup.radius || 0) + player.radius) {
      pickup.expired = true;
      applyWeaponPickupEffect(pickup);
      if (isDevMeleeArenaActive() && player) {
        const pd = DEV_ARENA_PLAYER_WEAPON_EFFECT_DURATION;
        const nd = DEV_ARENA_PICKUP_EFFECT_DURATION;
        if (player.weaponPowerTimer > pd) { player.weaponPowerTimer = pd; player.weaponPowerDuration = pd; }
        if (npcWeaponState.timer > nd) { npcWeaponState.timer = nd; npcWeaponState.duration = nd; }
      }
      weaponPickups.splice(i, 1);
    }
  }
}

function updateChurchPowerupPickups(dt) {
  const stageName = typeof levelManager?.getStatus === "function" ? levelManager.getStatus()?.stage : "";
  const isBossStage = stageName === "bossIntro" || stageName === "bossActive";
  if (isBossStage) {
    if (churchPowerupPickups.length > 0) {
      churchPowerupPickups.splice(0, churchPowerupPickups.length);
    }
    return;
  }
  churchPowerupPickups.forEach((pickup) => {
    if (!pickup) return;
    pickup.update(dt);
    if (!pickup.active) return;
    resolveEntityCollisions(pickup, churchPowerupPickups, { allowPush: true, overlapScale: 1 });
    resolveEntityCollisions(pickup, enemies, { allowPush: true, overlapScale: 1 });
    resolveEntityCollisions(pickup, [player], { allowPush: true, overlapScale: 1 });
    clampEntityToBounds(pickup);
  });

  for (let i = churchPowerupPickups.length - 1; i >= 0; i -= 1) {
    const pickup = churchPowerupPickups[i];
    if (!pickup) continue;
    if (pickup.expired || !pickup.active) {
      churchPowerupPickups.splice(i, 1);
      triggerPowerUpCooldown();
      continue;
    }
    if (!player) continue;
    const dx = pickup.x - player.x;
    const dy = pickup.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= (pickup.radius || 0) + player.radius) {
      applyWeaponPickupEffect(pickup);
      churchPowerupPickups.splice(i, 1);
    }
  }
}

function spawnPastorPowerupPickup(type) {
  if (!assets?.pastorPowerups?.[type]?.iconImage) return null;
  const def = assets.pastorPowerups[type];
  const areaPadding = 120;
  const minX = areaPadding;
  const maxX = Math.max(minX, canvas.width - areaPadding);
  const minY = Math.max(HUD_HEIGHT + POWERUP_PLAYFIELD_MARGIN, areaPadding);
  const maxY = Math.max(minY, canvas.height - areaPadding);
  const homeBounds = getNpcHomeBounds();
  const isInsideHome = (x, y) => Math.hypot(x - homeBounds.x, y - homeBounds.y) <= homeBounds.radius;
  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, maxY - minY);
  let spawnX, spawnY, attempts = 0;
  do {
    spawnX = minX + (spanX > 0 ? Math.random() * spanX : 0);
    spawnY = minY + (spanY > 0 ? Math.random() * spanY : 0);
    attempts++;
  } while (isInsideHome(spawnX, spawnY) && attempts < 50);

  const iconImg = def.iconImage;
  const iconSize = Math.max(iconImg?.width || 32, iconImg?.height || 32);
  const scale = 1.4;
  const radius = 22;
  const pickup = {
    type,
    iconImage: iconImg,
    x: spawnX,
    y: spawnY,
    baseY: spawnY,
    width: iconSize * scale,
    height: iconSize * scale,
    scale,
    radius,
    floatTimer: Math.random() * Math.PI * 2,
    life: POWERUP_ACTIVE_LIFETIME,
    blinkWindow: POWERUP_BLINK_DURATION,
    blinkTimer: 0,
    spawnBlinkTimer: POWERUP_SPAWN_BLINK_DURATION,
    visible: true,
    active: true,
    expired: false,
  };
  clampEntityToBounds(pickup);
  pastorPowerupPickups.push(pickup);
  playPowerupSpawnSfx();
  return pickup;
}

function updatePastorPowerupPickups(dt) {
  for (let i = pastorPowerupPickups.length - 1; i >= 0; i--) {
    const pickup = pastorPowerupPickups[i];
    if (!pickup) { pastorPowerupPickups.splice(i, 1); continue; }
    pickup.life -= dt;
    pickup.floatTimer += dt;
    pickup.y = pickup.baseY + Math.sin(pickup.floatTimer * 1.8) * 6;
    if (pickup.spawnBlinkTimer > 0) pickup.spawnBlinkTimer -= dt;
    if (pickup.life <= pickup.blinkWindow) {
      pickup.blinkTimer += dt;
      pickup.visible = Math.floor(pickup.blinkTimer / 0.15) % 2 === 0;
    }
    if (pickup.life <= 0) {
      pastorPowerupPickups.splice(i, 1);
      continue;
    }
    if (!player) continue;
    const dx = pickup.x - player.x;
    const dy = pickup.y - player.y;
    if (Math.hypot(dx, dy) <= pickup.radius + (player.radius || 0)) {
      applyPastorPowerupPickup(pickup.type);
      pastorPowerupPickups.splice(i, 1);
      playPowerupSpawnSfx();
    }
  }
}

function spawnGracePickup(x, y, options = {}) {
  const frames = assets?.items?.gracePickup?.frames;
  if (!frames || !frames.length) return null;
  const pickup = {
    x,
    y,
    radius: options.radius || GRACE_PICKUP_RADIUS,
    frames,
    frameIndex: Math.floor(Math.random() * frames.length),
    frameTimer: Math.random() * GRACE_PICKUP_FRAME_DURATION,
    frameDuration: GRACE_PICKUP_FRAME_DURATION,
    bobTimer: Math.random() * Math.PI * 2,
    value: Math.max(1, Math.round(options.value || 1)),
    life: options.life || GRACE_PICKUP_LIFETIME,
    vx: options.vx ?? (options.scatter ? randomInRange(-90, 90) : 0),
    vy: options.vy ?? (options.scatter ? randomInRange(-180, -60) : 0),
    gravity: options.gravity ?? GRACE_PICKUP_GRAVITY,
    useGravity: options.useGravity ?? false,
    bounce: options.bounce ?? false,
    trackViewportXBounds: Boolean(options.trackViewportXBounds),
    minX: Number.isFinite(options.minX) ? options.minX : null,
    maxX: Number.isFinite(options.maxX) ? options.maxX : null,
    floorY: Number.isFinite(options.floorY) ? options.floorY : GRACE_PICKUP_FLOOR_Y(),
    bounceDamp: Number.isFinite(options.bounceDamp) ? options.bounceDamp : 0.5,
    airDrag: Number.isFinite(options.airDrag) ? options.airDrag : GRACE_PICKUP_AIR_DRAG,
    disableAttraction: Boolean(options.disableAttraction),
    collected: false,
    landSfxPlayed: false,
    spawnBlink: 0.2,
    blinkTimer: 0,
    blinkAlpha: 1,
  };
  pickup.blinkAlpha = 1;
  pickup.draw = (context) => {
    const frame = pickup.frames[Math.floor(pickup.frameIndex) % pickup.frames.length];
    if (!frame) return;
    const size = Math.max(18, frame.width || 32);
    const bob = pickup.grounded ? 0 : Math.sin(pickup.bobTimer) * 4;
    let alpha =
      pickup.spawnBlink > 0 ? Math.max(0.3, 1 - pickup.spawnBlink * 2) : 1;
    if (pickup.life <= 3 && typeof pickup.blinkAlpha === "number") {
      alpha *= pickup.blinkAlpha;
    }
    context.save();
    context.globalAlpha = alpha;
    context.translate(pickup.x, pickup.y + bob);
    context.drawImage(frame, -size / 2, -size / 2, size, size);
    context.restore();
  };
  gracePickups.push(pickup);
  return pickup;
}

function spawnGraceHudFlyEffect(pickup) {
  const target = typeof window !== "undefined" ? window.__hudGraceIconPos : null;
  const frame = pickup?.frames?.[0];
  if (!target || !frame) return;
  const startX = pickup.x - cameraOffsetX;
  const startY = pickup.y;
  graceHudFlyEffects.push({
    frame,
    startX,
    startY,
    x: startX,
    y: startY,
    targetX: target.x,
    targetY: target.y,
    timer: 0,
    duration: 0.45,
    size: Math.max(14, frame.width || 16),
    alpha: 1,
  });
}

function updateGraceHudFlyEffects(dt) {
  if (!graceHudFlyEffects.length) return;
  for (let i = graceHudFlyEffects.length - 1; i >= 0; i -= 1) {
    const effect = graceHudFlyEffects[i];
    if (!effect) continue;
    effect.timer += dt;
    const t = Math.min(1, effect.timer / Math.max(0.001, effect.duration));
    const ease = 1 - Math.pow(1 - t, 3);
    effect.x = effect.startX + (effect.targetX - effect.startX) * ease;
    effect.y = effect.startY + (effect.targetY - effect.startY) * ease;
    effect.alpha = Math.max(0, 1 - t * 0.15);
    if (t >= 1) {
      graceHudFlyEffects.splice(i, 1);
    }
  }
}

function spawnGraceSpendFlyEffects(key, cost) {
  const source = typeof window !== "undefined" ? window.__hudGraceIconPos : null;
  const positions = typeof window !== "undefined" ? window.__costPillPositions : null;
  const target = positions ? positions[key] : null;
  if (!source || !target) return;
  const frame = (assets?.items?.gracePickup?.frames || [])[0];
  if (!frame) return;
  const MAX_PARTICLES = 20;
  const count = Math.min(cost, MAX_PARTICLES);
  const costPerParticle = cost / count;
  graceSpendAnimState = { key, remaining: cost, total: cost, costPerParticle, resetTimer: 0, resetting: false };
  if (typeof window !== "undefined") window.__graceSpendAnimState = graceSpendAnimState;
  for (let i = 0; i < count; i++) {
    const delay = i * (0.35 / Math.max(1, count));
    graceSpendFlyEffects.push({
      frame,
      x: source.x,
      y: source.y,
      startX: source.x,
      startY: source.y,
      targetX: target.x,
      targetY: target.y,
      timer: 0,
      delay,
      duration: 0.45,
      size: 14,
      alpha: 1,
      costPerParticle,
      arrived: false,
    });
  }
}

function updateGraceSpendFlyEffects(dt) {
  for (let i = graceSpendFlyEffects.length - 1; i >= 0; i--) {
    const effect = graceSpendFlyEffects[i];
    if (!effect) continue;
    if (effect.timer < effect.delay) {
      effect.timer += dt;
      continue;
    }
    const elapsed = effect.timer - effect.delay;
    effect.timer += dt;
    const t = Math.min(1, elapsed / Math.max(0.001, effect.duration));
    const ease = 1 - Math.pow(1 - t, 3);
    effect.x = effect.startX + (effect.targetX - effect.startX) * ease;
    effect.y = effect.startY + (effect.targetY - effect.startY) * ease;
    effect.alpha = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2);
    if (t >= 1 && !effect.arrived) {
      effect.arrived = true;
      if (graceSpendAnimState && graceSpendAnimState.key) {
        graceSpendAnimState.remaining = Math.max(0, graceSpendAnimState.remaining - effect.costPerParticle);
        window.__graceSpendAnimState = graceSpendAnimState;
      }
      if (typeof window.playGracePickupSfx === "function") {
        window.playGracePickupSfx(0.15);
      }
      graceSpendFlyEffects.splice(i, 1);
    }
  }
  if (graceSpendAnimState && graceSpendFlyEffects.length === 0 && !graceSpendAnimState.resetting) {
    graceSpendAnimState.resetting = true;
  }
  if (graceSpendAnimState?.resetting) {
    graceSpendAnimState.resetTimer = (graceSpendAnimState.resetTimer || 0) + dt;
    if (graceSpendAnimState.resetTimer >= 0.4) {
      graceSpendAnimState = null;
      if (typeof window !== "undefined") window.__graceSpendAnimState = null;
    }
  }
}

function getPowerupHudTargetKey(effect) {
  if (!effect) return null;
  if (effect === "shield") return "utilityShield";
  if (effect === "haste") return "utilityHaste";
  if (effect === "extend") return "utilityExtend";
  if (effect === "harmony") return "npcHarmony";
  if (String(effect).startsWith("npc")) return "npcWeapon";
  if (WEAPON_POWERUP_EFFECTS.has(effect) || effect === "arrowBuff") return "playerWeapon";
  return null;
}

function spawnPowerupHudFlyEffect({ x, y, iconImage, targetKey }) {
  if (!targetKey) return;
  const targetMap = typeof window !== "undefined" ? window.__hudPowerupIconPos : null;
  const target = targetMap ? targetMap[targetKey] : null;
  if (!iconImage || !iconImage.complete) return;
  const startX = x - cameraOffsetX;
  const startY = y;
  powerupHudFlyEffects.push({
    image: iconImage,
    startX,
    startY,
    x: startX,
    y: startY,
    targetX: target ? target.x : startX,
    targetY: target ? target.y : startY,
    targetKey,
    targetReady: Boolean(target),
    timer: 0,
    duration: 0.5,
    size: Math.max(16, iconImage.width || 16),
    alpha: 1,
  });
}

function updateHaloBladeInstance(state, angle, dt) {
  const depth = Math.sin(angle);
  const radiusX = state.radius;
  const radiusY = state.radius * 0.7;
  const prevX = state.x;
  const prevY = state.y;
  state.x = player.x + Math.cos(angle) * radiusX;
  state.y = player.y + depth * radiusY;
  state.angle = angle;
  const travel = Math.hypot(state.x - prevX, state.y - prevY);
  state.trailTimer += travel;
  if (state.trailTimer >= state.trailSpacing) {
    state.trailTimer = 0;
    state.trail.push({
      x: state.x,
      y: state.y,
      life: state.trailLife,
      maxLife: state.trailLife,
    });
    if (state.trail.length > state.maxTrail) {
      state.trail.shift();
    }
  }
  if (state.trail.length) {
    state.trail.forEach((point) => {
      point.life -= dt;
    });
    while (state.trail.length && state.trail[0].life <= 0) {
      state.trail.shift();
    }
  }

  const now =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const hitRadius = state.hitRadius;
  const tetherDamage = Math.max(1, Math.round((state.damage || 0) * (state.tetherDamageMultiplier || 0.65)));
  const tetherHitRadius = Math.max(0, Number(state.tetherHitRadius) || 0);
  const tetherStartX = player.x;
  const tetherStartY = player.y - (player.radius || 24) * 0.18;
  const tetherEndX = state.x;
  const tetherEndY = state.y;
  const playHaloBladeImpactFeedback = () => {
    const sfxCooldown = Math.max(0.01, Number(state.bladeImpactSfxCooldown) || 0.05);
    if (now - (state.lastBladeImpactSfxAt || 0) < sfxCooldown) return;
    state.lastBladeImpactSfxAt = now;
    if (typeof playFaithHitSfx === "function") {
      playFaithHitSfx(0.8);
    }
    if (typeof applyCameraShake === "function") {
      applyCameraShake(FAITH_HIT_SHAKE_DURATION, FAITH_HIT_SHAKE_MAGNITUDE * 1.6);
    }
  };

  enemies.forEach((enemy) => {
    if (!enemy || enemy.dead || enemy.state === "death") return;
    const center = getEnemyHitboxCenter(enemy);
    const targetRadius = getEnemyHitboxRadius(enemy);
    const dx = center.x - state.x;
    const dy = center.y - state.y;
    const bladeHit = dx * dx + dy * dy <= (hitRadius + targetRadius) ** 2;
    let tetherHit = false;
    let tetherImpactX = center.x;
    let tetherImpactY = center.y;
    if (!bladeHit && tetherHitRadius > 0) {
      const closest = closestPointOnSegment(
        center.x,
        center.y,
        tetherStartX,
        tetherStartY,
        tetherEndX,
        tetherEndY,
      );
      const cdx = center.x - closest.x;
      const cdy = center.y - closest.y;
      tetherHit = cdx * cdx + cdy * cdy <= (targetRadius + tetherHitRadius) ** 2;
      tetherImpactX = closest.x;
      tetherImpactY = closest.y;
    }
    if (!bladeHit && !tetherHit) return;
    const enemyDamageClass = String(enemy.damageClass || enemy.config?.damageClass || "").toLowerCase();
    const isArmoredTarget = enemyDamageClass === "armored" || enemyDamageClass === "tank";
    const bladeArmoredBonusActive = bladeHit && isArmoredTarget;
    const effectiveHitCooldown = bladeArmoredBonusActive
      ? Math.max(0.001, Number(state.armoredHitCooldown) || 0.004)
      : Math.max(0.02, Number(state.hitCooldown) || 0.25);
    const hitMap = bladeArmoredBonusActive ? state.lastBladeHit : state.lastHit;
    const lastHit = hitMap.get(enemy) || 0;
    if (now - lastHit < effectiveHitCooldown) return;
    if (bladeArmoredBonusActive) {
      const maxHits = Math.max(1, Math.floor(Number(state.armoredMaxHitsPerSecond) || 120));
      const windowSeconds = Math.max(0.1, Number(state.armoredHitWindowSeconds) || 1);
      const existing = state.hitWindowStats.get(enemy);
      let stats =
        existing && now - existing.windowStart < windowSeconds
          ? existing
          : { windowStart: now, count: 0 };
      if ((stats.count || 0) >= maxHits) return;
      stats.count = (stats.count || 0) + 1;
      state.hitWindowStats.set(enemy, stats);
    }
    hitMap.set(enemy, now);
    const baseDamage = bladeHit ? state.damage : tetherDamage;
    const haloDamage = bladeArmoredBonusActive
      ? baseDamage * Math.max(1, Number(state.armoredDamageMultiplier) || 4.0)
      : baseDamage;
    const haloWasAlive = !enemy.dead && enemy.state !== "death";
    enemy.takeDamage(haloDamage, { damageType: "melee" });
    if (haloWasAlive && (enemy.dead || enemy.state === "death")) {
      enemy.killedByChurchPowerup = true;
    }
    registerChainHit(enemy, haloDamage);
    spawnFlashEffect(
      bladeHit ? center.x : tetherImpactX,
      bladeHit ? center.y - targetRadius * 0.3 : tetherImpactY,
    );
    if (bladeHit) {
      playHaloBladeImpactFeedback();
    }
  });

  projectiles.forEach((proj) => {
    if (!proj || proj.dead || proj.friendly || proj.visualOnly) return;
    const px = proj.x || 0;
    const py = proj.y || 0;
    const pr = proj.radius || 0;
    const dx = px - state.x;
    const dy = py - state.y;
    const bladeHit = dx * dx + dy * dy <= (hitRadius + pr) ** 2;
    let tetherHit = false;
    let impactX = px;
    let impactY = py;
    if (!bladeHit && tetherHitRadius > 0) {
      const closest = closestPointOnSegment(px, py, tetherStartX, tetherStartY, tetherEndX, tetherEndY);
      const cdx = px - closest.x;
      const cdy = py - closest.y;
      tetherHit = cdx * cdx + cdy * cdy <= (pr + tetherHitRadius) ** 2;
      impactX = closest.x;
      impactY = closest.y;
    }
    if (!bladeHit && !tetherHit) return;
    const destroyed = applyProjectileDurabilityDamage(proj, state.damage);
    if (destroyed) {
      spawnImpactEffect(bladeHit ? px : impactX, bladeHit ? py : impactY);
    }
  });

  if (activeBoss && !activeBoss.dead && !activeBoss.defeated) {
    const dx = activeBoss.x - state.x;
    const dy = activeBoss.y - state.y;
    const bossBladeHit = dx * dx + dy * dy <= (hitRadius + activeBoss.radius * 0.9) ** 2;
    let bossTetherHit = false;
    let bossImpactX = activeBoss.x;
    let bossImpactY = activeBoss.y;
    if (!bossBladeHit && tetherHitRadius > 0) {
      const closest = closestPointOnSegment(
        activeBoss.x,
        activeBoss.y,
        tetherStartX,
        tetherStartY,
        tetherEndX,
        tetherEndY,
      );
      const cdx = activeBoss.x - closest.x;
      const cdy = activeBoss.y - closest.y;
      bossTetherHit = cdx * cdx + cdy * cdy <= (activeBoss.radius * 0.9 + tetherHitRadius) ** 2;
      bossImpactX = closest.x;
      bossImpactY = closest.y;
    }
    if (bossBladeHit || bossTetherHit) {
      const lastHit = state.lastHit.get(activeBoss) || 0;
      if (now - lastHit >= state.hitCooldown) {
        state.lastHit.set(activeBoss, now);
        const bossDamage = bossBladeHit ? state.damage : tetherDamage;
        activeBoss.takeDamage(bossDamage, {
          hitX: bossBladeHit ? state.x : bossImpactX,
          hitY: bossBladeHit ? state.y : bossImpactY,
          damageType: "melee",
          skipImpactEffect: true,
        });
        registerChainHit(activeBoss, bossDamage);
        spawnFlashEffect(
          bossBladeHit ? state.x : bossImpactX,
          bossBladeHit ? state.y : bossImpactY,
        );
        if (bossBladeHit) {
          playHaloBladeImpactFeedback();
        }
      }
    }
  }
}

function resetHaloBladeState(state) {
  state.active = false;
  state.trail.length = 0;
  state.trailTimer = 0;
  state.lastHit = new WeakMap();
  state.lastBladeHit = new WeakMap();
  state.hitWindowStats = new WeakMap();
  state.lastBladeImpactSfxAt = 0;
}

function updateHaloBlade(dt) {
  const hasPrimary = (player?.haloTimer || 0) > 0;
  const hasSecondary = (player?.haloTimerSecondary || 0) > 0;
  const hasBonus = (player?.haloTimerBonus || 0) > 0;
  if (!player || player.state === "death" || (!hasPrimary && !hasSecondary && !hasBonus)) {
    resetHaloBladeState(haloBladeState);
    resetHaloBladeState(haloBladeStateSecondary);
    resetHaloBladeState(haloBladeStateBonus);
    return;
  }
  haloBladeState.active = true;
  if (!haloBladeState.sprite && assets?.churchPowerups?.halo?.image) {
    haloBladeState.sprite = assets.churchPowerups.halo.image;
  }
  if (!haloBladeStateSecondary.sprite) {
    haloBladeStateSecondary.sprite = haloBladeState.sprite;
  }
  if (!haloBladeStateBonus.sprite) {
    haloBladeStateBonus.sprite = haloBladeState.sprite;
  }
  const angle = (haloBladeState.angle || 0) + haloBladeState.speed * dt;
  const baseAngle = angle % (Math.PI * 2);
  haloBladeState.angle = baseAngle;
  updateHaloBladeInstance(haloBladeState, baseAngle, dt);

  if (hasSecondary) {
    haloBladeStateSecondary.active = true;
    updateHaloBladeInstance(haloBladeStateSecondary, baseAngle + Math.PI, dt);
  } else {
    resetHaloBladeState(haloBladeStateSecondary);
  }
  if (hasBonus) {
    haloBladeStateBonus.active = true;
    updateHaloBladeInstance(haloBladeStateBonus, baseAngle + (Math.PI * 2) / 3, dt);
  } else {
    resetHaloBladeState(haloBladeStateBonus);
  }
}

function resetShieldTrailState(state) {
  state.active = false;
  state.trail.length = 0;
  state.trailTimer = 0;
}

function updateShieldTrailInstance(state, angle, dt) {
  const radiusX = state.radius;
  const offX = Math.cos(angle) * radiusX;
  const offY = Math.sin(angle) * radiusX - 7;
  const prevOffX = state.offX || 0;
  const prevOffY = state.offY || 0;
  state.offX = offX;
  state.offY = offY;
  state.x = player.x + offX;
  state.y = player.y + offY;
  state.angle = angle;
  const travel = Math.hypot(offX - prevOffX, offY - prevOffY);
  state.trailTimer += travel;
  if (state.trailTimer >= state.trailSpacing) {
    state.trailTimer = 0;
    // Store relative to player so the trail moves with them
    state.trail.push({ offX, offY, life: state.trailLife, maxLife: state.trailLife });
    if (state.trail.length > state.maxTrail) state.trail.shift();
  }
  state.trail.forEach((point) => { point.life -= dt; });
  while (state.trail.length && state.trail[0].life <= 0) state.trail.shift();
}

function updateShieldTrails(dt) {
  const meleeState = window._meleeAttackState;
  const rushActive = Boolean(meleeState?.isRushing) || (meleeState?.rushShieldDebugTimer || 0) > 0;
  const swooshActive = (meleeState?.swooshShieldDebugTimer || 0) > 0 ||
    ((meleeState?.swooshTimer || 0) > 0 && (player?.invulnerableTimer || 0) > 0);
  const shieldActive = (player?.shieldTimer || 0) > 0 || rushActive || swooshActive;
  if (!player || player.state === "death" || !shieldActive) {
    resetShieldTrailState(shieldTrailStateA);
    resetShieldTrailState(shieldTrailStateB);
    return;
  }
  const angle = (shieldTrailStateA.angle || 0) + shieldTrailStateA.speed * dt;
  const baseAngle = angle % (Math.PI * 2);
  shieldTrailStateA.active = true;
  updateShieldTrailInstance(shieldTrailStateA, baseAngle, dt);
  shieldTrailStateB.active = true;
  updateShieldTrailInstance(shieldTrailStateB, baseAngle + Math.PI, dt);
}

function getSpearTargetCenter(target) {
  if (!target) return null;
  if (target === activeBoss) {
    return { x: activeBoss.x, y: activeBoss.y, radius: activeBoss.radius || 0 };
  }
  if (target instanceof Projectile || (target && target.visualOnly !== undefined && target.friendly !== undefined)) {
    return { x: target.x || 0, y: target.y || 0, radius: target.radius || 0 };
  }
  const center = getEnemyHitboxCenter(target);
  return { x: center.x, y: center.y, radius: getEnemyHitboxRadius(target) };
}

function hasSpearTargets() {
  const hasEnemy = enemies.some((enemy) => isEnemyTargetableForAutoAim(enemy));
  if (hasEnemy) return true;
  const hasProjectile = projectiles.some(
    (projectile) => projectile && !projectile.dead && !projectile.friendly && !projectile.visualOnly,
  );
  if (hasProjectile) return true;
  return Boolean(activeBoss && !activeBoss.dead && !activeBoss.defeated);
}

function getSingleSpearTarget() {
  let target = null;
  let count = 0;
  enemies.forEach((enemy) => {
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    count += 1;
    if (count > 1) return;
    target = enemy;
  });
  projectiles.forEach((projectile) => {
    if (!projectile || projectile.dead || projectile.friendly || projectile.visualOnly) return;
    count += 1;
    if (count > 1) return;
    target = projectile;
  });
  if (activeBoss && !activeBoss.dead && !activeBoss.defeated) {
    count += 1;
    if (count > 1) return null;
    target = activeBoss;
  }
  return count === 1 ? target : null;
}

function findNearestSpearTarget(fromX, fromY, options = {}) {
  const exclude = options.exclude || null;
  const minDistanceFrom = options.minDistanceFrom || null;
  const minDistance = Number.isFinite(options.minDistance) ? options.minDistance : 0;
  let best = null;
  let bestDist = Infinity;
  enemies.forEach((enemy) => {
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    if (exclude && enemy === exclude) return;
    if (minDistanceFrom) {
      const dxFrom = getEnemyHitboxCenter(enemy).x - minDistanceFrom.x;
      const dyFrom = getEnemyHitboxCenter(enemy).y - minDistanceFrom.y;
      if (Math.hypot(dxFrom, dyFrom) < minDistance) return;
    }
    const center = getEnemyHitboxCenter(enemy);
    const dx = center.x - fromX;
    const dy = center.y - fromY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  });
  projectiles.forEach((projectile) => {
    if (!projectile || projectile.dead || projectile.friendly || projectile.visualOnly) return;
    if (exclude && projectile === exclude) return;
    if (minDistanceFrom) {
      const dxFrom = (projectile.x || 0) - minDistanceFrom.x;
      const dyFrom = (projectile.y || 0) - minDistanceFrom.y;
      if (Math.hypot(dxFrom, dyFrom) < minDistance) return;
    }
    const dx = (projectile.x || 0) - fromX;
    const dy = (projectile.y || 0) - fromY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = projectile;
    }
  });
  if (activeBoss && !activeBoss.dead && !activeBoss.defeated && exclude !== activeBoss) {
    if (minDistanceFrom) {
      const dxFrom = activeBoss.x - minDistanceFrom.x;
      const dyFrom = activeBoss.y - minDistanceFrom.y;
      if (Math.hypot(dxFrom, dyFrom) < minDistance) {
        return best;
      }
    }
    const dx = activeBoss.x - fromX;
    const dy = activeBoss.y - fromY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      best = activeBoss;
    }
  }
  return best;
}

function collectSentryBeamHits(state, originX, originY, dirX, dirY, maxDistance) {
  const hits = [];
  const checkTarget = (target, center, baseRadius) => {
    const dx = center.x - originX;
    const dy = center.y - originY;
    const t = dx * dirX + dy * dirY;
    if (t < 0 || t > maxDistance) return;
    const px = originX + dirX * t;
    const py = originY + dirY * t;
    const dist = Math.hypot(center.x - px, center.y - py);
    const radius = (state.hitRadius || 0) + baseRadius;
    if (dist > radius) return;
    hits.push({ target, hitX: px, hitY: py, dist: t });
  };

  enemies.forEach((enemy) => {
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    const center = getEnemyHitboxCenter(enemy);
    const radius = getEnemyHitboxRadius(enemy) * 0.6;
    checkTarget(enemy, center, radius);
  });
  projectiles.forEach((projectile) => {
    if (!projectile || projectile.dead || projectile.friendly || projectile.visualOnly) return;
    checkTarget(
      projectile,
      { x: projectile.x || 0, y: projectile.y || 0 },
      Math.max(6, (projectile.radius || 0) * 0.9),
    );
  });

  if (activeBoss && !activeBoss.dead && !activeBoss.defeated) {
    const radius = (activeBoss.radius || 0) * 0.8;
    checkTarget(activeBoss, { x: activeBoss.x, y: activeBoss.y }, radius);
  }

  return hits;
}

function findSentryTargetInSector(fromX, fromY, sectorAngle, halfWidth) {
  const normalizeDelta = (delta) => {
    let value = delta;
    while (value > Math.PI) value -= Math.PI * 2;
    while (value < -Math.PI) value += Math.PI * 2;
    return value;
  };

  let bestTarget = null;
  let bestDist = Infinity;

  const checkCandidate = (target, center) => {
    const dx = center.x - fromX;
    const dy = center.y - fromY;
    const angle = Math.atan2(dy, dx);
    const diff = Math.abs(normalizeDelta(angle - sectorAngle));
    if (diff > halfWidth) return;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = target;
    }
  };

  enemies.forEach((enemy) => {
    if (!isEnemyTargetableForAutoAim(enemy)) return;
    checkCandidate(enemy, getEnemyHitboxCenter(enemy));
  });

  projectiles.forEach((projectile) => {
    if (!projectile || projectile.dead || projectile.friendly || projectile.visualOnly) return;
    checkCandidate(projectile, { x: projectile.x || 0, y: projectile.y || 0 });
  });

  if (activeBoss && !activeBoss.dead && !activeBoss.defeated) {
    checkCandidate(activeBoss, { x: activeBoss.x, y: activeBoss.y });
  }

  return bestTarget;
}

function resetSentryState(state) {
  state.active = false;
  state.beamActive = false;
  state.beamProgress = 0;
  state.beamLength = 0;
  state.beamEndX = state.x;
  state.beamEndY = state.y;
  state.baseAngle = state.angle || 0;
  state.beamCooldownTimer = 0;
  state.beamPulseTimer = 0;
  state.pulseSweepRemaining = 0;
  state.hitTimer = 0;
  state.beamStartDelayTimer = 0;
  state.beamHitSfxTimer = 0;
  state.target = null;
  state.sweepAngle = Number.NaN;
}

function updateSentryTurretInstance(state, dt) {
  if (!state) return;
  const home = getNpcHomeBounds();
  const centerX = home ? home.x : canvas.width / 2;
  const centerY = home ? home.y : HUD_HEIGHT + (canvas.height - HUD_HEIGHT) / 3;
  let baseX = centerX + (state.offsetX || 0);
  let baseY = centerY + (state.offsetY || 0);
  if (state.orbitEnabled) {
    const radius = Number.isFinite(state.orbitRadius) ? state.orbitRadius : 0;
    const angle = sentryOrbitAngle + (state.orbitAngleOffset || 0);
    baseX = centerX + Math.cos(angle) * radius;
    baseY = centerY + Math.sin(angle) * radius;
  }
  state.baseX = baseX;
  state.baseY = baseY;
  state.floatTimer = (state.floatTimer || 0) + dt * (state.floatSpeed || 1);
  state.x = baseX;
  state.y = baseY + Math.sin(state.floatTimer) * (state.floatAmplitude || 0);
  state.active = true;

  if (state.beamCooldownTimer > 0) {
    state.beamCooldownTimer = Math.max(0, state.beamCooldownTimer - dt);
  }

  if (!state.beamActive) {
    if (state.beamCooldownTimer > 0) return;
    if (state.beamStartDelay > 0) {
      if (state.beamStartDelayTimer <= 0) {
        state.beamStartDelayTimer = state.beamStartDelay;
      } else {
        state.beamStartDelayTimer = Math.max(0, state.beamStartDelayTimer - dt);
      }
      if (state.beamStartDelayTimer > 0) return;
    }
    if (!hasSpearTargets()) return;
    state.beamActive = true;
    state.beamProgress = 0;
    state.beamLength = 0;
    state.hitTimer = 0;
    state.beamStartDelayTimer = 0;
    state.beamPulseTimer = Math.max(0.05, state.beamPulseDuration || 0.12);
    if (!Number.isFinite(state.sweepAngle)) {
      state.sweepAngle = sentryOrbitAngle + (state.sweepPhaseOffset || 0);
    }
    const step = Number.isFinite(state.sweepStep) ? state.sweepStep : Math.PI / 7;
    const direction = state.sweepDirection >= 0 ? 1 : -1;
    const safeStep = Math.max(0.08, Math.abs(step));
    const halfWidth = Math.min(Math.PI * 0.45, Math.max(0.18, safeStep * 0.5));
    const sectorCount = Math.max(1, Math.ceil((Math.PI * 2) / safeStep));
    let cursor = state.sweepAngle;
    let selectedTarget = null;

    for (let i = 0; i < sectorCount; i += 1) {
      const candidate = findSentryTargetInSector(state.x, state.y, cursor, halfWidth);
      if (candidate) {
        selectedTarget = candidate;
        break;
      }
      cursor += safeStep * direction;
      if (cursor >= Math.PI * 2) cursor -= Math.PI * 2;
      if (cursor < 0) cursor += Math.PI * 2;
    }

    if (!selectedTarget) {
      selectedTarget = findNearestSpearTarget(state.x, state.y);
      if (!selectedTarget) {
        state.beamActive = false;
        state.beamPulseTimer = 0;
        return;
      }
    }

    const selectedCenter = getSpearTargetCenter(selectedTarget);
    state.angle = selectedCenter
      ? Math.atan2(selectedCenter.y - state.y, selectedCenter.x - state.x)
      : cursor;
    state.sweepAngle = cursor + safeStep * direction;
    if (state.sweepAngle >= Math.PI * 2) state.sweepAngle -= Math.PI * 2;
    if (state.sweepAngle < 0) state.sweepAngle += Math.PI * 2;
    state.target = selectedTarget;
    state.pulseSweepRemaining = Math.max(0, Number(state.pulseSweepAmount) || 0);
    playSentryBeamSfx(0.5);
  }

  if (!state.beamActive) return;
  state.beamPulseTimer = Math.max(0, (state.beamPulseTimer || 0) - dt);
  if ((state.pulseSweepRemaining || 0) > 0) {
    const sweepDir = (state.pulseSweepDirection || state.sweepDirection || 1) >= 0 ? 1 : -1;
    const sweepSpeed = Math.max(0, Number(state.pulseSweepSpeed) || 0);
    const sweepStep = Math.min(state.pulseSweepRemaining, sweepSpeed * dt);
    state.angle += sweepStep * sweepDir;
    state.pulseSweepRemaining = Math.max(0, state.pulseSweepRemaining - sweepStep);
    if (state.angle >= Math.PI * 2) state.angle -= Math.PI * 2;
    if (state.angle < 0) state.angle += Math.PI * 2;
  }

  const dirX = Math.cos(state.angle || 0);
  const dirY = Math.sin(state.angle || 0);
  const maxDistance = distanceToArenaEdge(state.x, state.y, dirX, dirY);

  const speed = Math.max(1, state.beamSpeed || 1);
  state.beamProgress = Math.min(state.beamProgress + speed * dt, maxDistance);
  state.beamLength = maxDistance;
  state.beamEndX = state.x + dirX * state.beamLength;
  state.beamEndY = state.y + dirY * state.beamLength;

  if (state.beamPulseTimer <= 0) {
    state.beamActive = false;
    state.beamCooldownTimer = state.beamCooldown || 1;
    state.beamProgress = 0;
    state.beamLength = 0;
    state.hitTimer = 0;
    return;
  }

  state.hitTimer += dt;
  state.beamHitSfxTimer = Math.max(0, (state.beamHitSfxTimer || 0) - dt);
  const interval = Math.max(0.01, state.hitInterval || 0.05);
  while (state.hitTimer >= interval) {
    state.hitTimer -= interval;
    if (state.beamLength <= 0) continue;
    const currentHits = collectSentryBeamHits(
      state,
      state.x,
      state.y,
      dirX,
      dirY,
      state.beamLength,
    );
    let hitSfxPlayed = false;
    currentHits.forEach((hit) => {
      const target = hit.target;
      if (!target || target.dead || target.state === "death") return;
      const hitX = hit.hitX;
      const hitY = hit.hitY;
      if (target === activeBoss) {
        activeBoss.takeDamage(state.damage, {
          hitX,
          hitY,
          damageType: "projectile",
          skipImpactEffect: true,
        });
        registerChainHit(activeBoss, state.damage);
      } else if (target instanceof Projectile || (target.visualOnly !== undefined && target.friendly !== undefined)) {
        // Hostile projectile — destroy it, no takeDamage method exists
        const destroyed = target.maxDurability > 0
          ? applyProjectileDurabilityDamage(target, state.damage)
          : ((target.dead = true), true);
        if (destroyed) {
          spawnImpactEffect(hitX, hitY);
        }
      } else {
        target.takeDamage(state.damage, { damageType: "projectile" });
        registerChainHit(target, state.damage);
      }
      const targetHealth =
        target === activeBoss ? activeBoss?.health : target?.health;
      const targetDead = Number.isFinite(targetHealth) ? targetHealth <= 0 : false;
      if (!targetDead && !hitSfxPlayed && state.beamHitSfxTimer <= 0) {
        playSpearHitSfx(0.8);
        hitSfxPlayed = true;
        state.beamHitSfxTimer = 0.12;
      }
      if (!targetDead) {
        spawnSentryBeamHitEffect(hitX, hitY);
      }
    });
  }
}

function updateSpearStateTrail(state, dt) {
  if (!state.trail.length) return;
  state.trail.forEach((point) => {
    point.life -= dt;
  });
  while (state.trail.length && state.trail[0].life <= 0) {
    state.trail.shift();
  }
}

function applySpearHit(state, target, hitX, hitY) {
  const now =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const lastHit = state.lastHit.get(target) || 0;
  if (now - lastHit < state.hitCooldown) return false;
  state.lastHit.set(target, now);
  const damageClass = String(target?.damageClass || target?.config?.damageClass || "").toLowerCase();
  const isArmoredTarget = damageClass === "armored" || damageClass === "tank";
  const hitDamage = isArmoredTarget
    ? state.damage * Math.max(1, Number(state.armoredDamageMultiplier) || 1)
    : state.damage;
  if (target === activeBoss) {
    activeBoss.takeDamage(hitDamage, {
      hitX,
      hitY,
      damageType: "projectile",
      skipImpactEffect: true,
    });
    registerChainHit(activeBoss, hitDamage);
  } else if (target instanceof Projectile || (target && target.visualOnly !== undefined && target.friendly !== undefined)) {
    const destroyed = target.maxDurability > 0
      ? applyProjectileDurabilityDamage(target, hitDamage)
      : ((target.dead = true), true);
    if (destroyed) {
      spawnImpactEffect(hitX, hitY);
    }
  } else {
    target.takeDamage(hitDamage, { damageType: "projectile" });
    registerChainHit(target, hitDamage);
  }
  const targetHealth = target === activeBoss ? activeBoss?.health : target?.health;
  const targetDead =
    target instanceof Projectile || (target && target.visualOnly !== undefined && target.friendly !== undefined)
      ? Boolean(target?.dead)
      : Number.isFinite(targetHealth)
        ? targetHealth <= 0
        : Boolean(target?.dead || target?.state === "death");
  playSpearHitSfx(0.8);
  if (targetDead) {
    spawnFlashEffect(hitX, hitY, { tintColor: "#FFFFFF", tintAlpha: 0.95, scale: 2.0 });
  } else {
    spawnFlashEffect(hitX, hitY);
  }
  return true;
}

function applySpearPassThroughHits(state, fromX, fromY, toX, toY, exclude) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const lenSq = dx * dx + dy * dy || 1;
  const hitTest = (tx, ty, radius) => {
    const t = Math.max(0, Math.min(1, ((tx - fromX) * dx + (ty - fromY) * dy) / lenSq));
    const px = fromX + dx * t;
    const py = fromY + dy * t;
    const ddx = tx - px;
    const ddy = ty - py;
    return ddx * ddx + ddy * ddy <= radius * radius;
  };
  enemies.forEach((enemy) => {
    if (!enemy || enemy.dead || enemy.state === "death") return;
    if (exclude && (enemy === exclude.target || enemy === exclude.last)) return;
    const center = getEnemyHitboxCenter(enemy);
    const radius = state.hitRadius + getEnemyHitboxRadius(enemy) * 0.6;
    if (hitTest(center.x, center.y, radius)) {
      applySpearHit(state, enemy, center.x, center.y);
    }
  });
  projectiles.forEach((projectile) => {
    if (!projectile || projectile.dead || projectile.friendly || projectile.visualOnly) return;
    if (exclude && (projectile === exclude.target || projectile === exclude.last)) return;
    const radius = state.hitRadius + Math.max(6, (projectile.radius || 0) * 0.9);
    if (hitTest(projectile.x || 0, projectile.y || 0, radius)) {
      applySpearHit(state, projectile, projectile.x || 0, projectile.y || 0);
    }
  });
  if (activeBoss && !activeBoss.dead && !activeBoss.defeated) {
    if (!(exclude && exclude.target === activeBoss)) {
      const radius = state.hitRadius + (activeBoss.radius || 0) * 0.8;
      if (hitTest(activeBoss.x, activeBoss.y, radius)) {
        applySpearHit(state, activeBoss, activeBoss.x, activeBoss.y);
      }
    }
  }
}

function resetSpearState(state) {
  state.active = false;
  state.trail.length = 0;
  state.trailTimer = 0;
  state.target = null;
  state.pauseTimer = 0;
  state.pendingRetarget = false;
  state.travelSinceHit = 0;
  state.hits = 0;
  state.lastTarget = null;
  state.lastHitPos = null;
  state.waypoint = null;
  state.lastHit = new WeakMap();
  state.startDelayTimer = 0;
  state.useSpawnOffset = false;
  state.spawnOffset.x = 0;
  state.spawnOffset.y = 0;
  state.turnSfxCooldown = 0;
}

function updateSpearDartInstance(state, dt) {
  const wasActive = state.active;
  state.active = true;
  state.turnSfxCooldown = Math.max(0, (state.turnSfxCooldown || 0) - dt);
  if (!wasActive) {
    if (state.useSpawnOffset) {
      state.x = player.x + state.spawnOffset.x;
      state.y = player.y + state.spawnOffset.y;
      state.useSpawnOffset = false;
    } else {
      state.x = player.x;
      state.y = player.y;
    }
    state.trail.length = 0;
    state.trailTimer = 0;
    state.target = null;
    state.pauseTimer = 0;
    state.pendingRetarget = false;
    state.travelSinceHit = 0;
    state.hits = 0;
    state.lastTarget = null;
    state.lastHitPos = null;
    state.waypoint = null;
    playSpearTurnSfx(0.6);
  }

  if (state.pauseTimer > 0) {
    state.pauseTimer = Math.max(0, state.pauseTimer - dt);
    updateSpearStateTrail(state, dt);
    return;
  }
  if (state.waypoint) {
    const prevX = state.x;
    const prevY = state.y;
    const dx = state.waypoint.x - state.x;
    const dy = state.waypoint.y - state.y;
    const distance = Math.hypot(dx, dy) || 1;
    const dirX = dx / distance;
    const dirY = dy / distance;
    const step = Math.min(distance, state.speed * dt);
    state.x += dirX * step;
    state.y += dirY * step;
    state.angle = Math.atan2(dirY, dirX);
    state.travelSinceHit += step;
    state.trailTimer += step;
    applySpearPassThroughHits(state, prevX, prevY, state.x, state.y, {
      target: state.target,
      last: state.lastTarget,
    });
    if (state.trailTimer >= state.trailSpacing) {
      state.trailTimer = 0;
      state.trail.push({
        x: state.x,
        y: state.y,
        life: state.trailLife,
        maxLife: state.trailLife,
      });
      if (state.trail.length > state.maxTrail) {
        state.trail.shift();
      }
    }
    updateSpearStateTrail(state, dt);
    if (distance <= state.hitRadius) {
      state.waypoint = null;
      state.pendingRetarget = true;
    }
    return;
  }
  if (state.pendingRetarget || !state.target || state.target.dead || state.target.state === "death") {
    const singleTarget = getSingleSpearTarget();
    if (
      singleTarget &&
      state.lastHitPos &&
      state.travelSinceHit < state.minTravel &&
      !state.waypoint
    ) {
      const awayDir = normalizeVector(
        state.x - state.lastHitPos.x,
        state.y - state.lastHitPos.y,
      );
      const fallbackDir = awayDir.x === 0 && awayDir.y === 0 ? { x: 1, y: 0 } : awayDir;
      const perp = { x: -fallbackDir.y, y: fallbackDir.x };
      const zigDir = state.hits % 2 === 0 ? perp : { x: -perp.x, y: -perp.y };
      const dir = zigDir.x === 0 && zigDir.y === 0 ? fallbackDir : zigDir;
      const minX = 20;
      const maxX = canvas.width - 20;
      const minY = HUD_HEIGHT + 20;
      const maxY = canvas.height - 20;
      const targetX = clamp(
        state.lastHitPos.x + dir.x * state.minTravel,
        minX,
        maxX,
      );
      const targetY = clamp(
        state.lastHitPos.y + dir.y * state.minTravel,
        minY,
        maxY,
      );
      state.waypoint = { x: targetX, y: targetY };
      if (state.turnSfxCooldown <= 0) {
        playSpearTurnSfx(0.6);
        state.turnSfxCooldown = 0.12;
      }
      return;
    }
    if (singleTarget) {
      state.target = singleTarget;
    } else {
      state.target = findNearestSpearTarget(state.x, state.y, {
        exclude: state.lastTarget,
        minDistanceFrom: state.lastHitPos,
        minDistance: state.minTravel,
      });
      if (!state.target) {
        state.target = findNearestSpearTarget(state.x, state.y, {
          exclude: state.lastTarget,
        });
      }
    }
    state.pendingRetarget = false;
    state.travelSinceHit = 0;
    if (state.target && state.turnSfxCooldown <= 0) {
      playSpearTurnSfx(0.6);
      state.turnSfxCooldown = 0.12;
    }
    if (!state.target && state.lastHitPos && hasSpearTargets()) {
      const awayDir = normalizeVector(
        state.x - state.lastHitPos.x,
        state.y - state.lastHitPos.y,
      );
      const fallbackDir = awayDir.x === 0 && awayDir.y === 0 ? { x: 1, y: 0 } : awayDir;
      const minX = 20;
      const maxX = canvas.width - 20;
      const minY = HUD_HEIGHT + 20;
      const maxY = canvas.height - 20;
      const targetX = clamp(
        state.lastHitPos.x + fallbackDir.x * state.minTravel,
        minX,
        maxX,
      );
      const targetY = clamp(
        state.lastHitPos.y + fallbackDir.y * state.minTravel,
        minY,
        maxY,
      );
      state.waypoint = { x: targetX, y: targetY };
      if (state.turnSfxCooldown <= 0) {
        playSpearTurnSfx(0.6);
        state.turnSfxCooldown = 0.12;
      }
      return;
    }
  }

  const target = state.target;
  if (!target) {
    if (!hasSpearTargets()) {
      const spinSpeed = Number.isFinite(state.searchSpinSpeed) ? state.searchSpinSpeed : 1.2;
      state.angle = ((state.angle || 0) + spinSpeed * dt) % (Math.PI * 2);
      updateSpearStateTrail(state, dt);
      return;
    }
    state.x = player.x;
    state.y = player.y;
    const spinSpeed = Number.isFinite(state.searchSpinSpeed) ? state.searchSpinSpeed : 1.2;
    state.angle = ((state.angle || 0) + spinSpeed * dt) % (Math.PI * 2);
    updateSpearStateTrail(state, dt);
    return;
  }

  const targetCenter = getSpearTargetCenter(target);
  if (!targetCenter) return;
  const prevX = state.x;
  const prevY = state.y;
  const dx = targetCenter.x - state.x;
  const dy = targetCenter.y - state.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dirX = dx / distance;
  const dirY = dy / distance;
  const step = Math.min(distance, state.speed * dt);
  state.x += dirX * step;
  state.y += dirY * step;
  state.angle = Math.atan2(dirY, dirX);
  state.travelSinceHit += step;
  applySpearPassThroughHits(state, prevX, prevY, state.x, state.y, {
    target: state.target,
    last: state.lastTarget,
  });

  state.trailTimer += step;
  if (state.trailTimer >= state.trailSpacing) {
    state.trailTimer = 0;
    state.trail.push({
      x: state.x,
      y: state.y,
      life: state.trailLife,
      maxLife: state.trailLife,
    });
    if (state.trail.length > state.maxTrail) {
      state.trail.shift();
    }
  }
  updateSpearStateTrail(state, dt);

  const hitRadius = state.hitRadius + (targetCenter.radius || 0) * 0.6;
  const canHit =
    state.hits === 0 ||
    state.travelSinceHit >= state.minTravel;
  if (distance <= hitRadius && !canHit) {
    const away = normalizeVector(
      state.x - targetCenter.x,
      state.y - targetCenter.y,
    );
    const fallback = away.x === 0 && away.y === 0 ? { x: 1, y: 0 } : away;
    const pushStep = state.speed * dt;
    const pushPrevX = state.x;
    const pushPrevY = state.y;
    state.x += fallback.x * pushStep;
    state.y += fallback.y * pushStep;
    state.angle = Math.atan2(fallback.y, fallback.x);
    state.travelSinceHit += pushStep;
    state.trailTimer += pushStep;
    applySpearPassThroughHits(state, pushPrevX, pushPrevY, state.x, state.y, {
      target: state.target,
      last: state.lastTarget,
    });
    if (state.trailTimer >= state.trailSpacing) {
      state.trailTimer = 0;
      state.trail.push({
        x: state.x,
        y: state.y,
        life: state.trailLife,
        maxLife: state.trailLife,
      });
      if (state.trail.length > state.maxTrail) {
        state.trail.shift();
      }
    }
    updateSpearStateTrail(state, dt);
    return;
  }
  if (distance <= hitRadius && canHit) {
    applySpearHit(state, target, targetCenter.x, targetCenter.y);
    state.hits += 1;
    state.pauseTimer = state.pauseDuration;
    state.pendingRetarget = true;
    state.target = null;
    state.lastTarget = target;
    state.lastHitPos = { x: targetCenter.x, y: targetCenter.y };
    state.travelSinceHit = 0;
  }
}

function updateSpearDart(dt) {
  const hasPrimary = (player?.spearTimer || 0) > 0;
  const hasSecondary = (player?.spearTimerSecondary || 0) > 0;
  const hasBonus = (player?.spearTimerBonus || 0) > 0;
  if (!player || player.state === "death" || (!hasPrimary && !hasSecondary && !hasBonus)) {
    resetSpearState(spearState);
    resetSpearState(spearStateSecondary);
    resetSpearState(spearStateBonus);
    return;
  }
  if (!spearState.sprite && assets?.churchPowerups?.spear?.image) {
    spearState.sprite = assets.churchPowerups.spear.image;
  }
  if (!spearStateSecondary.sprite) {
    spearStateSecondary.sprite = spearState.sprite;
  }
  if (!spearStateBonus.sprite) {
    spearStateBonus.sprite = spearState.sprite;
  }
  updateSpearDartInstance(spearState, dt);
  if (hasSecondary) {
    if (!spearStateSecondary.active && spearStateSecondary.startDelayTimer <= 0) {
      spearStateSecondary.startDelayTimer = 0.1;
      spearStateSecondary.spawnOffset.x = 24 * WORLD_SCALE;
      spearStateSecondary.spawnOffset.y = -16 * WORLD_SCALE;
      spearStateSecondary.useSpawnOffset = true;
    }
    if (spearStateSecondary.startDelayTimer > 0) {
      spearStateSecondary.startDelayTimer = Math.max(0, spearStateSecondary.startDelayTimer - dt);
    }
    if (spearStateSecondary.startDelayTimer <= 0) {
      updateSpearDartInstance(spearStateSecondary, dt);
    }
  } else {
    resetSpearState(spearStateSecondary);
  }
  if (hasBonus) {
    if (!spearStateBonus.active && spearStateBonus.startDelayTimer <= 0) {
      spearStateBonus.startDelayTimer = 0.12;
      spearStateBonus.spawnOffset.x = -22 * WORLD_SCALE;
      spearStateBonus.spawnOffset.y = -18 * WORLD_SCALE;
      spearStateBonus.useSpawnOffset = true;
    }
    if (spearStateBonus.startDelayTimer > 0) {
      spearStateBonus.startDelayTimer = Math.max(0, spearStateBonus.startDelayTimer - dt);
    }
    if (spearStateBonus.startDelayTimer <= 0) {
      updateSpearDartInstance(spearStateBonus, dt);
    }
  } else {
    resetSpearState(spearStateBonus);
  }
}

function updateSentryTurret(dt) {
  const hasPrimary = (player?.sentryTimer || 0) > 0;
  const hasSecondary = (player?.sentryTimerSecondary || 0) > 0;
  const hasBonus = (player?.sentryTimerBonus || 0) > 0;
  if (!player || player.state === "death" || (!hasPrimary && !hasSecondary && !hasBonus)) {
    if (sentryState.active) {
      const sprite = sentryState.sprite;
      const radius =
        sprite && sprite.width
          ? Math.max(sprite.width, sprite.height) * (sentryState.scale || 1) * 0.35
          : 24 * WORLD_SCALE;
      spawnPuffEffect(sentryState.x, sentryState.y, radius * 3);
    }
    if (sentryStateSecondary.active) {
      const sprite = sentryStateSecondary.sprite;
      const radius =
        sprite && sprite.width
          ? Math.max(sprite.width, sprite.height) * (sentryStateSecondary.scale || 1) * 0.35
          : 24 * WORLD_SCALE;
      spawnPuffEffect(sentryStateSecondary.x, sentryStateSecondary.y, radius * 3);
    }
    if (sentryStateBonus.active) {
      const sprite = sentryStateBonus.sprite;
      const radius =
        sprite && sprite.width
          ? Math.max(sprite.width, sprite.height) * (sentryStateBonus.scale || 1) * 0.35
          : 24 * WORLD_SCALE;
      spawnPuffEffect(sentryStateBonus.x, sentryStateBonus.y, radius * 3);
    }
    resetSentryState(sentryState);
    resetSentryState(sentryStateSecondary);
    resetSentryState(sentryStateBonus);
    return;
  }
  const orbitSpeed = 0.6;
  sentryOrbitAngle = (sentryOrbitAngle + orbitSpeed * dt) % (Math.PI * 2);
  const fadeWindow = 2;
  const fadeAlpha =
    player.sentryTimer <= fadeWindow
      ? Math.max(0, player.sentryTimer / fadeWindow)
      : 1;
  sentryState.fadeAlpha = fadeAlpha;
  sentryStateSecondary.fadeAlpha = fadeAlpha;
  sentryStateBonus.fadeAlpha = fadeAlpha;
  if (!sentryState.sprite && assets?.churchPowerups?.sentry?.image) {
    sentryState.sprite = assets.churchPowerups.sentry.image;
  }
  if (!sentryStateSecondary.sprite) {
    sentryStateSecondary.sprite = sentryState.sprite;
  }
  if (!sentryStateBonus.sprite) {
    sentryStateBonus.sprite = sentryState.sprite;
  }
  updateSentryTurretInstance(sentryState, dt);
  if (hasSecondary) {
    updateSentryTurretInstance(sentryStateSecondary, dt);
  } else {
    resetSentryState(sentryStateSecondary);
  }
  if (hasBonus) {
    updateSentryTurretInstance(sentryStateBonus, dt);
  } else {
    resetSentryState(sentryStateBonus);
  }
}

function updatePowerupHudFlyEffects(dt) {
  if (!powerupHudFlyEffects.length) {
    if (typeof window !== "undefined") {
      window.__hudPowerupIconInFlight = {};
    }
    return;
  }
  if (typeof window !== "undefined") {
    window.__hudPowerupIconInFlight = {};
    powerupHudFlyEffects.forEach((effect) => {
      if (effect?.targetKey) window.__hudPowerupIconInFlight[effect.targetKey] = true;
    });
  }
  for (let i = powerupHudFlyEffects.length - 1; i >= 0; i -= 1) {
    const effect = powerupHudFlyEffects[i];
    if (!effect) continue;
    if (!effect.targetReady) {
      const targetMap = typeof window !== "undefined" ? window.__hudPowerupIconPos : null;
      const target = targetMap ? targetMap[effect.targetKey] : null;
      if (target) {
        effect.targetX = target.x;
        effect.targetY = target.y;
        effect.targetReady = true;
      } else {
        continue;
      }
    }
    effect.timer += dt;
    const t = Math.min(1, effect.timer / Math.max(0.001, effect.duration));
    const ease = 1 - Math.pow(1 - t, 3);
    effect.x = effect.startX + (effect.targetX - effect.startX) * ease;
    effect.y = effect.startY + (effect.targetY - effect.startY) * ease;
    effect.alpha = Math.max(0, 1 - t * 0.2);
    if (t >= 1) {
      powerupHudFlyEffects.splice(i, 1);
    }
  }
}

// combo HUD fly effects removed.

function spawnGraceBurst(count = 10, { centerX = canvas.width / 2, centerY = (canvas.height + HUD_HEIGHT) / 2, spread = 220 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * spread * 0.8;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    spawnGracePickup(x, y, { scatter: true });
  }
}

function spawnGraceRainBurst(
  count = 10,
  { centerX = canvas.width / 2, spread = 260, life = null, fullWidth = false } = {},
) {
  const area = getPlayfieldBounds();
  const spawnY = Math.max(area.minY - 140, HUD_HEIGHT - 140);
  const viewOffsetX = Number.isFinite(cameraOffsetX) ? cameraOffsetX : 0;
  const minRainX = viewOffsetX;
  const maxRainX = viewOffsetX + canvas.width;
  const clampedCenterX = Math.max(minRainX, Math.min(maxRainX, centerX));
  const spawnMinX = fullWidth ? minRainX : Math.max(minRainX, clampedCenterX - spread);
  const spawnMaxX = fullWidth ? maxRainX : Math.min(maxRainX, clampedCenterX + spread);
  for (let i = 0; i < count; i += 1) {
    const x = randomInRange(spawnMinX, Math.max(spawnMinX + 1, spawnMaxX));
    const vx = randomInRange(-60, 60);
    const vy = randomInRange(60, 140);
    const floorY = randomInRange(area.minY, area.maxY);
    spawnGracePickup(x, spawnY + randomInRange(-40, 40), {
      vx,
      vy,
      value: 1,
      life: Number.isFinite(life) ? life : undefined,
      useGravity: true,
      bounce: true,
      gravity: GRACE_PICKUP_GRAVITY * 1.9,
      floorY,
      bounceDamp: 0.55,
      airDrag: 0.985,
      trackViewportXBounds: fullWidth,
      minX: minRainX,
      maxX: maxRainX,
    });
  }
}

function spawnVictoryGraceBurst(options = {}) {
  const {
    amount = GRACE_VICTORY_BURST_AMOUNT,
    reason = "battle",
    centerX: overrideX = null,
    centerY: overrideY = null,
    life = null,
  } = options || {};
  const area = getPlayfieldBounds();
  const centerX =
    Number.isFinite(overrideX) ? overrideX : player ? player.x : (area.minX + area.maxX) / 2;
  const centerY =
    Number.isFinite(overrideY) ? overrideY : player ? player.y : (area.minY + area.maxY) / 2;
  const spread =
    reason === "boss"
      ? Math.max(area.maxX - area.minX, area.maxY - area.minY) * 0.6
      : Math.min(area.maxX - area.minX, area.maxY - area.minY) * 0.4;
  spawnGraceRainBurst(amount, {
    centerX,
    spread,
    life,
    fullWidth: reason === "boss",
  });
}

function maybeDropGraceFromEnemy(enemy) {
  if (!enemy || visitorSession?.active) return;
  const framesAvailable = assets?.items?.gracePickup?.frames;
  if (!framesAvailable || !framesAvailable.length) return;
  const baseHealth = Number.isFinite(enemy.maxHealth)
    ? enemy.maxHealth
    : Number.isFinite(enemy.config?.health)
      ? enemy.config.health
      : enemy.health;
  const hpForDrop = Math.max(0, Number.isFinite(baseHealth) ? baseHealth : 0);
  if (hpForDrop <= 0) return;

  const classMult = Math.max(0, getActiveClassMultiplier("economy.graceGainMultiplier", 1));
  const perHp = Math.max(0, GRACE_DROP_PER_HP) * classMult;
  graceDropHpBudget += hpForDrop * perHp;

  const maxPerKill = Math.max(0, Math.floor(GRACE_DROP_MAX_PER_KILL));
  const wholeFromBudget = Math.floor(graceDropHpBudget);
  const gemsToSpawn = maxPerKill > 0
    ? Math.min(maxPerKill, wholeFromBudget)
    : wholeFromBudget;
  if (gemsToSpawn <= 0) return;

  graceDropHpBudget = Math.max(0, graceDropHpBudget - gemsToSpawn);
  spawnGraceArcBurst(enemy.x, enemy.y, gemsToSpawn);
}

function updateGracePickups(dt) {
  if (!gracePickups.length) return;
  for (let i = gracePickups.length - 1; i >= 0; i -= 1) {
    const pickup = gracePickups[i];
    if (!pickup) continue;
    pickup.frameTimer += dt;
    pickup.bobTimer += dt * 3;
    if (pickup.spawnBlink > 0) pickup.spawnBlink = Math.max(0, pickup.spawnBlink - dt);
    while (pickup.frameTimer >= pickup.frameDuration) {
      pickup.frameTimer -= pickup.frameDuration;
      pickup.frameIndex = (pickup.frameIndex + 1) % pickup.frames.length;
    }
    if (pickup.useGravity && Number.isFinite(pickup.gravity)) {
      pickup.vy += pickup.gravity * dt;
    }
    const drag = Number.isFinite(pickup.airDrag) ? pickup.airDrag : GRACE_PICKUP_AIR_DRAG;
    pickup.vx *= drag;
    pickup.vy *= drag;
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    if (pickup.bounce && Number.isFinite(pickup.floorY) && pickup.y >= pickup.floorY) {
      pickup.y = pickup.floorY;
      if (pickup.vy > 0) {
        if (!pickup.landSfxPlayed) {
          playGraceLandSfx(0.15);
          pickup.landSfxPlayed = true;
        }
        pickup.vy = -pickup.vy * pickup.bounceDamp;
        pickup.vx *= 0.85;
        if (Math.abs(pickup.vy) < 40) {
          pickup.vy = 0;
          pickup.vx *= 0.6;
          pickup.grounded = true;
        }
      }
    }
    if (pickup.bounce) {
      const radius = pickup.radius || GRACE_PICKUP_RADIUS;
      let leftWall = Number.isFinite(pickup.minX) ? pickup.minX : radius;
      let rightWall = Number.isFinite(pickup.maxX) ? pickup.maxX : (canvas.width - radius);
      if (pickup.trackViewportXBounds) {
        const viewOffsetX = Number.isFinite(cameraOffsetX) ? cameraOffsetX : 0;
        leftWall = viewOffsetX;
        rightWall = viewOffsetX + canvas.width;
      }
      if (pickup.x <= leftWall && pickup.vx < 0) {
        pickup.x = leftWall;
        pickup.vx = -pickup.vx * pickup.bounceDamp;
      } else if (pickup.x >= rightWall && pickup.vx > 0) {
        pickup.x = rightWall;
        pickup.vx = -pickup.vx * pickup.bounceDamp;
      }
    }
    pickup.life -= dt;
    if (pickup.life <= 3) {
      pickup.blinkTimer = (pickup.blinkTimer || 0) + dt * 8;
      pickup.blinkAlpha = Math.sin(pickup.blinkTimer) > 0 ? 1 : 0.25;
    } else {
      pickup.blinkAlpha = 1;
    }
    if (player) {
      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const distance = Math.hypot(dx, dy);
      if (
        !pickup.disableAttraction &&
        distance < GRACE_PICKUP_ATTRACT_DISTANCE &&
        player.state !== "death"
      ) {
        const attract = GRACE_PICKUP_ATTRACT_FORCE * (1 - distance / GRACE_PICKUP_ATTRACT_DISTANCE);
        pickup.vx += (dx / Math.max(distance, 0.001)) * attract * dt;
        pickup.vy += (dy / Math.max(distance, 0.001)) * attract * dt;
      }
      if (distance <= (player.radius || 24) + pickup.radius) {
        addGrace(pickup.value);
        if (typeof window !== "undefined" && typeof window.playGracePickupSfx === "function") {
          window.playGracePickupSfx(0.2);
        }
        spawnGraceHudFlyEffect(pickup);
        spawnImpactEffect(player.x, player.y - player.radius / 2);
        gracePickups.splice(i, 1);
        continue;
      }
    }
    if (pickup.life <= 0) {
      gracePickups.splice(i, 1);
    }
  }
}
