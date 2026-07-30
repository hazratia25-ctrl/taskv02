import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود و ثبت‌نام | مدیریت وظایف" },
      {
        name: "description",
        content: "ورود یا ساخت حساب کاربری آنلاین برای همگام‌سازی وظایف روی همه دستگاه‌ها.",
      },
      { property: "og:title", content: "ورود و ثبت‌نام | مدیریت وظایف" },
      { property: "og:description", content: "حساب کاربری آنلاین برای همگام‌سازی وظایف." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || password.length < 6) {
      setError("ایمیل معتبر و رمز عبور حداقل ۶ نویسه لازم است.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { name: name.trim() || email.split("@")[0] },
          },
        });
        if (err) throw err;
        toast.success("حساب ساخته شد. اگر تأیید ایمیل لازم باشد، لینک برایتان ارسال می‌شود.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطایی رخ داد.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError("");
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("ورود با گوگل انجام نشد.");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="surface w-full max-w-md p-7">
        <div className="mb-6 space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="text-2xl font-bold">
            {mode === "signin" ? "ورود به حساب" : "ساخت حساب کاربری"}
          </h1>
          <p className="text-sm text-muted-foreground">
            با حساب آنلاین، وظایف شما روی همه دستگاه‌ها همگام می‌شود.
          </p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="a-name">نام</Label>
              <Input
                id="a-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً زهرا"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="a-email">ایمیل</Label>
            <Input
              id="a-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-pass">رمز عبور</Label>
            <Input
              id="a-pass"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="حداقل ۶ نویسه"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="me-2 size-4 animate-spin" />}
            {mode === "signin" ? "ورود" : "ثبت‌نام"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          یا
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={google} disabled={busy}>
          ورود با گوگل
        </Button>

        <button
          type="button"
          className="mt-5 w-full text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
          }}
        >
          {mode === "signin" ? "حساب ندارید؟ ثبت‌نام کنید" : "حساب دارید؟ وارد شوید"}
        </button>
      </div>
    </div>
  );
}
