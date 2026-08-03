import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useStore, type TaskInput } from "@/lib/store";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { JalaliDatePicker } from "./jalali-date-picker";
import { ProjectFormBody } from "./project-form";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ListChecks, FolderKanban } from "lucide-react";
import { toast } from "sonner";

const NONE = "__none__";

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultDueDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  defaultDueDate?: string | null;
}) {
  const { categories, tags, createTask, updateTask, createTag } = useStore();
  const [form, setForm] = useState<TaskInput>({
    title: "",
    description: "",
    status: "TODO",
    priority: "MEDIUM",
    categoryId: null,
    tagIds: [],
    dueDate: null,
  });
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"task" | "project">("task");

  useEffect(() => {
    if (!open) return;
    setError("");
    setNewTag("");
    setKind("task");
    setForm(
      task
        ? {
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            categoryId: task.categoryId,
            tagIds: task.tagIds,
            dueDate: task.dueDate,
          }
        : {
            title: "",
            description: "",
            status: "TODO",
            priority: "MEDIUM",
            categoryId: null,
            tagIds: [],
            dueDate: defaultDueDate ?? null,
          },
    );
  }, [open, task, defaultDueDate]);

  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const resetForm = () => {
    setForm(
      task
        ? {
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            categoryId: task.categoryId,
            tagIds: task.tagIds,
            dueDate: task.dueDate,
          }
        : {
            title: "",
            description: "",
            status: "TODO",
            priority: "MEDIUM",
            categoryId: null,
            tagIds: [],
            dueDate: defaultDueDate ?? null,
          },
    );
    setError("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 2) {
      setError("عنوان وظیفه را وارد کنید.");
      return;
    }
    try {
      if (task) {
        updateTask(task.id, { ...form, title: form.title.trim() });
        toast.success("وظیفه به‌روزرسانی شد");
      } else {
        createTask({ ...form, title: form.title.trim() });
        toast.success("وظیفه ایجاد شد");
      }
      onOpenChange(false);
    } catch {
      toast.error("ذخیره‌سازی ناموفق بود");
    }
  };

  const addTag = () => {
    const name = newTag.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name === name);
    if (existing) {
      setForm((f) => ({ ...f, tagIds: [...new Set([...f.tagIds, existing.id])] }));
    } else {
      createTag(name);
    }
    setNewTag("");
  };

  // اتصال برچسب تازه‌ساخته‌شده به وظیفه
  useEffect(() => {
    if (!open) return;
    const last = tags[tags.length - 1];
    if (
      last &&
      newTag === "" &&
      !form.tagIds.includes(last.id) &&
      last.name &&
      wasJustCreated(last.createdAt)
    ) {
      setForm((f) => ({ ...f, tagIds: [...f.tagIds, last.id] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle>
            {task ? "ویرایش وظیفه" : kind === "task" ? "وظیفه جدید" : "پروژه جدید"}
          </DialogTitle>
          <DialogDescription>
            {task
              ? "اطلاعات وظیفه را کامل کنید."
              : "نوع مورد را انتخاب کنید؛ برای پروژه، مراحل و اعضای تیم هم قابل تعریف است."}
          </DialogDescription>
        </DialogHeader>

        {!task && (
          <ToggleGroup
            type="single"
            value={kind}
            onValueChange={(v) => v && setKind(v as "task" | "project")}
            className="w-full rounded-xl border p-1"
          >
            <ToggleGroupItem value="task" className="flex-1 gap-2 text-sm">
              <ListChecks className="size-4" /> وظیفه
            </ToggleGroupItem>
            <ToggleGroupItem value="project" className="flex-1 gap-2 text-sm">
              <FolderKanban className="size-4" /> پروژه
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {!task && kind === "project" ? (
          <ProjectFormBody defaultDueDate={defaultDueDate} onDone={() => onOpenChange(false)} />
        ) : (
          <>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="title">عنوان</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="چه کاری باید انجام شود؟"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="desc">توضیحات</Label>
                <Textarea
                  id="desc"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="جزئیات بیشتر…"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>وضعیت</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as TaskStatus }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>اولویت</Label>
                  <Select
                    value={form.priority}
                    onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TaskPriority }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>دسته‌بندی</Label>
                <Select
                  value={form.categoryId ?? NONE}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, categoryId: v === NONE ? null : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="بدون دسته‌بندی" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>بدون دسته‌بندی</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>مهلت انجام (تاریخ و ساعت شمسی)</Label>
                <JalaliDatePicker
                  value={form.dueDate}
                  onChange={(iso) => setForm((f) => ({ ...f, dueDate: iso }))}
                />
              </div>

              <div className="space-y-2">
                <Label>برچسب‌ها</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const active = form.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            tagIds: active
                              ? f.tagIds.filter((x) => x !== t.id)
                              : [...f.tagIds, t.id],
                          }))
                        }
                      >
                        <Badge variant={active ? "default" : "outline"}>{t.name}</Badge>
                      </button>
                    );
                  })}
                  {tags.length === 0 && (
                    <p className="text-xs text-muted-foreground">هنوز برچسبی ندارید.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="برچسب جدید"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={addTag}>
                    افزودن
                  </Button>
                </div>
                {form.tagIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    انتخاب‌شده:{" "}
                    {form.tagIds
                      .map((id) => tagMap.get(id)?.name)
                      .filter(Boolean)
                      .join("، ")}
                  </p>
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="submit">{task ? "ذخیره تغییرات" : "ایجاد وظیفه"}</Button>
                <div className="flex flex-1 gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-1/2"
                    onClick={() => onOpenChange(false)}
                  >
                    انصراف
                  </Button>
                  <Button
                    type="button"
                    className="w-1/2 bg-orange-500 text-white hover:bg-orange-600"
                    onClick={resetForm}
                  >
                    پاک کردن فرم
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function wasJustCreated(iso: string) {
  return Date.now() - new Date(iso).getTime() < 3000;
}
