'use client'

import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from "@/components/ui/sidebar"
import { Icons } from "@/components/icons"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronRight, Users2 } from "lucide-react"
import { Tables } from "@/lib/types"
import { useState } from "react"

interface DashboardNavProps {
  isAdmin: boolean;
  teams: Tables<'teams'>[];
  userTeamId?: number | null;
}

export default function DashboardNav({ isAdmin, teams, userTeamId }: DashboardNavProps) {
    const pathname = usePathname()
    const [isTeamsOpen, setIsTeamsOpen] = useState(pathname.startsWith('/dashboard/teams'));
    
    const visibleTeams = isAdmin ? teams : teams.filter(team => team.id === userTeamId);

    return (
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
              <Link href="/dashboard"><Icons.Home /> ダッシュボード</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          {visibleTeams.length > 0 && (
            <Collapsible open={isTeamsOpen} onOpenChange={setIsTeamsOpen}>
              <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                      <SidebarMenuButton>
                          <Users2 />
                          <span>班別状況</span>
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
                      </SidebarMenuButton>
                  </CollapsibleTrigger>
              </SidebarMenuItem>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {visibleTeams.map(team => (
                    <SidebarMenuSubItem key={team.id}>
                      <SidebarMenuSubButton asChild isActive={pathname === `/dashboard/teams/${team.id}`}>
                        <Link href={`/dashboard/teams/${team.id}`}>{team.name}</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          )}

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
