import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { canAccess, FALLBACK_ROUTE } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, role, loading, noAccess } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: r => r.location.pathname });
  const allowed = canAccess(role, path);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    // role === null: perfil ainda carregando (ex.: logo após o login) — espera antes de decidir
    else if (role && !allowed) navigate({ to: FALLBACK_ROUTE, replace: true });
  }, [loading, user, role, allowed, navigate]);

  if (!loading && user && noAccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">
          Seu usuário ({user.email}) não tem acesso ao Comitê. Fale com um administrador.
        </p>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sair</Button>
      </div>
    );
  }

  if (loading || !user || !role || !allowed) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar role={role} email={user.email} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b px-2 no-print">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
