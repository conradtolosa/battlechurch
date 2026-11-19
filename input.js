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
    }
    if (event.button === 2) {
      prayerBombClickQueued = true;
    }
  }

  function handleMouseDown(event) {
    handleCanvasClick(event, false);
  }

  function handlePointerDown(event) {
    handleCanvasClick(event, true);
  }

  function resetVirtualJoystick(handle, state) {
    if (handle) handle.style.transform = "translate(-50%, -50%)";
    state.pointerId = null;
    state.x = 0;
    state.y = 0;
    state.active = false;
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
    const deadZone = state === virtualInput.movement ? Math.min(virtualInput.deadZone, 0.06) : virtualInput.deadZone;
    if (magnitude > deadZone) {
      const normalized = normalizeVector(normalizedX, normalizedY);
      if (state === virtualInput.movement) {
        const angle = Math.atan2(normalized.y, normalized.x);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        state.x = Math.cos(snapped) * magnitude;
        state.y = Math.sin(snapped) * magnitude;
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
      }
    };

    const setBasePosition = (event) => {
      if (controlKey !== "movement" || !anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      baseEl.style.left = `${event.clientX - rect.left}px`;
      baseEl.style.top = `${event.clientY - rect.top}px`;
      baseEl.classList.add("is-active");
    };

    const start = (event) => {
      if (!virtualInput.enabled) return;
      if (state.pointerId !== null) return;
      state.pointerId = event.pointerId;
      setBasePosition(event);
      try {
        anchorEl.setPointerCapture(event.pointerId);
      } catch (e) {}
      updateVirtualJoystick(baseEl, handle, state, event);
      event.preventDefault();
    };

    const move = (event) => {
      if (state.pointerId !== event.pointerId) return;
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
  // On a slide, how long both buttons are held together before the first
  // one is released.
  const ABC_SLIDE_OVERLAP_MS = 30;
  // A touch waits this long before counting as a hold, so a tap or a quick
  // slide can be sent to the game as a clean, fast key sequence.
  const ABC_INTENT_MS = 200;
  // Fast slide: gap between the first and second button going down.
  const ABC_FAST_SEQUENCE_GAP_MS = 60;
  // Length of a tap.
  const ABC_TAP_MS = 50;

  function configureArcControl(arcEl) {
    if (!arcEl) return;
    const circleEls = Array.from(arcEl.querySelectorAll(".arc-segment[data-seg]"));
    if (!circleEls.length) return;
    const labelEls = Array.from(arcEl.querySelectorAll(".arc-label[data-seg]"));
    const segmentMap = {
      A: { key: "ArrowLeft", setNesA: true },
      B: { key: "ArrowDown" },
      C: { key: "ArrowRight", setPrayerBomb: true },
    };
    const pointers = new Map(); // pointerId -> { seg, held: Set, pressedAt: {} }
    const holdCounts = { A: 0, B: 0, C: 0 };
    let rafId = null;

    const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

    const isCharged = (seg, pressedAt) => {
      const ready = typeof window !== "undefined" ? window.__battlechurchChargeReady : null;
      if (ready && nowMs() - (Number(ready.at) || 0) < 250) return Boolean(ready[seg]);
      return Number.isFinite(pressedAt) && nowMs() - pressedAt >= (ABC_CHARGE_FALLBACK_MS[seg] || 1500);
    };

    const refresh = () => {
      const charged = { A: false, B: false, C: false };
      pointers.forEach((state) => {
        state.held.forEach((seg) => {
          if (isCharged(seg, state.pressedAt[seg])) charged[seg] = true;
        });
      });
      const touched = { A: false, B: false, C: false };
      pointers.forEach((state) => {
        if (state.pending) touched[state.pending] = true;
      });
      circleEls.forEach((el) => {
        const seg = el.dataset.seg;
        el.classList.toggle("is-active", holdCounts[seg] > 0 || touched[seg]);
        el.classList.toggle("is-charged", holdCounts[seg] > 0 && charged[seg]);
      });
      labelEls.forEach((el) => {
        el.classList.toggle("is-active", holdCounts[el.dataset.seg] > 0);
      });
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

    // Nearest button whose (slightly enlarged) circle contains the point, so
    // the small gaps between buttons never drop a slide.
    const getSegmentAt = (clientX, clientY) => {
      let best = null;
      let bestScore = Infinity;
      circleEls.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const radius = rect.width / 2;
        if (!radius) return;
        const cx = rect.left + radius;
        const cy = rect.top + rect.height / 2;
        const score = Math.hypot(clientX - cx, clientY - cy) / radius;
        if (score < bestScore) {
          bestScore = score;
          best = el.dataset.seg;
        }
      });
      return bestScore <= ABC_HIT_RADIUS_SCALE ? best : null;
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
      // The game reads a "swipe" only for B -> A (Smash) and C -> B (Clash).
      if ((prev === "B" && seg === "A") || (prev === "C" && seg === "B")) {
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

    const start = (event) => {
      if (!virtualInput.enabled) return;
      const seg = getSegmentAt(event.clientX, event.clientY);
      if (!seg) return;
      try {
        arcEl.setPointerCapture(event.pointerId);
      } catch (e) {}
      // Don't tell the game yet: wait briefly to see if this is a tap, a
      // hold or the start of a slide combo.
      const state = { seg, held: new Set(), pressedAt: {}, pending: seg, ended: false };
      state.pendingTimer = setTimeout(() => commitPending(state), ABC_INTENT_MS);
      pointers.set(event.pointerId, state);
      refresh();
      ensureTicking();
      event.preventDefault();
    };

    const move = (event) => {
      const state = pointers.get(event.pointerId);
      if (!state) return;
      event.preventDefault();
      const seg = getSegmentAt(event.clientX, event.clientY);
      // Off the buttons: keep holding whatever we're on (sticky).
      if (!seg || seg === state.seg) return;
      const prev = state.seg;
      state.seg = seg;

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
      queueSwipeIfUsed(prev, seg);
      if (prevCharged) {
        // "Charge X + Y": keep X held and hold Y too (hold Y until it glows
        // for Thrash / Hedge; keep sliding for Prayer Storm).
        pressHeld(state, seg);
        refresh();
        return;
      }
      overlapInto(state, prev, seg);
    };

    const end = (event) => {
      const state = pointers.get(event.pointerId);
      if (!state) return;
      pointers.delete(event.pointerId);
      state.ended = true;
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
      state.held.forEach((seg) => releaseSeg(seg));
      state.held.clear();
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

  function peekCanvasClick() {
    if (!canvasClickQueued) return null;
    return canvasClickPos;
  }

  function consumeCanvasClick() {
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
