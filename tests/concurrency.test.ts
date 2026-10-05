import { describe, expect, test } from "bun:test";
import { isStaleError, runVersionedSave, STALE_MESSAGE } from "../src/lib/concurrency";

/** In-memory server mirroring the RPC rule: reject when expected !== current updated_at. */
function fakeServer(initial: { v: string; title: string }) {
  let row = { ...initial };
  let tick = 0;
  return {
    get: () => ({ ...row }),
    save: async (expected: string, title: string) => {
      if (row.v !== expected) throw new Error("STALE_UPDATE");
      row = { v: `v${++tick}`, title };
      return { ...row };
    },
  };
}

function harness(server: ReturnType<typeof fakeServer>) {
  let local = server.get();
  const msgs: string[] = [];
  const save = (title: string) => {
    const before = { ...local };
    return runVersionedSave({
      apply: () => (local = { ...local, title }),
      rollback: () => (local = before),
      call: () => server.save(before.v, title),
      confirm: (r) => (local = r),
      refetch: async () => (local = server.get()),
      notify: (m) => msgs.push(m),
    });
  };
  return { save, msgs, local: () => local };
}

describe("stage 4 concurrency", () => {
  test("detects stale errors", () => {
    expect(isStaleError(new Error("STALE_UPDATE"))).toBe(true);
    expect(isStaleError(new Error("other"))).toBe(false);
  });

  test("successful save adopts server version", async () => {
    const s = fakeServer({ v: "v0", title: "a" });
    const a = harness(s);
    await a.save("b");
    expect(a.local()).toEqual({ v: "v1", title: "b" });
    await a.save("c"); // chained save uses confirmed version
    expect(s.get().title).toBe("c");
  });

  test("stale update is rejected without overwrite, rolled back and refetched", async () => {
    const s = fakeServer({ v: "v0", title: "a" });
    const A = harness(s);
    const B = harness(s);
    await A.save("from-A");
    await expect(B.save("from-B")).rejects.toThrow("STALE_UPDATE");
    expect(s.get().title).toBe("from-A"); // no overwrite
    expect(B.local()).toEqual(s.get()); // refetched latest
    expect(B.msgs).toEqual([STALE_MESSAGE]);
  });

  test("two concurrent saves: exactly one wins", async () => {
    const s = fakeServer({ v: "v0", title: "a" });
    const A = harness(s);
    const B = harness(s);
    const r = await Promise.allSettled([A.save("A"), B.save("B")]);
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect(r.filter((x) => x.status === "rejected").length).toBe(1);
    expect(["A", "B"]).toContain(s.get().title);
    expect(s.get().v).toBe("v1");
  });

  test("non-stale failure rolls back with message and no refetch", async () => {
    let refetched = false;
    let local = "orig";
    const msgs: string[] = [];
    await expect(
      runVersionedSave({
        apply: () => (local = "new"),
        rollback: () => (local = "orig"),
        call: async () => {
          throw new Error("Edit access required");
        },
        confirm: () => {},
        refetch: async () => (refetched = true),
        notify: (m) => msgs.push(m),
      }),
    ).rejects.toThrow();
    expect(local).toBe("orig");
    expect(refetched).toBe(false);
    expect(msgs).toEqual(["Edit access required"]);
  });

  test("success is not reported before the server answers", async () => {
    let release!: () => void;
    let confirmed = false;
    const p = runVersionedSave({
      apply: () => {},
      rollback: () => {},
      call: () => new Promise<number>((r) => (release = () => r(1))),
      confirm: () => (confirmed = true),
      refetch: async () => {},
      notify: () => {},
    });
    await Promise.resolve();
    expect(confirmed).toBe(false);
    release();
    await p;
    expect(confirmed).toBe(true);
  });
});
