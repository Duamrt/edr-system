import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY  = Deno.env.get('EDR_SERVICE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verificar caller
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerToken = authHeader.replace('Bearer ', '').trim()
    if (!callerToken) return json({ error: 'Não autorizado' }, 401)
    if (!SERVICE_KEY) return json({ error: 'SERVICE_KEY não configurado' }, 500)

    // 2. Validar token do caller
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${callerToken}` }
    })
    if (!userRes.ok) return json({ error: 'Token inválido' }, 401)
    const userData = await userRes.json()
    const callerId = userData?.id
    if (!callerId) return json({ error: 'Usuário não identificado' }, 401)

    // 3. Verificar se caller é admin e pegar company_id
    const roleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/company_users?user_id=eq.${callerId}&select=role,company_id&limit=1`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        }
      }
    )
    const roleRows = await roleRes.json()
    if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
      return json({ error: 'Apenas admins podem criar usuários.' }, 403)
    }
    const companyId = roleRows[0]?.company_id
    if (!companyId) return json({ error: 'company_id não encontrado.' }, 400)

    // 4. Receber dados
    const { email, password, nome, role } = await req.json()
    if (!email || !password || password.length < 6 || !nome) {
      return json({ error: 'Informe email, nome e senha (mín. 6 caracteres).' }, 400)
    }
    const perfil = ['admin', 'operacional', 'mestre', 'visitante'].includes(role) ? role : 'operacional'

    // 5. Criar usuário no Supabase Auth
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, perfil }
      })
    })

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}))
      const msg = err?.msg || err?.message || 'Erro ao criar usuário.'
      return json({ error: msg }, 400)
    }

    const newUser = await createRes.json()
    const newUserId = newUser?.id
    if (!newUserId) return json({ error: 'ID do usuário não retornado.' }, 500)

    // 6. Criar registro em company_users
    const cuRes = await fetch(`${SUPABASE_URL}/rest/v1/company_users`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        company_id: companyId,
        user_id: newUserId,
        nome,
        email,
        role: perfil,
      })
    })

    if (!cuRes.ok) {
      const err = await cuRes.text().catch(() => '')
      return json({ error: 'Usuário Auth criado mas erro ao salvar perfil: ' + err }, 500)
    }

    return json({ ok: true, user_id: newUserId }, 200)

  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
