"use client";

import {
  BotIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trainingApi, type TrainingRole } from "@/core/training/api";

import {
  EmptyState,
  MetricTile,
  PageHeader,
  Panel,
  RoleCard,
  RoleDetailDialog,
  SectionTitle,
  showError,
} from "../training-components";

export default function TrainingRolesPage() {
  const [roles, setRoles] = useState<TrainingRole[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const customers = useMemo(
    () => roles.filter((role) => role.role_type === "customer"),
    [roles],
  );
  const agents = useMemo(
    () => roles.filter((role) => role.role_type === "agent"),
    [roles],
  );
  const filteredCustomers = useMemo(
    () => filterRoles(customers, query),
    [customers, query],
  );
  const filteredAgents = useMemo(
    () => filterRoles(agents, query),
    [agents, query],
  );

  async function reload() {
    setRoles(await trainingApi.roles());
  }

  useEffect(() => {
    document.title = "角色工厂 - DeerFlow";
    void reload().catch(showError);
  }, []);

  async function deleteRole(role: TrainingRole) {
    if (
      !window.confirm(
        `确认删除角色“${role.name}”？删除后不会出现在角色库和对练选择里。`,
      )
    ) {
      return;
    }
    setBusy(`delete-role-${role.id}`);
    try {
      await trainingApi.deleteRole(role.id);
      toast.success("角色已删除");
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
        description="管理模拟客户和模拟代理人。新建或编辑画像时进入独立流程，避免长人物稿和 soul.md 挤在列表页。"
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
            <Link href="/workspace/training/roles/new">
              <PlusIcon className="size-4" />
              新建角色
            </Link>
          </Button>
        </div>
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

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            icon={ShieldCheckIcon}
            title="角色库"
            description="点击卡片查看完整画像，进入编辑页可继续完善角色。"
          />
          <Input
            className="w-full sm:w-72"
            value={query}
            placeholder="搜索名称、摘要或标签"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <RoleColumn
          title="客户角色"
          description="用于模拟真实客户的异议、关注点和沟通风格。"
          roles={filteredCustomers}
          emptyTitle="还没有客户角色"
          busy={busy}
          onDelete={deleteRole}
        />
        <RoleColumn
          title="代理人角色"
          description="用于模拟不同能力阶段和销售风格的代理人。"
          roles={filteredAgents}
          emptyTitle="还没有代理人角色"
          busy={busy}
          onDelete={deleteRole}
        />
      </div>
    </>
  );
}

function RoleColumn({
  title,
  description,
  roles,
  emptyTitle,
  busy,
  onDelete,
}: {
  title: string;
  description: string;
  roles: TrainingRole[];
  emptyTitle: string;
  busy: string | null;
  onDelete: (role: TrainingRole) => void;
}) {
  return (
    <Panel>
      <SectionTitle
        icon={title.includes("客户") ? UserRoundIcon : BotIcon}
        title={title}
        description={description}
      />
      <div className="mt-4 grid gap-3">
        {roles.length ? (
          roles.map((role) => (
            <div key={role.id} className="group relative">
              <RoleDetailDialog role={role}>
                <RoleCard role={role} />
              </RoleDetailDialog>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="bg-background/90 size-8"
                  title="编辑角色"
                  asChild
                >
                  <Link href={`/workspace/training/roles/${role.id}`}>
                    <PencilIcon className="size-4" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="bg-background/90 size-8"
                  disabled={busy === `delete-role-${role.id}`}
                  title="删除角色"
                  onClick={() => onDelete(role)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon={title.includes("客户") ? UserRoundIcon : BotIcon}
            title={emptyTitle}
            description="点击“新建角色”进入完整创建流程。"
          />
        )}
      </div>
    </Panel>
  );
}

function filterRoles(roles: TrainingRole[], query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return roles;
  return roles.filter((role) =>
    [role.name, role.summary, role.description, ...(role.tags ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(keyword),
  );
}
