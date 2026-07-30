import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/push/key")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null }),
    },
  },
});
