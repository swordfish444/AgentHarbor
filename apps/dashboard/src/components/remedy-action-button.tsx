"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function RemedyActionButton({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const [isApplying, setIsApplying] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isApplying) {
      return;
    }

    const handleSkip = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      router.push(href);
    };

    window.addEventListener("demo:skip-remedy", handleSkip);
    return () => window.removeEventListener("demo:skip-remedy", handleSkip);
  }, [href, isApplying, router]);

  const handleClick = () => {
    if (isApplying) {
      return;
    }

    setIsApplying(true);
    timeoutRef.current = setTimeout(() => {
      router.push(href);
    }, 3_000);
  };

  return (
    <div className="remedy-action-button-wrapper">
      <button aria-busy={isApplying} className="remedy-action-button" disabled={isApplying} onClick={handleClick} type="button">
        {isApplying ? (
          <>
            <span aria-hidden="true" className="remedy-spinner" />
            Applying...
          </>
        ) : (
          label
        )}
      </button>
      {isApplying ? <span className="remedy-skip-hint">Press Space to skip the delay</span> : null}
    </div>
  );
}
