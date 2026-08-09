import { supabase } from "@/integrations/supabase/client";
import { enqueue, flushQueue, type SyncOp } from "./sync-queue";
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

type ProjectRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category_id: string | null;
  tag_ids: string[] | null;
  due_date: string | null;
  members: unknown;
  stages: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function mapProject(row: ProjectRow, userId: string): Project {
  const members = (row.members as ProjectMember[] | null) ?? [];
  const shared = row.user_id !== userId;
  const mine = members.find((m) => m.userId === userId);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    categoryId: row.category_id,
    tagIds: row.tag_ids ?? [],
    dueDate: row.due_date,
    members,
    stages: (row.stages as ProjectStage[] | null) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    ...(shared ? { readOnly: true, myMemberId: mine?.id ?? null } : {}),
  };
}

/** Projects owned by other accounts where the user accepted an invite. */
export async function fetchSharedProjects(userId: string): Promise<Project[]> {
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("member_user_id", userId)
    .eq("status", "ACCEPTED");
  const ids = (memberships ?? []).map((m) => m.project_id);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("projects").select("*").in("id", ids);
  return ((data ?? []) as ProjectRow[])
    .filter((row) => row.user_id !== userId)
    .map((row) => mapProject(row, userId));
}

/** Owned projects, used to pick up stage ticks made by invited members. */
export async function fetchOwnedProjects(userId: string): Promise<Project[]> {
  const { data } = await supabase.from("projects").select("*").eq("user_id", userId);
  return ((data ?? []) as ProjectRow[]).map((row) => mapProject(row, userId));
}

export async function fetchCloud(userId: string): Promise<CloudSnapshot> {
  const [profileRes, tasksRes, projectsRes, catsRes, tagsRes, notifsRes, shared] =
    await Promise.all([
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
      fetchSharedProjects(userId).catch(() => [] as Project[]),
    ]);

  const p = profileRes.data;
  const profile: UserProfile | null = p
    ? {
        name: p.name ?? "",
        role: p.role ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        extension: p.extension ?? "",
        avatar: p.avatar ?? null,
        createdAt: p.created_at,
        userCode: p.user_code,
        username: p.username ?? null,
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
    projects: [
      ...((projectsRes.data ?? []) as unknown as ProjectRow[]).map((row) =>
        mapProject(row, userId),
      ),
      ...shared,
    ],
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
  // shared (read-only) projects belong to another account and are never uploaded from here
  const projects: Row[] = data.projects
    .filter((p) => !p.readOnly)
    .map((p) => ({
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

  const ops: SyncOp[] = [];

  for (const [table, rows] of batches) {
    for (const row of rows) {
      const key = `${table}:${row.id}`;
      const json = JSON.stringify(row);
      if (rowCache.get(key) === json) continue;
      rowCache.set(key, json);
      ops.push({ key: `up:${key}`, table, kind: "upsert", row });
    }

    const ids = rows.map((r) => r.id);
    const idsKey = ids.join("|");
    if (idCache.get(table) !== idsKey) {
      const previous = (idCache.get(table) ?? "").split("|").filter(Boolean);
      idCache.set(table, idsKey);
      const present = new Set(ids);
      for (const gone of previous.filter((id) => !present.has(id))) {
        rowCache.delete(`${table}:${gone}`);
        ops.push({ key: `del:${table}:${gone}`, table, kind: "delete", rowId: gone });
      }
    }
  }

  const profileRow = data.profile
    ? {
        id: userId,
        name: data.profile.name,
        role: data.profile.role ?? "",
        email: data.profile.email ?? "",
        phone: data.profile.phone ?? "",
        extension: data.profile.extension ?? "",
        avatar: data.profile.avatar,
        username: data.profile.username ?? null,
        settings: data.settings as unknown as Json,
      }
    : { id: userId, settings: data.settings as unknown as Json };
  const profileJson = JSON.stringify(profileRow);
  if (profileJson !== profileCache) {
    profileCache = profileJson;
    ops.push({
      key: "up:profiles",
      table: "profiles",
      kind: "upsert",
      row: { ...profileRow, updated_at: new Date().toISOString() },
    });
  }

  enqueue(userId, ops);
  await flushQueue(userId);
}

