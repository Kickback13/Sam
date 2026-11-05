"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { removePushSubscription, savePushSubscription } from "../server/actions";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * "Notify me about new posts and events" on this device. Shown only when push is
 * connected (the VAPID public key is set) and the browser supports it. On iPhone it
 * works once the app is installed to the home screen (Apple's rule).
 */
export function PushToggle({
  workspaceId,
  slug,
  publicKey,
}: {
  workspaceId: string;
  slug: string;
  publicKey: string;
}) {
  const [state, setState] = useState<"unsupported" | "loading" | "on" | "off" | "blocked">(
    "loading",
  );
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration(`/n/${slug}/`);
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      setState(Notification.permission === "denied" ? "blocked" : sub ? "on" : "off");
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === "unsupported" || state === "loading") return null;
  if (state === "blocked")
    return (
      <p className="text-xs text-muted-foreground" data-testid="push-blocked">
        Notifications are blocked for this site in your browser settings.
      </p>
    );

  const turnOn = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        const reg =
          (await navigator.serviceWorker.getRegistration(`/n/${slug}/`)) ??
          (await navigator.serviceWorker.register("/network-sw.js", { scope: `/n/${slug}/` }));
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        });
        const r = await savePushSubscription({ workspaceId, subscription: sub.toJSON() });
        if (!r.ok) {
          await sub.unsubscribe().catch(() => {});
          toast.error(r.error);
          return;
        }
        setState("on");
        toast.success("Notifications on for this device");
      } catch {
        toast.error("Couldn't turn on notifications on this device.");
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration(`/n/${slug}/`);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription({ workspaceId, endpoint: sub.endpoint });
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
      toast.success("Notifications off for this device");
    });

  return state === "on" ? (
    <Button size="sm" variant="outline" disabled={pending} onClick={turnOff} data-testid="push-off">
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <BellOff aria-hidden />} Turn
      off notifications
    </Button>
  ) : (
    <Button size="sm" variant="outline" disabled={pending} onClick={turnOn} data-testid="push-on">
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Bell aria-hidden />} Notify me
      about new posts and events
    </Button>
  );
}
