"use client";

import {
  BotIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useModels } from "@/core/models/hooks";
import { useLocalSettings } from "@/core/settings";

import {
  MetricTile,
  PageHeader,
  Panel,
  SectionTitle,
} from "../training-components";

const DEFAULT_MODEL_VALUE = "__default__";

export default function TrainingSettingsPage() {
  const [settings, setSettings] = useLocalSettings();
  const { models, isLoading } = useModels();

  const deerflowModel = useMemo(
    () =>
      models.find((model) => model.name === settings.context.model_name) ??
      models[0],
    [models, settings.context.model_name],
  );
  const trainingModel = useMemo(
    () =>
      models.find((model) => model.name === settings.training.model_name) ??
      models[0],
    [models, settings.training.model_name],
  );

  useEffect(() => {
    document.title = "模型设置 - DeerFlow";
  }, []);

  function updateDeerFlowModel(value: string) {
    setSettings("context", {
      model_name: value === DEFAULT_MODEL_VALUE ? undefined : value,
    });
    toast.success("DeerFlow 默认模型已更新");
  }

  function updateTrainingModel(value: string) {
    setSettings("training", {
      model_name: value === DEFAULT_MODEL_VALUE ? undefined : value,
    });
    toast.success("保险训练模型已更新");
  }

  return (
    <>
      <PageHeader
        icon={SettingsIcon}
        title="模型设置"
        description="分别设置普通 DeerFlow 对话和保险训练解析、对练、复盘使用的大模型。"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          <RefreshCwIcon className="size-4" />
          刷新模型
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile icon={BotIcon} label="可用模型" value={models.length} />
        <MetricTile
          icon={BrainCircuitIcon}
          label="DeerFlow 默认"
          value={deerflowModel?.display_name ?? "配置默认"}
        />
        <MetricTile
          icon={CheckCircle2Icon}
          label="保险训练"
          value={trainingModel?.display_name ?? "配置默认"}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <ModelSettingsPanel
          icon={BrainCircuitIcon}
          title="DeerFlow 对话模型"
          description="用于普通聊天工作区的新对话默认模型。已经在某个线程里单独选过模型时，该线程会继续使用自己的选择。"
          value={settings.context.model_name ?? DEFAULT_MODEL_VALUE}
          fallbackName={models[0]?.display_name ?? "配置默认模型"}
          models={models}
          disabled={isLoading || models.length === 0}
          onValueChange={updateDeerFlowModel}
        />
        <ModelSettingsPanel
          icon={BotIcon}
          title="保险训练模型"
          description="用于角色解析、场景解析、模拟客户回复、自动代理人回复和复盘报告。为空时使用 config.yaml 里的第一个模型。"
          value={settings.training.model_name ?? DEFAULT_MODEL_VALUE}
          fallbackName={models[0]?.display_name ?? "配置默认模型"}
          models={models}
          disabled={isLoading || models.length === 0}
          onValueChange={updateTrainingModel}
        />
      </div>
    </>
  );
}

function ModelSettingsPanel({
  icon,
  title,
  description,
  value,
  fallbackName,
  models,
  disabled,
  onValueChange,
}: {
  icon: typeof BrainCircuitIcon;
  title: string;
  description: string;
  value: string;
  fallbackName: string;
  models: {
    name: string;
    model: string;
    display_name: string;
    supports_thinking?: boolean;
    supports_reasoning_effort?: boolean;
  }[];
  disabled: boolean;
  onValueChange: (value: string) => void;
}) {
  const selected =
    value === DEFAULT_MODEL_VALUE
      ? undefined
      : models.find((model) => model.name === value);

  return (
    <Panel>
      <SectionTitle icon={icon} title={title} description={description} />
      <div className="mt-5 space-y-4">
        <Select value={value} disabled={disabled} onValueChange={onValueChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_MODEL_VALUE}>
              配置默认模型（{fallbackName}）
            </SelectItem>
            {models.map((model) => (
              <SelectItem key={model.name} value={model.name}>
                {model.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="bg-muted/30 rounded-md border p-3 text-sm">
          <div className="font-medium">
            {selected?.display_name ?? `配置默认模型：${fallbackName}`}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            {selected?.model ?? models[0]?.model ?? "暂无模型信息"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="bg-background rounded border px-2 py-1">
              思考模式：{selected?.supports_thinking ? "支持" : "未声明"}
            </span>
            <span className="bg-background rounded border px-2 py-1">
              推理强度：
              {selected?.supports_reasoning_effort ? "支持" : "未声明"}
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
