import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
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
import { isOverdue, projectProgress, useStore } from "@/lib/store";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/types";
import { JALALI_MONTHS, fa, formatJalali, toJalali } from "@/lib/jalali";
import { Button } from "@/components/ui/button";
import { FileText, FolderKanban, ListChecks } from "lucide-react";
import { toPng } from "html-to-image";
import { printReportPdf } from "@/lib/report-pdf";
import { toast } from "sonner";
import { ProjectMembers } from "@/components/project-item";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "آمار و تحلیل | مدیریت وظایف آفلاین" },
      {
        name: "description",
        content: "نمودارهای وضعیت، اولویت و روند تکمیل وظایف از داده‌های محلی.",
      },
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
        <Area
          type="monotone"
          dataKey="value"
          stroke={colors[0]}
          fill={colors[0]}
          fillOpacity={0.2}
        />
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

type TrendRow = { name: string; ایجادشده: number; تکمیل‌شده: number };

function renderTrend(type: ChartType, rows: TrendRow[]) {
  if (type === "line") {
    return (
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="ایجادشده" stroke="var(--chart-1)" strokeWidth={2} />
        <Line type="monotone" dataKey="تکمیل‌شده" stroke="var(--chart-3)" strokeWidth={2} />
      </LineChart>
    );
  }
  if (type === "pie") {
    const totals = [
      { name: "ایجادشده", value: rows.reduce((a, r) => a + r["ایجادشده"], 0) },
      { name: "تکمیل‌شده", value: rows.reduce((a, r) => a + r["تکمیل‌شده"], 0) },
    ];
    return (
      <PieChart>
        <Pie data={totals} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
          <Cell fill="var(--chart-1)" />
          <Cell fill="var(--chart-3)" />
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    );
  }
  return (
    <BarChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
      <Tooltip />
      <Legend />
      <Bar dataKey="ایجادشده" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
      <Bar dataKey="تکمیل‌شده" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
    </BarChart>
  );
}


type Scope = "tasks" | "projects";

function StatGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((s) => (
        <div key={s.label} className="surface p-4">
          <p className="text-2xl font-bold">{s.value}</p>
          <p className="text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

function monthBuckets<T extends { createdAt: string; completedAt: string | null }>(items: T[]) {
  const today = toJalali(new Date());
  const months: TrendRow[] = [];
  for (let i = 2; i >= 0; i--) {
    let jm = today.jm - i;
    let jy = today.jy;
    while (jm <= 0) {
      jm += 12;
      jy -= 1;
    }
    const inMonth = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return false;
      const jj = toJalali(d);
      return jj.jy === jy && jj.jm === jm;
    };
    months.push({
      name: `${JALALI_MONTHS[jm - 1]} ${fa(jy)}`,
      "\u0627\u06cc\u062c\u0627\u062f\u0634\u062f\u0647": items.filter((t) => inMonth(t.createdAt)).length,
      "\u062a\u06a9\u0645\u06cc\u0644\u200c\u0634\u062f\u0647": items.filter((t) => inMonth(t.completedAt)).length,
    });
  }
  return months;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function AnalyticsPage() {
  const { tasks, projects } = useStore();
  const [scope, setScope] = useState<Scope>("tasks");
  const [statusType, setStatusType] = useState<ChartType>("pie");
  const [priorityType, setPriorityType] = useState<ChartType>("bar");
  const [trendType, setTrendType] = useState<ChartType>("bar");
  const statusRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const items = scope === "tasks" ? tasks : projects;

  const data = useMemo(() => {
    const completed = items.filter((t) => t.status === "COMPLETED").length;
    const inProgress = items.filter((t) => t.status === "IN_PROGRESS").length;
    const high = items.filter((t) => t.priority === "HIGH" && t.status !== "COMPLETED").length;
    const statusData = (["TODO", "IN_PROGRESS", "COMPLETED"] as const).map((st) => ({
      name: STATUS_LABELS[st],
      value: items.filter((t) => t.status === st).length,
    }));
    const priorityData = (["HIGH", "MEDIUM", "LOW"] as const).map((pr) => ({
      name: PRIORITY_LABELS[pr],
      value: items.filter((t) => t.priority === pr).length,
    }));

    const allStages = projects.flatMap((pr) => pr.stages ?? []);
    const stageData = [
      { name: "مراحل تکمیل‌شده", value: allStages.filter((st) => st.done).length },
      { name: "مراحل باقی‌مانده", value: allStages.filter((st) => !st.done).length },
    ];
    const avgProgress = projects.length
      ? Math.round(projects.reduce((a, pr) => a + projectProgress(pr), 0) / projects.length)
      : 0;

    return {
      total: items.length,
      completed,
      inProgress,
      high,
      overdue: items.filter(isOverdue).length,
      rate: items.length ? Math.round((completed / items.length) * 100) : 0,
      statusData,
      priorityData,
      stageData,
      avgProgress,
      members: projects.reduce((a, pr) => a + (pr.members?.length ?? 0), 0),
      months: monthBuckets(items),
    };
  }, [items, projects]);

  const statCards =
    scope === "tasks"
      ? [
          { label: "کل وظایف", value: fa(data.total) },
          { label: "در حال انجام", value: fa(data.inProgress) },
          { label: "انجام‌شده", value: fa(data.completed) },
          { label: "اولویت بالا", value: fa(data.high) },
          { label: "عقب‌افتاده", value: fa(data.overdue) },
          { label: "نرخ تکمیل", value: `${fa(data.rate)}٪` },
        ]
      : [
          { label: "کل پروژه‌ها", value: fa(data.total) },
          { label: "در حال انجام", value: fa(data.inProgress) },
          { label: "تکمیل‌شده", value: fa(data.completed) },
          { label: "اولویت بالا", value: fa(data.high) },
          { label: "عقب‌افتاده", value: fa(data.overdue) },
          { label: "اعضای تیم", value: fa(data.members) },
        ];

  const exportPdf = async () => {
    setExporting(true);
    try {
      const shot = async (el: HTMLElement | null) => {
        if (!el) return "";
        try {
          return await toPng(el, { pixelRatio: 2, skipFonts: true, backgroundColor: "#ffffff" });
        } catch {
          return "";
        }
      };
      const [statusImg, priorityImg, trendImg] = await Promise.all([
        shot(statusRef.current),
        shot(priorityRef.current),
        shot(trendRef.current),
      ]);

      const chartBox = (heading: string, src: string) =>
        src ? `<div class="chart"><h3>${esc(heading)}</h3><img src="${src}" /></div>` : "";

      const sections = [
        {
          heading: "خلاصه وضعیت",
          html: `<div class="stats">${statCards
            .map((s) => `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`)
            .join("")}</div>`,
        },
        {
          heading: scope === "tasks" ? "پیشرفت کلی وظایف" : "میانگین پیشرفت پروژه‌ها",
          html: `<div class="bar"><i style="width:${scope === "tasks" ? data.rate : data.avgProgress}%"></i></div>
            <p style="font-size:11px;color:#64748b;margin:6px 0 0">${fa(
              scope === "tasks" ? data.rate : data.avgProgress,
            )}٪</p>`,
        },
        {
          heading: "نمودارها",
          html: `<div class="charts">${chartBox("توزیع وضعیت", statusImg)}${chartBox(
            scope === "tasks" ? "توزیع اولویت" : "وضعیت مراحل پروژه‌ها",
            priorityImg,
          )}${chartBox("روند ۳ ماه اخیر", trendImg)}</div>`,
        },
      ];

      if (scope === "tasks") {
        sections.push({
          heading: "فهرست وظایف",
          html: `<table><thead><tr><th>عنوان</th><th>وضعیت</th><th>اولویت</th><th>مهلت</th></tr></thead><tbody>${tasks
            .map(
              (t) =>
                `<tr><td>${esc(t.title)}</td><td>${STATUS_LABELS[t.status]}</td><td>${
                  PRIORITY_LABELS[t.priority]
                }</td><td>${t.dueDate ? esc(formatJalali(t.dueDate)) : "—"}</td></tr>`,
            )
            .join("")}</tbody></table>`,
        });
      } else {
        sections.push({
          heading: "پروژه‌ها، مراحل و اعضا",
          html: projects
            .map(
              (pr) => `<div style="border:1px solid #d8e0ea;border-radius:10px;padding:8px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600">
                <span>${esc(pr.title)}</span>
                <span>${STATUS_LABELS[pr.status]} — ${fa(projectProgress(pr))}٪</span>
              </div>
              <div class="bar" style="margin:6px 0"><i style="width:${projectProgress(pr)}%"></i></div>
              <p style="font-size:10px;color:#64748b;margin:0">مهلت: ${
                pr.dueDate ? esc(formatJalali(pr.dueDate)) : "—"
              }</p>
              <ul>${(pr.stages ?? [])
                .map(
                  (st, i) =>
                    `<li>مرحله ${fa(i + 1)}: ${esc(st.title)} — ${st.done ? "تکمیل‌شده" : "در انتظار"}</li>`,
                )
                .join("")}${(pr.stages ?? []).length === 0 ? "<li>مرحله‌ای ثبت نشده است.</li>" : ""}</ul>
              <p style="font-size:10px;color:#64748b;margin:6px 0 0">اعضا: ${
                (pr.members ?? []).length
                  ? (pr.members ?? []).map((m) => `${esc(m.name)} (${esc(m.role)})`).join(" ، ")
                  : "—"
              }</p>
            </div>`,
            )
            .join(""),
        });
      }

      printReportPdf({
        title: scope === "tasks" ? "گزارش وظایف" : "گزارش پروژه‌ها",
        subtitle: `تاریخ گزارش: ${formatJalali(new Date().toISOString())}`,
        sections,
      });
      toast.success("گزارش PDF آماده شد؛ در پنجره چاپ گزینه ذخیره PDF را انتخاب کنید.");
    } catch {
      toast.error("تهیه گزارش PDF ناموفق بود");
    } finally {
      setExporting(false);
    }
  };


  const scopePicker = (
    <ToggleGroup
      type="single"
      value={scope}
      onValueChange={(v) => v && setScope(v as Scope)}
      className="rounded-xl border p-1"
    >
      <ToggleGroupItem value="tasks" className="gap-2 px-4 text-xs">
        <ListChecks className="size-4" /> وظایف
      </ToggleGroupItem>
      <ToggleGroupItem value="projects" className="gap-2 px-4 text-xs">
        <FolderKanban className="size-4" /> پروژه‌ها
      </ToggleGroupItem>
    </ToggleGroup>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="آمار و تحلیل"
        description={scope === "tasks" ? "تحلیل وظایف شما" : "تحلیل پروژه‌ها و مراحل آن‌ها"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {scopePicker}
            <Button onClick={exportPdf} disabled={exporting || items.length === 0}>
              <FileText className="size-4" /> {exporting ? "در حال آماده‌سازی…" : "گزارش PDF"}
            </Button>
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title={scope === "tasks" ? "داده‌ای برای تحلیل وظایف نیست" : "پروژه‌ای برای تحلیل نیست"}
          description={
            scope === "tasks" ? "ابتدا چند وظیفه ایجاد کنید." : "ابتدا یک پروژه بسازید."
          }
        />
      ) : (
        <div className="space-y-5 bg-background p-1">
          <StatGrid items={statCards} />

          <div className="surface p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">
                {scope === "tasks" ? "پیشرفت کلی وظایف" : "میانگین پیشرفت پروژه‌ها"}
              </p>
              <p className="text-sm text-muted-foreground">
                {fa(scope === "tasks" ? data.rate : data.avgProgress)}٪
              </p>
            </div>
            <Progress value={scope === "tasks" ? data.rate : data.avgProgress} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">توزیع وضعیت</p>
                <ChartTypePicker value={statusType} onChange={setStatusType} />
              </div>
              <div className="h-64" dir="ltr" ref={statusRef}>
                <ResponsiveContainer width="100%" height="100%">
                  {renderChart(statusType, data.statusData, STATUS_COLORS)}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {scope === "tasks" ? "توزیع اولویت" : "وضعیت مراحل پروژه‌ها"}
                </p>
                <ChartTypePicker value={priorityType} onChange={setPriorityType} />
              </div>
              <div className="h-64" dir="ltr" ref={priorityRef}>
                <ResponsiveContainer width="100%" height="100%">
                  {renderChart(
                    priorityType,
                    scope === "tasks" ? data.priorityData : data.stageData,
                    PRIORITY_COLORS,
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">روند ۳ ماه اخیر</p>
              <ChartTypePicker value={trendType} onChange={setTrendType} />
            </div>
            <div className="h-72" dir="ltr" ref={trendRef}>
              <ResponsiveContainer width="100%" height="100%">
                {renderTrend(trendType, data.months)}
              </ResponsiveContainer>
            </div>
          </div>

          {scope === "projects" && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">پروژه‌ها و مراحل آن‌ها</h2>
              {projects.map((pr) => (
                <div key={pr.id} className="surface space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{pr.title}</p>
                    <span className="text-xs text-muted-foreground">
                      {STATUS_LABELS[pr.status]} — {fa(projectProgress(pr))}٪
                    </span>
                  </div>
                  <Progress value={projectProgress(pr)} />
                  <div className="grid gap-1.5">
                    {(pr.stages ?? []).map((st, i) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-1.5 text-xs"
                      >
                        <span className={st.done ? "text-muted-foreground line-through" : ""}>
                          مرحله {fa(i + 1)}: {st.title}
                        </span>
                        <span className="text-muted-foreground">
                          {st.done ? "تکمیل‌شده" : "در انتظار"}
                        </span>
                      </div>
                    ))}
                    {(pr.stages ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">مرحله‌ای ثبت نشده است.</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">اعضای تیم و نقش‌ها</p>
                    <ProjectMembers project={pr} />
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
