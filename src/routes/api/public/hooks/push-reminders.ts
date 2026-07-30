import { createFileRoute } from "@tanstack/react-router";
import { buildPushPayload } from "@block65/webcrypto-web-push";

type Sub = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type TaskRow = {
  user_id: string;
  title: string;
  due_date: string;
};

function faDate(iso: string) {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeZone: "Asia/Tehran",
  }).format(new Date(iso));
}

export const Route = createFileRoute("/api/public/hooks/push-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const vapid = {
          subject: process.env.VAPID_SUBJECT!,
          publicKey: process.env.VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        };
        if (!vapid.publicKey || !vapid.privateKey) {
          return new Response("VAPID keys not configured", { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const horizon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
        const { data: tasks } = await supabaseAdmin
          .from("tasks")
          .select("user_id, title, due_date")
          .neq("status", "COMPLETED")
          .not("due_date", "is", null)
          .lte("due_date", horizon);

        const byUser = new Map<string, TaskRow[]>();
        for (const t of (tasks ?? []) as TaskRow[]) {
          const list = byUser.get(t.user_id) ?? [];
          list.push(t);
          byUser.set(t.user_id, list);
        }
        if (byUser.size === 0) return Response.json({ sent: 0 });

        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, user_id, endpoint, p256dh, auth")
          .in("user_id", [...byUser.keys()]);

        let sent = 0;
        const stale: string[] = [];

        for (const sub of (subs ?? []) as Sub[]) {
          const list = byUser.get(sub.user_id);
          if (!list?.length) continue;
          const first = list[0];
          const body =
            list.length > 1
              ? `${first.title} (${faDate(first.due_date)}) و ${list.length - 1} وظیفه دیگر`
              : `${first.title} — مهلت: ${faDate(first.due_date)}`;

          try {
            const payload = await buildPushPayload(
              {
                data: JSON.stringify({
                  title: "یادآوری مهلت وظایف",
                  body,
                  url: "/notifications",
                  tag: "task-reminder",
                }),
                options: { ttl: 60 * 60 * 12 },
              },
              {
                endpoint: sub.endpoint,
                expirationTime: null,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              vapid,
            );
            const res = await fetch(sub.endpoint, payload as unknown as RequestInit);
            if (res.status === 404 || res.status === 410) stale.push(sub.id);
            else if (res.ok) sent += 1;
          } catch {
            /* ignore individual failures */
          }
        }

        if (stale.length) {
          await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
        }

        return Response.json({ sent, removed: stale.length });
      },
    },
  },
});
