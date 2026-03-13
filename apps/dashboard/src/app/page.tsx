import { LiveServiceMap } from "../components/live-service-map";
import { getDashboardData } from "../lib/control-node";

export default async function HomePage() {
  return <LiveServiceMap data={await getDashboardData()} />;
}
