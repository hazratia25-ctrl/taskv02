import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  KanbanSquare,
  CalendarDays,
  BarChart3,
  Bell,
  Settings,
  User,
  Menu,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { fa } from "@/lib/jalali";
import { ProfileGate } from "./profile-gate";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "داشبورد", icon: LayoutDashboard },
  { to: "/tasks", label: "وظایف", icon: ListChecks },
  { to: "/kanban", label: "کانبان", icon: KanbanSquare },
  { to: "/calendar", label: "تقویم", icon: CalendarDays },
  { to: "/analytics", label: "آمار", icon: BarChart3 },
  { to: "/notifications", label: "اعلان‌ها", icon: Bell },
  { to: "/profile", label: "پروفایل", icon: User },
  { to: "/settings", label: "تنظیمات", icon: Settings },
] as const;

const MOBILE_NAV = NAV.slice(0, 5);
const MENU_NAV = NAV.slice(5);

export function AppShell({ children }: { children: React.ReactNode }) {
  const { notifications, profile, ready } = useStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = notifications.filter((n) => !n.isRead).length;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        در حال بارگذاری…
      </div>
    );
  }

  if (!profile) return <ProfileGate />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 py-2.5 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-9 shrink-0 rounded-lg">
              {profile.avatar && <AvatarImage src={profile.avatar} alt={profile.name} />}
              <AvatarFallback className="rounded-lg">{profile.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {profile.role ? `${profile.role} | ${profile.name}` : profile.name}
              </p>
              <p className="truncate text-xs text-muted-foreground leading-tight">
                {profile.email || "بدون ایمیل"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Link
              to="/notifications"
              className="relative flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted"
              aria-label="اعلان‌ها"
            >
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute end-1 top-1 size-2 rounded-full bg-destructive" />
              )}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted"
                aria-label="منوی کاربر"
              >
                <Menu className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{profile.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {MENU_NAV.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      <span className="flex-1">{item.label}</span>
                      {item.to === "/notifications" && unread > 0 && (
                        <span className="rounded-full bg-destructive px-1.5 text-[11px] text-destructive-foreground">
                          {fa(unread)}
                        </span>
                      )}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-3 pb-24 pt-4 md:px-6 lg:pb-8">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-60 shrink-0 flex-col rounded-2xl border bg-sidebar p-3 lg:flex">
          <div className="mb-4 px-2 pt-2">
            <p className="text-lg font-bold">مدیریت وظایف</p>
            <p className="text-xs text-muted-foreground">کاملاً آفلاین</p>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/notifications" && unread > 0 && (
                    <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] text-destructive-foreground">
                      {fa(unread)}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-xl bg-sidebar-accent p-3 text-xs text-sidebar-accent-foreground">
            داده‌ها فقط روی همین دستگاه ذخیره می‌شوند.
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-between px-1">
          {MOBILE_NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
