import { RouteLoadingState } from "../components/route-loading-state";

export default function Loading() {
  return (
    <RouteLoadingState
      eyebrow="Dashboard"
      title="Loading the fleet view"
      description="The dashboard is gathering the latest stats, alerts, sessions, and telemetry from the control node."
    />
  );
}
