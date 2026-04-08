import { RouteLoadingState } from "../../../components/route-loading-state";

export default function Loading() {
  return (
    <RouteLoadingState
      eyebrow="Session Detail"
      title="Loading session drilldown"
      description="The dashboard is retrieving the selected session timeline and failure context from the control node."
    />
  );
}
