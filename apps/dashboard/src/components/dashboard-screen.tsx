import type { DashboardData } from "../lib/control-node";
import { OperatorConsole } from "./operator-console";

export function DashboardScreen({ data }: { data: DashboardData }) {
  return <OperatorConsole initialData={data} renderedAt={new Date().toISOString()} />;
}
