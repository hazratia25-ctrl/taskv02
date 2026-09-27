import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  COLLAB_TABLES,
  MAX_RECONNECT_ATTEMPTS,
  POLL_DOWN_MS,
  POLL_LIVE_MS,
  REFRESH_DEBOUNCE_MS,
  backoffDelay,
  createPendingCounter,
  createSingleFlight,
  mergeCollabSnapshot,
  startCollabRealtime,
  type LifecycleEnv,
} from "../src/lib/realtime-sync";
import type { Project } from "../src/lib/types";

// ---------- deterministic fakes (no network, no real timers) ----------
class FakeClock {
  t = 0;
  id = 0;
  timers = new Map<number, { at: number; fn: () => void }>();
  set = (fn: () => void, ms: number) => {
    const id = ++this.id;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  };
  clear = (id: number) => void this.timers.delete(id);
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

class FakeChannel {
  tables: string[] = [];
  cb: ((s: string) => void) | null = null;
  removed = false;
  constructor(public name: string) {}
  on(_t: string, f: { table: string }, _cb: () => void) {
    this.tables.push(f.table);
    return this;
  }
  subscribe(cb: (s: string) => void) {
    this.cb = cb;
    return this;
  }
  emit(s: string) {
    this.cb?.(s);
  }
}
class FakeClient {
  channels: FakeChannel[] = [];
  channel(name: string) {
    const c = new FakeChannel(name);
    this.channels.push(c);
    return c;
  }
  removeChannel(c: FakeChannel) {
    c.removed = true;
  }
  active() {
    return this.channels.filter((c) => !c.removed);
  }
  last() {
    return this.channels[this.channels.length - 1];
  }
}

let clock: FakeClock;
let client: FakeClient;
let refreshes: number;
let visible: boolean;
let online: boolean;
let docL: Set<() => void>;
let winL: Set<() => void>;
let env: LifecycleEnv;
const disposers: Array<() => void> = [];

beforeEach(() => {
  clock = new FakeClock();
  client = new FakeClient();
  refreshes = 0;
  visible = true;
  online = true;
  docL = new Set();
  winL = new Set();
  env = {
    setTimeout: clock.set,
    clearTimeout: clock.clear,
    isVisible: () => visible,
    isOnline: () => online,
    addDocListener: (_e, f) => void docL.add(f),
    removeDocListener: (_e, f) => void docL.delete(f),
    addWinListener: (_e, f) => void winL.add(f),
    removeWinListener: (_e, f) => void winL.delete(f),
    random: () => 0,
    now: () => clock.t,
  };
});
afterEach(() => {
  while (disposers.length) disposers.pop()!();
  expect(docL.size).toBe(0);
  expect(winL.size).toBe(0);
  expect(clock.timers.size).toBe(0);
  expect(client.active().length).toBe(0);
});

function start(userId = "u1") {
  const rt = startCollabRealtime(client as never, userId, () => refreshes++, env);
  let done = false;
  const dispose = () => {
    if (!done) rt.dispose();
    done = true;
  };
  disposers.push(dispose);
  return { ...rt, dispose };
}

// ---------- lifecycle ----------
describe("channel lifecycle", () => {
  test("one channel per session, only projects/project_members", () => {
    start();
    expect(client.active().length).toBe(1);
    expect(client.last().tables).toEqual(["projects", "project_members"]);
    expect(client.last().tables).not.toContain("tasks");
    expect(COLLAB_TABLES as readonly string[]).not.toContain("tasks");
  });

  test("unmount/logout removes channel, timers and listeners", () => {
    const rt = start();
    client.last().emit("SUBSCRIBED");
    rt.dispose();
    expect(client.active().length).toBe(0);
    expect(clock.timers.size).toBe(0);
    expect(docL.size + winL.size).toBe(0);
    // late status callback after dispose is ignored
    client.channels[0].emit("CHANNEL_ERROR");
    expect(clock.timers.size).toBe(0);
  });

  test("account switch: old session disposed before new one, exactly one channel", () => {
    const a = start("u1");
    a.dispose();
    start("u2");
    expect(client.active().length).toBe(1);
    expect(client.last().name.startsWith("collab:u2:")).toBe(true);
    expect(docL.size).toBe(1);
    expect(winL.size).toBe(1);
  });
});

describe("statuses and backoff", () => {
  test("SUBSCRIBED -> live, debounced refresh, slow poll", () => {
    const rt = start();
    client.last().emit("SUBSCRIBED");
    expect(rt.state().live).toBe(true);
    clock.advance(REFRESH_DEBOUNCE_MS);
    expect(refreshes).toBe(1);
    clock.advance(POLL_LIVE_MS);
    expect(refreshes).toBe(2);
  });

  for (const s of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) {
    test(`${s} -> reconnect with backoff and fast poll`, () => {
      const rt = start();
      client.last().emit(s);
      expect(rt.state().live).toBe(false);
      expect(client.channels.length).toBe(1);
      clock.advance(999);
      expect(client.channels.length).toBe(1);
      clock.advance(1);
      expect(client.channels.length).toBe(2);
      expect(client.channels[0].removed).toBe(true);
      expect(client.active().length).toBe(1);
    });
  }

  test("backoff grows exponentially, capped at 30s", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a, 0))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(backoffDelay(0, 1)).toBe(1500);
  });

  test("gives up after 8 attempts but keeps fallback polling", () => {
    const rt = start();
    for (let i = 0; i < 20; i++) {
      client.last().emit("CHANNEL_ERROR");
      clock.advance(31_000);
    }
    expect(client.channels.length).toBe(1 + MAX_RECONNECT_ATTEMPTS);
    expect(rt.state().attempt).toBe(MAX_RECONNECT_ATTEMPTS);
    const before = refreshes;
    clock.advance(POLL_DOWN_MS);
    expect(refreshes).toBe(before + 1);
  });

  test("duplicate errors do not stack retry timers", () => {
    start();
    const ch = client.last();
    ch.emit("CHANNEL_ERROR");
    ch.emit("TIMED_OUT");
    ch.emit("CLOSED");
    clock.advance(1000);
    expect(client.channels.length).toBe(2);
  });

  test("stale channel status is ignored", () => {
    const rt = start();
    const first = client.last();
    first.emit("CHANNEL_ERROR");
    clock.advance(1000);
    first.emit("SUBSCRIBED");
    expect(rt.state().live).toBe(false);
  });

  test("retry skipped while offline", () => {
    start();
    online = false;
    client.last().emit("CHANNEL_ERROR");
    clock.advance(1000);
    expect(client.channels.length).toBe(1);
  });
});

describe("online / visibility reset", () => {
  test("online resets attempts and reconnects immediately", () => {
    const rt = start();
    for (let i = 0; i < 10; i++) {
      client.last().emit("CHANNEL_ERROR");
      clock.advance(31_000);
    }
    expect(rt.state().attempt).toBe(MAX_RECONNECT_ATTEMPTS);
    const n = client.channels.length;
    for (const f of winL) f();
    expect(rt.state().attempt).toBe(0);
    expect(client.channels.length).toBe(n + 1);
    expect(client.active().length).toBe(1);
    clock.advance(REFRESH_DEBOUNCE_MS);
    expect(refreshes).toBeGreaterThan(0);
  });

  test("visibility reconnects when down, only refreshes when live", () => {
    start();
    client.last().emit("SUBSCRIBED");
    for (const f of docL) f();
    expect(client.channels.length).toBe(1);
    for (let i = 0; i < 9; i++) {
      client.last().emit("CLOSED");
      clock.advance(31_000);
    }
    const n = client.channels.length;
    for (const f of docL) f();
    expect(client.channels.length).toBe(n + 1);
  });

  test("hidden tab: visibility no-op, poll skips refresh", () => {
    start();
    visible = false;
    for (const f of docL) f();
    clock.advance(POLL_DOWN_MS);
    expect(refreshes).toBe(0);
  });

  test("burst of events debounced into one refresh", () => {
    start();
    client.last().emit("SUBSCRIBED");
    for (const f of winL) f();
    for (const f of docL) f();
    clock.advance(REFRESH_DEBOUNCE_MS);
    expect(refreshes).toBe(1);
  });
});

// ---------- single flight + generation ----------
describe("single-flight refresh", () => {
  test("concurrent triggers dedupe into one running + one queued", async () => {
    const resolvers: Array<() => void> = [];
    let runs = 0;
    const sf = createSingleFlight(() => {
      runs++;
      return new Promise<void>((r) => resolvers.push(r));
    });
    const p = sf.trigger();
    sf.trigger();
    sf.trigger();
    sf.trigger();
    expect(runs).toBe(1);
    resolvers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(2);
    resolvers.shift()!();
    await p;
    expect(runs).toBe(2);
  });

  test("errors are swallowed and loop releases", async () => {
    let runs = 0;
    const sf = createSingleFlight(async () => {
      runs++;
      throw new Error("offline");
    });
    await sf.trigger();
    await sf.trigger();
    expect(runs).toBe(2);
  });

  test("invalidate marks in-flight response stale", async () => {
    let release!: () => void;
    let applied: boolean | null = null;
    const sf = createSingleFlight(async (isCurrent) => {
      await new Promise<void>((r) => (release = r));
      applied = isCurrent();
    });
    const p = sf.trigger();
    sf.invalidate();
    release();
    await p;
    expect(applied).toBe(false);
  });
});

// ---------- pending + merge ----------
const mk = (id: string, updatedAt: string, extra: Partial<Project> = {}): Project => ({
  id,
  title: id,
  description: "",
  status: "TODO",
  priority: "MEDIUM",
  categoryId: null,
  tagIds: [],
  dueDate: null,
  members: [],
  stages: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt,
  completedAt: null,
  ...extra,
});

describe("pending counter (overlapping saves)", () => {
  test("stays pending until the last overlapping save settles", () => {
    const pc = createPendingCounter();
    const a = pc.begin("p");
    const b = pc.begin("p");
    a();
    expect(pc.has("p")).toBe(true);
    a(); // idempotent settle
    expect(pc.has("p")).toBe(true);
    b();
    expect(pc.has("p")).toBe(false);
  });
});

describe("mergeCollabSnapshot", () => {
  const T1 = "2026-01-01T00:00:01Z";
  const T2 = "2026-01-01T00:00:02Z";

  test("newer remote wins by updated_at", () => {
    const out = mergeCollabSnapshot(
      [mk("a", T1)],
      [mk("a", T2, { title: "srv" })],
      [],
      () => false,
    );
    expect(out[0].title).toBe("srv");
  });

  test("older remote does not overwrite newer local", () => {
    const out = mergeCollabSnapshot(
      [mk("a", T2, { title: "local" })],
      [mk("a", T1, { title: "old" })],
      [],
      () => false,
    );
    expect(out[0].title).toBe("local");
  });

  test("pending save is never overwritten by snapshot", () => {
    const out = mergeCollabSnapshot(
      [mk("a", T1, { title: "editing" })],
      [mk("a", T2, { title: "srv" })],
      [],
      (id) => id === "a",
    );
    expect(out[0].title).toBe("editing");
  });

  test("remote delete drops project when nothing pending", () => {
    expect(mergeCollabSnapshot([mk("a", T1)], [], [], () => false)).toEqual([]);
  });

  test("pending create survives snapshot that lacks it", () => {
    expect(mergeCollabSnapshot([mk("a", T1)], [], [], () => true).map((p) => p.id)).toEqual(["a"]);
  });

  test("new remote owned + shared projects are added; revoked shared removed", () => {
    const local = [mk("gone", T1, { readOnly: true })];
    const out = mergeCollabSnapshot(
      local,
      [mk("o", T1)],
      [mk("s", T1, { readOnly: true })],
      () => false,
    );
    expect(out.map((p) => p.id)).toEqual(["o", "s"]);
  });

  test("shared: newer local tick kept when remote is older", () => {
    const st = (done: boolean, doneAt: string) => [
      { id: "st", title: "x", done, dueDate: null, doneAt },
    ];
    const local = [mk("s", T2, { readOnly: true, stages: st(true, T2) })];
    const remote = [mk("s", T1, { readOnly: true, stages: st(false, T1) })];
    expect(mergeCollabSnapshot(local, [], remote, () => false)[0].stages[0].done).toBe(true);
  });
});

// ---------- static proof: tasks never subscribed to realtime ----------
describe("tasks stay private", () => {
  test("no realtime subscription on tasks anywhere in src", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    walk(join(import.meta.dir, "../src"));
    const channelFiles = files.filter((f) => /postgres_changes/.test(readFileSync(f, "utf8")));
    expect(channelFiles.map((f) => f.replace(/.*src\//, "src/"))).toEqual([
      "src/lib/realtime-sync.ts",
    ]);
    for (const f of files) {
      expect(readFileSync(f, "utf8")).not.toMatch(/table:\s*["']tasks["']/);
    }
  });
});
