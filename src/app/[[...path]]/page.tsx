import { redirect } from "next/navigation";
import { WorkspaceApp } from "@/components/workspace/app";
import { isConfigured, isDemo } from "@/lib/config";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function WorkspacePage() {
  if (!isDemo) {
    if (!isConfigured) redirect("/login");
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }
  return <WorkspaceApp />;
}
