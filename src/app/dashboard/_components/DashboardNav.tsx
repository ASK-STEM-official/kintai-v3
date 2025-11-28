'use client'

import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"
import { Icons } from "@/components/icons"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3 } from "lucide-react"

interface DashboardNavProps {
  isAdmin: boolean;
}

export default function DashboardNav({ isAdmin }: DashboardNavProps) {
    const pathname = usePathname()

    return (
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
              <Link href="/dashboard"><Icons.Home /> マイダッシュボード</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/dashboard/overall'}>
              <Link href="/dashboard/overall"><BarChart3 /> 全体ダッシュボード</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {isAdmin && (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/admin')}>
                    <Link href="/admin"><Icons.Settings /> 管理者設定</Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
    )
}