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
