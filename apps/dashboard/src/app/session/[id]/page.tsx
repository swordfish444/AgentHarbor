import { notFound } from "next/navigation";
import { SessionEventBreakdown } from "../../../components/session-event-breakdown";
import { SessionFailurePanel } from "../../../components/session-failure-panel";
import { SessionHero } from "../../../components/session-hero";
import { SessionRawEvents } from "../../../components/session-raw-events";
import { SessionSummaryCards } from "../../../components/session-summary-cards";
import { SessionTimeline } from "../../../components/session-timeline";
import { ControlNodeRequestError, getSessionDetail } from "../../../lib/control-node";
import {
  buildDemoPlaybackSessionDetail,
  buildDemoSearch,
  demoPrimaryIncidentSessionId,
  resolveDemoPlaybackState,
} from "../../../lib/demo-mode";

export default async function SessionDetailPage({
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

  if (demoState) {
    const effectiveDemoSpeed = demoState.demoPaused ? 0 : demoState.demoSpeed;
    const session = buildDemoPlaybackSessionDetail(id, nowMs, demoState.demoStart, demoState.demoAnchor, effectiveDemoSpeed);
    const demoSearch = buildDemoSearch(demoState);

    if (!session) {
      notFound();
    }

    const backHref =
      demoState.demoResolved === demoPrimaryIncidentSessionId
        ? `/wallboard${demoSearch}`
        : `/agents/${session.runnerId}${demoSearch}`;

    return (
      <main className="shell">
        <SessionHero session={session} backHref={backHref} />

        <section className="detail-layout">
          <div className="detail-sidebar-stack">
            <SessionSummaryCards session={session} />
            <SessionFailurePanel
              session={session}
              routeSearch={buildDemoSearch({
                ...demoState,
                demoResolved: session.id,
              })}
            />
            <SessionEventBreakdown session={session} />
          </div>
          <SessionTimeline events={session.events} />
        </section>

        <SessionRawEvents events={session.events} />
      </main>
    );
  }

  try {
    const session = await getSessionDetail(id);

    return (
      <main className="shell">
        <SessionHero session={session} backHref={`/agents/${session.runnerId}`} />

        <section className="detail-layout">
          <div className="detail-sidebar-stack">
            <SessionSummaryCards session={session} />
            <SessionFailurePanel session={session} />
            <SessionEventBreakdown session={session} />
          </div>
          <SessionTimeline events={session.events} />
        </section>

        <SessionRawEvents events={session.events} />
      </main>
    );
  } catch (error) {
    if (error instanceof ControlNodeRequestError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
