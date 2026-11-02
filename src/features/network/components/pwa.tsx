"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const DISMISS_KEY = "network-install-dismissed";

/**
 * Registers the service worker (scope /n/<slug>/) and offers "Install the app":
 * a real prompt on Android/desktop Chrome, step-by-step text on iPhone (Safari
 * has no prompt). Hidden once installed or dismissed.
 */
export function NetworkPwa({ slug, name }: { slug: string; name: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/network-sw.js", { scope: `/n/${slug}/` }).catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // Defer the state updates out of the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      setIos(isIos);
      setHidden(standalone || dismissed);
    });
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [slug]);

  if (hidden || (!prompt && !ios)) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };
  return (
    <div
      className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm"
      data-testid="install-hint"
    >
      <div className="flex-1">
        <p className="font-semibold">Put {name} on your home screen</p>
        {prompt ? (
          <p className="text-muted-foreground">One tap — it opens like an app.</p>
        ) : (
          <p className="text-muted-foreground">
            In Safari, tap <Share className="inline size-4 align-text-bottom" aria-label="Share" />{" "}
            then <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
      {prompt && (
        <Button
          size="sm"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice.catch(() => null);
            setPrompt(null);
            dismiss();
          }}
        >
          <Download aria-hidden /> Install
        </Button>
      )}
      <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={dismiss}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
