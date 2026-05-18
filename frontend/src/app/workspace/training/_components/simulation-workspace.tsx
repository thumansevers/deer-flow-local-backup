"use client";

import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  BotIcon,
  FileTextIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  PlayIcon,
  RefreshCwIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalSettings } from "@/core/settings";
import {
  trainingApi,
  type RevisionPreview,
  type TrainingReport,
  type TrainingRole,
  type TrainingRoleType,
  type TrainingScenario,
  type TrainingSimulation,
  type TrainingMessage,
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

export function SimulationWorkspace({
  simulationId,
}: {
  simulationId?: string;
}) {
  const [settings] = useLocalSettings();
  const [roles, setRoles] = useState<TrainingRole[]>([]);
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [maxTurns, setMaxTurns] = useState(12);
  const [activeSimulation, setActiveSimulation] =
    useState<TrainingSimulation | null>(null);
  const [activeReport, setActiveReport] = useState<TrainingReport | null>(null);
  const [revisionPreview, setRevisionPreview] =
    useState<RevisionPreview | null>(null);
  const [practiceMode, setPracticeMode] = useState<"manual" | "auto">("manual");
  const [agentInput, setAgentInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

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

  const reload = useCallback(async () => {
    const [nextRoles, nextScenarios, loadedSimulation] = await Promise.all([
      trainingApi.roles(),
      trainingApi.scenarios(),
      simulationId ? trainingApi.getSimulation(simulationId) : null,
    ]);
    setRoles(nextRoles);
    setScenarios(nextScenarios);
    if (loadedSimulation) {
      setActiveSimulation(loadedSimulation);
      setSelectedCustomerId(loadedSimulation.customer_role_id);
      setSelectedAgentId(loadedSimulation.agent_role_id);
      setSelectedScenarioId(loadedSimulation.scenario_id);
      setMaxTurns(loadedSimulation.max_turns);
      setActiveReport(loadedSimulation.reports?.[0] ?? null);
      return;
    }
    setSelectedCustomerId((current) =>
      current
        ? current
        : (nextRoles.find((role) => role.role_type === "customer")?.id ?? ""),
    );
    setSelectedAgentId((current) =>
      current
        ? current
        : (nextRoles.find((role) => role.role_type === "agent")?.id ?? ""),
    );
    setSelectedScenarioId((current) =>
      current ? current : (nextScenarios[0]?.id ?? ""),
    );
  }, [simulationId]);

  useEffect(() => {
    document.title = simulationId
      ? "对练详情 - DeerFlow"
      : "新建对练 - DeerFlow";
    void reload().catch(showError);
  }, [reload, simulationId]);

  function appendMessages(
    session: TrainingSimulation,
    messages: TrainingMessage[],
  ) {
    setActiveSimulation((current) => ({
      ...session,
      reports: current?.reports,
      messages: [...(current?.messages ?? []), ...messages],
    }));
  }

  function replacePendingMessage(
    session: TrainingSimulation,
    pendingId: string,
    messages: TrainingMessage[],
  ) {
    setActiveSimulation((current) => ({
      ...session,
      reports: current?.reports,
      messages: [
        ...(current?.messages ?? []).filter(
          (message) => message.id !== pendingId,
        ),
        ...messages,
      ],
    }));
  }

  async function createTrainingSession() {
    if (!selectedCustomerId || !selectedAgentId || !selectedScenarioId) {
      toast.error("请先选择客户、代理人和场景。");
      return null;
    }
    return await trainingApi.createSimulation({
      customer_role_id: selectedCustomerId,
      agent_role_id: selectedAgentId,
      scenario_id: selectedScenarioId,
      max_turns: maxTurns,
      training_model: buildTrainingModelOverride(settings.training),
    });
  }

  async function runSimulation() {
    setBusy("run-simulation");
    setActiveReport(null);
    setRevisionPreview(null);
    try {
      const session = await createTrainingSession();
      if (!session) return;
      setActiveSimulation({ ...session, messages: [] });

      let currentSession = session;
      for (let index = 0; index < maxTurns; index += 1) {
        const result = await trainingApi.nextTurn(
          currentSession.id,
          buildTrainingModelOverride(settings.training),
        );
        appendMessages(result.session, [result.message]);
        currentSession = result.session;
        if (result.session_status === "ended") break;
      }
      toast.success("自动对练已完成");
      await reload();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function sendHumanTurn() {
    const content = agentInput.trim();
    if (!content || busy === "manual-turn") return;
    setBusy("manual-turn");
    setActiveReport(null);
    setRevisionPreview(null);
    setAgentInput("");
    const pendingId = `pending-${Date.now()}`;

    try {
      let session = activeSimulation;
      if (!session || ["ended", "completed"].includes(session.status)) {
        session = await createTrainingSession();
        if (!session) return;
        setActiveSimulation({ ...session, messages: [] });
      }

      const pendingMessage: TrainingMessage = {
        id: pendingId,
        session_id: session.id,
        speaker_type: "agent",
        content,
        turn_index: (session.current_turn ?? 0) + 1,
      };
      appendMessages(session, [pendingMessage]);

      const result = await trainingApi.humanTurn(
        session.id,
        content,
        buildTrainingModelOverride(settings.training),
      );
      replacePendingMessage(result.session, pendingId, [
        result.human_message,
        ...(result.customer_message ? [result.customer_message] : []),
      ]);
      await reload();
    } catch (error) {
      showError(error);
      setAgentInput(content);
      setActiveSimulation((current) =>
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

  async function createReview() {
    if (!activeSimulation) return;
    setBusy("review");
    try {
      const report = await trainingApi.createReview(
        activeSimulation.id,
        buildTrainingModelOverride(settings.training),
      );
      setActiveReport(report);
      setActiveSimulation(await trainingApi.getSimulation(activeSimulation.id));
      toast.success("复盘报告已生成");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function previewRevision(roleType: TrainingRoleType) {
    if (!activeReport) return;
    const roleId =
      roleType === "customer" ? selectedCustomerId : selectedAgentId;
    setBusy(`preview-${roleType}`);
    try {
      setRevisionPreview(
        await trainingApi.revisionPreview(activeReport.id, {
          role_id: roleId,
          revision_type:
            roleType === "customer" ? "customer_refinement" : "agent_upgrade",
        }),
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function applyRevision() {
    if (!revisionPreview || !activeReport || !activeSimulation) return;
    setBusy("apply-revision");
    try {
      await trainingApi.applyRevision({
        role_id: revisionPreview.role_id,
        source_session_id: activeSimulation.id,
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

  return (
    <>
      <PageHeader
        icon={PlayIcon}
        title={simulationId ? "对练详情" : "新建对练"}
        description="选择客户、代理人和场景后进入一场独立训练，聊天、复盘和画像更新都在这里完成。"
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/workspace/training/simulations">
              <ArrowLeftIcon className="size-4" />
              返回对练库
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload().catch(showError)}
          >
            <RefreshCwIcon className="size-4" />
            刷新
          </Button>
        </div>
      </PageHeader>

      <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5 2xl:sticky 2xl:top-4">
          <Panel>
            <SectionTitle
              icon={PlayIcon}
              title="训练控制台"
              description="手动模式由你扮演代理人；自动模式用于快速生成样例对话。"
            />
            <div className="mt-4 grid min-w-0 gap-3">
              <div className="bg-muted/20 grid min-w-0 grid-cols-2 gap-2 rounded-md border p-1">
                {(["manual", "auto"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPracticeMode(mode)}
                    className={cn(
                      "min-w-0 truncate rounded px-3 py-2 text-xs font-medium transition-colors",
                      practiceMode === mode
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode === "manual" ? "我来对练" : "自动对练"}
                  </button>
                ))}
              </div>
              <SelectedLine label="客户" value={selectedCustomer?.name} />
              <SelectedLine label="代理人" value={selectedAgent?.name} />
              <SelectedLine label="场景" value={selectedScenario?.name} />
              <label className="block min-w-0 space-y-1.5">
                <span className="text-muted-foreground text-xs font-medium">
                  对话轮数
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
                className="w-full min-w-0"
                disabled={busy === "run-simulation" || practiceMode !== "auto"}
                onClick={() => void runSimulation()}
              >
                {busy === "run-simulation" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
                逐句自动生成
              </Button>
              <Button
                className="w-full min-w-0"
                variant="outline"
                disabled={
                  !activeSimulation ||
                  busy === "review" ||
                  activeSimulation.status === "created"
                }
                onClick={() => void createReview()}
              >
                {busy === "review" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <BadgeCheckIcon className="size-4" />
                )}
                生成复盘报告
              </Button>
            </div>
          </Panel>

          <Panel>
            <SectionTitle
              icon={MessageSquareTextIcon}
              title="角色与场景"
              description="选择项会同步到训练控制台。"
            />
            <div className="mt-4 space-y-4">
              <CompactSelection title="客户角色">
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
              </CompactSelection>
              <CompactSelection title="代理人角色">
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
              </CompactSelection>
              <CompactSelection title="销售场景">
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
              </CompactSelection>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel className="flex h-[640px] flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionTitle
                icon={MessageSquareTextIcon}
                title="对话过程"
                description="手动模式下输入你的代理人话术，客户会逐轮回应。"
              />
              <Button
                variant="outline"
                disabled={
                  !activeSimulation ||
                  busy === "review" ||
                  activeSimulation.status === "created"
                }
                onClick={() => void createReview()}
              >
                {busy === "review" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <BadgeCheckIcon className="size-4" />
                )}
                复盘当前对话
              </Button>
            </div>

            <div className="bg-muted/10 mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border p-4">
              {activeSimulation?.messages?.length ? (
                <>
                  {activeSimulation.messages.map((message) => (
                    <ChatBubble key={message.id} message={message} />
                  ))}
                  {(busy === "manual-turn" || busy === "run-simulation") && (
                    <LoadingBubble
                      label={
                        busy === "manual-turn"
                          ? "客户正在思考"
                          : "正在生成下一句"
                      }
                    />
                  )}
                </>
              ) : busy === "manual-turn" || busy === "run-simulation" ? (
                <LoadingBubble
                  label={
                    busy === "manual-turn" ? "客户正在思考" : "正在生成第一句"
                  }
                />
              ) : (
                <EmptyState
                  icon={MessageSquareTextIcon}
                  title="还没有对话"
                  description="选择角色和场景后，输入一句话术或启动自动对练。"
                />
              )}
            </div>
            {practiceMode === "manual" && (
              <div className="bg-background mt-4 rounded-md border p-3">
                <Textarea
                  rows={3}
                  value={agentInput}
                  placeholder="输入你要对客户说的话，例如：我先不急着介绍产品，想了解一下您现在最担心的家庭风险是什么？"
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
                    发送并等待客户
                  </Button>
                </div>
              </div>
            )}
          </Panel>

          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionTitle
                icon={BadgeCheckIcon}
                title="复盘报告"
                description="复盘当前对话，输出评分、话术反馈、合规风险和画像更新建议。"
              />
              {activeReport && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy === "preview-customer"}
                    onClick={() => void previewRevision("customer")}
                  >
                    <SparklesIcon className="size-4" />
                    客户画像建议
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy === "preview-agent"}
                    onClick={() => void previewRevision("agent")}
                  >
                    <SparklesIcon className="size-4" />
                    代理人升级建议
                  </Button>
                </div>
              )}
            </div>
            {!activeReport ? (
              <div className="mt-4">
                <EmptyState
                  icon={BadgeCheckIcon}
                  title="暂无复盘报告"
                  description="在上方对话面板点击“复盘当前对话”，报告会显示在这里。"
                />
              </div>
            ) : (
              <ReviewReportView report={activeReport} />
            )}

            {revisionPreview && (
              <div className="bg-muted/20 mt-4 space-y-3 rounded-md border p-3">
                <p className="text-muted-foreground text-sm leading-6">
                  {revisionPreview.change_reason}
                </p>
                <Textarea
                  readOnly
                  className="font-mono text-xs"
                  rows={8}
                  value={pretty(revisionPreview.diff)}
                />
                <Button
                  className="w-full"
                  disabled={busy === "apply-revision"}
                  onClick={() => void applyRevision()}
                >
                  应用画像更新
                </Button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function ChatBubble({ message }: { message: TrainingMessage }) {
  return (
    <div
      className={cn("flex", message.speaker_type === "agent" && "justify-end")}
    >
      <div
        className={cn(
          "max-w-[82%] rounded-md px-3 py-2 text-sm leading-6",
          message.speaker_type === "customer"
            ? "bg-muted"
            : "bg-primary text-primary-foreground",
        )}
      >
        <div className="mb-1 text-xs opacity-70">
          {message.speaker_type === "customer" ? "客户" : "我"} · 第{" "}
          {message.turn_index} 句
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

function CompactSelection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-xs font-semibold">{title}</div>
      <div className="max-h-72 min-w-0 space-y-2 overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  );
}

function ReviewReportView({ report }: { report: TrainingReport }) {
  return (
    <div className="mt-4 space-y-4">
      <p className="bg-muted/20 rounded-md border p-4 text-sm leading-6">
        {report.summary}
      </p>
      <div className="grid gap-2 sm:grid-cols-4">
        {Object.entries(report.report.scores ?? {}).map(([key, value]) => (
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
