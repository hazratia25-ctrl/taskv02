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
    canEditProject: false,
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
    const rm = remote.members.find((x) => x.id === lm.id || (!!lm.userId && x.userId === lm.userId));
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
