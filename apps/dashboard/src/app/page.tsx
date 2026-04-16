import { DashboardScreen } from "../components/dashboard-screen";
import { getDashboardData } from "../lib/control-node";

export default async function HomePage() {
  const { data } = await getDashboardData({});

  return (
    <main className="shell">
      <DashboardScreen data={data} />
    </main>
  );
}
