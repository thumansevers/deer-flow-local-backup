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
import { useCallback, useEffect, useMemo, useState } from "react";
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

export function SimulationSetup() {
  const router = useRouter();
  const [settings] = useLocalSettings();
  const [roles, setRoles] = useState<TrainingRole[]>([]);
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
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
      toast.error("请先选择客户、代理人和场景。");
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
        description="先选定客户、代理人、训练场景和轮数，再进入独立的对话训练页面。"
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
            title="1. 选择模拟客户"
            description="客户会决定异议、情绪、防备程度和信息释放节奏。"
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

          <SelectionPanel
            title="2. 选择模拟代理人"
            description="代理人角色用于设定销售风格、能力阶段和话术习惯。"
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

          <SelectionPanel
            title="3. 选择训练场景"
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
  const [agentInput, setAgentInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const customer = roles.find(
    (role) => role.id === simulation?.customer_role_id,
  );
  const agent = roles.find((role) => role.id === simulation?.agent_role_id);
  const scenario = scenarios.find(
    (item) => item.id === simulation?.scenario_id,
  );

  const reload = useCallback(async () => {
    const [nextRoles, nextScenarios, nextSimulation] = await Promise.all([
      trainingApi.roles(),
      trainingApi.scenarios(),
      trainingApi.getSimulation(simulationId),
    ]);
    setRoles(nextRoles);
    setScenarios(nextScenarios);
    setSimulation(nextSimulation);
  }, [simulationId]);

  useEffect(() => {
    document.title = "对话训练 - DeerFlow";
    void reload().catch(showError);
  }, [reload]);

  function appendMessages(
    session: TrainingSimulation,
    messages: TrainingMessage[],
  ) {
    setSimulation((current) => ({
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
  }

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
        speaker_type: "agent",
        content,
        turn_index: (simulation.current_turn ?? 0) + 1,
      };
      appendMessages(simulation, [pendingMessage]);

      const result = await trainingApi.humanTurn(
        simulation.id,
        content,
        buildTrainingModelOverride(settings.training),
      );
      replacePendingMessage(result.session, pendingId, [
        result.human_message,
        ...(result.customer_message ? [result.customer_message] : []),
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
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/workspace/training/simulations/${simulationId}/review`}
            >
              <BadgeCheckIcon className="size-4" />
              进入复盘
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="xl:sticky xl:top-4">
          <SectionTitle
            icon={PlayIcon}
            title="本场配置"
            description="角色和轮数在创建对练时已固定。"
          />
          <div className="mt-4 grid gap-3">
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
            <Button
              variant="outline"
              disabled={!simulation || busy === "next-turn"}
              onClick={() => void generateNextTurn()}
            >
              {busy === "next-turn" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              自动生成下一句
            </Button>
          </div>
        </Panel>

        <Panel className="flex h-[720px] flex-col">
          <SectionTitle
            icon={MessageSquareTextIcon}
            title="对话过程"
            description="输入你的代理人话术，客户会逐轮回应。"
          />
          <div className="bg-muted/10 mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border p-4">
            {simulation?.messages?.length ? (
              <>
                {simulation.messages.map((message) => (
                  <ChatBubble key={message.id} message={message} />
                ))}
                {(busy === "manual-turn" || busy === "next-turn") && (
                  <LoadingBubble
                    label={
                      busy === "manual-turn" ? "客户正在思考" : "正在生成下一句"
                    }
                  />
                )}
              </>
            ) : busy === "manual-turn" || busy === "next-turn" ? (
              <LoadingBubble
                label={
                  busy === "manual-turn" ? "客户正在思考" : "正在生成第一句"
                }
              />
            ) : (
              <EmptyState
                icon={MessageSquareTextIcon}
                title="还没有对话"
                description="输入一句代理人话术，或点击左侧“自动生成下一句”。"
              />
            )}
          </div>

          <div className="bg-background mt-4 rounded-md border p-3">
            <Textarea
              rows={3}
              value={agentInput}
              placeholder="输入你要对客户说的话，例如：我先不急着介绍产品，想了解一下您现在最担心的家庭风险是什么？"
              disabled={busy === "manual-turn"}
              onChange={(event) => setAgentInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
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

  const reload = useCallback(async () => {
    const [nextRoles, nextScenarios, nextSimulation] = await Promise.all([
      trainingApi.roles(),
      trainingApi.scenarios(),
      trainingApi.getSimulation(simulationId),
    ]);
    setRoles(nextRoles);
    setScenarios(nextScenarios);
    setSimulation(nextSimulation);
    setActiveReport(nextSimulation.reports?.[0] ?? null);
  }, [simulationId]);

  useEffect(() => {
    document.title = "复盘报告 - DeerFlow";
    void reload().catch(showError);
  }, [reload]);

  async function createReview() {
    if (!simulation) return;
    setBusy("review");
    try {
      const report = await trainingApi.createReview(
        simulation.id,
        buildTrainingModelOverride(settings.training),
      );
      setActiveReport(report);
      setSimulation(await trainingApi.getSimulation(simulation.id));
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
    if (!revisionPreview || !activeReport || !simulation) return;
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
            disabled={!simulation || busy === "review"}
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
              label="对话轮数"
              value={
                simulation
                  ? `${simulation.current_turn}/${simulation.max_turns} 轮`
                  : "加载中"
              }
            />
            {activeReport && (
              <>
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
              </>
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            {!activeReport ? (
              <EmptyState
                icon={BadgeCheckIcon}
                title="暂无复盘报告"
                description="点击右上角“生成复盘”，系统会基于当前对话输出评分、优秀话术和下一步建议。"
              />
            ) : (
              <ReviewReportView report={activeReport} />
            )}
          </Panel>

          {revisionPreview && (
            <Panel>
              <SectionTitle
                icon={SparklesIcon}
                title="画像更新建议"
                description="确认后会把建议应用到对应角色画像版本。"
              />
              <div className="mt-4 space-y-3">
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
                  {busy === "apply-revision" && (
                    <Loader2Icon className="size-4 animate-spin" />
                  )}
                  应用画像更新
                </Button>
              </div>
            </Panel>
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

function ReviewReportView({ report }: { report: TrainingReport }) {
  return (
    <div className="space-y-4">
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
