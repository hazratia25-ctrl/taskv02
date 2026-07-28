import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  JALALI_MONTHS,
  WEEK_DAYS,
  fa,
  formatJalali,
  isSameDay,
  jalaliMonthLength,
  saturdayIndex,
  toGregorian,
  toJalali,
} from "@/lib/jalali";
import { cn } from "@/lib/utils";

export function useJalaliMonthGrid(jy: number, jm: number) {
  return useMemo(() => {
    const first = toGregorian(jy, jm, 1);
    const lead = saturdayIndex(first);
    const length = jalaliMonthLength(jy, jm);
    const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= length; d++) cells.push(toGregorian(jy, jm, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [jy, jm]);
}

export function JalaliMonthGrid({
  jy,
  jm,
  selected,
  onSelect,
  renderBadge,
}: {
  jy: number;
  jm: number;
  selected?: Date | null;
  onSelect: (d: Date) => void;
  renderBadge?: (d: Date) => React.ReactNode;
}) {
  const cells = useJalaliMonthGrid(jy, jm);
  const today = new Date();

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} />;
          const j = toJalali(date);
          const isToday = isSameDay(date, today);
          const isSelected = selected ? isSameDay(date, selected) : false;
          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelect(date)}
              className={cn(
                "flex min-h-9 flex-col items-center justify-center rounded-lg p-1 text-sm transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                    ? "bg-accent/40 font-semibold"
                    : "hover:bg-muted",
              )}
            >
              <span>{fa(j.jd)}</span>
              {renderBadge?.(date)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function JalaliDatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const initial = value ? new Date(value) : new Date();
  const j0 = toJalali(initial);
  const [jy, setJy] = useState(j0.jy);
  const [jm, setJm] = useState(j0.jm);
  const [open, setOpen] = useState(false);

  const move = (delta: number) => {
    let m = jm + delta;
    let y = jy;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setJm(m);
    setJy(y);
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="flex-1 justify-start gap-2 font-normal"
          >
            <CalendarDays className="size-4" />
            {value ? formatJalali(value) : "انتخاب مهلت"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="mb-2 flex items-center justify-between">
            <Button type="button" size="icon" variant="ghost" onClick={() => move(-1)}>
              <ChevronRight className="size-4" />
            </Button>
            <span className="text-sm font-semibold">
              {JALALI_MONTHS[jm - 1]} {fa(jy)}
            </span>
            <Button type="button" size="icon" variant="ghost" onClick={() => move(1)}>
              <ChevronLeft className="size-4" />
            </Button>
          </div>
          <JalaliMonthGrid
            jy={jy}
            jm={jm}
            selected={value ? new Date(value) : null}
            onSelect={(d) => {
              onChange(d.toISOString());
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
          aria-label="حذف مهلت"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
