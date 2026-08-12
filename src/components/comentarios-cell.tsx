import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { mesLabel } from "@/lib/format";
import { toast } from "sonner";

type Coment = {
  id: string;
  texto: string;
  criado_em: string;
  criado_por: string | null;
  comite_user_profiles: { nome: string | null } | null;
};

export function ComentariosCell({ categoria, mes }: { categoria: string; mes: string }) {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["comentarios", categoria, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comite_comentarios")
        .select("id, texto, criado_em, criado_por, comite_user_profiles!comite_comentarios_criado_por_fkey(nome)")
        .eq("categoria_omie", categoria)
        .eq("mes_referencia", mes)
        .order("criado_em", { ascending: false });
      if (error) {
        // fallback sem alias se FK não está nomeada
        const r = await supabase
          .from("comite_comentarios")
          .select("id, texto, criado_em, criado_por")
          .eq("categoria_omie", categoria)
          .eq("mes_referencia", mes)
          .order("criado_em", { ascending: false });
        if (r.error) throw r.error;
        const ids = [...new Set((r.data ?? []).map(c => c.criado_por).filter(Boolean))] as string[];
        const profMap = new Map<string, string | null>();
        if (ids.length) {
          const { data: profs } = await supabase
            .from("comite_user_profiles")
            .select("id, nome")
            .in("id", ids);
          (profs ?? []).forEach(p => profMap.set(p.id, p.nome));
        }
        return (r.data ?? []).map(c => ({
          ...c,
          comite_user_profiles: c.criado_por ? { nome: profMap.get(c.criado_por) ?? null } : null,
        })) as Coment[];
      }
      return (data ?? []) as unknown as Coment[];
    },
    enabled: open,
  });

  const countQ = useQuery({
    queryKey: ["comentarios-count", categoria, mes],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("comite_comentarios")
        .select("*", { count: "exact", head: true })
        .eq("categoria_omie", categoria)
        .eq("mes_referencia", mes);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const t = texto.trim();
      if (!t) return;
      const { error } = await supabase.from("comite_comentarios").insert({
        categoria_omie: categoria,
        mes_referencia: mes,
        texto: t,
        criado_por: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["comentarios", categoria, mes] });
      qc.invalidateQueries({ queryKey: ["comentarios-count", categoria, mes] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comite_comentarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comentário apagado");
      qc.invalidateQueries({ queryKey: ["comentarios", categoria, mes] });
      qc.invalidateQueries({ queryKey: ["comentarios-count", categoria, mes] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const count = countQ.data ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          onClick={e => e.stopPropagation()}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {count > 0 && <span className="text-[10px] font-medium">{count}</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-base">{categoria} — {mesLabel(mes)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {list.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
          {!list.isLoading && (list.data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhum comentário ainda.</div>
          )}
          {(list.data ?? []).map(c => (
            <div key={c.id} className="rounded border p-2 text-sm">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.comite_user_profiles?.nome ?? "—"}</span>
                  {" · "}{new Date(c.criado_em).toLocaleString("pt-BR")}
                </div>
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={e => e.stopPropagation()}
                        aria-label="Apagar comentário"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={e => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar este comentário?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(c.id)}>Apagar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              <div className="whitespace-pre-wrap">{c.texto}</div>
            </div>
          ))}
        </div>
        {isAdmin && (
          <div className="space-y-2 pt-2 border-t">
            <Textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva um comentário…" rows={3} />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => add.mutate()} disabled={!texto.trim() || add.isPending}>
                {add.isPending ? "Enviando…" : "Comentar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
