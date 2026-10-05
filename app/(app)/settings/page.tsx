import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/SettingsForm";
import { parseAppearance } from "@/lib/theme";
import { parsePrefs } from "@/lib/google";
import { PROFILE_COLUMNS, type Profile } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select(`${PROFILE_COLUMNS},appearance,prefs`)
    .eq("id", user.id)
    .maybeSingle();

  const me: Profile = data
    ? {
        id: data.id,
        name: data.name,
        email: data.email,
        avatar_url: data.avatar_url,
      }
    : {
        id: user.id,
        name: user.email ?? "You",
        email: user.email ?? "",
        avatar_url: null,
      };

  const { data: others } = await supabase
    .from("profiles")
    .select("name")
    .neq("id", user.id)
    .limit(1);
  const otherName = (others?.[0]?.name as string | undefined) ?? "the other person";

  return (
    <SettingsForm
      me={me}
      otherName={otherName}
      appearance={parseAppearance(data?.appearance)}
      prefs={parsePrefs(data?.prefs)}
    />
  );
}
