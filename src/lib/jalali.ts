import jalaali from "jalaali-js";

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

// شنبه ... جمعه
export const WEEK_DAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export interface JDate {
  jy: number;
  jm: number;
  jd: number;
}

export function toJalali(date: Date): JDate {
  return jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function toGregorian(jy: number, jm: number, jd: number): Date {
  const g = jalaali.toGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0, 0);
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

/** ایندکس روز هفته با شنبه = ۰ */
export function saturdayIndex(date: Date): number {
  return (date.getDay() + 1) % 7;
}

const faNum = new Intl.NumberFormat("fa-IR", { useGrouping: false });

export function fa(n: number | string): string {
  const value = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(value) ? faNum.format(value as number) : String(n);
}

export function formatJalali(iso: string | Date | null, withTime = false): string {
  if (!iso) return "بدون تاریخ";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "بدون تاریخ";
  const j = toJalali(d);
  const base = `${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`;
  if (!withTime) return base;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${base} — ${fa(hh)}:${fa(mm)}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

export function relativeDue(iso: string | null): string {
  if (!iso) return "بدون مهلت";
  const diff = daysBetween(new Date(), new Date(iso));
  if (diff === 0) return "امروز";
  if (diff === 1) return "فردا";
  if (diff === -1) return "دیروز";
  if (diff < 0) return `${fa(Math.abs(diff))} روز عقب‌افتاده`;
  return `${fa(diff)} روز دیگر`;
}
