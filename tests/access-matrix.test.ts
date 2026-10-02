import { describe, expect, test } from "bun:test";
import { projectPermissions } from "../src/lib/access";
import type { Project } from "../src/lib/types";

const base = (over: Partial<Project>): Project =>
  ({
    id: "p",
    title: "t",
    members: [],
    stages: [
      { id: "s1", assigneeId: "m1" },
      { id: "s2", assigneeId: "m2" },
    ],
    ...over,
  }) as unknown as Project;
const shared = (access: string) =>
  base({ readOnly: true, myMemberId: "m1", members: [{ id: "m1", access }] } as never);

describe("access matrix (client)", () => {
  test("owner full control", () => {
    const p = projectPermissions(base({}));
    expect(p.isOwner && p.canDeleteProject && p.canManageMembers).toBe(true);
  });
  for (const a of ["VIEW", "EDIT", "MANAGE"]) {
    test(`${a} cannot delete project or edit stages structure`, () => {
      const p = projectPermissions(shared(a));
      expect(p.isOwner).toBe(false);
      expect(p.canDeleteProject).toBe(false);
      expect(p.canEditStages).toBe(false);
      expect(p.canManageMembers).toBe(a === "MANAGE");
    });
  }
  test("toggle only own assigned stage", () => {
    const p = projectPermissions(shared("EDIT"));
    expect(p.canToggleStage({ id: "s1", assigneeId: "m1" } as never)).toBe(true);
    expect(p.canToggleStage({ id: "s2", assigneeId: "m2" } as never)).toBe(false);
  });
  test("missing membership falls back to VIEW", () => {
    const p = projectPermissions(base({ readOnly: true, myMemberId: "x" } as never));
    expect(p.access).toBe("VIEW");
    expect(p.canManageMembers).toBe(false);
  });
});

import { sharedContentPatch } from "../src/lib/access";

describe("shared edit rights", () => {
  test("EDIT and MANAGE may edit content, VIEW may not", () => {
    expect(projectPermissions(shared("EDIT")).canEditProject).toBe(true);
    expect(projectPermissions(shared("MANAGE")).canEditProject).toBe(true);
    expect(projectPermissions(shared("VIEW")).canEditProject).toBe(false);
  });
  test("pending/rejected/non-member (no membership row) get VIEW only", () => {
    const p = projectPermissions(base({ readOnly: true, myMemberId: undefined } as never));
    expect(p.canEditProject || p.canManageMembers || p.canDeleteProject).toBe(false);
    expect(p.canToggleStage({ id: "s1", assigneeId: "m1" } as never)).toBe(false);
  });
  test("shared patch drops owner, members, stages and status (spoof attempt)", () => {
    const out = sharedContentPatch({
      title: "x",
      user_id: "attacker",
      members: [{ id: "m1", access: "MANAGE" }],
      stages: [],
      status: "COMPLETED",
      dueDate: null,
    });
    expect(Object.keys(out).sort()).toEqual(["dueDate", "title"]);
  });
});
