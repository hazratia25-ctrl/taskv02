import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  defaultSettings,
  type AppData,
  type AppNotification,
  type AppSettings,
  type Category,
  type Project,
  type ProjectMember,
  type ProjectStage,
  type Tag,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UserProfile,
} from "./types";

export interface CloudSnapshot {
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
  notifications: AppNotification[];
  profile: UserProfile | null;
  settings: AppSettings;
}

export async function fetchCloud(userId: string): Promise<CloudSnapshot> {
  const [profileRes, tasksRes, projectsRes, catsRes, tagsRes, notifsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("tasks").select("*").eq("user_id", userId),
    supabase.from("projects").select("*").eq("user_id", userId),
    supabase.from("categories").select("*").eq("user_id", userId),
    supabase.from("tags").select("*").eq("user_id", userId),
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const p = profileRes.data;
  const profile: UserProfile | null = p
    ? {
        name: p.name ?? "",
        role: p.role ?? "",
        email: p.email ?? "",
        avatar: p.avatar ?? null,
        createdAt: p.created_at,
      }
    : null;

  const settings: AppSettings = {
    ...defaultSettings,
    ...((p?.settings as Partial<AppSettings> | null) ?? {}),
  };

  return {
    profile,
    settings,
    tasks: (tasksRes.data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      status: t.status as TaskStatus,
      priority: t.priority as TaskPriority,
      categoryId: t.category_id,
      tagIds: t.tag_ids ?? [],
      dueDate: t.due_date,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      completedAt: t.completed_at,
    })),
    projects: (projectsRes.data ?? []).map((p2) => ({
      id: p2.id,
      title: p2.title,
      description: p2.description ?? "",
      status: p2.status as TaskStatus,
      priority: p2.priority as TaskPriority,
      categoryId: p2.category_id,
      tagIds: p2.tag_ids ?? [],
      dueDate: p2.due_date,
      members: (p2.members as unknown as ProjectMember[] | null) ?? [],
      stages: (p2.stages as unknown as ProjectStage[] | null) ?? [],
      createdAt: p2.created_at,
      updatedAt: p2.updated_at,
      completedAt: p2.completed_at,
    })),
    categories: (catsRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      createdAt: c.created_at,
    })),
    tags: (tagsRes.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.created_at,
    })),
    notifications: (notifsRes.data ?? []).map((n) => ({
      id: n.id,
      taskId: n.task_id,
      type: n.type as AppNotification["type"],
      title: n.title,
      message: n.message,
      isRead: n.is_read,
      createdAt: n.created_at,
    })),
  };
}

type SyncTable = "tasks" | "projects" | "categories" | "tags" | "notifications";
type Row = { id: string } & Record<string, unknown>;

/** Cache of the last synced row shapes so we only send what actually changed. */
let cacheUserId: string | null = null;
const rowCache = new Map<string, string>();
const idCache = new Map<SyncTable, string>();
let profileCache = "";

export function resetSyncCache() {
  cacheUserId = null;
  rowCache.clear();
  idCache.clear();
  profileCache = "";
}

/** Incremental write-through sync: upsert changed rows, remove rows deleted locally. */
export async function pushCloud(userId: string, data: AppData): Promise<void> {
  if (cacheUserId !== userId) {
    resetSyncCache();
    cacheUserId = userId;
  }

  const tasks: Row[] = data.tasks.map((t) => ({
    user_id: userId,
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    status: t.status,
    priority: t.priority,
    category_id: t.categoryId,
    tag_ids: t.tagIds ?? [],
    due_date: t.dueDate,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    completed_at: t.completedAt,
  }));
  const projects: Row[] = data.projects.map((p) => ({
    user_id: userId,
    id: p.id,
    title: p.title,
    description: p.description ?? "",
    status: p.status,
    priority: p.priority,
    category_id: p.categoryId,
    tag_ids: p.tagIds ?? [],
    due_date: p.dueDate,
    members: (p.members ?? []) as unknown as Json,
    stages: (p.stages ?? []) as unknown as Json,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    completed_at: p.completedAt,
  }));
  const categories: Row[] = data.categories.map((c) => ({
    user_id: userId,
    id: c.id,
    name: c.name,
    color: c.color,
    created_at: c.createdAt,
  }));
  const tags: Row[] = data.tags.map((t) => ({
    user_id: userId,
    id: t.id,
    name: t.name,
    created_at: t.createdAt,
  }));
  const notifications: Row[] = data.notifications.slice(0, 200).map((n) => ({
    user_id: userId,
    id: n.id,
    task_id: n.taskId,
    type: n.type,
    title: n.title,
    message: n.message,
    is_read: n.isRead,
    created_at: n.createdAt,
  }));

  const batches: [SyncTable, Row[]][] = [
    ["tasks", tasks],
    ["projects", projects],
    ["categories", categories],
    ["tags", tags],
    ["notifications", notifications],
  ];

  const jobs: PromiseLike<unknown>[] = [];

  for (const [table, rows] of batches) {
    const changed = rows.filter((row) => {
      const key = `${table}:${row.id}`;
      const json = JSON.stringify(row);
      if (rowCache.get(key) === json) return false;
      rowCache.set(key, json);
      return true;
    });
    if (changed.length) jobs.push(supabase.from(table).upsert(changed as never));

    const idsKey = rows.map((r) => r.id).join("|");
    if (idCache.get(table) !== idsKey) {
      idCache.set(table, idsKey);
      jobs.push(
        deleteMissing(
          table,
          userId,
          rows.map((r) => r.id),
        ),
      );
    }
  }

  const profileRow = data.profile
    ? {
        id: userId,
        name: data.profile.name,
        role: data.profile.role ?? "",
        email: data.profile.email ?? "",
        avatar: data.profile.avatar,
        settings: data.settings as unknown as Json,
      }
    : { id: userId, settings: data.settings as unknown as Json };
  const profileJson = JSON.stringify(profileRow);
  if (profileJson !== profileCache) {
    profileCache = profileJson;
    jobs.push(
      data.profile
        ? supabase
            .from("profiles")
            .upsert({ ...profileRow, updated_at: new Date().toISOString() } as never)
        : supabase
            .from("profiles")
            .update({ settings: data.settings as unknown as Json })
            .eq("id", userId),
    );
  }

  await Promise.all(jobs);
}

async function deleteMissing(table: SyncTable, userId: string, ids: string[]) {
  let q = supabase.from(table).delete().eq("user_id", userId);
  if (ids.length) {
    const list = ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",");
    q = q.not("id", "in", `(${list})`);
  }
  await q;
}

