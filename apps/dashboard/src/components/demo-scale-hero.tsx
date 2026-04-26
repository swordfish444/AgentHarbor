"use client";

import { useEffect, useRef, useState } from "react";

const FLEET_AGENTS_TARGET = 247;
const FLEET_SESSIONS_TARGET = 1103;
const COUNTUP_DURATION_MS = 1500;
const DRIFT_INTERVAL_MS = 8000;
const DRIFT_MAX_OFFSET = 50;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const formatNumber = (value: number) => value.toLocaleString("en-US");

const useCountUp = (target: number, durationMs: number) => {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      setValue(Math.round(easeOutCubic(progress) * target));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [durationMs, target]);

  return value;
};

const useDrift = (seed: number, enabled: boolean) => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      setOffset((current) => {
        const delta = Math.floor(Math.random() * 3) + 1;
        const next = current + delta;
        return next > DRIFT_MAX_OFFSET ? DRIFT_MAX_OFFSET : next;
      });
    }, DRIFT_INTERVAL_MS + Math.floor(Math.random() * 2000));

    return () => window.clearInterval(interval);
  }, [enabled, seed]);

  return offset;
};

export function DemoScaleHero() {
  const agents = useCountUp(FLEET_AGENTS_TARGET, COUNTUP_DURATION_MS);
  const sessions = useCountUp(FLEET_SESSIONS_TARGET, COUNTUP_DURATION_MS);
  const countupDone = agents === FLEET_AGENTS_TARGET && sessions === FLEET_SESSIONS_TARGET;
  const agentDrift = useDrift(FLEET_AGENTS_TARGET, countupDone);
  const sessionDrift = useDrift(FLEET_SESSIONS_TARGET, countupDone);

  return (
    <section aria-label="Demo fleet scale" className="demo-scale-hero">
      <div className="demo-scale-stat">
        <strong className="demo-scale-number">{formatNumber(agents + agentDrift)}</strong>
        <span className="demo-scale-label">agents in fleet</span>
      </div>
      <span className="demo-scale-divider" aria-hidden="true">·</span>
      <div className="demo-scale-stat">
        <strong className="demo-scale-number">{formatNumber(sessions + sessionDrift * 4)}</strong>
        <span className="demo-scale-label">sessions today</span>
      </div>
    </section>
  );
}
