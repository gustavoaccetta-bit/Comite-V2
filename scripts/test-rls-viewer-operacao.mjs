// Teste de RLS para o papel viewer_operacao (rodar DEPOIS da migration 2026-10-19_niveis_acesso.sql).
//
// Uso (PowerShell):
//   $env:TEST_OP_EMAIL = "..."; $env:TEST_OP_PASSWORD = "..."; node scripts/test-rls-viewer-operacao.mjs
//
// Loga como o usuário de teste via supabase-js (anon key, mesmo caminho do frontend) e verifica:
//  - o papel é viewer_operacao;
//  - tabelas/views de Dashboard e Fluxo de Caixa voltam vazias ou negadas;
//  - tabelas de Carteiras e Comitê continuam legíveis;
//  - escrita é negada e não há auto-promoção de papel.
// Sai com código 1 se qualquer verificação falhar.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://nivmrhetdujvmpnvxufb.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_tmGSk7SAMdo6RN-QvxcFSQ_IEMxa70q";

const RESTRITAS = [
  "fc_lancamentos", "fc_saldo_inicial", "ai_analises",
  "v_fc_consolidado", "v_fc_receitas", "v_fc_centros_custo", "v_fc_carteiras", "v_fc_extras",
  "v_fc_mensal", "v_fc_mensal_display", "v_fc_base", "v_lancamentos_classificados",
  "de_para", "lancamentos", "contas_bancarias",
];
const PERMITIDAS = [
  "carteiras_recebimentos", "carteiras_pagamentos",
  "comite_categorias", "comite_orcamento", "comite_realizado", "comite_fechamento",
  "comite_responsaveis", "comite_comentarios", "comite_pareceres", "comite_extratos",
];
// Linha de teste num mês impossível, para nunca colidir com dado real
const MES_TESTE = "1900-01-01";

const email = process.env.TEST_OP_EMAIL;
const password = process.env.TEST_OP_PASSWORD;
if (!email || !password) {
  console.error("Defina TEST_OP_EMAIL e TEST_OP_PASSWORD.");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (msg) => console.log(`  OK    ${msg}`);
const falha = (msg) => { falhas++; console.log(`  FALHA ${msg}`); };

const { data: auth, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
if (loginErr) {
  console.error(`Login falhou: ${loginErr.message}`);
  process.exit(2);
}
const uid = auth.user.id;

console.log("\nPapel");
const { data: perfil, error: perfilErr } = await supabase
  .from("comite_user_profiles").select("role").eq("id", uid).maybeSingle();
if (perfilErr) falha(`erro lendo perfil: ${perfilErr.message}`);
else if (perfil?.role === "viewer_operacao") ok("role = viewer_operacao");
else falha(`role = ${perfil?.role ?? "<sem perfil>"} (esperado viewer_operacao)`);

console.log("\nLeitura restrita (esperado: vazio ou negado)");
for (const t of RESTRITAS) {
  const { data, error } = await supabase.from(t).select("*").limit(5);
  if (error) ok(`${t}: negado (${error.code ?? ""} ${error.message})`);
  else if (data.length === 0) ok(`${t}: vazio`);
  else falha(`${t}: retornou ${data.length} linha(s)`);
}

console.log("\nLeitura permitida (esperado: sem erro)");
for (const t of PERMITIDAS) {
  const { data, error } = await supabase.from(t).select("*").limit(1);
  if (error) falha(`${t}: erro ${error.message}`);
  else ok(`${t}: ${data.length ? "com dados" : "sem erro (0 linhas)"}`);
}

console.log("\nEscrita (esperado: negada)");
const tentativas = [
  ["fc_saldo_inicial", { mes_referencia: MES_TESTE, valor: 0 }],
  ["carteiras_recebimentos", { mes_referencia: MES_TESTE, categoria: "__teste_rls__", valor: 0 }],
  ["comite_comentarios", { categoria_comite: "__teste_rls__", mes_referencia: "1900-01", texto: "teste rls" }],
];
for (const [t, row] of tentativas) {
  const { data, error } = await supabase.from(t).insert(row).select();
  if (error) ok(`insert em ${t}: negado`);
  else {
    falha(`insert em ${t}: PERMITIDO`);
    // limpa o que entrou indevidamente
    for (const r of data ?? []) await supabase.from(t).delete().eq("id", r.id);
  }
}

console.log("\nAuto-promoção (esperado: negada)");
{
  const { data, error } = await supabase
    .from("comite_user_profiles").update({ role: "admin_divid" }).eq("id", uid).select();
  if (error || (data ?? []).length === 0) ok("update do próprio role: sem efeito");
  else {
    falha("update do próprio role: PERMITIDO");
    await supabase.from("comite_user_profiles").update({ role: "viewer_operacao" }).eq("id", uid);
  }
}

await supabase.auth.signOut();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTodas as verificações passaram.");
process.exit(falhas ? 1 : 0);
