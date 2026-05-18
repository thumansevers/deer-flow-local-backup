"use client";

import {
  FileTextIcon,
  GaugeIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trainingApi, type TrainingScenario } from "@/core/training/api";

import {
  EmptyState,
  MetricTile,
  PageHeader,
  Panel,
  ScenarioCard,
  ScenarioDetailDialog,
  SectionTitle,
  showError,
} from "../training-components";

export default function TrainingScenariosPage() {
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filteredScenarios = useMemo(
    () => filterScenarios(scenarios, query),
    [scenarios, query],
  );
  const defaultStage = scenarios[0]?.sales_stage ?? "未设置";
  const averageTurns = scenarios.length
    ? Math.round(
        scenarios.reduce(
          (sum, scenario) => sum + scenario.recommended_turns,
          0,
        ) / scenarios.length,
      )
    : 0;

  async function reload() {
    setScenarios(await trainingApi.scenarios());
  }

  useEffect(() => {
    document.title = "场景工厂 - DeerFlow";
    void reload().catch(showError);
  }, []);

  async function deleteScenario(scenario: TrainingScenario) {
    if (
      !window.confirm(
        `确认删除场景“${scenario.name}”？删除后不会出现在对练选择里。`,
      )
    ) {
      return;
    }
    setBusy(`delete-scenario-${scenario.id}`);
    try {
      await trainingApi.deleteScenario(scenario.id);
      toast.success("场景已删除");
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
        icon={FileTextIcon}
        title="场景工厂"
        description="管理可复用训练场景。创建和编辑场景时进入独立流程，完整校准训练目标、客户状态和合规约束。"
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
            <Link href="/workspace/training/scenarios/new">
              <PlusIcon className="size-4" />
              新建场景
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          icon={FileTextIcon}
          label="训练场景"
          value={scenarios.length}
        />
        <MetricTile icon={TargetIcon} label="最近阶段" value={defaultStage} />
        <MetricTile
          icon={GaugeIcon}
          label="平均建议轮数"
          value={averageTurns ? `${averageTurns} 轮` : "未设置"}
        />
      </div>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            icon={FileTextIcon}
            title="场景库"
            description="点击卡片查看完整场景，进入编辑页可继续完善训练任务。"
          />
          <Input
            className="w-full sm:w-72"
            value={query}
            placeholder="搜索名称、阶段、产品或摘要"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filteredScenarios.length ? (
            filteredScenarios.map((scenario) => (
              <div key={scenario.id} className="group relative">
                <ScenarioDetailDialog scenario={scenario}>
                  <ScenarioCard scenario={scenario} />
                </ScenarioDetailDialog>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="bg-background/90 size-8"
                    title="编辑场景"
                    asChild
                  >
                    <Link href={`/workspace/training/scenarios/${scenario.id}`}>
                      <PencilIcon className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="bg-background/90 size-8"
                    disabled={busy === `delete-scenario-${scenario.id}`}
                    title="删除场景"
                    onClick={() => deleteScenario(scenario)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="lg:col-span-2 xl:col-span-3">
              <EmptyState
                icon={FileTextIcon}
                title="还没有训练场景"
                description="点击“新建场景”进入完整创建流程。"
              />
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

function filterScenarios(scenarios: TrainingScenario[], query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return scenarios;
  return scenarios.filter((scenario) =>
    [
      scenario.name,
      scenario.summary,
      scenario.description,
      scenario.sales_stage,
      scenario.product_type,
      scenario.difficulty,
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword),
  );
}
