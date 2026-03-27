import { redirect } from "next/navigation";
import DashboardLayout from "../dashboard/layout";
import { requireAuth } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, supabase } = await requireAuth();

  const { data: profile } = await supabase.schema('member').from('members').select('is_admin').eq('supabase_auth_user_id', userId).single();
  const isAdmin = profile?.is_admin === true;

  if (!isAdmin) {
    return redirect("/dashboard");
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
