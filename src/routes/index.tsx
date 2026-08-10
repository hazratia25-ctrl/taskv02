import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { projectProgress, useStore } from "@/lib/store";
import { fa, formatJalali } from "@/lib/jalali";
import { STATUS_LABELS } from "@/lib/types";
import { FolderKanban, Users, ListChecks, Clock, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مدیریت‌وظایف" },
      {
        name: "description",
        content: "نمای کلی وظایف و پروژه‌ها، پیشرفت مراحل و مهلت‌ها.",
      },
      { property: "og:title", content: "مدیریت‌وظایف" },
      {
        property: "og:description",
        content: "نمای کلی وظایف و پروژه‌ها، پیشرفت مراحل و مهلت‌ها.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { tasks, projects } = useStore();

  const recentTasks = useMemo(
    () => [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4),
    [tasks],
  );

  return (
    <div className="space-y-7">
      <PageHeader title="داشبورد" description="نمای کلی وضعیت وظایف و پروژه‌ها" />


      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FolderKanban className="size-5 text-primary" /> پروژه‌ها
          </h2>
          <Link to="/projects" className="text-sm text-primary hover:underline">
            مشاهده همه پروژه‌ها →
          </Link>
        </div>
        {projects.length === 0 ? (
          <div className="surface p-4 text-sm text-muted-foreground">
            هنوز پروژه‌ای ندارید. با دکمه بالا و انتخاب «پروژه» اولین پروژه را بسازید.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.slice(0, 4).map((pr) => (
              <Link
                key={pr.id}
                to="/projects/$projectId"
                params={{ projectId: pr.id }}
                className="surface lift space-y-3 p-4 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{pr.title}</p>
                  <Badge variant="outline">{fa(projectProgress(pr))}٪</Badge>
                </div>
                <Progress value={projectProgress(pr)} />
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    مراحل: {fa((pr.stages ?? []).filter((st) => st.done).length)} از{" "}
                    {fa((pr.stages ?? []).length)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" /> {fa((pr.members ?? []).length)} عضو
                  </span>
                  {pr.dueDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" /> مهلت کلی:{" "}
                      {formatJalali(pr.dueDate, true)}
                    </span>
                  )}
                </div>

              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="size-5 text-primary" /> وظایف
          </h2>
          <Link to="/tasks" className="text-sm text-primary hover:underline">
            مشاهده همه وظایف →
          </Link>
        </div>
        {tasks.length === 0 ? (
          <EmptyState
            title="هنوز وظیفه‌ای ایجاد نکرده‌اید"
            description="از صفحه وظایف اولین وظیفه خود را بسازید تا داشبورد، تقویم و آمار پر شوند."
            action={
              <Button asChild>
                <Link to="/tasks">رفتن به وظایف</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentTasks.map((t) => (
              <Link
                key={t.id}
                to="/tasks/$taskId"
                params={{ taskId: t.id }}
                className="surface lift space-y-2 p-4 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{t.title}</p>
                  <Badge variant="outline">{STATUS_LABELS[t.status]}</Badge>
                </div>
                {t.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                )}
                {t.dueDate && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" /> مهلت: {formatJalali(t.dueDate, true)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
