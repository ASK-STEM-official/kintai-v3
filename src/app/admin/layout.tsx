import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardLayout from "../dashboard/layout";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  const { data: profile } = await supabase.schema('member').from('members').select('is_admin').eq('supabase_auth_user_id', user.id).single();
  const isAdmin = profile?.is_admin === true;

  if (!isAdmin) {
    return redirect("/dashboard");
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
