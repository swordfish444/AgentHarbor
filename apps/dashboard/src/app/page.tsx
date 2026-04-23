import { DashboardScreen } from "../components/dashboard-screen";
import { buildRunnerFilterOptions, getDashboardData } from "../lib/control-node";
import { buildDemoPlaybackDashboardData, resolveDemoPlaybackState } from "../lib/demo-mode";
import { normalizeDashboardQuery } from "../lib/dashboard-query";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nowMs = Date.now();
  const demoState = resolveDemoPlaybackState(resolvedSearchParams, nowMs);
  const query = demoState ? {} : normalizeDashboardQuery(resolvedSearchParams);

  if (demoState) {
    const demoData = buildDemoPlaybackDashboardData(nowMs, demoState.demoStart, demoState.demoAnchor);

    return (
      <main className="shell">
        <DashboardScreen data={demoData} demoState={demoState} filterOptions={buildRunnerFilterOptions(demoData.runners)} query={query} />
      </main>
    );
  }

  const { data, filterOptions } = await getDashboardData(query);

  return (
    <main className="shell">
      <DashboardScreen data={data} filterOptions={filterOptions} query={query} />
    </main>
  );
}
