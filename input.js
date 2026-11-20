/* Input management module for Battlechurch */
(function setupInputModule(window) {
  if (!window) return;

  const ACTION_MAP = {
    up: ["w"],
    down: ["s"],
    left: ["a"],
    right: ["d"],
  // Removed right joystick and arrow button controls for future A/B button implementation
    pause: [" "],
    restart: [" "],
  };

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  const PREVENT_DEFAULT_KEYS = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    " ",
  ]);

  const keysDown = new Set();
  const keysJustPressed = new Set();
  const modifierState = {
    shift: false,
    ctrl: false,
    alt: false,
    meta: false,
  };

    // NES 'A' button test: true if left arrow is held
    let nesAButtonActive = false;

      // Track player's movement direction for melee weapon
        let movementDirection = { x: 0, y: 0 };
        let lastMovementDirection = { x: 1, y: 0 }; // Default facing right

  const pointerState = {
    x: 0,
    y: 0,
    active: false,
  };

  const virtualInput = {
    enabled: false,
    configured: false,
    deadZone: 0.12,
    movement: { x: 0, y: 0, active: false, pointerId: null },
    aim: { x: 0, y: 0, active: false, pointerId: null },
    virtualKeysDown: new Set(),
  };

  const gamepadState = {
    connected: false,
    index: -1,
    id: "",
    movement: { x: 0, y: 0, active: false },
    aim: { x: 0, y: 0, active: false },
    buttonBindings: new Map(),
    virtualKeysDown: new Set(),
  };

  const GAMEPAD_LEFT_STICK_DEADZONE = 0.2;
  const GAMEPAD_RIGHT_STICK_DEADZONE = 0.28;
  const GAMEPAD_DPAD_THRESHOLD = 0.5;

  const aimState = {
    x: 0,
    y: 1,
    usingPointer: false,
    triggerPress: false,
  };

  const FORCE_TOUCH_CONTROLS = (() => {
    try {
      if (window.__BATTLECHURCH_FORCE_VIRTUAL_CONTROLS) return true;
      const query = String(window.location.search || "").toLowerCase();
      return /\btouchcontrols=1\b/.test(query) || /\bshowtouch=1\b/.test(query);
    } catch (e) {
      return false;
    }
  })();

  const isTouchCapable = (() => {
    try {
      if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) return true;
      if (typeof window !== "undefined" && "ontouchstart" in window) return true;
      if (typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(pointer: coarse)").matches;
      }
      return false;
    } catch (e) {
      return false;
    }
  })();

  let canvas = null;
  let touchControlsRoot = null;
  let moveStickBase = null;
  let aimStickBase = null;
  let virtualSpaceButton = null;
  let arcControl = null;
  let onAnyKeyDown = null;
  let shouldUpdatePointer = null;

  let listenersAttached = false;
  let prayerBombClickQueued = false;
  let congregationClickQueued = false;
  let congregationClickKind = "volley";
  let canvasClickQueued = false;
  let canvasClickPos = null;
  let comboSwipe = null;
  let cButtonHeldAt = 0;
  const PRAYER_BOMB_HOLD_THRESHOLD_MS = 1000;
  const CONGREGATION_DOUBLE_TAP_WINDOW_MS = 220;
  let congregationTapCount = 0;
  let congregationTapStartedAt = 0;
  let congregationTapDirtied = false;

  function normalizeKey(key) {
    if (typeof key !== "string") return key;
    return key.length === 1 ? key.toLowerCase() : key;
  }

  function normalizeVector(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }

  function getCanvasCoordinates(event) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return { x, y };
  }

  function handleKeyDown(event) {
    if (isTypingTarget(event.target)) return;
    modifierState.shift = Boolean(event.shiftKey);
    modifierState.ctrl = Boolean(event.ctrlKey);
    modifierState.alt = Boolean(event.altKey);
    modifierState.meta = Boolean(event.metaKey);
    if (PREVENT_DEFAULT_KEYS.has(event.key)) event.preventDefault();
    const key = normalizeKey(event.key);
    const codeKey = (() => {
      if (typeof event.code !== "string") return null;
      if (event.code.startsWith("Digit")) return event.code.slice(5);
      if (event.code.startsWith("Numpad")) return event.code.slice(6);
      return null;
    })();
    if (!keysDown.has(key)) keysJustPressed.add(key);
    keysDown.add(key);
    if (codeKey && !keysDown.has(codeKey)) {
      keysJustPressed.add(codeKey);
      keysDown.add(codeKey);
    }
    // C button uses tap vs hold on release.
    if (event.key === "ArrowRight" && !event.repeat) {
      cButtonHeldAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      congregationTapDirtied = false;
      event.preventDefault();
    }
      // NES 'A' button test: left arrow
      if (event.key === "ArrowLeft") {
        nesAButtonActive = true;
      }
    if ((event.key === "ArrowLeft" || event.key === "ArrowDown") && (cButtonHeldAt > 0 || congregationTapCount === 1)) {
      congregationTapDirtied = true;
    }
    // Update movement direction for WASD
    let changed = false;
    if (key === "w") { movementDirection.y = -1; changed = true; }
    if (key === "s") { movementDirection.y = 1; changed = true; }
    if (key === "a") { movementDirection.x = -1; changed = true; }
    if (key === "d") { movementDirection.x = 1; changed = true; }
    if (changed && (movementDirection.x !== 0 || movementDirection.y !== 0)) {
      lastMovementDirection.x = movementDirection.x;
      lastMovementDirection.y = movementDirection.y;
    }
    if (typeof onAnyKeyDown === "function") {
      try {
        onAnyKeyDown(key, event);
      } catch (e) {
        console.warn("Input.onAnyKeyDown callback failed", e);
      }
    }
  }

  function handleKeyUp(event) {
    modifierState.shift = Boolean(event.shiftKey);
    modifierState.ctrl = Boolean(event.ctrlKey);
    modifierState.alt = Boolean(event.altKey);
    modifierState.meta = Boolean(event.metaKey);
    const key = normalizeKey(event.key);
    const codeKey = (() => {
      if (typeof event.code !== "string") return null;
      if (event.code.startsWith("Digit")) return event.code.slice(5);
      if (event.code.startsWith("Numpad")) return event.code.slice(6);
      return null;
    })();
    keysDown.delete(key);
    if (codeKey) {
      keysDown.delete(codeKey);
    }
      if (event.key === "ArrowLeft") {
        nesAButtonActive = false;
      }
    if (event.key === "ArrowRight") {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const heldMs = cButtonHeldAt > 0 ? now - cButtonHeldAt : 0;
      if (heldMs >= PRAYER_BOMB_HOLD_THRESHOLD_MS) {
        prayerBombClickQueued = true;
        congregationTapDirtied = false;
      } else if (congregationTapDirtied) {
        congregationTapCount = 0;
        congregationTapStartedAt = 0;
        congregationTapDirtied = false;
      } else {
        if (
          congregationTapCount === 1 &&
          congregationTapStartedAt > 0 &&
          now - congregationTapStartedAt <= CONGREGATION_DOUBLE_TAP_WINDOW_MS
        ) {
          congregationClickQueued = true;
          congregationClickKind = "path";
          congregationTapCount = 0;
          congregationTapStartedAt = 0;
        } else {
          congregationTapCount = 1;
          congregationTapStartedAt = now;
        }
      }
      cButtonHeldAt = 0;
    }
    // Reset movement direction if WASD released
    let changed = false;
    if (key === "w" && movementDirection.y === -1) { movementDirection.y = 0; changed = true; }
    if (key === "s" && movementDirection.y === 1) { movementDirection.y = 0; changed = true; }
    if (key === "a" && movementDirection.x === -1) { movementDirection.x = 0; changed = true; }
    if (key === "d" && movementDirection.x === 1) { movementDirection.x = 0; changed = true; }
    // If direction changed and still nonzero, update lastMovementDirection
    if (changed && (movementDirection.x !== 0 || movementDirection.y !== 0)) {
      lastMovementDirection.x = movementDirection.x;
      lastMovementDirection.y = movementDirection.y;
    }
  }

  function handleMouseMove(event) {
    if (typeof shouldUpdatePointer === "function" && !shouldUpdatePointer()) return;
    const coords = getCanvasCoordinates(event);
    pointerState.x = coords.x;
    pointerState.y = coords.y;
    pointerState.active = true;
    aimState.usingPointer = true;
    if (typeof window !== "undefined") window.__betaBadgeHover = coords;
  }

  function handleMouseLeave() {
    pointerState.active = false;
    aimState.usingPointer = false;
    aimState.triggerPress = false;
    if (typeof window !== "undefined") window.__betaBadgeHover = null;
  }

  function preventContextMenu(event) {
    event.preventDefault();
  }

  function handleCanvasClick(event, isPointer) {
    if (event.button === 0 || typeof event.button === "undefined") {
      const coords = getCanvasCoordinates(event);
      if (typeof window !== "undefined" && window.PlayingInstructions?.state?.open) {
        if (window.PlayingInstructions.handleClick(coords.x, coords.y)) return;
      }
      const bb = typeof window !== "undefined" && window.__betaBadgeBounds;
      if (bb && coords.x >= bb.x && coords.x <= bb.x + bb.w && coords.y >= bb.y && coords.y <= bb.y + bb.h) {
        if (typeof window !== "undefined" && window.PlayingInstructions) window.PlayingInstructions.open();
        return;
      }
      if (typeof window !== "undefined" && window.__battlechurchDevMeleeArenaMode) {
        const b = window.__devArenaBackBtnRect;
        if (b && coords.x >= b.x && coords.x <= b.x + b.w && coords.y >= b.y && coords.y <= b.y + b.h) {
          if (typeof window.returnToTitleScreen === "function") window.returnToTitleScreen();
          return;
        }
      }
      canvasClickQueued = true;
      canvasClickPos = coords;
      canvasClickAt = nowTime();
    }
    if (event.button === 2) {
      prayerBombClickQueued = true;
    }
  }

  // Phones send a pointerdown for a tap and then, a moment later, an
  // emulated mousedown. Counting both made one tap press a button twice
  // (e.g. "Continue" and then "Next" on the following screen).
  let lastPointerDownAt = 0;

  function handleMouseDown(event) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastPointerDownAt < 1000) return; // already handled as a pointer
    handleCanvasClick(event, false);
  }

  function handlePointerDown(event) {
    lastPointerDownAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    handleCanvasClick(event, true);
  }

  function resetVirtualJoystick(handle, state) {
    if (handle) handle.style.transform = "translate(-50%, -50%)";
    state.pointerId = null;
    state.x = 0;
    state.y = 0;
    state.active = false;
  }

  // Movement stick feel (see configureVirtualJoystick).
  const STICK_DEAD_ZONE = 0.22; // fraction of the radius before you move
  const STICK_FOLLOW_SCALE = 1.15; // thumb past this x radius drags the stick

  function setStickDirection(baseEl, dirIndex) {
    if (!baseEl) return;
    const value = dirIndex === null || dirIndex === undefined ? "" : String(dirIndex);
    if (baseEl.dataset.dir === value) return;
    baseEl.dataset.dir = value;
    baseEl.querySelectorAll(".stick-arrow").forEach((el) => {
      el.classList.toggle("is-on", value !== "" && el.dataset.dir === value);
    });
  }

  function updateVirtualJoystick(baseEl, handle, state, event) {
    const rect = baseEl.getBoundingClientRect();
    const radius = rect.width / 2;
    const centerX = rect.left + radius;
    const centerY = rect.top + radius;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    let offsetX = 0;
    let offsetY = 0;
    if (distance > 0) {
      const clampDistance = Math.min(distance, radius);
      const scale = clampDistance / distance;
      offsetX = dx * scale;
      offsetY = dy * scale;
    }
    handle.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    const normalizedX = radius > 0 ? offsetX / radius : 0;
    const normalizedY = radius > 0 ? offsetY / radius : 0;
    const magnitude = Math.min(1, Math.hypot(normalizedX, normalizedY));
    const deadZone = state === virtualInput.movement ? STICK_DEAD_ZONE : virtualInput.deadZone;
    if (magnitude > deadZone) {
      const normalized = normalizeVector(normalizedX, normalizedY);
      if (state === virtualInput.movement) {
        // The pastor moves in 8 directions at full speed, so the stick acts
        // like a circular D-pad: snap to the nearest of 8 directions.
        const angle = Math.atan2(normalized.y, normalized.x);
        const dirIndex = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
        const snapped = dirIndex * (Math.PI / 4);
        state.x = Math.cos(snapped);
        state.y = Math.sin(snapped);
        setStickDirection(baseEl, dirIndex);
      } else {
        state.x = normalized.x * magnitude;
        state.y = normalized.y * magnitude;
      }
      state.active = true;
      // Update movementDirection and lastMovementDirection for joystick
      if (state === virtualInput.movement) {
        movementDirection.x = state.x;
        movementDirection.y = state.y;
        // Only update lastMovementDirection if joystick is nonzero
        if (state.x !== 0 || state.y !== 0) {
          lastMovementDirection.x = state.x;
          lastMovementDirection.y = state.y;
        }
      }
    } else {
      if (state === virtualInput.movement) setStickDirection(baseEl, null);
      state.x = 0;
      state.y = 0;
      state.active = false;
      // Reset movementDirection for joystick
      if (state === virtualInput.movement) {
        movementDirection.x = 0;
        movementDirection.y = 0;
      }
    }
    if (state === virtualInput.aim && state.active) {
      aimState.usingPointer = false;
      aimState.x = state.x;
      aimState.y = state.y;
    }
  }

  function configureVirtualJoystick(baseEl, controlKey) {
    const handle = baseEl?.querySelector(".joystick-handle");
    if (!baseEl || !handle) return;
    const state = virtualInput[controlKey];
    const anchorEl = controlKey === "movement" ? baseEl.parentElement : baseEl;
    const reset = () => {
      resetVirtualJoystick(handle, state);
      if (controlKey === "movement") {
        baseEl.classList.remove("is-active");
        setStickDirection(baseEl, null);
        placeHome(); // glides back (CSS transition)
      }
    };

    // Movement stick (modern mobile style):
    // - rests at a "home" spot mirroring the action pad, so it's always visible;
    // - touch anywhere in the left zone and it jumps under your thumb (if you
    //   touch inside it, it stays put);
    // - drag past the edge and it follows your thumb;
    // - let go and it glides back home.
    const placeBase = (x, y) => {
      baseEl.style.left = `${x}px`;
      baseEl.style.top = `${y}px`;
      baseEl.__center = { x, y };
    };
    const placeHome = () => {
      if (controlKey !== "movement" || !anchorEl || state.pointerId !== null) return;
      const zone = anchorEl.getBoundingClientRect();
      const pad = arcControl ? arcControl.getBoundingClientRect() : null;
      const size = baseEl.getBoundingClientRect().width || 120;
      let x;
      let y;
      if (pad && pad.width > 0) {
        // Same height as the action pad, same distance from the screen edge.
        const viewportW = window.innerWidth || zone.right;
        const sideGap = Math.max(12, viewportW - pad.right);
        x = Math.max(size / 2 + 8, sideGap + size / 2 - zone.left);
        y = pad.top + pad.height / 2 - zone.top;
      } else {
        x = size / 2 + 24;
        y = zone.height - size / 2 - 24;
      }
      y = Math.max(size / 2 + 4, Math.min(zone.height - size / 2 - 4, y));
      placeBase(x, y);
    };
    if (controlKey === "movement") {
      baseEl.__placeHome = placeHome;
      baseEl.classList.add("is-floating");
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(placeHome));
      }
      window.addEventListener("resize", () => setTimeout(placeHome, 60));
    }

    const setBasePosition = (event) => {
      if (controlKey !== "movement" || !anchorEl) return;
      const zone = anchorEl.getBoundingClientRect();
      const x = event.clientX - zone.left;
      const y = event.clientY - zone.top;
      const radius = (baseEl.getBoundingClientRect().width || 120) / 2;
      const c = baseEl.__center;
      // Touching inside the stick keeps it where it is; elsewhere it jumps.
      if (!c || Math.hypot(x - c.x, y - c.y) > radius) placeBase(x, y);
      baseEl.classList.add("is-active");
    };

    // Thumb dragged past the edge: pull the stick along behind it.
    const followThumb = (event) => {
      if (controlKey !== "movement" || !anchorEl || !baseEl.__center) return;
      const zone = anchorEl.getBoundingClientRect();
      const x = event.clientX - zone.left;
      const y = event.clientY - zone.top;
      const radius = (baseEl.getBoundingClientRect().width || 120) / 2;
      const c = baseEl.__center;
      const dist = Math.hypot(x - c.x, y - c.y);
      if (dist > radius * STICK_FOLLOW_SCALE) {
        const k = (dist - radius) / dist;
        placeBase(c.x + (x - c.x) * k, c.y + (y - c.y) * k);
      }
    };

    // A quick tap with no drag in the joystick zone is meant for whatever
    // is on screen there (menu / tutorial buttons), so pass it to the game.
    let tapStart = null;

    const start = (event) => {
      if (!virtualInput.enabled) return;
      if (state.pointerId !== null) return;
      state.pointerId = event.pointerId;
      tapStart = { x: event.clientX, y: event.clientY, at: nowTime() };
      setBasePosition(event);
      try {
        anchorEl.setPointerCapture(event.pointerId);
      } catch (e) {}
      updateVirtualJoystick(baseEl, handle, state, event);
      event.preventDefault();
    };

    const move = (event) => {
      if (state.pointerId !== event.pointerId) return;
      followThumb(event);
      updateVirtualJoystick(baseEl, handle, state, event);
      event.preventDefault();
    };

    const release = (event) => {
      if (state.pointerId !== event.pointerId) return;
      try {
        anchorEl.releasePointerCapture(event.pointerId);
      } catch (e) {}
      reset();
      event.preventDefault();
      if (
        controlKey === "movement" &&
        event.type === "pointerup" &&
        tapStart &&
        nowTime() - tapStart.at <= 300 &&
        Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) <= 14
      ) {
        handleCanvasClick({ button: 0, clientX: event.clientX, clientY: event.clientY }, true);
      }
      tapStart = null;
    };

    anchorEl.addEventListener("pointerdown", start);
    anchorEl.addEventListener("pointermove", move);
    anchorEl.addEventListener("pointerup", release);
    anchorEl.addEventListener("pointercancel", release);
    anchorEl.addEventListener("pointerleave", (event) => {
      if (state.pointerId !== event.pointerId) return;
      release(event);
    });
  }

  // Shared C-button (congregation) tap/hold logic, used by keyboard, touch
  // and gamepad so they all behave the same. Pressing A or B while a C tap is
  // pending "dirties" it, which cancels Unity Strike so C -> A / C -> B can
  // become Reap / Clash.
  function noteActionKeyPressed(key) {
    if (key === "ArrowRight") {
      cButtonHeldAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      congregationTapDirtied = false;
      return;
    }
    if ((key === "ArrowLeft" || key === "ArrowDown") && (cButtonHeldAt > 0 || congregationTapCount === 1)) {
      congregationTapDirtied = true;
    }
  }

  function handleCButtonReleased() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const heldMs = cButtonHeldAt > 0 ? now - cButtonHeldAt : 0;
    if (heldMs >= PRAYER_BOMB_HOLD_THRESHOLD_MS) {
      prayerBombClickQueued = true;
      congregationTapDirtied = false;
    } else if (congregationTapDirtied) {
      congregationTapCount = 0;
      congregationTapStartedAt = 0;
      congregationTapDirtied = false;
    } else if (
      congregationTapCount === 1 &&
      congregationTapStartedAt > 0 &&
      now - congregationTapStartedAt <= CONGREGATION_DOUBLE_TAP_WINDOW_MS
    ) {
      congregationClickQueued = true;
      congregationClickKind = "path";
      congregationTapCount = 0;
      congregationTapStartedAt = 0;
    } else {
      congregationTapCount = 1;
      congregationTapStartedAt = now;
    }
    cButtonHeldAt = 0;
  }

  function pressVirtualKey(key, { setNesA = false, setPrayerBomb = false } = {}) {
    const normalized = normalizeKey(key);
    if (!keysDown.has(normalized)) keysJustPressed.add(normalized);
    keysDown.add(normalized);
    virtualInput.virtualKeysDown.add(normalized);
    if (setNesA) nesAButtonActive = true;
    noteActionKeyPressed(key);
  }

  function pressGamepadKey(key, { setNesA = false, setPrayerBomb = false } = {}) {
    const normalized = normalizeKey(key);
    if (!keysDown.has(normalized)) keysJustPressed.add(normalized);
    keysDown.add(normalized);
    gamepadState.virtualKeysDown.add(normalized);
    if (setNesA) nesAButtonActive = true;
    noteActionKeyPressed(key);
  }

  function releaseGamepadKey(key, { setNesA = false, setPrayerBomb = false } = {}) {
    const normalized = normalizeKey(key);
    keysDown.delete(normalized);
    gamepadState.virtualKeysDown.delete(normalized);
    if (setNesA) nesAButtonActive = false;
    if (setPrayerBomb) handleCButtonReleased();
  }

  function resetGamepadState() {
    gamepadState.connected = false;
    gamepadState.index = -1;
    gamepadState.id = "";
    gamepadState.movement.x = 0;
    gamepadState.movement.y = 0;
    gamepadState.movement.active = false;
    gamepadState.aim.x = 0;
    gamepadState.aim.y = 0;
    gamepadState.aim.active = false;
    if (gamepadState.virtualKeysDown.size) {
      gamepadState.virtualKeysDown.forEach((key) => {
        keysDown.delete(key);
      });
      gamepadState.virtualKeysDown.clear();
    }
    gamepadState.buttonBindings.clear();
  }

  function getButtonPressed(gamepad, index) {
    const button = gamepad?.buttons?.[index];
    if (!button) return false;
    if (typeof button === "number") return button > 0.5;
    return Boolean(button.pressed || button.value > 0.5);
  }

  function shouldUseGamepadSouthButtonAsConfirm() {
    if (typeof window === "undefined") return false;
    if (window.UpgradeScreen?.isVisible?.()) return true;
    if (window.DialogOverlay?.isVisible?.()) return true;
    if (window.__battlechurchMapScreenActive) return true;
    if (window.__battlechurchTitleScreenActive) return true;
    if (window.PlayingInstructions?.state?.open) return true;
    if (window.__battlechurchPauseMenuActive) return true;
    if (window.__missionBriefActive) return true;
    if (window.__tutorialArenaMenuActive) return true;
    const announcementKey = String(window.__announcementButtons?.key || "").toLowerCase();
    const menuAnnouncementKeys = new Set([
      "title",
      "pause",
      "missionbrief",
      "chapterbreak",
      "visitorintro",
      "recap",
      "pastorfinal",
      "pastorpostrecap",
      "denomupgradescreen",
    ]);
    return menuAnnouncementKeys.has(announcementKey);
  }

  function shouldUseGamepadEastButtonAsBack() {
    if (typeof window === "undefined") return false;
    if (window.DialogOverlay?.isVisible?.()) return true;
    if (window.__battlechurchMapScreenActive) return true;
    if (window.__battlechurchTitleScreenActive) return true;
    if (window.PlayingInstructions?.state?.open) return true;
    if (window.__battlechurchPauseMenuActive) return true;
    if (window.__missionBriefActive) return true;
    if (window.__tutorialArenaMenuActive) return true;
    const announcementKey = String(window.__announcementButtons?.key || "").toLowerCase();
    const backAnnouncementKeys = new Set([
      "title",
      "pause",
      "missionbrief",
      "chapterbreak",
      "visitorintro",
      "recap",
      "pastorfinal",
      "pastorpostrecap",
      "denomupgradescreen",
    ]);
    return backAnnouncementKeys.has(announcementKey);
  }

  function pollGamepad() {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
      resetGamepadState();
      return;
    }

    const pads = navigator.getGamepads();
    const gamepad = Array.from(pads || []).find((pad) => pad && pad.connected);
    if (!gamepad) {
      resetGamepadState();
      return;
    }

    gamepadState.connected = true;
    gamepadState.index = gamepad.index;
    gamepadState.id = String(gamepad.id || "");

    const leftX = Number(gamepad.axes?.[0]) || 0;
    const leftY = Number(gamepad.axes?.[1]) || 0;
    const rightX = Number(gamepad.axes?.[2]) || 0;
    const rightY = Number(gamepad.axes?.[3]) || 0;
    const dpadLeft = getButtonPressed(gamepad, 14);
    const dpadRight = getButtonPressed(gamepad, 15);
    const dpadUp = getButtonPressed(gamepad, 12);
    const dpadDown = getButtonPressed(gamepad, 13);

    let moveX = Math.abs(leftX) >= GAMEPAD_LEFT_STICK_DEADZONE ? leftX : 0;
    let moveY = Math.abs(leftY) >= GAMEPAD_LEFT_STICK_DEADZONE ? leftY : 0;
    if (dpadLeft) moveX = -1;
    else if (dpadRight) moveX = 1;
    if (dpadUp) moveY = -1;
    else if (dpadDown) moveY = 1;
    const movementActive = Math.abs(moveX) >= GAMEPAD_DPAD_THRESHOLD || Math.abs(moveY) >= GAMEPAD_DPAD_THRESHOLD;
    gamepadState.movement.x = movementActive ? moveX : 0;
    gamepadState.movement.y = movementActive ? moveY : 0;
    gamepadState.movement.active = movementActive;
    if (movementActive) {
      movementDirection.x = moveX;
      movementDirection.y = moveY;
      lastMovementDirection.x = moveX;
      lastMovementDirection.y = moveY;
    } else if (!virtualInput.movement.active && !["w", "a", "s", "d"].some((key) => keysDown.has(key))) {
      movementDirection.x = 0;
      movementDirection.y = 0;
    }

    const aimMagnitude = Math.hypot(rightX, rightY);
    const aimActive = aimMagnitude >= GAMEPAD_RIGHT_STICK_DEADZONE;
    if (aimActive) {
      const normalizedAim = normalizeVector(rightX, rightY);
      gamepadState.aim.x = normalizedAim.x;
      gamepadState.aim.y = normalizedAim.y;
      gamepadState.aim.active = true;
      aimState.x = normalizedAim.x;
      aimState.y = normalizedAim.y;
      aimState.usingPointer = false;
      aimState.triggerPress = true;
      pointerState.active = false;
    } else {
      gamepadState.aim.x = 0;
      gamepadState.aim.y = 0;
      gamepadState.aim.active = false;
    }

    const useSouthAsConfirm = shouldUseGamepadSouthButtonAsConfirm();
    const useEastAsBack = shouldUseGamepadEastButtonAsBack();
    const cButtonIndex = 5; // C -> Xbox RB (right shoulder) for easier charge combos.
    const buttonMap = [
      useSouthAsConfirm
        ? { index: 0, key: "enter" }
        : { index: 0, key: "ArrowLeft", setNesA: true },
      useEastAsBack
        ? { index: 1, key: "escape" }
        : { index: 1, key: "ArrowDown" },
      { index: cButtonIndex, key: "ArrowRight", setPrayerBomb: true },
      { index: 9, key: " " },
    ];

    buttonMap.forEach((binding) => {
      const pressed = getButtonPressed(gamepad, binding.index);
      const token = String(binding.index);
      const activeBinding = gamepadState.buttonBindings.get(token);
      if (pressed && !activeBinding) {
        gamepadState.buttonBindings.set(token, binding);
        pressGamepadKey(binding.key, binding);
      } else if (pressed && activeBinding) {
        // Keep the original meaning of a held gamepad button until it is released.
        // This prevents a button used to close a menu from immediately remapping
        // into a different action on the newly revealed screen.
      } else if (!pressed && activeBinding) {
        gamepadState.buttonBindings.delete(token);
        releaseGamepadKey(activeBinding.key, activeBinding);
      }
    });
  }

  function releaseVirtualKey(key, { setNesA = false, setPrayerBomb = false } = {}) {
    const normalized = normalizeKey(key);
    keysDown.delete(normalized);
    virtualInput.virtualKeysDown.delete(normalized);
    if (setNesA) nesAButtonActive = false;
    if (setPrayerBomb) handleCButtonReleased();
  }

  function queueComboSwipe(from, to) {
    comboSwipe = { from, to, time: typeof performance !== "undefined" ? performance.now() : Date.now() };
  }

  function consumeComboSwipe() {
    if (!comboSwipe) return null;
    const swipe = comboSwipe;
    comboSwipe = null;
    return swipe;
  }

  function peekComboSwipe() {
    return comboSwipe;
  }

  // A / B / C touch buttons (three circles in a triangle, see index.html).
  //   Tap            -> tap the button
  //   Hold           -> charge (Blast / Crash / Purify)
  //   Slide X -> Y   -> combo "X then Y" (Smash, Cleave, Reap, Clash)
  //   Hold X until it glows, slide to Y -> "Charge X + Y" (X stays held:
  //                     Thrash, Hedge, Trash; keep going for Prayer Storm)
  // Every finger is tracked separately, so two-thumb play works too.
  const ABC_CHARGE_FALLBACK_MS = { A: 1500, B: 1500, C: 1000 };
  const ABC_HIT_RADIUS_SCALE = 1.3;
  // Pad geometry. It LOOKS like three buttons (index.html), but works like a
  // D-pad with diagonals: these are the single-button zones, and the hidden
  // two-button zones straddle each visible border. Angles are degrees, 0 = right, 90 = down; anything below
  // -130 is shifted by +360 so B and B+C stay continuous.
  const ABC_PAD_CX = 130;
  const ABC_PAD_CY = 130;
  const ABC_PAD_R = 122;
  const ABC_PAD_WEDGES = { C: [-130, -55], A: [-5, 70], B: [110, 190] };
  // "Both" zones between each pair of buttons. C + A is wider (50 degrees vs
  // 40) because that border points away from the thumb and is harder to hit.
  const ABC_PAD_DIAGONALS = {
    AC: { range: [-55, -5], segs: ["A", "C"] },
    AB: { range: [70, 110], segs: ["A", "B"] },
    BC: { range: [190, 230], segs: ["B", "C"] },
  };
  // Within this radius of the center = press all three.
  const ABC_PAD_CENTER_R = 24;
  // What the player sees: three equal slices (used to draw the charge
  // meters along each button's edge). The hidden zones above sit inside them.
  const ABC_PAD_VISIBLE = { C: [-150, -30], A: [-30, 90], B: [90, 210] };
  // On a slide, how long both buttons are held together before the first
  // one is released.
  const ABC_SLIDE_OVERLAP_MS = 30;
  // A touch waits this long before counting as a hold, so a tap or a quick
  // slide can be sent to the game as a clean, fast key sequence.
  const ABC_INTENT_MS = 200;
  // Minimum time a pressed button stays lit (so quick taps are visible).
  const ABC_PRESS_FLASH_MS = 220;
  // Big flash when a held button becomes fully charged.
  const ABC_READY_FLASH_MS = 450;
  // Swipe trail: how long after reaching the second button to check whether
  // it made a combo, and how long the trail takes to fade out.
  const ABC_TRAIL_JUDGE_MS = 350;
  const ABC_TRAIL_FADE_MS = 500;
  // Thumb movement (px) that counts as sliding rather than resting.
  const ABC_SLIDE_MOVE_PX = 3;
  // Fast slide: gap between the first and second button going down.
  const ABC_FAST_SEQUENCE_GAP_MS = 60;
  // Length of a tap.
  const ABC_TAP_MS = 50;

  function configureArcControl(arcEl) {
    if (!arcEl) return;
    const circleEls = Array.from(arcEl.querySelectorAll(".arc-segment[data-seg]"));
    if (!circleEls.length) return;
    const labelEls = Array.from(arcEl.querySelectorAll(".arc-label[data-seg]"));
    const diagEls = Array.from(arcEl.querySelectorAll(".abc-diag[data-combo]"));
    const junctionEl = arcEl.querySelector(".arc-junction");
    // Charge ring around each button + its small caption (SWORD / DASH /
    // PRAY), which switches to CHARGING / READY while held.
    const SVG_NS = "http://www.w3.org/2000/svg";
    const rings = {};
    const halos = {};
    // Taps are only pressed for a split second; keep the flash on at least
    // this long so it's visible.
    const flashUntil = { A: 0, B: 0, C: 0 };
    const wasReady = { A: false, B: false, C: false };
    const subLabels = {};
    // Arc along a button's outer edge. Normally it fills clockwise; with
    // reverse it starts at the other end and fills counter-clockwise.
    const rimArcPath = (seg, radius, reverse = false) => {
      const [a0, a1] = ABC_PAD_VISIBLE[seg];
      const pad = 5; // degrees of breathing room at each end
      const p = (deg) => {
        const t = (deg * Math.PI) / 180;
        return `${(ABC_PAD_CX + radius * Math.cos(t)).toFixed(2)} ${(ABC_PAD_CY + radius * Math.sin(t)).toFixed(2)}`;
      };
      return reverse
        ? `M ${p(a1 - pad)} A ${radius} ${radius} 0 0 0 ${p(a0 + pad)}`
        : `M ${p(a0 + pad)} A ${radius} ${radius} 0 0 1 ${p(a1 - pad)}`;
    };
    // Two buttons pressed together: each meter starts at the shared border
    // (under the thumb) and fills outward, one clockwise, one counter. A
    // button whose END (clockwise) is the shared border fills in reverse.
    const sameAngle = (a, b) => (((a - b) % 360) + 360) % 360 === 0;
    const fillsFromEnd = (seg, other) => sameAngle(ABC_PAD_VISIBLE[seg][1], ABC_PAD_VISIBLE[other][0]);
    const setRingDirection = (seg, reverse) => {
      const ring = rings[seg];
      if (!ring || ring.__reverse === reverse) return;
      ring.__reverse = reverse;
      ring.setAttribute("d", rimArcPath(seg, ABC_PAD_R + 9, reverse));
    };
    const makeRimArc = (seg, className) => {
      const arc = document.createElementNS(SVG_NS, "path");
      arc.setAttribute("d", rimArcPath(seg, ABC_PAD_R + 9));
      arc.setAttribute("pathLength", "100");
      arc.setAttribute("class", className);
      arc.setAttribute("data-seg", seg);
      arc.style.strokeDasharray = "100";
      arc.style.strokeDashoffset = "100";
      arc.__circumference = 100;
      return arc;
    };
    circleEls.forEach((el) => {
      const seg = el.dataset.seg;
      // Charge meter: fills along the wedge's outer edge while held.
      const ring = makeRimArc(seg, "abc-charge-ring");
      el.parentNode.insertBefore(ring, el);
      rings[seg] = ring;
      // Recharge meter (cooldowns, e.g. B after a Dash); driven by game.js.
      const cooldownRing = makeRimArc(seg, "abc-cooldown-ring");
      el.parentNode.insertBefore(cooldownRing, ring);
      // Press glow: lights up the button's outer edge (which the thumb
      // doesn't cover) while it's pressed, so presses are obvious.
      const halo = document.createElementNS(SVG_NS, "path");
      halo.setAttribute("d", rimArcPath(seg, ABC_PAD_R + 4));
      halo.setAttribute("class", "abc-press-halo");
      halo.setAttribute("data-seg", seg);
      el.parentNode.insertBefore(halo, cooldownRing);
      halos[seg] = halo;
      const sub = arcEl.querySelector(`.abc-sub[data-seg="${seg}"]`);
      if (sub) {
        subLabels[seg] = { el: sub, text: sub.textContent };
        sub.setAttribute("data-label", sub.textContent);
      }
    });
    const segmentMap = {
      A: { key: "ArrowLeft", setNesA: true },
      B: { key: "ArrowDown" },
      C: { key: "ArrowRight", setPrayerBomb: true },
    };
    const pointers = new Map(); // pointerId -> { seg, held: Set, pressedAt: {} }

    // Swipe trail: a short comet line along the thumb's path, shown only for
    // slides. It runs from the first button's colour to the second's, then
    // turns gold if the slide made a combo (Smash, Cleave, Reap, Clash) or
    // grey if it didn't, and fades out.
    const SWIPE_COMBO_MOVES = new Set(["Smash", "Cleave", "Reap", "Clash"]);
    const SEG_TRAIL_COLORS = { A: "#7FCBFF", B: "#BFE6FF", C: "#FF6B6B" };
    let trailDefs = arcEl.querySelector("defs");
    if (!trailDefs) {
      trailDefs = document.createElementNS(SVG_NS, "defs");
      arcEl.insertBefore(trailDefs, arcEl.firstChild);
    }
    const trailLayer = document.createElementNS(SVG_NS, "g");
    trailLayer.setAttribute("class", "abc-trail-layer");
    arcEl.appendChild(trailLayer);
    let trailSerial = 0;

    const toPadXY = (clientX, clientY) => {
      const ctm = arcEl.getScreenCTM && arcEl.getScreenCTM();
      if (!ctm) return null;
      const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { x: pt.x, y: pt.y };
    };
    const startTrail = (state, clientX, clientY) => {
      const p = toPadXY(clientX, clientY);
      state.trail = { points: p ? [p] : [], el: null, grad: null, judged: false, slideAt: 0, judgeTimer: null };
    };
    const renderTrail = (trail) => {
      if (!trail.el || !trail.points.length) return;
      trail.el.setAttribute("points", trail.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
      const a = trail.points[0];
      const b = trail.points[trail.points.length - 1];
      trail.grad.setAttribute("x1", a.x.toFixed(1));
      trail.grad.setAttribute("y1", a.y.toFixed(1));
      trail.grad.setAttribute("x2", b.x.toFixed(1));
      trail.grad.setAttribute("y2", b.y.toFixed(1));
    };
    const addTrailPoint = (state, clientX, clientY) => {
      const trail = state.trail;
      if (!trail) return;
      const p = toPadXY(clientX, clientY);
      if (!p) return;
      const last = trail.points[trail.points.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 3) return;
      trail.points.push(p);
      if (trail.points.length > 80) trail.points.shift();
      renderTrail(trail);
    };
    // The thumb reached another button: show the trail (first time) and
    // check shortly after whether the game made a combo out of it.
    const showTrail = (state, fromSeg, toSeg) => {
      const trail = state.trail;
      if (!trail) return;
      if (!trail.el) {
        const id = `abcTrailGrad${(trailSerial += 1)}`;
        const grad = document.createElementNS(SVG_NS, "linearGradient");
        grad.setAttribute("id", id);
        grad.setAttribute("gradientUnits", "userSpaceOnUse");
        const s0 = document.createElementNS(SVG_NS, "stop");
        s0.setAttribute("offset", "0");
        s0.setAttribute("stop-color", SEG_TRAIL_COLORS[fromSeg] || "#ffffff");
        const s1 = document.createElementNS(SVG_NS, "stop");
        s1.setAttribute("offset", "1");
        grad.appendChild(s0);
        grad.appendChild(s1);
        trailDefs.appendChild(grad);
        const line = document.createElementNS(SVG_NS, "polyline");
        line.setAttribute("class", "abc-trail");
        line.setAttribute("stroke", `url(#${id})`);
        trailLayer.appendChild(line);
        trail.el = line;
        trail.grad = grad;
      }
      trail.grad.lastChild.setAttribute("stop-color", SEG_TRAIL_COLORS[toSeg] || "#ffffff");
      trail.slideAt = nowMs();
      trail.judged = false;
      trail.el.classList.remove("is-combo", "is-miss");
      clearTimeout(trail.judgeTimer);
      trail.judgeTimer = setTimeout(() => judgeTrail(trail), ABC_TRAIL_JUDGE_MS);
      renderTrail(trail);
    };
    const judgeTrail = (trail) => {
      if (!trail.el || trail.judged) return;
      trail.judged = true;
      const banner = typeof window !== "undefined" ? window.__moveAnnouncementBanner : null;
      const combo = Boolean(
        banner && banner.shownAt >= trail.slideAt - 60 && SWIPE_COMBO_MOVES.has(banner.moveName),
      );
      trail.el.classList.add(combo ? "is-combo" : "is-miss");
    };
    const finishTrail = (trail) => {
      if (!trail) return;
      if (!trail.el) return; // never left the first button: no trail
      const fade = () => {
        judgeTrail(trail);
        trail.el.classList.add("is-fading");
        setTimeout(() => {
          trail.el.remove();
          if (trail.grad) trail.grad.remove();
        }, ABC_TRAIL_FADE_MS + 50);
      };
      const wait = Math.max(0, trail.slideAt + ABC_TRAIL_JUDGE_MS - nowMs());
      clearTimeout(trail.judgeTimer);
      setTimeout(fade, wait);
    };
    const holdCounts = { A: 0, B: 0, C: 0 };
    let rafId = null;

    const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

    const isCharged = (seg, pressedAt) => {
      const ready = typeof window !== "undefined" ? window.__battlechurchChargeReady : null;
      if (ready && nowMs() - (Number(ready.at) || 0) < 250) return Boolean(ready[seg]);
      return Number.isFinite(pressedAt) && nowMs() - pressedAt >= (ABC_CHARGE_FALLBACK_MS[seg] || 1500);
    };

    const chargeProgress = (seg, pressedAt) => {
      const ready = typeof window !== "undefined" ? window.__battlechurchChargeReady : null;
      if (ready && ready.progress && nowMs() - (Number(ready.at) || 0) < 250) {
        return Number(ready.progress[seg]) || 0;
      }
      if (!Number.isFinite(pressedAt)) return 0;
      return Math.min(1, (nowMs() - pressedAt) / (ABC_CHARGE_FALLBACK_MS[seg] || 1500));
    };

    // Bright pop on every press (taps included); refresh again when it ends.
    const flashSeg = (seg) => {
      flashUntil[seg] = nowMs() + ABC_PRESS_FLASH_MS;
      const el = circleEls.find((c) => c.dataset.seg === seg);
      if (el) {
        el.classList.remove("is-pop");
        void el.getBBox(); // restart the pop animation
        el.classList.add("is-pop");
      }
      setTimeout(() => refresh(), ABC_PRESS_FLASH_MS + 10);
    };

    const refresh = () => {
      const charged = { A: false, B: false, C: false };
      const progress = { A: 0, B: 0, C: 0 };
      pointers.forEach((state) => {
        state.held.forEach((seg) => {
          if (isCharged(seg, state.pressedAt[seg])) charged[seg] = true;
          progress[seg] = Math.max(progress[seg], chargeProgress(seg, state.pressedAt[seg]));
        });
      });
      // Ring fill direction: outward from the thumb for two-button presses.
      const reverseSegs = new Set();
      pointers.forEach((state) => {
        if (!state.both || state.held.size !== 2) return;
        const [x, y] = Array.from(state.held);
        if (fillsFromEnd(x, y)) reverseSegs.add(x);
        if (fillsFromEnd(y, x)) reverseSegs.add(y);
      });
      Object.keys(rings).forEach((seg) => {
        if (holdCounts[seg] > 0) setRingDirection(seg, reverseSegs.has(seg));
      });
      Object.keys(rings).forEach((seg) => {
        const ring = rings[seg];
        const held = holdCounts[seg] > 0;
        const p = held ? (charged[seg] ? 1 : progress[seg]) : 0;
        ring.style.strokeDashoffset = String(ring.__circumference * (1 - p));
        ring.classList.toggle("is-visible", held && p > 0.02);
        ring.classList.toggle("is-full", held && charged[seg]);
        const sub = subLabels[seg];
        if (sub) {
          const text = !held || p <= 0.02 ? sub.text : charged[seg] ? "READY!" : "CHARGING";
          if (sub.el.textContent !== text) sub.el.textContent = text;
          sub.el.classList.toggle("is-ready", held && charged[seg]);
        }
      });
      const touched = { A: false, B: false, C: false };
      pointers.forEach((state) => {
        if (state.pending) touched[state.pending] = true;
      });
      const flashNow = nowMs();
      circleEls.forEach((el) => {
        const seg = el.dataset.seg;
        const held = holdCounts[seg] > 0;
        const lit = held || touched[seg] || flashUntil[seg] > flashNow;
        const isReady = held && charged[seg];
        el.classList.toggle("is-active", lit);
        el.classList.toggle("is-charged", isReady);
        if (halos[seg]) halos[seg].classList.toggle("is-on", lit);
        // Brighter the longer it's held: brightness and glow follow the charge.
        if (held && !isReady && progress[seg] > 0.02) {
          const p = Math.min(1, progress[seg]);
          el.style.filter =
            `brightness(${(1.45 + 0.5 * p).toFixed(3)}) saturate(1.15) ` +
            `drop-shadow(0 0 ${(16 + 14 * p).toFixed(1)}px rgba(255, 255, 255, ${(0.85 + 0.15 * p).toFixed(2)}))`;
          if (halos[seg]) halos[seg].style.strokeWidth = `${(18 + 10 * p).toFixed(1)}px`;
        } else {
          el.style.filter = "";
          if (halos[seg]) halos[seg].style.strokeWidth = "";
        }
        // Flash once the moment it becomes fully charged.
        if (isReady && !wasReady[seg]) {
          el.classList.remove("is-ready-flash");
          void el.getBBox(); // restart the animation
          el.classList.add("is-ready-flash");
          if (halos[seg]) {
            halos[seg].classList.remove("is-ready-flash");
            void halos[seg].getBBox();
            halos[seg].classList.add("is-ready-flash");
          }
          setTimeout(() => {
            el.classList.remove("is-ready-flash");
            if (halos[seg]) halos[seg].classList.remove("is-ready-flash");
          }, ABC_READY_FLASH_MS);
        }
        wasReady[seg] = isReady;
      });
      labelEls.forEach((el) => {
        el.classList.toggle("is-active", holdCounts[el.dataset.seg] > 0);
      });
      const activeCombos = new Set();
      pointers.forEach((state) => {
        if (state.both) activeCombos.add(Array.from(state.held).sort().join(""));
      });
      diagEls.forEach((el) => el.classList.toggle("is-active", activeCombos.has(el.dataset.combo)));
      if (junctionEl) junctionEl.classList.toggle("is-active", activeCombos.has("ABC"));
    };

    // While any finger is down, keep the "charged" glow in sync with the game.
    const tick = () => {
      refresh();
      rafId = pointers.size && typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(tick)
        : null;
    };
    const ensureTicking = () => {
      if (rafId === null && typeof requestAnimationFrame === "function") {
        rafId = requestAnimationFrame(tick);
      }
    };

    const pressSeg = (seg) => {
      const cfg = segmentMap[seg];
      if (!cfg) return;
      flashSeg(seg);
      holdCounts[seg] += 1;
      if (holdCounts[seg] > 1) return;
      const upgradeSelect =
        seg === "A" && typeof window !== "undefined" && window.UpgradeScreen?.isVisible?.();
      if (upgradeSelect && typeof window.UpgradeScreen?.selectFocused === "function") {
        window.UpgradeScreen.selectFocused();
        return;
      }
      pressVirtualKey(cfg.key, cfg);
    };

    const releaseSeg = (seg) => {
      const cfg = segmentMap[seg];
      if (!cfg || holdCounts[seg] <= 0) return;
      holdCounts[seg] -= 1;
      if (holdCounts[seg] === 0) releaseVirtualKey(cfg.key, cfg);
    };

    // Where on the pad a screen point is, in pad (SVG) units.
    const toPad = (clientX, clientY) => {
      const ctm = arcEl.getScreenCTM && arcEl.getScreenCTM();
      if (!ctm) return null;
      const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      const dx = pt.x - ABC_PAD_CX;
      const dy = pt.y - ABC_PAD_CY;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = right, 90 = down
      if (deg < -130) deg += 360; // keep B (110..190) and B+C (190..230) continuous
      return { r: Math.hypot(dx, dy), deg };
    };
    const inRange = (deg, [lo, hi]) => deg >= lo && deg < hi;
    // Main button (A/B/C) at this angle, or null on a diagonal slice.
    const wedgeForAngle = (deg) => {
      for (const seg of Object.keys(ABC_PAD_WEDGES)) {
        if (inRange(deg, ABC_PAD_WEDGES[seg])) return seg;
      }
      return null;
    };
    // Diagonal ("both") slice at this angle, or null.
    const diagonalForAngle = (deg) => {
      for (const key of Object.keys(ABC_PAD_DIAGONALS)) {
        if (inRange(deg, ABC_PAD_DIAGONALS[key].range)) return key;
      }
      return null;
    };

    // The main button under a point. Off the pad, on the center dot or on a
    // diagonal slice this is null: during a slide (B -> A passes through
    // A+B) those count as "on the way", so the slide still makes a combo.
    const getSegmentAt = (clientX, clientY) => {
      const pad = toPad(clientX, clientY);
      if (!pad || pad.r > ABC_PAD_R * ABC_HIT_RADIUS_SCALE) return null;
      if (pad.r <= ABC_PAD_CENTER_R) return null;
      return wedgeForAngle(pad.deg);
    };

    const pressHeld = (state, seg) => {
      state.held.add(seg);
      state.pressedAt[seg] = nowMs();
      pressSeg(seg);
    };

    // Quick press + release (a tap) that the game sees for a few frames.
    const tapSeg = (seg) => {
      pressSeg(seg);
      refresh();
      setTimeout(() => {
        releaseSeg(seg);
        refresh();
      }, ABC_TAP_MS);
    };

    const queueSwipeIfUsed = (prev, seg) => {
      // Only C -> B (Clash) needs the "swipe" signal. B -> A (Smash) comes out
      // from the key timing alone; sending a swipe there made the game also
      // treat the A press as an extra Slash.
      if (prev === "C" && seg === "B") {
        queueComboSwipe(prev, seg);
      }
    };

    // "X then Y" as the game likes it: Y goes down while X is still down,
    // then X is released a moment later.
    const overlapInto = (state, prev, seg) => {
      pressHeld(state, seg);
      refresh();
      if (!state.held.has(prev)) return;
      setTimeout(() => {
        if (state.ended || !state.held.has(prev) || state.seg === prev) return;
        state.held.delete(prev);
        releaseSeg(prev);
        refresh();
      }, ABC_SLIDE_OVERLAP_MS);
    };

    // Finger has rested on the button: it's a hold, press it for real.
    const commitPending = (state) => {
      if (!state.pending || state.ended) return;
      const seg = state.pending;
      state.pending = null;
      clearTimeout(state.pendingTimer);
      pressHeld(state, seg);
      refresh();
    };

    // Where the thumb first lands: a diagonal slice presses BOTH of its
    // buttons, the center presses all three. Returns the buttons, or null
    // for a single main button.
    const getSeamPairAt = (clientX, clientY) => {
      const pad = toPad(clientX, clientY);
      if (!pad || pad.r > ABC_PAD_R * ABC_HIT_RADIUS_SCALE) return null;
      if (pad.r <= ABC_PAD_CENTER_R) return ["A", "B", "C"];
      const diag = diagonalForAngle(pad.deg);
      return diag ? ABC_PAD_DIAGONALS[diag].segs.slice() : null;
    };

    // For tests/debugging: a screen point for "A", "A+B", "ABC", etc.
    arcEl.__abcPoint = (name) => {
      const ctm = arcEl.getScreenCTM && arcEl.getScreenCTM();
      if (!ctm) return null;
      let deg = 0;
      let r = ABC_PAD_R * 0.6;
      if (name === "ABC") {
        r = 0;
      } else if (name.includes("+")) {
        const key = name.split("+").sort().join("");
        const diag = ABC_PAD_DIAGONALS[key];
        deg = diag ? (diag.range[0] + diag.range[1]) / 2 : 0;
        r = ABC_PAD_R * 0.62;
      } else {
        const [a0, a1] = ABC_PAD_WEDGES[name];
        deg = (a0 + a1) / 2;
      }
      const t = (deg * Math.PI) / 180;
      const pt = new DOMPoint(ABC_PAD_CX + r * Math.cos(t), ABC_PAD_CY + r * Math.sin(t)).matrixTransform(ctm);
      return { x: pt.x, y: pt.y };
    };

    const start = (event) => {
      if (!virtualInput.enabled) return;
      const onJunction = Boolean(event.target?.classList?.contains("arc-junction"));
      const seam = onJunction ? ["A", "B", "C"] : getSeamPairAt(event.clientX, event.clientY);
      const seg = seam ? seam[0] : getSegmentAt(event.clientX, event.clientY);
      if (!seg) return;
      try {
        arcEl.setPointerCapture(event.pointerId);
      } catch (e) {}
      if (seam) {
        // Both buttons go down together and stay held (charge both).
        const both = { seg: seam[0], held: new Set(), pressedAt: {}, pending: null, ended: false, both: true };
        pointers.set(event.pointerId, both);
        seam.forEach((s) => pressHeld(both, s));
        refresh();
        ensureTicking();
        event.preventDefault();
        return;
      }
      // Don't tell the game yet: wait briefly to see if this is a tap, a
      // hold or the start of a slide combo.
      const state = {
        seg,
        held: new Set(),
        pressedAt: {},
        pending: seg,
        ended: false,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      state.pendingTimer = setTimeout(() => commitPending(state), ABC_INTENT_MS);
      startTrail(state, event.clientX, event.clientY);
      pointers.set(event.pointerId, state);
      refresh();
      ensureTicking();
      event.preventDefault();
    };

    const move = (event) => {
      const state = pointers.get(event.pointerId);
      if (!state) return;
      event.preventDefault();
      if (state.both) return; // two-button press: stay on both until lifted
      addTrailPoint(state, event.clientX, event.clientY);
      // A moving thumb is sliding, not holding: only count the hold time while
      // the thumb rests still, so a slower slide (e.g. A -> C through the A+C
      // slice) still comes out as a combo instead of "A, then C".
      if (state.pending) {
        const moved = Math.hypot(event.clientX - state.lastX, event.clientY - state.lastY);
        if (moved >= ABC_SLIDE_MOVE_PX) {
          state.lastX = event.clientX;
          state.lastY = event.clientY;
          clearTimeout(state.pendingTimer);
          state.pendingTimer = setTimeout(() => commitPending(state), ABC_INTENT_MS);
        }
      }
      const seg = getSegmentAt(event.clientX, event.clientY);
      // Off the buttons: keep holding whatever we're on (sticky).
      if (!seg || seg === state.seg) return;
      const prev = state.seg;
      state.seg = seg;
      showTrail(state, prev, seg);

      // A -> C and B -> C aren't moves in the game (only C -> A Reap and
      // C -> B Clash are). Sliding onto C from A or B just does the A / B
      // move; landing on C does NOT also press C (no stray Unity Strike).
      // Charged A/B sliding onto C still makes Hedge / Trash (below).
      const toCFromAB = seg === "C" && (prev === "A" || prev === "B");
      if (toCFromAB && state.pending) {
        state.pending = null;
        clearTimeout(state.pendingTimer);
        state.cSuppressed = true;
        tapSeg(prev);
        return;
      }
      if (toCFromAB && !(state.held.has(prev) && isCharged(prev, state.pressedAt[prev]))) {
        state.cSuppressed = true;
        if (state.held.has(prev)) {
          state.held.delete(prev);
          releaseSeg(prev);
          refresh();
        }
        return;
      }
      if (state.cSuppressed && prev === "C") {
        // Slid on from the "dead" C: start fresh on the new button.
        state.cSuppressed = false;
        state.pending = seg;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        clearTimeout(state.pendingTimer);
        state.pendingTimer = setTimeout(() => commitPending(state), ABC_INTENT_MS);
        return;
      }

      if (state.pending) {
        // Quick slide straight off the first button: a sequence combo.
        // Send "X down, Y down shortly after, X up" in one tight burst.
        state.pending = null;
        clearTimeout(state.pendingTimer);
        pressHeld(state, prev);
        queueSwipeIfUsed(prev, seg);
        refresh();
        setTimeout(() => {
          if (state.ended) {
            tapSeg(seg);
            return;
          }
          if (state.seg !== seg) return; // already moved on
          overlapInto(state, prev, seg);
        }, ABC_FAST_SEQUENCE_GAP_MS);
        return;
      }

      if (state.held.has(seg)) return; // slid back onto a button we're still holding
      const prevCharged = state.held.has(prev) && isCharged(prev, state.pressedAt[prev]);
      if (prevCharged) {
        // "Charge X + Y": keep X held and hold Y too (hold Y until it glows
        // for Thrash / Hedge; keep sliding for Prayer Storm).
        pressHeld(state, seg);
        refresh();
        return;
      }
      // Only quick (uncharged) slides are sequence combos like Smash/Clash.
      queueSwipeIfUsed(prev, seg);
      overlapInto(state, prev, seg);
    };

    const end = (event) => {
      const state = pointers.get(event.pointerId);
      if (!state) return;
      pointers.delete(event.pointerId);
      state.ended = true;
      finishTrail(state.trail);
      try {
        arcEl.releasePointerCapture(event.pointerId);
      } catch (e) {}
      if (state.pending) {
        // Lifted before the hold kicked in: a tap.
        const seg = state.pending;
        state.pending = null;
        clearTimeout(state.pendingTimer);
        tapSeg(seg);
      }
      // Release order matters for charge moves that use C: Trash and Hedge
      // fire when B / A is let go while C is still held, so let C go a moment
      // later. (Prayer Storm, with all three held, works in any order.)
      const heldNow = Array.from(state.held);
      state.held.clear();
      const cLast = heldNow.includes("C") && heldNow.length === 2;
      heldNow.filter((seg) => !(cLast && seg === "C")).forEach((seg) => releaseSeg(seg));
      if (cLast) {
        setTimeout(() => {
          releaseSeg("C");
          refresh();
        }, ABC_SLIDE_OVERLAP_MS * 2);
      }
      refresh();
      event.preventDefault();
    };

    arcEl.addEventListener("pointerdown", start);
    arcEl.addEventListener("pointermove", move);
    arcEl.addEventListener("pointerup", end);
    arcEl.addEventListener("pointercancel", end);
    arcEl.addEventListener("lostpointercapture", end);

    // Used when touch controls are hidden/reset.
    arcEl.__resetAbcButtons = () => {
      pointers.clear();
      while (trailLayer.firstChild) trailLayer.removeChild(trailLayer.firstChild);
      holdCounts.A = 0;
      holdCounts.B = 0;
      holdCounts.C = 0;
      refresh();
    };
  }

  // Stop Android/Chrome long-press behavior (text selection, "Search Google",
  // context menu) on the touch controls. When the browser takes over a held
  // touch it cancels it, which would release the button mid-hold.
  function blockLongPressBehavior(root) {
    if (!root || root.__longPressBlocked) return;
    root.__longPressBlocked = true;
    const isGameControl = (target) =>
      Boolean(target && target.closest && target.closest("#arcControl, .joystick-area"));
    root.addEventListener("contextmenu", (event) => event.preventDefault());
    root.addEventListener("selectstart", (event) => event.preventDefault());
    root.addEventListener(
      "touchstart",
      (event) => {
        if (isGameControl(event.target)) event.preventDefault();
      },
      { passive: false },
    );
    root.addEventListener(
      "touchmove",
      (event) => {
        if (isGameControl(event.target)) event.preventDefault();
      },
      { passive: false },
    );
  }

  function ensureVirtualControlsConfigured() {
    if (virtualInput.configured) return;
    blockLongPressBehavior(touchControlsRoot);
    if (moveStickBase) {
      configureVirtualJoystick(moveStickBase, "movement");
    }
    if (aimStickBase) {
      configureVirtualJoystick(aimStickBase, "aim");
    }
    if (virtualSpaceButton) {
      virtualSpaceButton.addEventListener("click", () => {
        triggerVirtualKeyPress(" ");
      });
    }
    if (arcControl) {
      configureArcControl(arcControl);
    }
    virtualInput.configured = true;
  }

  function resetVirtualControlsState() {
    const moveHandle = moveStickBase?.querySelector(".joystick-handle");
    const aimHandle = aimStickBase?.querySelector(".joystick-handle");
    if (moveHandle) resetVirtualJoystick(moveHandle, virtualInput.movement);
    if (aimHandle) resetVirtualJoystick(aimHandle, virtualInput.aim);
    if (moveStickBase) moveStickBase.classList.remove("is-active");
    virtualInput.movement.active = false;
    virtualInput.aim.active = false;
    virtualInput.movement.pointerId = null;
    virtualInput.aim.pointerId = null;
    virtualInput.movement.x = 0;
    virtualInput.movement.y = 0;
    virtualInput.aim.x = 0;
    virtualInput.aim.y = 0;
    const hasKeyboardMovement = ["w", "a", "s", "d"].some((key) => keysDown.has(key));
    if (!hasKeyboardMovement) {
      movementDirection.x = 0;
      movementDirection.y = 0;
    }
    if (virtualInput.virtualKeysDown.size) {
      virtualInput.virtualKeysDown.forEach((key) => {
        keysDown.delete(key);
      });
      virtualInput.virtualKeysDown.clear();
    }
    nesAButtonActive = false;
    if (arcControl && typeof arcControl.__resetAbcButtons === "function") {
      arcControl.__resetAbcButtons();
    }
  }

  function setVirtualControlsVisible(visible) {
    if (!touchControlsRoot) return;
    if (visible) {
      if (virtualInput.enabled) {
        updateTouchLayout();
        return;
      }
      ensureVirtualControlsConfigured();
      virtualInput.enabled = true;
      touchControlsRoot.setAttribute("aria-hidden", "false");
      updateTouchLayout();
      return;
    }
    if (!virtualInput.enabled) {
      updateTouchLayout();
      return;
    }
    virtualInput.enabled = false;
    touchControlsRoot.setAttribute("aria-hidden", "true");
    resetVirtualControlsState();
    updateTouchLayout();
  }

  function toggleVirtualControls() {
    setVirtualControlsVisible(!virtualInput.enabled);
  }

  function initializeVirtualControls() {
    if (virtualInput.enabled) return;
    if (!touchControlsRoot) return;
    const shouldEnable = FORCE_TOUCH_CONTROLS || isTouchCapable;
    if (!shouldEnable) {
      touchControlsRoot.setAttribute("aria-hidden", "true");
      updateTouchLayout();
      return;
    }
    setVirtualControlsVisible(true);
  }

  function updateTouchLayout() {
    if (!document || !document.body) return;
    if (!virtualInput.enabled) {
      document.body.classList.remove("touch-enabled");
      document.body.classList.remove("touch-mobile");
      document.body.classList.remove("touch-tablet");
      return;
    }
    document.body.classList.add("touch-enabled");
    const viewportWidth = window.innerWidth;
    const isMobileLayout = viewportWidth <= 720;
    document.body.classList.toggle("touch-mobile", isMobileLayout);
    document.body.classList.toggle("touch-tablet", !isMobileLayout);
  }

  function isActionActive(action) {
    const bindings = ACTION_MAP[action] || [];
    if (bindings.some((key) => keysDown.has(key))) return true;
    const gamepadThreshold = GAMEPAD_DPAD_THRESHOLD;
    switch (action) {
      case "up":
        if (gamepadState.movement.active && gamepadState.movement.y < -gamepadThreshold) return true;
        break;
      case "down":
        if (gamepadState.movement.active && gamepadState.movement.y > gamepadThreshold) return true;
        break;
      case "left":
        if (gamepadState.movement.active && gamepadState.movement.x < -gamepadThreshold) return true;
        break;
      case "right":
        if (gamepadState.movement.active && gamepadState.movement.x > gamepadThreshold) return true;
        break;
      default:
        break;
    }
    if (!virtualInput.enabled) return false;
    const threshold = Math.max(virtualInput.deadZone, 0.25);
    switch (action) {
      case "up":
        return virtualInput.movement.active && virtualInput.movement.y < -threshold;
      case "down":
        return virtualInput.movement.active && virtualInput.movement.y > threshold;
      case "left":
        return virtualInput.movement.active && virtualInput.movement.x < -threshold;
      case "right":
        return virtualInput.movement.active && virtualInput.movement.x > threshold;
      default:
        return false;
    }
  }

  function wasActionJustPressed(action) {
    const bindings = ACTION_MAP[action] || [];
    return bindings.some((key) => keysJustPressed.has(key));
  }

  function triggerVirtualKeyPress(key) {
    const normalized = normalizeKey(key);
    keysJustPressed.add(normalized);
    keysDown.add(normalized);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        keysDown.delete(normalized);
      });
    } else {
      keysDown.delete(normalized);
    }
  }

  function consumePrayerBombClick() {
    if (!prayerBombClickQueued) return false;
    prayerBombClickQueued = false;
    return true;
  }

  function cancelCongregationTap() {
    congregationClickQueued = false;
    congregationTapCount = 0;
    congregationTapStartedAt = 0;
    congregationClickKind = "volley";
  }

  function consumeCongregationClick() {
    if (!congregationClickQueued && congregationTapCount === 1 && congregationTapStartedAt > 0) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - congregationTapStartedAt >= CONGREGATION_DOUBLE_TAP_WINDOW_MS) {
        if (congregationTapDirtied) {
          congregationTapCount = 0;
          congregationTapStartedAt = 0;
          congregationTapDirtied = false;
          return false;
        }
        congregationClickQueued = true;
        congregationClickKind = "volley";
        congregationTapCount = 0;
        congregationTapStartedAt = 0;
      }
    }
    if (!congregationClickQueued) return false;
    congregationClickQueued = false;
    const kind = congregationClickKind || "volley";
    congregationClickKind = "volley";
    return kind;
  }

  // A tap nobody used within this window is dropped, so a tap made during
  // gameplay can't press a menu button that appears later.
  const CANVAS_CLICK_MAX_AGE_MS = 400;
  let canvasClickAt = 0;

  function nowTime() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function expireStaleCanvasClick() {
    if (canvasClickQueued && nowTime() - canvasClickAt > CANVAS_CLICK_MAX_AGE_MS) {
      canvasClickQueued = false;
      canvasClickPos = null;
    }
  }

  function peekCanvasClick() {
    expireStaleCanvasClick();
    if (!canvasClickQueued) return null;
    return canvasClickPos;
  }

  function consumeCanvasClick() {
    expireStaleCanvasClick();
    if (!canvasClickQueued) return null;
    canvasClickQueued = false;
    const pos = canvasClickPos;
    canvasClickPos = null;
    return pos;
  }

  function clearJustPressed() {
    keysJustPressed.clear();
  }

  function detachListeners() {
    if (!listenersAttached) return;

    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);

    if (canvas) {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("contextmenu", preventContextMenu);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("pointerdown", handlePointerDown);
    }

    listenersAttached = false;
  }

  function initialize(options = {}) {
    if (options.canvas) canvas = options.canvas;
    if (!canvas) throw new Error("Input.initialize requires a canvas element");
    touchControlsRoot = options.touchControlsRoot || touchControlsRoot;
    moveStickBase = options.moveStickBase || moveStickBase;
    aimStickBase = options.aimStickBase || aimStickBase;
    virtualSpaceButton = options.virtualSpaceButton || virtualSpaceButton;
    arcControl = options.arcControl || arcControl;
    onAnyKeyDown = typeof options.onAnyKeyDown === "function" ? options.onAnyKeyDown : onAnyKeyDown;
    shouldUpdatePointer = typeof options.shouldUpdatePointer === "function" ? options.shouldUpdatePointer : shouldUpdatePointer;

    if (typeof options.initialPointerX === "number") pointerState.x = options.initialPointerX;
    else if (!listenersAttached && canvas.width) pointerState.x = canvas.width / 2;
    if (typeof options.initialPointerY === "number") pointerState.y = options.initialPointerY;
    else if (!listenersAttached && canvas.height) pointerState.y = canvas.height / 2;

    if (!listenersAttached) {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      canvas.addEventListener("mousemove", handleMouseMove);
      canvas.addEventListener("mouseleave", handleMouseLeave);
      canvas.addEventListener("contextmenu", preventContextMenu);
      canvas.addEventListener("mousedown", handleMouseDown);
      canvas.addEventListener("pointerdown", handlePointerDown);
      listenersAttached = true;
    }

    if (!virtualInput.enabled) {
      initializeVirtualControls();
    }
  }

  window.Input = {
    initialize,
    detachListeners,
    pollGamepad,
    initializeVirtualControls,
    updateTouchLayout,
    isActionActive,
    wasActionJustPressed,
    triggerVirtualKeyPress,
    consumePrayerBombClick,
    consumeCongregationClick,
    cancelCongregationTap,
    peekCanvasClick,
    consumeCanvasClick,
    consumeComboSwipe,
    peekComboSwipe,
    clearJustPressed,
    setVirtualControlsVisible,
    toggleVirtualControls,
    get keysJustPressed() {
      return keysJustPressed;
    },
    get keysPressed() {
      return keysDown;
    },
    get pointerState() {
      return pointerState;
    },
    get aimState() {
      return aimState;
    },
    get virtualInput() {
      return virtualInput;
    },
    get gamepadState() {
      return {
        connected: gamepadState.connected,
        index: gamepadState.index,
        id: gamepadState.id,
        movement: { ...gamepadState.movement },
        aim: { ...gamepadState.aim },
      };
    },
    get modifiers() {
      return { ...modifierState };
    },
      // NES 'A' button test flag
      get nesAButtonActive() {
        return nesAButtonActive;
      },
      set nesAButtonActive(val) {
        nesAButtonActive = Boolean(val);
      },
        // Player movement direction for melee weapon
        get movementDirection() {
          return { ...movementDirection };
        },
        // Last nonzero movement direction for melee weapon
        get lastMovementDirection() {
          return { ...lastMovementDirection };
        },
        get prayerBombClickQueued() {
          return prayerBombClickQueued;
        },
        set prayerBombClickQueued(val) {
          prayerBombClickQueued = Boolean(val);
        },
        get congregationClickQueued() {
          return congregationClickQueued;
        },
        set congregationClickQueued(val) {
          congregationClickQueued = Boolean(val);
        },
  };
})(typeof window !== "undefined" ? window : null);
