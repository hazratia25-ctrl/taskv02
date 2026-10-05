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
