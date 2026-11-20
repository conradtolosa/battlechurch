/* Image and animation loading: loadImage, loadAnimationClip, frame maps, load*Assets, loadAssets.
 * Moved out of game.js unchanged. Loaded by index.html BEFORE game.js and
 * shares its globals at runtime. Top-level code here runs before game.js
 * exists: run `node dev/tools/check_load_order.js` after editing.
 */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const originalSrc = src;
    const cached = assetSrcResolutionCache.get(originalSrc) || null;
    const image = new Image();
    let fallbackIndex = 0;
    const fallbackCandidates = [];

    const computeLowercaseFilenameFallback = (input) => {
      try {
        const parts = input.split("/");
        const filename = parts.pop() || "";
        const lower = filename.toLowerCase();
        if (lower && lower !== filename) {
          parts.push(lower);
          return parts.join("/");
        }
      } catch (e) {
        // ignore
      }
      return null;
    };

    const computeLowercasePathFallback = (input) => {
      try {
        const parts = input.split("/").map((part) => part.toLowerCase());
        return parts.join("/");
      } catch (e) {
        return null;
      }
    };

    const computeLowercaseDirsFallback = (input) => {
      try {
        const parts = input.split("/");
        if (parts.length <= 1) return null;
        const filename = parts.pop() || "";
        const lowered = parts.map((part) => part.toLowerCase());
        lowered.push(filename);
        return lowered.join("/");
      } catch (e) {
        return null;
      }
    };

    if (!cached) {
      const lowerFile = computeLowercaseFilenameFallback(originalSrc);
      if (lowerFile && lowerFile !== originalSrc) {
        fallbackCandidates.push(withAssetVersion(lowerFile));
      }
      const lowerDirs = computeLowercaseDirsFallback(originalSrc);
      if (lowerDirs && lowerDirs !== originalSrc) {
        fallbackCandidates.push(withAssetVersion(lowerDirs));
      }
      const lowerPath = computeLowercasePathFallback(originalSrc);
      if (lowerPath && lowerPath !== originalSrc) {
        fallbackCandidates.push(withAssetVersion(lowerPath));
      }
    }

    image.onload = () => {
      if (!cached) {
        assetSrcResolutionCache.set(originalSrc, image.src);
      }
      resolve(image);
    };

    image.onerror = () => {
      if (!cached && fallbackIndex < fallbackCandidates.length) {
        const next = fallbackCandidates[fallbackIndex];
        fallbackIndex += 1;
        if (next && next !== image.src) {
          image.src = next;
          return;
        }
      }
      reject(new Error(`Failed to load image: ${image.src}`));
    };

    const resolved = cached || withAssetVersion(originalSrc);
    image.src = resolved;
  });
}

function loadCachedImage(cache, src) {
  if (!cache.has(src)) {
    cache.set(src, loadImage(src));
  }
  return cache.get(src);
}

function withAssetVersion(path) {
  if (!path || !ASSET_CACHE_BUSTER) return path;
  if (path.includes(`v=${ASSET_CACHE_BUSTER}`)) return path;
  return path.includes("?")
    ? `${path}&v=${ASSET_CACHE_BUSTER}`
    : `${path}?v=${ASSET_CACHE_BUSTER}`;
}

// Runtime image cache for dev reloads
const devImageCache = new Map();

async function reloadEnemyClipsForKey(key) {
  try {
    if (!ASSET_MANIFEST.enemies[key]) {
      console.warn('reloadEnemyClipsForKey: no manifest entry for', key);
      return Promise.resolve();
    }
    const enemyDefs = ASSET_MANIFEST.enemies[key];
    const newClips = {};
    const loaders = Object.entries(enemyDefs).map(async ([state, def]) => {
      try {
        const clip = await loadAnimationClip(def, devImageCache, { isEnemy: true });
        newClips[state] = clip;
      } catch (e) {
        console.warn('reloadEnemyClipsForKey: failed loading state', { key, state, def, e });
      }
    });
    await Promise.all(loaders);
    applyExplicitEnemyFrameMaps(key, newClips);
    assets.enemies = assets.enemies || {};
    assets.enemies[key] = newClips;
    return Promise.resolve();
  } catch (e) {
    console.warn('reloadEnemyClipsForKey: unexpected error', e);
    return Promise.reject(e);
  }
}

async function reloadProjectileClipForKey(key) {
  try {
    const def = ASSET_MANIFEST.projectiles[key];
    if (!def) {
      console.warn('reloadProjectileClipForKey: no manifest entry for', key);
      return Promise.resolve();
    }
    const clip = await loadAnimationClip(def, devImageCache);
    assets.projectiles = assets.projectiles || {};
    assets.projectiles[key] = clip;
    return Promise.resolve();
  } catch (e) {
    console.warn('reloadProjectileClipForKey: unexpected error', e);
    return Promise.reject(e);
  }
}

// Generate conservative default frameMaps for MiniFolk sprite sheets when no
// developer overrides are present. This prevents the runtime from cycling the
// entire sheet for every state (idle/walk/etc.) when the inspector data was
// lost. The function returns an object mapping state -> array<frameIndex>.
function generateDefaultFrameMapsForMini(key, clips) {
  try {
    if (!MINIFOLKS.some((m) => m.key === key)) return null;
    // Prefer idle clip to read frameCount, fallback to any clip
    const sample = clips.idle || Object.values(clips)[0];
    if (!sample) return null;
    // If frameCount isn't useful, attempt to infer grid from the image
    let total = sample.frameCount;
    if (!Number.isFinite(total) || total <= 1) {
      try {
        const img = sample.image;
        if (img && img.width > 0 && img.height > 0 && sample.frameWidth && sample.frameHeight) {
          const cols = Math.max(1, Math.floor(img.width / sample.frameWidth));
          const rows = Math.max(1, Math.floor(img.height / sample.frameHeight));
          total = cols * rows;
        } else if (img && img.width > 0 && img.height > 0) {
          // Try common divisors for likely grids
          const commonCols = [4, 3, 2, 6, 8];
          const commonRows = [2, 3, 4];
          let found = false;
          for (const c of commonCols) {
            if (img.width % c !== 0) continue;
            for (const r of commonRows) {
              if (img.height % r !== 0) continue;
              const fw = img.width / c;
              const fh = img.height / r;
              if (fw >= 8 && fh >= 8 && fw <= 512 && fh <= 512) {
                total = c * r;
                found = true;
                break;
              }
            }
            if (found) break;
          }
          if (!found) {
            // gcd fallback: assume square-ish tiles
            const g = (function gcd(a,b){a=Math.abs(a)|0;b=Math.abs(b)|0;while(b){const t=b;b=a%b;a=t;}return a||1;})(img.width, img.height);
            if (g > 1 && img.width % g === 0 && img.height % g === 0) {
              const cols = Math.floor(img.width / g);
              const rows = Math.floor(img.height / g);
              total = Math.max(1, cols * rows);
            }
          }
        }
      } catch (e) {
        // ignore and bail below if still invalid
      }
    }
    if (!Number.isFinite(total) || total <= 1) return null;
    const states = ['idle', 'walk', 'attack', 'hurt', 'death'];
    // Weights bias more frames to walk (movement) and fewer to hurt/death
    const weights = { idle: 1, walk: 2, attack: 1, hurt: 1, death: 1 };
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    // Compute counts, ensure at least 1 where possible
    const counts = {};
    let remaining = total;
    for (const st of states) {
      const w = weights[st] || 1;
      let c = Math.max(1, Math.floor((total * w) / totalWeight));
      // don't allocate more than remaining
      c = Math.min(c, remaining - (states.length - Object.keys(counts).length - 1));
      counts[st] = c;
      remaining -= c;
    }
    // If any leftover frames, give to 'walk'
    if (remaining > 0) {
      counts.walk = (counts.walk || 1) + remaining;
      remaining = 0;
    }

  // Build contiguous ranges in order from 0..total-1
    const maps = {};
    let index = 0;
    for (const st of states) {
      const c = counts[st] || 0;
      const arr = [];
      for (let i = 0; i < c && index < total; i += 1) {
        arr.push(index);
        index += 1;
      }
      if (arr.length) maps[st] = arr;
    }
    // If death is missing frames, ensure it has at least the final frame
    if (!maps.death || !maps.death.length) maps.death = [Math.max(0, total - 1)];
  // default frame maps generated for mini (silenced)
    return maps;
  } catch (e) {
    return null;
  }
}

async function loadAnimationClip(definition, cache, options = {}) {
  if (!cache.has(definition.src)) {
    cache.set(definition.src, loadImage(definition.src));
  }
  const image = await cache.get(definition.src);

  // If the definition provides explicit frame dimensions, use them.
  let frameWidth = definition.frameWidth || 0;
  let frameHeight = definition.frameHeight || 0;

  // Helper: greatest common divisor for inferring grid cell size
  function gcd(a, b) {
    a = Math.abs(a) | 0;
    b = Math.abs(b) | 0;
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a || 1;
  }

  if (!frameWidth || !frameHeight) {
    const w = image.width;
    const h = image.height;

  const srcBase = (definition.src || "").split('/').pop() || "";
  const normalizedSrc = String(srcBase).trim().toLowerCase();
  const staticManualOverrides = {
  'MiniFireImp.png': { cols: 2, rows: 2 },
      'MiniHighDemon.png': { cols: 2, rows: 2 },
      'MiniDemonLord.png': { cols: 10, rows: 8 },
      'MiniDemonFireKeeper.png': { cols: 1, rows: 1 },
      'MiniSkeleton.png': { cols: 1, rows: 1 },
      'MiniZombie.png': { cols: 1, rows: 1 },
      'MiniZombieButcher.png': { cols: 4, rows: 4 },
  'minifireball.png': { cols: 4, rows: 2 },
  'minilichspell.png': { cols: 4, rows: 4 },
  'minitrident.png': { cols: 4, rows: 2 },
    };
    const declaredGridCols = Number.isFinite(definition.gridCols) && definition.gridCols > 0 ? definition.gridCols : null;
    const declaredGridRows = Number.isFinite(definition.gridRows) && definition.gridRows > 0 ? definition.gridRows : null;
    if (declaredGridCols && declaredGridRows) {
      if (!frameWidth) frameWidth = Math.floor(w / declaredGridCols);
      if (!frameHeight) frameHeight = Math.floor(h / declaredGridRows);
    } else if (staticManualOverrides[normalizedSrc] || staticManualOverrides[srcBase]) {
      const mo = staticManualOverrides[normalizedSrc] || staticManualOverrides[srcBase];
      if (mo.frameWidth && mo.frameHeight) {
        frameWidth = frameWidth || mo.frameWidth;
        frameHeight = frameHeight || mo.frameHeight;
      } else if (mo.cols && mo.rows) {
        if (!frameWidth) frameWidth = Math.floor(w / mo.cols);
        if (!frameHeight) frameHeight = Math.floor(h / mo.rows);
      }
    }

    // If still missing, attempt to detect a grid by testing common column/row divisors.
    if (!frameWidth || !frameHeight) {
      const commonCols = [1, 2, 3, 4, 5, 6, 8, 10, 12];
      const commonRows = [1, 2, 3, 4, 5, 6];
      let best = null;
      for (const cols of commonCols) {
        if (w % cols !== 0) continue;
        for (const rows of commonRows) {
          if (h % rows !== 0) continue;
          const fw = w / cols;
          const fh = h / rows;
          if (fw < 8 || fh < 8 || fw > 512 || fh > 512) continue;
          const frameCount = cols * rows;
          if (frameCount <= 1) continue;
          // Score: prefer more frames and smaller, more square frames
          const squareness = Math.abs(fw - fh);
          const score = squareness + (fw + fh) / 256 - Math.log(frameCount);
          if (!best || score < best.score) {
            best = { cols, rows, fw: Math.floor(fw), fh: Math.floor(fh), score };
          }
        }
      }

      if (best) {
        frameWidth = frameWidth || best.fw;
        frameHeight = frameHeight || best.fh;
      }
    }

    // Fallback: if not found yet, try gcd heuristic (square grid) then single-row strip
    if (!frameWidth || !frameHeight) {
      const g = gcd(w, h);
      if (g > 1 && w % g === 0 && h % g === 0) {
        // square grid
        frameWidth = frameWidth || g;
        frameHeight = frameHeight || g;
      } else {
        // fallback: assume a single horizontal strip where each frame is image.height
        frameHeight = frameHeight || h;
        frameWidth = frameWidth || frameHeight;
      }
    }
  }

  const imageForClip = buildShadowCrushedImageCopy(image, MASTER_ASSET_SHADOW_STYLE);
  const clip = new AnimationClip(imageForClip, frameWidth, frameHeight, definition.frameRate, definition);
  if (Array.isArray(definition.frameMap) && definition.frameMap.length) {
    clip.frameMap = definition.frameMap.slice();
  }
  return clip;
}

function applyShadowCrushToCanvas(canvas, renderStyle) {
  if (!canvas || typeof canvas.getContext !== "function") return canvas;
  const shadowCrush = Number.isFinite(renderStyle?.shadowCrush)
    ? Math.max(0, Math.min(1, renderStyle.shadowCrush))
    : 0;
  if (shadowCrush <= 0) return canvas;
  const shadowThreshold = Number.isFinite(renderStyle?.shadowThreshold)
    ? Math.max(0.02, Math.min(1, renderStyle.shadowThreshold))
    : 0.5;
  const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx2d) return canvas;
  let imageData = null;
  try {
    imageData = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
  } catch (e) {
    return canvas;
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
  ctx2d.putImageData(imageData, 0, 0);
  return canvas;
}

function buildShadowCrushedImageCopy(image, renderStyle) {
  if (!image || !image.width || !image.height) return image;
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return image;
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx2d) return image;
  ctx2d.imageSmoothingEnabled = false;
  ctx2d.drawImage(image, 0, 0);
  return applyShadowCrushToCanvas(canvas, renderStyle);
}

function maybeApplyArenaBackgroundShadowCrush(image) {
  return buildShadowCrushedImageCopy(image, MASTER_ASSET_SHADOW_STYLE);
}

function maybeApplyTitleBackgroundShadowCrush(image) {
  return buildShadowCrushedImageCopy(image, MASTER_ASSET_SHADOW_STYLE);
}

function extractFrame(image, frameWidth, frameHeight, frameIndex = 0) {
  const fw = frameWidth || image.width;
  const fh = frameHeight || image.height;
  const columns = Math.max(1, Math.floor(image.width / fw));
  const sx = (frameIndex % columns) * fw;
  const sy = Math.floor(frameIndex / columns) * fh;
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = fw;
  frameCanvas.height = fh;
  const frameCtx = frameCanvas.getContext("2d");
  frameCtx.drawImage(image, sx, sy, fw, fh, 0, 0, fw, fh);
  return frameCanvas;
}

function extractFrames(image, frameWidth, frameHeight) {
  const frames = [];
  if (!image) return frames;
  const fw = frameWidth || image.width;
  const fh = frameHeight || image.height;
  const cols = Math.max(1, Math.floor(image.width / fw));
  const rows = Math.max(1, Math.floor(image.height / fh));
  const total = Math.max(1, cols * rows);
  for (let i = 0; i < total; i += 1) {
    frames.push(extractFrame(image, fw, fh, i));
  }
  return frames;
}

async function loadCozyNpcAssets(cache) {
  const makeWalkKey = (filename) => filename.replace("_walk.png", "").replace(".png", "");
  const makeHurtKey = (filename) => filename.replace("_hurt.png", "").replace(".png", "");
  const mapHurtFilename = (filename) =>
    NPC_HURT_FILENAME_OVERRIDES[filename] || filename.replace("_walk.png", "_hurt.png");

  // Only load separate-sprite NPC assets when explicitly opted-in via npc_variants.js.
  const separateAssetsAvailable = Boolean(window.BattlechurchNpcVariants?.enabled);

  let baseWalk = null;
  let baseHurt = null;
  let eyes = null;
  if (separateAssetsAvailable) {
    try { baseWalk = await loadCachedImage(cache, `${NPC_WALK_ROOT}/${NPC_BASE_VARIANT}`); } catch (_e) {}
    try { baseHurt = await loadCachedImage(cache, `${NPC_COZY_HURT_ROOT}/${NPC_BASE_HURT_VARIANT}`); } catch (_e) {}
    try { eyes = await loadCachedImage(cache, `${NPC_WALK_ROOT}/eyes/${NPC_EYE_LAYER}`); } catch (_e) {}
  }

  const loadVariantGroup = async (folder, filenames) => {
    const walkRoot = `${NPC_WALK_ROOT}/${folder}`;
    const hurtRoot = `${NPC_COZY_HURT_ROOT}/${folder}`;

    if (folder === "hair") {
      const walkMap = {};
      const hurtMap = {};
      for (const filename of filenames) {
        const baseKey = makeWalkKey(filename);
        const walkSrc = `${walkRoot}/${filename}`;
        const hurtFilename = mapHurtFilename(filename);
        const hurtSrc = `${hurtRoot}/${hurtFilename}`;
        let walkImage = null;
        let hurtImage = null;
        try {
          walkImage = await loadCachedImage(cache, walkSrc);
        } catch (error) {
          walkImage = null;
        }
        try {
          hurtImage = await loadCachedImage(cache, hurtSrc);
        } catch (error) {
          hurtImage = null;
        }

        if (walkImage && walkImage.width && walkImage.height) {
          const walkVariantWidth = NPC_FRAME_WIDTH * NPC_COZY_WALK_FRAME_COUNT;
          const walkColors = Math.max(1, Math.floor(walkImage.width / walkVariantWidth));
          let hurtColors = walkColors;
          if (hurtImage && hurtImage.width && hurtImage.height) {
            const hurtVariantWidth = NPC_FRAME_WIDTH;
            hurtColors = Math.max(1, Math.floor(hurtImage.width / hurtVariantWidth));
          }
          const colorCount = Math.max(1, Math.min(walkColors, hurtColors));
          for (let idx = 0; idx < colorCount; idx += 1) {
            const key = `${baseKey}__c${idx}`;
            walkMap[key] = {
              __sourceImage: walkImage,
              __frameOffsetX: idx * walkVariantWidth,
              __frameOffsetY: 0,
            };
            if (hurtImage) {
              hurtMap[key] = {
                __sourceImage: hurtImage,
                __frameOffsetX: idx * NPC_FRAME_WIDTH,
                __frameOffsetY: 0,
              };
            } else {
              hurtMap[key] = walkMap[key];
            }
          }
          continue;
        }
        // Final fallback to single-color hair sprites (no variants).
        if (walkImage) {
          walkMap[baseKey] = walkImage;
          hurtMap[baseKey] = hurtImage || walkImage;
        }
      }
      return { walk: walkMap, hurt: hurtMap };
    }

    if (folder === "acc") {
      const walkMap = {};
      const hurtMap = {};
      for (const filename of filenames) {
        const baseKey = makeWalkKey(filename);
        const walkSrc = `${walkRoot}/${filename}`;
        const hurtFilename = mapHurtFilename(filename);
        const hurtSrc = `${hurtRoot}/${hurtFilename}`;
        let walkImage = null;
        let hurtImage = null;
        try {
          walkImage = await loadCachedImage(cache, walkSrc);
        } catch (error) {
          walkImage = null;
        }
        try {
          hurtImage = await loadCachedImage(cache, hurtSrc);
        } catch (error) {
          hurtImage = null;
        }
        if (walkImage) {
          walkMap[baseKey] = walkImage;
          hurtMap[baseKey] = hurtImage || walkImage;
        }
      }
      return { walk: walkMap, hurt: hurtMap };
    }

    const walkEntriesRaw = await Promise.all(
      filenames.map(async (filename) => {
        const src = `${walkRoot}/${filename}`;
        try {
          const image = await loadCachedImage(cache, src);
          return [makeWalkKey(filename), image];
        } catch (_e) {
          return null;
        }
      }),
    );
    const walkEntries = walkEntriesRaw.filter(Boolean);
    const walkMap = Object.fromEntries(walkEntries);

    const hurtEntries = await Promise.all(
      filenames.map(async (filename) => {
        const mapped = mapHurtFilename(filename);
        const src = `${hurtRoot}/${mapped}`;
        try {
          const image = await loadCachedImage(cache, src);
          const hurtKey = makeHurtKey(mapped);
          return [hurtKey, image];
        } catch (error) {
          return [makeWalkKey(filename), null];
        }
      }),
    );
    const hurtRaw = Object.fromEntries(hurtEntries);
    const hurtMap = {};
    for (const [key, image] of Object.entries(walkMap)) {
      const mappedKey = NPC_HURT_VARIANT_REMAP[key] || key;
      hurtMap[key] = hurtRaw[mappedKey] || null;
    }
    return { walk: walkMap, hurt: hurtMap };
  };

  const loadShoes = async (suffix) => {
    const root = suffix === "walk" ? `${NPC_WALK_ROOT}/clothes` : `${NPC_COZY_HURT_ROOT}/clothes`;
    const filename = suffix === "walk" ? NPC_SHOES_LAYER : mapHurtFilename(NPC_SHOES_LAYER);
    try {
      return await loadCachedImage(cache, `${root}/${filename}`);
    } catch (error) {
      return null;
    }
  };

  const hairVariants = separateAssetsAvailable ? await loadVariantGroup("hair", NPC_HAIR_VARIANTS) : { walk: {}, hurt: {} };
  const clothingVariants = separateAssetsAvailable ? await loadVariantGroup("clothes", NPC_CLOTHING_VARIANTS) : { walk: {}, hurt: {} };
  const accessoryVariants = separateAssetsAvailable ? await loadVariantGroup("acc", NPC_ACCESSORY_VARIANTS) : { walk: {}, hurt: {} };
  const shoesWalk = separateAssetsAvailable ? await loadShoes("walk") : null;
  const shoesHurt = separateAssetsAvailable ? await loadShoes("hurt") : null;

  let shadow = null;
  try {
    shadow = await loadCachedImage(cache, NPC_SHADOW_PATH);
  } catch (error) {
    shadow = null;
  }

  const npcPixelConfig = getNpcPixelConfig();
  const pixelLineImages = new Map();
  if (npcPixelConfig) {
    const candidatePaths = new Set();
    const addLayerAsset = (token) => {
      const t = String(token || "").trim();
      if (!t || t === "none") return;
      candidatePaths.add(`${NPC_PIXEL_LINE_ROOT}/${t}`);
    };
    const addFromLayerObject = (layersObj) => {
      if (!layersObj || typeof layersObj !== "object") return;
      for (const layerKey of NPC_PIXEL_LAYER_ORDER) {
        addLayerAsset(layersObj?.[layerKey]?.asset);
      }
    };
    if (Array.isArray(npcPixelConfig.presets)) {
      npcPixelConfig.presets.forEach((preset) => addFromLayerObject(preset?.layers));
    }
    addFromLayerObject(npcPixelConfig?.current?.layers);
    const cfgPool = npcPixelConfig.assetPool || null;
    if (cfgPool && typeof cfgPool === "object") {
      for (const layerKey of NPC_PIXEL_LAYER_ORDER) {
        const pool = cfgPool[layerKey] || {};
        (pool.include || []).forEach(addLayerAsset);
        (pool.exclude || []).forEach(addLayerAsset);
      }
    }
    // Always include baseline catalog entries so random generation has usable pools.
    Object.values(NPC_PIXEL_LAYER_CATALOG).forEach((byLayer) => {
      Object.values(byLayer || {}).forEach((arr) => {
        (arr || []).forEach((token) => addLayerAsset(token));
      });
    });
    for (const fullPath of candidatePaths) {
      try {
        const img = await loadCachedImage(cache, fullPath);
        const rel = fullPath.startsWith(`${NPC_PIXEL_LINE_ROOT}/`)
          ? fullPath.slice(`${NPC_PIXEL_LINE_ROOT}/`.length)
          : fullPath;
        pixelLineImages.set(rel, img);
      } catch (error) {}
    }
  }

  return {
    shadow,
    eyes,
    walk: {
      base: baseWalk,
      shoes: shoesWalk,
      hair: hairVariants.walk,
      clothes: clothingVariants.walk,
      accessories: accessoryVariants.walk,
    },
    hurt: {
      base: baseHurt,
      shoes: shoesHurt,
      hair: hairVariants.hurt,
      clothes: clothingVariants.hurt,
      accessories: accessoryVariants.hurt,
    },
    pixelLineConfig: npcPixelConfig || null,
    pixelLineImages,
  };
}

async function loadCoinAssets(cache) {
  const frames = await Promise.all(
    COIN_FRAME_FILES.map((file) => loadCachedImage(cache, `${ITEM_SPRITE_ROOT}/${file}`)),
  );
  return { coinFrames: frames };
}

async function loadPlayerAssets(cache, assets) {
  const buildFallbackClip = (baseDef = {}, key = "idle") => {
    const frameWidth = Math.max(1, Number(baseDef.frameWidth) || 64);
    const frameHeight = Math.max(1, Number(baseDef.frameHeight) || 64);
    const frameMap =
      Array.isArray(baseDef.frameMap) && baseDef.frameMap.length
        ? baseDef.frameMap.slice()
        : [0];
    const frameCount = Math.max(1, frameMap.length);
    const canvas = document.createElement("canvas");
    canvas.width = frameWidth * frameCount;
    canvas.height = frameHeight;
    const c = canvas.getContext("2d");
    if (c) {
      c.imageSmoothingEnabled = false;
      for (let i = 0; i < frameCount; i += 1) {
        const x = i * frameWidth;
        c.fillStyle = i % 2 === 0 ? "#6aa7ff" : "#93c0ff";
        c.fillRect(x, 0, frameWidth, frameHeight);
        c.fillStyle = "#102238";
        c.fillRect(
          x + Math.floor(frameWidth * 0.2),
          Math.floor(frameHeight * 0.2),
          Math.floor(frameWidth * 0.6),
          Math.floor(frameHeight * 0.6),
        );
      }
    }
    return {
      image: canvas,
      frameWidth,
      frameHeight,
      frameRate: Number(baseDef.frameRate) || (key === "walk" ? 10 : 8),
      loop: baseDef.loop !== false,
      frameMap,
      renderScale: Number(baseDef.renderScale) || 1,
    };
  };
  // Player is rendered by the paperdoll system; skip legacy sprite network requests.
  for (const [key, def] of Object.entries(ASSET_MANIFEST.player)) {
    assets.player[key] = buildFallbackClip(def, key);
  }
}

async function loadProjectileAssets(cache, assets) {
  const projectileEntries = Object.entries(ASSET_MANIFEST.projectiles).map(
    async ([key, def]) => {
      assets.projectiles[key] = await loadAnimationClip(def, cache);
    },
  );
  await Promise.all(projectileEntries);
}

// Load only the enemies needed for MapScreen (miniImp, miniDemonLord, miniHighDemon)
async function loadMapEnemyAssets(cache, assets) {
  const mapEnemies = ['miniImp', 'miniDemonLord', 'miniHighDemon'];
  const enemyTypes = Object.entries(ASSET_MANIFEST.enemies)
    .filter(([enemyName]) => mapEnemies.includes(enemyName))
    .map(async ([enemyName, enemyDefs]) => {
      assets.enemies[enemyName] = {};
      const loaders = Object.entries(enemyDefs).map(async ([state, def]) => {
        const clip = await loadAnimationClip(def, cache, { isEnemy: true });
        assets.enemies[enemyName][state] = clip;
      });
      await Promise.all(loaders);
      try {
        applyExplicitEnemyFrameMaps(enemyName, assets.enemies[enemyName]);
      } catch (e) {}
    });
  await Promise.all(enemyTypes);
}

// Load all remaining enemies (excludes already-loaded map enemies)
async function loadEnemyAssets(cache, assets, skipMapEnemies = false) {
  const mapEnemies = ['miniImp', 'miniDemonLord', 'miniHighDemon'];
  const enemyTypes = Object.entries(ASSET_MANIFEST.enemies)
    .filter(([enemyName]) => !skipMapEnemies || !mapEnemies.includes(enemyName))
    .map(async ([enemyName, enemyDefs]) => {
      assets.enemies[enemyName] = {};
      const loaders = Object.entries(enemyDefs).map(async ([state, def]) => {
        const clip = await loadAnimationClip(def, cache, { isEnemy: true });
        assets.enemies[enemyName][state] = clip;
      });
      await Promise.all(loaders);
      try {
        if (MINIFOLKS.some((m) => m.key === enemyName)) {
          const maps = generateDefaultFrameMapsForMini(enemyName, assets.enemies[enemyName]);
          if (maps) {
            for (const [st, arr] of Object.entries(maps)) {
              if (assets.enemies[enemyName][st] && (!assets.enemies[enemyName][st].frameMap || !assets.enemies[enemyName][st].frameMap.length)) {
                assets.enemies[enemyName][st].frameMap = arr.slice();
              }
            }
          }
        }
        try {
          applyExplicitEnemyFrameMaps(enemyName, assets.enemies[enemyName]);
        } catch (e) {}
      } catch (e) {}
    },
  );
  await Promise.all(enemyTypes);
}

async function loadObstacleAssets(cache, assets) {
  const obstacleEntries = Object.entries(OBSTACLE_DEFS).map(
    async ([key, def]) => {
      if (!cache.has(def.src)) {
        cache.set(def.src, loadImage(def.src));
      }
      const image = await cache.get(def.src);
      assets.obstacles[key] = {
        image,
        scale: def.scale,
        collisionRadius: def.collisionRadius,
      };
    },
  );
  await Promise.all(obstacleEntries);
}

async function loadWeaponDropAssets(cache, assets) {
  const weaponDropEntries = Object.entries(WEAPON_DROP_DEFS).map(
    async ([key, def]) => {
      let frames = null;
      let baseFrame = null;
      if (Array.isArray(def.frameSources) && def.frameSources.length) {
        frames = [];
        for (const src of def.frameSources) {
          if (!cache.has(src)) {
            cache.set(src, loadImage(src));
          }
          const img = await cache.get(src);
          frames.push(img);
        }
        baseFrame = frames[0] || null;
      } else if (def.src) {
        if (!cache.has(def.src)) {
          cache.set(def.src, loadImage(def.src));
        }
        const image = await cache.get(def.src);
        const fw = def.frameWidth || 0;
        const fh = def.frameHeight || 0;
        if (fw > 0 && fh > 0) {
          frames = extractFrames(image, fw, fh);
          const index = Math.max(0, def.frameIndex || 0);
          baseFrame = frames[index] || frames[0] || image;
        } else {
          baseFrame = extractFrame(image, fw, fh, def.frameIndex || 0);
        }
      }
      const imageRef = baseFrame || (frames && frames[0]) || null;
      let iconImage = null;
      if (def.iconSrc) {
        if (!cache.has(def.iconSrc)) {
          cache.set(def.iconSrc, loadImage(def.iconSrc));
        }
        iconImage = await cache.get(def.iconSrc);
      }
      assets.weaponPickups[key] = { image: imageRef, frames, iconImage, ...def };
    },
  );
  await Promise.all(weaponDropEntries);
}

async function loadUtilityAssets(cache, assets) {
  const utilityEntries = Object.entries(UTILITY_POWERUP_DEFS).map(
    async ([key, def]) => {
      if (!cache.has(def.src)) {
        cache.set(def.src, loadImage(def.src));
      }
      const image = await cache.get(def.src);
      let iconImage = null;
      if (def.iconSrc) {
        if (!cache.has(def.iconSrc)) {
          cache.set(def.iconSrc, loadImage(def.iconSrc));
        }
        iconImage = await cache.get(def.iconSrc);
      }
      assets.utility[key] = { image, iconImage, ...def };
    },
  );
  await Promise.all(utilityEntries);
}

async function loadChurchPowerupAssets(cache, assets) {
  const powerupEntries = Object.entries(CHURCH_POWERUP_DEFS).map(
    async ([key, def]) => {
      let frames = null;
      let baseFrame = null;
      if (Array.isArray(def.frameSources) && def.frameSources.length) {
        frames = [];
        for (const src of def.frameSources) {
          if (!cache.has(src)) {
            cache.set(src, loadImage(src));
          }
          const img = await cache.get(src);
          frames.push(img);
        }
        baseFrame = frames[0] || null;
      } else if (def.src) {
        if (!cache.has(def.src)) {
          cache.set(def.src, loadImage(def.src));
        }
        const image = await cache.get(def.src);
        const fw = def.frameWidth || 0;
        const fh = def.frameHeight || 0;
        if (fw > 0 && fh > 0) {
          frames = extractFrames(image, fw, fh);
          const index = Math.max(0, def.frameIndex || 0);
          baseFrame = frames[index] || frames[0] || image;
        } else {
          baseFrame = extractFrame(image, fw, fh, def.frameIndex || 0);
        }
      }
      const imageRef = baseFrame || (frames && frames[0]) || null;
      let iconImage = null;
      if (def.iconSrc) {
        if (!cache.has(def.iconSrc)) {
          cache.set(def.iconSrc, loadImage(def.iconSrc));
        }
        iconImage = await cache.get(def.iconSrc);
      }
      assets.churchPowerups[key] = { image: imageRef, frames, iconImage, ...def };
    },
  );
  await Promise.all(powerupEntries);
}

async function loadPastorPowerupAssets(cache, assets) {
  const entries = Object.entries(PASTOR_POWERUP_DEFS).map(async ([key, def]) => {
    if (!cache.has(def.iconSrc)) cache.set(def.iconSrc, loadImage(def.iconSrc));
    const iconImage = await cache.get(def.iconSrc);
    assets.pastorPowerups[key] = { iconImage, ...def };
  });
  await Promise.all(entries);
}

async function loadProjectileFrames(cache, assets, projectileFrames) {
  // Faith cannon frames
  const faithCannonClip = assets.projectiles?.faith_cannon;
  if (faithCannonClip && faithCannonClip.image) {
    const faithCannonFrames = extractFrames(
      faithCannonClip.image,
      faithCannonClip.frameWidth || faithCannonClip.image.width,
      faithCannonClip.frameHeight || faithCannonClip.image.height,
    );
    if (faithCannonFrames.length) {
      projectileFrames.faith_cannon = faithCannonFrames;
    }
  }

  // Mini trident frames
  try {
    const tridentClip = assets.projectiles?.miniTrident;
    if (tridentClip && tridentClip.image) {
      const frames = getFramesForClip(tridentClip);
      if (frames && frames.length) {
        projectileFrames.miniTrident = frames;
      }
    }
  } catch (e) {
    console.debug && console.debug('miniTrident frame extraction failed', e);
  }

  // Mini fireball uses the exact same clip as the player's default arrow projectile.
  if (assets.projectiles?.arrow) {
    assets.projectiles.miniFireball = assets.projectiles.arrow;
  }

  // Word of God frames
  projectileFrames.word_of_god = await Promise.all(
    WORD_OF_GOD_FRAME_FILES.map((file) => loadCachedImage(cache, file)),
  );

  // Fire and wisdom missile frames
  projectileFrames.fire = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      loadImage(`assets/sprites/projectiles/fire-missile/fire-missile${i + 1}.png`),
    ),
  );
  projectileFrames.wisdom_missle = await Promise.all(
    WISDOM_FRAME_SOURCES.map((src) => loadImage(src)),
  );
  projectileFrames.demonLordFireball = await Promise.all(
    DEMON_LORD_FIREBALL_FRAME_FILES.map((src) => loadCachedImage(cache, src)),
  );
  projectileFrames.fireOrb = Array.isArray(projectileFrames.demonLordFireball)
    ? projectileFrames.demonLordFireball.slice()
    : [];
  if (projectileFrames.fireOrb.length) {
    assets.projectiles.fireOrb = { frames: projectileFrames.fireOrb };
  }

  // Divine shot (Blast) — animated fire4 frames replace the static blast.png
  projectileFrames.divine_shot = await Promise.all(
    Array.from({ length: 11 }, (_, i) =>
      loadImage(`assets/sprites/projectiles/fire4/1_${i}.png`),
    ),
  );
}

async function loadEffectAssets(cache, assets) {
  assets.effects.verticalPuff = await Promise.all(
    Array.from({ length: 9 }, (_, i) =>
      loadImage(`${MAGIC_PACK_ROOT}/vertical-puff/vertical-puff${i + 1}.png`).then(
        (img) => extractFrame(img, img.width, img.height, 0),
      ),
    ),
  );
  assets.effects.impactDust = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      loadImage(`${MAGIC_PACK_ROOT}/impact-dust/impact-dust${i + 1}.png`).then((img) =>
        extractFrame(img, img.width, img.height, 0),
      ),
    ),
  );
  assets.effects.flash = await Promise.all(
    Array.from({ length: 14 }, (_, i) =>
      loadImage(`${MAGIC_PACK_ROOT}/flash/flash${i + 1}.png`).then((img) =>
        extractFrame(img, img.width, img.height, 0),
      ),
    ),
  );
  assets.effects.sentryBurn = await loadImage(
    "assets/sprites/projectiles/tormentor-flame/Group-4-1.png",
  ).then((img) => extractFrames(img, 32, 48));
  assets.effects.visitorHeartHit = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      loadImage(`${MAGIC_PACK_ROOT}/puff/puff${i + 1}.png`).then((img) =>
        extractFrame(img, img.width, img.height, 0),
      ),
    ),
  );
  assets.effects.magicImpact = await Promise.all(
    Array.from({ length: FLASH_FRAME_COUNT }, (_, i) =>
      loadImage(`${MAGIC_FLASH_SPRITE_PATH}/flash${i + 1}.png`),
    ),
  );
  assets.effects.puff = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      loadImage(`${MAGIC_PACK_ROOT}/puff/puff${i + 1}.png`).then((img) =>
        extractFrame(img, img.width, img.height, 0),
      ),
    ),
  );
  assets.effects.enemyDeathExplosion = await loadImage(
    "assets/sprites/explosions/16/Explosion VFX 16(48x48).png",
  ).then((img) => extractFrames(img, 48, 48).slice(0, 10));
  assets.effects.enemyDeathExplosionAlt = await loadImage(
    "assets/sprites/explosions/17/Explosion VFX 17(48x64).png",
  ).then((img) => extractFrames(img, 48, 64).slice(0, 10));
  assets.effects.swordSlash = await loadImage(
    "assets/sprites/projectiles/sword-slash/sword_slash.png",
  ).then((img) => extractFrames(img, 64, 47));
  assets.effects.enemyDeathExplosionAlt2 = await loadImage(
    "assets/sprites/explosions/3/Explosion VFX 3(48x48).png",
  ).then((img) => extractFrames(img, 48, 48).slice(0, 10));
  assets.effects.rushBurstExplosion = await loadImage(
    "assets/sprites/explosions/Explosion VFX 26(64x64).png",
  ).then((img) => extractFrames(img, 64, 64)).catch(() => null);
  assets.effects.prayerBombExplosion = await loadImage(
    "assets/sprites/explosions/Explosion VFX 21/Explosion VFX 21(64x64).png",
  ).then((img) => extractFrames(img, 64, 64));
  assets.effects.magicSplash = await Promise.all(
    Array.from({ length: FLASH_FRAME_COUNT }, (_, i) =>
      loadImage(`${MAGIC_FLASH_SPRITE_PATH}/flash${i + 1}.png`).then((img) =>
        extractFrame(img, img.width, img.height, 0),
      ),
    ),
  );
  assets.effects.chattyHeartHit = await loadImage(`assets/sprites/projectiles/ray/ray.png`).then((img) =>
    extractFrames(img, 78, 64),
  );
  assets.effects.chattyAppease = await loadImage(`assets/sprites/projectiles/blast/blast.png`).then((img) =>
    extractFrames(img, 64, 64),
  );
  assets.effects.raybolt = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      loadImage(`assets/sprites/projectiles/raybolt/Raybolt${i + 1}.png`).then((img) =>
        extractFrame(img, img.width, img.height, 0),
      ),
    ),
  );
  assets.effects.divineChargeSpark = await Promise.all(
    Array.from({ length: DIVINE_CHARGE_SPARK_COUNT }, (_, i) =>
      loadImage(`${DIVINE_CHARGE_SPARK_ROOT}/sparks${i + 1}.png`),
    ),
  );
  assets.effects.meleeSwoosh = await loadImage(MELEE_SWOOSH_PATH).catch(() => null);
  assets.effects.smoke = await Promise.all(
    Array.from({ length: 17 }, (_, i) =>
      loadImage(`${MAGIC_PACK_ROOT}/smoke/smoke${i + 1}.png`).then((img) =>
        extractFrame(img, img.width, img.height, 0),
      ),
    ),
  );
  assets.effects.prayerStormGroundFire = await Promise.all(
    PRAYER_STORM_GROUND_FIRE_SHEETS.map(async (src) => {
      const img = await loadCachedImage(cache, src);
      const frameWidth = Math.max(1, Math.floor(img.width / 14));
      return extractFrames(img, frameWidth, img.height).slice(0, 14);
    }),
  );
}

async function loadItemFrames(cache, assets, keyFramesPromise, torchFramesPromise, flagFramesPromise) {
  const keyFrames = (await keyFramesPromise).filter(Boolean);
  assets.items.gracePickup = {
    frames: keyFrames,
    icon: keyFrames[0] || null,
  };
  const torchFrames = (await torchFramesPromise).filter(Boolean);
  assets.items.torch = {
    frames: torchFrames,
    icon: torchFrames[0] || null,
  };
  const flagFrames = (await flagFramesPromise).filter(Boolean);
  assets.items.flag = {
    frames: flagFrames,
    icon: flagFrames[0] || null,
  };
}

async function loadBackgroundAssets(cache, assets) {
  const districtIntroPromise = loadImage(DISTRICT_INTRO_BACKGROUND_PATH)
    .then((img) => {
      if (!assets.backgrounds) assets.backgrounds = { mission1: null };
      assets.backgrounds.mission1 = maybeApplyArenaBackgroundShadowCrush(img);
    })
    .catch(() => {
      if (!assets.backgrounds) assets.backgrounds = { mission1: null };
      assets.backgrounds.mission1 = null;
    });
  const epiloguePromise = loadImage("assets/backgrounds/epilogue.png")
    .then((img) => {
      if (!assets.backgrounds) assets.backgrounds = { epilogue: null };
      assets.backgrounds.epilogue = maybeApplyArenaBackgroundShadowCrush(img);
    })
    .catch(() => {
      if (!assets.backgrounds) assets.backgrounds = { epilogue: null };
      assets.backgrounds.epilogue = null;
    });
  const act2Promise = loadImage("assets/backgrounds/mission-2.png")
    .then((img) => {
      if (!assets.backgrounds) assets.backgrounds = {};
      assets.backgrounds.mission2 = maybeApplyArenaBackgroundShadowCrush(img);
    })
    .catch(() => {
      if (!assets.backgrounds) assets.backgrounds = {};
      assets.backgrounds.mission2 = null;
    });
  const act3Promise = loadImage("assets/backgrounds/mission-3.png")
    .then((img) => {
      if (!assets.backgrounds) assets.backgrounds = {};
      assets.backgrounds.mission3 = maybeApplyArenaBackgroundShadowCrush(img);
    })
    .catch(() => {
      if (!assets.backgrounds) assets.backgrounds = {};
      assets.backgrounds.mission3 = null;
    });
  const districtCompleteCongregationPromise = loadImage("assets/backgrounds/district-complete-congregation.png")
    .then((img) => {
      if (!assets.backgrounds) assets.backgrounds = {};
      assets.backgrounds.districtCompleteCongregation = maybeApplyArenaBackgroundShadowCrush(img);
    })
    .catch(() => {
      if (!assets.backgrounds) assets.backgrounds = {};
      assets.backgrounds.districtCompleteCongregation = null;
    });
  const gameOverBackgroundPromise = loadImage("assets/backgrounds/mission-1.png")
    .then((img) => {
      if (!assets.backgrounds) assets.backgrounds = { gameOver: null };
      assets.backgrounds.gameOver = maybeApplyArenaBackgroundShadowCrush(img);
    })
    .catch(() => {
      if (!assets.backgrounds) assets.backgrounds = { gameOver: null };
      assets.backgrounds.gameOver = null;
    });
  const midPromise = BACKGROUND_MID_PATH
    ? loadImage(BACKGROUND_MID_PATH)
        .then((img) => { assets.backgroundLayers.mid = maybeApplyArenaBackgroundShadowCrush(img); })
        .catch(() => { assets.backgroundLayers.mid = null; })
    : Promise.resolve().then(() => { assets.backgroundLayers.mid = null; });
  const floorPromise = loadImage("assets/backgrounds/floors/floor-demon-1.png")
    .then((img) => { assets.backgroundLayers.floor = maybeApplyArenaBackgroundShadowCrush(img); })
    .catch(() => { assets.backgroundLayers.floor = null; });
  const floorVictoryNormalPromise = loadImage("assets/backgrounds/floors/floor-game-normal.png")
    .then((img) => { assets.backgroundLayers.floorVictoryNormal = maybeApplyArenaBackgroundShadowCrush(img); })
    .catch(() => { assets.backgroundLayers.floorVictoryNormal = null; });
  const floorBossPromise = loadImage("assets/backgrounds/floors-boss/boss_1.png")
    .then((img) => { assets.backgroundLayers.floorBoss = maybeApplyArenaBackgroundShadowCrush(img); })
    .catch(() => { assets.backgroundLayers.floorBoss = null; });
  const floorCongregationNormalPromise = loadImage("assets/backgrounds/floors/floor_normal.png")
    .then((img) => { assets.backgroundLayers.floorCongregationNormal = maybeApplyArenaBackgroundShadowCrush(img); })
    .catch(() => { assets.backgroundLayers.floorCongregationNormal = null; });
  const floorCongregationDemonPromise = loadImage("assets/backgrounds/floors/floor_demon.png")
    .then((img) => { assets.backgroundLayers.floorCongregationDemon = maybeApplyArenaBackgroundShadowCrush(img); })
    .catch(() => { assets.backgroundLayers.floorCongregationDemon = null; });
  const floorCongregationLegacyPromise = loadImage("assets/backgrounds/floor-congregation-1.png")
    .then((img) => { assets.backgroundLayers.floorCongregation = maybeApplyArenaBackgroundShadowCrush(img); })
    .catch(() => { assets.backgroundLayers.floorCongregation = null; });
  const titleBackgroundPromise = loadImage(TITLE_BACKGROUND_PATH)
    .then((img) => { assets.titleBackground = maybeApplyTitleBackgroundShadowCrush(img); })
    .catch(() => { assets.titleBackground = null; });

  await Promise.all([
    districtIntroPromise,
    epiloguePromise,
    act2Promise,
    act3Promise,
    districtCompleteCongregationPromise,
    gameOverBackgroundPromise,
    midPromise,
    floorPromise,
    floorVictoryNormalPromise,
    floorBossPromise,
    floorCongregationNormalPromise,
    floorCongregationDemonPromise,
    floorCongregationLegacyPromise,
    titleBackgroundPromise,
  ]);
}

// Phase 1: Load only what's needed for title screen and map navigation
async function loadTitleMapAssets() {
  const cache = new Map();
  const assets = {
    player: {},
    projectiles: {},
    enemies: {},
    obstacles: {},
    weaponPickups: {},
    churchPowerups: {},
    pastorPowerups: {},
    utility: {},
    effects: {},
    background: null,
    backgrounds: { districtIntro: null },
    backgroundLayers: {
      far: null,
      mid: null,
      floor: null,
      floorVictoryNormal: null,
      floorBoss: null,
      floorCongregation: null,
      floorCongregationNormal: null,
      floorCongregationDemon: null,
    },
    npcs: null,
    items: {},
  };
  // Load title background
  try {
    const img = await loadImage(TITLE_BACKGROUND_PATH);
    assets.titleBackground = maybeApplyTitleBackgroundShadowCrush(img);
  } catch (e) {
    console.warn("Failed to load title background:", e);
  }
  // Load map screen enemy animations (miniImp, miniDemonLord)
  await loadMapEnemyAssets(cache, assets);
  loadingProgress = 15;
  return { assets, cache };
}

// Phase 2: Load all remaining gameplay assets
async function loadGameplayAssets(cache, assets) {
  projectileFrames = {};
  const npcAssetsPromise = loadCozyNpcAssets(cache);
  const coinAssetsPromise = loadCoinAssets(cache);
  const keyFramesPromise = Promise.all(
    GRACE_SPRITE_FILES.map(async (src) => {
      if (!cache.has(src)) {
        cache.set(src, loadImage(src));
      }
      try {
        const img = await cache.get(src);
        return extractFrame(img, img.width, img.height, 0);
      } catch (err) {
        console.warn && console.warn("Failed to load key frame", src, err);
        return null;
      }
    }),
  );
  const torchFramesPromise = Promise.all(
    [TORCH_SPRITE_FILE, TORCH_SPRITE_FILE, TORCH_SPRITE_FILE, TORCH_SPRITE_FILE].map(
      async (src) => {
        if (!cache.has(src)) {
          cache.set(src, loadImage(src));
        }
        try {
          const img = await cache.get(src);
          return extractFrame(img, img.width, img.height, 0);
        } catch (err) {
          console.warn && console.warn("Failed to load torch frame", src, err);
          return null;
        }
      },
    ),
  );
  const flagFramesPromise = Promise.all(
    [FLAG_SPRITE_FILE, FLAG_SPRITE_FILE, FLAG_SPRITE_FILE, FLAG_SPRITE_FILE].map(
      async (src) => {
        if (!cache.has(src)) {
          cache.set(src, loadImage(src));
        }
        try {
          const img = await cache.get(src);
          return extractFrame(img, img.width, img.height, 0);
        } catch (err) {
          console.warn && console.warn("Failed to load flag frame", src, err);
          return null;
        }
      },
    ),
  );

  // Track loading progress (continues from phase 1 at 15%)
  loadingProgress = 20;
  await Promise.all([
    loadPlayerAssets(cache, assets),
    loadProjectileAssets(cache, assets),
    loadEnemyAssets(cache, assets, true), // Skip map enemies (already loaded)
    loadObstacleAssets(cache, assets),
    loadWeaponDropAssets(cache, assets),
    loadChurchPowerupAssets(cache, assets),
    loadPastorPowerupAssets(cache, assets),
    loadUtilityAssets(cache, assets),
    loadBackgroundAssets(cache, assets),
    npcAssetsPromise,
    coinAssetsPromise,
  ]);
  loadingProgress = 60;

  assets.npcs = await npcAssetsPromise;
  assets.items = await coinAssetsPromise;
  loadingProgress = 75;

  // Load frames and effects in parallel (they're independent)
  await Promise.all([
    loadProjectileFrames(cache, assets, projectileFrames),
    loadEffectAssets(cache, assets),
    loadItemFrames(cache, assets, keyFramesPromise, torchFramesPromise, flagFramesPromise),
  ]);
  loadingProgress = 100;

  return assets;
}

// Backwards-compatible wrapper that loads everything
async function loadAssets() {
  const { assets, cache } = await loadTitleMapAssets();
  await loadGameplayAssets(cache, assets);
  return assets;
}
