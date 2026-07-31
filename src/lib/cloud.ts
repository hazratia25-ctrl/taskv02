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

/** Full write-through sync: upsert everything, remove rows deleted locally. */
export async function pushCloud(userId: string, data: AppData): Promise<void> {
  const tasks = data.tasks.map((t) => ({
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
  const projects = data.projects.map((p) => ({
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
  const categories = data.categories.map((c) => ({
    user_id: userId,
    id: c.id,
    name: c.name,
    color: c.color,
    created_at: c.createdAt,
  }));
  const tags = data.tags.map((t) => ({
    user_id: userId,
    id: t.id,
    name: t.name,
    created_at: t.createdAt,
  }));
  const notifications = data.notifications.slice(0, 200).map((n) => ({
    user_id: userId,
    id: n.id,
    task_id: n.taskId,
    type: n.type,
    title: n.title,
    message: n.message,
    is_read: n.isRead,
    created_at: n.createdAt,
  }));

  if (tasks.length) await supabase.from("tasks").upsert(tasks);
  if (projects.length) await supabase.from("projects").upsert(projects);
  if (categories.length) await supabase.from("categories").upsert(categories);
  if (tags.length) await supabase.from("tags").upsert(tags);
  if (notifications.length) await supabase.from("notifications").upsert(notifications);

  await Promise.all([
    deleteMissing("tasks", userId, data.tasks.map((t) => t.id)),
    deleteMissing("projects", userId, data.projects.map((p) => p.id)),
    deleteMissing("categories", userId, data.categories.map((c) => c.id)),
    deleteMissing("tags", userId, data.tags.map((t) => t.id)),
    deleteMissing("notifications", userId, notifications.map((n) => n.id)),
  ]);

  if (data.profile) {
    await supabase.from("profiles").upsert({
      id: userId,
      name: data.profile.name,
      role: data.profile.role ?? "",
      email: data.profile.email ?? "",
      avatar: data.profile.avatar,
      settings: data.settings as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  } else {
    await supabase
      .from("profiles")
      .update({ settings: data.settings as unknown as Json })
      .eq("id", userId);
  }
}

type SyncTable = "tasks" | "projects" | "categories" | "tags" | "notifications";

async function deleteMissing(table: SyncTable, userId: string, ids: string[]) {
  let q = supabase.from(table).delete().eq("user_id", userId);
  if (ids.length) {
    const list = ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",");
    q = q.not("id", "in", `(${list})`);
  }
  await q;
}
