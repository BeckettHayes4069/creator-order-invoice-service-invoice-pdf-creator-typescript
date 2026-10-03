import { z } from "zod";
import type { GeneratedPdf, SentEmail } from "./infrai_client.js";

export const creatorOrderSchema = z.object({
  orderId: z.string().min(1),
  createdAt: z.string().datetime(),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    subscriberConsent: z.boolean(),
  }),
  currency: z.string().regex(/^[A-Z]{3}$/),
  items: z.array(z.object({
    title: z.string().min(1),
    kind: z.enum(["digital_asset", "content_processing"]),
    quantity: z.number().int().positive(),
    unitAmount: z.number().int().nonnegative(),
  })).min(1),
});

export type CreatorOrder = z.infer<typeof creatorOrderSchema>;

export type FulfillmentDecision = {
  deliveryStatus: "ready" | "not_applicable";
  subscriberUpdate: "subscribed" | "unchanged";
  contentProcessing: "queued" | "not_requested";
};

export type CheckoutResult = {
  orderId: string;
  totalAmount: number;
  fulfillment: FulfillmentDecision;
  pdf: GeneratedPdf;
  email: SentEmail;
};

export interface InvoiceGateway {
  generateInvoice(html: string, idempotencyKey: string): Promise<GeneratedPdf>;
  sendInvoiceEmail(to: string, subject: string, html: string, idempotencyKey: string): Promise<SentEmail>;
}

export function decideFulfillment(order: CreatorOrder): FulfillmentDecision {
  const kinds = new Set(order.items.map((item) => item.kind));
  return {
    deliveryStatus: kinds.has("digital_asset") ? "ready" : "not_applicable",
    subscriberUpdate: order.customer.subscriberConsent ? "subscribed" : "unchanged",
    contentProcessing: kinds.has("content_processing") ? "queued" : "not_requested",
  };
}

export async function checkoutOrder(
  order: CreatorOrder,
  infrai: InvoiceGateway,
): Promise<CheckoutResult> {
  const totalAmount = order.items.reduce(
    (total, item) => total + item.quantity * item.unitAmount,
    0,
  );
  const fulfillment = decideFulfillment(order);
  const invoiceHtml = renderInvoice(order, totalAmount, fulfillment);

  const pdf = await infrai.generateInvoice(invoiceHtml, `invoice-pdf:${order.orderId}`);
  const email = await infrai.sendInvoiceEmail(
    order.customer.email,
    `Invoice for order ${order.orderId}`,
    renderInvoiceEmail(order, totalAmount, fulfillment),
    `invoice-email:${order.orderId}`,
  );

  return { orderId: order.orderId, totalAmount, fulfillment, pdf, email };
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function renderInvoice(
  order: CreatorOrder,
  totalAmount: number,
  fulfillment: FulfillmentDecision,
): string {
  const rows = order.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.title)}</td>
      <td>${item.quantity}</td>
      <td>${money(item.unitAmount, order.currency)}</td>
      <td>${money(item.quantity * item.unitAmount, order.currency)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
body{font:14px Arial,sans-serif;color:#202124;margin:40px}h1{font-size:26px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;font-size:18px;margin-top:20px}.note{margin-top:28px;color:#555}
</style></head><body>
<h1>Invoice ${escapeHtml(order.orderId)}</h1>
<p>Issued ${escapeHtml(order.createdAt.slice(0, 10))} to ${escapeHtml(order.customer.name)}</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Line total</th></tr></thead><tbody>${rows}</tbody></table>
<p class="total"><strong>Total ${money(totalAmount, order.currency)}</strong></p>
<p class="note">Digital delivery: ${fulfillment.deliveryStatus}. Content processing: ${fulfillment.contentProcessing}.</p>
</body></html>`;
}

function renderInvoiceEmail(
  order: CreatorOrder,
  totalAmount: number,
  fulfillment: FulfillmentDecision,
): string {
  return `<h1>Thanks for your order, ${escapeHtml(order.customer.name)}</h1>
<p>Invoice ${escapeHtml(order.orderId)} totals <strong>${money(totalAmount, order.currency)}</strong>.</p>
<p>Digital delivery: ${fulfillment.deliveryStatus}. Content processing: ${fulfillment.contentProcessing}.</p>`;
}
