"use client";

import {
  ArrowLeftIcon,
  CheckIcon,
  FileTextIcon,
  GaugeIcon,
  Loader2Icon,
  SaveIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalSettings } from "@/core/settings";
import { trainingApi, type TrainingScenario } from "@/core/training/api";
import { buildTrainingModelOverride } from "@/core/training/settings";

import {
  FieldBlock,
  PageHeader,
  Panel,
  parseJsonObject,
  pretty,
  scenarioDefault,
  SectionTitle,
  showError,
} from "../training-components";

type ScenarioEditorMode = "create" | "edit";

export function ScenarioEditor({
  mode,
  scenarioId,
}: {
  mode: ScenarioEditorMode;
  scenarioId?: string;
}) {
  const router = useRouter();
  const [settings] = useLocalSettings();
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
  const [busy, setBusy] = useState<string | null>(
    mode === "edit" ? "load" : null,
  );

  const structuredScenario = useMemo(
    () => parseJsonObject(scenarioJson),
    [scenarioJson],
  );
  const preview = readScenarioPreview(structuredScenario);

  useEffect(() => {
    document.title =
      mode === "edit" ? "编辑场景 - DeerFlow" : "新建场景 - DeerFlow";
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !scenarioId) return;
    setBusy("load");
    void trainingApi
      .getScenario(scenarioId)
      .then((scenario) => {
        setScenarioName(scenario.name);
        setScenarioDescription(scenario.description);
        setScenarioMeta({
          summary: scenario.summary,
          sales_stage: scenario.sales_stage,
          product_type: scenario.product_type,
          difficulty: scenario.difficulty,
          recommended_turns: scenario.recommended_turns,
        });
        setScenarioJson(pretty(scenario.structured_scenario));
      })
      .catch(showError)
      .finally(() => setBusy(null));
  }, [mode, scenarioId]);

  async function parseScenario() {
    setBusy("parse");
    try {
      const parsed = await trainingApi.parseScenario({
        name: scenarioName,
        description: scenarioDescription,
        training_model: buildTrainingModelOverride(settings.training),
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
    setBusy("save");
    const payload: Omit<TrainingScenario, "id"> = {
      name: scenarioName,
      description: scenarioDescription,
      summary: scenarioMeta.summary,
      sales_stage: scenarioMeta.sales_stage,
      product_type: scenarioMeta.product_type,
      difficulty: scenarioMeta.difficulty,
      recommended_turns: scenarioMeta.recommended_turns,
      structured_scenario: structuredScenario,
    };
    try {
      const saved =
        mode === "edit" && scenarioId
          ? await trainingApi.updateScenario(scenarioId, payload)
          : await trainingApi.createScenario(payload);
      toast.success(mode === "edit" ? "场景已更新" : "场景已保存");
      router.push(`/workspace/training/scenarios/${saved.id}`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  if (busy === "load") {
    return (
      <Panel className="flex min-h-72 items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2Icon className="size-4 animate-spin" />
          正在读取训练场景
        </div>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader
        icon={FileTextIcon}
        title={mode === "edit" ? `编辑场景：${scenarioName}` : "新建场景"}
        description="把训练背景拆成目标、客户状态、代理人任务、合规约束和可复用变量。"
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/workspace/training/scenarios">
              <ArrowLeftIcon className="size-4" />
              返回场景库
            </Link>
          </Button>
          <Button size="sm" disabled={busy === "save"} onClick={saveScenario}>
            {busy === "save" ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            保存场景
          </Button>
        </div>
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel>
            <SectionTitle
              icon={SparklesIcon}
              title="1. 输入训练背景"
              description="先写业务语境，AI 会拆成可执行的训练任务。"
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
                  rows={9}
                  value={scenarioDescription}
                  onChange={(event) =>
                    setScenarioDescription(event.target.value)
                  }
                />
              </FieldBlock>
              <Button disabled={busy === "parse"} onClick={parseScenario}>
                {busy === "parse" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                AI 解析训练场景
              </Button>
            </div>
          </Panel>

          <Panel>
            <SectionTitle
              icon={TargetIcon}
              title="2. 校准训练目标"
              description="这些字段会直接影响模拟对练和复盘评分。"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <div className="mt-3">
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
            </div>
          </Panel>

          <Panel>
            <SectionTitle
              icon={CheckIcon}
              title="3. 训练任务结构"
              description="高级编辑区保留客户状态、代理人目标、合规约束、异议和观察点。"
            />
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <FieldBlock label="结构化场景 JSON">
                <Textarea
                  className="font-mono text-xs"
                  rows={18}
                  value={scenarioJson}
                  onChange={(event) => setScenarioJson(event.target.value)}
                />
              </FieldBlock>
              <div className="grid content-start gap-3">
                <PreviewBlock title="代理人目标" items={preview.agentGoal} />
                <PreviewBlock title="客户异议" items={preview.objections} />
                <PreviewBlock title="合规约束" items={preview.constraints} />
                <PreviewBlock title="复盘观察点" items={preview.focusPoints} />
              </div>
            </div>
          </Panel>
        </div>

        <Panel className="xl:sticky xl:top-4">
          <SectionTitle
            icon={GaugeIcon}
            title="场景预览"
            description="确认它是否像一个明确的训练任务。"
          />
          <div className="mt-4 space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-semibold">{scenarioName}</div>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {scenarioMeta.summary ||
                  scenarioDescription ||
                  "等待填写训练场景描述。"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Meta label="销售阶段" value={scenarioMeta.sales_stage} />
              <Meta label="产品类型" value={scenarioMeta.product_type} />
              <Meta label="难度" value={scenarioMeta.difficulty} />
              <Meta
                label="建议轮数"
                value={`${scenarioMeta.recommended_turns} 轮`}
              />
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function PreviewBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-sm font-semibold">{title}</div>
      {items.length ? (
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
          {items.slice(0, 5).map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">AI 解析后会显示。</p>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/20 rounded-md border p-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{value || "未设置"}</div>
    </div>
  );
}

function readScenarioPreview(profile: Record<string, unknown>) {
  return {
    agentGoal: readStringList(profile.agent_goal),
    objections: readStringList(profile.possible_objections),
    constraints: readStringList(profile.constraints),
    focusPoints: readStringList(profile.focus_points),
  };
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
