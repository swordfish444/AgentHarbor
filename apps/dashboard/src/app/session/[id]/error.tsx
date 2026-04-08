"use client";

import { RouteErrorState } from "../../../components/route-error-state";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Session Detail"
      title="The session drilldown could not be loaded"
      description="The control node returned an error while loading this session. Retry once the backend is reachable again."
      reset={reset}
    />
  );
}
