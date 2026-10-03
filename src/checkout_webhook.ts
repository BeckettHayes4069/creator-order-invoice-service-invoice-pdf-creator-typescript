import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { checkoutOrder, creatorOrderSchema } from "./creator_order_invoice.js";
import { InfraiClient, InfraiError } from "./infrai_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const infrai = new InfraiClient(apiKey);
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/checkout/invoice") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const order = creatorOrderSchema.parse(await readJson(request));
    const result = await checkoutOrder(order, infrai);
    sendJson(response, 201, result);
  } catch (error) {
    if (error instanceof ZodError) {
      sendJson(response, 400, { error: "Invalid order", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.code, message: error.message });
      return;
    }
    sendJson(response, 500, { error: "Could not process order" });
  }
}).listen(port, () => {
  console.log(`Invoice checkout listening on http://localhost:${port}`);
});

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
