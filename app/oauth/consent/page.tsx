import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/* Supabase Auth sends people here when an app such as Claude asks to connect.
   Set the Authorization Path to /oauth/consent in the Supabase dashboard. */

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  email: "See your email address",
  profile: "See your name and photo",
  phone: "See your phone number",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;

  if (!authorizationId) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Nothing to approve</h1>
        <p className="mt-2 text-sm opacity-70">
          This page opens when Claude asks to connect to Jefi Records. Start
          the connection from Claude and you will land here.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !data) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">This request has expired</h1>
        <p className="mt-2 text-sm opacity-70">
          Go back to Claude and start the connection again.
        </p>
        {error && (
          <p className="mt-3 text-xs opacity-50">{error.message}</p>
        )}
      </Shell>
    );
  }

  /* Already approved earlier: Supabase hands back the redirect directly. */
  if (!("authorization_id" in data)) {
    redirect(data.redirect_url);
  }

  const scopes = data.scope.split(" ").filter(Boolean);
  const host = (() => {
    try {
      return new URL(data.redirect_uri).host;
    } catch {
      return data.redirect_uri;
    }
  })();

  return (
    <Shell>
      <h1 className="text-xl font-semibold">
        Connect {data.client.name || "this app"} to Jefi Records?
      </h1>
      <p className="mt-2 text-sm opacity-80">
        You are signed in as <strong>{data.user.email}</strong>. If you
        approve, {data.client.name || "the app"} can read and change tasks,
        comments, tags and notifications as you. It sees only what you can see
        in Jefi Records, including your private projects. You can disconnect it
        later from Claude.
      </p>

      <dl className="mt-5 space-y-3 rounded-lg border border-current/15 p-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-60">App</dt>
          <dd className="mt-0.5">{data.client.name || "Unnamed app"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-60">
            Returns to
          </dt>
          <dd className="mt-0.5 break-all">{host}</dd>
        </div>
        {scopes.length > 0 && (
          <div>
            <dt className="text-xs uppercase tracking-wide opacity-60">
              Sign-in details it receives
            </dt>
            <dd className="mt-0.5">
              {scopes.map((s) => SCOPE_LABELS[s] ?? s).join(", ")}
            </dd>
          </div>
        )}
      </dl>

      <form
        action="/api/oauth/decision"
        method="post"
        className="mt-6 flex flex-wrap gap-3"
      >
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <button
          type="submit"
          name="decision"
          value="approve"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="rounded-md border border-current/30 px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
