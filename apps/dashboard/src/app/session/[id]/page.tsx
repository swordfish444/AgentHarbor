import { notFound } from "next/navigation";
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
          <SessionSummaryCards session={session} />
          <SessionTimeline events={session.events} />
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
