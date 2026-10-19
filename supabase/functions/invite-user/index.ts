// Supabase Edge Function: invite-user
// Deploy: supabase functions deploy invite-user --no-verify-jwt
//   (--no-verify-jwt: o JWT é validado aqui dentro, via auth.getUser)
// Secrets necessários (já existem por padrão no Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Chamada (do frontend, autenticado):
//   POST /functions/v1/invite-user { email, role }
//
// - E-mail sem login: grava convite pendente (usado = false) e envia o convite por
//   e-mail; o trigger handle_new_user_comite cria o perfil com o papel do convite.
// - E-mail com login (ex.: removido antes, ou usuário de outra plataforma): cria o
//   perfil do Comitê direto com o papel do convite, remove o ban se fomos nós que
//   banimos (login sem outra plataforma) e grava o convite como usado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Manter em sincronia com src/lib/permissions.ts e o CHECK de comite_invites.role
const ROLES = ["admin_divid", "viewer_gestor", "viewer_operacao"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type AuthUserInfo = {
  user_id: string;
  user_email: string | null;
  user_nome: string | null;
  banned_until: string | null;
  comite_role: string | null;
  outras_plataformas: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // JWT do chamador: getUser valida assinatura/expiração no servidor de auth
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const token = authHeader.slice("Bearer ".length).trim();
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: adminErr } = await admin.rpc("is_admin_divid", { _user_id: userData.user.id });
    if (adminErr) return json({ error: adminErr.message }, 500);
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as { email?: string; role?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    const role = body?.role;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido" }, 400);
    if (!role || !ROLES.includes(role)) return json({ error: "Role inválida" }, 400);

    const { data: infoRows, error: infoErr } = await admin.rpc("comite_auth_user_info", { p_email: email });
    if (infoErr) return json({ error: infoErr.message }, 500);
    const existente = (infoRows as AuthUserInfo[] | null)?.[0];
    const convidadoEm = new Date().toISOString();

    // ---- E-mail sem login: convite pendente + e-mail ----
    if (!existente) {
      const { error: invErr } = await admin
        .from("comite_invites")
        .upsert({ email, role, usado: false, convidado_em: convidadoEm }, { onConflict: "email" });
      if (invErr) return json({ error: invErr.message }, 500);

      const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
      if (inviteErr) return json({ error: inviteErr.message }, 500);
      return json({ success: true });
    }

    // ---- E-mail com login ----
    const banido = !!existente.banned_until && new Date(existente.banned_until) > new Date();
    if (banido && existente.outras_plataformas) {
      // Não fomos nós (remove-user só bane quem não usa outra plataforma): não desbanir aqui
      return json({ error: "Login bloqueado e usado por outra plataforma — desbloqueio precisa ser manual" }, 409);
    }
    if (existente.comite_role && !banido) {
      return json({ error: `Usuário já tem acesso ao Comitê como ${existente.comite_role}. Altere o papel na lista.` }, 409);
    }

    // Perfil antes do desbanimento: se o unban falhar, o usuário só continua bloqueado
    const { error: profErr } = await admin
      .from("comite_user_profiles")
      .upsert({ id: existente.user_id, nome: existente.user_nome ?? email, role }, { onConflict: "id" });
    if (profErr) return json({ error: profErr.message }, 500);

    if (banido) {
      const { error: unbanErr } = await admin.auth.admin.updateUserById(existente.user_id, { ban_duration: "none" });
      if (unbanErr) return json({ error: unbanErr.message }, 500);
    }

    const { error: invErr } = await admin
      .from("comite_invites")
      .upsert({ email, role, usado: true, convidado_em: convidadoEm }, { onConflict: "email" });
    if (invErr) return json({ error: invErr.message }, 500);

    return json({ success: true, existente: true, desbanido: banido });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro desconhecido" }, 500);
  }
});
