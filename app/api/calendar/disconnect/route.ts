import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/gcal/api";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: conn } = await supabase
    .from("google_connections")
    .select("refresh_token_enc")
    .eq("user_id", user.id)
    .maybeSingle();
  if (conn) await revokeToken(conn.refresh_token_enc as string);

  await supabase.from("calendar_prefs").delete().eq("user_id", user.id);
  const { error } = await supabase
    .from("google_connections")
    .delete()
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
