'use client'

import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubButton } from "@/components/ui/sidebar"
import { Icons } from "@/components/icons"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronRight, Users2, BarChart3 } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"

interface TeamWithStatus {
    id: number | string;
    name: string;
    current: number;
    total: number;
}
interface DashboardNavProps {
  isAdmin: boolean;
  teams: TeamWithStatus[];
  userTeams: { team_id: string }[];
}

export default function DashboardNav({ isAdmin, teams, userTeams }: DashboardNavProps) {
    const pathname = usePathname()
    const [isTeamsOpen, setIsTeamsOpen] = useState(pathname.startsWith('/dashboard/teams'));
    
    const userTeamIds = userTeams.map(t => Number(t.team_id));
    const visibleTeams = isAdmin ? teams : teams.filter(team => userTeamIds.includes(Number(team.id)));

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
                    <SidebarMenuItem key={team.id}>
                      <SidebarMenuSubButton asChild isActive={pathname === `/dashboard/teams/${team.id}`}>
                        <Link href={`/dashboard/teams/${team.id}`} className="flex justify-between items-center w-full">
                          <span>{team.name}</span>
                          <Badge variant={team.current > 0 ? "default" : "secondary"} className="h-5">{team.current}/{team.total}</Badge>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuItem>
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