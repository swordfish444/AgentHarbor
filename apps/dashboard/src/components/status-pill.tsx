export function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill status-${status.replace(/\s+/g, "-").toLowerCase()}`}>{status}</span>;
}
