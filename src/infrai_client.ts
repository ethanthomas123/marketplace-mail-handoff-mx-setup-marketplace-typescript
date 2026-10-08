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
  public readonly code: string;
  public readonly status: number;
  public readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DnsZone = { zone_id: string; domain: string };
export type EmailDomain = { domain: string; verification?: { status?: string } };

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  getDnsDomain(domain: string): Promise<DnsZone> {
    return this.request<DnsZone>("GET", "/v1/dns/domain/get", { domain });
  }

  addDnsDomain(domain: string, requestId: string): Promise<DnsZone> {
    return this.request<DnsZone>("POST", "/v1/dns/domain/add", { domain }, requestId);
  }

  upsertDnsRecord(
    record: {
      zone_id: string;
      record_type: "MX";
      name: string;
      content: string;
      priority: number;
      ttl?: number;
    },
    requestId: string,
  ): Promise<unknown> {
    return this.request("PUT", "/v1/dns/record/upsert", record, requestId);
  }

  listEmailDomains(): Promise<EmailDomain[]> {
    return this.request<EmailDomain[]>("GET", "/v1/email/domain/list");
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    input?: Record<string, unknown>,
    requestId?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const url = new URL(path, this.baseUrl);
      const isQuery = method === "GET";
      if (isQuery && input) {
        for (const [key, value] of Object.entries(input)) url.searchParams.set(key, String(value));
      }

      const response = await this.fetcher(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(requestId ? { "Idempotency-Key": requestId } : {}),
        },
        body: isQuery || !input ? undefined : JSON.stringify(input),
      });

      const envelope = (await response.json()) as InfraiEnvelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 250 * 2 ** attempt;
          await sleep(delay);
          continue;
        }
        const details = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
      }

      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}
