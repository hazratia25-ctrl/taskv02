import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { CheckCircle2 } from "lucide-react";

export function ProfileGate() {
  const { saveProfile } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("لطفاً نام خود را وارد کنید (حداقل ۲ نویسه).");
      return;
    }
    saveProfile({ name: name.trim(), email: email.trim(), avatar: avatar.trim() || null });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="surface w-full max-w-md p-7">
        <div className="mb-6 space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="text-2xl font-bold">خوش آمدید</h1>
          <p className="text-sm text-muted-foreground">
            یک پروفایل محلی بسازید. همه‌چیز روی همین دستگاه ذخیره می‌شود و نیازی به اینترنت نیست.
          </p>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="name">نام</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً زهرا" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">ایمیل (اختیاری)</Label>
            <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatar">نشانی تصویر پروفایل (اختیاری)</Label>
            <Input id="avatar" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full">
            شروع کنید
          </Button>
        </form>
      </div>
    </div>
  );
}
