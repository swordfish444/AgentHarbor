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

export const formatRelativeTime = (value: string | null | undefined, now = Date.now()) => {
  if (!value) {
    return "No recent signal";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return value;
  }

  const deltaMs = Math.max(0, now - timestamp);
  const deltaSeconds = Math.round(deltaMs / 1_000);

  if (deltaSeconds < 10) {
    return "Just now";
  }

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
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

export const humanizeCategory = (category: string | null | undefined, fallback = "Uncategorized") =>
  category
    ? category
        .split("-")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ")
    : fallback;

export const humanizeAgentType = (agentType: string | null | undefined, fallback = "Unknown") =>
  humanizeCategory(agentType, fallback);
