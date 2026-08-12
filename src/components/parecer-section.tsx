import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

type Score = "verde" | "amarelo" | "vermelho";
type Parecer = {
  id: string;
  mes_referencia: string;
  titulo: string;
  score: Score;
  comentario: string;
  criado_em: string;
  criado_por: string | null;
};

const scoreStyle: Record<Score, { bg: string; label: string }> = {
  verde: { bg: "#16a34a", label: "🟢 Verde" },
  amarelo: { bg: "#ca8a04", label: "🟡 Amarelo" },
  vermelho: { bg: "#dc2626", label: "🔴 Vermelho" },
};

const fmtDate = (s: string) => {
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ParecerSection({ mes }: { mes: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["pareceres", mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comite_pareceres")
        .select("*")
        .eq("mes_referencia", mes)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      const pareceres = (data ?? []) as Parecer[];
      const ids = Array.from(new Set(pareceres.map(p => p.criado_por).filter(Boolean) as string[]));
      let nomes: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("comite_user_profiles")
          .select("id, nome")
          .in("id", ids);
        nomes = Object.fromEntries((profs ?? []).map(p => [p.id, p.nome ?? ""]));
      }
      return pareceres.map(p => ({ ...p, autor: p.criado_por ? (nomes[p.criado_por] ?? "Usuário removido") : "Usuário removido" }));
    },
  });

  const [titulo, setTitulo] = useState("");
  const [score, setScore] = useState<Score | "">("");
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errs, setErrs] = useState<{ titulo?: string; score?: string; comentario?: string }>({});

  const publicar = async () => {
    const next: typeof errs = {};
    if (!titulo.trim()) next.titulo = "Obrigatório";
    if (!comentario.trim()) next.comentario = "Obrigatório";
    if (!score) next.score = "Selecione um score";
    setErrs(next);
    if (Object.keys(next).length) return;

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sessão expirada, faça login novamente");
        return;
      }
      const { error } = await supabase.from("comite_pareceres").insert({
        mes_referencia: mes,
        titulo: titulo.trim(),
        score,
        comentario: comentario.trim(),
        criado_por: user.id,
      });
      if (error) throw new Error(error.message);
      toast.success("Parecer publicado com sucesso");
      setTitulo(""); setScore(""); setComentario(""); setErrs({});
      qc.invalidateQueries({ queryKey: ["pareceres", mes] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao publicar");
    } finally {
      setSubmitting(false);
    }
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comite_pareceres").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Parecer apagado");
      qc.invalidateQueries({ queryKey: ["pareceres", mes] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao apagar"),
  });

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="text-base">📋 Parecer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground">Nenhum parecer publicado para este mês.</div>
        )}

        <div className="space-y-3">
          {(q.data ?? []).map(p => {
            const st = scoreStyle[p.score];
            return (
              <div key={p.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{fmtDate(p.criado_em)}</span>
                  <span>{p.autor}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{p.titulo}</span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{ backgroundColor: st.bg, color: "#fff" }}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="text-sm whitespace-pre-wrap">{p.comentario}</div>
                {isAdmin && (
                  <div className="flex justify-end">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Apagar este parecer?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(p.id)}>Apagar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-medium">Novo parecer</div>
            <div className="space-y-1">
              <Input
                placeholder="Título"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
              />
              {errs.titulo && <div className="text-xs text-destructive">{errs.titulo}</div>}
            </div>
            <div className="space-y-1">
              <Select value={score} onValueChange={v => setScore(v as Score)}>
                <SelectTrigger><SelectValue placeholder="Selecione um score" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="verde">🟢 Verde</SelectItem>
                  <SelectItem value="amarelo">🟡 Amarelo</SelectItem>
                  <SelectItem value="vermelho">🔴 Vermelho</SelectItem>
                </SelectContent>
              </Select>
              {errs.score && <div className="text-xs text-destructive">{errs.score}</div>}
            </div>
            <div className="space-y-1">
              <Textarea
                placeholder="Comentário"
                rows={4}
                value={comentario}
                onChange={e => setComentario(e.target.value)}
              />
              {errs.comentario && <div className="text-xs text-destructive">{errs.comentario}</div>}
            </div>
            <Button onClick={publicar} disabled={submitting}>
              {submitting ? "Publicando…" : "Publicar Parecer"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
