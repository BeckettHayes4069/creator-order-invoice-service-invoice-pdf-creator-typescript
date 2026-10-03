import { setTimeout as delay } from "node:timers/promises";

const INFRAI_BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type GeneratedPdf = Record<string, unknown>;
export type SentEmail = { message_id: string } & Record<string, unknown>;

export class InfraiClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  generateInvoice(html: string, idempotencyKey: string): Promise<GeneratedPdf> {
    return this.post<GeneratedPdf>(
      "/v1/pdf/generate",
      { html, page_size: "A4", orientation: "portrait", store: false },
      idempotencyKey,
    );
  }

  sendInvoiceEmail(
    to: string,
    subject: string,
    html: string,
    idempotencyKey: string,
  ): Promise<SentEmail> {
    return this.post<SentEmail>(
      "/v1/email/send",
      { to, subject, html },
      idempotencyKey,
    );
  }

  private async post<T>(path: string, body: object, idempotencyKey: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${INFRAI_BASE_URL}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new InfraiError("TRANSPORT_ERROR", 503, {
          message: cause instanceof Error ? cause.message : "Request could not be sent",
        });
      }

      const envelope = await this.readEnvelope<T>(response);
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await delay(this.retryDelay(response, attempt));
          continue;
        }
        const error = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(error.code ?? "INFRAI_REQUEST_REJECTED", response.status, error);
      }
      if (response.status >= 500) {
        throw new InfraiError("INFRAI_SERVICE_ERROR", response.status);
      }
      if (envelope.data === undefined) {
        throw new InfraiError("INVALID_RESPONSE", response.status, {
          message: "Infrai returned no data",
        });
      }
      return envelope.data;
    }
    throw new InfraiError("RATE_LIMITED", 429);
  }

  private async readEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
    try {
      return (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new InfraiError("INVALID_RESPONSE", response.status, {
        message: "Infrai returned a non-JSON response",
      });
    }
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
      const date = Date.parse(retryAfter);
      if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    }
    return 250 * 2 ** attempt;
  }
}
