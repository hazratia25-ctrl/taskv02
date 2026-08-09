import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, uid } from "@/lib/store";
import { fa } from "@/lib/jalali";
import { ACCESS_LABELS, type MemberAccess, type ProjectMember } from "@/lib/types";
import { ArrowRight, Plus, Trash2, Users, Search, UserPlus } from "lucide-react";
import {
  searchAppUsers,
  inviteProjectMember,
  type FoundUser,
} from "@/lib/collab.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/projects_/$projectId_/members")({
  head: () => ({
    meta: [
      { title: "مدیریت اعضای پروژه | مدیریت پروژه‌ها" },
      {
        name: "description",
        content: "افزودن، ویرایش نقش و تعیین سطح دسترسی اعضای تیم برای هر پروژه.",
      },
      { property: "og:title", content: "مدیریت اعضای پروژه | مدیریت پروژه‌ها" },
      { property: "og:description", content: "ویرایش نقش و سطح دسترسی اعضای تیم پروژه." },
    ],
  }),
  component: MembersPage,
});

const ACCESS_VALUES: MemberAccess[] = ["VIEW", "EDIT", "MANAGE"];

/** Search a real signed-up account by user code, username, or email and invite it. */
function InviteRealUser({
  project,
  members,
  setMembers,
}: {
  project: { id: string; title: string };
  members: ProjectMember[];
  setMembers: (next: ProjectMember[]) => void;
}) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    try {
      const found = await searchAppUsers({ data: { q } });
      setResults(found);
      if (found.length === 0) toast.error("کاربری با این شناسه پیدا نشد.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "جست‌وجو ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  const invite = async (u: FoundUser) => {
    setBusy(true);
    try {
      await inviteProjectMember({ data: { projectId: project.id, memberUserId: u.id, role } });
      if (!members.some((m) => m.userId === u.id)) {
        setMembers([
          ...members,
          {
            id: uid(),
            name: u.name || u.userCode,
            role: role.trim(),
            access: "VIEW",
            userId: u.id,
            userCode: u.userCode,
            avatar: u.avatar,
            status: "PENDING",
          },
        ]);
      }
      toast.success("دعوت ارسال شد؛ پس از پذیرش، دسترسی فعال می‌شود.");
      setResults([]);
      setQ("");
      setRole("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ارسال دعوت ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface space-y-3 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Search className="size-4 text-primary" /> دعوت کاربر واقعی
      </p>
      <p className="text-xs text-muted-foreground">
        شناسه کاربری (مثل TM-4F9K2)، نام کاربری یا ایمیل عضو را وارد کنید.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="TM-… یا نام کاربری یا ایمیل"
        />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="نقش در پروژه" />
        <Button disabled={busy || q.trim().length < 3} onClick={search}>
          <Search className="size-4" /> جست‌وجو
        </Button>
      </div>
      {results.length > 0 && (
        <div className="grid gap-2">
          {results.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{u.name || u.userCode}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {u.userCode}
                  {u.username ? ` · ${u.username}` : ""}
                </p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => invite(u)}>
                <UserPlus className="size-4" /> دعوت
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MembersPage() {
  const { projectId } = Route.useParams();
  const { projects, updateProject } = useStore();
  const project = projects.find((p) => p.id === projectId);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [access, setAccess] = useState<MemberAccess>("VIEW");

  if (!project) {
    return (
      <EmptyState
        title="پروژه یافت نشد"
        description="این پروژه حذف شده یا نشانی آن درست نیست."
        action={
          <Button asChild>
            <Link to="/projects">بازگشت به پروژه‌ها</Link>
          </Button>
        }
      />
    );
  }

  const members = project.members ?? [];
  const setMembers = (next: ProjectMember[]) => updateProject(project.id, { members: next });

  const addMember = () => {
    if (name.trim().length < 2) {
      toast.error("نام عضو باید حداقل ۲ نویسه باشد.");
      return;
    }
    setMembers([
      ...members,
      { id: uid(), name: name.trim(), role: role.trim(), phone: phone.trim(), access },
    ]);
    setName("");
    setRole("");
    setPhone("");
    setAccess("VIEW");
    toast.success("عضو جدید اضافه شد");
  };

  const patchMember = (id: string, patch: Partial<ProjectMember>) =>
    setMembers(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت اعضای تیم"
        description={`پروژه: ${project.title} — ${fa(members.length)} عضو`}
        action={
          <Button asChild variant="outline">
            <Link to="/projects/$projectId" params={{ projectId: project.id }}>
              <ArrowRight className="size-4" /> بازگشت به پروژه
            </Link>
          </Button>
        }
      />

      <InviteRealUser project={project} members={members} setMembers={setMembers} />

      <div className="surface space-y-3 p-4">

        <p className="flex items-center gap-2 font-semibold">
          <Plus className="size-4 text-primary" /> افزودن عضو جدید
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="m-name">نام</Label>
            <Input
              id="m-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً زهرا حضرتی"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-role">نقش</Label>
            <Input
              id="m-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="مثلاً کارشناس"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-phone">شماره تماس</Label>
            <Input
              id="m-phone"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912…"
            />
          </div>
          <div className="space-y-2">
            <Label>سطح دسترسی</Label>
            <Select value={access} onValueChange={(v) => setAccess(v as MemberAccess)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_VALUES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {ACCESS_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={addMember}>
          <Plus className="size-4" /> افزودن عضو
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5 text-primary" /> اعضای پروژه
        </h2>
        {members.length === 0 ? (
          <div className="surface p-4 text-sm text-muted-foreground">
            هنوز عضوی برای این پروژه ثبت نشده است.
          </div>
        ) : (
          <div className="grid gap-3">
            {members.map((m) => (
              <div key={m.id} className="surface space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-xs font-bold text-primary">
                      {m.name.slice(0, 2)}
                    </span>
                    {m.name || "بدون نام"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ACCESS_LABELS[m.access ?? "VIEW"]}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label="حذف عضو"
                      onClick={() => {
                        setMembers(members.filter((x) => x.id !== m.id));
                        toast.success("عضو حذف شد");
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <Input
                    value={m.name}
                    aria-label="نام عضو"
                    placeholder="نام عضو"
                    onChange={(e) => patchMember(m.id, { name: e.target.value })}
                  />
                  <Input
                    value={m.role}
                    aria-label="نقش عضو"
                    placeholder="نقش"
                    onChange={(e) => patchMember(m.id, { role: e.target.value })}
                  />
                  <Input
                    dir="ltr"
                    value={m.phone ?? ""}
                    aria-label="شماره تماس عضو"
                    placeholder="شماره تماس"
                    onChange={(e) => patchMember(m.id, { phone: e.target.value })}
                  />
                  <Select
                    value={m.access ?? "VIEW"}
                    onValueChange={(v) => patchMember(m.id, { access: v as MemberAccess })}
                  >
                    <SelectTrigger aria-label="سطح دسترسی عضو">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_VALUES.map((a) => (
                        <SelectItem key={a} value={a}>
                          {ACCESS_LABELS[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
