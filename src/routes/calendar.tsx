import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { JalaliMonthGrid } from "@/components/jalali-date-picker";
import { TaskDialog } from "@/components/task-dialog";
import { TaskItem } from "@/components/task-item";
import { ProjectItem } from "@/components/project-item";
import { Button } from "@/components/ui/button";
import { useStore, isOverdue } from "@/lib/store";
import { JALALI_MONTHS, fa, formatJalali, isSameDay, toJalali } from "@/lib/jalali";
import type { Project, Task } from "@/lib/types";
import { ProjectDialog } from "@/components/project-dialog";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "تقویم شمسی | مدیریت وظایف آفلاین" },
      {
        name: "description",
        content: "تقویم شمسی وظایف با نمایش مهلت‌ها و ایجاد وظیفه در تاریخ دلخواه.",
      },
      { property: "og:title", content: "تقویم شمسی | مدیریت وظایف آفلاین" },
      { property: "og:description", content: "تقویم شمسی وظایف و مدیریت مهلت‌ها." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { tasks, projects } = useStore();
  const today = new Date();
  const j0 = toJalali(today);
  const [jy, setJy] = useState(j0.jy);
  const [jm, setJm] = useState(j0.jm);
  const [selected, setSelected] = useState<Date>(today);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const move = (delta: number) => {
    let m = jm + delta;
    let y = jy;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setJm(m);
    setJy(y);
  };

  const tasksForDay = useCallback(
    (d: Date) => tasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), d)),
    [tasks],
  );
  const projectsForDay = useCallback(
    (d: Date) =>
      projects.filter(
        (p) =>
          (p.dueDate && isSameDay(new Date(p.dueDate), d)) ||
          (p.stages ?? []).some((st) => st.dueDate && isSameDay(new Date(st.dueDate), d)),
      ),
    [projects],
  );
  const dayTasks = useMemo(() => tasksForDay(selected), [tasksForDay, selected]);
  const dayProjects = useMemo(() => projectsForDay(selected), [projectsForDay, selected]);


  return (
    <div className="space-y-5">
      <PageHeader
        title="تقویم شمسی"
        description="مهلت وظایف روی تقویم فارسی"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> ایجاد در {formatJalali(selected)}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="ماه قبل">
              <ChevronRight className="size-4" />
            </Button>
            <p className="font-semibold">
              {JALALI_MONTHS[jm - 1]} {fa(jy)}
            </p>
            <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="ماه بعد">
              <ChevronLeft className="size-4" />
            </Button>
          </div>

          <JalaliMonthGrid
            jy={jy}
            jm={jm}
            selected={selected}
            onSelect={setSelected}
            renderBadge={(d) => {
              const items = [...tasksForDay(d), ...projectsForDay(d)];
              if (items.length === 0) return null;
              const hasOverdue = items.some(isOverdue);
              const allDone = items.every((t) => t.status === "COMPLETED");
              return (
                <span
                  className="mt-0.5 size-1.5 rounded-full"
                  style={{
                    backgroundColor: hasOverdue
                      ? "var(--destructive)"
                      : allDone
                        ? "var(--success)"
                        : "var(--primary)",
                  }}
                />
              );
            }}
          />

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary" /> مهلت پیش‌رو
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-destructive" /> عقب‌افتاده
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success" /> تکمیل‌شده
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">وظایف و پروژه‌های {formatJalali(selected)}</h2>
          {dayTasks.length === 0 && dayProjects.length === 0 ? (
            <EmptyState
              title="برای این روز موردی ثبت نشده"
              description="می‌توانید با دکمه بالا برای همین تاریخ وظیفه یا پروژه بسازید."
            />
          ) : (
            <>
              {dayTasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  onEdit={(task) => {
                    setEditing(task);
                    setOpen(true);
                  }}
                />
              ))}
              {dayProjects.map((pr) => (
                <ProjectItem
                  key={pr.id}
                  project={pr}
                  onEdit={(proj) => {
                    setEditingProject(proj);
                    setProjectOpen(true);
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <TaskDialog
        open={open}
        onOpenChange={setOpen}
        task={editing}
        defaultDueDate={selected.toISOString()}
      />
      <ProjectDialog
        open={projectOpen}
        onOpenChange={setProjectOpen}
        project={editingProject}
        defaultDueDate={selected.toISOString()}
      />
    </div>
  );
}
