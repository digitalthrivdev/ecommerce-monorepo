import Constants from "expo-constants";

/**
 * Port 4000 on the machine serving the Metro bundle, so a phone on the same network reaches the
 * API without configuration. Android emulator: set EXPO_PUBLIC_DEV_API_URL=http://10.0.2.2:4000.
 */
function developmentApiUrl() {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000` : null;
}

/**
 * Local Metro (`__DEV__`) always uses the machine running Expo, never the production URL from
 * eas.json. Preview and store builds use EXPO_PUBLIC_API_URL from the build profile.
 * Override the local URL with EXPO_PUBLIC_DEV_API_URL (LAN IP, emulator, or a tunnel).
 */
export const API_URL = (
  (__DEV__ ? process.env.EXPO_PUBLIC_DEV_API_URL || developmentApiUrl() : process.env.EXPO_PUBLIC_API_URL) ||
  "http://localhost:4000"
).replace(/\/+$/, "");

/** Country calling code and national number length for the sign-in phone field. */
export const PHONE_COUNTRY_CODE = process.env.EXPO_PUBLIC_PHONE_COUNTRY_CODE || "+91";
export const PHONE_NATIONAL_LENGTH = Number(process.env.EXPO_PUBLIC_PHONE_NATIONAL_LENGTH) || 10;
