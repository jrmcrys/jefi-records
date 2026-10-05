"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NEXT_COOKIE, safeNext } from "@/lib/next-path";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  const linkError = params.get("error") === "link";
  const oauthError = params.get("error") === "oauth";
  const oauthDetail = params.get("message");
  const [googleBusy, setGoogleBusy] = useState(false);

  /* Remember where the person was headed (for example the Claude connection
     approval page) so they land there after signing in, even through Google
     or an emailed link. */
  function rememberDestination() {
    const next = safeNext(params.get("next"));
    if (next !== "/") {
      document.cookie = `${NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=900; samesite=lax`;
    }
  }

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setMessage("");
    rememberDestination();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline" },
      },
    });
    if (error) {
      setGoogleBusy(false);
      setStatus("error");
      setMessage(`Google sign-in did not start: ${error.message}`);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    rememberDestination();

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      const text = error.message.toLowerCase();
      setMessage(
        text.includes("rate limit") || error.status === 429
          ? "Too many sign-in emails were requested. Wait a few minutes and try again."
          : "That email is not on the invite list, or the request failed. Check the address and try again."
      );
      return;
    }

    setStatus("sent");
    setMessage("Check your inbox for a sign-in link. It can take a minute to arrive.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Jefi Records</h1>
        <p className="mt-1 text-sm opacity-70">
          Sign in with Google, or ask for an email link. No password needed.
        </p>

        {linkError && (
          <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            That sign-in link expired or was already used. Request a new one below.
          </p>
        )}

        {oauthError && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
          >
            Google sign-in did not finish. The account may not be on the invite
            list, or Google sign-in may not be set up yet. You can still use
            the email link below.
            {oauthDetail && (
              <span className="mt-1 block text-xs opacity-70">{oauthDetail}</span>
            )}
          </p>
        )}

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={googleBusy}
          className="mt-6 w-full rounded-md border border-current/30 px-3 py-2 text-sm font-medium hover:bg-current/5 disabled:opacity-60"
        >
          {googleBusy ? "Opening Google..." : "Continue with Google"}
        </button>

        <div className="my-5 flex items-center gap-3 text-xs opacity-60">
          <span className="h-px flex-1 bg-current/20" />
          <span>or</span>
          <span className="h-px flex-1 bg-current/20" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-base outline-none focus:border-current/60"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
          >
            {status === "sending" ? "Sending..." : "Email me a sign-in link"}
          </button>
        </form>

        {message && (
          <p
            role="status"
            className={`mt-4 text-sm ${status === "error" ? "text-red-500" : "opacity-80"}`}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
