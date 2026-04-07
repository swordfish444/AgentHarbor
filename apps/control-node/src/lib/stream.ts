import type { StreamEvent, StreamEventType } from "@agentharbor/shared";

type StreamListener = (event: StreamEvent) => void;

const listeners = new Set<StreamListener>();
let streamEventSequence = 0;

const nextStreamEventId = () => `${Date.now()}-${(streamEventSequence += 1)}`;

export const publishStreamEvent = (type: StreamEventType, data: unknown) => {
  const event: StreamEvent = {
    id: nextStreamEventId(),
    type,
    emittedAt: new Date().toISOString(),
    data,
  };

  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      listeners.delete(listener);
    }
  }

  return event;
};

export const subscribeStream = (listener: StreamListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const formatServerSentEvent = (event: StreamEvent) =>
  `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
