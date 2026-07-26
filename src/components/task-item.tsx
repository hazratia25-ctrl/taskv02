import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Clock, AlertTriangle } from "lucide-react";
import { isOverdue, useStore } from "@/lib/store";
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from "@/lib/types";
import { formatJalali, relativeDue } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function PriorityBadge({ priority }: { priority: Task["priority"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        priority === "HIGH" && "bg-destructive/12 text-destructive",
        priority === "MEDIUM" && "bg-warning/20 text-warning-foreground",
        priority === "LOW" && "bg-muted text-muted-foreground",
      )}
    >
      اولویت {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: Task["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        status === "COMPLETED" && "bg-success/15 text-success",
        status === "IN_PROGRESS" && "bg-primary/12 text-primary",
        status === "TODO" && "bg-muted text-muted-foreground",
      )}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function TaskItem({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const { categories, tags, toggleComplete, deleteTask } = useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const category = categories.find((c) => c.id === task.categoryId);
  const overdue = isOverdue(task);

  return (
    <article className={cn("surface lift p-4", task.status === "COMPLETED" && "opacity-75")}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={task.status === "COMPLETED"}
          onCheckedChange={() => toggleComplete(task.id)}
          className="mt-1"
          aria-label="تغییر وضعیت تکمیل"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                "text-base font-semibold",
                task.status === "COMPLETED" && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </h3>
            {overdue && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="size-3.5" /> عقب‌افتاده
              </span>
            )}
          </div>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {category && (
              <Badge variant="outline" className="gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
                {category.name}
              </Badge>
            )}
            {task.tagIds.map((id) => {
              const tag = tags.find((t) => t.id === id);
              return tag ? (
                <Badge key={id} variant="secondary">
                  #{tag.name}
                </Badge>
              ) : null;
            })}
            {task.dueDate && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs",
                  overdue ? "text-destructive" : "text-muted-foreground",
                )}
                title={formatJalali(task.dueDate)}
              >
                <Clock className="size-3.5" />
                {formatJalali(task.dueDate)} ({relativeDue(task.dueDate)})
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="ghost" onClick={() => onEdit(task)} aria-label="ویرایش">
            <Pencil className="size-4" />
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="حذف">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader className="text-start">
                <AlertDialogTitle>حذف وظیفه؟</AlertDialogTitle>
                <AlertDialogDescription>
                  «{task.title}» برای همیشه حذف می‌شود. این عمل قابل بازگشت نیست.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:justify-start">
                <AlertDialogAction
                  onClick={() => {
                    deleteTask(task.id);
                    toast.success("وظیفه حذف شد");
                  }}
                >
                  حذف
                </AlertDialogAction>
                <AlertDialogCancel>انصراف</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </article>
  );
}
