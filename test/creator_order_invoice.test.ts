import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutOrder,
  creatorOrderSchema,
  decideFulfillment,
  type InvoiceGateway,
} from "../src/creator_order_invoice.js";

test("a mixed creator order becomes deliverable, queued, and subscribed", async () => {
  const calls: string[] = [];
  const gateway: InvoiceGateway = {
    async generateInvoice(html, idempotencyKey) {
      calls.push(`pdf:${idempotencyKey}`);
      assert.match(html, /Autumn Presets/);
      assert.match(html, /Total \$60\.00/);
      return { document_id: "pdf_1048" };
    },
    async sendInvoiceEmail(to, subject, html, idempotencyKey) {
      calls.push(`email:${idempotencyKey}`);
      assert.equal(to, "buyer@example.com");
      assert.equal(subject, "Invoice for order creator-1048");
      assert.match(html, /Content processing: queued/);
      return { message_id: "msg_1048" };
    },
  };

  const order = creatorOrderSchema.parse({
    orderId: "creator-1048",
    createdAt: "2026-10-01T09:30:00.000Z",
    customer: { name: "Mina Park", email: "buyer@example.com", subscriberConsent: true },
    currency: "USD",
    items: [
      { title: "Autumn Presets", kind: "digital_asset", quantity: 1, unitAmount: 2400 },
      { title: "Image cleanup", kind: "content_processing", quantity: 2, unitAmount: 1800 },
    ],
  });

  const result = await checkoutOrder(order, gateway);

  assert.equal(result.totalAmount, 6000);
  assert.deepEqual(result.fulfillment, {
    deliveryStatus: "ready",
    subscriberUpdate: "subscribed",
    contentProcessing: "queued",
  });
  assert.deepEqual(calls, ["pdf:invoice-pdf:creator-1048", "email:invoice-email:creator-1048"]);
  assert.equal(result.email.message_id, "msg_1048");
});

test("subscriber state stays unchanged without checkout consent", () => {
  const order = creatorOrderSchema.parse({
    orderId: "creator-1051",
    createdAt: "2026-10-01T10:00:00.000Z",
    customer: { name: "Nora Bell", email: "nora@example.com", subscriberConsent: false },
    currency: "USD",
    items: [
      { title: "Studio lighting guide", kind: "digital_asset", quantity: 1, unitAmount: 1200 },
    ],
  });

  assert.equal(decideFulfillment(order).subscriberUpdate, "unchanged");
});
