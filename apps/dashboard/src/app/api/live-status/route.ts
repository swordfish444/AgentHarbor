import { NextResponse } from "next/server";
import { getDashboardLiveStatus, isControlNodeRequestError } from "../../../lib/control-node";
import { normalizeDashboardQuery } from "../../../lib/dashboard-query";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = normalizeDashboardQuery(Object.fromEntries(url.searchParams.entries()));

  try {
    const status = await getDashboardLiveStatus(query);
    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Control node polling failed.";
    const status = isControlNodeRequestError(error) ? error.status : 503;

    return NextResponse.json(
      {
        message,
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
