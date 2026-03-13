import { Agent } from "undici";
import { ensureTrailingSlashlessUrl } from "@agentharbor/config";

export type HttpMethod = "GET" | "POST";

export interface TransportRequest {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  token?: string;
}

export interface ControlPlaneTransport {
  request<TResponse>(request: TransportRequest): Promise<TResponse>;
}

export interface HttpControlPlaneTransportOptions {
  baseUrl: string;
  allowSelfSigned?: boolean;
}

export class HttpControlPlaneTransport implements ControlPlaneTransport {
  private readonly baseUrl: string;

  private readonly dispatcher?: Agent;

  constructor(options: HttpControlPlaneTransportOptions) {
    this.baseUrl = ensureTrailingSlashlessUrl(options.baseUrl);
    this.dispatcher = options.allowSelfSigned ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  }

  async request<TResponse>({ path, method = "GET", body, token }: TransportRequest): Promise<TResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      dispatcher: this.dispatcher,
    } as RequestInit & { dispatcher?: Agent });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`AgentHarbor request failed (${response.status}): ${message}`);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }
}
