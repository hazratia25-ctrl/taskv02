import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { ProjectItem } from "@/components/project-item";
import { ProjectDialog } from "@/components/project-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { isOverdue, projectProgress, useStore } from "@/lib/store";
import { STATUS_LABELS, type Project, type TaskStatus } from "@/lib/types";
import { fa } from "@/lib/jalali";
import { FolderKanban, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "پروژه‌ها | مدیریت وظایف و پروژه" },
      {
        name: "description",
        content: "مدیریت پروژه‌ها با مراحل، اعضای تیم و نقش هر عضو، مهلت و پیشرفت.",
      },
      { property: "og:title", content: "پروژه‌ها | مدیریت وظایف و پروژه" },
      { property: "og:description", content: "پروژه‌ها با مراحل، اعضای تیم و پیشرفت." },
    ],
  }),
  component: ProjectsPage,
});

type Filter = "ALL" | TaskStatus | "OVERDUE";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "همه" },
  { key: "TODO", label: STATUS_LABELS.TODO },
  { key: "IN_PROGRESS", label: STATUS_LABELS.IN_PROGRESS },
  { key: "COMPLETED", label: STATUS_LABELS.COMPLETED },
  { key: "OVERDUE", label: "عقب‌افتاده" },
];

function ProjectsPage() {
  const { projects } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter === "OVERDUE" && !isOverdue(p)) return false;
      if (filter !== "ALL" && filter !== "OVERDUE" && p.status !== filter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.members.some((m) => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q))
      );
    });
  }, [projects, filter, query]);

  const avgProgress = projects.length
    ? Math.round(projects.reduce((a, p) => a + projectProgress(p), 0) / projects.length)
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="پروژه‌ها"
        description="مراحل، اعضای تیم و پیشرفت هر پروژه"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> پروژه جدید
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "کل پروژه‌ها", value: fa(projects.length) },
          {
            label: "در حال انجام",
            value: fa(projects.filter((p) => p.status === "IN_PROGRESS").length),
          },
          {
            label: "تکمیل‌شده",
            value: fa(projects.filter((p) => p.status === "COMPLETED").length),
          },
          { label: "میانگین پیشرفت", value: `${fa(avgProgress)}٪` },
        ].map((s) => (
          <div key={s.label} className="surface p-4">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="surface space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجو در پروژه‌ها، اعضا و نقش‌ها…"
            className="pe-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}>
              <Badge
                variant={filter === f.key ? "default" : "outline"}
                className={cn("cursor-pointer")}
              >
                {f.label}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={projects.length === 0 ? "هنوز پروژه‌ای ندارید" : "پروژه‌ای یافت نشد"}
          description={
            projects.length === 0
              ? "با دکمه «پروژه جدید» اولین پروژه را با مراحل و اعضای تیم بسازید."
              : "فیلترها یا عبارت جست‌وجو را تغییر دهید."
          }
          action={
            projects.length === 0 ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <FolderKanban className="size-4" /> ایجاد پروژه
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3">
          {visible.map((p) => (
            <ProjectItem
              key={p.id}
              project={p}
              onEdit={(pr) => {
                setEditing(pr);
                setOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <ProjectDialog open={open} onOpenChange={setOpen} project={editing} />
    </div>
  );
}
