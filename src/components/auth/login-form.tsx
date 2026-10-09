"use client";

import { Loader2, Mail } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  googleFormAction,
  magicLinkFormAction,
  passwordFormAction,
  type LoginFormState,
} from "@/server/actions/auth";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.2Z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.7 14c-.2-.7-.4-1.4-.4-2s.1-1.4.4-2V7.1H2a11 11 0 0 0 0 9.8L5.7 14Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10c.9-2.6 3.4-4.6 6.3-4.6Z"
      />
    </svg>
  );
}

const IDLE: LoginFormState = { status: "idle" };

export function LoginForm({
  next,
  googleEnabled,
  passwordEnabled,
  initialError,
  emailHint,
}: {
  next: string;
  googleEnabled: boolean;
  passwordEnabled: boolean;
  initialError?: string | null;
  emailHint?: string | null;
}) {
  const [magic, magicAction, magicPending] = useActionState(magicLinkFormAction, IDLE);
  const [pw, pwAction, pwPending] = useActionState(passwordFormAction, IDLE);
  const [google, googleAction, googlePending] = useActionState(googleFormAction, IDLE);
  const [dismissedSent, setDismissedSent] = useState(false);

  const error =
    (magic.status === "error" && magic.message) ||
    (pw.status === "error" && pw.message) ||
    (google.status === "error" && google.message) ||
    initialError ||
    null;
  const pending = magicPending || pwPending;
  const lastEmail = pw.email ?? magic.email ?? "";

  if (magic.status === "sent" && !dismissedSent) {
    return (
      <div role="status" className="space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Mail className="size-5" aria-hidden />
        </div>
        <h2 className="text-xl font-bold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to <strong className="text-foreground">{magic.email}</strong>. Open
          it on this device to finish signing in.
        </p>
        <Button variant="link" onClick={() => setDismissedSent(true)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      <form action={passwordEnabled ? pwAction : magicAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={lastEmail}
            placeholder={emailHint ?? "you@company.com"}
          />
        </div>
        {passwordEnabled && (
          <div className="space-y-1.5">
            <Label htmlFor="password">Password (test accounts only)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        )}
        <Button type="submit" className="w-full" disabled={pending} data-testid="login-submit">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {passwordEnabled ? "Sign in with password" : "Email me a sign-in link"}
        </Button>
        {passwordEnabled && (
          <Button
            type="submit"
            formAction={magicAction}
            formNoValidate
            variant="outline"
            className="w-full"
            disabled={pending}
          >
            Email me a sign-in link instead
          </Button>
        )}
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={googleAction} className="space-y-2">
        <input type="hidden" name="next" value={next} />
        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={!googleEnabled || googlePending}
        >
          {googlePending ? <Loader2 className="animate-spin" aria-hidden /> : <GoogleMark />}
          Continue with Google
        </Button>
        {!googleEnabled && (
          <p className="text-center text-xs text-muted-foreground">
            Google sign-in is <strong>not connected</strong> yet — use the email link.
          </p>
        )}
      </form>
    </div>
  );
}
