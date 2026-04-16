import { getDashboardData } from "../../../lib/control-node";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { data } = await getDashboardData({});

  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
