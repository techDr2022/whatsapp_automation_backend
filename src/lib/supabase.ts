import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
}

// The Database generic is intentionally omitted here.
// Supabase's RejectExcessProperties utility is designed for auto-generated types.
// We cast query results to our typed interfaces (Client, Campaign, etc.) at each call site.
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
