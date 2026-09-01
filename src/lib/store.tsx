import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  emptyData,
  defaultSettings,
  type AppData,
  type AppNotification,
  type AppSettings,
  type Category,
  type Project,
  type Tag,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UserProfile,
} from "./types";
import { daysBetween, formatJalali } from "./jalali";
import { useAuth } from "./auth";
import { fetchCloud, pushCloud, fetchSharedProjects, fetchOwnedProjects } from "./cloud";
import {
  toggleAssignedStage,
  notifyStageChanges,
  createOwnedProject,
  saveOwnedProject,
  deleteOwnedProject,
  type ProjectWriteInput,
} from "./collab.functions";

import { pendingCount, flushQueue } from "./sync-queue";
import { deriveProjectStatus, mergeOwnedProject, mergeSharedStages } from "./access";

import { toast } from "sonner";

const STORAGE_PREFIX = "task-manager-offline-v1";
const LEGACY_KEY = "task-manager-offline-v1";

/** Each account keeps its own local cache so data never leaks between users. */
const storageKeyFor = (userId: string | null) => `${STORAGE_PREFIX}::${userId ?? "guest"}`;

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function load(key: string): AppData {
  if (typeof window === "undefined") return emptyData;
  try {
    // drop the old shared cache (it was visible to every account on this device)
    if (window.localStorage.getItem(LEGACY_KEY)) window.localStorage.removeItem(LEGACY_KEY);
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptyData;
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...emptyData,
      ...parsed,
      settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
      tasks: parsed.tasks ?? [],
      projects: parsed.projects ?? [],
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

export interface ProjectInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  categoryId: string | null;
  tagIds: string[];
  dueDate: string | null;
  members: Project["members"];
  stages: Project["stages"];
}

interface StoreValue extends AppData {
  ready: boolean;
  createTask: (input: TaskInput) => Task;
  updateTask: (id: string, patch: Partial<TaskInput>) => void;
  deleteTask: (id: string) => void;
  toggleComplete: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  createProject: (input: ProjectInput) => Project;
  updateProject: (id: string, patch: Partial<ProjectInput>) => void;
  deleteProject: (id: string) => void;
  setProjectStatus: (id: string, status: TaskStatus) => void;
  toggleStage: (projectId: string, stageId: string) => void;
  /** Re-pulls shared projects and owner-side stage updates from the cloud. */
  refreshCollab: () => Promise<void>;
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
        type === "OVERDUE"
          ? "وظیفه عقب‌افتاده"
          : type === "DUE_TODAY"
            ? "مهلت امروز"
            : "یادآوری مهلت",
      message,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }
  return next.slice(0, 200);
}

type Notice = { memberUserId: string; title: string; message: string };

/** Builds in-app/push notices for stage assignment, date and status changes. */
function stageNotices(
  before: Project,
  after: Pick<Project, "stages" | "members" | "title">,
): Notice[] {
  const out: Notice[] = [];
  const userIdOf = (memberId?: string | null) =>
    (after.members ?? []).find((m) => m.id === memberId)?.userId ?? null;
  const push = (memberId: string | null | undefined, title: string, message: string) => {
    const uidOfMember = userIdOf(memberId);
    if (uidOfMember) out.push({ memberUserId: uidOfMember, title, message });
  };

  for (const st of after.stages ?? []) {
    const old = (before.stages ?? []).find((x) => x.id === st.id);
    const project = after.title;
    if (!old || old.assigneeId !== st.assigneeId) {
      push(
        st.assigneeId,
        "مرحله به شما اختصاص یافت",
        `مرحله «${st.title}» در پروژه «${project}» به شما سپرده شد.`,
      );
      if (old?.assigneeId && old.assigneeId !== st.assigneeId) {
        push(
          old.assigneeId,
          "تغییر مسئول مرحله",
          `مسئولیت مرحله «${st.title}» در پروژه «${project}» به فرد دیگری منتقل شد.`,
        );
      }
      continue;
    }
    if ((old.dueDate ?? null) !== (st.dueDate ?? null)) {
      push(
        st.assigneeId,
        "تغییر مهلت مرحله",
        `مهلت مرحله «${st.title}» در پروژه «${project}» تغییر کرد.`,
      );
    }
    if (old.done !== st.done) {
      push(
        st.assigneeId,
        st.done ? "مرحله شما تکمیل شد" : "مرحله شما بازگشایی شد",
        `وضعیت مرحله «${st.title}» در پروژه «${project}» ${st.done ? "به تکمیل‌شده" : "به انجام‌نشده"} تغییر کرد.`,
      );
    }
  }
  return out;
}

function sendNotices(projectId: string, items: Notice[]) {
  if (!items.length) return;
  void notifyStageChanges({ data: { projectId, items } }).catch(() => {
    /* notifications are best-effort */
  });
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);
  const syncUserId = useRef<string | null>(null);

  const userId = user?.id ?? null;
  const storageKey = storageKeyFor(userId);

  // load: cloud when signed in, local cache otherwise (cache is per account)
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const key = storageKeyFor(userId);

    if (!userId) {
      syncUserId.current = null;
      setData(load(key));
      hydrated.current = true;
      setReady(true);
      return;
    }

    setReady(false);
    hydrated.current = false;
    (async () => {
      // send anything still queued from the previous session before trusting the server copy
      try {
        await flushQueue(userId);
      } catch {
        /* stays queued */
      }
      let local = load(key);
      // one-time adoption of the pre-account cache for the first signed-in user
      if (local.tasks.length === 0 && local.projects.length === 0) {
        const guest = load(storageKeyFor(null));
        if (guest.tasks.length > 0 || guest.projects.length > 0) local = guest;
      }
      let snapshot;
      try {
        snapshot = await fetchCloud(userId);
      } catch {
        if (cancelled) return;
        // offline: fall back to local cache
        setData(local);
        hydrated.current = true;
        setReady(true);
        return;
      }
      if (cancelled) return;

      const cloudEmpty =
        snapshot.projects.length === 0 &&
        snapshot.tasks.length === 0 &&
        snapshot.categories.length === 0 &&
        snapshot.tags.length === 0;
      const localHasData =
        local.projects.length > 0 ||
        local.tasks.length > 0 ||
        local.categories.length > 0 ||
        local.tags.length > 0;
      // unsent local edits are newer than whatever the server has → never overwrite them
      const hasPending = pendingCount(userId) > 0;
      const useLocal = (cloudEmpty && localHasData) || (hasPending && localHasData);

      const next: AppData = {
        version: 1,
        tasks: useLocal ? local.tasks : snapshot.tasks,
        projects: useLocal ? local.projects : snapshot.projects,
        categories: useLocal ? local.categories : snapshot.categories,
        tags: useLocal ? local.tags : snapshot.tags,
        notifications: useLocal ? local.notifications : snapshot.notifications,
        profile: hasPending
          ? (local.profile ?? snapshot.profile)
          : (snapshot.profile ?? local.profile),
        settings: snapshot.settings,
      };

      setData(next);
      hydrated.current = true;
      syncUserId.current = userId;
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  useEffect(() => {
    if (!hydrated.current) return;
    // debounced so typing in a form does not serialize the whole store on every keystroke
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        /* quota errors ignored */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [data, storageKey]);

  // debounced write-through sync to the cloud
  useEffect(() => {
    if (!hydrated.current || !userId || syncUserId.current !== userId) return;
    const t = window.setTimeout(() => {
      pushCloud(userId, data).catch(() => {
        /* offline: local cache keeps the data until next sync */
      });
    }, 900);
    return () => window.clearTimeout(t);
  }, [data, userId]);

  // theme
  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => {
      const mode = data.settings.theme;
      const dark =
        mode === "dark" ||
        (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
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

  // pulls shared projects plus stage ticks made by invited members on owned projects
  const refreshCollab = useCallback(async () => {
    if (!userId || !hydrated.current) return;
    try {
      const [shared, owned] = await Promise.all([
        fetchSharedProjects(userId),
        fetchOwnedProjects(userId),
      ]);
      setData((prev) => ({
        ...prev,
        projects: [
          ...prev.projects
            .filter((p) => !p.readOnly)
            .map((p) => {
              const remote = owned.find((o) => o.id === p.id);
              // merge instead of replace: member ticks and invite answers survive local edits
              return remote ? mergeOwnedProject(p, remote) : p;
            }),
          ...shared.map((s) => {
            const local = prev.projects.find((p) => p.id === s.id);
            return local ? { ...s, stages: mergeSharedStages(local.stages, s.stages) } : s;
          }),
        ],
      }));
    } catch {
      /* offline: keep whatever we have */
    }
  }, [userId]);

  useEffect(() => {
    if (!ready || !userId) return;
    // skip polling while the tab is in the background to keep the UI snappy
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshCollab();
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ready, userId, refreshCollab]);

  /** Serialises a local project into the server write contract. */
  const toWrite = useCallback(
    (p: Project): ProjectWriteInput => ({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      status: p.status,
      priority: p.priority,
      categoryId: p.categoryId,
      tagIds: p.tagIds ?? [],
      dueDate: p.dueDate,
      members: p.members ?? [],
      stages: p.stages ?? [],
      createdAt: p.createdAt,
    }),
    [],
  );

  const restore = useCallback((previous: Project | null, id: string) => {
    setData((prev) => ({
      ...prev,
      projects: previous
        ? prev.projects.map((p) => (p.id === id ? previous : p))
        : prev.projects.filter((p) => p.id !== id),
    }));
  }, []);

  const failed = useCallback(
    (e: unknown, previous: Project | null, id: string) => {
      restore(previous, id);
      toast.error(e instanceof Error ? e.message : "ذخیرهٔ پروژه در سرور ناموفق بود");
    },
    [restore],
  );

  /** Persists an owned project to the cloud; rolls the local state back on failure. */
  const persistProject = useCallback(
    (next: Project, previous: Project | null, isNew = false) => {
      if (!userId || next.readOnly) return;
      const call = isNew
        ? createOwnedProject({ data: toWrite(next) })
        : saveOwnedProject({ data: { projectId: next.id, patch: toWrite(next) } });
      void call.catch((e: unknown) => failed(e, previous, next.id));
    },
    [userId, toWrite, failed],
  );

  const removeProject = useCallback(
    (previous: Project) => {
      if (!userId || previous.readOnly) return;
      void deleteOwnedProject({ data: { projectId: previous.id } }).catch((e: unknown) => {
        setData((prev) =>
          prev.projects.some((p) => p.id === previous.id)
            ? prev
            : { ...prev, projects: [previous, ...prev.projects] },
        );
        toast.error(e instanceof Error ? e.message : "حذف پروژه در سرور ناموفق بود");
      });
    },
    [userId],
  );

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
      createProject: (input) => {
        const project: Project = {
          id: uid(),
          ...input,
          createdAt: now(),
          updatedAt: now(),
          completedAt: input.status === "COMPLETED" ? now() : null,
        };
        patch((p) => ({ ...p, projects: [project, ...p.projects] }));
        persistProject(project, null, true);
        return project;
      },
      updateProject: (id, p2) => {
        const before = data.projects.find((pr) => pr.id === id);
        if (before && !before.readOnly && p2.stages) {
          sendNotices(
            id,
            stageNotices(before, {
              stages: p2.stages,
              members: p2.members ?? before.members,
              title: p2.title ?? before.title,
            }),
          );
        }
        let next: Project | null = null;
        patch((p) => ({
          ...p,
          projects: p.projects.map((pr) => {
            if (pr.id !== id) return pr;
            next = {
              ...pr,
              ...p2,
              updatedAt: now(),
              completedAt:
                p2.status === "COMPLETED"
                  ? (pr.completedAt ?? now())
                  : p2.status
                    ? null
                    : pr.completedAt,
            };
            return next;
          }),
        }));
        if (next) persistProject(next, before ?? null);
      },
      deleteProject: (id) => {
        const before = data.projects.find((pr) => pr.id === id);
        patch((p) => ({ ...p, projects: p.projects.filter((pr) => pr.id !== id) }));
        if (before) removeProject(before);
      },
      setProjectStatus: (id, status) => {
        const before = data.projects.find((pr) => pr.id === id);
        let next: Project | null = null;
        patch((p) => ({
          ...p,
          projects: p.projects.map((pr) => {
            if (pr.id !== id) return pr;
            next = {
              ...pr,
              status,
              completedAt: status === "COMPLETED" ? (pr.completedAt ?? now()) : null,
              updatedAt: now(),
            };
            return next;
          }),
        }));
        if (next) persistProject(next, before ?? null);
      },

      refreshCollab,
      toggleStage: (projectId, stageId) => {
        const target = data.projects.find((p) => p.id === projectId);
        if (target?.readOnly) {
          // shared project: only the assigned member may tick, and only on the server
          void toggleAssignedStage({ data: { projectId, stageId } })
            .then(() => refreshCollab())
            .catch((e: unknown) =>
              toast.error(e instanceof Error ? e.message : "به‌روزرسانی مرحله ناموفق بود"),
            );
          return;
        }
        const before = target ?? null;
        let next: Project | null = null;
        patch((p) => ({
          ...p,
          projects: p.projects.map((pr) => {
            if (pr.id !== projectId) return pr;
            const stages = pr.stages.map((st) =>
              st.id === stageId ? { ...st, done: !st.done, doneAt: now() } : st,
            );
            sendNotices(pr.id, stageNotices(pr, { ...pr, stages }));
            const status = deriveProjectStatus(stages, pr.status);
            next = {
              ...pr,
              stages,
              status,
              completedAt: status === "COMPLETED" ? (pr.completedAt ?? now()) : null,
              updatedAt: now(),
            };
            return next;
          }),
        }));
        if (next) persistProject(next, before);
      },

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
          projects: p.projects.map((pr) =>
            pr.categoryId === id ? { ...pr, categoryId: null } : pr,
          ),
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
          projects: p.projects.map((pr) => ({
            ...pr,
            tagIds: pr.tagIds.filter((x) => x !== id),
          })),
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
            projects: dedupe(parsed.projects as Project[]),
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
  }, [data, ready, patch, refreshCollab, persistProject, removeProject]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function isOverdue(item: { dueDate: string | null; status: TaskStatus }) {
  return (
    !!item.dueDate &&
    item.status !== "COMPLETED" &&
    daysBetween(new Date(), new Date(item.dueDate)) < 0
  );
}

export function projectProgress(project: Project) {
  if (project.status === "COMPLETED") return 100;
  if (project.stages.length === 0) return project.status === "IN_PROGRESS" ? 25 : 0;
  const done = project.stages.filter((s) => s.done).length;
  return Math.round((done / project.stages.length) * 100);
}
