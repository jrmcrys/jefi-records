import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Inbox from "@/components/Inbox";

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <Inbox meId={user.id} />;
}
