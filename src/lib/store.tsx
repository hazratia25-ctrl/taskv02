import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyData,
  defaultSettings,
  type AppData,
  type AppNotification,
  type AppSettings,
  type Category,
  type Tag,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UserProfile,
} from "./types";
import { daysBetween, formatJalali } from "./jalali";

const STORAGE_KEY = "task-manager-offline-v1";

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function load(): AppData {
  if (typeof window === "undefined") return emptyData;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData;
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...emptyData,
      ...parsed,
      settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
      tasks: parsed.tasks ?? [],
      categories: parsed.categories ?? [],
      tags: parsed.tags ?? [],
      notifications: parsed.notifications ?? [],
      profile: parsed.profile ?? null,
    };
  } catch {
    return emptyData;
  }
}

export interface TaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  categoryId: string | null;
  tagIds: string[];
  dueDate: string | null;
}

interface StoreValue extends AppData {
  ready: boolean;
  createTask: (input: TaskInput) => Task;
  updateTask: (id: string, patch: Partial<TaskInput>) => void;
  deleteTask: (id: string) => void;
  toggleComplete: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  createCategory: (name: string, color: string) => void;
  updateCategory: (id: string, patch: Partial<Pick<Category, "name" | "color">>) => void;
  deleteCategory: (id: string) => void;
  createTag: (name: string) => void;
  deleteTag: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  clearNotifications: () => void;
  saveProfile: (profile: Omit<UserProfile, "createdAt">) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  exportData: () => string;
  importData: (json: string) => { ok: true } | { ok: false; error: string };
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function statusFromCompletion(status: TaskStatus, completed: boolean): TaskStatus {
  if (completed) return "COMPLETED";
  return status === "COMPLETED" ? "TODO" : status;
}

function buildNotifications(tasks: Task[], existing: AppNotification[], reminderDays: number) {
  const now = new Date();
  const next: AppNotification[] = [...existing];
  const key = (t: string, type: string) => `${t}::${type}`;
  const seen = new Set(existing.map((n) => key(n.taskId, n.type)));

  for (const task of tasks) {
    if (!task.dueDate || task.status === "COMPLETED") continue;
    const diff = daysBetween(now, new Date(task.dueDate));
    let type: AppNotification["type"] | null = null;
    let message = "";
    if (diff < 0) {
      type = "OVERDUE";
      message = `مهلت «${task.title}» گذشته است (${formatJalali(task.dueDate)}).`;
    } else if (diff === 0) {
      type = "DUE_TODAY";
      message = `مهلت «${task.title}» امروز به پایان می‌رسد.`;
    } else if (diff <= reminderDays) {
      type = "DUE_SOON";
      message = `مهلت «${task.title}» نزدیک است (${formatJalali(task.dueDate)}).`;
    }
    if (!type || seen.has(key(task.id, type))) continue;
    seen.add(key(task.id, type));
    next.unshift({
      id: uid(),
      taskId: task.id,
      type,
      title:
        type === "OVERDUE" ? "وظیفه عقب‌افتاده" : type === "DUE_TODAY" ? "مهلت امروز" : "یادآوری مهلت",
      message,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }
  return next.slice(0, 200);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    const loaded = load();
    setData(loaded);
    hydrated.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* quota errors ignored */
    }
  }, [data]);

  // theme
  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => {
      const mode = data.settings.theme;
      const dark =
        mode === "dark" ||
        (mode === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [data.settings.theme]);

  // local deadline notifications (offline, no server)
  useEffect(() => {
    if (!ready || !data.settings.notificationsEnabled) return;
    const run = () =>
      setData((prev) => ({
        ...prev,
        notifications: buildNotifications(
          prev.tasks,
          prev.notifications,
          prev.settings.reminderDays,
        ),
      }));
    run();
    const t = window.setInterval(run, 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [ready, data.tasks, data.settings.notificationsEnabled, data.settings.reminderDays]);

  const patch = useCallback((fn: (prev: AppData) => AppData) => setData(fn), []);

  const value = useMemo<StoreValue>(() => {
    const now = () => new Date().toISOString();

    return {
      ...data,
      ready,
      createTask: (input) => {
        const task: Task = {
          id: uid(),
          ...input,
          createdAt: now(),
          updatedAt: now(),
          completedAt: input.status === "COMPLETED" ? now() : null,
        };
        patch((p) => ({ ...p, tasks: [task, ...p.tasks] }));
        return task;
      },
      updateTask: (id, p2) =>
        patch((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...p2,
                  updatedAt: now(),
                  completedAt:
                    p2.status === "COMPLETED"
                      ? (t.completedAt ?? now())
                      : p2.status
                        ? null
                        : t.completedAt,
                }
              : t,
          ),
        })),
      deleteTask: (id) =>
        patch((p) => ({
          ...p,
          tasks: p.tasks.filter((t) => t.id !== id),
          notifications: p.notifications.filter((n) => n.taskId !== id),
        })),
      toggleComplete: (id) =>
        patch((p) => ({
          ...p,
          tasks: p.tasks.map((t) => {
            if (t.id !== id) return t;
            const completed = t.status !== "COMPLETED";
            return {
              ...t,
              status: statusFromCompletion(t.status, completed),
              completedAt: completed ? now() : null,
              updatedAt: now(),
            };
          }),
        })),
      setTaskStatus: (id, status) =>
        patch((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status,
                  completedAt: status === "COMPLETED" ? (t.completedAt ?? now()) : null,
                  updatedAt: now(),
                }
              : t,
          ),
        })),
      createCategory: (name, color) =>
        patch((p) => ({
          ...p,
          categories: [...p.categories, { id: uid(), name, color, createdAt: now() }],
        })),
      updateCategory: (id, p2) =>
        patch((p) => ({
          ...p,
          categories: p.categories.map((c) => (c.id === id ? { ...c, ...p2 } : c)),
        })),
      deleteCategory: (id) =>
        patch((p) => ({
          ...p,
          categories: p.categories.filter((c) => c.id !== id),
          tasks: p.tasks.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t)),
        })),
      createTag: (name) =>
        patch((p) =>
          p.tags.some((t) => t.name === name)
            ? p
            : { ...p, tags: [...p.tags, { id: uid(), name, createdAt: now() }] },
        ),
      deleteTag: (id) =>
        patch((p) => ({
          ...p,
          tags: p.tags.filter((t) => t.id !== id),
          tasks: p.tasks.map((t) => ({ ...t, tagIds: t.tagIds.filter((x) => x !== id) })),
        })),
      markNotificationRead: (id) =>
        patch((p) => ({
          ...p,
          notifications: p.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        })),
      markAllNotificationsRead: () =>
        patch((p) => ({
          ...p,
          notifications: p.notifications.map((n) => ({ ...n, isRead: true })),
        })),
      deleteNotification: (id) =>
        patch((p) => ({ ...p, notifications: p.notifications.filter((n) => n.id !== id) })),
      clearNotifications: () => patch((p) => ({ ...p, notifications: [] })),
      saveProfile: (profile) =>
        patch((p) => ({
          ...p,
          profile: { ...profile, createdAt: p.profile?.createdAt ?? now() },
        })),
      updateSettings: (p2) => patch((p) => ({ ...p, settings: { ...p.settings, ...p2 } })),
      exportData: () => JSON.stringify(data, null, 2),
      importData: (json) => {
        try {
          const parsed = JSON.parse(json) as Partial<AppData>;
          if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tasks)) {
            return { ok: false as const, error: "ساختار فایل معتبر نیست (فهرست وظایف یافت نشد)." };
          }
          const tasks = parsed.tasks.filter(
            (t): t is Task => !!t && typeof t.id === "string" && typeof t.title === "string",
          );
          const dedupe = <T extends { id: string }>(items: T[] | undefined) => {
            const map = new Map<string, T>();
            (items ?? []).forEach((i) => i && typeof i.id === "string" && map.set(i.id, i));
            return [...map.values()];
          };
          setData({
            version: 1,
            tasks: dedupe(tasks),
            categories: dedupe(parsed.categories as Category[]),
            tags: dedupe(parsed.tags as Tag[]),
            notifications: dedupe(parsed.notifications as AppNotification[]),
            profile: parsed.profile ?? null,
            settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
          });
          return { ok: true as const };
        } catch {
          return { ok: false as const, error: "فایل JSON قابل خواندن نیست." };
        }
      },
      resetAll: () => setData(emptyData),
    };
  }, [data, ready, patch]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function isOverdue(task: Task) {
  return (
    !!task.dueDate && task.status !== "COMPLETED" && daysBetween(new Date(), new Date(task.dueDate)) < 0
  );
}
