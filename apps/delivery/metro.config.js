const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

// Expo's default config, plus debug IDs that match crash reports to the uploaded source maps.
const config = getSentryExpoConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
