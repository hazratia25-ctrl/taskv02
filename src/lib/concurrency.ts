/** Optimistic-concurrency helpers: a save carries the server updated_at it was based on. */
export const STALE_MESSAGE =
  "این مورد هم‌زمان در جای دیگری تغییر کرده است؛ آخرین نسخه بارگذاری شد.";

export function isStaleError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return msg.includes("STALE_UPDATE");
}

export interface VersionedSave<R> {
  /** apply the optimistic local change */
  apply: () => void;
  /** restore the exact previous local state */
  rollback: () => void;
  /** server call; must reject with STALE_UPDATE when the expected version is old */
  call: () => Promise<R>;
  /** store the server-confirmed row (new updated_at) */
  confirm: (row: R) => void;
  /** reload latest server data */
  refetch: () => Promise<unknown>;
  notify: (message: string) => void;
}

/** Success only after the server answers; on any failure: full rollback, visible message, refetch on conflict. */
export async function runVersionedSave<R>(s: VersionedSave<R>): Promise<R> {
  s.apply();
  let row: R;
  try {
    row = await s.call();
  } catch (e) {
    s.rollback();
    if (isStaleError(e)) {
      s.notify(STALE_MESSAGE);
      try {
        await s.refetch();
      } catch {
        /* refetch failure keeps the rolled-back state */
      }
    } else {
      s.notify(e instanceof Error ? e.message : "ذخیره در سرور ناموفق بود");
    }
    throw e;
  }
  s.confirm(row);
  return row;
}

export const CANCELLED_MESSAGE = "SAVE_CANCELLED_AFTER_EARLIER_FAILURE";

export interface SerialSaveOptions<T> {
  /** server-known state before this intent (used only when nothing is confirmed yet) */
  base: T;
  /** server write using the latest confirmed version; must reject with STALE_UPDATE when old */
  call: (expectedUpdatedAt: string) => Promise<T>;
  /** apply confirmed row; isLatest=false means newer local intents are still queued */
  confirm: (row: T, isLatest: boolean) => void;
  /** restore local state to the last server-confirmed row */
  rollback: (confirmed: T) => void;
  refetch: () => Promise<unknown>;
  notify: (message: string) => void;
}

/**
 * Per-entity serialization: saves of one id run one after another, each sending the
 * version confirmed by the previous save. A failure rolls back to the last confirmed row
 * and cancels intents queued behind it (they were built on the rejected state).
 */
export function createSaveSerializer<T extends { updatedAt: string }>() {
  const chains = new Map<string, Promise<unknown>>();
  const confirmed = new Map<string, T>();
  const epoch = new Map<string, number>();
  const queued = new Map<string, number>();

  function run(id: string, o: SerialSaveOptions<T>): Promise<T> {
    if (!confirmed.has(id)) confirmed.set(id, o.base);
    const myEpoch = epoch.get(id) ?? 0;
    queued.set(id, (queued.get(id) ?? 0) + 1);
    const prev = chains.get(id) ?? Promise.resolve();
    const job = prev
      .catch(() => undefined)
      .then(async () => {
        try {
          if ((epoch.get(id) ?? 0) !== myEpoch) throw new Error(CANCELLED_MESSAGE);
          let row: T;
          try {
            row = await o.call(confirmed.get(id)!.updatedAt);
          } catch (e) {
            epoch.set(id, myEpoch + 1); // cancel everything queued behind this intent
            o.rollback(confirmed.get(id)!);
            if (isStaleError(e)) {
              o.notify(STALE_MESSAGE);
              await o.refetch().catch(() => undefined);
            } else {
              o.notify(e instanceof Error ? e.message : "ذخیره در سرور ناموفق بود");
            }
            throw e;
          }
          confirmed.set(id, row);
          o.confirm(row, (queued.get(id) ?? 1) <= 1);
          return row;
        } finally {
          const left = (queued.get(id) ?? 1) - 1;
          if (left <= 0) {
            queued.delete(id);
            confirmed.delete(id); // next save starts from fresh server-known state
          } else queued.set(id, left);
        }
      });
    chains.set(id, job);
    return job;
  }

  return { run, pending: (id: string) => (queued.get(id) ?? 0) > 0 };
}
