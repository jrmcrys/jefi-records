import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const displayName = profile?.name ?? user?.email ?? "there";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Jefi Records</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-10">
        <p className="text-lg">Hi, {displayName}.</p>
        <p className="mt-2 text-sm opacity-70">
          You are signed in as {user?.email}. The foundation is live: login,
          database, and secure access for two people. Projects and tasks arrive
          in phase 2.
        </p>
      </section>
    </main>
  );
}
