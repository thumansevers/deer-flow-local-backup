import type { LocalSettings } from "@/core/settings/local";

import type { TrainingModelOverride } from "./api";

export function buildTrainingModelOverride(
  training: LocalSettings["training"],
): TrainingModelOverride | undefined {
  if (training.source === "custom") {
    const custom = training.custom_model;
    if (
      !custom?.model?.trim() ||
      !custom.base_url?.trim() ||
      !custom.api_key?.trim()
    ) {
      return undefined;
    }
    return {
      custom_model: {
        provider: custom.provider ?? "deepseek_compatible",
        display_name: custom.display_name?.trim() ?? "自定义保险训练模型",
        model: custom.model.trim(),
        base_url: custom.base_url.trim(),
        api_key: custom.api_key.trim(),
        temperature: custom.temperature ?? 0.7,
        max_tokens: custom.max_tokens ?? 8192,
        request_timeout: custom.request_timeout ?? 600,
      },
    };
  }

  return training.model_name
    ? {
        model_name: training.model_name,
      }
    : undefined;
}
