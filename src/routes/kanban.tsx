import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { TaskDialog } from "@/components/task-dialog";
import { PriorityBadge } from "@/components/task-item";
import { Button } from "@/components/ui/button";
import { isOverdue, useStore } from "@/lib/store";
import { STATUS_LABELS, type Task, type TaskStatus } from "@/lib/types";
import { fa, formatJalali } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { GripVertical, ArrowLeftRight } from "lucide-react";
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
  const { tasks, setTaskStatus, categories } = useStore();
  const [dragging, setDragging] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], COMPLETED: [] };
    tasks.forEach((t) => map[t.status].push(t));
    return map;
  }, [tasks]);

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
            onDrop={() => drop(status)}
            className={cn(
              "rounded-2xl border bg-sidebar p-3 transition-colors",
              overColumn === status && "border-primary bg-primary/5",
            )}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="font-semibold">{STATUS_LABELS[status]}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {fa(grouped[status].length)}
              </span>
            </div>

            <div className="flex min-h-24 flex-col gap-3">
              {grouped[status].length === 0 && (
                <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  کارتی در این ستون نیست
                </p>
              )}
              {grouped[status].map((task) => {
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
    </div>
  );
}
