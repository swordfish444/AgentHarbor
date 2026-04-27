import type { DashboardData } from "../lib/control-node";
import { OperatorConsole } from "./operator-console";

export function WallboardScreen({
  data,
  renderedAt,
  initialDemoEnabled = false,
  initialDemoStart = null,
  initialDemoAnchor = null,
  initialDemoResolved = null,
  initialDemoSpeed = null,
  initialDemoPaused = false,
}: {
  data: DashboardData;
  renderedAt: string;
  initialDemoEnabled?: boolean;
  initialDemoStart?: number | null;
  initialDemoAnchor?: number | null;
  initialDemoResolved?: string | null;
  initialDemoSpeed?: number | null;
  initialDemoPaused?: boolean;
}) {
  return (
    <OperatorConsole
      initialData={data}
      initialDemoEnabled={initialDemoEnabled}
      initialDemoStart={initialDemoStart}
      initialDemoAnchor={initialDemoAnchor}
      initialDemoResolved={initialDemoResolved}
      initialDemoSpeed={initialDemoSpeed}
      initialDemoPaused={initialDemoPaused}
      renderedAt={renderedAt}
    />
  );
}
