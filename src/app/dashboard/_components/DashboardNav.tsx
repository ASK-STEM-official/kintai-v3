'use client'

import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"
import { Icons } from "@/components/icons"
import Link from "next/link"
import { usePathname } from "next/navigation"

export default function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
    const pathname = usePathname()

    return (
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
              <Link href="/dashboard"><Icons.Home /> ダッシュボード</Link>
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
