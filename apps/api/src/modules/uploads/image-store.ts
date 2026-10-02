import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { AppError } from "../../shared/errors.js";

// One image at a time and no decoded-image cache: the server is small and uploads are rare.
sharp.concurrency(1);
sharp.cache(false);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Rejects decompression bombs: a small file that decodes to a huge image. */
const MAX_INPUT_PIXELS = 50_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "gif"]);
/** Longest side in pixels. The small size is for lists and grids, the large one for detail screens and banners. */
const SIZES = { large: 1200, small: 400 } as const;
const QUALITY = 80;

const unreadable = () =>
  new AppError(400, "INVALID_IMAGE", "This file is not an image we can use. Upload a JPEG, PNG or WebP.");

/** The small version of an uploaded image, e.g. for product grids. Other URLs are returned as they are. */
export function smallImagePath(key: string) {
  return key.replace(/\.webp$/, "-sm.webp");
}

async function exists(file: string) {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** Files are named by content, so a name never changes meaning and an existing file is already correct. */
async function writeOnce(file: string, data: Buffer) {
  if (await exists(file)) return;
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, data);
  await rename(temp, file);
}

/**
 * Saves uploads on local disk as WebP in two sizes. Re-encoding drops anything that is not image
 * data, and metadata such as the GPS position in phone photos.
 */
export function createImageStore(uploadsDir: string) {
  const root = path.resolve(uploadsDir);

  async function render(input: Buffer, size: number) {
    return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });
  }

  /** Returns the path under the uploads folder, e.g. `images/3f/3f9c….webp`. */
  async function saveImage(input: Buffer) {
    const format = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .metadata()
      .then((metadata) => metadata.format, () => undefined);
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      throw unreadable();
    }

    let large: Awaited<ReturnType<typeof render>>;
    let small: Awaited<ReturnType<typeof render>>;
    try {
      large = await render(input, SIZES.large);
      small = await render(input, SIZES.small);
    } catch {
      throw unreadable();
    }

    const hash = createHash("sha256").update(input).digest("hex").slice(0, 32);
    const key = `images/${hash.slice(0, 2)}/${hash}.webp`;
    const file = path.join(root, key);
    await mkdir(path.dirname(file), { recursive: true });
    // The small file first, so whenever the large one exists both do.
    await writeOnce(path.join(root, smallImagePath(key)), small.data);
    await writeOnce(file, large.data);

    return { key, width: large.info.width, height: large.info.height, bytes: large.info.size };
  }

  return { root, saveImage };
}
