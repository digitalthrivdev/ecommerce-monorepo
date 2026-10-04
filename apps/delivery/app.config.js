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
 *   APP_BRAND             Folder under brands/ with the client's icon and splash screen, e.g. "moozy".
 *   EAS_PROJECT_ID, EXPO_OWNER, APP_SLUG
 *                         The client's own EAS project, when they have one.
 *   GOOGLE_SERVICES_JSON  Firebase config for APP_ID (an EAS file variable), needed for Android push.
 *                         Falls back to ./google-services.json, which is kept out of git.
 *
 * Colors and logo inside the app come from the API's settings at runtime, not from here.
 */
const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/;
const BRAND_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const BRAND_COLORS = ["iconBackgroundColor", "splashBackgroundColor", "splashDarkBackgroundColor", "notificationColor"];

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

/**
 * Reads brands/<brand>/. Every file is optional; a missing one keeps the default from assets/.
 *
 *   icon.png                     1024×1024, no transparency (iOS and older Android launchers)
 *   android-icon-foreground.png  Android adaptive icon layers, 1024×1024, with the logo inside a
 *   android-icon-background.png  centred circle about 620 px wide (launchers crop the rest)
 *   android-icon-monochrome.png  White logo on transparent, same safe circle; themed icon and notifications
 *   splash-icon.png              1024×1024 PNG, transparent background, shown 160 dp wide
 *   brand.json                   Any of { "iconBackgroundColor", "splashBackgroundColor",
 *                                "splashDarkBackgroundColor", "notificationColor" } as "#RRGGBB"
 */
function brandAssets(brand) {
  const dir = path.join(__dirname, "brands", brand);
  if (!fs.existsSync(dir)) throw new Error(`APP_BRAND="${brand}" but brands/${brand} does not exist`);
  const file = (name) => (fs.existsSync(path.join(dir, name)) ? `./brands/${brand}/${name}` : undefined);

  const colorsFile = path.join(dir, "brand.json");
  const colors = fs.existsSync(colorsFile) ? JSON.parse(fs.readFileSync(colorsFile, "utf8")) : {};
  for (const [key, value] of Object.entries(colors)) {
    if (!BRAND_COLORS.includes(key)) throw new Error(`brands/${brand}/brand.json: unknown key "${key}"`);
    if (!COLOR_PATTERN.test(value)) throw new Error(`brands/${brand}/brand.json: ${key} must be "#RRGGBB"`);
  }

  return {
    icon: file("icon.png"),
    foreground: file("android-icon-foreground.png"),
    background: file("android-icon-background.png"),
    monochrome: file("android-icon-monochrome.png"),
    splash: file("splash-icon.png"),
    colors,
  };
}

function withPluginOptions(plugins, name, update) {
  return plugins.map((plugin) => {
    const [pluginName, options = {}] = Array.isArray(plugin) ? plugin : [plugin];
    return pluginName === name ? [pluginName, update(options)] : plugin;
  });
}

function applyBrand(config, brand) {
  const { icon, foreground, background, monochrome, splash, colors } = brandAssets(brand);
  const adaptiveIcon = { ...config.android.adaptiveIcon };
  if (foreground) adaptiveIcon.foregroundImage = foreground;
  if (monochrome) adaptiveIcon.monochromeImage = monochrome;
  if (background) adaptiveIcon.backgroundImage = background;
  else if (colors.iconBackgroundColor) delete adaptiveIcon.backgroundImage;
  if (colors.iconBackgroundColor) adaptiveIcon.backgroundColor = colors.iconBackgroundColor;

  let plugins = withPluginOptions(config.plugins ?? [], "expo-splash-screen", (options) => ({
    ...options,
    ...(splash && { image: splash }),
    ...(colors.splashBackgroundColor && { backgroundColor: colors.splashBackgroundColor }),
    ...(colors.splashDarkBackgroundColor && {
      dark: { ...options.dark, backgroundColor: colors.splashDarkBackgroundColor },
    }),
  }));
  plugins = withPluginOptions(plugins, "expo-notifications", (options) => ({
    ...options,
    ...(monochrome && { icon: monochrome }),
    ...(colors.notificationColor && { color: colors.notificationColor }),
  }));

  return {
    ...config,
    icon: icon ?? config.icon,
    android: { ...config.android, adaptiveIcon },
    plugins,
  };
}

module.exports = ({ config: baseConfig }) => {
  const brand = setting("APP_BRAND", BRAND_PATTERN);
  const config = brand ? applyBrand(baseConfig, brand) : baseConfig;
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
