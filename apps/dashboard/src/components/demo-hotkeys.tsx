"use client";

import { demoPrimaryIncidentSessionId } from "@agentharbor/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const HOTKEY_BINDINGS: Array<[string, string]> = [
  ["R", "Reset playback to the start of the cycle"],
  ["I", "Jump to the primary incident (SS-406)"],
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

const buildResetSearch = (nowMs: number) =>
  `demo=1&demoStart=${nowMs}&demoAnchor=${nowMs}`;

const preserveDemoParams = (search: URLSearchParams, overrides: Record<string, string | null>) => {
  const next = new URLSearchParams();
  next.set("demo", "1");

  for (const key of ["demoStart", "demoAnchor", "demoResolved"]) {
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
