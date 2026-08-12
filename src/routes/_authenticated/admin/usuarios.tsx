import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Divid Comitê" }] }),
  component: UsuariosPage,
});

type Usuario = {
  id: string;
  nome: string | null;
  email: string | null;
  role: string;
};

function UsuariosPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => { if (!loading && !isAdmin) navigate({ to: "/comite" }); }, [loading, isAdmin, navigate]);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "admin_divid">("viewer");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<Usuario | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [resetting, setResetting] = useState(false);

  const { data: usuarios } = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comite_user_profiles")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Usuario[];
    },
  });

  const convidar = async () => {
    if (!email) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://nivmrhetdujvmpnvxufb.supabase.co";
      const response = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success(`Convite enviado para ${email}`);
        setEmail("");
        setInviteRole("viewer");
      } else {
        toast.error(result.error ?? "Falha ao enviar convite");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao enviar convite");
    } finally {
      setSending(false);
    }
  };

  const updateRole = async (id: string, role: string) => {
    const { error } = await supabase.from("comite_user_profiles").update({ role }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Role atualizada com sucesso");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  };

  const usuarioParaDeletar = usuarios?.find(u => u.id === deletingId);

  const remover = async (id: string) => {
    if (id === user?.id) {
      toast.error("Você não pode remover sua própria conta");
      return;
    }
    const { error } = await supabase.from("comite_user_profiles").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Usuário removido com sucesso");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
    setDeletingId(null);
  };

  const abrirReset = (u: Usuario) => {
    if (u.id === user?.id) {
      toast.error("Para alterar sua própria senha, use as configurações de perfil");
      return;
    }
    setResetUser(u);
    setNovaSenha("");
    setConfirmarSenha("");
  };

  const salvarNovaSenha = async () => {
    if (!resetUser) return;
    if (novaSenha.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      toast.error("As senhas não coincidem");
      return;
    }
    setResetting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://nivmrhetdujvmpnvxufb.supabase.co";
      const response = await fetch(`${supabaseUrl}/functions/v1/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: resetUser.id, password: novaSenha }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success("Senha redefinida com sucesso");
        setResetUser(null);
      } else {
        toast.error(result.error ?? "Falha ao redefinir senha");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao redefinir senha");
    } finally {
      setResetting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Usuários</h1>

      <Card>
        <CardHeader>
          <CardTitle>Convidar usuário</CardTitle>
          <CardDescription>Envia um convite por e-mail via Edge Function. O perfil é criado com a role escolhida.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 space-y-2 min-w-[220px]">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
          </div>
          <div className="space-y-2 w-44">
            <Label>Role</Label>
            <Select value={inviteRole} onValueChange={v => setInviteRole(v as "viewer" | "admin_divid")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="admin_divid">Admin Divid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={convidar} disabled={!email || sending}>{sending ? "Enviando..." : "Enviar convite"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lista de usuários</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase">
              <tr><th className="text-left p-2">Nome / e-mail</th><th className="text-left p-2 w-40">Role</th><th className="w-24"></th></tr>
            </thead>
            <tbody>
              {(usuarios ?? []).map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-2">{u.nome ?? u.email ?? u.id}</td>
                  <td className="p-2">
                    <Select value={u.role} onValueChange={v => updateRole(u.id, v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">viewer</SelectItem>
                        <SelectItem value="admin_divid">admin_divid</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" title="Redefinir senha" onClick={() => abrirReset(u)}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <AlertDialog open={deletingId === u.id} onOpenChange={(open) => !open && setDeletingId(null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" onClick={() => setDeletingId(u.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover usuário</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja remover <strong>{usuarioParaDeletar?.nome ?? usuarioParaDeletar?.email ?? "este usuário"}</strong> do sistema? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setDeletingId(null)}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remover(u.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
              {!usuarios?.length && (
                <tr><td colSpan={3} className="text-center p-6 text-muted-foreground">Nenhum usuário cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha de {resetUser?.email ?? resetUser?.nome}</DialogTitle>
            <DialogDescription>Defina uma nova senha para este usuário. Mínimo de 6 caracteres.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} minLength={6} />
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} minLength={6} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>Cancelar</Button>
            <Button onClick={salvarNovaSenha} disabled={resetting || !novaSenha || !confirmarSenha}>
              {resetting ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
