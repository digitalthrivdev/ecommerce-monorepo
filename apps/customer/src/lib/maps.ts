import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/**
 * Whether this build can show a map. iOS uses Apple Maps; Android needs GOOGLE_MAPS_ANDROID_API_KEY
 * at build time (Expo Go brings its own key). Without it the Google Maps SDK crashes the app.
 */
export const mapsAvailable =
  Platform.OS === "ios" ||
  (Platform.OS === "android" &&
    (Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Constants.expoConfig?.extra?.googleMapsAndroid === true));
