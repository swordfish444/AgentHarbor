import { notFound } from "next/navigation";
import { AgentDetailScreen } from "../../../components/agent-detail-screen";
import { getDashboardData } from "../../../lib/control-node";
import { buildDemoPlaybackDashboardData, isKnownDemoRunner, resolveDemoPlaybackState } from "../../../lib/demo-mode";

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const nowMs = Date.now();
  const demoState = resolveDemoPlaybackState(resolvedSearchParams, nowMs);
  const renderedAt = new Date(nowMs).toISOString();

  if (demoState) {
    if (!isKnownDemoRunner(id)) {
      notFound();
    }

    return (
      <main className="shell">
        <AgentDetailScreen
          agentId={id}
          initialData={buildDemoPlaybackDashboardData(nowMs, demoState.demoStart, demoState.demoAnchor)}
          initialDemoEnabled
          initialDemoStart={demoState.demoStart}
          initialDemoAnchor={demoState.demoAnchor}
          initialDemoResolved={demoState.demoResolved ?? null}
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
