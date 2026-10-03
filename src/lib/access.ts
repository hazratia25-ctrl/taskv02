import type { MemberAccess, Project, ProjectStage, TaskStatus } from "./types";

export interface ProjectPermissions {
  /** owner of the project (full control) */
  isOwner: boolean;
  access: MemberAccess;
  canEditProject: boolean;
  canDeleteProject: boolean;
  canManageMembers: boolean;
  canEditStages: boolean;
  /** only the assigned member (or the owner) may tick a stage */
  canToggleStage: (stage: ProjectStage) => boolean;
}

/** Per-project, per-role access matrix. Shared projects are read-only except for the caller's own stages. */
export function projectPermissions(project: Project): ProjectPermissions {
  if (!project.readOnly) {
    return {
      isOwner: true,
      access: "MANAGE",
      canEditProject: true,
      canDeleteProject: true,
      canManageMembers: true,
      canEditStages: true,
      canToggleStage: () => true,
    };
  }
  const me = (project.members ?? []).find((m) => m.id === project.myMemberId);
  const access: MemberAccess = me?.access ?? "VIEW";
  return {
    isOwner: false,
    access,
    canEditProject: access === "EDIT" || access === "MANAGE",
    canDeleteProject: false,
    canManageMembers: access === "MANAGE",
    canEditStages: false,
    canToggleStage: (stage) => !!project.myMemberId && stage.assigneeId === project.myMemberId,
  };
}

/**
 * Project status follows its stages:
 * every stage done → COMPLETED, some done → IN_PROGRESS, none done → TODO.
 */
export function deriveProjectStatus(stages: ProjectStage[], current: TaskStatus): TaskStatus {
  if (!stages.length) return current;
  const done = stages.filter((s) => s.done).length;
  if (done === stages.length) return "COMPLETED";
  if (done > 0) return "IN_PROGRESS";
  return current === "COMPLETED" ? "IN_PROGRESS" : current;
}

const stageTime = (s?: ProjectStage | null) => (s?.doneAt ? Date.parse(s.doneAt) : 0);

/**
 * Merges the server copy of an owned project into the local copy.
 * Stage ticks made by invited members (and member invite answers) are never lost,
 * and local edits to titles/assignees/dates are never overwritten.
 */
export function mergeOwnedProject(local: Project, remote: Project): Project {
  const stages = local.stages.map((ls) => {
    const rs = remote.stages.find((x) => x.id === ls.id);
    if (!rs) return ls;
    // the newer tick wins; a stage without a timestamp is treated as older
    if (rs.done !== ls.done && stageTime(rs) > stageTime(ls)) {
      return { ...ls, done: rs.done, doneAt: rs.doneAt ?? null };
    }
    return ls;
  });
  // stages added on another device of the same owner
  const extraStages = remote.stages.filter((rs) => !local.stages.some((ls) => ls.id === rs.id));

  const members = local.members.map((lm) => {
    const rm = remote.members.find(
      (x) => x.id === lm.id || (!!lm.userId && x.userId === lm.userId),
    );
    // invite answers (ACCEPTED/REJECTED) are written by the server, so they win
    return rm?.status && rm.status !== lm.status ? { ...lm, status: rm.status } : lm;
  });
  const extraMembers = remote.members.filter(
    (rm) => !!rm.userId && !local.members.some((lm) => lm.id === rm.id || lm.userId === rm.userId),
  );

  const nextStages = [...stages, ...extraStages];
  const status = deriveProjectStatus(nextStages, local.status);
  return {
    ...local,
    stages: nextStages,
    members: [...members, ...extraMembers],
    status,
    completedAt: status === "COMPLETED" ? (local.completedAt ?? new Date().toISOString()) : null,
  };
}

/** Keeps the newest tick when a shared project is refreshed while the member is offline-editing. */
export function mergeSharedStages(local: ProjectStage[], remote: ProjectStage[]): ProjectStage[] {
  return remote.map((rs) => {
    const ls = local.find((x) => x.id === rs.id);
    if (ls && ls.done !== rs.done && stageTime(ls) > stageTime(rs)) return { ...rs, ...ls };
    return rs;
  });
}

/** Fields a non-owner EDIT/MANAGE member may change; everything else is dropped before sending. */
export const SHARED_CONTENT_FIELDS = ["title", "description", "priority", "dueDate"] as const;

export function sharedContentPatch<T extends Record<string, unknown>>(patch: T) {
  const out: Record<string, unknown> = {};
  for (const k of SHARED_CONTENT_FIELDS) if (k in patch) out[k] = patch[k];
  return out as Partial<Pick<Project, (typeof SHARED_CONTENT_FIELDS)[number]>>;
}

/** Server-first member change: returns the next list only after `send` succeeds, else the untouched previous list. */
export async function commitMemberChange<T>(
  previous: T,
  next: T,
  send: () => Promise<unknown>,
): Promise<{ value: T; error: Error | null }> {
  try {
    await send();
    return { value: next, error: null };
  } catch (e) {
    return { value: previous, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** Stage ids currently assigned to a member (prefill source; unchanged save must never clear them). */
export function currentStageIds(stages: ProjectStage[], memberId: string): string[] {
  return stages.filter((s) => s.assigneeId === memberId).map((s) => s.id);
}

/** Whether the UI may enable member editing at all; server rules stay authoritative. */
export function memberEditState(
  project: Project,
  member: { id: string; userId?: string | null; status?: string; access?: MemberAccess },
): { allowed: boolean; reason: string | null } {
  const perms = projectPermissions(project);
  if (!perms.canManageMembers)
    return {
      allowed: false,
      reason: "فقط مالک یا عضو با دسترسی مدیریت می‌تواند اعضا را ویرایش کند.",
    };
  if (project.myMemberId && member.id === project.myMemberId)
    return { allowed: false, reason: "ویرایش ردیف خودتان مجاز نیست." };
  if (!member.userId) return { allowed: false, reason: "این عضو حساب کاربری ندارد." };
  if (member.status === "PENDING") return { allowed: false, reason: "دعوت هنوز پذیرفته نشده است." };
  if (member.status === "REJECTED") return { allowed: false, reason: "دعوت رد شده است." };
  return { allowed: true, reason: null };
}

/** Local stage assignment after the server confirmed it. */
export function applyStageAssignment(
  stages: ProjectStage[],
  memberId: string,
  stageIds: string[],
): ProjectStage[] {
  const set = new Set(stageIds);
  return stages.map((s) =>
    set.has(s.id)
      ? { ...s, assigneeId: memberId }
      : s.assigneeId === memberId
        ? { ...s, assigneeId: null }
        : s,
  );
}
