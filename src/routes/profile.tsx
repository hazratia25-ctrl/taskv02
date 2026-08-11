import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";


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
  const { profile, saveProfile } = useStore();
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [role, setRole] = useState(profile?.role ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [extension, setExtension] = useState(profile?.extension ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("نام باید حداقل ۲ نویسه باشد.");
      return;
    }
    const uname = username.trim().toLowerCase();
    if (uname && !/^[a-z0-9._-]{3,24}$/.test(uname)) {
      setError("نام کاربری باید ۳ تا ۲۴ نویسه لاتین، عدد یا . _ - باشد.");
      return;
    }
    if (uname && uname !== (profile?.username ?? "").toLowerCase()) {
      setChecking(true);
      const { data: free, error: rpcError } = await supabase.rpc("username_available", {
        _username: uname,
      });
      setChecking(false);
      if (rpcError) {
        setError("بررسی نام کاربری ناموفق بود.");
        return;
      }
      if (!free) {
        setError("این نام کاربری قبلاً گرفته شده است.");
        return;
      }
    }
    setError("");
    saveProfile({
      username: uname || null,
      name: name.trim(),
      role: role.trim(),
      email: email.trim(),
      phone: phone.trim(),
      extension: extension.trim(),
      avatar: avatar.trim() || null,
    });
    toast.success("پروفایل ذخیره شد");
  };

  return (
    <div className="space-y-5">
      <PageHeader title="پروفایل" description="اطلاعات حساب کاربری شما" />

      <div className="surface flex items-center gap-4 p-5">
        <Avatar className="size-16 rounded-xl">
          {profile?.avatar && <AvatarImage src={profile.avatar} alt={profile.name} />}
          <AvatarFallback className="rounded-xl">
            {(profile?.name ?? "؟").slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-lg font-bold">
            {profile?.role ? `${profile.role} | ${profile.name}` : profile?.name}
          </p>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {[profile?.username ? `@${profile.username}` : "", profile?.userCode]
              .filter(Boolean)
              .join(" · ") || profile?.email}
          </p>
          <p className="text-sm text-muted-foreground">{profile?.email || "بدون ایمیل"}</p>
          {(profile?.phone || profile?.extension) && (
            <p className="text-sm text-muted-foreground">
              {[
                profile?.phone ?? "",
                profile?.extension ? `داخلی ${profile.extension}` : "",
              ]
                .filter(Boolean)
                .join(" | ")}
            </p>
          )}
        </div>
      </div>

      <form className="surface max-w-lg space-y-4 p-5" onSubmit={(e) => void submit(e)}>
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
          <Label htmlFor="p-username">نام کاربری (برای ورود و دعوت شدن)</Label>
          <Input
            id="p-username"
            dir="ltr"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="zahra.karimi"
          />
          {profile?.userCode && (
            <p className="text-xs text-muted-foreground" dir="ltr">
              شناسه خودکار: {profile.userCode}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-email">ایمیل</Label>
          <Input id="p-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="p-phone">شماره تلفن</Label>
            <Input
              id="p-phone"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-ext">شماره داخلی</Label>
            <Input
              id="p-ext"
              dir="ltr"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
              placeholder="مثلاً ۲۳۴"
            />
          </div>
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
        <Button type="submit" disabled={checking}>
          ذخیره
        </Button>
      </form>
    </div>
  );
}

