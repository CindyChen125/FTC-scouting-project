import { createClient } from '@supabase/supabase-js'

// Like Firebase's web config, the anon key is not a secret — it identifies
// the project and is meant to ship in the client. Access is controlled by the
// Row Level Security policies in supabase/schema.sql, not by hiding this.
export const SUPABASE_URL = 'https://uyzmcncgcfrlcexndlbi.supabase.co'
// Supabase's newer "publishable" key format — the successor to the anon key.
export const SUPABASE_ANON_KEY = 'sb_publishable_Of9UgJrn03TRedi6Sjuj3Q_RsNTyY4v'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // No user accounts — scouts use the app anonymously, so there's no
    // session to persist or refresh.
    persistSession: false,
    autoRefreshToken: false
  }
})
