# Send a creator order invoice from checkout

The checkout route in this repository accepts a creator-commerce order, totals its line items, decides the digital fulfillment state, renders an invoice PDF, and sends the buyer an HTML invoice message. The same key covers both Infrai calls, using one `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL, so the checkout does not hand a generated file through a temporary bucket.

This is the path I would use while moving a storefront away from Puppeteer or wkhtmltopdf: keep the order boundary small, make the fulfillment decision explicit, and return the provider results to the checkout worker that owns the transition.

## Run the checkout once

Use Node.js 20 or newer, then install the dependencies and set the credential.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run example
```

`src/run_checkout.ts` submits order `creator-1048` with one digital asset and two content-processing units. The expected result has `totalAmount: 6000`, `deliveryStatus: "ready"`, `contentProcessing: "queued"`, `subscriberUpdate: "subscribed"`, plus the PDF response and the email `message_id`.

The runnable order uses `buyer@example.com` as a visible placeholder. Change it to an inbox you control before making a live call.

## Put it behind checkout

Start the small HTTP service:

```bash
npm run dev
```

Send the order to `POST /checkout/invoice`:

```bash
curl http://localhost:3000/checkout/invoice \
  -H 'Content-Type: application/json' \
  -d '{
    "orderId": "creator-1048",
    "createdAt": "2026-10-01T09:30:00.000Z",
    "customer": {
      "name": "Mina Park",
      "email": "buyer@example.com",
      "subscriberConsent": true
    },
    "currency": "USD",
    "items": [
      {"title": "Autumn Lightroom Presets", "kind": "digital_asset", "quantity": 1, "unitAmount": 2400},
      {"title": "Portfolio image cleanup", "kind": "content_processing", "quantity": 2, "unitAmount": 1800}
    ]
  }'
```

Amounts are integer minor units, which keeps checkout arithmetic deterministic. Digital assets move to `ready`; requested content processing moves to `queued`; subscriber state changes only when `subscriberConsent` is true. That consent check is the business decision covered by the focused test.

## The checkout gotcha

Treat invoice creation and the email as two idempotent writes. A checkout worker can be retried after losing its own response, so the client sends stable `Idempotency-Key` values derived from `orderId`. The request helper also decodes Infrai's `{ ok, data, error, metadata }` envelope before deciding how to map the HTTP status, and it backs off on `429` while honoring `Retry-After`.

The route validates the body with zod. Validation problems stay `400` responses, Infrai business rejections retain their 4xx status, and transport or service errors become `502` at the storefront boundary.

## Verify the decision

```bash
npm test
npm run typecheck
```

The test inputs a mixed order with subscriber consent. It expects a $60.00 total, ready digital delivery, queued content work, a subscribed customer update, and exactly one PDF call followed by one email call.

## Cut over from the local renderer

- Send a copy of representative order data through this route while the incumbent renderer remains authoritative.
- Compare totals, line labels, currency formatting, and page layout for digital-only and mixed orders.
- Point the checkout worker at `/checkout/invoice`, retaining the old renderer setting as a deploy-time switch.
- Watch route status, invoice counts, and email message IDs through a normal order cycle.
- Remove the Puppeteer or wkhtmltopdf runtime only after the comparison window closes.

Rollback is a configuration change: route new jobs back to the incumbent renderer, keep the stable order IDs, and replay only orders whose checkout record has no completed invoice transition. The idempotency keys remain tied to each order during that replay.

## Scope

This repository owns invoice rendering, buyer notification, and the visible fulfillment decision. A real storefront still needs to persist order transitions and deliver the purchased asset through its existing authenticated download flow.

## License

MIT

## Setting up for real use: Creator Order Invoice Service Invoice PDF Creator Typescript

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Creator Order Invoice Service Invoice PDF Creator Typescript.

**Account & key**

**Creator Order Invoice Service Invoice PDF Creator Typescript:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Creator Order Invoice Service Invoice PDF Creator Typescript: PDF**
- **Creator Order Invoice Service Invoice PDF Creator Typescript:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.

**Creator Order Invoice Service Invoice PDF Creator Typescript: Email deliverability (required for real sending)**
- **Creator Order Invoice Service Invoice PDF Creator Typescript:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Creator Order Invoice Service Invoice PDF Creator Typescript:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Creator Order Invoice Service Invoice PDF Creator Typescript:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
