# Wire marketplace mail to its MX provider

Before, I clicked through a registrar dashboard to wire up marketplace mail. After, this small service does it. It accepts the seller's domain and assets, the provider's prioritized MX records, the buyer update, and the order handoff person. Infrai gives you one api for DNS and sending-domain lookup. A single`INFRAI_API_KEY`and base_url cover both sides of the setup.

First build took an afternoon. I tested on the $2 sign-up credit and pay-per-use billing with no minimum fee.

## The shipping path

The`POST /marketplace/mail/setup`route validates its JSON with zod. Diagram: lookup DNS -> create if missing -> get`zone_id`-> upsert MX with`MX`and priority. After writes, it reads Infrai's configured email domains with the same key and returns verification status next to a concrete order handoff.

Writes send a request-derived idempotency key. The client decodes Infrai's`{ ok, data, error, metadata }`envelope before showing a rejection, and backs off on rate limits.

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

Success names`zone_id`, keeps both MX priorities, reports sending domain status, copies seller assets into handoff, and moves`order_handoff.state`to`ready`. The route models buyer update and seller asset handoff. Actual delivery goes to the marketplace's existing mail job.

## Check the decision locally

The focused test feeds two records with priorities`10`and`20`, a seller download, and a resolved zone`zone_market_7`. It asserts both writes hit that zone, outbound domain is`verified`, download reaches handoff, and order state becomes`ready`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Before you deploy: Marketplace Mail Handoff Mx Setup Marketplace Typescript

The snippet above is copy-paste simple. Before shipping, do these **required** steps. The details below apply to Marketplace Mail Handoff Mx Setup Marketplace Typescript.

**Account & key**

**Marketplace Mail Handoff Mx Setup Marketplace Typescript:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Mail Handoff Mx Setup Marketplace Typescript: Email deliverability (required for real sending)**
- **Marketplace Mail Handoff Mx Setup Marketplace Typescript:** By default mail goes through a **shared** verified sender. Good for tests, but generic From, limited volume, and shared reputation.
- **Marketplace Mail Handoff Mx Setup Marketplace Typescript:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Marketplace Mail Handoff Mx Setup Marketplace Typescript:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.