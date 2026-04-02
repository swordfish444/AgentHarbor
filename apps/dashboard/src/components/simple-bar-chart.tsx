interface SimpleBarChartProps {
  points: Array<{
    label: string;
    value: number;
  }>;
}

export function SimpleBarChart({ points }: SimpleBarChartProps) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className="bar-chart">
      {points.map((point) => (
        <div className="bar-row" key={point.label}>
          <span className="bar-label">{point.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(point.value / maxValue) * 100}%` }} />
          </div>
          <strong>{point.value}</strong>
        </div>
      ))}
    </div>
  );
}
