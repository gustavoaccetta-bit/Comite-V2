import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Extrato = {
  id: string;
  mes_referencia: string;
  nome_arquivo: string;
  storage_path: string;
  criado_em: string;
};

export function ExtratoSection({ mes }: { mes: string }) {
  const q = useQuery({
    queryKey: ["extratos", mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comite_extratos")
        .select("*")
        .eq("mes_referencia", mes)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Extrato[];
    },
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("Comite-extratos")
      .createSignedUrl(path, 60);
    if (error || !data) {
      toast.error(error?.message ?? "Erro ao gerar link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="text-base">📎 Extrato</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground">Nenhum extrato disponível para este mês.</div>
        )}
        <div className="space-y-2">
          {(q.data ?? []).map(e => (
            <div key={e.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="truncate">
                  <div className="truncate font-medium">{e.nome_arquivo}</div>
                  <div className="text-xs text-muted-foreground">{new Date(e.criado_em).toLocaleString("pt-BR")}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => download(e.storage_path)}>
                <Download className="h-3.5 w-3.5 mr-1" /> Download
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
