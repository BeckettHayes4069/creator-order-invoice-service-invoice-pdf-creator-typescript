import { checkoutOrder, creatorOrderSchema } from "./creator_order_invoice.js";
import { InfraiClient } from "./infrai_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the checkout example");

const order = creatorOrderSchema.parse({
  orderId: "creator-1048",
  createdAt: "2026-10-01T09:30:00.000Z",
  customer: {
    name: "Mina Park",
    email: "chenhua@changba.com",
    subscriberConsent: true,
  },
  currency: "USD",
  items: [
    { title: "Autumn Lightroom Presets", kind: "digital_asset", quantity: 1, unitAmount: 2400 },
    { title: "Portfolio image cleanup", kind: "content_processing", quantity: 2, unitAmount: 1800 },
  ],
});

const result = await checkoutOrder(order, new InfraiClient(apiKey));
console.log(JSON.stringify(result, null, 2));
