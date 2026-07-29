import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useStore } from "@/lib/store";
import type { ThemeMode } from "@/lib/types";
import { fa, formatJalali } from "@/lib/jalali";
import { Download, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "تنظیمات | مدیریت وظایف آفلاین" },
      {
        name: "description",
        content: "دسته‌بندی‌ها، برچسب‌ها، پوسته، اعلان‌ها و پشتیبان‌گیری JSON کاملاً محلی.",
      },
      { property: "og:title", content: "تنظیمات | مدیریت وظایف آفلاین" },
      { property: "og:description", content: "دسته‌بندی‌ها، برچسب‌ها، پوسته و پشتیبان‌گیری محلی." },
    ],
  }),
  component: SettingsPage,
});

const PALETTE = ["#0d9488", "#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#a16207", "#0ea5e9"];

function SettingsPage() {
  const {
    categories,
    tags,
    tasks,
    settings,
    createCategory,
    updateCategory,
    deleteCategory,
    createTag,
    deleteTag,
    updateSettings,
    exportData,
    importData,
    resetAll,
  } = useStore();

  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(PALETTE[0]);
  const [tagName, setTagName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = () => {
    try {
      const blob = new Blob([exportData()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `task-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("فایل پشتیبان دانلود شد");
    } catch {
      toast.error("خروجی گرفتن ناموفق بود");
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const result = importData(text);
      if (result.ok) toast.success("داده‌ها با موفقیت بازیابی شد");
      else toast.error(result.error);
    } catch {
      toast.error("خواندن فایل ناموفق بود");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="تنظیمات" description="شخصی‌سازی، دسته‌بندی‌ها، برچسب‌ها و پشتیبان‌گیری" />

      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">ظاهر و اعلان‌ها</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>پوسته</Label>
            <Select
              value={settings.theme}
              onValueChange={(v) => updateSettings({ theme: v as ThemeMode })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">روشن</SelectItem>
                <SelectItem value="dark">تیره</SelectItem>
                <SelectItem value="system">هماهنگ با سیستم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>فاصله یادآوری (روز پیش از مهلت)</Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={settings.reminderDays}
              onChange={(e) =>
                updateSettings({ reminderDays: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">اعلان‌های محلی</p>
            <p className="text-xs text-muted-foreground">یادآوری مهلت‌ها و وظایف عقب‌افتاده</p>
          </div>
          <Switch
            checked={settings.notificationsEnabled}
            onCheckedChange={(v) => updateSettings({ notificationsEnabled: v })}
          />
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">دسته‌بندی‌ها</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1 space-y-2">
            <Label htmlFor="cat">نام دسته</Label>
            <Input
              id="cat"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="مثلاً کار"
            />
          </div>
          <div className="flex gap-1.5 pb-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`رنگ ${c}`}
                onClick={() => setCatColor(c)}
                className={`size-6 rounded-full ring-offset-2 ${catColor === c ? "ring-2 ring-ring" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button
            onClick={() => {
              if (catName.trim().length < 2) return toast.error("نام دسته را وارد کنید");
              createCategory(catName.trim(), catColor);
              setCatName("");
              toast.success("دسته‌بندی ایجاد شد");
            }}
          >
            <Plus className="size-4" /> افزودن
          </Button>
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز دسته‌بندی‌ای نساخته‌اید.</p>
        ) : (
          <ul className="grid gap-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl border p-3">
                <span className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
                <Input
                  value={c.name}
                  onChange={(e) => updateCategory(c.id, { name: e.target.value })}
                  className="h-9 max-w-56"
                />
                <span className="text-xs text-muted-foreground">
                  {fa(tasks.filter((t) => t.categoryId === c.id).length)} وظیفه
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ms-auto"
                  onClick={() => {
                    deleteCategory(c.id);
                    toast.success("دسته‌بندی حذف شد");
                  }}
                  aria-label="حذف دسته"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">برچسب‌ها</h2>
        <div className="flex gap-2">
          <Input
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="برچسب جدید"
          />
          <Button
            onClick={() => {
              if (!tagName.trim()) return;
              createTag(tagName.trim());
              setTagName("");
              toast.success("برچسب اضافه شد");
            }}
          >
            <Plus className="size-4" /> افزودن
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">هنوز برچسبی ندارید.</p>
          )}
          {tags.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1.5">
              #{t.name}
              <button type="button" onClick={() => deleteTag(t.id)} aria-label={`حذف ${t.name}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">پشتیبان‌گیری و بازیابی</h2>
        <p className="text-sm text-muted-foreground">
          خروجی JSON شامل وظایف، دسته‌بندی‌ها، برچسب‌ها، اعلان‌ها، پروفایل و تنظیمات است.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExport}>
            <Download className="size-4" /> خروجی JSON
          </Button>
          <Button variant="secondary" disabled={importing} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> {importing ? "در حال بازیابی…" : "بازیابی از فایل"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImport(f);
            }}
          />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="text-destructive">
                <Trash2 className="size-4" /> پاک کردن همه داده‌ها
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader className="text-start">
                <AlertDialogTitle>همه داده‌ها حذف شوند؟</AlertDialogTitle>
                <AlertDialogDescription>
                  وظایف، دسته‌بندی‌ها، برچسب‌ها و پروفایل شما پاک می‌شود. پیش از این کار خروجی
                  بگیرید.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:justify-start">
                <AlertDialogAction
                  onClick={() => {
                    resetAll();
                    toast.success("همه داده‌ها پاک شد");
                  }}
                >
                  حذف همه
                </AlertDialogAction>
                <AlertDialogCancel>انصراف</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <p className="text-xs text-muted-foreground">
          آخرین به‌روزرسانی داده‌ها: {formatJalali(tasks[0]?.updatedAt ?? null, true)}
        </p>
      </section>
    </div>
  );
}
