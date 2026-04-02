export const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const formatTime = (value: string | null | undefined) => {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
  }).format(date);
};

export const formatDurationMs = (value: number | null | undefined, fallback = "Running") => {
  if (value == null) {
    return fallback;
  }

  if (value < 1_000) {
    return `${value}ms`;
  }

  const totalSeconds = Math.round(value / 1_000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

export const formatInteger = (value: number | null | undefined, fallback = "0") => {
  if (value == null) {
    return fallback;
  }

  return new Intl.NumberFormat("en-US").format(value);
};

export const formatTokenUsage = (value: number | null | undefined) =>
  value == null ? "No token usage reported" : `${formatInteger(value)} tokens`;

export const humanizeEventType = (eventType: string) =>
  eventType
    .split(".")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" / ");
