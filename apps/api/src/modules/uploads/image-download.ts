import { lookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

import { AppError } from "../../shared/errors.js";
import { MAX_UPLOAD_BYTES } from "./image-store.js";

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

/** Private, loopback, link-local, shared, documentation, multicast and reserved ranges. */
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are checked against the IPv4 ranges. */
export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 0) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

const failure = (message: string) => new AppError(400, "IMAGE_DOWNLOAD_FAILED", message);
const notPublic = () => failure("The image address is not a public internet address");

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** Resolves like dns.lookup but refuses non-public addresses, so the check holds for the address actually connected to. */
function publicLookup(hostname: string, options: { all?: boolean; family?: number | string }, callback: LookupCallback) {
  lookup(hostname, { ...options, all: true } as { all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
      return callback(notPublic(), []);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

function parseUrl(value: string, base?: URL) {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw failure("The image address is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw failure("The image address must start with http:// or https://");
  }
  if (url.username || url.password) {
    throw failure("The image address must not contain a user name or password");
  }
  // Literal IP addresses are connected to without a lookup, so they are checked here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) {
    throw notPublic();
  }
  return url;
}

type Hop = { redirect: string } | { body: Buffer };

function requestOnce(url: URL, deadline: number): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(
      url,
      {
        agent: false,
        lookup: publicLookup as never,
        headers: { "user-agent": "ShopCatalogImport/1.0", accept: "image/*" },
        timeout: Math.max(1, deadline - Date.now()),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          return resolve({ redirect: response.headers.location });
        }
        if (status !== 200) {
          response.resume();
          return reject(failure(`The image server answered HTTP ${status}`));
        }
        const declared = Number(response.headers["content-length"]);
        if (declared > MAX_UPLOAD_BYTES) {
          response.destroy();
          return reject(failure(`The image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`));
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_UPLOAD_BYTES) {
            response.destroy();
            reject(failure(`The image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ body: Buffer.concat(chunks) }));
        response.on("error", () => reject(failure("The image download was interrupted")));
      },
    );

    const timer = setTimeout(() => request.destroy(failure("The image download timed out")), Math.max(1, deadline - Date.now()));
    request.on("close", () => clearTimeout(timer));
    request.on("timeout", () => request.destroy(failure("The image download timed out")));
    request.on("error", (error) => {
      reject(error instanceof AppError ? error : failure("The image server could not be reached"));
    });
  });
}

/**
 * Downloads an image from a public http(s) address, at most 10 MB, following up to 5 redirects.
 * Every address connected to, including redirect targets, must be public.
 */
export async function downloadImage(address: string) {
  const deadline = Date.now() + TIMEOUT_MS;
  let url = parseUrl(address);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await requestOnce(url, deadline);
    if ("body" in result) return result.body;
    url = parseUrl(result.redirect, url);
  }
  throw failure("The image address redirects too many times");
}
