// Supabase Edge Function: reset-password
// Admin (admin_divid) redefine a senha de outro usuário.

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

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: profile, error: profErr } = await admin
      .from("comite_user_profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profErr) return json({ error: profErr.message }, 500);
    if (profile?.role !== "admin_divid") return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as { userId?: string; password?: string } | null;
    const userId = body?.userId;
    const password = body?.password;
    if (!userId) return json({ error: "userId obrigatório" }, 400);
    if (!password || password.length < 6) return json({ error: "Senha deve ter ao menos 6 caracteres" }, 400);
    if (userId === userData.user.id) return json({ error: "Use as configurações de perfil para alterar sua própria senha" }, 400);

    const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro desconhecido" }, 500);
  }
});
