import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProjectMember, ProjectStage } from "./types";

export interface FoundUser {
  id: string;
  name: string;
  username: string | null;
  userCode: string;
  avatar: string | null;
  role: string;
  phone: string;
  extension: string;
  email: string;
}

export interface InviteInfo {
  id: string;
  projectId: string;
  projectTitle: string;
  ownerName: string;
  role: string;
  createdAt: string;
}

export interface ProjectWriteInput {
  id?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  categoryId: string | null;
  tagIds: string[];
  dueDate: string | null;
  members: unknown[];
  stages: unknown[];
  createdAt?: string;
}

/** Creates an owned project with ownership derived only from the verified session. */
export const createOwnedProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProjectWriteInput) => data)
  .handler(async ({ data, context }) => {
    const id = data.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({
        id,
        user_id: context.userId,
        title: String(data.title).slice(0, 300),
        description: String(data.description ?? ""),
        status: data.status,
        priority: data.priority,
        category_id: data.categoryId,
        tag_ids: data.tagIds ?? [],
        due_date: data.dueDate,
        members: data.members as never,
        stages: data.stages as never,
        created_at: data.createdAt ?? timestamp,
        updated_at: timestamp,
        completed_at: data.status === "COMPLETED" ? timestamp : null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Atomically saves an owned project without overwriting newer member stage ticks. */
export const saveOwnedProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId: string; patch: ProjectWriteInput }) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("save_owned_project_atomic", {
      _project_id: data.projectId,
      _patch: data.patch as never,
    });
    if (error) throw new Error(error.message);
    return row;
  });

const nid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

async function notify(
  userId: string,
  row: { taskId: string; type: string; title: string; message: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notifications").insert({
    id: nid(),
    user_id: userId,
    task_id: row.taskId,
    type: row.type,
    title: row.title,
    message: row.message,
    is_read: false,
  });
}

/** Find a signed-up user by user code, username, or exact email. */
export const searchAppUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { q: string }) => ({ q: String(data.q ?? "").slice(0, 120) }))
  .handler(async ({ data, context }): Promise<FoundUser[]> => {
    if (data.q.trim().length < 3) return [];
    const { data: rows, error } = await context.supabase.rpc("search_app_users", { _q: data.q });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name ?? "",
      username: r.username ?? null,
      userCode: r.user_code,
      avatar: r.avatar ?? null,
      role: r.role ?? "",
      phone: r.phone ?? "",
      extension: r.extension ?? "",
      email: r.email ?? "",
    }));
  });

/** Owner invites a real account to a project (pending until accepted). */
export const inviteProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId: string; memberUserId: string; role: string }) => ({
    projectId: String(data.projectId),
    memberUserId: String(data.memberUserId),
    role: String(data.role ?? "").slice(0, 80),
  }))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    if (data.memberUserId === userId) throw new Error("نمی‌توانید خودتان را دعوت کنید.");

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, title, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project || project.user_id !== userId) throw new Error("این پروژه از شما نیست.");

    const { error } = await supabase.from("project_members").upsert(
      {
        project_id: data.projectId,
        owner_id: userId,
        member_user_id: data.memberUserId,
        role: data.role,
        access: "VIEW",
        status: "PENDING",
      },
      { onConflict: "project_id,member_user_id" },
    );
    if (error) throw new Error(error.message);

    const { data: me } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
    const inviter = me?.name || "یکی از همکاران";

    await notify(data.memberUserId, {
      taskId: data.projectId,
      type: "INVITE",
      title: "دعوت به پروژه",
      message: `${inviter} شما را به پروژه «${project.title}» دعوت کرد.`,
    });
    const { sendPushToUser } = await import("./push-server");
    await sendPushToUser(data.memberUserId, {
      title: "دعوت به پروژه",
      body: `${inviter}: «${project.title}»`,
      url: "/notifications",
      tag: `invite-${data.projectId}`,
    });

    return { ok: true };
  });

/** Invites waiting for the signed-in user's answer. */
export const listMyInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InviteInfo[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_members")
      .select("id, project_id, owner_id, role, created_at")
      .eq("member_user_id", context.userId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rows?.length) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: projects }, { data: owners }] = await Promise.all([
      supabaseAdmin
        .from("projects")
        .select("id, title")
        .in("id", rows.map((r) => r.project_id)),
      supabaseAdmin
        .from("profiles")
        .select("id, name")
        .in("id", rows.map((r) => r.owner_id)),
    ]);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectTitle: projects?.find((p) => p.id === r.project_id)?.title ?? "پروژه",
      ownerName: owners?.find((o) => o.id === r.owner_id)?.name ?? "همکار",
      role: r.role ?? "",
      createdAt: r.created_at,
    }));
  });

/** Member accepts or rejects an invite; the owner gets notified. */
export const respondProjectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { membershipId: string; accept: boolean }) => ({
    membershipId: String(data.membershipId),
    accept: Boolean(data.accept),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("project_members")
      .update({ status: data.accept ? "ACCEPTED" : "REJECTED" })
      .eq("id", data.membershipId)
      .eq("member_user_id", userId)
      .select("project_id, owner_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("این دعوت یافت نشد.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: project }, { data: me }] = await Promise.all([
      supabaseAdmin.from("projects").select("title, members").eq("id", row.project_id).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("name, user_code, avatar, username")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    const memberName = me?.name || me?.user_code || "عضو";
    const title = project?.title ?? "پروژه";

    // keep the owner's embedded member list in sync with the accepted/rejected state
    if (project) {
      const members = ((project.members as unknown as ProjectMember[] | null) ?? []).map((m) =>
        m.userId === userId
          ? { ...m, status: data.accept ? ("ACCEPTED" as const) : ("REJECTED" as const) }
          : m,
      );
      await supabaseAdmin
        .from("projects")
        .update({ members: members as unknown as never, updated_at: new Date().toISOString() })
        .eq("id", row.project_id);
    }

    await notify(row.owner_id, {
      taskId: row.project_id,
      type: data.accept ? "MEMBER_ACCEPTED" : "MEMBER_REJECTED",
      title: data.accept ? "پذیرش دعوت" : "رد دعوت",
      message: data.accept
        ? `${memberName} دعوت پروژه «${title}» را پذیرفت.`
        : `${memberName} دعوت پروژه «${title}» را رد کرد.`,
    });
    const { sendPushToUser } = await import("./push-server");
    await sendPushToUser(row.owner_id, {
      title: data.accept ? "پذیرش دعوت" : "رد دعوت",
      body: `${memberName} — «${title}»`,
      url: "/notifications",
      tag: `invite-reply-${row.project_id}`,
    });

    return { ok: true, accepted: data.accept };
  });

/** Owner revokes a member's access. */
export const removeProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId: string; memberUserId: string }) => ({
    projectId: String(data.projectId),
    memberUserId: String(data.memberUserId),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_members")
      .delete()
      .eq("project_id", data.projectId)
      .eq("member_user_id", data.memberUserId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Member ticks only the stage assigned to them; everything else stays read-only. */
export const toggleAssignedStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId: string; stageId: string }) => ({
    projectId: String(data.projectId),
    stageId: String(data.stageId),
  }))
  .handler(async ({ data, context }) => {
    const { data: membership } = await context.supabase
      .from("project_members")
      .select("owner_id")
      .eq("project_id", data.projectId)
      .eq("member_user_id", context.userId)
      .eq("status", "ACCEPTED")
      .maybeSingle();
    const { data: before } = await context.supabase
      .from("projects")
      .select("title, members, stages")
      .eq("id", data.projectId)
      .maybeSingle();
    const oldStages = (before?.stages as unknown as ProjectStage[] | null) ?? [];
    const stage = oldStages.find((item) => item.id === data.stageId);
    const { data: project, error } = await context.supabase.rpc("toggle_assigned_stage_atomic", {
      _project_id: data.projectId,
      _stage_id: data.stageId,
    });
    if (error) throw new Error(error.message);
    if (!project) throw new Error("پروژه یافت نشد.");

    const members = (project.members as unknown as ProjectMember[] | null) ?? [];
    const myName = members.find((m) => m.userId === context.userId)?.name ?? "عضو تیم";
    if (membership && stage) await notify(membership.owner_id, {
      taskId: data.projectId,
      type: "STAGE_DONE",
      title: !stage.done ? "مرحله انجام شد" : "مرحله بازگشت به انجام‌نشده",
      message: `${myName}: مرحله «${stage.title}» در پروژه «${project.title}» ${
        !stage.done ? "انجام شد" : "به حالت انجام‌نشده برگشت"
      }.`,
    });

    return project;
  });

/** Owner tells stage assignees that their stage changed (in-app + push). */
export const notifyStageChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { projectId: string; items: { memberUserId: string; title: string; message: string }[] }) => ({
      projectId: String(data.projectId),
      items: (data.items ?? []).slice(0, 30).map((i) => ({
        memberUserId: String(i.memberUserId),
        title: String(i.title).slice(0, 120),
        message: String(i.message).slice(0, 400),
      })),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.items.length) return { ok: true, sent: 0 };

    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId) throw new Error("این پروژه از شما نیست.");

    const { data: allowed } = await supabase
      .from("project_members")
      .select("member_user_id")
      .eq("project_id", data.projectId)
      .eq("owner_id", userId);
    const allowedIds = new Set((allowed ?? []).map((m) => m.member_user_id));

    const { sendPushToUser } = await import("./push-server");
    let sent = 0;
    for (const item of data.items) {
      if (!allowedIds.has(item.memberUserId)) continue;
      await notify(item.memberUserId, {
        taskId: data.projectId,
        type: "STAGE_UPDATED",
        title: item.title,
        message: item.message,
      });
      await sendPushToUser(item.memberUserId, {
        title: item.title,
        body: item.message,
        url: "/notifications",
        tag: `stage-${data.projectId}`,
      });
      sent += 1;
    }
    return { ok: true, sent };
  });
