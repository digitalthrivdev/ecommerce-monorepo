"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { removeGatewayKeys, saveGatewayKeys } from "@/app/(dashboard)/settings/actions";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type { PaymentGatewayOption } from "@/lib/types";

import { IntegrationKeysList } from "./integration-keys";

function WebhookSetup({ gateway }: { gateway: PaymentGatewayOption }) {
  if (!gateway.webhookEvents) return null;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Webhook URL copied");
    } catch {
      toast.error("Could not copy. Select the URL and copy it instead.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm">
      <span className="font-medium">Payment updates link (webhook)</span>
      {gateway.webhookUrl ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{gateway.webhookUrl}</code>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => copy(gateway.webhookUrl!)} aria-label="Copy webhook URL">
            <Copy />
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground">Ask your technical partner to set PUBLIC_API_URL on the server to see this link.</span>
      )}
      <span className="text-muted-foreground">
        Paste it in your {gateway.label} account under webhooks, with these events: {gateway.webhookEvents}.
      </span>
    </div>
  );
}

function status(gateway: PaymentGatewayOption) {
  if (gateway.source === "env") return <Pill tone="blue">Set on server</Pill>;
  if (gateway.configured) return gateway.testMode ? <Pill tone="amber">Test keys</Pill> : <Pill tone="green">Live keys</Pill>;
  if (gateway.savedKeysUnreadable) return <Pill tone="red">Enter keys again</Pill>;
  return <Pill tone="gray">Not added</Pill>;
}

export function GatewayKeys({
  gateways,
  activeGateway,
  canStore,
  timezone,
}: {
  gateways: PaymentGatewayOption[];
  activeGateway: string | null;
  canStore: boolean;
  timezone: string;
}) {
  return (
    <IntegrationKeysList
      items={gateways.filter((gateway) => gateway.needsCredentials)}
      active={activeGateway}
      canStore={canStore}
      timezone={timezone}
      save={saveGatewayKeys}
      remove={removeGatewayKeys}
      status={status}
      dialogExtra={(gateway) => <WebhookSetup gateway={gateway} />}
      removeWarning={(gateway) =>
        `Payments already taken through ${gateway.label} can no longer be confirmed or refunded automatically until the keys are added again.`
      }
    />
  );
}
