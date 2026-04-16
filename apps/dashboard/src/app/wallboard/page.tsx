import { WallboardScreen } from "../../components/wallboard-screen";
import { getDashboardData } from "../../lib/control-node";

export default async function WallboardPage() {
  const { data } = await getDashboardData({});

  return (
    <main className="shell">
      <WallboardScreen data={data} />
    </main>
  );
}
