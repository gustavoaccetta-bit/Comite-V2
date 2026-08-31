import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Upload, Lock, Users, LogOut, Wallet, LineChart, LayoutDashboard } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/hooks/use-auth";

export function AppSidebar({ role, email }: { role: Role; email?: string | null }) {
  const path = useRouterState({ select: r => r.location.pathname });
  const isAdmin = role === "admin_divid";

  const groups = [
    {
      label: "Comitê",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, show: true },
        { title: "Comitê", url: "/comite", icon: BarChart3, show: true },
        { title: "Carteiras", url: "/carteiras", icon: Wallet, show: true },
      ],
    },
    {
      label: "Demonstrações",
      items: [
        { title: "Fluxo de Caixa", url: "/fluxo-de-caixa", icon: LineChart, show: true },
      ],
    },
    {
      label: "Administração",
      items: [
        { title: "Uploads", url: "/uploads", icon: Upload, show: isAdmin },
        { title: "Fechar Mês", url: "/fechar-mes", icon: Lock, show: isAdmin },
        { title: "Usuários", url: "/admin/usuarios", icon: Users, show: isAdmin },
      ],
    },
  ]
    .map(g => ({ ...g, items: g.items.filter(i => i.show) }))
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
