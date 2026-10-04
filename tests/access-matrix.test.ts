import { describe, expect, test } from "bun:test";
import {
  applyStageAssignment,
  commitMemberChange,
  currentStageIds,
  memberEditState,
  projectPermissions,
} from "../src/lib/access";
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

import { commitMemberChange } from "../src/lib/access";

describe("server-first member change", () => {
  test("success returns next and sends role+stage_ids", async () => {
    const sent: unknown[] = [];
    const r = await commitMemberChange([1], [2], async () => {
      sent.push({ role: "r", stageIds: ["s1"] });
    });
    expect(r.value).toEqual([2]);
    expect(r.error).toBeNull();
    expect(sent).toEqual([{ role: "r", stageIds: ["s1"] }]);
  });
  test("server error rolls back to previous", async () => {
    const r = await commitMemberChange([1], [2], async () => {
      throw new Error("Manage access required");
    });
    expect(r.value).toEqual([1]);
    expect(r.error?.message).toBe("Manage access required");
  });
});

describe("member editing UI guard, prefill and rollback", () => {
  const stages = [
    { id: "s1", assigneeId: "m2" },
    { id: "s2", assigneeId: null },
    { id: "s3", assigneeId: "m2" },
  ] as never;
  const m = (over = {}) => ({ id: "m2", userId: "u2", status: "ACCEPTED", ...over });
  const ownerView = base({ members: [m()] as never });

  test("prefill equals current assignments exactly", () => {
    expect(currentStageIds(stages, "m2")).toEqual(["s1", "s3"]);
    expect(currentStageIds(stages, "nobody")).toEqual([]);
  });
  test("re-applying prefilled ids changes nothing (no accidental clearing)", () => {
    const ids = currentStageIds(stages, "m2");
    expect(applyStageAssignment(stages, "m2", ids)).toEqual(stages);
  });
  test("apply adds and removes only this member's stages", () => {
    const out = applyStageAssignment(stages, "m2", ["s2"]);
    expect(out.map((s: { assigneeId: string | null }) => s.assigneeId)).toEqual([null, "m2", null]);
  });
  test("owner may edit accepted real member", () => {
    expect(memberEditState(ownerView, m()).allowed).toBe(true);
  });
  test("accepted MANAGE may edit others but not self", () => {
    const p = base({
      readOnly: true,
      myMemberId: "m1",
      members: [{ id: "m1", access: "MANAGE" }, m()],
    } as never);
    expect(memberEditState(p, m()).allowed).toBe(true);
    const self = memberEditState(p, { id: "m1", userId: "u1", status: "ACCEPTED" });
    expect(self.allowed).toBe(false);
    expect(self.reason).toBeTruthy();
  });
  for (const a of ["VIEW", "EDIT"]) {
    test(`${a} viewer can never edit members`, () => {
      const r = memberEditState(shared(a), m());
      expect(r.allowed).toBe(false);
      expect(r.reason).toBeTruthy();
    });
  }
  for (const st of ["PENDING", "REJECTED"]) {
    test(`${st} member not editable`, () => {
      const r = memberEditState(ownerView, m({ status: st }));
      expect(r.allowed).toBe(false);
      expect(r.reason).toBeTruthy();
    });
  }
  test("member without account not editable", () => {
    expect(memberEditState(ownerView, m({ userId: null })).allowed).toBe(false);
  });
  test("server failure returns untouched list (rollback)", async () => {
    const prev = [{ id: "a" }];
    const r = await commitMemberChange(prev, [{ id: "b" }], async () => {
      throw new Error("denied");
    });
    expect(r.value).toBe(prev);
    expect(r.error?.message).toBe("denied");
  });
  test("role+stage_ids reach the server call and success returns next", async () => {
    const sent: unknown[] = [];
    const prev = [{ id: "a" }];
    const next = [{ id: "b" }];
    const r = await commitMemberChange(prev, next, async () => {
      sent.push({ role: "dev", stageIds: ["s1"] });
    });
    expect(sent).toEqual([{ role: "dev", stageIds: ["s1"] }]);
    expect(r.value).toBe(next);
    expect(r.error).toBeNull();
  });
});

import { prefillStageIds } from "../src/lib/access";

describe("owner row block and real stage_ids prefill", () => {
  const mm = (over = {}) => ({ id: "m2", userId: "u2", status: "ACCEPTED", ...over });
  test("owned project: row of projects.user_id is blocked", () => {
    const p = base({ ownerUserId: "owner1", members: [] } as never);
    const r = memberEditState(p, mm({ userId: "owner1" }), { currentUserId: "owner1" });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBeTruthy();
  });
  test("shared project: MANAGE cannot edit owner row (by projects.user_id)", () => {
    const p = base({
      readOnly: true,
      myMemberId: "m1",
      ownerUserId: "owner1",
      members: [{ id: "m1", access: "MANAGE" }],
    } as never);
    expect(memberEditState(p, mm({ id: "mo", userId: "owner1" }), { currentUserId: "u1" }).allowed).toBe(false);
    expect(memberEditState(p, mm(), { currentUserId: "u1" }).allowed).toBe(true);
  });
  test("self blocked by real user id even without myMemberId", () => {
    const p = base({ ownerUserId: "o" } as never);
    expect(memberEditState(p, mm({ userId: "me" }), { currentUserId: "me" }).allowed).toBe(false);
  });
  test("prefill uses project_members.stage_ids exactly (drops unknown ids)", () => {
    const st = [{ id: "s1", assigneeId: null }, { id: "s2", assigneeId: "m2" }] as never;
    expect(prefillStageIds(["s1", "ghost"], st, "m2")).toEqual(["s1"]);
    expect(prefillStageIds([], st, "m2")).toEqual([]);
    expect(prefillStageIds(undefined, st, "m2")).toEqual(["s2"]);
  });
});
