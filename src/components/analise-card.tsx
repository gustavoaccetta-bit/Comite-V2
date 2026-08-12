import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Aba = "comite" | "carteiras" | "fluxo_caixa";
type ModoAi = "base_inicial" | "rolling";

type Analise = { comentario: string; created_at: string };

export function AnaliseCard({ aba, mesRef, modo }: { aba: Aba; mesRef: string; modo?: ModoAi }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);

  const queryKey = ["ai_analise", aba, mesRef, modo ?? null];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = { aba, mes_referencia: mesRef, ...(modo ? { modo } : {}) };
      let q = supabase
        .from("ai_analises")
        .select("comentario, created_at")
        .eq("aba", aba)
        .eq("mes_referencia", mesRef);
      if (modo) q = q.eq("modo", modo);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      // eslint-disable-next-line no-console
      console.log("[AnaliseCard] query", params, "->", { data, error });
      if (error) throw error;
      return (data as Analise) ?? null;
    },
  });


  const gerar = async () => {
    setGerando(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("bright-processor", {
        body: { aba, mes_referencia: mesRef, ...(modo ? { modo } : {}) },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      await qc.invalidateQueries({ queryKey });
      toast.success("Análise gerada com sucesso.");
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao gerar análise.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Análise do Agente IA
        </CardTitle>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={gerar} disabled={gerando}>
            {gerando ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Gerar análise</>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>
        ) : data ? (
          <div>
            <div className="prose-sm max-w-none space-y-2 text-sm [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:leading-relaxed">
              <ReactMarkdown>{data.comentario}</ReactMarkdown>
            </div>
            <div className="text-xs text-muted-foreground mt-4 pt-3 border-t">
              Gerado em {new Date(data.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma análise gerada para este mês.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
