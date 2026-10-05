import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Home from "@/components/Home";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: others }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("name").neq("id", user.id).limit(1),
    supabase
      .from("projects")
      .select("id,name,image_url,emoji")
      .eq("archived", false)
      .order("position")
      .order("created_at"),
  ]);

  return (
    <Home
      meId={user.id}
      myName={(me?.name as string | undefined) ?? user.email ?? "there"}
      otherName={(others?.[0]?.name as string | undefined) ?? "my partner"}
      projects={(projects ?? []) as { id: string; name: string; image_url: string | null; emoji: string | null }[]}
    />
  );
}
