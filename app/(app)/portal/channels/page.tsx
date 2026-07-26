import type { Metadata } from "next";
import { CHANNELS } from "@/lib/channels";
import { PageHeader, Card, Badge, Alert } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Channels" };

/**
 * Marketplace connection board.
 *
 * Static by design: the portal records which channel a product is meant for
 * (via channel: tags on the product), but it does not itself push to eBay or
 * Amazon. This page explains that and points staff at the filtered export,
 * rather than pretending a live sync exists that could fail silently.
 */
const SETUP: Record<string, string> = {
  store: "Your products are ready to sell here as soon as they are set Active.",
  ebay: "Export a sheet filtered to this channel and upload it in Seller Hub, or connect a listing tool that reads the channel tag.",
  amazon: "Export a sheet filtered to this channel and upload it in Seller Central, or connect a feed tool that reads the channel tag.",
};

export default function ChannelsPage() {
  return (
    <div>
      <PageHeader
        title="Channels"
        subtitle="Where your catalog is meant to sell."
      />

      <div className="mb-4">
        <Alert tone="info" title="Tags, not a live sync">
          Tagging a product for a channel records your intent. Nothing is
          published automatically — you stay in control of what actually goes
          live by exporting a filtered sheet for each marketplace.
        </Alert>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CHANNELS.map((c) => (
          <Card key={c.key}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-ink">{c.label}</h2>
                  <Badge tone={c.family === "store" ? "success" : "neutral"}>
                    {c.family === "store" ? "Connected" : "Manual"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{c.description}</p>
                <p className="mt-2 text-xs text-muted">{SETUP[c.family]}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
