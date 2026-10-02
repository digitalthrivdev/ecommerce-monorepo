import type { FastifyBaseLogger } from "fastify";

import type { PushMessage, PushSender } from "./push-sender.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_MESSAGES_PER_REQUEST = 100;
const TIMEOUT_MS = 10_000;

type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };

type ExpoResponse = {
  data?: ExpoTicket[];
  errors?: { code: string; message: string; details?: unknown }[];
};

/**
 * Splits a batch along the project mapping Expo returns with PUSH_TOO_MANY_EXPERIENCE_IDS. Each app
 * (customer, delivery) is its own Expo project, and one request may only target a single project.
 */
function splitByProject(details: unknown, messages: PushMessage[]): PushMessage[][] {
  if (!details || typeof details !== "object") return [messages];
  const groups = Object.values(details)
    .filter((tokens): tokens is string[] => Array.isArray(tokens))
    .map((tokens) => messages.filter((message) => tokens.includes(message.token)))
    .filter((group) => group.length > 0);
  const grouped = new Set(groups.flat());
  const rest = messages.filter((message) => !grouped.has(message));
  return rest.length > 0 ? [...groups, rest] : groups;
}

/** Sends through the Expo push service (https://docs.expo.dev/push-notifications/sending-notifications/). */
export function createExpoPushSender(log: FastifyBaseLogger, accessToken: string | undefined): PushSender {
  async function post(messages: PushMessage[]) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(accessToken && { authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify(
        messages.map(({ token, title, body, data }) => ({ to: token, title, body, data, sound: "default", priority: "high" })),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as ExpoResponse;
    return { status: response.status, ...result };
  }

  async function sendBatch(messages: PushMessage[], invalidTokens: string[]): Promise<void> {
    const result = await post(messages);

    const mixedProjects = result.errors?.find((error) => error.code === "PUSH_TOO_MANY_EXPERIENCE_IDS");
    if (mixedProjects) {
      const groups = splitByProject(mixedProjects.details, messages);
      if (groups.length > 1) {
        for (const group of groups) await sendBatch(group, invalidTokens);
        return;
      }
    }

    if (!result.data) {
      const codes = result.errors?.map((error) => error.code).join(", ") || "no tickets returned";
      throw new Error(`Expo push request failed with status ${result.status}: ${codes}`);
    }

    result.data.forEach((ticket, index) => {
      if (ticket.status === "ok") return;
      const token = messages[index]?.token;
      if (ticket.details?.error === "DeviceNotRegistered" && token) {
        invalidTokens.push(token);
      } else {
        log.warn({ error: ticket.details?.error, message: ticket.message }, "Expo rejected a push notification");
      }
    });
  }

  return {
    name: "expo",
    async send(messages) {
      const invalidTokens: string[] = [];
      for (let start = 0; start < messages.length; start += MAX_MESSAGES_PER_REQUEST) {
        const batch = messages.slice(start, start + MAX_MESSAGES_PER_REQUEST);
        try {
          await sendBatch(batch, invalidTokens);
        } catch (error) {
          log.error({ err: error, messages: batch.length }, "Failed to send push notifications through Expo");
        }
      }
      return { invalidTokens };
    },
  };
}
