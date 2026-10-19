// Supabase Edge Function: remove-user
// Deploy: supabase functions deploy remove-user --no-verify-jwt
//   (--no-verify-jwt: o JWT é validado aqui dentro, via auth.getUser)
//
// Admin (admin_divid) remove outro usuário do Comitê:
//  - sempre apaga o perfil em comite_user_profiles (sem perfil => RLS nega os dados do Comitê);
//  - bane o login (auth.users) SÓ se o usuário não usa outra plataforma do projeto
//    (user_profiles / user_building_access) — o auth.users é compartilhado.
// Ban em vez de deleteUser: várias tabelas têm criado_por -> auth.users sem ON DELETE.
//
// Recusa: chamador não-admin, remover a si mesmo, remover o último admin_divid.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

// ~100 anos — o GoTrue não tem ban permanente explícito
const BAN_DURATION = "876000h";

type AuthUserInfo = {
  user_id: string;
  user_email: string | null;
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

    // 1. JWT do chamador: getUser valida assinatura/expiração no servidor de auth
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const token = authHeader.slice("Bearer ".length).trim();
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    // 2. Chamador precisa ser admin_divid
    const { data: isAdmin, error: adminErr } = await admin.rpc("is_admin_divid", { _user_id: callerId });
    if (adminErr) return json({ error: adminErr.message }, 500);
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);

    // 3. Alvo
    const body = await req.json().catch(() => null) as { userId?: string } | null;
    const userId = body?.userId;
    if (!userId) return json({ error: "userId obrigatório" }, 400);
    if (userId === callerId) return json({ error: "Você não pode remover sua própria conta" }, 400);

    const { data: infoRows, error: infoErr } = await admin.rpc("comite_auth_user_info", { p_user_id: userId });
    if (infoErr) return json({ error: infoErr.message }, 500);
    const info = (infoRows as AuthUserInfo[] | null)?.[0];
    if (!info) return json({ error: "Usuário não encontrado" }, 404);

    // 4. Nunca deixar o Comitê sem admin_divid
    if (info.comite_role === "admin_divid") {
      const { count, error: countErr } = await admin
        .from("comite_user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin_divid")
        .neq("id", userId);
      if (countErr) return json({ error: countErr.message }, 500);
      if (!count) return json({ error: "Não é possível remover o último admin_divid" }, 400);
    }

    // 5. Ban só se o login não é usado por outra plataforma. Ban antes de apagar o
    //    perfil: se falhar, nada muda.
    const banir = !info.outras_plataformas;
    if (banir) {
      const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
      if (banErr) return json({ error: banErr.message }, 500);
    }

    const { error: delErr } = await admin.from("comite_user_profiles").delete().eq("id", userId);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ success: true, banido: banir });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro desconhecido" }, 500);
  }
});
