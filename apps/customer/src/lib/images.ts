const UPLOADED_IMAGE = /\/uploads\/images\/[0-9a-f]{2}\/[0-9a-f]{32}\.webp$/;

/**
 * The 400 px version of an image uploaded through the dashboard, for lists and small tiles; about a
 * tenth of the full size. Images linked from elsewhere are used as they are.
 */
export function smallImage(url: string) {
  return UPLOADED_IMAGE.test(url) ? url.replace(/\.webp$/, "-sm.webp") : url;
}
