import { randomUUID } from "node:crypto";
import { streamEventEnvelopeSchema, type StreamEventEnvelope } from "@agentharbor/shared";

type Listener = (event: StreamEventEnvelope) => void;

class EventBroadcaster {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: Omit<StreamEventEnvelope, "id">) {
    const envelope = streamEventEnvelopeSchema.parse({
      id: randomUUID(),
      ...event,
    });

    for (const listener of this.listeners) {
      listener(envelope);
    }
  }
}

export const eventBroadcaster = new EventBroadcaster();
