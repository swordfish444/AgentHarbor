import { Agent } from "undici";
import { ensureTrailingSlashlessUrl, parseBoolean } from "@agentharbor/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const baseUrl = ensureTrailingSlashlessUrl(process.env.AGENTHARBOR_CONTROL_NODE_URL ?? "https://localhost:8443");
const allowSelfSigned = parseBoolean(process.env.AGENTHARBOR_ALLOW_SELF_SIGNED, true);
const dispatcher = allowSelfSigned ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

export async function GET(request: Request) {
  const response = await fetch(`${baseUrl}/v1/stream/events`, {
    cache: "no-store",
    dispatcher,
    signal: request.signal,
  } as RequestInit & { dispatcher?: Agent });

  if (!response.ok || !response.body) {
    return new Response("Control node event stream unavailable", {
      status: response.status,
    });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
