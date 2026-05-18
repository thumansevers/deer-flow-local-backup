"use client";

import {
  BotIcon,
  Clock3Icon,
  FileTextIcon,
  MessageSquareTextIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
              <Link
                key={simulation.id}
                href={`/workspace/training/simulations/${simulation.id}`}
                className="hover:border-primary/40 hover:bg-muted/40 bg-background block rounded-md border p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {roleName(roles, simulation.customer_role_id)} ×{" "}
                      {roleName(roles, simulation.agent_role_id)}
                    </div>
                    <div className="text-muted-foreground mt-1 truncate text-xs">
                      {scenarioName(scenarios, simulation.scenario_id)}
                    </div>
                  </div>
                  <span className="text-muted-foreground bg-muted rounded px-2 py-1 text-xs">
                    {formatStatus(simulation.status)}
                  </span>
                </div>
                <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
                  <span>
                    {simulation.current_turn}/{simulation.max_turns} 轮
                  </span>
                  <span>{simulation.reports?.length ?? 0} 份复盘</span>
                </div>
              </Link>
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
      roleName(roles, simulation.customer_role_id),
      roleName(roles, simulation.agent_role_id),
      scenarioName(scenarios, simulation.scenario_id),
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword),
  );
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
