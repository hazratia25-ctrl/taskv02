import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectFormBody } from "./project-form";
import type { Project } from "@/lib/types";

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  defaultDueDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: Project | null;
  defaultDueDate?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle>{project ? "ویرایش پروژه" : "پروژه جدید"}</DialogTitle>
          <DialogDescription>
            مراحل، اعضای تیم و نقش هر عضو را برای پروژه مشخص کنید.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ProjectFormBody
            project={project}
            defaultDueDate={defaultDueDate}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
