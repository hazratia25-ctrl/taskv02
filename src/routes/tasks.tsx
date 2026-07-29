import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { TaskItem } from "@/components/task-item";
import { TaskDialog } from "@/components/task-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isOverdue, useStore } from "@/lib/store";
import { daysBetween } from "@/lib/jalali";
import type { Task } from "@/lib/types";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "وظایف | مدیریت وظایف آفلاین" },
      { name: "description", content: "جست‌وجو، فیلتر و مرتب‌سازی وظایف به‌صورت کاملاً محلی." },
      { property: "og:title", content: "وظایف | مدیریت وظایف آفلاین" },
      { property: "og:description", content: "جست‌وجو، فیلتر و مرتب‌سازی وظایف به‌صورت محلی." },
    ],
  }),
  component: TasksPage,
});

type FilterKey =
  | "ALL"
  | "TODO"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "OVERDUE"
  | "TODAY"
  | "WEEK"
  | "NO_DUE";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "همه" },
  { key: "TODO", label: "انجام‌نشده" },
  { key: "IN_PROGRESS", label: "در حال انجام" },
  { key: "COMPLETED", label: "تکمیل‌شده" },
  { key: "HIGH", label: "اولویت بالا" },
  { key: "MEDIUM", label: "اولویت متوسط" },
  { key: "LOW", label: "اولویت پایین" },
  { key: "OVERDUE", label: "عقب‌افتاده" },
  { key: "TODAY", label: "امروز" },
  { key: "WEEK", label: "این هفته" },
  { key: "NO_DUE", label: "بدون مهلت" },
];

const SORTS = {
  NEWEST: "جدیدترین",
  OLDEST: "قدیمی‌ترین",
  UPDATED: "آخرین تغییر",
  PRIORITY: "بالاترین اولویت",
  DUE: "نزدیک‌ترین مهلت",
  STATUS: "وضعیت",
} as const;
type SortKey = keyof typeof SORTS;

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const STATUS_ORDER = { TODO: 0, IN_PROGRESS: 1, COMPLETED: 2 };

function matchesFilter(task: Task, key: FilterKey) {
  switch (key) {
    case "ALL":
      return true;
    case "TODO":
    case "IN_PROGRESS":
    case "COMPLETED":
      return task.status === key;
    case "HIGH":
    case "MEDIUM":
    case "LOW":
      return task.priority === key;
    case "OVERDUE":
      return isOverdue(task);
    case "TODAY":
      return !!task.dueDate && daysBetween(new Date(), new Date(task.dueDate)) === 0;
    case "WEEK": {
      if (!task.dueDate) return false;
      const d = daysBetween(new Date(), new Date(task.dueDate));
      return d >= 0 && d <= 7;
    }
    case "NO_DUE":
      return !task.dueDate;
  }
}

function TasksPage() {
  const { tasks, categories, tags } = useStore();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState<FilterKey[]>(["ALL"]);
  const [categoryId, setCategoryId] = useState("ALL");
  const [tagId, setTagId] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("NEWEST");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const toggleFilter = (key: FilterKey) => {
    if (key === "ALL") return setActive(["ALL"]);
    setActive((prev) => {
      const without = prev.filter((k) => k !== "ALL");
      const next = without.includes(key) ? without.filter((k) => k !== key) : [...without, key];
      return next.length ? next : ["ALL"];
    });
  };

  const visible = useMemo(() => {
    let list = tasks.filter((t) => active.every((k) => matchesFilter(t, k)));
    if (debounced) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(debounced) ||
          t.description.toLowerCase().includes(debounced),
      );
    }
    if (categoryId !== "ALL") list = list.filter((t) => t.categoryId === categoryId);
    if (tagId !== "ALL") list = list.filter((t) => t.tagIds.includes(tagId));

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "NEWEST":
          return b.createdAt.localeCompare(a.createdAt);
        case "OLDEST":
          return a.createdAt.localeCompare(b.createdAt);
        case "UPDATED":
          return b.updatedAt.localeCompare(a.updatedAt);
        case "PRIORITY":
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        case "DUE":
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        case "STATUS":
          return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      }
    });
    return sorted;
  }, [tasks, active, debounced, categoryId, tagId, sort]);

  const edit = (t: Task) => {
    setEditing(t);
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="وظایف" description="جست‌وجو، فیلتر و مرتب‌سازی" />

      <div className="surface space-y-4 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجو در عنوان و توضیحات…"
            className="pe-10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label="پاک کردن"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => toggleFilter(f.key)}>
              <Badge
                variant={active.includes(f.key) ? "default" : "outline"}
                className={cn("cursor-pointer", active.includes(f.key) && "shadow-sm")}
              >
                {f.label}
              </Badge>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="دسته‌بندی" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">همه دسته‌بندی‌ها</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagId} onValueChange={setTagId}>
            <SelectTrigger>
              <SelectValue placeholder="برچسب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">همه برچسب‌ها</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  #{t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={tasks.length === 0 ? "هنوز وظیفه‌ای ایجاد نکرده‌اید" : "نتیجه‌ای یافت نشد"}
          description={
            tasks.length === 0
              ? "اولین وظیفه خود را ایجاد کنید."
              : "فیلترها یا عبارت جست‌وجو را تغییر دهید."
          }
        />
      ) : (
        <div className="grid gap-3">
          {visible.map((t) => (
            <TaskItem key={t.id} task={t} onEdit={edit} />
          ))}
        </div>
      )}

      <TaskDialog open={open} onOpenChange={setOpen} task={editing} />
    </div>
  );
}
