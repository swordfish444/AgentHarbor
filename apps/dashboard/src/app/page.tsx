import { DashboardScreen } from "../components/dashboard-screen";
import { buildRunnerFilterOptions, getDashboardData } from "../lib/control-node";
import { buildDemoDashboardData, createDemoStartValue } from "../lib/demo-mode";
import { normalizeDashboardQuery } from "../lib/dashboard-query";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const demoEnabled = resolvedSearchParams.demo === "1";
  const demoStartParam = typeof resolvedSearchParams.demoStart === "string" ? Number(resolvedSearchParams.demoStart) : null;
  const demoStart = demoEnabled ? (demoStartParam && Number.isFinite(demoStartParam) ? demoStartParam : createDemoStartValue()) : null;
  const query = demoEnabled ? {} : normalizeDashboardQuery(resolvedSearchParams);

  if (demoEnabled && demoStart != null) {
    const demoData = buildDemoDashboardData(Date.now(), demoStart);

    return (
      <main className="shell">
        <DashboardScreen data={demoData} demoState={{ demoStart }} filterOptions={buildRunnerFilterOptions(demoData.runners)} query={query} />
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
