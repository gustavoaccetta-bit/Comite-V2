// Fonte única de permissões por papel (menu + guard de rota).
// Espelha a RLS: tabelas de Dashboard/Fluxo de Caixa só liberam SELECT para
// admin_divid e viewer_gestor (ver migrations/2026-10-19_niveis_acesso.sql).

export type Role = "admin_divid" | "viewer_gestor" | "viewer_operacao";

export const ROLES: { value: Role; label: string }[] = [
  { value: "admin_divid", label: "Admin Divid" },
  { value: "viewer_gestor", label: "Viewer Gestor" },
  { value: "viewer_operacao", label: "Viewer Operação" },
];

/** Papel padrão no convite (menor privilégio). Sem perfil = sem acesso (ver use-auth). */
export const DEFAULT_ROLE: Role = "viewer_operacao";

/** Destino quando o papel não tem acesso à rota pedida. */
export const FALLBACK_ROUTE = "/carteiras";

const ROUTES_BY_ROLE: Record<Role, readonly string[]> = {
  admin_divid: ["/dashboard", "/comite", "/carteiras", "/fluxo-de-caixa", "/uploads", "/fechar-mes", "/admin/usuarios"],
  viewer_gestor: ["/dashboard", "/comite", "/carteiras", "/fluxo-de-caixa"],
  viewer_operacao: ["/comite", "/carteiras"],
};

export function isRole(value: unknown): value is Role {
  return ROLES.some(r => r.value === value);
}

export function canAccess(role: Role | null, path: string): boolean {
  if (!role) return false;
  return ROUTES_BY_ROLE[role].some(r => path === r || path.startsWith(`${r}/`));
}
