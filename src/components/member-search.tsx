import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, UserPlus, Loader2 } from "lucide-react";
import { searchAppUsers, type FoundUser } from "@/lib/collab.functions";
import { MemberAvatar } from "./project-item";
import { toast } from "sonner";

/**
 * Search a real signed-up account (user code, username or email) and add it as a member.
 * The parent decides what "add" means (local member, or member + server invitation).
 */
export function MemberSearch({
  onPick,
  addLabel = "افزودن عضو",
  busy,
}: {
  onPick: (user: FoundUser) => void | Promise<void>;
  addLabel?: string;
  busy?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    setSearching(true);
    try {
      const found = await searchAppUsers({ data: { q } });
      setResults(found);
      if (found.length === 0) toast.error("کاربری با این شناسه، نام کاربری یا ایمیل پیدا نشد.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "جست‌وجو ناموفق بود");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="TM-… یا نام کاربری یا ایمیل"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (q.trim().length >= 3) void search();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={searching || q.trim().length < 3}
          onClick={() => void search()}
        >
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          جست‌وجو
        </Button>
      </div>
      {results.length > 0 && (
        <div className="grid gap-2">
          {results.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 p-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <MemberAvatar name={u.name || u.userCode} avatar={u.avatar} className="size-9" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {u.role ? `${u.role} | ${u.name || u.userCode}` : u.name || u.userCode}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                    {[u.userCode, u.username, u.email, u.phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  void onPick(u);
                  setResults([]);
                  setQ("");
                }}
              >
                <UserPlus className="size-4" /> {addLabel}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
