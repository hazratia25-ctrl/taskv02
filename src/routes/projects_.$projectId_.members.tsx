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
import { projectPermissions } from "@/lib/access";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRight, Plus, Trash2, Users, Search, Pencil, Check, X } from "lucide-react";
import { inviteProjectMember, type FoundUser } from "@/lib/collab.functions";
import { MemberSearch } from "@/components/member-search";
import { MemberAvatar } from "@/components/project-item";
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
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);

  const invite = async (u: FoundUser) => {
    if (members.some((m) => m.userId === u.id)) {
      toast.error("این کاربر قبلاً عضو پروژه است.");
      return;
    }
    setBusy(true);
    try {
      await inviteProjectMember({
        data: { projectId: project.id, memberUserId: u.id, role: role.trim() || u.role },
      });
      setMembers([
        ...members,
        {
          id: uid(),
          name: u.name || u.userCode,
          role: role.trim() || u.role || "عضو تیم",
          access: "VIEW",
          phone: u.phone,
          extension: u.extension,
          email: u.email,
          userId: u.id,
          userCode: u.userCode,
          username: u.username,
          avatar: u.avatar,
          status: "PENDING",
        },
      ]);
      toast.success("دعوت ارسال شد؛ پس از پذیرش، دسترسی فعال می‌شود.");
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
      <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="نقش در پروژه" />
      <MemberSearch onPick={invite} addLabel="دعوت و افزودن" busy={busy} />
    </div>
  );
}

/** One member row: read-only until «ویرایش», then confirm or cancel the change. */
function MemberRow({
  member,
  onSave,
  onRemove,
}: {
  member: ProjectMember;
  onSave: (patch: Partial<ProjectMember>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProjectMember>(member);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const start = () => {
    setDraft(member);
    setEditing(true);
  };

  return (
    <div className="surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MemberAvatar name={member.name} avatar={member.avatar} className="size-9" />
          <span className="min-w-0">
            <span className="block truncate">{member.name || "بدون نام"}</span>
            <span className="block truncate text-[11px] font-normal text-muted-foreground" dir="ltr">
              {[member.userCode, member.username, member.phone].filter(Boolean).join(" · ")}
            </span>
          </span>
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{ACCESS_LABELS[member.access ?? "VIEW"]}</Badge>
          {member.status === "PENDING" && <Badge variant="outline">در انتظار پذیرش</Badge>}
          {!editing && (
            <Button size="icon" variant="ghost" aria-label="ویرایش عضو" onClick={start}>
              <Pencil className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            aria-label="حذف عضو"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {editing && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              value={draft.name}
              aria-label="نام عضو"
              placeholder="نام عضو"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              value={draft.role}
              aria-label="نقش عضو"
              placeholder="نقش"
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            />
            <Input
              dir="ltr"
              value={draft.phone ?? ""}
              aria-label="شماره تماس عضو"
              placeholder="شماره تماس"
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
            <Select
              value={draft.access ?? "VIEW"}
              onValueChange={(v) => setDraft({ ...draft, access: v as MemberAccess })}
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
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onSave({
                  name: draft.name,
                  role: draft.role,
                  phone: draft.phone,
                  access: draft.access,
                });
                setEditing(false);
                toast.success("تغییرات عضو ذخیره شد");
              }}
            >
              <Check className="size-4" /> تایید تغییرات
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setDraft(member);
                setEditing(false);
              }}
            >
              <X className="size-4" /> انصراف
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle>حذف عضو از پروژه؟</AlertDialogTitle>
            <AlertDialogDescription>
              «{member.name || "این عضو"}» از پروژه و از مراحل اختصاص‌یافته حذف می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onRemove}
            >
              حذف عضو
            </AlertDialogAction>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  if (!projectPermissions(project).canManageMembers) {
    return (
      <EmptyState
        title="دسترسی ندارید"
        description="مدیریت اعضا فقط برای مالک پروژه یا عضو با دسترسی مدیریت فعال است."
        action={
          <Button asChild>
            <Link to="/projects/$projectId" params={{ projectId: project.id }}>
              بازگشت به پروژه
            </Link>
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
              <MemberRow
                key={m.id}
                member={m}
                onSave={(patch) => patchMember(m.id, patch)}
                onRemove={() => {
                  setMembers(members.filter((x) => x.id !== m.id));
                  toast.success("عضو حذف شد");
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
