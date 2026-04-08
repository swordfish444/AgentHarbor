"use client";

import { RouteErrorState } from "../components/route-error-state";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Dashboard"
      title="The fleet view could not be loaded"
      description="The dashboard hit a control-node or network error before the current screen could be rendered."
      reset={reset}
    />
  );
}
