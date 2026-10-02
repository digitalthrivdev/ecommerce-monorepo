import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import { apiFetch } from "./api";
import { queryClient } from "./query-client";

type NotificationsModule = typeof import("expo-notifications");

/** Remote push needs a development or store build: Expo Go on Android dropped it in SDK 53. */
const PUSH_SUPPORTED = !isRunningInExpoGo() && (Platform.OS === "android" || Platform.OS === "ios");

/** The token registered for the signed-in user, so sign-out can remove it. */
let registeredToken: string | null = null;
let lastOpenedId: string | null = null;
let notificationsModule: Promise<NotificationsModule> | null = null;

/** Loaded lazily: importing expo-notifications in Expo Go logs a warning on every launch. */
function loadNotifications() {
  notificationsModule ??= import("expo-notifications").then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    return Notifications;
  });
  return notificationsModule;
}

function orderIdOf(data: Record<string, unknown> | undefined) {
  return data?.type === "order_status" && typeof data.orderId === "string" ? data.orderId : null;
}

function refreshOrder(orderId: string) {
  queryClient.invalidateQueries({ queryKey: ["orders"] });
  queryClient.invalidateQueries({ queryKey: ["order", orderId] });
}

async function register(Notifications: NotificationsModule) {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    if (__DEV__) console.warn("Push notifications are off: run `eas init` in apps/customer to add an EAS project ID.");
    return;
  }

  // Android 13+ only shows the permission prompt once a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Order updates",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status === "undetermined") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await apiFetch("/notifications/push-tokens", {
    method: "POST",
    body: { token, platform: Platform.OS === "ios" ? "IOS" : "ANDROID" },
  });
  registeredToken = token;
}

/** Best effort, so this device stops getting the account's notifications. Call while still signed in. */
export function unregisterPush() {
  const token = registeredToken;
  registeredToken = null;
  if (token) apiFetch("/notifications/push-tokens", { method: "DELETE", body: { token } }).catch(() => {});
}

/** Registers this device for order updates and opens the order when a notification is tapped. */
export function usePushNotifications() {
  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    let cancelled = false;
    const subscriptions: { remove: () => void }[] = [];

    const open = (response: import("expo-notifications").NotificationResponse) => {
      const { identifier, content } = response.notification.request;
      const orderId = orderIdOf(content.data);
      if (!orderId || identifier === lastOpenedId) return;
      lastOpenedId = identifier;
      refreshOrder(orderId);
      router.push({ pathname: "/order/[id]", params: { id: orderId } });
    };

    loadNotifications()
      .then(async (Notifications) => {
        if (cancelled) return;
        subscriptions.push(
          Notifications.addNotificationReceivedListener((notification) => {
            const orderId = orderIdOf(notification.request.content.data);
            if (orderId) refreshOrder(orderId);
          }),
          Notifications.addNotificationResponseReceivedListener(open),
        );

        // The tap that launched the app arrives before any listener exists.
        const launchResponse = Notifications.getLastNotificationResponse();
        if (launchResponse) {
          Notifications.clearLastNotificationResponse();
          open(launchResponse);
        }

        await register(Notifications);
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn("Push notification setup failed", error);
      });

    return () => {
      cancelled = true;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);
}
