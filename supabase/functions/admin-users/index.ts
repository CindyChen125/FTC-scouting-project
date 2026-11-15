// Account management for admins: create a scout, reset someone's password,
// remove an account.
//
// These need Supabase's admin API, which only accepts the service_role key —
// a key that bypasses every RLS policy. It therefore cannot live in the
// browser bundle. It stays here, on Supabase's servers, and the app calls this
// function instead.
//
// Two independent checks guard every request:
//   1. Supabase's gateway rejects callers without a valid signed-in JWT before
//      this code runs (verify_jwt defaults to on).
//   2. Below, the caller's identity is read from their *token* and their
//      profile must be the configured active owner. Nothing in the request body is
//      trusted to say who the caller is.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const EMAIL_DOMAIN = 'dzscouting.local'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // --- who is calling? (from the token, never the body) ---
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return json({ error: 'Not signed in' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  const caller = userData?.user
  if (userErr || !caller) return json({ error: 'Not signed in' }, 401)

  const { data: owner } = await admin
    .from('app_owner')
    .select('user_id')
    .eq('singleton', true)
    .maybeSingle()

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_active')
    .eq('user_id', caller.id)
    .maybeSingle()

  if (!callerProfile?.is_active || owner?.user_id !== caller.id) {
    return json({ error: 'Owner only' }, 403)
  }

  // --- act ---
  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  const { action } = body

  if (action === 'createUser') {
    const { username, displayName, password } = body
    if (!username || !password) {
      return json({ error: 'username and password are required' }, 400)
    }
    if (password.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400)
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      return json({ error: 'Username may only contain letters, numbers, . _ and -' }, 400)
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: `${username.toLowerCase()}@${EMAIL_DOMAIN}`,
      password,
      // These addresses receive no mail, so confirmation has to be implicit or
      // the account could never sign in.
      email_confirm: true,
      user_metadata: {
        username: username.toLowerCase(),
        display_name: displayName || username,
        role: 'scout'
      }
    })
    if (error) return json({ error: error.message }, 400)
    return json({ userId: data.user?.id })
  }

  if (action === 'resetPassword') {
    const { userId, password } = body
    if (!userId || !password) return json({ error: 'userId and password are required' }, 400)
    if (password.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400)
    }
    const { data: target } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    if (target?.role !== 'scout') return json({ error: 'Only Scout accounts can be managed here' }, 403)
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'deleteUser') {
    const { userId } = body
    if (!userId) return json({ error: 'userId is required' }, 400)
    if (userId === caller.id) {
      return json({ error: "You can't delete your own account" }, 400)
    }

    const { data: target } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    if (target?.role !== 'scout') return json({ error: 'Only Scout accounts can be managed here' }, 403)

    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
