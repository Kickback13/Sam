/**
 * Minimal GoHighLevel (LeadConnector) API v2 client for the one-time import.
 * Read-only: contacts, pipelines, opportunities. Shapes follow GHL's official
 * SDK (@gohighlevel/api-client 3.1.1):
 *
 *   GET /contacts/?locationId&limit&startAfterId&startAfter   → { contacts, meta }
 *   GET /opportunities/pipelines?locationId                    → { pipelines }
 *   GET /opportunities/search?location_id&limit&startAfterId&startAfter → { opportunities, meta }
 *
 * Auth: a sub-account Private Integration token (Bearer) with the scopes
 * contacts.readonly and opportunities.readonly. Nothing here writes to GHL.
 */

export const GHL_BASE_URL = "https://services.leadconnectorhq.com";
export const GHL_API_VERSION = "2021-07-28";
export const GHL_PAGE_SIZE = 100;

export type GhlDndChannel = { status?: string };

export type GhlContact = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  additionalEmails?: unknown;
  additionalPhones?: unknown;
  companyName?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  source?: string | null;
  tags?: string[] | null;
  dnd?: boolean | null;
  dndSettings?: Partial<
    Record<"Call" | "Email" | "SMS" | "WhatsApp" | "GMB" | "FB", GhlDndChannel>
  > | null;
  dateAdded?: string | null;
  type?: string | null;
};

export type GhlStage = { id: string; name: string; position?: number };
export type GhlPipeline = { id: string; name: string; stages: GhlStage[] };

export type GhlOpportunity = {
  id: string;
  name?: string | null;
  monetaryValue?: number | null;
  pipelineId?: string | null;
  pipelineStageId?: string | null;
  status?: string | null; // open | won | lost | abandoned
  source?: string | null;
  contactId?: string | null;
  createdAt?: string | null;
};

/** Cursor for GHL's startAfter/startAfterId pagination (null = first page). */
export type GhlCursor = { startAfterId: string; startAfter: number } | null;

export type GhlPage<T> = { items: T[]; next: GhlCursor; total: number | null };

export class GhlError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "scope" | "rate_limit" | "not_found" | "server" | "network",
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

type Meta = { startAfterId?: string | null; startAfter?: number | null; total?: number | null };

function nextCursor(meta: Meta | undefined, got: number, pageSize: number): GhlCursor {
  if (!meta || got < pageSize || !meta.startAfterId || meta.startAfter == null) return null;
  return { startAfterId: String(meta.startAfterId), startAfter: Number(meta.startAfter) };
}

export class GhlClient {
  constructor(
    private readonly token: string,
    readonly locationId: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl: string = GHL_BASE_URL,
  ) {}

  private async get<T>(
    path: string,
    query: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query))
      if (v !== undefined) url.searchParams.set(k, String(v));
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Version: GHL_API_VERSION,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch (err) {
      throw new GhlError(
        `Couldn't reach GoHighLevel (${err instanceof Error ? err.message : "network error"})`,
        "network",
      );
    }
    if (res.status === 401)
      throw new GhlError(
        "GoHighLevel rejected the token (401). Check it or create a new one.",
        "auth",
      );
    if (res.status === 403)
      throw new GhlError(
        "The token is missing a permission (403). It needs contacts.readonly and opportunities.readonly.",
        "scope",
      );
    if (res.status === 404)
      throw new GhlError("GoHighLevel couldn't find that location (404).", "not_found");
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after"));
      throw new GhlError(
        "GoHighLevel's rate limit was hit; waiting before the next page.",
        "rate_limit",
        Number.isFinite(retry) && retry > 0 ? retry : 10,
      );
    }
    if (!res.ok) throw new GhlError(`GoHighLevel returned ${res.status}.`, "server");
    return (await res.json()) as T;
  }

  async listContacts(cursor: GhlCursor, limit = GHL_PAGE_SIZE): Promise<GhlPage<GhlContact>> {
    const body = await this.get<{ contacts?: GhlContact[]; meta?: Meta }>("/contacts/", {
      locationId: this.locationId,
      limit,
      startAfterId: cursor?.startAfterId,
      startAfter: cursor?.startAfter,
    });
    const items = (body.contacts ?? []).filter((c) => typeof c?.id === "string");
    return {
      items,
      next: nextCursor(body.meta, items.length, limit),
      total: body.meta?.total ?? null,
    };
  }

  async getPipelines(): Promise<GhlPipeline[]> {
    const body = await this.get<{ pipelines?: { id?: string; name?: string; stages?: unknown }[] }>(
      "/opportunities/pipelines",
      { locationId: this.locationId },
    );
    return (body.pipelines ?? [])
      .filter(
        (p): p is { id: string; name?: string; stages?: unknown } => typeof p?.id === "string",
      )
      .map((p) => ({
        id: p.id,
        name: p.name ?? "Pipeline",
        stages: (Array.isArray(p.stages) ? (p.stages as GhlStage[]) : [])
          .filter((s) => typeof s?.id === "string")
          .map((s) => ({ id: s.id, name: s.name ?? "Stage", position: s.position }))
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      }));
  }

  async searchOpportunities(
    cursor: GhlCursor,
    limit = GHL_PAGE_SIZE,
  ): Promise<GhlPage<GhlOpportunity>> {
    const body = await this.get<{ opportunities?: GhlOpportunity[]; meta?: Meta }>(
      "/opportunities/search",
      {
        location_id: this.locationId,
        limit,
        startAfterId: cursor?.startAfterId,
        startAfter: cursor?.startAfter,
      },
    );
    const items = (body.opportunities ?? []).filter((o) => typeof o?.id === "string");
    return {
      items,
      next: nextCursor(body.meta, items.length, limit),
      total: body.meta?.total ?? null,
    };
  }
}

/**
 * Base URL: GHL's API, unless GHL_API_BASE is set — used only by the e2e tests
 * (a local mock). Ignored on Vercel so production always talks to GHL itself.
 */
export function ghlBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const override = env.GHL_API_BASE?.trim();
  if (override && !env.VERCEL_ENV) return override.replace(/\/$/, "");
  return GHL_BASE_URL;
}
