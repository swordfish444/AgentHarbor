import { WallboardScreen } from "../../components/wallboard-screen";
import { getDashboardData } from "../../lib/control-node";
import { buildDemoDashboardData, createDemoStartValue } from "../../lib/demo-mode";

export default async function WallboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const demoEnabled = resolvedSearchParams.demo === "1";
  const demoStartParam = typeof resolvedSearchParams.demoStart === "string" ? Number(resolvedSearchParams.demoStart) : null;
  const demoStart = demoEnabled ? (demoStartParam && Number.isFinite(demoStartParam) ? demoStartParam : createDemoStartValue()) : null;
  const renderedAt = new Date().toISOString();
  const data = demoEnabled && demoStart != null ? buildDemoDashboardData(Date.now(), demoStart) : (await getDashboardData({})).data;

  return (
    <main className="shell">
      <WallboardScreen data={data} initialDemoEnabled={demoEnabled} initialDemoStart={demoStart} renderedAt={renderedAt} />
    </main>
  );
}
