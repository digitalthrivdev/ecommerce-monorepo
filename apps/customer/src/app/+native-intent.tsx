const PRODUCT_LINK = /^(?:https?:\/\/[^/]+)?\/p\/([^/?#]+)\/?(?:[?#].*)?$/i;

/** Product links shared from the app (https://<SITE_DOMAIN>/p/<id>) open the product screen. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const match = PRODUCT_LINK.exec(path);
  return match ? `/product/${match[1]}` : path;
}
