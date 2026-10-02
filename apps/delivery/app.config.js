const fs = require("node:fs");
const path = require("node:path");

/**
 * Extends app.json with per-client settings, so one codebase builds every client's app. Set them in
 * .env for local builds, or as EAS environment variables for cloud builds. All are optional; the
 * values in app.json are the defaults.
 *
 *   APP_NAME              Name under the launcher icon, e.g. "Moozy".
 *   APP_ID                Android package and iOS bundle ID, e.g. "in.moozy.app". Permanent once the
 *                         app is published, and two installs on one phone need different IDs.
 *   APP_SCHEME            Deep link scheme used to return from online payment, e.g. "moozy".
 *   EAS_PROJECT_ID, EXPO_OWNER, APP_SLUG
 *                         The client's own EAS project, when they have one.
 *   GOOGLE_SERVICES_JSON  Firebase config for APP_ID (an EAS file variable), needed for Android push.
 *                         Falls back to ./google-services.json, which is kept out of git.
 *
 * Colors and logo inside the app come from the API's settings at runtime, not from here.
 */
const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/;

function setting(name, pattern) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (pattern && !pattern.test(value)) throw new Error(`${name}="${value}" is not valid`);
  return value;
}

/** Firebase only accepts the file when it contains an app for this package. */
function googleServicesFor(packageName) {
  const localFile = path.join(__dirname, "google-services.json");
  const file = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(localFile) ? "./google-services.json" : undefined);
  if (!file) return undefined;

  let packages;
  try {
    const { client = [] } = JSON.parse(fs.readFileSync(path.resolve(__dirname, file), "utf8"));
    packages = client.map((entry) => entry.client_info?.android_client_info?.package_name);
  } catch {
    return file;
  }
  if (packages.includes(packageName)) return file;

  console.warn(`${file} has no Firebase app for ${packageName}, so this build has no push notifications.`);
  return undefined;
}

module.exports = ({ config }) => {
  const appId = setting("APP_ID", ID_PATTERN) ?? config.android.package;
  const projectId = setting("EAS_PROJECT_ID");
  const googleServicesFile = googleServicesFor(appId);

  return {
    ...config,
    name: setting("APP_NAME") ?? config.name,
    slug: setting("APP_SLUG") ?? config.slug,
    owner: setting("EXPO_OWNER") ?? config.owner,
    scheme: setting("APP_SCHEME", SCHEME_PATTERN) ?? config.scheme,
    ios: { ...config.ios, bundleIdentifier: appId },
    android: { ...config.android, package: appId, ...(googleServicesFile && { googleServicesFile }) },
    extra: { ...config.extra, eas: { ...config.extra?.eas, ...(projectId && { projectId }) } },
  };
};
