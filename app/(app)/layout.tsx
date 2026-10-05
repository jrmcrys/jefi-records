import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { PersonalProvider } from "@/components/PersonalProvider";
import { parsePersonal } from "@/lib/personal";
import { parseAppearance, themeCss } from "@/lib/theme";
import {
  PROFILE_COLUMNS,
  PROJECT_COLUMNS,
  type Profile,
  type Project,
} from "@/lib/types";

/* Applies this device's saved sidebar width before the first paint. */
const SIDEBAR_SCRIPT = `try{var w=+localStorage.getItem("jefi:sidebar-width");var r=document.documentElement;if(w>=200&&w<=420)r.style.setProperty("--sb-w",w+"px");if(localStorage.getItem("jefi:sidebar-collapsed")==="1")r.setAttribute("data-sb-collapsed","")}catch(e){}`;

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

  const [
    { data: profile },
    { data: projects },
    { data: prefs },
    { data: settings },
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select(`${PROFILE_COLUMNS},appearance,personal`)
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("projects")
        .select(PROJECT_COLUMNS)
        .order("position")
        .order("created_at"),
      supabase.from("project_prefs").select("project_id,position"),
      supabase.from("app_settings").select("logo_url").eq("id", 1).maybeSingle(),
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
      <script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCRIPT }} />
      <PersonalProvider
        me={user.id}
        initial={parsePersonal(profile?.personal)}
        initialBranding={{ logoUrl: (settings?.logo_url as string | null) ?? null }}
      >
        <AppShell me={me} projects={sorted}>
          {children}
        </AppShell>
      </PersonalProvider>
    </>
  );
}
