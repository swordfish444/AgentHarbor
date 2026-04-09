export interface StreamMetadata {
  emittedAt: string;
  type: string;
}

export const parseStreamMetadata = (
  rawPayload: string,
  fallbackType: string,
  now: () => string = () => new Date().toISOString(),
): StreamMetadata => {
  try {
    const payload = JSON.parse(rawPayload) as { emittedAt?: string; type?: string };
    return {
      emittedAt: typeof payload.emittedAt === "string" ? payload.emittedAt : now(),
      type: typeof payload.type === "string" ? payload.type : fallbackType,
    };
  } catch {
    return {
      emittedAt: now(),
      type: fallbackType,
    };
  }
};
