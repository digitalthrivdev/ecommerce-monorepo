"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { removeGatewayKeys, saveGatewayKeys } from "@/app/(dashboard)/settings/actions";
import { Badge } from "@/components/ui/badge";
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
      <span className="font-medium">Webhook</span>
      {gateway.webhookUrl ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{gateway.webhookUrl}</code>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => copy(gateway.webhookUrl!)} aria-label="Copy webhook URL">
            <Copy />
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground">Set PUBLIC_API_URL on the server to see the webhook URL.</span>
      )}
      <span className="text-muted-foreground">
        Add it in the {gateway.label} dashboard with these events: {gateway.webhookEvents}.
      </span>
    </div>
  );
}

function status(gateway: PaymentGatewayOption) {
  if (gateway.source === "env") return <Badge variant="secondary">Server environment</Badge>;
  if (gateway.configured) return <Badge>{gateway.testMode ? "Test keys" : "Live keys"}</Badge>;
  if (gateway.savedKeysUnreadable) return <Badge variant="destructive">Enter keys again</Badge>;
  return <Badge variant="outline">Not set</Badge>;
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
