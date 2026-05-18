"use client";

import {
  ArrowLeftIcon,
  BotIcon,
  CheckIcon,
  Loader2Icon,
  SaveIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalSettings } from "@/core/settings";
import { trainingApi, type TrainingRoleType } from "@/core/training/api";
import { buildTrainingModelOverride } from "@/core/training/settings";
import { cn } from "@/lib/utils";

import {
  agentAvatarUrls,
  customerAvatarUrls,
  FieldBlock,
  PageHeader,
  Panel,
  parseJsonObject,
  pretty,
  roleDefaults,
  SectionTitle,
  showError,
  splitTags,
  TagList,
} from "../training-components";

type RoleEditorMode = "create" | "edit";

export function RoleEditor({
  mode,
  roleId,
}: {
  mode: RoleEditorMode;
  roleId?: string;
}) {
  const router = useRouter();
  const [settings] = useLocalSettings();
  const [roleType, setRoleType] = useState<TrainingRoleType>("customer");
  const [roleName, setRoleName] = useState("谨慎型宝妈客户");
  const [roleDescription, setRoleDescription] = useState(roleDefaults.customer);
  const [roleSummary, setRoleSummary] = useState("");
  const [roleTags, setRoleTags] = useState("");
  const [roleProfileJson, setRoleProfileJson] = useState("{}");
  const [avatarUrl, setAvatarUrl] = useState(customerAvatarUrls[0] ?? "");
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(
    mode === "edit" ? "load" : null,
  );

  const profile = useMemo(
    () => parseJsonObject(roleProfileJson),
    [roleProfileJson],
  );
  const roleSoul = readRoleSoul(profile);
  const tags = splitTags(roleTags);

  useEffect(() => {
    document.title =
      mode === "edit" ? "编辑角色 - DeerFlow" : "新建角色 - DeerFlow";
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !roleId) return;
    setBusy("load");
    void trainingApi
      .getRole(roleId)
      .then((role) => {
        setRoleType(role.role_type);
        setRoleName(role.name);
        setRoleDescription(role.description);
        setRoleSummary(role.summary);
        setRoleTags(role.tags.join("，"));
        setRoleProfileJson(pretty(role.structured_profile));
        setAvatarUrl(role.avatar_url ?? "");
        setVersion(role.version);
      })
      .catch(showError)
      .finally(() => setBusy(null));
  }, [mode, roleId]);

  function changeRoleType(type: TrainingRoleType) {
    setRoleType(type);
    if (mode === "edit") return;
    setRoleName(type === "customer" ? "谨慎型宝妈客户" : "共情型新人代理人");
    setRoleDescription(roleDefaults[type]);
    setRoleSummary("");
    setRoleTags("");
    setRoleProfileJson("{}");
    setAvatarUrl(
      type === "customer"
        ? (customerAvatarUrls[0] ?? "")
        : (agentAvatarUrls[0] ?? ""),
    );
  }

  async function parseRole() {
    setBusy("parse");
    try {
      const parsed = await trainingApi.parseRole({
        role_type: roleType,
        name: roleName,
        description: roleDescription,
        training_model: buildTrainingModelOverride(settings.training),
      });
      if (parsed.name) setRoleName(parsed.name);
      if (parsed.detected_role_type && parsed.detected_role_type !== roleType) {
        setRoleType(parsed.detected_role_type);
        setAvatarUrl(
          parsed.detected_role_type === "customer"
            ? (customerAvatarUrls[0] ?? "")
            : (agentAvatarUrls[0] ?? ""),
        );
        toast.info(
          parsed.detected_role_type === "agent"
            ? "已识别为代理人/规划师画像。"
            : "已识别为客户画像。",
        );
      }
      setRoleSummary(parsed.summary ?? "");
      setRoleTags((parsed.tags ?? []).join("，"));
      setRoleProfileJson(pretty(parsed.structured_profile));
      if (parsed.parse_error)
        toast.warning("AI JSON 解析不完整，已填入可编辑草稿。");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function saveRole() {
    setBusy("save");
    const payload = {
      role_type: roleType,
      name: roleName,
      description: roleDescription,
      summary: roleSummary,
      structured_profile: profile,
      tags,
      avatar_url: avatarUrl,
    };
    try {
      const saved =
        mode === "edit" && roleId
          ? await trainingApi.updateRole(roleId, payload)
          : await trainingApi.createRole(payload);
      toast.success(mode === "edit" ? "角色已更新" : "角色已保存");
      router.push(`/workspace/training/roles/${saved.id}`);
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
          正在读取角色画像
        </div>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader
        icon={roleType === "customer" ? UserRoundIcon : BotIcon}
        title={mode === "edit" ? `编辑角色：${roleName}` : "新建角色"}
        description="把自然语言人物稿拆成可维护画像，并预览它会如何影响后续角色扮演。"
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/workspace/training/roles">
              <ArrowLeftIcon className="size-4" />
              返回角色库
            </Link>
          </Button>
          <Button size="sm" disabled={busy === "save"} onClick={saveRole}>
            {busy === "save" ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            保存画像
          </Button>
        </div>
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel>
            <SectionTitle
              icon={SparklesIcon}
              title="1. 输入人物素材"
              description="先粘贴完整人物稿或业务描述，再让模型提取画像结构。"
            />
            <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(["customer", "agent"] as const).map((type) => (
                    <Button
                      key={type}
                      variant={roleType === type ? "default" : "outline"}
                      size="sm"
                      onClick={() => changeRoleType(type)}
                    >
                      {type === "customer" ? "客户" : "代理人"}
                    </Button>
                  ))}
                </div>
                <FieldBlock label="角色名称">
                  <Input
                    value={roleName}
                    onChange={(event) => setRoleName(event.target.value)}
                  />
                </FieldBlock>
                <AvatarPicker
                  roleType={roleType}
                  value={avatarUrl}
                  onChange={setAvatarUrl}
                />
              </div>
              <div className="space-y-3">
                <FieldBlock label="自然语言描述">
                  <Textarea
                    rows={11}
                    value={roleDescription}
                    onChange={(event) => setRoleDescription(event.target.value)}
                  />
                </FieldBlock>
                <Button disabled={busy === "parse"} onClick={parseRole}>
                  {busy === "parse" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-4" />
                  )}
                  AI 解析并补齐画像
                </Button>
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle
              icon={CheckIcon}
              title="2. 校准可见画像"
              description="这里是业务人员最常改的内容，后续对练会优先读取这些摘要、标签和结构化信息。"
            />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <FieldBlock label="一句话摘要">
                <Input
                  value={roleSummary}
                  onChange={(event) => setRoleSummary(event.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="标签，用逗号分隔">
                <Input
                  value={roleTags}
                  onChange={(event) => setRoleTags(event.target.value)}
                />
              </FieldBlock>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <PreviewTile title="身份锚点" value={roleSoul.identity} />
              <PreviewTile title="语言风格" value={roleSoul.speechStyle} />
              <PreviewTile title="行为规则" value={roleSoul.responseRules} />
            </div>
          </Panel>

          <Panel>
            <SectionTitle
              icon={SparklesIcon}
              title="3. 结构化画像"
              description="高级编辑区会完整保留 AI 解析的画像、soul.md、常用表达和隐藏状态。"
            />
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <FieldBlock label="结构化画像 JSON">
                <Textarea
                  className="font-mono text-xs"
                  rows={18}
                  value={roleProfileJson}
                  onChange={(event) => setRoleProfileJson(event.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="soul.md 预览">
                <Textarea
                  readOnly
                  className="bg-muted/30 font-mono text-xs"
                  rows={18}
                  value={roleSoul.markdown}
                />
              </FieldBlock>
            </div>
          </Panel>
        </div>

        <Panel className="xl:sticky xl:top-4">
          <SectionTitle
            icon={roleType === "customer" ? UserRoundIcon : BotIcon}
            title="画像预览"
            description="保存前确认这个角色是否足够像一个真实训练对象。"
          />
          <div className="mt-4 space-y-4">
            <div className="flex gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={roleName}
                  className="size-16 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-md border">
                  {roleType === "customer" ? (
                    <UserRoundIcon className="text-muted-foreground size-6" />
                  ) : (
                    <BotIcon className="text-muted-foreground size-6" />
                  )}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{roleName}</div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {roleType === "customer" ? "模拟客户" : "模拟代理人"}
                  {version ? ` · v${version}` : ""}
                </div>
                <div className="mt-2">
                  <TagList tags={tags} />
                </div>
              </div>
            </div>
            <p className="text-muted-foreground rounded-md border p-3 text-sm leading-6">
              {roleSummary || roleDescription || "等待填写角色描述。"}
            </p>
            <div className="space-y-2">
              {roleSoul.commonPhrases.slice(0, 4).map((phrase, index) => (
                <div
                  key={`${phrase}-${index}`}
                  className="bg-muted/20 rounded-md border px-3 py-2 text-xs leading-5"
                >
                  {phrase}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function AvatarPicker({
  roleType,
  value,
  onChange,
}: {
  roleType: TrainingRoleType;
  value: string;
  onChange: (value: string) => void;
}) {
  const urls = roleType === "customer" ? customerAvatarUrls : agentAvatarUrls;
  return (
    <div>
      <div className="text-muted-foreground mb-2 text-xs font-medium">头像</div>
      <div className="grid grid-cols-3 gap-2">
        {urls.map((url) => (
          <button
            type="button"
            key={url}
            onClick={() => onChange(url)}
            className={cn(
              "bg-background hover:border-primary/60 rounded-md border p-1 transition-colors",
              value === url && "border-primary bg-primary/5",
            )}
          >
            <img
              src={url}
              alt=""
              className="aspect-square rounded object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewTile({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-muted/20 min-h-24 rounded-md border p-3">
      <div className="text-xs font-semibold">{title}</div>
      <p className="text-muted-foreground mt-2 line-clamp-3 text-xs leading-5">
        {value.trim() ? value : "AI 解析后会显示。"}
      </p>
    </div>
  );
}

function readRoleSoul(profile: Record<string, unknown>) {
  const roleSoul =
    readObject(profile.role_soul) ??
    readObject(readObject(profile.structured_profile)?.role_soul) ??
    {};
  const identity = readObject(roleSoul.identity_anchor);
  const speechStyle = readStringList(roleSoul.speech_style);
  const commonPhrases = readStringList(roleSoul.common_phrases);
  const responseRules = readStringList(roleSoul.response_rules);
  const profileMarkdown = readString(profile.soul_markdown);
  const soulMarkdown = readString(roleSoul.soul_markdown);
  const markdown = profileMarkdown.trim()
    ? profileMarkdown
    : soulMarkdown.trim()
      ? soulMarkdown
      : "等待 AI 解析后生成 soul.md。";

  return {
    identity: identity
      ? Object.values(identity).filter(Boolean).join(" / ")
      : readString(readObject(profile.basic_info)?.姓名),
    speechStyle: speechStyle.join("；"),
    commonPhrases,
    responseRules: responseRules.join("；"),
    markdown,
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
