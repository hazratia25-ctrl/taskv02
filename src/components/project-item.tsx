import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Users, ListOrdered, AlertTriangle } from "lucide-react";
import { isOverdue, projectProgress, useStore } from "@/lib/store";
import type { Project } from "@/lib/types";
import { fa, formatJalali, relativeDue } from "@/lib/jalali";
import { PriorityBadge, StatusBadge } from "./task-item";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ProjectMembers({ project }: { project: Project }) {
  if (!project.members?.length) {
    return <p className="text-xs text-muted-foreground">عضوی برای این پروژه ثبت نشده است.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {project.members.map((m) => (
        <span
          key={m.id}
          className="flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-[10px] font-bold text-primary">
            {m.name.slice(0, 2)}
          </span>
          <span className="font-medium">{m.name}</span>
          <span className="text-muted-foreground">| {m.role}</span>
        </span>
      ))}
    </div>
  );
}

export function ProjectItem({
  project,
  onEdit,
}: {
  project: Project;
  onEdit: (p: Project) => void;
}) {
  const { categories, toggleStage, deleteProject } = useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const category = categories.find((c) => c.id === project.categoryId);
  const overdue = isOverdue(project);
  const progress = projectProgress(project);
  const doneStages = project.stages?.filter((s) => s.done).length ?? 0;

  return (
    <article className={cn("surface lift p-4", project.status === "COMPLETED" && "opacity-80")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{project.title}</h3>
          {project.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" aria-label="ویرایش" onClick={() => onEdit(project)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            aria-label="حذف پروژه"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={project.status} />
        <PriorityBadge priority={project.priority} />
        <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">
          پروژه
        </Badge>
        {category && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
            {category.name}
          </span>
        )}
        {project.dueDate && (
          <span
            className={cn(
              "flex items-center gap-1 text-xs",
              overdue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {overdue && <AlertTriangle className="size-3.5" />}
            مهلت: {formatJalali(project.dueDate, true)} ({relativeDue(project.dueDate)})
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ListOrdered className="size-4" /> پیشرفت مراحل ({fa(doneStages)} از{" "}
            {fa(project.stages?.length ?? 0)})
          </span>
          <span>{fa(progress)}٪</span>
        </div>
        <Progress value={progress} />
      </div>

      {project.stages?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {project.stages.map((st, i) => (
            <div key={st.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <Checkbox
                checked={st.done}
                onCheckedChange={() => toggleStage(project.id, st.id)}
                aria-label="تکمیل مرحله"
              />
              <span className={cn("text-sm", st.done && "text-muted-foreground line-through")}>
                مرحله {fa(i + 1)}: {st.title}
              </span>
              {st.dueDate && (
                <span className="ms-auto text-[11px] text-muted-foreground">
                  {formatJalali(st.dueDate)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-4" /> اعضای تیم
        </p>
        <ProjectMembers project={project} />
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle>حذف پروژه؟</AlertDialogTitle>
            <AlertDialogDescription>
              «{project.title}» و همه مراحل آن حذف می‌شود. این عمل بازگشت‌پذیر نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteProject(project.id);
                toast.success("پروژه حذف شد");
              }}
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
