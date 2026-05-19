import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

const base = () =>
  getBackendBaseURL() ? `${getBackendBaseURL()}/api/training` : "/training-api";
const TRAINING_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: { timeoutMs?: number | null },
): Promise<T> {
  const controller = init?.signal ? null : new AbortController();
  const timeoutMs = options?.timeoutMs ?? TRAINING_REQUEST_TIMEOUT_MS;
  const timeoutId =
    controller && timeoutMs
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
  try {
    const res = await fetch(`${base()}${path}`, {
      ...init,
      signal: init?.signal ?? controller?.signal,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Training API failed: ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("训练请求超过 10 分钟未完成，请稍后重试。");
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

export type TrainingRoleType = "customer" | "agent";
export type TrainingSpeakerType = "customer" | "agent";

export interface TrainingRole {
  id: string;
  role_type: TrainingRoleType;
  name: string;
  description: string;
  summary: string;
  structured_profile: Record<string, unknown>;
  tags: string[];
  avatar_url?: string | null;
  version: number;
  updated_at?: string;
}

export interface TrainingScenario {
  id: string;
  name: string;
  description: string;
  summary: string;
  sales_stage: string;
  product_type: string;
  difficulty: string;
  recommended_turns: number;
  structured_scenario: Record<string, unknown>;
}

export interface TrainingMessage {
  id: string;
  session_id: string;
  speaker_type: TrainingSpeakerType;
  content: string;
  turn_index: number;
  created_at?: string;
}

export interface TrainingSimulation {
  id: string;
  customer_role_id: string;
  agent_role_id: string;
  scenario_id: string;
  status: string;
  max_turns: number;
  current_turn: number;
  summary?: string;
  messages?: TrainingMessage[];
  reports?: TrainingReport[];
}

export interface TrainingReport {
  id: string;
  session_id: string;
  summary: string;
  report: {
    scores?: Record<string, number>;
    strengths?: string[];
    weaknesses?: string[];
    customer_reactions?: string[];
    good_phrases?: string[];
    bad_phrases?: string[];
    next_training_advice?: string[];
    compliance_risks?: string[];
  };
  customer_profile_suggestions: Record<string, unknown>;
  agent_profile_upgrade_suggestions: Record<string, unknown>;
}

export interface RevisionPreview {
  role_id: string;
  role_name?: string;
  revision_type?: "customer_refinement" | "agent_upgrade";
  suggestions?: Record<string, unknown>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  diff: Record<string, unknown>;
  change_reason: string;
}

export interface TrainingCustomModelConfig {
  provider?: "deepseek_compatible";
  display_name?: string;
  model?: string;
  base_url?: string;
  api_key?: string;
  temperature?: number;
  max_tokens?: number;
  request_timeout?: number;
}

export interface TrainingModelOverride {
  model_name?: string;
  custom_model?: TrainingCustomModelConfig;
}

export const trainingApi = {
  roles: (roleType?: TrainingRoleType) =>
    request<TrainingRole[]>(
      roleType ? `/roles?role_type=${roleType}` : "/roles",
    ),
  parseRole: (body: {
    role_type: TrainingRoleType;
    name: string;
    description: string;
    basic_fields?: Record<string, unknown>;
    model_name?: string;
    training_model?: TrainingModelOverride;
  }) =>
    request<{
      name?: string;
      detected_role_type?: TrainingRoleType;
      summary: string;
      structured_profile: Record<string, unknown>;
      tags: string[];
      suggestions?: string[];
      raw_text?: string;
      parse_error?: string;
    }>("/roles/parse", { method: "POST", body: JSON.stringify(body) }),
  createRole: (body: Omit<TrainingRole, "id" | "version" | "updated_at">) =>
    request<TrainingRole>("/roles", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRole: (id: string) => request<TrainingRole>(`/roles/${id}`),
  updateRole: (
    id: string,
    body: Omit<TrainingRole, "id" | "version" | "updated_at">,
  ) =>
    request<TrainingRole>(`/roles/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteRole: (id: string) =>
    request<{ success: boolean }>(`/roles/${id}`, { method: "DELETE" }),
  scenarios: () => request<TrainingScenario[]>("/scenarios"),
  parseScenario: (body: {
    name: string;
    description: string;
    basic_fields?: Record<string, unknown>;
    model_name?: string;
    training_model?: TrainingModelOverride;
  }) =>
    request<{
      summary: string;
      sales_stage: string;
      product_type: string;
      difficulty: string;
      recommended_turns: number;
      structured_scenario: Record<string, unknown>;
      parse_error?: string;
    }>("/scenarios/parse", { method: "POST", body: JSON.stringify(body) }),
  createScenario: (body: Omit<TrainingScenario, "id">) =>
    request<TrainingScenario>("/scenarios", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getScenario: (id: string) => request<TrainingScenario>(`/scenarios/${id}`),
  updateScenario: (id: string, body: Omit<TrainingScenario, "id">) =>
    request<TrainingScenario>(`/scenarios/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteScenario: (id: string) =>
    request<{ success: boolean }>(`/scenarios/${id}`, { method: "DELETE" }),
  simulations: () => request<TrainingSimulation[]>("/simulations"),
  deleteSimulation: (id: string) =>
    request<{ success: boolean }>(`/simulations/${id}`, { method: "DELETE" }),
  createSimulation: (body: {
    customer_role_id: string;
    agent_role_id: string;
    scenario_id: string;
    max_turns: number;
    model_name?: string;
    training_model?: TrainingModelOverride;
  }) =>
    request<TrainingSimulation>("/simulations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  runSimulation: (id: string, trainingModel?: TrainingModelOverride) =>
    request<{
      session_id: string;
      status: string;
      messages: TrainingMessage[];
    }>(`/simulations/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ mode: "auto", training_model: trainingModel }),
    }),
  nextTurn: (id: string, trainingModel?: TrainingModelOverride) =>
    request<{
      message: TrainingMessage;
      session_status: string;
      session: TrainingSimulation;
    }>(`/simulations/${id}/next-turn`, {
      method: "POST",
      body: JSON.stringify({ training_model: trainingModel }),
    }),
  humanTurn: (
    id: string,
    content: string,
    trainingModel?: TrainingModelOverride,
    speakerType: TrainingSpeakerType = "agent",
    allowPastMaxTurns = false,
  ) =>
    request<{
      human_message: TrainingMessage;
      customer_message: TrainingMessage | null;
      ai_message?: TrainingMessage | null;
      session_status: string;
      session: TrainingSimulation;
    }>(`/simulations/${id}/human-turn`, {
      method: "POST",
      body: JSON.stringify({
        content,
        speaker_type: speakerType,
        allow_past_max_turns: allowPastMaxTurns,
        training_model: trainingModel,
      }),
    }),
  getSimulation: (id: string) =>
    request<TrainingSimulation>(`/simulations/${id}`),
  createReview: (id: string, trainingModel?: TrainingModelOverride) =>
    request<TrainingReport>(
      `/simulations/${id}/review`,
      {
        method: "POST",
        body: JSON.stringify({ training_model: trainingModel }),
      },
      { timeoutMs: null },
    ),
  revisionPreview: (
    reportId: string,
    body: {
      role_id: string;
      revision_type: "customer_refinement" | "agent_upgrade";
    },
  ) =>
    request<RevisionPreview>(`/reports/${reportId}/revision-preview`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  applyRevision: (body: {
    role_id: string;
    source_session_id?: string;
    source_report_id?: string;
    change_type: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    diff: Record<string, unknown>;
  }) =>
    request<{ revision_id: string; role_id: string; new_version: number }>(
      "/profile-revisions",
      { method: "POST", body: JSON.stringify(body) },
    ),
};
