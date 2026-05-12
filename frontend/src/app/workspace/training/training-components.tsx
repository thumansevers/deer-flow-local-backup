"use client";

import {
  BotIcon,
  FileTextIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react";
import { type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";

import { type TrainingRole, type TrainingScenario } from "@/core/training/api";
import { cn } from "@/lib/utils";

export const avatarUrls = Array.from(
  { length: 10 },
  (_, i) => `/training/avatars/persona-${String(i + 1).padStart(2, "0")}.png`,
);

export const roleDefaults = {
  customer:
    "35岁，已婚，有一个孩子，收入稳定但比较谨慎。对保险销售有防备心理，不喜欢被强推，关注家庭医疗风险和孩子教育问题。",
  agent:
    "从业2年的保险代理人，态度真诚，擅长共情，但需求挖掘不够深入，容易过早介绍产品，希望提升异议处理和成交推进能力。",
};

export const scenarioDefault =
  "客户第一次见代理人，对保险不太信任，只是被朋友介绍来了解一下，不想马上买。训练目标是先建立信任，完成家庭风险和保障缺口的需求挖掘。";

export function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function splitTags(value: string) {
  return value
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : String(error));
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-background flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 gap-3">
        <div className="bg-primary/10 text-primary border-primary/10 flex size-10 shrink-0 items-center justify-center rounded-md border">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
            {description}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="bg-primary/10 text-primary border-primary/10 flex size-9 shrink-0 items-center justify-center rounded-md border">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          {description}
        </p>
      </div>
    </div>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-background rounded-lg border p-4", className)}>
      {children}
    </section>
  );
}

export function FieldBlock({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-muted/20 flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center">
      <Icon className="text-muted-foreground size-6" />
      <div className="mt-3 text-sm font-medium">{title}</div>
      <div className="text-muted-foreground mt-1 max-w-sm text-xs leading-5">
        {description}
      </div>
    </div>
  );
}

export function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-background/80 flex min-w-32 items-center gap-3 rounded-md border px-3 py-2">
      <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
        <Icon className="size-4" />
      </div>
      <div>
        <div className="text-muted-foreground text-[11px] leading-4">
          {label}
        </div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

export function TagList({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, 6).map((tag) => (
        <span
          key={tag}
          className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px] leading-4"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function RoleCard({
  role,
  active,
  onClick,
}: {
  role: TrainingRole;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group hover:border-primary/40 hover:bg-muted/50 bg-background flex min-h-28 w-full gap-3 rounded-md border p-3 text-left transition-colors",
        active && "border-primary bg-primary/5 shadow-sm",
      )}
    >
      {role.avatar_url ? (
        <img
          src={role.avatar_url}
          alt={role.name}
          className="size-14 shrink-0 rounded-md border object-cover"
        />
      ) : (
        <div className="bg-muted flex size-14 shrink-0 items-center justify-center rounded-md border">
          {role.role_type === "customer" ? (
            <UserRoundIcon className="text-muted-foreground size-5" />
          ) : (
            <BotIcon className="text-muted-foreground size-5" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium">{role.name}</div>
          <span className="text-muted-foreground bg-background shrink-0 rounded border px-1.5 py-0.5 text-[11px]">
            v{role.version}
          </span>
        </div>
        <p className="text-muted-foreground line-clamp-2 text-xs leading-5">
          {role.summary || role.description}
        </p>
        <TagList tags={role.tags} />
      </div>
    </button>
  );
}

export function ScenarioCard({
  scenario,
  active,
  onClick,
}: {
  scenario: TrainingScenario;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:border-primary/40 hover:bg-muted/50 bg-background w-full rounded-md border p-3 text-left transition-colors",
        active && "border-primary bg-primary/5 shadow-sm",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-medium">{scenario.name}</div>
        <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-[11px]">
          {scenario.difficulty}
        </span>
      </div>
      <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-5">
        {scenario.summary || scenario.description}
      </p>
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span>{scenario.sales_stage || "未设置阶段"}</span>
        <span>{scenario.product_type || "通用产品"}</span>
        <span>{scenario.recommended_turns} 轮</span>
      </div>
    </button>
  );
}

export function ReportList({
  title,
  items,
}: {
  title: string;
  items?: string[];
}) {
  if (!items?.length) return null;
  return (
    <div className="rounded-md border p-3">
      <h3 className="mb-2 text-xs font-semibold">{title}</h3>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs leading-5">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function SelectedLine({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="bg-muted/20 rounded-md border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">
        {value ?? "未选择"}
      </div>
    </div>
  );
}

export const roleTypeIcon = {
  customer: UserRoundIcon,
  agent: BotIcon,
};

export const pageIcons = {
  roles: ShieldCheckIcon,
  scenarios: FileTextIcon,
};
