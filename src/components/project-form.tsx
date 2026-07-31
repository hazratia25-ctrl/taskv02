import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { useStore, uid, type ProjectInput } from "@/lib/store";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Project,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { JalaliDatePicker } from "./jalali-date-picker";
import { Plus, Trash2, Users, ListOrdered } from "lucide-react";
import { toast } from "sonner";

const NONE = "__none__";

function emptyForm(defaultDueDate?: string | null): ProjectInput {
  return {
    title: "",
    description: "",
    status: "TODO",
    priority: "MEDIUM",
    categoryId: null,
    tagIds: [],
    dueDate: defaultDueDate ?? null,
    members: [],
    stages: [],
  };
}

function fromProject(project: Project): ProjectInput {
  return {
    title: project.title,
    description: project.description,
    status: project.status,
    priority: project.priority,
    categoryId: project.categoryId,
    tagIds: project.tagIds,
    dueDate: project.dueDate,
    members: project.members ?? [],
    stages: project.stages ?? [],
  };
}

export function ProjectFormBody({
  project,
  defaultDueDate,
  onDone,
}: {
  project?: Project | null;
  defaultDueDate?: string | null;
  onDone: () => void;
}) {
  const { categories, tags, createProject, updateProject, createTag } = useStore();
  const [form, setForm] = useState<ProjectInput>(
    project ? fromProject(project) : emptyForm(defaultDueDate),
  );
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [stageTitle, setStageTitle] = useState("");
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(project ? fromProject(project) : emptyForm(defaultDueDate));
    setError("");
  }, [project, defaultDueDate]);

  const reset = () => {
    setForm(project ? fromProject(project) : emptyForm(defaultDueDate));
    setMemberName("");
    setMemberRole("");
    setStageTitle("");
    setError("");
  };

  const addMember = () => {
    const name = memberName.trim();
    if (!name) return;
    setForm((f) => ({
      ...f,
      members: [...f.members, { id: uid(), name, role: memberRole.trim() || "عضو تیم" }],
    }));
    setMemberName("");
    setMemberRole("");
  };

  const addStage = () => {
    const title = stageTitle.trim();
    if (!title) return;
    setForm((f) => ({ ...f, stages: [...f.stages, { id: uid(), title, done: false, dueDate: null }] }));
    setStageTitle("");
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 2) {
      setError("عنوان پروژه را وارد کنید.");
      return;
    }
    try {
      if (project) {
        updateProject(project.id, { ...form, title: form.title.trim() });
        toast.success("پروژه به‌روزرسانی شد");
      } else {
        createProject({ ...form, title: form.title.trim() });
        toast.success("پروژه ایجاد شد");
      }
      onDone();
    } catch {
      toast.error("ذخیره‌سازی ناموفق بود");
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="p-title">نام پروژه</Label>
        <Input
          id="p-title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="مثلاً بازطراحی سامانه"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-desc">توضیحات</Label>
        <Textarea
          id="p-desc"
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="شرح پروژه و اهداف…"
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
          onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v === NONE ? null : v }))}
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
        <Label>مهلت پروژه (تاریخ و ساعت)</Label>
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
                    tagIds: active ? f.tagIds.filter((x) => x !== t.id) : [...f.tagIds, t.id],
                  }))
                }
              >
                <Badge variant={active ? "default" : "outline"}>{t.name}</Badge>
              </button>
            );
          })}
          {tags.length === 0 && <p className="text-xs text-muted-foreground">هنوز برچسبی ندارید.</p>}
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
            <Plus className="size-4" /> افزودن
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border p-3">
        <Label className="flex items-center gap-2">
          <Users className="size-4" /> اعضای تیم و نقش هر عضو
        </Label>
        <div className="space-y-2">
          {form.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
              <span className="text-sm font-medium">{m.name}</span>
              <Badge variant="outline">{m.role}</Badge>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="ms-auto text-destructive"
                aria-label="حذف عضو"
                onClick={() =>
                  setForm((f) => ({ ...f, members: f.members.filter((x) => x.id !== m.id) }))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {form.members.length === 0 && (
            <p className="text-xs text-muted-foreground">عضوی اضافه نشده است.</p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="نام عضو"
          />
          <Input
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value)}
            placeholder="نقش (مثلاً کارشناس)"
          />
          <Button type="button" variant="secondary" onClick={addMember}>
            <Plus className="size-4" /> افزودن عضو
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border p-3">
        <Label className="flex items-center gap-2">
          <ListOrdered className="size-4" /> مراحل پروژه
        </Label>
        <div className="space-y-2">
          {form.stages.map((st, i) => (
            <div key={st.id} className="space-y-2 rounded-xl bg-muted/60 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={st.done}
                  onCheckedChange={() =>
                    setForm((f) => ({
                      ...f,
                      stages: f.stages.map((x) => (x.id === st.id ? { ...x, done: !x.done } : x)),
                    }))
                  }
                  aria-label="تکمیل مرحله"
                />
                <span className="text-sm font-medium">
                  مرحله {i + 1}: {st.title}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="ms-auto text-destructive"
                  aria-label="حذف مرحله"
                  onClick={() =>
                    setForm((f) => ({ ...f, stages: f.stages.filter((x) => x.id !== st.id) }))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <JalaliDatePicker
                value={st.dueDate}
                onChange={(iso) =>
                  setForm((f) => ({
                    ...f,
                    stages: f.stages.map((x) => (x.id === st.id ? { ...x, dueDate: iso } : x)),
                  }))
                }
              />
            </div>
          ))}
          {form.stages.length === 0 && (
            <p className="text-xs text-muted-foreground">مرحله‌ای تعریف نشده است.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={stageTitle}
            onChange={(e) => setStageTitle(e.target.value)}
            placeholder="عنوان مرحله (مثلاً تحلیل نیازها)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStage();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addStage}>
            <Plus className="size-4" /> افزودن مرحله
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter className="gap-2 sm:justify-start">
        <Button type="submit">{project ? "ذخیره تغییرات" : "ایجاد پروژه"}</Button>
        <div className="flex flex-1 gap-2">
          <Button type="button" variant="destructive" className="w-1/2" onClick={onDone}>
            انصراف
          </Button>
          <Button
            type="button"
            className="w-1/2 bg-orange-500 text-white hover:bg-orange-600"
            onClick={reset}
          >
            پاک کردن فرم
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
