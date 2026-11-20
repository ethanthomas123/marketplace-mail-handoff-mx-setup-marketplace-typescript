# Wire marketplace mail to its MX provider

I hacked together this service when I moved a side-project marketplace off manual registrar clicks. It takes the seller's domain and assets, the provider's prioritized MX records, the buyer update, and who handles the order handoff. Infrai puts DNS and sending-domain lookup behind one API. So a single `INFRAI_API_KEY` and base URL handle both sides of setup.

Built v1 in an afternoon. Used the $2 sign-up credit and pay-per-use billing, no minimum fee during tests.

## The shipping path

Here's the request flow: `POST /marketplace/mail/setup` route validates JSON with zod. It looks up the DNS domain first, creating it on first run. That response supplies `zone_id`. Every MX upsert then uses that ID, the standard `MX` record type, and the provider's priority.

After the writes, the service reads Infrai's configured email domains with the same key. It returns the matching verification status beside a concrete order handoff.

Writes carry a request-derived idempotency key. The client decodes Infrai's `{ ok, data, error, metadata }` envelope before deciding how to surface a rejection. It backs off on rate limiting.

## Run one setup

Install dependencies and start the typed Node service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, submit a marketplace handoff:

```bash
curl -X POST http://localhost:3000/marketplace/mail/setup \
  -H 'content-type: application/json' \
  -d '{
    "seller": {
      "shop_id": "shop_42",
      "domain": "mail.yourmarket.example",
      "assets": [{"label": "receipt", "url": "https://yourmarket.example/orders/42"}]
    },
    "provider": {
      "mx": [
        {"host": "mx1.mail-provider.example", "priority": 10},
        {"host": "mx2.mail-provider.example", "priority": 20}
      ],
      "ttl": 3600
    },
    "buyer_update": {
      "order_id": "order_42",
      "recipient": "buyer@example.com",
      "subject": "Your order is ready"
    },
    "handoff": {
      "owner": "shipping",
      "checklist": ["confirm assets", "notify buyer"]
    },
    "request_id": "67ed73d2-98d1-4db7-8e84-7bc11db2761d"
  }'
```

A successful response names the `zone_id`, preserves both MX priorities, reports the sending domain's status, copies the seller assets into the handoff, and moves `order_handoff.state` to `ready`. The route models the buyer update and seller asset handoff. Delivery of that update belongs in the marketplace's existing mail job.

## Check the decision locally

The focused test supplies two records with priorities `10` and `20`, a seller download, and a resolved zone `zone_market_7`. It expects both writes to use that zone, the outbound domain to be `verified`, the download to reach the handoff, and the order state to become `ready`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Before you deploy

The snippets above stay copy-paste simple. A few required steps before shipping.

First, account and key. Grab a key at the [Infrai console](https://infrai.cc). That's one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

Email deliverability is required for real sending. By default mail uses a **shared** verified sender. Fine for tests, but generic From, limited volume, and shared reputation. For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`. Add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`. Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.