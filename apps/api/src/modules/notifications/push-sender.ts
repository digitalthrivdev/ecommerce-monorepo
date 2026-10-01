import type { FastifyBaseLogger } from "fastify";

import { env } from "../../config/env.js";

export type PushMessage = {
  token: string;
  title: string;
  body: string;
  /** Lets the app open the right screen when the notification is tapped. */
  data: Record<string, string>;
};

export interface PushSender {
  readonly name: string;
  /** Returns tokens the provider reports as no longer valid, so they can be removed. */
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>;
}

export function createPushSender(log: FastifyBaseLogger): PushSender | null {
  switch (env.PUSH_PROVIDER) {
    case "log":
      return {
        name: "log",
        async send(messages) {
          for (const { token, ...message } of messages) {
            log.info({ push: { ...message, token } }, "Development push (not sent)");
          }
          return { invalidTokens: [] };
        },
      };
    case "none":
      return null;
  }
}
