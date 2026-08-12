import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin_divid" | "viewer" | null;

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
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
            .then(({ data }) => setRole((data?.role as Role) ?? "viewer"));
        }, 0);
      } else {
        setRole(null);
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
          .then(({ data }) => setRole((data?.role as Role) ?? "viewer"))
          .then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, user, role, loading, isAdmin: role === "admin_divid" };
}
