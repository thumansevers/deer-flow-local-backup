"use client";

import {
  FileTextIcon,
  PlayIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/workspace/training/roles",
    label: "角色工厂",
    description: "客户与代理人画像",
    icon: UserRoundIcon,
  },
  {
    href: "/workspace/training/scenarios",
    label: "场景工厂",
    description: "训练目标与约束",
    icon: FileTextIcon,
  },
  {
    href: "/workspace/training/simulations",
    label: "模拟对练",
    description: "对话、复盘、画像更新",
    icon: PlayIcon,
  },
] as const;

export function TrainingShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="bg-muted/20 grid size-full min-h-0 lg:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="bg-background/80 hidden border-r lg:block">
            <div className="flex h-full flex-col p-4">
              <div className="bg-muted/30 mb-5 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 text-primary border-primary/10 flex size-8 items-center justify-center rounded-md border">
                    <ShieldCheckIcon className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">保险训练</div>
                    <div className="text-muted-foreground text-xs">
                      Role Factory
                    </div>
                  </div>
                </div>
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "hover:bg-muted flex gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                        active && "bg-background border shadow-sm",
                      )}
                    >
                      <Icon
                        className={cn(
                          "text-muted-foreground mt-0.5 size-4 shrink-0",
                          active && "text-primary",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{item.label}</span>
                        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </nav>

              <div className="bg-background text-muted-foreground mt-auto rounded-md border p-3 text-xs leading-5">
                当前版本保留 DeerFlow 的模型、技能与 MCP
                扩展方式，训练数据落在本地 SQLite。
              </div>
            </div>
          </aside>

          <ScrollArea className="min-w-0">
            <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "bg-background flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm",
                        active && "border-primary bg-primary/5 text-primary",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              {children}
            </div>
          </ScrollArea>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
