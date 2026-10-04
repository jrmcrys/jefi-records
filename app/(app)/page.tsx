import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const [{ data: projects }, { data: prefs }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,position")
      .eq("archived", false)
      .order("position")
      .order("created_at"),
    supabase.from("project_prefs").select("project_id,position"),
  ]);

  const order = new Map<string, number>(
    (prefs ?? []).map((p) => [p.project_id as string, p.position as number])
  );
  const first = [...(projects ?? [])].sort(
    (a, b) =>
      (order.get(a.id) ?? a.position) - (order.get(b.id) ?? b.position)
  )[0];

  if (first) redirect(`/p/${first.id}`);

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
      <p className="mt-2 text-sm opacity-70">
        Create your first project to get started. Use the New project box in
        the sidebar (on a phone, tap the menu button at the top left first).
      </p>
    </div>
  );
}
