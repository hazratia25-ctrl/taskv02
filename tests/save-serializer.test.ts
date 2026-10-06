import { describe, expect, test } from "bun:test";
import { createSaveSerializer, CANCELLED_MESSAGE, STALE_MESSAGE } from "../src/lib/concurrency";

type Row = { id: string; title: string; updatedAt: string };

function server(initial: Row) {
  let row = { ...initial };
  let tick = 0;
  const calls: string[] = [];
  return {
    get: () => ({ ...row }),
    externalEdit: (title: string) => (row = { ...row, title, updatedAt: `ext${++tick}` }),
    save: async (expected: string, title: string, delay = 0) => {
      calls.push(`${expected}->${title}`);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (row.updatedAt !== expected) throw new Error("STALE_UPDATE");
      row = { ...row, title, updatedAt: `v${++tick}` };
      return { ...row };
    },
    calls,
  };
}

function client(srv: ReturnType<typeof server>) {
  const ser = createSaveSerializer<Row>();
  let local = srv.get();
  const msgs: string[] = [];
  const edit = (title: string, delay = 0) => {
    const before = local;
    local = { ...local, title, updatedAt: "local" }; // optimistic
    return ser.run(local.id, {
      base: before,
      call: (exp) => srv.save(exp, title, delay),
      confirm: (r, isLatest) => {
        if (isLatest) local = r;
      },
      rollback: (c) => (local = c),
      refetch: async () => (local = srv.get()),
      notify: (m) => msgs.push(m),
    });
  };
  return { edit, msgs, local: () => local, ser };
}

describe("per-entity save serialization", () => {
  test("overlapping saves run in order, each with the version confirmed before it", async () => {
    const srv = server({ id: "t", title: "a", updatedAt: "v0" });
    const c = client(srv);
    const p1 = c.edit("b", 5);
    const p2 = c.edit("c");
    expect(c.local().title).toBe("c"); // newest intent stays on screen while in flight
    await Promise.all([p1, p2]);
    expect(srv.calls).toEqual(["v0->b", "v1->c"]);
    expect(srv.get().title).toBe("c");
    expect(c.local()).toEqual(srv.get());
    expect(c.ser.pending("t")).toBe(false);
  });

  test("first confirmation does not wipe a newer queued local intent", async () => {
    const srv = server({ id: "t", title: "a", updatedAt: "v0" });
    const c = client(srv);
    let seenAfterFirst = "";
    const p1 = c.edit("b", 5).then(() => (seenAfterFirst = c.local().title));
    const p2 = c.edit("c", 5);
    await p1;
    expect(seenAfterFirst).toBe("c");
    await p2;
  });

  test("external change: stale rejected, no overwrite, rollback+refetch, queued intent cancelled", async () => {
    const srv = server({ id: "t", title: "a", updatedAt: "v0" });
    const c = client(srv);
    srv.externalEdit("other-client");
    const r = await Promise.allSettled([c.edit("mine", 2), c.edit("mine2")]);
    expect(r[0].status).toBe("rejected");
    expect((r[1] as PromiseRejectedResult).reason.message).toBe(CANCELLED_MESSAGE);
    expect(srv.get().title).toBe("other-client");
    expect(srv.calls.length).toBe(1); // cancelled intent never reached the server
    expect(c.local()).toEqual(srv.get());
    expect(c.msgs).toEqual([STALE_MESSAGE]);
  });

  test("two clients race: exactly one wins, loser refetches the winner", async () => {
    const srv = server({ id: "t", title: "a", updatedAt: "v0" });
    const A = client(srv);
    const B = client(srv);
    const r = await Promise.allSettled([A.edit("A"), B.edit("B")]);
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(1);
    const loser = r[0].status === "rejected" ? A : B;
    expect(loser.local()).toEqual(srv.get());
    expect(loser.msgs).toEqual([STALE_MESSAGE]);
  });

  test("after a failure the next save starts fresh from server state", async () => {
    const srv = server({ id: "t", title: "a", updatedAt: "v0" });
    const c = client(srv);
    srv.externalEdit("x");
    await c.edit("lost").catch(() => {});
    await c.edit("retry");
    expect(srv.get().title).toBe("retry");
  });

  test("deferred state updater: values computed before setState still reach the server", async () => {
    // models React deferring the updater: the write must not depend on it running
    const srv = server({ id: "t", title: "a", updatedAt: "v0" });
    const ser = createSaveSerializer<Row>();
    const deferred: Array<() => void> = [];
    const base = srv.get();
    const next = { ...base, title: "z" }; // computed eagerly, not inside the updater
    deferred.push(() => {}); // updater queued but not yet run
    await ser.run("t", {
      base,
      call: (e) => srv.save(e, next.title),
      confirm: () => {},
      rollback: () => {},
      refetch: async () => {},
      notify: () => {},
    });
    expect(deferred.length).toBe(1);
    expect(srv.get().title).toBe("z");
  });
});
