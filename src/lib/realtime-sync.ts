// Pure, dependency-injected realtime/sync logic used by store.tsx (unit-tested in isolation).
import type { Project } from "./types";
import { mergeOwnedProject, mergeSharedStages } from "./access";

/** Tables in the shared realtime subscription. Private `tasks` must never appear here. */
export const COLLAB_TABLES = ["projects", "project_members"] as const;
export const MAX_RECONNECT_ATTEMPTS = 8;
export const REFRESH_DEBOUNCE_MS = 120;
export const POLL_LIVE_MS = 5 * 60_000;
export const POLL_DOWN_MS = 20_000;

export function backoffDelay(attempt: number, jitter: number) {
  return Math.min(30_000, 1000 * 2 ** attempt) + jitter * 500;
}

/** Counted in-flight writes per id, so overlapping saves keep an id pending until the last settles. */
export function createPendingCounter() {
  const map = new Map<string, number>();
  return {
    begin(id: string) {
      map.set(id, (map.get(id) ?? 0) + 1);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const n = (map.get(id) ?? 1) - 1;
        if (n <= 0) map.delete(id);
        else map.set(id, n);
      };
    },
    has: (id: string) => map.has(id),
    size: () => map.size,
  };
}

/**
 * Single-flight refresh: at most one run in flight and at most one queued rerun.
 * `generation` lets callers invalidate a response that started before a write.
 */
export function createSingleFlight(run: (isCurrent: () => boolean) => Promise<void>) {
  let inflight: Promise<void> | null = null;
  let rerun = false;
  let gen = 0;
  const trigger = (): Promise<void> => {
    if (inflight) {
      rerun = true;
      return inflight;
    }
    const loop = (async () => {
      try {
        do {
          rerun = false;
          const mine = ++gen;
          await run(() => mine === gen).catch(() => {
            /* offline: keep current state */
          });
        } while (rerun);
      } finally {
        inflight = null;
      }
    })();
    inflight = loop;
    return loop;
  };
  return {
    trigger,
    /** marks every response already in flight as stale */
    invalidate: () => {
      gen += 1;
    },
  };
}

/** Merges a server snapshot into local projects without dropping/overwriting pending writes. */
export function mergeCollabSnapshot(
  local: Project[],
  owned: Project[],
  shared: Project[],
  isPending: (id: string) => boolean,
): Project[] {
  const ownedLocal = local.filter((p) => !p.readOnly);
  const ownedNext: Project[] = [];
  for (const p of ownedLocal) {
    const remote = owned.find((o) => o.id === p.id);
    if (!remote) {
      if (isPending(p.id)) ownedNext.push(p); // create still in flight; otherwise remote delete
      continue;
    }
    if (isPending(p.id)) ownedNext.push(mergeOwnedProject(p, remote));
    else ownedNext.push(remote.updatedAt >= p.updatedAt ? remote : mergeOwnedProject(p, remote));
  }
  for (const o of owned) if (!ownedLocal.some((p) => p.id === o.id)) ownedNext.push(o);
  const sharedNext = shared.map((s) => {
    const l = local.find((p) => p.id === s.id);
    if (!l || s.updatedAt >= l.updatedAt) return s;
    return { ...s, stages: mergeSharedStages(l.stages, s.stages) };
  });
  return [...ownedNext, ...sharedNext];
}

export type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" | string;

export interface RealtimeChannelLike {
  on(type: string, filter: { event: string; schema: string; table: string }, cb: () => void): this;
  subscribe(cb: (status: ChannelStatus) => void): unknown;
}
export interface RealtimeClientLike<C extends RealtimeChannelLike = RealtimeChannelLike> {
  channel(name: string): C;
  removeChannel(ch: C): unknown;
}
export interface LifecycleEnv {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  isVisible: () => boolean;
  isOnline: () => boolean;
  addDocListener: (ev: "visibilitychange", fn: () => void) => void;
  removeDocListener: (ev: "visibilitychange", fn: () => void) => void;
  addWinListener: (ev: "online", fn: () => void) => void;
  removeWinListener: (ev: "online", fn: () => void) => void;
  random: () => number;
  now: () => number;
}

/** One realtime channel per session with bounded reconnect backoff and fallback polling. Returns dispose. */
export function startCollabRealtime(
  client: RealtimeClientLike,
  userId: string,
  refresh: () => void,
  env: LifecycleEnv,
) {
  let disposed = false;
  let channel: RealtimeChannelLike | null = null;
  let debounce: number | undefined;
  let retryTimer: number | undefined;
  let pollTimer: number | undefined;
  let attempt = 0;
  let live = false;

  const requestRefresh = () => {
    if (debounce !== undefined) env.clearTimeout(debounce);
    debounce = env.setTimeout(() => {
      debounce = undefined;
      if (!disposed) refresh();
    }, REFRESH_DEBOUNCE_MS);
  };
  const schedulePoll = () => {
    if (pollTimer !== undefined) env.clearTimeout(pollTimer);
    pollTimer = env.setTimeout(
      () => {
        if (disposed) return;
        if (env.isVisible()) refresh();
        schedulePoll();
      },
      live ? POLL_LIVE_MS : POLL_DOWN_MS,
    );
  };
  const connect = () => {
    if (disposed) return;
    if (channel) void client.removeChannel(channel);
    let ch = client.channel(`collab:${userId}:${env.now()}`);
    for (const table of COLLAB_TABLES)
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, requestRefresh);
    channel = ch;
    ch.subscribe((status) => {
      if (disposed || channel !== ch) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        live = true;
        schedulePoll();
        requestRefresh();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        live = false;
        schedulePoll();
        if (retryTimer !== undefined || attempt >= MAX_RECONNECT_ATTEMPTS) return;
        const delay = backoffDelay(attempt, env.random());
        attempt += 1;
        retryTimer = env.setTimeout(() => {
          retryTimer = undefined;
          if (env.isOnline()) connect();
        }, delay);
      }
    });
  };
  const onVisible = () => {
    if (!env.isVisible()) return;
    requestRefresh();
    if (!live && retryTimer === undefined) {
      attempt = 0;
      connect();
    }
  };
  const onOnline = () => {
    attempt = 0;
    requestRefresh();
    if (!live) {
      if (retryTimer !== undefined) env.clearTimeout(retryTimer);
      retryTimer = undefined;
      connect();
    }
  };

  connect();
  schedulePoll();
  env.addDocListener("visibilitychange", onVisible);
  env.addWinListener("online", onOnline);

  return {
    dispose() {
      disposed = true;
      for (const t of [debounce, retryTimer, pollTimer]) if (t !== undefined) env.clearTimeout(t);
      debounce = retryTimer = pollTimer = undefined;
      env.removeDocListener("visibilitychange", onVisible);
      env.removeWinListener("online", onOnline);
      if (channel) void client.removeChannel(channel);
      channel = null;
    },
    /** test/debug introspection */
    state: () => ({ attempt, live, hasChannel: channel !== null }),
  };
}

export function browserLifecycleEnv(): LifecycleEnv {
  return {
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    isVisible: () => document.visibilityState === "visible",
    isOnline: () => navigator.onLine !== false,
    addDocListener: (e, f) => document.addEventListener(e, f),
    removeDocListener: (e, f) => document.removeEventListener(e, f),
    addWinListener: (e, f) => window.addEventListener(e, f),
    removeWinListener: (e, f) => window.removeEventListener(e, f),
    random: Math.random,
    now: Date.now,
  };
}
