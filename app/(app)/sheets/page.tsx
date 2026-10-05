import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LinksPage from "@/components/LinksPage";
import { parsePrefs } from "@/lib/google";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("prefs")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <LinksPage
      kind="sheet"
      meId={user.id}
      linkOpen={parsePrefs(data?.prefs).linkOpen}
    />
  );
}
