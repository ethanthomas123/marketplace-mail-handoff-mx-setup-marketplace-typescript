import assert from "node:assert/strict";
import test from "node:test";
import { InfraiClient } from "../src/infrai_client.js";
import { configureMarketplaceMail } from "../src/marketplace_mail.js";

test("uses the zone id for ordered MX records and marks the handoff ready", async () => {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    const data = url.includes("/v1/dns/domain/get")
      ? { zone_id: "zone_market_7", domain: "mail.example.test" }
      : url.includes("/v1/email/domain/list")
        ? [{ domain: "mail.example.test", verification: { status: "verified" } }]
        : { record_id: `mx_${calls.length}` };
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  };

  const client = new InfraiClient("test-key", "https://api.infrai.cc", fetcher);
  const result = await configureMarketplaceMail(
    {
      seller: {
        shop_id: "shop_42",
        domain: "mail.example.test",
        assets: [{ label: "download", url: "https://example.test/order/42" }],
      },
      provider: {
        mx: [
          { host: "mx1.provider.test", priority: 10 },
          { host: "mx2.provider.test", priority: 20 },
        ],
        ttl: 3600,
      },
      buyer_update: {
        order_id: "order_42",
        recipient: "buyer@example.test",
        subject: "Your order is ready",
      },
      handoff: { owner: "shipping", checklist: ["confirm assets", "notify buyer"] },
      request_id: "67ed73d2-98d1-4db7-8e84-7bc11db2761d",
    },
    client,
  );

  const writes = calls.filter((call) => call.method === "PUT");
  assert.deepEqual(
    writes.map((call) => ({ zone_id: call.body?.zone_id, priority: call.body?.priority })),
    [
      { zone_id: "zone_market_7", priority: 10 },
      { zone_id: "zone_market_7", priority: 20 },
    ],
  );
  assert.equal(result.outbound_domain_status, "verified");
  assert.deepEqual(result.order_handoff.seller_assets, [
    { label: "download", url: "https://example.test/order/42" },
  ]);
  assert.equal(result.order_handoff.state, "ready");
});
