/**
 * Platform abstraction for the handful of things that genuinely differ between
 * the browser build and the Android (Capacitor) build.
 *
 * Capacitor packages are imported dynamically so the web bundle never pulls
 * them in, and so a missing plugin degrades instead of crashing.
 */

import { MAX_IMAGE_BYTES, ACCEPTED_IMAGE_TYPES } from './constants.js';

export function isNativePlatform() {
  return Boolean(globalThis.Capacitor?.isNativePlatform?.());
}

export function platformName() {
  return globalThis.Capacitor?.getPlatform?.() ?? 'web';
}

/* -------------------------------------------------------------- file export */

function downloadInBrowser(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick; revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Where a native export is staged on its way out of the app.
 *
 * This used to write to `Directory.Documents`, which on Android is *shared*
 * storage — `/sdcard/Documents` — and the file stayed there indefinitely after
 * sharing. Any app holding All-files access, which plenty of file managers and
 * "cleaner" utilities ask for and get, could then read it at leisure. A health
 * log, and an API key when the user opts to include one, sitting in a
 * world-readable folder is not a defensible default for an app you hand to
 * someone else. The export is staged in the app's private cache instead and
 * leaves only through the share sheet, one grant at a time.
 */
const EXPORT_DIR = 'backups';

/** Empty the staging directory. Absent is the same as empty. */
async function clearStagedExports(Filesystem, Directory) {
  try {
    const { files } = await Filesystem.readdir({ path: EXPORT_DIR, directory: Directory.Cache });
    await Promise.all(files.map((entry) => Filesystem.deleteFile({
      path: `${EXPORT_DIR}/${typeof entry === 'string' ? entry : entry.name}`,
      directory: Directory.Cache,
    }).catch(() => {})));
  } catch { /* no directory yet */ }
}

/**
 * Save a text file and hand it off.
 *
 * A programmatic anchor click on a `blob:` URL — what the original export did —
 * simply does nothing inside an Android WebView, so on native the file is
 * written out and passed to the share sheet instead.
 */
export async function saveTextFile(filename, text) {
  if (!isNativePlatform()) {
    downloadInBrowser(filename, text);
    return { ok: true, method: 'download' };
  }

  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  // One at a time. The previous export has already been handed off, and every
  // copy left lying around is one more thing a future bug could expose.
  await clearStagedExports(Filesystem, Directory);

  const path = `${EXPORT_DIR}/${filename}`;
  await Filesystem.writeFile({
    path, data: text, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });

  try {
    await Share.share({
      title: 'Veggie Tracker backup',
      url: uri,
      dialogTitle: 'Save or send your backup',
    });
    return { ok: true, method: 'share' };
  } catch (err) {
    // Dismissing the sheet rejects here too, and the two are not worth
    // distinguishing: either way nothing was handed off, and the staged copy
    // sits in private cache where the user cannot reach it. Saying "saved"
    // would be a lie they only discover when they need the backup.
    await clearStagedExports(Filesystem, Directory);
    return { ok: false, method: 'unsent', error: err };
  }
}

/* -------------------------------------------------------------------- images */

export class ImageError extends Error {}

/**
 * A source the WebView could not decode.
 *
 * Kept distinct because the realistic cause is a format, not a corrupt file,
 * and the fix is a setting on the user's phone. Samsung ships "High efficiency
 * pictures" (HEIC/HEIF) as an option on the S-series camera, and Chromium's
 * `<img>` decoder does not handle HEIC — so a photo that looks fine in Gallery
 * simply fails here, with no clue as to why unless we say so.
 */
export class ImageDecodeError extends ImageError {}

const HEIF_TYPES = ['image/heic', 'image/heif'];

function decodeMessage(mimeType) {
  return HEIF_TYPES.includes(String(mimeType).toLowerCase())
    ? 'This photo is in HEIC format, which this app cannot read. In the Camera app open '
      + 'Settings and turn off "High efficiency pictures", then retake it — or pick a '
      + 'different photo.'
    : 'That file could not be read as an image.';
}

/**
 * Draw a decodable source onto a canvas and re-encode it as bounded JPEG.
 *
 * Every image reaching the model goes through here, from both the file picker
 * and the native camera, and that is deliberate: it is the single place where
 * the bytes and the declared MIME type are guaranteed to agree. Trusting a
 * source's own label is what sent HEIC bytes to the API under an `image/jpeg`
 * header — the request is well-formed, so it fails as a puzzling model error
 * rather than as an obviously broken upload.
 *
 * A modern phone photo is 3-6MB and ~12MP. Base64 inflates it by a third and
 * Gemini's inline_data path caps a request at roughly 20MB, so the long edge is
 * clamped too. 1024px is ample for identifying food.
 */
function reencodeToJpeg(src, { maxEdge = 1024, quality = 0.8, sourceType = '', revoke = null } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      revoke?.();
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new ImageError('Could not process that image.')); return; }
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.split(',')[1] ?? '';
      if (!base64) { reject(new ImageError('Could not process that image.')); return; }
      resolve({ dataUrl, base64, mimeType: 'image/jpeg', width, height });
    };
    img.onerror = () => {
      revoke?.();
      reject(new ImageDecodeError(decodeMessage(sourceType)));
    };
    img.src = src;
  });
}

/** Downscale and re-encode a `File`/`Blob` to JPEG. */
export function compressImage(file, options = {}) {
  const url = URL.createObjectURL(file);
  let revoked = false;
  return reencodeToJpeg(url, {
    ...options,
    sourceType: file?.type ?? '',
    revoke: () => { if (!revoked) { revoked = true; URL.revokeObjectURL(url); } },
  });
}

/** Validate then compress a user-selected image file. */
export async function prepareImageFile(file) {
  if (!file) throw new ImageError('No file selected.');
  if (!file.type || !file.type.startsWith('image/')) {
    throw new ImageError('Please choose an image file.');
  }
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageError('Unsupported image format. Use JPEG, PNG or WebP.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError(`That image is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB).`);
  }
  return compressImage(file);
}

/** The MIME type a Capacitor Camera `format` string actually denotes. */
function cameraMimeType(format) {
  switch (String(format ?? '').toLowerCase()) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    default: return 'image/jpeg';
  }
}

/**
 * Take or pick a photo. Uses the native camera when available.
 *
 * The plugin's `width` hint is a request, not a guarantee — a gallery pick
 * returns the original file untouched on some OEM builds — and `format`
 * follows the source file, so neither the size nor the type can be assumed.
 * The result is therefore re-encoded like any other image rather than handed
 * to the API as-is.
 */
export async function capturePhoto({ fromGallery = false } = {}) {
  if (!isNativePlatform()) return null; // caller falls back to <input type="file">

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    quality: 80,
    width: 1024,
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.Base64,
    source: fromGallery ? CameraSource.Photos : CameraSource.Prompt,
  });
  if (!photo?.base64String) throw new ImageError('No photo was captured.');

  const sourceType = cameraMimeType(photo.format);
  return reencodeToJpeg(`data:${sourceType};base64,${photo.base64String}`, { sourceType });
}

/* ------------------------------------------------------------- back button */

/**
 * Handle the Android hardware back button. `handler` returns true if it
 * consumed the press (e.g. closed a modal); otherwise the app exits.
 * No-op on the web. Returns a cleanup function.
 */
export function registerBackButton(handler) {
  if (!isNativePlatform()) return () => {};
  let remove = () => {};
  let cancelled = false;

  import('@capacitor/app')
    .then(({ App }) => App.addListener('backButton', ({ canGoBack }) => {
      if (handler()) return;
      if (canGoBack) window.history.back();
      else App.exitApp();
    }))
    .then((listener) => {
      if (cancelled) listener.remove();
      else remove = () => listener.remove();
    })
    .catch(() => {});

  return () => { cancelled = true; remove(); };
}

/** Hide the native splash screen once the app has rendered. */
export async function hideSplash() {
  if (!isNativePlatform()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* plugin not installed */ }
}
