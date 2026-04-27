"use client";

import { demoCycleMs, demoPrimaryIncidentSessionId } from "@agentharbor/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const DEFAULT_SPEED = 5;
const SPEED_KEY_BINDINGS: Array<[string, number]> = [
  ["1", 1],
  ["2", 2],
  ["3", 5],
  ["4", 10],
  ["5", 25],
];

const HOTKEY_BINDINGS: Array<[string, string]> = [
  ["R", "Reset playback to the start of the cycle"],
  ["I", "Jump to the primary incident (SS-406)"],
  ["1 / 2 / 3 / 4 / 5", "Set playback speed (1x / 2x / 5x / 10x / 25x)"],
  ["Space", "Skip the 3-second remedy delay"],
  ["?", "Toggle this help overlay"],
  ["Esc", "Close this overlay"],
];

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

const cycleOffset = (timestampMs: number, demoStartMs: number) => {
  const offset = (timestampMs - demoStartMs) % demoCycleMs;
  return offset >= 0 ? offset : offset + demoCycleMs;
};

const parseFiniteNumber = (value: string | null): number | null => {
  if (value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildResetSearch = (nowMs: number) =>
  `demo=1&demoStart=${nowMs}&demoAnchor=${nowMs}&demoSpeed=${DEFAULT_SPEED}`;

const preserveDemoParams = (search: URLSearchParams, overrides: Record<string, string | null>) => {
  const next = new URLSearchParams();
  next.set("demo", "1");

  for (const key of ["demoStart", "demoAnchor", "demoResolved", "demoSpeed"]) {
    const incoming = search.get(key);
    if (incoming != null) {
      next.set(key, incoming);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }

  return next.toString();
};

const buildSpeedChangeSearch = (search: URLSearchParams, newSpeed: number, nowMs: number) => {
  const oldDemoStart = parseFiniteNumber(search.get("demoStart")) ?? nowMs;
  const oldAnchor = parseFiniteNumber(search.get("demoAnchor")) ?? nowMs;
  const oldSpeed = parseFiniteNumber(search.get("demoSpeed")) ?? DEFAULT_SPEED;
  const initialOffset = cycleOffset(oldAnchor, oldDemoStart);
  const elapsed = Math.max(0, nowMs - oldAnchor);
  const currentOffset = (initialOffset + elapsed * oldSpeed) % demoCycleMs;
  const newDemoStart = nowMs - currentOffset;

  return preserveDemoParams(search, {
    demoStart: String(newDemoStart),
    demoAnchor: String(nowMs),
    demoSpeed: String(newSpeed),
  });
};

export function DemoHotkeys() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [helpOpen, setHelpOpen] = useState(false);

  const isDemoMode = searchParams?.get("demo") === "1";

  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useEffect(() => {
    if (!isDemoMode) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key;

      if (key === "?") {
        event.preventDefault();
        setHelpOpen((current) => !current);
        return;
      }

      if (key === "Escape") {
        if (helpOpen) {
          event.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      if (key === " ") {
        window.dispatchEvent(new CustomEvent("demo:skip-remedy"));
        return;
      }

      if (key === "r" || key === "R") {
        event.preventDefault();
        const nowMs = Date.now();
        router.push(`${pathname ?? "/"}?${buildResetSearch(nowMs)}`);
        return;
      }

      if (key === "i" || key === "I") {
        event.preventDefault();
        const next = preserveDemoParams(new URLSearchParams(searchParams?.toString() ?? ""), {});
        router.push(`/session/${demoPrimaryIncidentSessionId}?${next}`);
        return;
      }

      const speedBinding = SPEED_KEY_BINDINGS.find(([candidate]) => candidate === key);
      if (speedBinding) {
        event.preventDefault();
        const [, newSpeed] = speedBinding;
        const nowMs = Date.now();
        const next = buildSpeedChangeSearch(new URLSearchParams(searchParams?.toString() ?? ""), newSpeed, nowMs);
        router.push(`${pathname ?? "/"}?${next}`);
        return;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [helpOpen, isDemoMode, pathname, router, searchParams]);

  if (!isDemoMode || !helpOpen) {
    return null;
  }

  return (
    <div className="demo-hotkeys-overlay" onClick={closeHelp} role="presentation">
      <div className="demo-hotkeys-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Demo hotkeys">
        <div className="demo-hotkeys-header">
          <p className="eyebrow">Demo controls</p>
          <button className="demo-hotkeys-close" onClick={closeHelp} type="button" aria-label="Close hotkeys">
            ×
          </button>
        </div>
        <ul className="demo-hotkeys-list">
          {HOTKEY_BINDINGS.map(([key, description]) => (
            <li key={key}>
              <kbd>{key}</kbd>
              <span>{description}</span>
            </li>
          ))}
        </ul>
        <p className="demo-hotkeys-footer">Run <code>pnpm demo:burst</code> from the terminal to inject live activity.</p>
      </div>
    </div>
  );
}
