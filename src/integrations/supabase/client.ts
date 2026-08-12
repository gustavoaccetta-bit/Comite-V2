import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nivmrhetdujvmpnvxufb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_tmGSk7SAMdo6RN-QvxcFSQ_IEMxa70q";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
