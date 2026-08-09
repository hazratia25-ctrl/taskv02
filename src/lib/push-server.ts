import { buildPushPayload } from "@block65/webcrypto-web-push";

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** Sends a web-push notification to every device of a single user. Never throws. */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<number> {
  const vapid = {
    subject: process.env["VAPID_SUBJECT"] ?? "mailto:admin@example.com",
    publicKey: process.env["VAPID_PUBLIC_KEY"] ?? "",
    privateKey: process.env["VAPID_PRIVATE_KEY"] ?? "",
  };
  if (!vapid.publicKey || !vapid.privateKey) return 0;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  let sent = 0;
  const stale: string[] = [];

  for (const sub of (subs ?? []) as Sub[]) {
    try {
      const body = await buildPushPayload(
        {
          data: JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url ?? "/notifications",
            tag: payload.tag ?? "collab",
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
      const res = await fetch(sub.endpoint, body as unknown as RequestInit);
      if (res.status === 404 || res.status === 410) stale.push(sub.id);
      else if (res.ok) sent += 1;
    } catch {
      /* ignore individual device failures */
    }
  }

  if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
  return sent;
}
