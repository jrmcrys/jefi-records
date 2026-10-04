"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  const linkError = params.get("error") === "link";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setMessage(
        "That email is not on the invite list, or the request failed. Check the address and try again."
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
          Sign in with your email. No password needed.
        </p>

        {linkError && (
          <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            That sign-in link expired or was already used. Request a new one below.
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
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
