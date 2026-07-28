import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Progress } from "@/components/ui/progress";
import { isOverdue, useStore } from "@/lib/store";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/types";
import { JALALI_MONTHS, fa, toJalali } from "@/lib/jalali";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "آمار و تحلیل | مدیریت وظایف آفلاین" },
      { name: "description", content: "نمودارهای وضعیت، اولویت و روند تکمیل وظایف از داده‌های محلی." },
      { property: "og:title", content: "آمار و تحلیل | مدیریت وظایف آفلاین" },
      { property: "og:description", content: "نمودار وضعیت، اولویت و روند تکمیل وظایف." },
    ],
  }),
  component: AnalyticsPage,
});

const STATUS_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
const PRIORITY_COLORS = ["var(--chart-4)", "var(--chart-2)", "var(--chart-5)"];

type ChartType = "bar" | "line" | "pie";

const CHART_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "bar", label: "ستونی" },
  { value: "line", label: "خطی" },
  { value: "pie", label: "دایره‌ای" },
];

function ChartTypePicker({
  value,
  onChange,
}: {
  value: ChartType;
  onChange: (v: ChartType) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as ChartType)}
      className="rounded-xl border p-0.5"
    >
      {CHART_OPTIONS.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="px-3 text-xs">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type Datum = { name: string; value: number };

function renderChart(type: ChartType, rows: Datum[], colors: string[]) {
  if (type === "pie") {
    return (
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
          {rows.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    );
  }
  if (type === "line") {
    return (
      <AreaChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Area type="monotone" dataKey="value" stroke={colors[0]} fill={colors[0]} fillOpacity={0.2} />
      </AreaChart>
    );
  }
  return (
    <BarChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
      <Tooltip />
      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
        {rows.map((_, i) => (
          <Cell key={i} fill={colors[i % colors.length]} />
        ))}
      </Bar>
    </BarChart>
  );
}

function renderTrend(type: ChartType, rows: { name: string }[]) {
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
      <Tooltip />
      <Legend />
    </>
  );
  if (type === "line") {
    return (
      <LineChart data={rows}>
        {common}
        <Line type="monotone" dataKey="ایجادشده" stroke="var(--chart-1)" strokeWidth={2} />
        <Line type="monotone" dataKey="تکمیل‌شده" stroke="var(--chart-3)" strokeWidth={2} />
      </LineChart>
    );
  }
  if (type === "pie") {
    return (
      <AreaChart data={rows}>
        {common}
        <Area type="monotone" dataKey="ایجادشده" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.25} />
        <Area type="monotone" dataKey="تکمیل‌شده" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.25} />
      </AreaChart>
    );
  }
  return (
    <BarChart data={rows}>
      {common}
      <Bar dataKey="ایجادشده" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
      <Bar dataKey="تکمیل‌شده" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
    </BarChart>
  );
}

function AnalyticsPage() {
  const { tasks } = useStore();
  const [statusType, setStatusType] = useState<ChartType>("pie");
  const [priorityType, setPriorityType] = useState<ChartType>("bar");
  const [trendType, setTrendType] = useState<ChartType>("bar");

  const data = useMemo(() => {
    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    const statusData = (["TODO", "IN_PROGRESS", "COMPLETED"] as const).map((s) => ({
      name: STATUS_LABELS[s],
      value: tasks.filter((t) => t.status === s).length,
    }));
    const priorityData = (["HIGH", "MEDIUM", "LOW"] as const).map((p) => ({
      name: PRIORITY_LABELS[p],
      value: tasks.filter((t) => t.priority === p).length,
    }));

    const months: { name: string; ایجادشده: number; تکمیل‌شده: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
      const j = toJalali(d);
      const inMonth = (iso: string | null) => {
        if (!iso) return false;
        const jj = toJalali(new Date(iso));
        return jj.jy === j.jy && jj.jm === j.jm;
      };
      months.push({
        name: JALALI_MONTHS[j.jm - 1],
        ایجادشده: tasks.filter((t) => inMonth(t.createdAt)).length,
        "تکمیل‌شده": tasks.filter((t) => inMonth(t.completedAt)).length,
      });
    }

    return {
      completed,
      overdue: tasks.filter(isOverdue).length,
      rate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      statusData,
      priorityData,
      months,
    };
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="آمار و تحلیل" description="محاسبه‌شده از داده‌های محلی شما" />
        <EmptyState title="داده‌ای برای تحلیل نیست" description="ابتدا چند وظیفه ایجاد کنید." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="آمار و تحلیل" description="محاسبه‌شده از داده‌های محلی شما" />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "کل وظایف", value: fa(tasks.length) },
          { label: "تکمیل‌شده", value: fa(data.completed) },
          { label: "عقب‌افتاده", value: fa(data.overdue) },
          { label: "نرخ تکمیل", value: `${fa(data.rate)}٪` },
        ].map((s) => (
          <div key={s.label} className="surface p-4">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="surface p-5">
        <p className="mb-2 font-semibold">پیشرفت کلی</p>
        <Progress value={data.rate} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">توزیع وضعیت</p>
            <ChartTypePicker value={statusType} onChange={setStatusType} />
          </div>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart(statusType, data.statusData, STATUS_COLORS)}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">توزیع اولویت</p>
            <ChartTypePicker value={priorityType} onChange={setPriorityType} />
          </div>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart(priorityType, data.priorityData, PRIORITY_COLORS)}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">روند ۶ ماه اخیر</p>
          <ChartTypePicker value={trendType} onChange={setTrendType} />
        </div>
        <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            {renderTrend(trendType, data.months)}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
