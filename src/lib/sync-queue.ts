import { supabase } from "@/integrations/supabase/client";

export type SyncTable = "tasks" | "projects" | "categories" | "tags" | "notifications" | "profiles";

export type SyncOp =
  | { key: string; table: SyncTable; kind: "upsert"; row: Record<string, unknown> }
  | { key: string; table: SyncTable; kind: "delete"; rowId: string };

const QUEUE_PREFIX = "task-manager-sync-queue";
/** how many rows go out per network round-trip (gradual sending) */
const CHUNK = 25;

const queueKey = (userId: string) => `${QUEUE_PREFIX}::${userId}`;

const queues = new Map<string, SyncOp[]>();
const flushing = new Set<string>();
const timers = new Map<string, number>();
let onlineHooked = false;

function read(userId: string): SyncOp[] {
  const cached = queues.get(userId);
  if (cached) return cached;
  let ops: SyncOp[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(queueKey(userId));
      if (raw) ops = JSON.parse(raw) as SyncOp[];
    } catch {
      ops = [];
    }
  }
  queues.set(userId, ops);
  return ops;
}

function persist(userId: string, ops: SyncOp[]) {
  queues.set(userId, ops);
  if (typeof window === "undefined") return;
  try {
    if (ops.length) window.localStorage.setItem(queueKey(userId), JSON.stringify(ops));
    else window.localStorage.removeItem(queueKey(userId));
  } catch {
    /* quota errors ignored */
  }
}

export function pendingCount(userId: string) {
  return read(userId).length;
}

/** Queue offline-safe operations; the last op for a row always wins. */
export function enqueue(userId: string, ops: SyncOp[]) {
  if (!ops.length) return;
  const current = read(userId).filter((op) => !ops.some((n) => n.key === op.key));
  persist(userId, [...current, ...ops]);
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Sends one batch of queued operations, grouped per table. */
async function sendBatch(batch: SyncOp[]) {
  const jobs: PromiseLike<{ error: unknown }>[] = [];

  const upserts = new Map<SyncTable, Record<string, unknown>[]>();
  const deletes = new Map<SyncTable, string[]>();
  for (const op of batch) {
    if (op.kind === "upsert") {
      const list = upserts.get(op.table) ?? [];
      list.push(op.row);
      upserts.set(op.table, list);
    } else {
      const list = deletes.get(op.table) ?? [];
      list.push(op.rowId);
      deletes.set(op.table, list);
    }
  }

  for (const [table, rows] of upserts) {
    jobs.push(supabase.from(table).upsert(rows as never) as unknown as PromiseLike<{ error: unknown }>);
  }
  for (const [table, ids] of deletes) {
    jobs.push(
      supabase.from(table).delete().in("id", ids) as unknown as PromiseLike<{ error: unknown }>,
    );
  }

  const results = await Promise.all(jobs);
  const failed = results.find((r) => r?.error);
  if (failed) throw failed.error;
}

function scheduleRetry(userId: string, delay: number) {
  if (typeof window === "undefined") return;
  const existing = timers.get(userId);
  if (existing) window.clearTimeout(existing);
  timers.set(
    userId,
    window.setTimeout(() => {
      timers.delete(userId);
      void flushQueue(userId);
    }, delay),
  );
}

function hookOnline(userId: string) {
  if (onlineHooked || typeof window === "undefined") return;
  onlineHooked = true;
  window.addEventListener("online", () => void flushQueue(userId));
}

/** Drains the queue in small chunks so large offline backlogs stay responsive. */
export async function flushQueue(userId: string): Promise<void> {
  hookOnline(userId);
  if (flushing.has(userId)) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    scheduleRetry(userId, 15_000);
    return;
  }
  flushing.add(userId);
  try {
    for (const batch of chunk(read(userId), CHUNK)) {
      try {
        await sendBatch(batch);
      } catch {
        scheduleRetry(userId, 10_000);
        return;
      }
      const keys = new Set(batch.map((op) => op.key));
      persist(
        userId,
        read(userId).filter((op) => !keys.has(op.key)),
      );
      // yield between batches so the UI stays smooth
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    flushing.delete(userId);
  }
}

export function clearQueue(userId: string) {
  persist(userId, []);
}
