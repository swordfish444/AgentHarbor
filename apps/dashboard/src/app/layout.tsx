import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoHotkeys } from "../components/demo-hotkeys";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentHarbor",
  description: "Control-tower observability for distributed AI coding agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <DemoHotkeys />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
