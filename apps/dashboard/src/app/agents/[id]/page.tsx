import { notFound } from "next/navigation";
import { AgentDetailScreen } from "../../../components/agent-detail-screen";
import { getDashboardData } from "../../../lib/control-node";
import { buildDemoDashboardData, createDemoStartValue, isKnownDemoRunner } from "../../../lib/demo-mode";

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const demoEnabled = resolvedSearchParams.demo === "1";
  const demoStartParam = typeof resolvedSearchParams.demoStart === "string" ? Number(resolvedSearchParams.demoStart) : null;
  const demoStart = demoEnabled && demoStartParam && Number.isFinite(demoStartParam) ? demoStartParam : createDemoStartValue();
  const renderedAt = new Date().toISOString();

  if (demoEnabled) {
    if (!isKnownDemoRunner(id)) {
      notFound();
    }

    return (
      <main className="shell">
        <AgentDetailScreen
          agentId={id}
          initialData={buildDemoDashboardData(Date.now(), demoStart)}
          initialDemoEnabled
          initialDemoStart={demoStart}
          renderedAt={renderedAt}
        />
      </main>
    );
  }

  const { data } = await getDashboardData({ runnerId: id });
  const runnerFound = data.runners.some((runner) => runner.id === id) || data.sessions.some((session) => session.runnerId === id);

  if (!runnerFound) {
    notFound();
  }

  return (
    <main className="shell">
      <AgentDetailScreen agentId={id} initialData={data} renderedAt={renderedAt} />
    </main>
  );
}
