import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

function initials(name: string) {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name ?? "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 50%)`;
}

type Profile = { id: string; nome: string | null };
type Resp = { user_id: string; comite_user_profiles: { nome: string | null } | null };

export function ResponsaveisCell({ categoria, isAdmin }: { categoria: string; isAdmin: boolean }) {
  const qc = useQueryClient();

  const respQ = useQuery({
    queryKey: ["responsaveis", categoria],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comite_responsaveis")
        .select("user_id, comite_user_profiles(nome)")
        .eq("categoria_omie", categoria);
      if (error) throw error;
      return (data ?? []) as unknown as Resp[];
    },
  });

  const profilesQ = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comite_user_profiles")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    enabled: isAdmin,
  });

  const toggle = useMutation({
    mutationFn: async ({ user_id, checked }: { user_id: string; checked: boolean }) => {
      if (checked) {
        const { error } = await supabase
          .from("comite_responsaveis")
          .upsert({ categoria_omie: categoria, user_id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("comite_responsaveis")
          .delete()
          .eq("categoria_omie", categoria)
          .eq("user_id", user_id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["responsaveis", categoria] }),
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const resp = respQ.data ?? [];
  const visible = resp.slice(0, 3);
  const extra = Math.max(0, resp.length - 3);
  const selected = new Set(resp.map(r => r.user_id));

  const avatars = (
    <div className="flex items-center -space-x-1.5">
      {visible.map(r => {
        const nome = r.comite_user_profiles?.nome ?? "—";
        return (
          <TooltipProvider key={r.user_id} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background"
                  style={{ background: colorFor(nome) }}
                >
                  {initials(nome)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{nome}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
      {extra > 0 && (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background px-1">
          +{extra}
        </span>
      )}
      {resp.length === 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed text-muted-foreground">
          <Plus className="h-3 w-3" />
        </span>
      )}
    </div>
  );

  if (!isAdmin) return avatars;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="hover:opacity-80" onClick={e => e.stopPropagation()}>{avatars}</button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" onClick={e => e.stopPropagation()}>
        <div className="text-xs font-medium px-2 py-1 text-muted-foreground">Responsáveis</div>
        <div className="max-h-64 overflow-y-auto">
          {(profilesQ.data ?? []).map(p => {
            const nome = p.nome ?? "—";
            const checked = selected.has(p.id);
            return (
              <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded cursor-pointer text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={v => toggle.mutate({ user_id: p.id, checked: !!v })}
                />
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                  style={{ background: colorFor(nome) }}
                >
                  {initials(nome)}
                </span>
                <span>{nome}</span>
              </label>
            );
          })}
          {(profilesQ.data ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground p-2">Nenhum usuário.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
