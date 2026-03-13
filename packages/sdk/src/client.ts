import {
  EventListItem,
  HeartbeatRequest,
  RunnerEnrollmentRequest,
  RunnerEnrollmentResponse,
  RunnerListItem,
  SessionDetail,
  SessionListItem,
  StatsResponse,
  TelemetryEventEnvelope,
  telemetryIngestRequestSchema,
} from "@agentharbor/shared";
import { ControlPlaneTransport, HttpControlPlaneTransport, HttpControlPlaneTransportOptions } from "./transport.js";

export interface AgentHarborClientOptions extends HttpControlPlaneTransportOptions {
  runnerToken?: string;
}

export class AgentHarborClient {
  private readonly transport: ControlPlaneTransport;

  private readonly runnerToken?: string;

  constructor(options: AgentHarborClientOptions | { transport: ControlPlaneTransport; runnerToken?: string }) {
    if ("transport" in options) {
      this.transport = options.transport;
      this.runnerToken = options.runnerToken;
      return;
    }

    this.transport = new HttpControlPlaneTransport(options);
    this.runnerToken = options.runnerToken;
  }

  enrollRunner(payload: RunnerEnrollmentRequest) {
    return this.transport.request<RunnerEnrollmentResponse>({
      path: "/v1/enroll",
      method: "POST",
      body: payload,
    });
  }

  sendHeartbeat(payload: HeartbeatRequest, token = this.runnerToken) {
    return this.transport.request<{ ok: true }>({
      path: "/v1/heartbeat",
      method: "POST",
      body: payload,
      token,
    });
  }

  sendTelemetryEvent(event: TelemetryEventEnvelope, token = this.runnerToken) {
    return this.sendTelemetryBatch([event], token);
  }

  sendTelemetryBatch(events: TelemetryEventEnvelope[], token = this.runnerToken) {
    const payload = telemetryIngestRequestSchema.parse({ events });
    return this.transport.request<{ accepted: number }>({
      path: "/v1/telemetry",
      method: "POST",
      body: payload,
      token,
    });
  }

  startSession(event: TelemetryEventEnvelope, token = this.runnerToken) {
    return this.sendTelemetryEvent(event, token);
  }

  completeSession(event: TelemetryEventEnvelope, token = this.runnerToken) {
    return this.sendTelemetryEvent(event, token);
  }

  listRunners() {
    return this.transport.request<RunnerListItem[]>({ path: "/v1/runners" });
  }

  listSessions() {
    return this.transport.request<SessionListItem[]>({ path: "/v1/sessions" });
  }

  getSession(id: string) {
    return this.transport.request<SessionDetail>({ path: `/v1/sessions/${id}` });
  }

  listEvents() {
    return this.transport.request<EventListItem[]>({ path: "/v1/events" });
  }

  getStats() {
    return this.transport.request<StatsResponse>({ path: "/v1/stats" });
  }
}
