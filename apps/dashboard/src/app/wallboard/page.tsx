import { WallboardScreen } from "../../components/wallboard-screen";
import { getDashboardData } from "../../lib/control-node";
import { buildDemoPlaybackDashboardData, resolveDemoPlaybackState } from "../../lib/demo-mode";

export default async function WallboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nowMs = Date.now();
  const demoState = resolveDemoPlaybackState(resolvedSearchParams, nowMs);
  const renderedAt = new Date(nowMs).toISOString();
  const data = demoState ? buildDemoPlaybackDashboardData(nowMs, demoState.demoStart, demoState.demoAnchor) : (await getDashboardData({})).data;

  return (
    <main className="shell">
      <WallboardScreen
        data={data}
        initialDemoEnabled={demoState != null}
        initialDemoStart={demoState?.demoStart ?? null}
        initialDemoAnchor={demoState?.demoAnchor ?? null}
        initialDemoResolved={demoState?.demoResolved ?? null}
        renderedAt={renderedAt}
      />
    </main>
  );
}
