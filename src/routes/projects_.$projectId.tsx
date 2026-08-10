import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { ProjectItem } from "@/components/project-item";
import { ProjectDialog } from "@/components/project-dialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { formatJalali } from "@/lib/jalali";
import { ACCESS_LABELS, type Project } from "@/lib/types";
import { projectPermissions } from "@/lib/access";

import { ArrowRight, Users } from "lucide-react";

export const Route = createFileRoute("/projects_/$projectId")({
  head: () => ({
    meta: [
      { title: "جزئیات پروژه | مدیریت پروژه‌ها" },
      { name: "description", content: "مراحل، اعضای تیم، نقش‌ها و پیشرفت یک پروژه." },
      { property: "og:title", content: "جزئیات پروژه | مدیریت پروژه‌ها" },
      { property: "og:description", content: "مراحل، اعضای تیم و پیشرفت پروژه." },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { projects } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return (
      <EmptyState
        title="پروژه یافت نشد"
        description="این پروژه حذف شده یا نشانی آن درست نیست."
        action={
          <Button asChild>
            <Link to="/projects">بازگشت به پروژه‌ها</Link>
          </Button>
        }
      />
    );
  }

  const perms = projectPermissions(project);

  const edit = (p: Project) => {
    void p;
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={project.title}
        description={
          perms.isOwner
            ? `ایجاد: ${formatJalali(project.createdAt, true)}`
            : `پروژه اشتراکی — دسترسی: ${ACCESS_LABELS[perms.access]}`
        }
        action={
          <div className="flex flex-wrap gap-2">
            {perms.canManageMembers && (
              <Button asChild variant="outline">
                <Link to="/projects/$projectId/members" params={{ projectId: project.id }}>
                  <Users className="size-4" /> مدیریت اعضا
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate({ to: "/projects" })}>
              <ArrowRight className="size-4" /> همه پروژه‌ها
            </Button>
          </div>
        }
      />

      <ProjectItem project={project} onEdit={edit} />
      <ProjectDialog open={open} onOpenChange={setOpen} project={project} />
    </div>
  );
}
