"use client";

import {
  BotIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  RefreshCwIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useModels } from "@/core/models/hooks";
import { useLocalSettings } from "@/core/settings";
import type { LocalSettings } from "@/core/settings/local";

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

  const configuredTrainingModel = useMemo(
    () =>
      models.find((model) => model.name === settings.training.model_name) ??
      models[0],
    [models, settings.training.model_name],
  );
  const customTrainingModel = settings.training.custom_model;
  const trainingSource = settings.training.source ?? "configured";

  useEffect(() => {
    document.title = "模型设置 - DeerFlow";
  }, []);

  function updateDeerFlowModel(value: string) {
    setSettings("context", {
      model_name: value === DEFAULT_MODEL_VALUE ? undefined : value,
    });
    toast.success("DeerFlow 默认模型已更新");
  }

  function updateTraining(patch: Partial<LocalSettings["training"]>) {
    setSettings("training", {
      ...settings.training,
      ...patch,
    });
  }

  function updateCustomModel(
    patch: Partial<NonNullable<LocalSettings["training"]["custom_model"]>>,
  ) {
    updateTraining({
      custom_model: {
        ...settings.training.custom_model,
        ...patch,
      },
    });
  }

  function updateTrainingModel(value: string) {
    updateTraining({
      model_name: value === DEFAULT_MODEL_VALUE ? undefined : value,
    });
    toast.success("保险训练模型已更新");
  }

  function updateTrainingSource(value: "configured" | "custom") {
    updateTraining({ source: value });
    toast.success(
      value === "custom" ? "已启用自定义训练模型" : "已切回已配置模型",
    );
  }

  return (
    <>
      <PageHeader
        icon={SettingsIcon}
        title="模型设置"
        description="保险训练可以使用 DeerFlow 已配置模型，也可以单独配置兼容模型的 Base URL、API Key 和生成参数。"
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
          value={
            trainingSource === "custom"
              ? (customTrainingModel?.display_name ?? "自定义模型")
              : (configuredTrainingModel?.display_name ?? "配置默认")
          }
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <ModelSelectPanel
          icon={BrainCircuitIcon}
          title="DeerFlow 对话模型"
          description="用于普通聊天工作区的新对话默认模型。线程内手动选择过模型时，会优先使用线程自己的选择。"
          value={settings.context.model_name ?? DEFAULT_MODEL_VALUE}
          fallbackName={models[0]?.display_name ?? "配置默认模型"}
          models={models}
          disabled={isLoading || models.length === 0}
          onValueChange={updateDeerFlowModel}
        />

        <Panel>
          <SectionTitle
            icon={KeyRoundIcon}
            title="保险训练模型连接"
            description="只影响角色解析、场景解析、模拟对练和复盘报告。自定义配置保存在浏览器本地。"
          />

          <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="space-y-3">
              <SettingLabel label="模型来源" />
              <Select
                value={trainingSource}
                onValueChange={(value) =>
                  updateTrainingSource(value as "configured" | "custom")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="configured">
                    使用 DeerFlow 已配置模型
                  </SelectItem>
                  <SelectItem value="custom">自定义兼容模型</SelectItem>
                </SelectContent>
              </Select>

              {trainingSource === "configured" ? (
                <>
                  <SettingLabel label="训练模型" />
                  <Select
                    value={settings.training.model_name ?? DEFAULT_MODEL_VALUE}
                    disabled={isLoading || models.length === 0}
                    onValueChange={updateTrainingModel}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_MODEL_VALUE}>
                        配置默认模型（{models[0]?.display_name ?? "默认模型"}）
                      </SelectItem>
                      {models.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          {model.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <div className="bg-muted/30 rounded-md border p-3 text-xs leading-5">
                  当前自定义模式按 DeepSeek/OpenAI 兼容 Chat Completions
                  接口创建模型。API Key 可以直接填写，也可以填写形如
                  `$DEEPSEEK_API_KEY` 的环境变量名。
                </div>
              )}
            </div>

            <div className="space-y-4">
              {trainingSource === "configured" ? (
                <ModelSummary
                  title={
                    configuredTrainingModel?.display_name ?? "配置默认模型"
                  }
                  model={configuredTrainingModel?.model ?? "暂无模型信息"}
                  supportsThinking={
                    configuredTrainingModel?.supports_thinking ?? false
                  }
                  supportsReasoningEffort={
                    configuredTrainingModel?.supports_reasoning_effort ?? false
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <ModelField label="显示名称">
                    <Input
                      value={customTrainingModel?.display_name ?? ""}
                      onChange={(event) =>
                        updateCustomModel({ display_name: event.target.value })
                      }
                    />
                  </ModelField>
                  <ModelField label="模型 ID">
                    <Input
                      value={customTrainingModel?.model ?? ""}
                      onChange={(event) =>
                        updateCustomModel({ model: event.target.value })
                      }
                    />
                  </ModelField>
                  <ModelField label="Base URL">
                    <Input
                      value={customTrainingModel?.base_url ?? ""}
                      onChange={(event) =>
                        updateCustomModel({ base_url: event.target.value })
                      }
                    />
                  </ModelField>
                  <ModelField label="API Key">
                    <Input
                      type="password"
                      value={customTrainingModel?.api_key ?? ""}
                      onChange={(event) =>
                        updateCustomModel({ api_key: event.target.value })
                      }
                    />
                  </ModelField>
                  <ModelField label="温度">
                    <Input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={customTrainingModel?.temperature ?? 0.7}
                      onChange={(event) =>
                        updateCustomModel({
                          temperature: Number(event.target.value),
                        })
                      }
                    />
                  </ModelField>
                  <ModelField label="最大输出 Token">
                    <Input
                      type="number"
                      min={512}
                      max={32768}
                      step={512}
                      value={customTrainingModel?.max_tokens ?? 8192}
                      onChange={(event) =>
                        updateCustomModel({
                          max_tokens: Number(event.target.value),
                        })
                      }
                    />
                  </ModelField>
                  <ModelField label="请求超时（秒）">
                    <Input
                      type="number"
                      min={30}
                      max={3600}
                      step={30}
                      value={customTrainingModel?.request_timeout ?? 600}
                      onChange={(event) =>
                        updateCustomModel({
                          request_timeout: Number(event.target.value),
                        })
                      }
                    />
                  </ModelField>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function ModelSelectPanel({
  icon,
  title,
  description,
  value,
  fallbackName,
  models,
  disabled,
  onValueChange,
}: {
  icon: LucideIcon;
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

        <ModelSummary
          title={selected?.display_name ?? `配置默认模型：${fallbackName}`}
          model={selected?.model ?? models[0]?.model ?? "暂无模型信息"}
          supportsThinking={selected?.supports_thinking ?? false}
          supportsReasoningEffort={selected?.supports_reasoning_effort ?? false}
        />
      </div>
    </Panel>
  );
}

function ModelSummary({
  title,
  model,
  supportsThinking,
  supportsReasoningEffort,
}: {
  title: string;
  model: string;
  supportsThinking: boolean;
  supportsReasoningEffort: boolean;
}) {
  return (
    <div className="bg-muted/30 rounded-md border p-3 text-sm">
      <div className="font-medium">{title}</div>
      <div className="text-muted-foreground mt-1 text-xs">{model}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="bg-background rounded border px-2 py-1">
          思考模式：{supportsThinking ? "支持" : "未声明"}
        </span>
        <span className="bg-background rounded border px-2 py-1">
          推理强度：{supportsReasoningEffort ? "支持" : "未声明"}
        </span>
      </div>
    </div>
  );
}

function SettingLabel({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground text-xs font-medium">{label}</div>
  );
}

function ModelField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <SettingLabel label={label} />
      {children}
    </label>
  );
}
