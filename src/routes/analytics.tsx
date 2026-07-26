import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

function AnalyticsPage() {
  const { tasks } = useStore();

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
          <p className="mb-3 font-semibold">توزیع وضعیت</p>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {data.statusData.map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface p-4">
          <p className="mb-3 font-semibold">توزیع اولویت</p>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.priorityData} dataKey="value" nameKey="name" outerRadius={90}>
                  {data.priorityData.map((_, i) => (
                    <Cell key={i} fill={PRIORITY_COLORS[i % PRIORITY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface p-4">
        <p className="mb-3 font-semibold">روند ۶ ماه اخیر</p>
        <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.months}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="ایجادشده" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="تکمیل‌شده" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
