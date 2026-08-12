// Supabase Edge Function: invite-user
// Deploy: supabase functions deploy invite-user --no-verify-jwt
// Secrets necessários (já existem por padrão no Supabase):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Chamada (do frontend, autenticado):
//   supabase.functions.invoke('invite-user', { body: { email, role } })

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);

    // Client com JWT do usuário (para descobrir quem está chamando)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    // Admin client (bypass RLS) para verificar role e fazer admin actions
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: profile, error: profErr } = await admin
      .from("comite_user_profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profErr) return json({ error: profErr.message }, 500);
    if (profile?.role !== "admin_divid") return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as { email?: string; role?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    const role = body?.role;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido" }, 400);
    if (role !== "admin_divid" && role !== "viewer") return json({ error: "Role inválida" }, 400);

    // Upsert em comite_invites
    const { error: invErr } = await admin
      .from("comite_invites")
      .upsert({ email, role }, { onConflict: "email" });
    if (invErr) return json({ error: invErr.message }, 500);

    // Envia convite por e-mail
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteErr) {
      // Se o usuário já existe, ainda consideramos sucesso parcial — o registro fica em comite_invites
      const msg = inviteErr.message ?? "";
      if (!/already/i.test(msg)) return json({ error: msg }, 500);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro desconhecido" }, 500);
  }
});
