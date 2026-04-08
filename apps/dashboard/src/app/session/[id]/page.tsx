import { notFound } from "next/navigation";
import { SessionBreakdownCard } from "../../../components/session-breakdown-card";
import { SessionEventList } from "../../../components/session-event-list";
import { SessionFailureCard } from "../../../components/session-failure-card";
import { SessionHero } from "../../../components/session-hero";
import { SessionSummaryCards } from "../../../components/session-summary-cards";
import { SessionTimeline } from "../../../components/session-timeline";
import { getSessionDetail } from "../../../lib/control-node";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const session = await getSessionDetail(id);

    return (
      <main className="shell">
        <SessionHero session={session} />

        <section className="detail-layout">
          <div className="detail-column">
            <SessionFailureCard session={session} />
            <SessionSummaryCards session={session} />
            <SessionBreakdownCard session={session} />
          </div>
          <div className="detail-column">
            <SessionTimeline events={session.events} />
            <SessionEventList events={session.events} />
          </div>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
