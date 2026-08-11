import { Link } from "@tanstack/react-router";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil, Trash2, Users, ListOrdered, AlertTriangle, UserRound } from "lucide-react";
import { isOverdue, projectProgress, useStore } from "@/lib/store";
import { projectPermissions } from "@/lib/access";
import type { Project } from "@/lib/types";

import { fa, formatJalali, relativeDue } from "@/lib/jalali";
import { PriorityBadge, StatusBadge } from "./task-item";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Shows the real account picture when the member is a signed-up user. */
export function MemberAvatar({
  name,
  avatar,
  className,
}: {
  name?: string | null;
  avatar?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-7 rounded-md", className)}>
      {avatar ? <AvatarImage src={avatar} alt={name ?? ""} /> : null}
      <AvatarFallback className="rounded-md bg-primary/15 text-[10px] font-bold text-primary">
        {(name ?? "؟").slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  );
}

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
          <MemberAvatar name={m.name} avatar={m.avatar} className="size-6" />
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
  onlyStageIds,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  /** when set, only these stages are listed (used by the calendar day view) */
  onlyStageIds?: string[];
}) {
  const { categories, toggleStage, deleteProject } = useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const category = categories.find((c) => c.id === project.categoryId);
  const overdue = isOverdue(project);
  const progress = projectProgress(project);
  const doneStages = project.stages?.filter((s) => s.done).length ?? 0;
  const perms = projectPermissions(project);
  const stages = (project.stages ?? []).filter(
    (st) => !onlyStageIds || onlyStageIds.includes(st.id),
  );
  const memberName = (id?: string | null) =>
    (project.members ?? []).find((m) => m.id === id)?.name ?? null;

  return (
    <article className={cn("surface lift p-4", project.status === "COMPLETED" && "opacity-80")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="hover:text-primary hover:underline"
            >
              {project.title}
            </Link>
          </h3>

          {project.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex gap-1">
          {perms.canEditProject && (
            <Button size="icon" variant="ghost" aria-label="ویرایش" onClick={() => onEdit(project)}>
              <Pencil className="size-4" />
            </Button>
          )}
          {perms.canDeleteProject && (
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              aria-label="حذف پروژه"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={project.status} />
        <PriorityBadge priority={project.priority} />
        <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">
          پروژه
        </Badge>
        {project.readOnly && (
          <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
            مهمان{project.sharedByName ? ` · ${project.sharedByName}` : ""}
          </Badge>
        )}
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

      {project.readOnly && (
        <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
          دسترسی شما در این پروژه محدود است: تنها می‌توانید مرحله‌ای را که به شما سپرده شده تیک بزنید؛
          ویرایش پروژه و سایر مراحل «دسترسی ندارید».
        </p>
      )}

      {stages.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {stages.map((st) => {
            const index = (project.stages ?? []).findIndex((x) => x.id === st.id);
            const assignee = memberName(st.assigneeId);
            const allowed = perms.canToggleStage(st);
            return (
              <div
                key={st.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"
              >
                <Checkbox
                  checked={st.done}
                  disabled={!allowed}
                  onCheckedChange={() => toggleStage(project.id, st.id)}
                  aria-label="تکمیل مرحله"
                />
                <span className={cn("text-sm", st.done && "text-muted-foreground line-through")}>
                  مرحله {fa(index + 1)}: {st.title}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {assignee ? (
                    <MemberAvatar
                      name={assignee}
                      avatar={(project.members ?? []).find((m) => m.id === st.assigneeId)?.avatar}
                      className="size-5"
                    />
                  ) : (
                    <UserRound className="size-3.5" />
                  )}
                  {assignee ?? "بدون مسئول"}
                </span>
                {st.dueDate && (
                  <span className="ms-auto text-[11px] text-muted-foreground">
                    {formatJalali(st.dueDate)}
                  </span>
                )}
              </div>
            );
          })}
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
