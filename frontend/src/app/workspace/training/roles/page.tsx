"use client";

import {
  BotIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  trainingApi,
  type TrainingRole,
  type TrainingRoleType,
} from "@/core/training/api";
import { cn } from "@/lib/utils";

import {
  avatarUrls,
  EmptyState,
  FieldBlock,
  MetricTile,
  PageHeader,
  Panel,
  parseJsonObject,
  pretty,
  roleDefaults,
  RoleCard,
  SectionTitle,
  showError,
  splitTags,
} from "../training-components";

export default function TrainingRolesPage() {
  const [roles, setRoles] = useState<TrainingRole[]>([]);
  const [activeRoleType, setActiveRoleType] =
    useState<TrainingRoleType>("customer");
  const [roleName, setRoleName] = useState("谨慎型宝妈客户");
  const [roleDescription, setRoleDescription] = useState(roleDefaults.customer);
  const [roleSummary, setRoleSummary] = useState("");
  const [roleTags, setRoleTags] = useState("");
  const [roleProfileJson, setRoleProfileJson] = useState("{}");
  const [avatarUrl, setAvatarUrl] = useState(avatarUrls[0] ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  const customers = useMemo(
    () => roles.filter((role) => role.role_type === "customer"),
    [roles],
  );
  const agents = useMemo(
    () => roles.filter((role) => role.role_type === "agent"),
    [roles],
  );

  async function reload() {
    setRoles(await trainingApi.roles());
  }

  useEffect(() => {
    document.title = "角色工厂 - DeerFlow";
    void reload().catch(showError);
  }, []);

  function changeRoleType(type: TrainingRoleType) {
    setActiveRoleType(type);
    setRoleName(type === "customer" ? "谨慎型宝妈客户" : "共情型新人代理人");
    setRoleDescription(roleDefaults[type]);
    setRoleSummary("");
    setRoleTags("");
    setRoleProfileJson("{}");
    setAvatarUrl(
      type === "customer" ? (avatarUrls[0] ?? "") : (avatarUrls[5] ?? ""),
    );
  }

  async function parseRole() {
    setBusy("parse-role");
    try {
      const parsed = await trainingApi.parseRole({
        role_type: activeRoleType,
        name: roleName,
        description: roleDescription,
      });
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
    setBusy("save-role");
    try {
      await trainingApi.createRole({
        role_type: activeRoleType,
        name: roleName,
        description: roleDescription,
        summary: roleSummary,
        structured_profile: parseJsonObject(roleProfileJson),
        tags: splitTags(roleTags),
        avatar_url: avatarUrl,
      });
      toast.success("角色已保存");
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
        icon={ShieldCheckIcon}
        title="角色工厂"
        description="用自然语言创建模拟客户和模拟代理人，AI 负责拆解画像，你确认后保存为可复用训练角色。"
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
          icon={UserRoundIcon}
          label="客户角色"
          value={customers.length}
        />
        <MetricTile icon={BotIcon} label="代理人角色" value={agents.length} />
        <MetricTile
          icon={ShieldCheckIcon}
          label="总画像版本"
          value={roles.reduce((sum, role) => sum + role.version, 0)}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[520px_minmax(0,1fr)]">
        <Panel>
          <SectionTitle
            icon={SparklesIcon}
            title="新建角色"
            description="先描述业务直觉，再让模型补齐可编辑的结构化画像。"
          />

          <div className="mt-4 flex gap-2">
            {(["customer", "agent"] as const).map((type) => (
              <Button
                key={type}
                variant={activeRoleType === type ? "default" : "outline"}
                size="sm"
                onClick={() => changeRoleType(type)}
              >
                {type === "customer" ? "客户角色" : "代理人角色"}
              </Button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-3">
              <FieldBlock label="角色名称">
                <Input
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                />
              </FieldBlock>
              <div>
                <div className="text-muted-foreground mb-2 text-xs font-medium">
                  头像
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {avatarUrls
                    .slice(
                      activeRoleType === "customer" ? 0 : 5,
                      activeRoleType === "customer" ? 5 : 10,
                    )
                    .map((url) => (
                      <button
                        type="button"
                        key={url}
                        onClick={() => setAvatarUrl(url)}
                        className={cn(
                          "bg-background hover:border-primary/60 rounded-md border p-1 transition-colors",
                          avatarUrl === url && "border-primary bg-primary/5",
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
            </div>

            <div className="space-y-3">
              <FieldBlock label="自然语言描述">
                <Textarea
                  rows={6}
                  value={roleDescription}
                  onChange={(event) => setRoleDescription(event.target.value)}
                />
              </FieldBlock>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy === "parse-role"}
                  onClick={() => void parseRole()}
                >
                  <SparklesIcon className="size-4" />
                  AI 解析
                </Button>
                <Button
                  variant="outline"
                  disabled={busy === "save-role"}
                  onClick={() => void saveRole()}
                >
                  保存角色
                </Button>
              </div>
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
              <FieldBlock label="结构化画像 JSON">
                <Textarea
                  className="font-mono text-xs"
                  rows={9}
                  value={roleProfileJson}
                  onChange={(event) => setRoleProfileJson(event.target.value)}
                />
              </FieldBlock>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <RoleColumn
            title="客户角色"
            description="用于模拟真实客户的异议、关注点和沟通风格。"
            roles={customers}
            emptyTitle="还没有客户角色"
          />
          <RoleColumn
            title="代理人角色"
            description="用于模拟不同能力阶段和销售风格的代理人。"
            roles={agents}
            emptyTitle="还没有代理人角色"
          />
        </div>
      </div>
    </>
  );
}

function RoleColumn({
  title,
  description,
  roles,
  emptyTitle,
}: {
  title: string;
  description: string;
  roles: TrainingRole[];
  emptyTitle: string;
}) {
  return (
    <Panel>
      <SectionTitle
        icon={title.includes("客户") ? UserRoundIcon : BotIcon}
        title={title}
        description={description}
      />
      <div className="mt-4 space-y-2">
        {roles.length ? (
          roles.map((role) => <RoleCard key={role.id} role={role} />)
        ) : (
          <EmptyState
            icon={title.includes("客户") ? UserRoundIcon : BotIcon}
            title={emptyTitle}
            description="保存左侧草稿后，这里会出现可选角色。"
          />
        )}
      </div>
    </Panel>
  );
}
