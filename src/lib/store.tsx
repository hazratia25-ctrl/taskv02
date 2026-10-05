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
import { supabase } from "@/integrations/supabase/client";
import { fetchCloud, pushCloud, fetchSharedProjects, fetchOwnedProjects, mapTaskRow } from "./cloud";
import { isStaleError, STALE_MESSAGE, runVersionedSave } from "./concurrency";
import {
  toggleAssignedStage,
  notifyStageChanges,
  createOwnedProject,
  saveOwnedProject,
  saveSharedProjectContent,
  deleteOwnedProject,
  createOwnedTask,
  saveOwnedTask,
  deleteOwnedTask,
  type ProjectWriteInput,
  type TaskWriteInput,
} from "./collab.functions";

import { pendingCount, flushQueue } from "./sync-queue";
import { deriveProjectStatus, sharedContentPatch } from "./access";
import {
  browserLifecycleEnv,
  createPendingCounter,
  createSingleFlight,
  mergeCollabSnapshot,
  startCollabRealtime,
  type RealtimeClientLike,
} from "./realtime-sync";

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
  createTask: (input: TaskInput) => Promise<Task>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  createProject: (input: ProjectInput) => Promise<Project>;
  updateProject: (id: string, patch: Partial<ProjectInput>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setProjectStatus: (id: string, status: TaskStatus) => Promise<void>;
  toggleStage: (projectId: string, stageId: string) => Promise<void>;
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

// Kept on globalThis so a hot reload of this module reuses the same context
// (otherwise the mounted provider and re-evaluated consumers disagree → blank screen).
const STORE_CTX_KEY = "__taskStoreContext__";
const StoreContext: React.Context<StoreValue | null> =
  ((globalThis as Record<string, unknown>)[STORE_CTX_KEY] as React.Context<StoreValue | null>) ??
  ((globalThis as Record<string, unknown>)[STORE_CTX_KEY] = createContext<StoreValue | null>(null));

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

  // ids with a write in flight: server snapshots must not drop or overwrite them yet
  const pendingProjects = useRef(createPendingCounter());

  const runCollabFetch = useCallback(
    async (isCurrent: () => boolean) => {
      if (!userId || !hydrated.current) return;
      const [shared, owned] = await Promise.all([
        fetchSharedProjects(userId),
        fetchOwnedProjects(userId),
      ]);
      // a newer fetch or a write started meanwhile: this response is stale
      if (!isCurrent() || syncUserId.current !== userId) return;
      setData((prev) => ({
        ...prev,
        projects: mergeCollabSnapshot(prev.projects, owned, shared, (id) =>
          pendingProjects.current.has(id),
        ),
      }));
    },
    [userId],
  );

  // single-flight refresh: at most one request running + one queued rerun
  const collabFlight = useMemo(() => createSingleFlight(runCollabFetch), [runCollabFetch]);
  const refreshCollab = useCallback(() => collabFlight.trigger(), [collabFlight]);

  // one realtime lifecycle per signed-in user: channel, reconnect backoff, fallback poll
  useEffect(() => {
    if (!ready || !userId) return;
    const rt = startCollabRealtime(
      supabase as unknown as RealtimeClientLike,
      userId,
      () => void refreshCollab(),
      browserLifecycleEnv(),
    );
    return () => rt.dispose();
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
    async (next: Project, previous: Project | null, isNew = false) => {
      if (!userId) throw new Error("برای ذخیره پروژه باید وارد حساب شوید.");
      if (next.readOnly && isNew) throw new Error("دسترسی ساخت این پروژه را ندارید.");
      // counted, so overlapping writes to one project keep it pending until the last one settles
      const settle = pendingProjects.current.begin(next.id);
      const call = isNew
        ? createOwnedProject({ data: toWrite(next) })
        : next.readOnly
          ? saveSharedProjectContent({
              data: {
                projectId: next.id,
                patch: {
                  title: next.title,
                  description: next.description,
                  priority: next.priority,
                  dueDate: next.dueDate ?? null,
                },
                expectedUpdatedAt: previous?.updatedAt ?? next.updatedAt,
              },
            })
          : saveOwnedProject({
              data: {
                projectId: next.id,
                patch: toWrite(next),
                expectedUpdatedAt: previous?.updatedAt ?? next.updatedAt,
              },
            });
      let row: { updated_at?: string } | null = null;
      try {
        row = (await call) as { updated_at?: string } | null;
      } catch (e) {
        settle();
        if (isStaleError(e)) {
          restore(previous, next.id);
          toast.error(STALE_MESSAGE);
          collabFlight.invalidate();
          await refreshCollab().catch(() => undefined);
        } else failed(e, previous, next.id);
        throw e;
      }
      settle();
      // keep the server version so the next save carries the right expected timestamp
      const serverTs = row?.updated_at;
      if (serverTs)
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => (p.id === next.id ? { ...p, updatedAt: serverTs } : p)),
        }));
      collabFlight.invalidate(); // any fetch started before the write is now stale
      await refreshCollab();
    },
    [userId, toWrite, failed, restore, refreshCollab, collabFlight],
  );

  const removeProject = useCallback(
    async (previous: Project) => {
      if (!userId || previous.readOnly) throw new Error("دسترسی حذف پروژه ندارید.");
      try {
        collabFlight.invalidate(); // drop snapshots that still contain the project
        await deleteOwnedProject({ data: { projectId: previous.id } });
        collabFlight.invalidate();
      } catch (e) {
        setData((prev) =>
          prev.projects.some((p) => p.id === previous.id)
            ? prev
            : { ...prev, projects: [previous, ...prev.projects] },
        );
        toast.error(e instanceof Error ? e.message : "حذف پروژه در سرور ناموفق بود");
        throw e;
      }
    },
    [userId, collabFlight],
  );

  const value = useMemo<StoreValue>(() => {
    const now = () => new Date().toISOString();

    return {
      ...data,
      ready,
      createTask: async (input) => {
        const task: Task = {
          id: uid(),
          ...input,
          createdAt: now(),
          updatedAt: now(),
          completedAt: input.status === "COMPLETED" ? now() : null,
        };
        patch((p) => ({ ...p, tasks: [task, ...p.tasks] }));
        try {
          const row = await createOwnedTask({ data: task as TaskWriteInput });
          // adopt the server version so the first edit carries the correct expected timestamp
          if (row) patch((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === task.id ? mapTaskRow(row) : t)) }));
          return task;
        } catch (e) {
          patch((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== task.id) }));
          toast.error(e instanceof Error ? e.message : "ذخیرهٔ وظیفه ناموفق بود");
          throw e;
        }
      },
      updateTask: async (id, p2) => {
        const before = data.tasks.find((t) => t.id === id);
        if (!before) throw new Error("وظیفه یافت نشد.");
        const next = {
          ...before,
          ...p2,
          updatedAt: now(),
          completedAt:
            p2.status === "COMPLETED"
              ? (before.completedAt ?? now())
              : p2.status
                ? null
                : before.completedAt,
        };
        await runVersionedSave({
          apply: () =>
            patch((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === id ? next : t)) })),
          rollback: () =>
            patch((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === id ? before : t)) })),
          call: () =>
            saveOwnedTask({
              data: { taskId: id, patch: next as TaskWriteInput, expectedUpdatedAt: before.updatedAt },
            }),
          confirm: (row) =>
            row &&
            patch((p) => ({
              ...p,
              tasks: p.tasks.map((t) => (t.id === id ? mapTaskRow(row) : t)),
            })),
          refetch: async () => {
            const { data: fresh } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
            if (fresh)
              patch((p) => ({
                ...p,
                tasks: p.tasks.map((t) => (t.id === id ? mapTaskRow(fresh) : t)),
              }));
          },
          notify: (m) => toast.error(m),
        });
      },
      deleteTask: async (id) => {
        const before = data.tasks.find((t) => t.id === id);
        const notices = data.notifications.filter((n) => n.taskId === id);
        patch((p) => ({
          ...p,
          tasks: p.tasks.filter((t) => t.id !== id),
          notifications: p.notifications.filter((n) => n.taskId !== id),
        }));
        try {
          await deleteOwnedTask({ data: { taskId: id } });
        } catch (e) {
          if (before)
            patch((p) => ({
              ...p,
              tasks: [before, ...p.tasks],
              notifications: [...notices, ...p.notifications],
            }));
          toast.error("حذف وظیفه ناموفق بود");
          throw e;
        }
      },
      toggleComplete: async (id) => {
        const task = data.tasks.find((t) => t.id === id);
        if (!task) return;
        await value.updateTask(id, {
          status: statusFromCompletion(task.status, task.status !== "COMPLETED"),
        });
      },
      setTaskStatus: async (id, status) => {
        await value.updateTask(id, { status });
      },
      createProject: async (input) => {
        const project: Project = {
          id: uid(),
          ...input,
          createdAt: now(),
          updatedAt: now(),
          completedAt: input.status === "COMPLETED" ? now() : null,
        };
        patch((p) => ({ ...p, projects: [project, ...p.projects] }));
        await persistProject(project, null, true);
        return project;
      },
      updateProject: async (id, input) => {
        const before = data.projects.find((pr) => pr.id === id);
        // shared projects: only content fields may change; the server re-checks EDIT/MANAGE
        const p2: Partial<ProjectInput> = before?.readOnly ? sharedContentPatch(input) : input;
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
        if (next) await persistProject(next, before ?? null);
      },
      deleteProject: async (id) => {
        const before = data.projects.find((pr) => pr.id === id);
        patch((p) => ({ ...p, projects: p.projects.filter((pr) => pr.id !== id) }));
        if (before) await removeProject(before);
      },
      setProjectStatus: async (id, status) => {
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
        if (next) await persistProject(next, before ?? null);
      },

      refreshCollab,
      toggleStage: async (projectId, stageId) => {
        const target = data.projects.find((p) => p.id === projectId);
        if (target?.readOnly) {
          // shared project: only the assigned member may tick, and only on the server
          try {
            await toggleAssignedStage({ data: { projectId, stageId } });
            await refreshCollab();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "به‌روزرسانی مرحله ناموفق بود");
            throw e;
          }
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
        if (next) await persistProject(next, before);
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
          profile: { ...p.profile, ...profile, createdAt: p.profile?.createdAt ?? now() },
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
