import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  disablePush,
  enablePush,
  getPushState,
  pushSupported,
  showDeviceNotification,
} from "@/lib/push";
import { toast } from "sonner";

export function PushSettings() {
  const { user } = useAuth();
  const [state, setState] = useState<"unsupported" | "denied" | "on" | "off" | "loading">(
    "loading",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  const toggle = async (v: boolean) => {
    if (!user) return;
    setBusy(true);
    try {
      if (v) {
        await enablePush(user.id);
        setState("on");
        toast.success("اعلان‌های گوشی فعال شد");
      } else {
        await disablePush();
        setState("off");
        toast.success("اعلان‌های گوشی غیرفعال شد");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فعال‌سازی انجام نشد");
      setState(await getPushState());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">اعلان روی گوشی (نوتیفیکیشن سیستمی)</p>
          <p className="text-xs text-muted-foreground">
            {state === "unsupported"
              ? "این مرورگر از اعلان سیستمی پشتیبانی نمی‌کند."
              : state === "denied"
                ? "اجازه اعلان در تنظیمات مرورگر مسدود شده است."
                : "یادآوری مهلت‌ها حتی وقتی برنامه بسته است."}
          </p>
        </div>
        <Switch
          checked={state === "on"}
          disabled={busy || state === "unsupported" || state === "denied" || state === "loading"}
          onCheckedChange={toggle}
        />
      </div>
      {state === "on" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            showDeviceNotification("اعلان آزمایشی", "اعلان‌های گوشی شما درست کار می‌کند.")
          }
        >
          ارسال اعلان آزمایشی
        </Button>
      )}
      {pushSupported() && (
        <p className="text-[11px] text-muted-foreground">
          برای دریافت اعلان در اندروید، برنامه را از منوی مرورگر روی صفحه اصلی نصب کنید.
        </p>
      )}
    </div>
  );
}
