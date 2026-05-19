"use client";

import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  BotIcon,
  FileTextIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  PlayIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalSettings } from "@/core/settings";
import {
  trainingApi,
  type RevisionPreview,
  type TrainingMessage,
  type TrainingReport,
  type TrainingRole,
  type TrainingRoleType,
  type TrainingScenario,
  type TrainingSpeakerType,
  type TrainingSimulation,
} from "@/core/training/api";
import { buildTrainingModelOverride } from "@/core/training/settings";
import { cn } from "@/lib/utils";

import {
  EmptyState,
  PageHeader,
  Panel,
  pretty,
  ReportList,
  RoleCard,
  ScenarioCard,
  SectionTitle,
  SelectedLine,
  showError,
} from "../training-components";

type PracticeMode = "ai_auto" | "user_as_agent" | "user_as_customer";

interface SimulationOptions {
  practiceMode: PracticeMode;
  minTurns: number;
}

const defaultSimulationOptions: SimulationOptions = {
  practiceMode: "user_as_agent",
  minTurns: 12,
};

const practiceModes: Array<{
  value: PracticeMode;
  title: string;
  description: string;
}> = [
  {
    value: "ai_auto",
    title: "AI 双方对话",
    description: "客户和代理人都由 AI 扮演，进入训练页后自动跑完整场。",
  },
  {
    value: "user_as_agent",
    title: "我扮演代理人",
    description: "你输入代理人话术，AI 客户逐轮回应。",
  },
  {
    value: "user_as_customer",
    title: "我扮演客户",
    description: "你输入客户反馈，AI 代理人练习回应。",
  },
];

function simulationOptionsKey(simulationId: string) {
  return `insurance-training:simulation-options:${simulationId}`;
}

function saveSimulationOptions(
  simulationId: string,
  options: SimulationOptions,
) {
  window.localStorage.setItem(
    simulationOptionsKey(simulationId),
    JSON.stringify(options),
  );
}

function readSimulationOptions(
  simulationId: string,
  fallbackTurns?: number,
): SimulationOptions {
  if (typeof window === "undefined") {
    return {
      ...defaultSimulationOptions,
      minTurns: fallbackTurns ?? defaultSimulationOptions.minTurns,
    };
  }
  try {
    const raw = window.localStorage.getItem(simulationOptionsKey(simulationId));
    if (!raw) throw new Error("No stored simulation options");
    const parsed = JSON.parse(raw) as Partial<SimulationOptions>;
    const practiceMode: PracticeMode = practiceModes.some(
      (mode) => mode.value === parsed.practiceMode,
    )
      ? parsed.practiceMode!
      : defaultSimulationOptions.practiceMode;
    const parsedMinTurns = Number(parsed.minTurns);
    return {
      practiceMode,
      minTurns:
        Number.isFinite(parsedMinTurns) && parsedMinTurns > 0
          ? parsedMinTurns
          : (fallbackTurns ?? defaultSimulationOptions.minTurns),
    };
  } catch {
    return {
      ...defaultSimulationOptions,
      minTurns: fallbackTurns ?? defaultSimulationOptions.minTurns,
    };
  }
}

function isSimulationEnded(simulation: TrainingSimulation | null) {
  if (!simulation) return false;
  return (
    simulation.status === "ended" ||
    simulation.status === "completed" ||
    simulation.current_turn >= simulation.max_turns
  );
}

function canReviewSimulation(
  simulation: TrainingSimulation | null,
  options: SimulationOptions,
) {
  if (!simulation) return false;
  if (options.practiceMode === "ai_auto") return isSimulationEnded(simulation);
  return simulation.current_turn >= options.minTurns;
}

function reviewLockText(
  simulation: TrainingSimulation | null,
  options: SimulationOptions,
) {
  if (!simulation) return "对练加载完成后可判断复盘条件。";
  if (options.practiceMode === "ai_auto") {
    return "AI 双方对话完成后即可复盘。";
  }
  const remaining = Math.max(0, options.minTurns - simulation.current_turn);
  return remaining
    ? `还差 ${remaining} 轮可复盘。`
    : "已达到最小轮数，可以复盘。";
}

export function SimulationSetup() {
  const router = useRouter();
  const [settings] = useLocalSettings();
  const [roles, setRoles] = useState<TrainingRole[]>([]);
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [practiceMode, setPracticeMode] =
    useState<PracticeMode>("user_as_agent");
  const [maxTurns, setMaxTurns] = useState(12);
  const [busy, setBusy] = useState(false);

  const customers = useMemo(
    () => roles.filter((role) => role.role_type === "customer"),
    [roles],
  );
  const agents = useMemo(
    () => roles.filter((role) => role.role_type === "agent"),
    [roles],
  );
  const selectedCustomer = roles.find((role) => role.id === selectedCustomerId);
  const selectedAgent = roles.find((role) => role.id === selectedAgentId);
  const selectedScenario = scenarios.find(
    (scenario) => scenario.id === selectedScenarioId,
  );
  const userActsAsAgent = practiceMode === "user_as_agent";
  const userActsAsCustomer = practiceMode === "user_as_customer";
  const visibleStepOffset = userActsAsAgent || userActsAsCustomer ? 1 : 0;

  useEffect(() => {
    document.title = "配置对练 - DeerFlow";
    void Promise.all([trainingApi.roles(), trainingApi.scenarios()])
      .then(([nextRoles, nextScenarios]) => {
        setRoles(nextRoles);
        setScenarios(nextScenarios);
        setSelectedCustomerId(
          nextRoles.find((role) => role.role_type === "customer")?.id ?? "",
        );
        setSelectedAgentId(
          nextRoles.find((role) => role.role_type === "agent")?.id ?? "",
        );
        setSelectedScenarioId(nextScenarios[0]?.id ?? "");
      })
      .catch(showError);
  }, []);

  async function createSimulation() {
    if (!selectedCustomerId || !selectedAgentId || !selectedScenarioId) {
      const missingVisibleRole =
        (userActsAsAgent ? !selectedCustomerId : false) ||
        (userActsAsCustomer ? !selectedAgentId : false) ||
        (!userActsAsAgent && !userActsAsCustomer
          ? !selectedCustomerId || !selectedAgentId
          : false);
      if (missingVisibleRole || !selectedScenarioId) {
        toast.error("请先选择对练对象和场景。");
        return;
      }
      toast.error(
        "当前模式缺少后台占位角色，请先到角色工厂补齐客户和代理人角色。",
      );
      return;
    }
    setBusy(true);
    try {
      const session = await trainingApi.createSimulation({
        customer_role_id: selectedCustomerId,
        agent_role_id: selectedAgentId,
        scenario_id: selectedScenarioId,
        max_turns: maxTurns,
        training_model: buildTrainingModelOverride(settings.training),
      });
      saveSimulationOptions(session.id, {
        practiceMode,
        minTurns: maxTurns,
      });
      toast.success("对练已创建");
      router.push(`/workspace/training/simulations/${session.id}`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        icon={PlayIcon}
        title="配置对练"
        description="先选定对练模式、客户、代理人、训练场景和轮数，再进入独立的对话训练页面。"
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/workspace/training/simulations">
            <ArrowLeftIcon className="size-4" />
            返回对练库
          </Link>
        </Button>
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-5">
          <SelectionPanel
            title="1. 选择对练模式"
            description="模式会决定进入对话页后的启动方式，以及复盘何时解锁。"
            icon={MessageSquareTextIcon}
          >
            <div className="grid gap-3 lg:grid-cols-3">
              {practiceModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={cn(
                    "bg-background hover:border-foreground/40 rounded-md border p-4 text-left transition",
                    practiceMode === mode.value &&
                      "border-foreground ring-foreground/10 shadow-sm ring-1",
                  )}
                  onClick={() => setPracticeMode(mode.value)}
                >
                  <div className="text-sm font-semibold">{mode.title}</div>
                  <p className="text-muted-foreground mt-2 text-xs leading-5">
                    {mode.description}
                  </p>
                </button>
              ))}
            </div>
          </SelectionPanel>

          {!userActsAsCustomer && (
            <SelectionPanel
              title="2. 选择模拟客户"
              description={
                userActsAsAgent
                  ? "你将扮演代理人，只需要选择要面对的模拟客户。"
                  : "客户会决定异议、情绪、防备程度和信息释放节奏。"
              }
              icon={UserRoundIcon}
            >
              <SelectionGrid>
                {customers.length ? (
                  customers.map((role) => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      active={selectedCustomerId === role.id}
                      onClick={() => setSelectedCustomerId(role.id)}
                    />
                  ))
                ) : (
                  <EmptyState
                    icon={UserRoundIcon}
                    title="没有客户角色"
                    description="请先到角色工厂创建客户。"
                  />
                )}
              </SelectionGrid>
            </SelectionPanel>
          )}

          {!userActsAsAgent && (
            <SelectionPanel
              title={
                userActsAsCustomer ? "2. 选择模拟代理人" : "3. 选择模拟代理人"
              }
              description={
                userActsAsCustomer
                  ? "你将扮演客户，只需要选择要训练的模拟代理人。"
                  : "代理人角色用于设定销售风格、能力阶段和话术习惯。"
              }
              icon={BotIcon}
            >
              <SelectionGrid>
                {agents.length ? (
                  agents.map((role) => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      active={selectedAgentId === role.id}
                      onClick={() => setSelectedAgentId(role.id)}
                    />
                  ))
                ) : (
                  <EmptyState
                    icon={BotIcon}
                    title="没有代理人角色"
                    description="请先到角色工厂创建代理人。"
                  />
                )}
              </SelectionGrid>
            </SelectionPanel>
          )}

          <SelectionPanel
            title={`${4 - visibleStepOffset}. 选择训练场景`}
            description="场景会约束训练目标、合规边界和复盘观察点。"
            icon={FileTextIcon}
          >
            <SelectionGrid>
              {scenarios.length ? (
                scenarios.map((scenario) => (
                  <ScenarioCard
                    key={scenario.id}
                    scenario={scenario}
                    active={selectedScenarioId === scenario.id}
                    onClick={() => setSelectedScenarioId(scenario.id)}
                  />
                ))
              ) : (
                <EmptyState
                  icon={FileTextIcon}
                  title="没有训练场景"
                  description="请先到场景工厂创建场景。"
                />
              )}
            </SelectionGrid>
          </SelectionPanel>
        </div>

        <Panel className="xl:sticky xl:top-4">
          <SectionTitle
            icon={PlayIcon}
            title="开始前确认"
            description="确认配置后进入对话训练页面。"
          />
          <div className="mt-4 grid gap-3">
            <SelectedLine
              label="模式"
              value={
                practiceModes.find((mode) => mode.value === practiceMode)?.title
              }
            />
            <SelectedLine
              label="客户"
              value={userActsAsCustomer ? "用户" : selectedCustomer?.name}
            />
            <SelectedLine
              label="代理人"
              value={userActsAsAgent ? "用户" : selectedAgent?.name}
            />
            <SelectedLine label="场景" value={selectedScenario?.name} />
            <label className="block min-w-0 space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                {practiceMode === "ai_auto" ? "自动对话轮数" : "最小复盘轮数"}
              </span>
              <Input
                type="number"
                min={2}
                max={60}
                value={maxTurns}
                onChange={(event) => setMaxTurns(Number(event.target.value))}
              />
            </label>
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void createSimulation()}
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlayIcon className="size-4" />
              )}
              进入对话训练
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}

export function SimulationPractice({ simulationId }: { simulationId: string }) {
  const [settings] = useLocalSettings();
  const [roles, setRoles] = useState<TrainingRole[]>([]);
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [simulation, setSimulation] = useState<TrainingSimulation | null>(null);
  const [options, setOptions] = useState<SimulationOptions>(
    defaultSimulationOptions,
  );
  const [agentInput, setAgentInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const autoStartedRef = useRef(false);

  const customer = roles.find(
    (role) => role.id === simulation?.customer_role_id,
  );
  const agent = roles.find((role) => role.id === simulation?.agent_role_id);
  const scenario = scenarios.find(
    (item) => item.id === simulation?.scenario_id,
  );
  const canReview = canReviewSimulation(simulation, options);
  const isAutoMode = options.practiceMode === "ai_auto";
  const humanSpeaker: TrainingSpeakerType =
    options.practiceMode === "user_as_customer" ? "customer" : "agent";
  const humanLabel =
    options.practiceMode === "user_as_customer" ? "客户" : "代理人";
  const aiResponseLabel =
    options.practiceMode === "user_as_customer"
      ? "代理人正在回应"
      : "客户正在思考";
  const inputPlaceholder =
    options.practiceMode === "user_as_customer"
      ? "输入你要表达的客户反馈，例如：我还是担心长期缴费压力，万一以后收入下降怎么办？"
      : "输入你要对客户说的话，例如：我先不急着介绍产品，想了解一下您现在最担心的家庭风险是什么？";

  const reload = useCallback(async () => {
    const [nextRoles, nextScenarios, nextSimulation] = await Promise.all([
      trainingApi.roles(),
      trainingApi.scenarios(),
      trainingApi.getSimulation(simulationId),
    ]);
    setRoles(nextRoles);
    setScenarios(nextScenarios);
    setSimulation(nextSimulation);
    setOptions(readSimulationOptions(simulationId, nextSimulation.max_turns));
  }, [simulationId]);

  useEffect(() => {
    document.title = "对话训练 - DeerFlow";
    void reload().catch(showError);
  }, [reload]);

  const appendMessages = useCallback(
    (session: TrainingSimulation, messages: TrainingMessage[]) => {
      setSimulation((current) => ({
        ...session,
        reports: current?.reports,
        messages: [...(current?.messages ?? []), ...messages],
      }));
    },
    [],
  );

  const replacePendingMessage = useCallback(
    (
      session: TrainingSimulation,
      pendingId: string,
      messages: TrainingMessage[],
    ) => {
      setSimulation((current) => ({
        ...session,
        reports: current?.reports,
        messages: [
          ...(current?.messages ?? []).filter(
            (message) => message.id !== pendingId,
          ),
          ...messages,
        ],
      }));
    },
    [],
  );

  async function sendHumanTurn() {
    if (!simulation) return;
    const content = agentInput.trim();
    if (!content || busy === "manual-turn") return;
    setBusy("manual-turn");
    setAgentInput("");
    const pendingId = `pending-${Date.now()}`;

    try {
      const pendingMessage: TrainingMessage = {
        id: pendingId,
        session_id: simulation.id,
        speaker_type: humanSpeaker,
        content,
        turn_index: (simulation.current_turn ?? 0) + 1,
      };
      appendMessages(simulation, [pendingMessage]);

      const result = await trainingApi.humanTurn(
        simulation.id,
        content,
        buildTrainingModelOverride(settings.training),
        humanSpeaker,
        true,
      );
      const aiMessage = result.ai_message ?? result.customer_message;
      replacePendingMessage(result.session, pendingId, [
        result.human_message,
        ...(aiMessage ? [aiMessage] : []),
      ]);
    } catch (error) {
      showError(error);
      setAgentInput(content);
      setSimulation((current) =>
        current
          ? {
              ...current,
              messages: (current.messages ?? []).filter(
                (message) => message.id !== pendingId,
              ),
            }
          : current,
      );
    } finally {
      setBusy(null);
    }
  }

  async function generateNextTurn() {
    if (!simulation || busy === "next-turn") return;
    setBusy("next-turn");
    try {
      const result = await trainingApi.nextTurn(
        simulation.id,
        buildTrainingModelOverride(settings.training),
      );
      appendMessages(result.session, [result.message]);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  const runAutoConversation = useCallback(
    async (startSimulation: TrainingSimulation) => {
      if (busy || isSimulationEnded(startSimulation)) return;
      setBusy("auto-run");
      let working = startSimulation;
      try {
        while (
          working.current_turn < working.max_turns &&
          !isSimulationEnded(working)
        ) {
          const result = await trainingApi.nextTurn(
            working.id,
            buildTrainingModelOverride(settings.training),
          );
          working = result.session;
          appendMessages(result.session, [result.message]);
        }
        await reload();
      } catch (error) {
        showError(error);
      } finally {
        setBusy(null);
      }
    },
    [appendMessages, busy, reload, settings.training],
  );

  useEffect(() => {
    if (
      options.practiceMode !== "ai_auto" ||
      !simulation ||
      autoStartedRef.current ||
      isSimulationEnded(simulation)
    ) {
      return;
    }
    autoStartedRef.current = true;
    void runAutoConversation(simulation);
  }, [options.practiceMode, runAutoConversation, simulation]);

  return (
    <>
      <PageHeader
        icon={MessageSquareTextIcon}
        title="对话训练"
        description="这一页只负责当前对练的逐轮对话。完成后进入复盘页面。"
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/workspace/training/simulations">
              <ArrowLeftIcon className="size-4" />
              返回对练库
            </Link>
          </Button>
          {canReview ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/workspace/training/simulations/${simulationId}/review`}
              >
                <BadgeCheckIcon className="size-4" />
                进入复盘
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <BadgeCheckIcon className="size-4" />
              复盘未解锁
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="xl:sticky xl:top-4">
          <SectionTitle
            icon={PlayIcon}
            title="本场配置"
            description="对练模式、角色和轮数在创建对练时已固定。"
          />
          <div className="mt-4 grid gap-3">
            <SelectedLine
              label="模式"
              value={
                practiceModes.find(
                  (mode) => mode.value === options.practiceMode,
                )?.title
              }
            />
            <SelectedLine label="客户" value={customer?.name} />
            <SelectedLine label="代理人" value={agent?.name} />
            <SelectedLine label="场景" value={scenario?.name} />
            <SelectedLine
              label="进度"
              value={
                simulation
                  ? `${simulation.current_turn}/${simulation.max_turns} 轮`
                  : "加载中"
              }
            />
            <p className="text-muted-foreground text-xs leading-5">
              {reviewLockText(simulation, options)}
            </p>
            {isAutoMode && (
              <Button
                variant="outline"
                disabled={
                  !simulation ||
                  busy === "next-turn" ||
                  busy === "auto-run" ||
                  isSimulationEnded(simulation)
                }
                onClick={() => void generateNextTurn()}
              >
                {busy === "next-turn" || busy === "auto-run" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                {busy === "auto-run" ? "自动对练中" : "继续自动生成"}
              </Button>
            )}
          </div>
        </Panel>

        <Panel className="flex h-[720px] flex-col">
          <SectionTitle
            icon={MessageSquareTextIcon}
            title="对话过程"
            description={
              isAutoMode
                ? "AI 客户和 AI 代理人会进入页面后自动逐轮对话。"
                : `输入你的${humanLabel}话术，系统会等待另一方回应。`
            }
          />
          <div className="bg-muted/10 mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border p-4">
            {simulation?.messages?.length ? (
              <>
                {simulation.messages.map((message) => (
                  <ChatBubble
                    key={message.id}
                    message={message}
                    viewerSpeaker={isAutoMode ? null : humanSpeaker}
                    alignSpeaker={isAutoMode ? "agent" : humanSpeaker}
                  />
                ))}
                {(busy === "manual-turn" || busy === "next-turn") && (
                  <LoadingBubble
                    label={
                      busy === "manual-turn"
                        ? aiResponseLabel
                        : "正在生成下一句"
                    }
                  />
                )}
                {busy === "auto-run" && (
                  <LoadingBubble label="AI 正在继续对话" />
                )}
              </>
            ) : busy === "manual-turn" ||
              busy === "next-turn" ||
              busy === "auto-run" ? (
              <LoadingBubble
                label={
                  busy === "manual-turn"
                    ? aiResponseLabel
                    : isAutoMode
                      ? "AI 正在开始对话"
                      : "正在生成第一句"
                }
              />
            ) : (
              <EmptyState
                icon={MessageSquareTextIcon}
                title="还没有对话"
                description={
                  isAutoMode
                    ? "进入页面后系统会自动开始 AI 双方对话。"
                    : `输入一句${humanLabel}话术后，另一方会逐轮回应。`
                }
              />
            )}
          </div>

          {!isAutoMode && (
            <div className="bg-background mt-4 rounded-md border p-3">
              <Textarea
                rows={3}
                value={agentInput}
                placeholder={inputPlaceholder}
                disabled={busy === "manual-turn"}
                onChange={(event) => setAgentInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    void sendHumanTurn();
                  }
                }}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-muted-foreground text-xs">
                  Ctrl/⌘ + Enter 发送。请求最多等待 10 分钟。
                </div>
                <Button
                  disabled={!agentInput.trim() || busy === "manual-turn"}
                  onClick={() => void sendHumanTurn()}
                >
                  {busy === "manual-turn" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <MessageSquareTextIcon className="size-4" />
                  )}
                  发送并等待{humanSpeaker === "customer" ? "代理人" : "客户"}
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

export function SimulationReview({ simulationId }: { simulationId: string }) {
  const [settings] = useLocalSettings();
  const [roles, setRoles] = useState<TrainingRole[]>([]);
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [simulation, setSimulation] = useState<TrainingSimulation | null>(null);
  const [options, setOptions] = useState<SimulationOptions>(
    defaultSimulationOptions,
  );
  const [activeReport, setActiveReport] = useState<TrainingReport | null>(null);
  const [revisionPreview, setRevisionPreview] =
    useState<RevisionPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const customer = roles.find(
    (role) => role.id === simulation?.customer_role_id,
  );
  const agent = roles.find((role) => role.id === simulation?.agent_role_id);
  const scenario = scenarios.find(
    (item) => item.id === simulation?.scenario_id,
  );
  const canReview = canReviewSimulation(simulation, options);

  const reload = useCallback(async () => {
    const [nextRoles, nextScenarios, nextSimulation] = await Promise.all([
      trainingApi.roles(),
      trainingApi.scenarios(),
      trainingApi.getSimulation(simulationId),
    ]);
    setRoles(nextRoles);
    setScenarios(nextScenarios);
    setSimulation(nextSimulation);
    setOptions(readSimulationOptions(simulationId, nextSimulation.max_turns));
    setActiveReport(nextSimulation.reports?.[0] ?? null);
  }, [simulationId]);

  useEffect(() => {
    document.title = "复盘报告 - DeerFlow";
    void reload().catch(showError);
  }, [reload]);

  async function createReview() {
    if (!simulation) return;
    if (!canReview) {
      toast.error(reviewLockText(simulation, options));
      return;
    }
    setBusy("review");
    try {
      const report = await trainingApi.createReview(
        simulation.id,
        buildTrainingModelOverride(settings.training),
      );
      setActiveReport(report);
      setSimulation(await trainingApi.getSimulation(simulation.id));
      setRevisionPreview(null);
      toast.success("复盘报告已生成");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function previewRevision(roleType: TrainingRoleType) {
    if (!activeReport || !simulation) return;
    const roleId =
      roleType === "customer"
        ? simulation.customer_role_id
        : simulation.agent_role_id;
    setBusy(`preview-${roleType}`);
    try {
      const preview = await trainingApi.revisionPreview(activeReport.id, {
        role_id: roleId,
        revision_type:
          roleType === "customer" ? "customer_refinement" : "agent_upgrade",
      });
      setRevisionPreview(preview);
      if (!revisionHasChanges(preview)) {
        toast.info("这份复盘暂时没有可应用的画像增量，可以重新生成复盘。");
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function applyRevision() {
    if (!revisionPreview || !activeReport || !simulation) return;
    if (!revisionHasChanges(revisionPreview)) {
      toast.error("当前没有可应用的画像变更。");
      return;
    }
    setBusy("apply-revision");
    try {
      await trainingApi.applyRevision({
        role_id: revisionPreview.role_id,
        source_session_id: simulation.id,
        source_report_id: activeReport.id,
        change_type: "review_suggestion",
        before: revisionPreview.before,
        after: revisionPreview.after,
        diff: revisionPreview.diff,
      });
      toast.success("画像建议已应用");
      setRevisionPreview(null);
      await reload();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  function updateRevisionSummary(value: string) {
    setRevisionPreview((current) =>
      current ? updateRevisionSummaryPreview(current, value) : current,
    );
  }

  function updateRevisionTags(value: string) {
    setRevisionPreview((current) =>
      current ? updateRevisionTagsPreview(current, value) : current,
    );
  }

  function updateRevisionField(key: string, value: string) {
    setRevisionPreview((current) =>
      current ? updateRevisionFieldPreview(current, key, value) : current,
    );
  }

  return (
    <>
      <PageHeader
        icon={BadgeCheckIcon}
        title="复盘报告"
        description="这一页只负责评分、话术反馈、合规风险和画像更新建议。"
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/workspace/training/simulations/${simulationId}`}>
              <ArrowLeftIcon className="size-4" />
              返回对话
            </Link>
          </Button>
          <Button
            size="sm"
            disabled={!simulation || !canReview || busy === "review"}
            onClick={() => void createReview()}
          >
            {busy === "review" ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <BadgeCheckIcon className="size-4" />
            )}
            {activeReport ? "重新生成复盘" : "生成复盘"}
          </Button>
        </div>
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="xl:sticky xl:top-4">
          <SectionTitle
            icon={FileTextIcon}
            title="复盘对象"
            description="复盘基于当前这一场对话。"
          />
          <div className="mt-4 grid gap-3">
            <SelectedLine label="客户" value={customer?.name} />
            <SelectedLine label="代理人" value={agent?.name} />
            <SelectedLine label="场景" value={scenario?.name} />
            <SelectedLine
              label="模式"
              value={
                practiceModes.find(
                  (mode) => mode.value === options.practiceMode,
                )?.title
              }
            />
            <SelectedLine
              label="对话轮数"
              value={
                simulation
                  ? `${simulation.current_turn}/${simulation.max_turns} 轮`
                  : "加载中"
              }
            />
            <p className="text-muted-foreground text-xs leading-5">
              {reviewLockText(simulation, options)}
            </p>
            {activeReport && (
              <>
                <Button
                  variant="outline"
                  disabled={busy === "preview-customer"}
                  onClick={() => void previewRevision("customer")}
                >
                  {busy === "preview-customer" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-4" />
                  )}
                  客户画像建议
                </Button>
                <Button
                  variant="outline"
                  disabled={busy === "preview-agent"}
                  onClick={() => void previewRevision("agent")}
                >
                  {busy === "preview-agent" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-4" />
                  )}
                  代理人升级建议
                </Button>
              </>
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            {!activeReport ? (
              <EmptyState
                icon={BadgeCheckIcon}
                title={canReview ? "暂无复盘报告" : "复盘尚未解锁"}
                description={
                  canReview
                    ? "点击右上角“生成复盘”，系统会基于当前对话输出评分、优秀话术和下一步建议。"
                    : reviewLockText(simulation, options)
                }
              />
            ) : (
              <ReviewReportView report={activeReport} />
            )}
          </Panel>

          {revisionPreview && (
            <RevisionPreviewPanel
              preview={revisionPreview}
              busy={busy === "apply-revision"}
              onSummaryChange={updateRevisionSummary}
              onTagsChange={updateRevisionTags}
              onFieldChange={updateRevisionField}
              onApply={() => void applyRevision()}
              onClose={() => setRevisionPreview(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}

function SelectionPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRoundIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <SectionTitle icon={icon} title={title} description={description} />
      <div className="mt-4">{children}</div>
    </Panel>
  );
}

function SelectionGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 lg:grid-cols-2">{children}</div>;
}

interface RevisionChangedField {
  key: string;
  before_preview?: string;
  after_preview?: string;
  before?: unknown;
  after?: unknown;
}

function revisionHasChanges(preview: RevisionPreview) {
  const totalChanges = Number(preview.diff.total_changes ?? 0);
  return Boolean(preview.diff.has_changes) || totalChanges > 0;
}

function getAddedTags(preview: RevisionPreview) {
  const tags = preview.diff.added_tags;
  return Array.isArray(tags) ? tags.map(String).filter(Boolean) : [];
}

function getChangedProfileFields(preview: RevisionPreview) {
  const fields = preview.diff.changed_profile_fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter(
      (field): field is RevisionChangedField =>
        Boolean(field) &&
        typeof field === "object" &&
        "key" in field &&
        typeof field.key === "string",
    )
    .slice(0, 12);
}

function getSummaryChange(preview: RevisionPreview) {
  if (!preview.diff.summary_changed) return null;
  return {
    before: previewText(preview.diff.summary_before),
    after: previewText(preview.diff.summary_after),
  };
}

function getRevisionTitle(preview: RevisionPreview) {
  return preview.revision_type === "agent_upgrade"
    ? "代理人升级建议"
    : "客户画像建议";
}

function getRevisionDescription(preview: RevisionPreview) {
  return preview.revision_type === "agent_upgrade"
    ? "把本场对话里的能力短板、保留优势和下一轮训练重点沉淀到代理人画像。"
    : "把本场对话里暴露出的真实顾虑、决策规则和口吻变化沉淀到客户画像。";
}

const profileFieldLabels: Record<string, string> = {
  personality: "性格与防备模式",
  hidden_motivations: "隐藏动机",
  decision_rules: "决策规则",
  objections: "典型异议",
  trust_triggers: "信任触发点",
  speech_style: "语言风格",
  common_phrases: "常用表达",
  response_rules: "回应规则",
  next_simulation_notes: "下次模拟提示",
  coaching_focus: "辅导重点",
  strengths_to_keep: "应保留优势",
  skill_gaps: "能力短板",
  compliance_guardrails: "合规边界",
  next_training_plan: "下一轮训练计划",
};

function formatProfileFieldLabel(key: string) {
  return profileFieldLabels[key] ?? key;
}

function previewText(value: unknown, fallback?: unknown) {
  if (typeof value === "string") return value;
  if (fallback !== undefined) return pretty(fallback);
  return pretty(value);
}

function editableValueText(value: unknown) {
  if (typeof value === "string") return value;
  return pretty(value);
}

function parseEditedValue(previousValue: unknown, text: string) {
  const trimmed = text.trim();
  if (Array.isArray(previousValue)) {
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Use line splitting for quick edits to phrase lists.
    }
    return trimmed
      .split(/\n+|[；;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (previousValue && typeof previousValue === "object") {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      return text;
    }
  }
  return text;
}

function splitEditableTags(value: string) {
  return value
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function markRevisionEdited(diff: Record<string, unknown>) {
  return {
    ...diff,
    has_changes: true,
    total_changes: Math.max(1, Number(diff.total_changes ?? 0)),
    edited_by_user: true,
  };
}

function updateRevisionSummaryPreview(
  preview: RevisionPreview,
  value: string,
): RevisionPreview {
  return {
    ...preview,
    after: {
      ...preview.after,
      summary: value,
    },
    diff: markRevisionEdited({
      ...preview.diff,
      summary_changed: value !== previewText(preview.before.summary),
      summary_after: value,
    }),
  };
}

function updateRevisionTagsPreview(
  preview: RevisionPreview,
  value: string,
): RevisionPreview {
  const beforeTags = Array.isArray(preview.before.tags)
    ? preview.before.tags.map(String)
    : [];
  const addedTags = splitEditableTags(value);
  return {
    ...preview,
    after: {
      ...preview.after,
      tags: [...beforeTags, ...addedTags],
    },
    diff: markRevisionEdited({
      ...preview.diff,
      added_tags: addedTags,
    }),
  };
}

function updateRevisionFieldPreview(
  preview: RevisionPreview,
  key: string,
  value: string,
): RevisionPreview {
  const afterProfile = asRecord(preview.after.structured_profile);
  const previousValue = afterProfile[key];
  const nextValue = parseEditedValue(previousValue, value);
  const changedFields = getChangedProfileFields(preview);
  const nextChangedFields = changedFields.map((field) =>
    field.key === key
      ? {
          ...field,
          after: nextValue,
          after_preview: value,
        }
      : field,
  );
  return {
    ...preview,
    after: {
      ...preview.after,
      structured_profile: {
        ...afterProfile,
        [key]: nextValue,
      },
    },
    diff: markRevisionEdited({
      ...preview.diff,
      changed_profile_fields: nextChangedFields,
    }),
  };
}

function RevisionPreviewPanel({
  preview,
  busy,
  onSummaryChange,
  onTagsChange,
  onFieldChange,
  onApply,
  onClose,
}: {
  preview: RevisionPreview;
  busy: boolean;
  onSummaryChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onFieldChange: (key: string, value: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const hasChanges = revisionHasChanges(preview);
  const addedTags = getAddedTags(preview);
  const hasTagSuggestion = Array.isArray(preview.diff.added_tags);
  const changedFields = getChangedProfileFields(preview);
  const summaryChange = getSummaryChange(preview);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle
          icon={SparklesIcon}
          title={getRevisionTitle(preview)}
          description={getRevisionDescription(preview)}
        />
        <Button variant="outline" size="sm" onClick={onClose}>
          收起建议
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <RevisionMetric
          label="目标角色"
          value={preview.role_name ?? "当前角色"}
        />
        <RevisionMetric label="新增标签" value={`${addedTags.length} 个`} />
        <RevisionMetric label="画像字段" value={`${changedFields.length} 项`} />
      </div>

      <div className="bg-muted/20 mt-4 rounded-md border p-4">
        <div className="text-xs font-semibold">建议理由</div>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          {preview.change_reason || "本次复盘建议补充画像信息。"}
        </p>
      </div>

      {!hasChanges ? (
        <EmptyState
          icon={SparklesIcon}
          title="暂无可应用的画像变更"
          description="当前复盘没有返回结构化画像增量，可以重新生成复盘，或继续对练积累更多对话证据。"
        />
      ) : (
        <div className="mt-4 space-y-4">
          {summaryChange && (
            <RevisionChangeBlock
              title="一句话摘要"
              before={summaryChange.before || "未填写摘要。"}
              after={summaryChange.after || "未填写摘要。"}
              editable
              onAfterChange={onSummaryChange}
            />
          )}

          {hasTagSuggestion && (
            <div className="rounded-md border p-4">
              <div className="text-xs font-semibold">建议新增标签</div>
              <Textarea
                className="mt-3 text-sm"
                rows={Math.min(6, Math.max(3, addedTags.length))}
                value={addedTags.join("\n")}
                placeholder="一行一个标签，或用逗号分隔。"
                onChange={(event) => onTagsChange(event.target.value)}
              />
            </div>
          )}

          <div className="grid gap-3">
            {changedFields.map((field) => (
              <RevisionChangeBlock
                key={field.key}
                title={formatProfileFieldLabel(field.key)}
                before={previewText(field.before_preview, field.before)}
                after={editableValueText(field.after)}
                editable
                onAfterChange={(value) => onFieldChange(field.key, value)}
              />
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <RevisionJsonBlock
              title="AI 原始建议"
              value={preview.suggestions}
            />
            <RevisionJsonBlock title="应用后画像预览" value={preview.after} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onClose}>
          暂不应用
        </Button>
        <Button disabled={busy || !hasChanges} onClick={onApply}>
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
          应用到角色画像
        </Button>
      </div>
    </Panel>
  );
}

function RevisionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background rounded-md border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function RevisionChangeBlock({
  title,
  before,
  after,
  editable,
  onAfterChange,
}: {
  title: string;
  before: string;
  after: string;
  editable?: boolean;
  onAfterChange?: (value: string) => void;
}) {
  return (
    <section className="rounded-md border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <RevisionTextBlock label="当前" text={before} muted />
        <RevisionTextBlock
          label="建议更新为"
          text={after}
          editable={editable}
          onChange={onAfterChange}
        />
      </div>
    </section>
  );
}

function RevisionTextBlock({
  label,
  text,
  muted,
  editable,
  onChange,
}: {
  label: string;
  text: string;
  muted?: boolean;
  editable?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="bg-muted/20 min-w-0 rounded-md border p-3">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      {editable ? (
        <Textarea
          className="mt-2 min-h-28 text-sm leading-6"
          value={text}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <p
          className={cn(
            "mt-2 max-h-44 overflow-y-auto text-sm leading-6 whitespace-pre-wrap",
            muted && "text-muted-foreground",
          )}
        >
          {text || "未填写。"}
        </p>
      )}
    </div>
  );
}

function RevisionJsonBlock({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <section className="rounded-md border p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <pre className="bg-muted/30 max-h-96 overflow-auto rounded-md border p-3 text-xs leading-5 whitespace-pre-wrap">
        {pretty(value)}
      </pre>
    </section>
  );
}

function ChatBubble({
  message,
  viewerSpeaker,
  alignSpeaker,
}: {
  message: TrainingMessage;
  viewerSpeaker: TrainingSpeakerType | null;
  alignSpeaker: TrainingSpeakerType;
}) {
  const speakerLabel =
    viewerSpeaker && message.speaker_type === viewerSpeaker
      ? "我"
      : message.speaker_type === "customer"
        ? "客户"
        : "代理人";
  return (
    <div
      className={cn(
        "flex",
        message.speaker_type === alignSpeaker && "justify-end",
      )}
    >
      <div
        className={cn(
          "max-w-[82%] rounded-md px-3 py-2 text-sm leading-6",
          message.speaker_type === alignSpeaker
            ? "bg-primary text-primary-foreground"
            : "bg-muted",
        )}
      >
        <div className="mb-1 text-xs opacity-70">
          {speakerLabel} · 第 {message.turn_index} 句
        </div>
        {message.content}
      </div>
    </div>
  );
}

function LoadingBubble({ label }: { label: string }) {
  return (
    <div className="flex">
      <div className="bg-muted text-muted-foreground inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}

function ReviewReportView({ report }: { report: TrainingReport }) {
  const scores = normalizeScores(report.report.scores);
  return (
    <div className="space-y-4">
      <p className="bg-muted/20 rounded-md border p-4 text-sm leading-6">
        {report.summary}
      </p>
      <div className="grid gap-2 sm:grid-cols-4">
        {scores.map(([key, value]) => (
          <div key={key} className="bg-background rounded-md border p-3">
            <div className="text-muted-foreground truncate text-xs">
              {formatScoreLabel(key)}
            </div>
            <div className="mt-1 text-lg font-semibold">{value}/5</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <ReportList title="优势" items={report.report.strengths} />
        <ReportList title="待改进" items={report.report.weaknesses} />
        <ReportList title="优秀话术" items={report.report.good_phrases} />
        <ReportList
          title="下一轮建议"
          items={report.report.next_training_advice}
        />
        <ReportList title="合规风险" items={report.report.compliance_risks} />
        <ReportList title="客户反应" items={report.report.customer_reactions} />
      </div>
    </div>
  );
}

function normalizeScores(scores: unknown): Array<[string, number | string]> {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    return [];
  }
  return Object.entries(scores).map(([key, value]) => [
    key,
    typeof value === "number" || typeof value === "string"
      ? value
      : JSON.stringify(value),
  ]);
}

const scoreLabels: Record<string, string> = {
  need_discovery: "需求挖掘",
  trust_building: "信任建立",
  empathy: "共情回应",
  product_explanation: "产品解释",
  objection_handling: "异议处理",
  closing: "成交推进",
  compliance: "合规表达",
  overall: "综合表现",
};

function formatScoreLabel(key: string) {
  return scoreLabels[key] ?? key;
}
