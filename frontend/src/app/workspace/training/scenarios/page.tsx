"use client";

import {
  FileTextIcon,
  GaugeIcon,
  RefreshCwIcon,
  SparklesIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalSettings } from "@/core/settings";
import { trainingApi, type TrainingScenario } from "@/core/training/api";

import {
  EmptyState,
  FieldBlock,
  MetricTile,
  PageHeader,
  Panel,
  parseJsonObject,
  pretty,
  ScenarioCard,
  scenarioDefault,
  SectionTitle,
  showError,
} from "../training-components";

export default function TrainingScenariosPage() {
  const [settings] = useLocalSettings();
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [scenarioName, setScenarioName] = useState("首次接触低信任客户");
  const [scenarioDescription, setScenarioDescription] =
    useState(scenarioDefault);
  const [scenarioJson, setScenarioJson] = useState("{}");
  const [scenarioMeta, setScenarioMeta] = useState({
    summary: "",
    sales_stage: "first_meeting",
    product_type: "critical_illness",
    difficulty: "medium",
    recommended_turns: 8,
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    setScenarios(await trainingApi.scenarios());
  }

  useEffect(() => {
    document.title = "场景工厂 - DeerFlow";
    void reload().catch(showError);
  }, []);

  async function parseScenario() {
    setBusy("parse-scenario");
    try {
      const parsed = await trainingApi.parseScenario({
        name: scenarioName,
        description: scenarioDescription,
        model_name: settings.training.model_name,
      });
      setScenarioMeta({
        summary: parsed.summary ?? "",
        sales_stage: parsed.sales_stage ?? "first_meeting",
        product_type: parsed.product_type ?? "critical_illness",
        difficulty: parsed.difficulty ?? "medium",
        recommended_turns: parsed.recommended_turns ?? 8,
      });
      setScenarioJson(pretty(parsed.structured_scenario));
      if (parsed.parse_error)
        toast.warning("AI JSON 解析不完整，已填入可编辑草稿。");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function saveScenario() {
    setBusy("save-scenario");
    try {
      await trainingApi.createScenario({
        name: scenarioName,
        description: scenarioDescription,
        summary: scenarioMeta.summary,
        sales_stage: scenarioMeta.sales_stage,
        product_type: scenarioMeta.product_type,
        difficulty: scenarioMeta.difficulty,
        recommended_turns: scenarioMeta.recommended_turns,
        structured_scenario: parseJsonObject(scenarioJson),
      });
      toast.success("场景已保存");
      await reload();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

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
        description="把训练背景拆成销售阶段、客户状态、代理人目标和合规约束，后续可复用到不同角色组合。"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void reload().catch(showError)}
        >
          <RefreshCwIcon className="size-4" />
          刷新
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          icon={FileTextIcon}
          label="训练场景"
          value={scenarios.length}
        />
        <MetricTile
          icon={TargetIcon}
          label="默认阶段"
          value={scenarioMeta.sales_stage || "未设置"}
        />
        <MetricTile
          icon={GaugeIcon}
          label="建议轮数"
          value={`${scenarioMeta.recommended_turns} 轮`}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[520px_minmax(0,1fr)]">
        <Panel>
          <SectionTitle
            icon={SparklesIcon}
            title="新建场景"
            description="用业务语言写训练意图，AI 会转换成可执行的训练约束。"
          />

          <div className="mt-4 space-y-3">
            <FieldBlock label="场景名称">
              <Input
                value={scenarioName}
                onChange={(event) => setScenarioName(event.target.value)}
              />
            </FieldBlock>
            <FieldBlock label="自然语言描述">
              <Textarea
                rows={6}
                value={scenarioDescription}
                onChange={(event) => setScenarioDescription(event.target.value)}
              />
            </FieldBlock>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy === "parse-scenario"}
                onClick={() => void parseScenario()}
              >
                <SparklesIcon className="size-4" />
                AI 解析
              </Button>
              <Button
                variant="outline"
                disabled={busy === "save-scenario"}
                onClick={() => void saveScenario()}
              >
                保存场景
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FieldBlock label="销售阶段">
                <Input
                  value={scenarioMeta.sales_stage}
                  onChange={(event) =>
                    setScenarioMeta({
                      ...scenarioMeta,
                      sales_stage: event.target.value,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock label="产品类型">
                <Input
                  value={scenarioMeta.product_type}
                  onChange={(event) =>
                    setScenarioMeta({
                      ...scenarioMeta,
                      product_type: event.target.value,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock label="难度">
                <Input
                  value={scenarioMeta.difficulty}
                  onChange={(event) =>
                    setScenarioMeta({
                      ...scenarioMeta,
                      difficulty: event.target.value,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock label="建议轮数">
                <Input
                  type="number"
                  value={scenarioMeta.recommended_turns}
                  onChange={(event) =>
                    setScenarioMeta({
                      ...scenarioMeta,
                      recommended_turns: Number(event.target.value),
                    })
                  }
                />
              </FieldBlock>
            </div>

            <FieldBlock label="一句话摘要">
              <Input
                value={scenarioMeta.summary}
                onChange={(event) =>
                  setScenarioMeta({
                    ...scenarioMeta,
                    summary: event.target.value,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock label="结构化场景 JSON">
              <Textarea
                className="font-mono text-xs"
                rows={10}
                value={scenarioJson}
                onChange={(event) => setScenarioJson(event.target.value)}
              />
            </FieldBlock>
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            icon={FileTextIcon}
            title="场景库"
            description="对练页会从这里选择场景，和客户、代理人组合生成训练任务。"
          />
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {scenarios.length ? (
              scenarios.map((scenario) => (
                <div key={scenario.id} className="group relative">
                  <ScenarioCard scenario={scenario} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 size-8 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    disabled={busy === `delete-scenario-${scenario.id}`}
                    title="删除场景"
                    onClick={() => deleteScenario(scenario)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="lg:col-span-2">
                <EmptyState
                  icon={FileTextIcon}
                  title="还没有训练场景"
                  description="保存左侧草稿后，这里会出现可选场景。"
                />
              </div>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
