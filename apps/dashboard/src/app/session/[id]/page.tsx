import { notFound } from "next/navigation";
import { SessionEventBreakdown } from "../../../components/session-event-breakdown";
import { SessionFailurePanel } from "../../../components/session-failure-panel";
import { SessionHero } from "../../../components/session-hero";
import { SessionRawEvents } from "../../../components/session-raw-events";
import { SessionSummaryCards } from "../../../components/session-summary-cards";
import { SessionTimeline } from "../../../components/session-timeline";
import { ControlNodeRequestError, getSessionDetail } from "../../../lib/control-node";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const session = await getSessionDetail(id);

    return (
      <main className="shell">
        <SessionHero session={session} />

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
