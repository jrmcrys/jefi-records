import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/SettingsForm";
import { PROFILE_COLUMNS, type Profile } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  const me: Profile = data ?? {
    id: user.id,
    name: user.email ?? "You",
    email: user.email ?? "",
    avatar_url: null,
  };

  return <SettingsForm me={me} />;
}
