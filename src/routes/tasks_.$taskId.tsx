import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { TaskItem } from "@/components/task-item";
import { TaskDialog } from "@/components/task-dialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { formatJalali } from "@/lib/jalali";
import type { Task } from "@/lib/types";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/tasks_/$taskId")({
  head: () => ({
    meta: [
      { title: "جزئیات وظیفه | مدیریت وظایف" },
      { name: "description", content: "مشاهده و ویرایش جزئیات یک وظیفه؛ وضعیت، اولویت و مهلت." },
      { property: "og:title", content: "جزئیات وظیفه | مدیریت وظایف" },
      { property: "og:description", content: "جزئیات، وضعیت، اولویت و مهلت یک وظیفه." },
    ],
  }),
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { taskId } = Route.useParams();
  const { tasks } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const task = tasks.find((t) => t.id === taskId);

  if (!task) {
    return (
      <EmptyState
        title="وظیفه یافت نشد"
        description="این وظیفه حذف شده یا نشانی آن درست نیست."
        action={
          <Button asChild>
            <Link to="/tasks">بازگشت به وظایف</Link>
          </Button>
        }
      />
    );
  }

  const edit = (t: Task) => {
    void t;
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={task.title}
        description={`ایجاد: ${formatJalali(task.createdAt, true)}`}
        action={
          <Button variant="outline" onClick={() => navigate({ to: "/tasks" })}>
            <ArrowRight className="size-4" /> همه وظایف
          </Button>
        }
      />
      <TaskItem task={task} onEdit={edit} />
      <TaskDialog open={open} onOpenChange={setOpen} task={task} />
    </div>
  );
}
