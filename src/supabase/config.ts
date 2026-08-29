import { createClient } from '@supabase/supabase-js'

// Like Firebase's web config, the anon key is not a secret — it identifies
// the project and is meant to ship in the client. Access is controlled by the
// Row Level Security policies in supabase/schema.sql, not by hiding this.
export const SUPABASE_URL = 'https://uyzmcncgcfrlcexndlbi.supabase.co'
// Supabase's newer "publishable" key format — the successor to the anon key.
export const SUPABASE_ANON_KEY = 'sb_publishable_Of9UgJrn03TRedi6Sjuj3Q_RsNTyY4v'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Scouts sign in once (while online, before an event) and stay signed in
    // across app restarts — the session lives in local storage and the token
    // refreshes itself whenever there's a connection.
    persistSession: true,
    autoRefreshToken: true
  }
})

// Usernames are mapped onto a placeholder domain: Supabase Auth needs
// something email-shaped, but no mail is ever sent to these addresses.
export const EMAIL_DOMAIN = 'dzscouting.local'
export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`
