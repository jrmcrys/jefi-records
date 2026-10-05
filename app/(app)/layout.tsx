import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { parseAppearance, themeCss } from "@/lib/theme";
import {
  PROFILE_COLUMNS,
  PROJECT_COLUMNS,
  type Profile,
  type Project,
} from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: projects }, { data: prefs }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(`${PROFILE_COLUMNS},appearance`)
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("projects")
        .select(PROJECT_COLUMNS)
        .order("position")
        .order("created_at"),
      supabase.from("project_prefs").select("project_id,position"),
    ]);

  const me: Profile = profile
    ? {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatar_url: profile.avatar_url,
      }
    : {
        id: user.id,
        name: user.email ?? "You",
        email: user.email ?? "",
        avatar_url: null,
      };
  const css = themeCss(parseAppearance(profile?.appearance));

  const order = new Map<string, number>(
    (prefs ?? []).map((p) => [p.project_id as string, p.position as number])
  );
  const sorted = [...((projects ?? []) as Project[])].sort(
    (a, b) =>
      (order.get(a.id) ?? a.position) - (order.get(b.id) ?? b.position)
  );

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <AppShell me={me} projects={sorted}>
        {children}
      </AppShell>
    </>
  );
}
