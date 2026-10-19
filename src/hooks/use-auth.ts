import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isRole, type Role } from "@/lib/permissions";

export type { Role };

// null = ainda carregando; "none" = sem perfil do Comitê (ex.: usuário de outra
// plataforma do mesmo projeto) ou perfil ilegível — sem acesso.
type ProfileRole = Role | "none" | null;

const toProfileRole = (value: unknown): ProfileRole => (isRole(value) ? value : "none");

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profileRole, setProfileRole] = useState<ProfileRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // defer profile fetch to avoid deadlock
        setTimeout(() => {
          supabase.from("comite_user_profiles")
            .select("role")
            .eq("id", s.user.id)
            .maybeSingle()
            .then(({ data }) => setProfileRole(toProfileRole(data?.role)));
        }, 0);
      } else {
        setProfileRole(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        supabase.from("comite_user_profiles")
          .select("role")
          .eq("id", s.user.id)
          .maybeSingle()
          .then(({ data }) => setProfileRole(toProfileRole(data?.role)))
          .then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const role = profileRole === "none" ? null : profileRole;
  return {
    session, user, role, loading,
    noAccess: profileRole === "none",
    isAdmin: role === "admin_divid",
  };
}
