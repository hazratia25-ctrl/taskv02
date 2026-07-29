import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStore } from "@/lib/store";
import { fa, formatJalali } from "@/lib/jalali";
import { isOverdue } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "پروفایل | مدیریت وظایف آفلاین" },
      {
        name: "description",
        content: "پروفایل محلی کاربر؛ بدون ورود آنلاین و بدون ارسال داده به سرور.",
      },
      { property: "og:title", content: "پروفایل | مدیریت وظایف آفلاین" },
      { property: "og:description", content: "پروفایل محلی کاربر بدون ورود آنلاین." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, saveProfile, tasks } = useStore();
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [role, setRole] = useState(profile?.role ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar ?? "");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("نام باید حداقل ۲ نویسه باشد.");
      return;
    }
    setError("");
    saveProfile({
      name: name.trim(),
      role: role.trim(),
      email: email.trim(),
      avatar: avatar.trim() || null,
    });
    toast.success("پروفایل ذخیره شد");
  };

  const completed = tasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <div className="space-y-5">
      <PageHeader title="پروفایل" description="اطلاعات شما فقط روی این دستگاه ذخیره می‌شود" />

      <div className="surface flex items-center gap-4 p-5">
        <Avatar className="size-16 rounded-xl">
          {profile?.avatar && <AvatarImage src={profile.avatar} alt={profile.name} />}
          <AvatarFallback className="rounded-xl">{(profile?.name ?? "؟").slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-lg font-bold">
            {profile?.role ? `${profile.role} | ${profile.name}` : profile?.name}
          </p>
          <p className="text-sm text-muted-foreground">{profile?.email || "بدون ایمیل"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            عضو از {formatJalali(profile?.createdAt ?? null)} — {fa(tasks.length)} وظیفه،{" "}
            {fa(completed)} تکمیل‌شده، {fa(tasks.filter(isOverdue).length)} عقب‌افتاده
          </p>
        </div>
      </div>

      <form className="surface max-w-lg space-y-4 p-5" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="p-name">نام</Label>
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-role">نقش کاربر</Label>
          <Input
            id="p-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="مثلاً کارشناس"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-email">ایمیل</Label>
          <Input id="p-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-avatar">نشانی تصویر</Label>
          <Input
            id="p-avatar"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit">ذخیره</Button>
      </form>
    </div>
  );
}
