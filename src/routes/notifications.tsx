import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { formatJalali, fa } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { Bell, CheckCheck, Trash2 } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "اعلان‌ها | مدیریت وظایف آفلاین" },
      {
        name: "description",
        content: "اعلان‌های محلی مهلت‌ها و وظایف عقب‌افتاده، بدون نیاز به اینترنت.",
      },
      { property: "og:title", content: "اعلان‌ها | مدیریت وظایف آفلاین" },
      { property: "og:description", content: "اعلان‌های محلی مهلت‌ها و وظایف عقب‌افتاده." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearNotifications,
  } = useStore();
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="اعلان‌ها"
        description={unread > 0 ? `${fa(unread)} اعلان خوانده‌نشده` : "همه اعلان‌ها خوانده شده‌اند"}
        action={
          notifications.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={markAllNotificationsRead}>
                <CheckCheck className="size-4" /> خواندن همه
              </Button>
              <Button variant="ghost" onClick={clearNotifications}>
                <Trash2 className="size-4" /> پاک‌سازی
              </Button>
            </div>
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          title="اعلانی وجود ندارد"
          description="وقتی مهلت وظیفه‌ای نزدیک یا سپری شود، اینجا اطلاع می‌دهیم."
        />
      ) : (
        <div className="grid gap-3">
          {notifications.map((n) => (
            <article
              key={n.id}
              className={cn(
                "surface flex items-start gap-3 p-4",
                !n.isRead && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Bell className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{n.title}</p>
                  {!n.isRead && <Badge>جدید</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatJalali(n.createdAt, true)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!n.isRead && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => markNotificationRead(n.id)}
                    aria-label="خوانده شد"
                  >
                    <CheckCheck className="size-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteNotification(n.id)}
                  aria-label="حذف"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
