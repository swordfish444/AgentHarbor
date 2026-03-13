import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentHarbor",
  description: "Control-tower observability for distributed AI coding agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
