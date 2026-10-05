import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MyTasks from "@/components/MyTasks";

export default async function MyTasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <MyTasks meId={user.id} />;
}
