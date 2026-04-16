import type { DashboardData } from "../lib/control-node";
import { OperatorConsole } from "./operator-console";

export function WallboardScreen({
  data,
  renderedAt,
  initialDemoEnabled = false,
  initialDemoStart = null,
}: {
  data: DashboardData;
  renderedAt: string;
  initialDemoEnabled?: boolean;
  initialDemoStart?: number | null;
}) {
  return (
    <OperatorConsole
      initialData={data}
      initialDemoEnabled={initialDemoEnabled}
      initialDemoStart={initialDemoStart}
      renderedAt={renderedAt}
    />
  );
}
