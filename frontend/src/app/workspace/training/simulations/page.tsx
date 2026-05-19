"use client";

import {
  BotIcon,
  Clock3Icon,
  FileTextIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  trainingApi,
  type TrainingRole,
  type TrainingScenario,
  type TrainingSimulation,
} from "@/core/training/api";

import {
  EmptyState,
  MetricTile,
  PageHeader,
  Panel,
  SectionTitle,
  showError,
} from "../training-components";

export default function TrainingSimulationsPage() {
  const [roles, setRoles] = useState<TrainingRole[]>([]);
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [simulations, setSimulations] = useState<TrainingSimulation[]>([]);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const customers = useMemo(
    () => roles.filter((role) => role.role_type === "customer"),
    [roles],
  );
  const agents = useMemo(
    () => roles.filter((role) => role.role_type === "agent"),
    [roles],
  );
  const filteredSimulations = useMemo(
    () => filterSimulations(simulations, roles, scenarios, query),
    [simulations, roles, scenarios, query],
  );

  async function reload() {
    const [nextRoles, nextScenarios, nextSimulations] = await Promise.all([
      trainingApi.roles(),
      trainingApi.scenarios(),
      trainingApi.simulations(),
    ]);
    setRoles(nextRoles);
    setScenarios(nextScenarios);
    setSimulations(nextSimulations);
  }

  useEffect(() => {
    document.title = "模拟对练 - DeerFlow";
    void reload().catch(showError);
  }, []);

  async function deleteSimulation(simulation: TrainingSimulation) {
    const title = simulationTitle(simulation, roles);
    const confirmed = window.confirm(
      `确定删除这条对练记录吗？\n\n${title}\n删除后会从对练库隐藏。`,
    );
    if (!confirmed) return;

    setDeletingId(simulation.id);
    try {
      await trainingApi.deleteSimulation(simulation.id);
      setSimulations((current) =>
        current.filter((item) => item.id !== simulation.id),
      );
      toast.success("对练记录已删除");
    } catch (error) {
      showError(error);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        icon={PlayIcon}
        title="模拟对练"
        description="管理历史对练记录。新建或继续某场对练时进入独立二级页面，专注完成聊天、复盘和画像更新。"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload().catch(showError)}
          >
            <RefreshCwIcon className="size-4" />
            刷新
          </Button>
          <Button size="sm" asChild>
            <Link href="/workspace/training/simulations/new">
              <PlusIcon className="size-4" />
              新建对练
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile
          icon={UserRoundIcon}
          label="客户"
          value={customers.length}
        />
        <MetricTile icon={BotIcon} label="代理人" value={agents.length} />
        <MetricTile icon={FileTextIcon} label="场景" value={scenarios.length} />
        <MetricTile
          icon={Clock3Icon}
          label="对练记录"
          value={simulations.length}
        />
      </div>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            icon={MessageSquareTextIcon}
            title="对练记录库"
            description="点击记录进入二级页面回看对话，或继续生成复盘和画像建议。"
          />
          <Input
            className="w-full sm:w-72"
            value={query}
            placeholder="搜索客户、代理人、场景或状态"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filteredSimulations.length ? (
            filteredSimulations.map((simulation) => (
              <div
                key={simulation.id}
                className="hover:border-primary/40 hover:bg-muted/40 bg-background rounded-md border p-4 transition-colors"
              >
                <Link
                  href={`/workspace/training/simulations/${simulation.id}`}
                  className="block min-w-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {simulationTitle(simulation, roles)}
                      </div>
                      <div className="text-muted-foreground mt-1 truncate text-xs">
                        {scenarioName(scenarios, simulation.scenario_id)}
                      </div>
                    </div>
                    <span className="text-muted-foreground bg-muted rounded px-2 py-1 text-xs">
                      {formatStatus(simulation.status)}
                    </span>
                  </div>
                </Link>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-muted-foreground flex min-w-0 gap-3 text-xs">
                    <span>
                      {simulation.current_turn}/{simulation.max_turns} 轮
                    </span>
                    <span>
                      {hasReview(simulation) ? "已有复盘" : "暂未复盘"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={deletingId === simulation.id}
                    onClick={() => void deleteSimulation(simulation)}
                  >
                    {deletingId === simulation.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <Trash2Icon className="size-4" />
                    )}
                    删除
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="lg:col-span-2 xl:col-span-3">
              <EmptyState
                icon={MessageSquareTextIcon}
                title="暂无对练记录"
                description="点击“新建对练”进入独立训练页面。"
              />
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

function filterSimulations(
  simulations: TrainingSimulation[],
  roles: TrainingRole[],
  scenarios: TrainingScenario[],
  query: string,
) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return simulations;
  return simulations.filter((simulation) =>
    [
      simulation.status,
      simulationTitle(simulation, roles),
      roleName(roles, simulation.customer_role_id),
      roleName(roles, simulation.agent_role_id),
      scenarioName(scenarios, simulation.scenario_id),
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword),
  );
}

type PracticeMode = "ai_auto" | "user_as_agent" | "user_as_customer";

function simulationOptionsKey(simulationId: string) {
  return `insurance-training:simulation-options:${simulationId}`;
}

function readPracticeMode(simulationId: string): PracticeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(simulationOptionsKey(simulationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { practiceMode?: unknown };
    if (
      parsed.practiceMode === "ai_auto" ||
      parsed.practiceMode === "user_as_agent" ||
      parsed.practiceMode === "user_as_customer"
    ) {
      return parsed.practiceMode;
    }
  } catch {
    return null;
  }
  return null;
}

function simulationTitle(
  simulation: TrainingSimulation,
  roles: TrainingRole[],
) {
  const customer = roleName(roles, simulation.customer_role_id);
  const agent = roleName(roles, simulation.agent_role_id);
  const practiceMode = readPracticeMode(simulation.id);
  if (practiceMode === "user_as_agent") return `用户 × ${customer}`;
  if (practiceMode === "user_as_customer") return `用户 × ${agent}`;
  return `${customer} × ${agent}`;
}

function hasReview(simulation: TrainingSimulation) {
  return simulation.has_review ?? Boolean(simulation.reports?.length);
}

function roleName(roles: TrainingRole[], id: string) {
  return roles.find((role) => role.id === id)?.name ?? "未知角色";
}

function scenarioName(scenarios: TrainingScenario[], id: string) {
  return scenarios.find((scenario) => scenario.id === id)?.name ?? "未知场景";
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    created: "已创建",
    running: "进行中",
    ended: "已结束",
    completed: "已完成",
  };
  return labels[status] ?? status;
}
