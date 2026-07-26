import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { TaskItem } from "@/components/task-item";
import { TaskDialog } from "@/components/task-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isOverdue, useStore } from "@/lib/store";
import { fa, daysBetween } from "@/lib/jalali";
import type { Task } from "@/lib/types";
import { Plus, ListTodo, CheckCircle2, Loader2, AlertTriangle, Flame } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "داشبورد | مدیریت وظایف آفلاین" },
      { name: "description", content: "نمای کلی وظایف، پیشرفت، مهلت‌های نزدیک و کارهای عقب‌افتاده." },
      { property: "og:title", content: "داشبورد | مدیریت وظایف آفلاین" },
      { property: "og:description", content: "نمای کلی وظایف، پیشرفت و مهلت‌های نزدیک شما." },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone?: "default" | "success" | "warning" | "danger" | "primary";
}) {
  const tones: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    danger: "bg-destructive/12 text-destructive",
    primary: "bg-primary/12 text-primary",
  };
  return (
    <div className="surface flex items-center gap-3 p-4">
      <div className={`flex size-10 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{fa(value)}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function Section({ title, tasks, onEdit }: { title: string; tasks: Task[]; onEdit: (t: Task) => void }) {
  if (tasks.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-3">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}

function Dashboard() {
  const { tasks, profile } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const stats = useMemo(() => {
    const completed = tasks.filter((t) => t.status === "COMPLETED");
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
    const todo = tasks.filter((t) => t.status === "TODO");
    const overdue = tasks.filter(isOverdue);
    const high = tasks.filter((t) => t.priority === "HIGH" && t.status !== "COMPLETED");
    return {
      total: tasks.length,
      completed: completed.length,
      inProgress: inProgress.length,
      todo: todo.length,
      overdue: overdue.length,
      high: high.length,
      rate: tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0,
      overdueTasks: overdue,
      highTasks: high,
    };
  }, [tasks]);

  const recent = useMemo(
    () => [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
    [tasks],
  );

  const upcoming = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.dueDate &&
            t.status !== "COMPLETED" &&
            daysBetween(new Date(), new Date(t.dueDate)) >= 0 &&
            daysBetween(new Date(), new Date(t.dueDate)) <= 7,
        )
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
        .slice(0, 5),
    [tasks],
  );

  const edit = (t: Task) => {
    setEditing(t);
    setOpen(true);
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title={profile ? `سلام ${profile.name} 👋` : "داشبورد"}
        description="نمای کلی وضعیت وظایف شما — کاملاً آفلاین"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> وظیفه جدید
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="کل وظایف" value={stats.total} icon={ListTodo} tone="primary" />
        <StatCard label="تکمیل‌شده" value={stats.completed} icon={CheckCircle2} tone="success" />
        <StatCard label="در حال انجام" value={stats.inProgress} icon={Loader2} tone="primary" />
        <StatCard label="انجام‌نشده" value={stats.todo} icon={ListTodo} />
        <StatCard label="عقب‌افتاده" value={stats.overdue} icon={AlertTriangle} tone="danger" />
        <StatCard label="اولویت بالا" value={stats.high} icon={Flame} tone="warning" />
      </div>

      <div className="surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-semibold">نرخ تکمیل</p>
          <p className="text-sm text-muted-foreground">{fa(stats.rate)}٪</p>
        </div>
        <Progress value={stats.rate} />
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="هنوز وظیفه‌ای ایجاد نکرده‌اید"
          description="اولین وظیفه خود را بسازید تا داشبورد، تقویم و آمار پر شوند."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> ایجاد اولین وظیفه
            </Button>
          }
        />
      ) : (
        <div className="space-y-7">
          <Section title="عقب‌افتاده" tasks={stats.overdueTasks.slice(0, 3)} onEdit={edit} />
          <Section title="مهلت نزدیک (۷ روز آینده)" tasks={upcoming} onEdit={edit} />
          <Section title="مهم" tasks={stats.highTasks.slice(0, 3)} onEdit={edit} />
          <Section title="آخرین وظایف" tasks={recent} onEdit={edit} />
          <Link to="/tasks" className="inline-block text-sm text-primary hover:underline">
            مشاهده همه وظایف →
          </Link>
        </div>
      )}

      <TaskDialog open={open} onOpenChange={setOpen} task={editing} />
    </div>
  );
}
