import { DashboardScreen } from "../components/dashboard-screen";
import { getDashboardData } from "../lib/control-node";
import { normalizeDashboardQuery } from "../lib/dashboard-query";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = normalizeDashboardQuery(await searchParams);
  const { data, filterOptions } = await getDashboardData(query);

  return (
    <main className="shell">
      <DashboardScreen data={data} filterOptions={filterOptions} query={query} />
    </main>
  );
}
