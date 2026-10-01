import Constants from "expo-constants";

/**
 * In development the API is assumed to run on port 4000 of the machine serving the bundle, so a
 * phone on the same network reaches it without configuration. Set EXPO_PUBLIC_API_URL otherwise.
 */
function developmentApiUrl() {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000` : null;
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? developmentApiUrl() : null) || "http://localhost:4000").replace(/\/+$/, "");

/** Country calling code and national number length for the sign-in phone field. */
export const PHONE_COUNTRY_CODE = process.env.EXPO_PUBLIC_PHONE_COUNTRY_CODE || "+91";
export const PHONE_NATIONAL_LENGTH = Number(process.env.EXPO_PUBLIC_PHONE_NATIONAL_LENGTH) || 10;
