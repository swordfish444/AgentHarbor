interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
}

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <article className="panel metric-card">
      <p className="eyebrow">{label}</p>
      <h2>{value}</h2>
      <p className="muted">{detail}</p>
    </article>
  );
}
