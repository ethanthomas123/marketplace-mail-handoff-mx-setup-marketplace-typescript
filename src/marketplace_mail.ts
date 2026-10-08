import { z } from "zod";
import { InfraiClient, InfraiError, type DnsZone } from "./infrai_client.js";

const mxRecordSchema = z.object({
  host: z.string().min(1),
  priority: z.number().int().min(0).max(65535),
});

export const marketplaceMailRequestSchema = z.object({
  seller: z.object({
    shop_id: z.string().min(1),
    domain: z.string().min(3),
    assets: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).min(1),
  }),
  provider: z.object({
    mx: z.array(mxRecordSchema).min(1),
    ttl: z.number().int().positive().optional(),
  }),
  buyer_update: z.object({
    order_id: z.string().min(1),
    recipient: z.string().email(),
    subject: z.string().min(1),
  }),
  handoff: z.object({
    owner: z.string().min(1),
    checklist: z.array(z.string().min(1)).min(1),
  }),
  request_id: z.string().uuid(),
});

export type MarketplaceMailRequest = z.infer<typeof marketplaceMailRequestSchema>;

export type MarketplaceMailResult = {
  shop_id: string;
  zone_id: string;
  mx_records: Array<{ host: string; priority: number }>;
  outbound_domain_status: string;
  order_handoff: {
    order_id: string;
    buyer_update_recipient: string;
    seller_assets: Array<{ label: string; url: string }>;
    owner: string;
    checklist: string[];
    state: "ready";
  };
};

async function ensureZone(
  client: InfraiClient,
  domain: string,
  requestId: string,
): Promise<DnsZone> {
  try {
    return await client.getDnsDomain(domain);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    return client.addDnsDomain(domain, `${requestId}:zone`);
  }
}

export async function configureMarketplaceMail(
  input: MarketplaceMailRequest,
  client: InfraiClient,
): Promise<MarketplaceMailResult> {
  const zone = await ensureZone(client, input.seller.domain, input.request_id);

  await Promise.all(
    input.provider.mx.map((record, index) =>
      client.upsertDnsRecord(
        {
          zone_id: zone.zone_id,
          record_type: "MX",
          name: "@",
          content: record.host,
          priority: record.priority,
          ...(input.provider.ttl ? { ttl: input.provider.ttl } : {}),
        },
        `${input.request_id}:mx:${index}`,
      ),
    ),
  );

  const sendingDomains = await client.listEmailDomains();
  const configuredDomain = sendingDomains.find((item) => item.domain === input.seller.domain);

  return {
    shop_id: input.seller.shop_id,
    zone_id: zone.zone_id,
    mx_records: input.provider.mx.map(({ host, priority }) => ({ host: host!, priority: priority! })),
    outbound_domain_status: configuredDomain?.verification?.status ?? "not_configured",
    order_handoff: {
      order_id: input.buyer_update.order_id,
      buyer_update_recipient: input.buyer_update.recipient,
      seller_assets: input.seller.assets.map(({ label, url }) => ({ label: label!, url: url! })),
      owner: input.handoff.owner,
      checklist: input.handoff.checklist,
      state: "ready",
    },
  };
}
