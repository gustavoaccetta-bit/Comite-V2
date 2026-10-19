import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Upload, Lock, Users, LogOut, Wallet, LineChart, LayoutDashboard } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { canAccess, type Role } from "@/lib/permissions";

export function AppSidebar({ role, email }: { role: Role | null; email?: string | null }) {
  const path = useRouterState({ select: r => r.location.pathname });

  const groups = [
    {
      label: "Comitê",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Comitê", url: "/comite", icon: BarChart3 },
        { title: "Carteiras", url: "/carteiras", icon: Wallet },
      ],
    },
    {
      label: "Demonstrações",
      items: [
        { title: "Fluxo de Caixa", url: "/fluxo-de-caixa", icon: LineChart },
      ],
    },
    {
      label: "Administração",
      items: [
        { title: "Uploads", url: "/uploads", icon: Upload },
        { title: "Fechar Mês", url: "/fechar-mes", icon: Lock },
        { title: "Usuários", url: "/admin/usuarios", icon: Users },
      ],
    },
  ]
    .map(g => ({ ...g, items: g.items.filter(i => canAccess(role, i.url)) }))
    .filter(g => g.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-3">
          <img src="/marca_Divid-02.png" alt="Divid" className="h-8 w-auto" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map(group => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="uppercase text-xs text-muted-foreground tracking-wide">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={path === item.url}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 text-xs text-muted-foreground truncate">{email}</div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => supabase.auth.signOut()}>
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
