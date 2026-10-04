import { createClient } from "@/lib/supabase/server";
import ProjectView from "@/components/ProjectView";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <ProjectView key={projectId} projectId={projectId} meId={user?.id ?? ""} />
  );
}
