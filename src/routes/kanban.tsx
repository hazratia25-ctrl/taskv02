import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { TaskDialog } from "@/components/task-dialog";
import { PriorityBadge } from "@/components/task-item";
import { Button } from "@/components/ui/button";
import { isOverdue, projectProgress, useStore } from "@/lib/store";
import { STATUS_LABELS, type Project, type Task, type TaskStatus } from "@/lib/types";
import { fa, formatJalali } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { GripVertical, ArrowLeftRight, ListChecks, FolderKanban, Users } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";
import { ProjectDialog } from "@/components/project-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/kanban")({
  head: () => ({
    meta: [
      { title: "کانبان | مدیریت وظایف آفلاین" },
      { name: "description", content: "تخته کانبان با جابه‌جایی کشیدنی میان ستون‌های وضعیت." },
      { property: "og:title", content: "کانبان | مدیریت وظایف آفلاین" },
      { property: "og:description", content: "تخته کانبان با جابه‌جایی کشیدنی وظایف." },
    ],
  }),
  component: KanbanPage,
});

const COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "COMPLETED"];
const NEXT: Record<TaskStatus, TaskStatus> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "TODO",
};

function KanbanPage() {
  const { tasks, projects, setTaskStatus, setProjectStatus, categories } = useStore();
  const [scope, setScope] = useState<"tasks" | "projects">("tasks");
  const [projectOpen, setProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], COMPLETED: [] };
    tasks.forEach((t) => map[t.status].push(t));
    return map;
  }, [tasks]);

  const groupedProjects = useMemo(() => {
    const map: Record<TaskStatus, Project[]> = { TODO: [], IN_PROGRESS: [], COMPLETED: [] };
    projects.forEach((p) => map[p.status].push(p));
    return map;
  }, [projects]);

  const dropProject = (status: TaskStatus) => {
    setOverColumn(null);
    if (!dragging) return;
    const project = projects.find((p) => p.id === dragging);
    setDragging(null);
    if (!project || project.status === status) return;
    setProjectStatus(project.id, status);
    toast.success(`پروژه «${project.title}» به ${STATUS_LABELS[status]} منتقل شد`);
  };

  const drop = (status: TaskStatus) => {
    setOverColumn(null);
    if (!dragging) return;
    const task = tasks.find((t) => t.id === dragging);
    setDragging(null);
    if (!task || task.status === status) return;
    try {
      setTaskStatus(task.id, status);
      toast.success(`«${task.title}» به ${STATUS_LABELS[status]} منتقل شد`);
    } catch {
      toast.error("جابه‌جایی ذخیره نشد؛ وضعیت قبلی بازگردانده شد.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="تخته کانبان"
        description="کارت‌ها را بکشید و رها کنید یا با دکمه جابه‌جا کنید"
        action={
          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(v) => v && setScope(v as "tasks" | "projects")}
            className="rounded-xl border p-1"
          >
            <ToggleGroupItem value="tasks" className="gap-2 px-4 text-xs">
              <ListChecks className="size-4" /> وظایف
            </ToggleGroupItem>
            <ToggleGroupItem value="projects" className="gap-2 px-4 text-xs">
              <FolderKanban className="size-4" /> پروژه‌ها
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((status) => (
          <section
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(status);
            }}
            onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
            onDrop={() => (scope === "tasks" ? drop(status) : dropProject(status))}
            className={cn(
              "rounded-2xl border bg-sidebar p-3 transition-colors",
              overColumn === status && "border-primary bg-primary/5",
            )}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="font-semibold">{STATUS_LABELS[status]}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {fa(scope === "tasks" ? grouped[status].length : groupedProjects[status].length)}
              </span>
            </div>

            <div className="flex min-h-24 flex-col gap-3">
              {scope === "projects" &&
                groupedProjects[status].map((project) => (
                  <article
                    key={project.id}
                    draggable
                    onDragStart={() => setDragging(project.id)}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "surface cursor-grab space-y-2 p-3 active:cursor-grabbing",
                      dragging === project.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-start text-sm font-semibold hover:underline"
                        onClick={() => {
                          setEditingProject(project);
                          setProjectOpen(true);
                        }}
                      >
                        {project.title}
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="انتقال به ستون بعدی"
                        onClick={() => setProjectStatus(project.id, NEXT[project.status])}
                      >
                        <ArrowLeftRight className="size-4" />
                      </Button>
                    </div>
                    <Progress value={projectProgress(project)} />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <PriorityBadge priority={project.priority} />
                      <span>
                        مراحل: {fa((project.stages ?? []).filter((st) => st.done).length)} از{" "}
                        {fa((project.stages ?? []).length)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" /> {fa((project.members ?? []).length)}
                      </span>
                    </div>
                    {(project.members ?? []).length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {(project.members ?? [])
                          .map((m) => `${m.name} | ${m.role}`)
                          .slice(0, 3)
                          .join("، ")}
                      </p>
                    )}
                    {project.dueDate && (
                      <p
                        className={cn(
                          "text-xs",
                          isOverdue(project) ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        مهلت: {formatJalali(project.dueDate, true)}
                      </p>
                    )}
                  </article>
                ))}

              {(scope === "tasks" ? grouped[status].length : groupedProjects[status].length) ===
                0 && (
                <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  کارتی در این ستون نیست
                </p>
              )}
              {scope === "tasks" &&
                grouped[status].map((task) => {
                const category = categories.find((c) => c.id === task.categoryId);
                return (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "surface cursor-grab p-3 active:cursor-grabbing",
                      dragging === task.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="text-start text-sm font-semibold hover:underline"
                          onClick={() => {
                            setEditing(task);
                            setOpen(true);
                          }}
                        >
                          {task.title}
                        </button>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <PriorityBadge priority={task.priority} />
                          {category && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                              {category.name}
                            </span>
                          )}
                        </div>
                        {task.dueDate && (
                          <p
                            className={cn(
                              "mt-2 text-xs",
                              isOverdue(task) ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            مهلت: {formatJalali(task.dueDate)}
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="انتقال به ستون بعدی"
                        onClick={() => setTaskStatus(task.id, NEXT[task.status])}
                      >
                        <ArrowLeftRight className="size-4" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <TaskDialog open={open} onOpenChange={setOpen} task={editing} />
      <ProjectDialog open={projectOpen} onOpenChange={setProjectOpen} project={editingProject} />
    </div>
  );
}
