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
    // 1. Verificar token do caller
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerToken = authHeader.replace('Bearer ', '').trim()
    if (!callerToken) return json({ error: 'Não autorizado' }, 401)
    if (!SERVICE_KEY) return json({ error: 'SERVICE_KEY não configurado' }, 500)

    // 2. Verificar identidade do caller
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${callerToken}` }
    })
    if (!userRes.ok) return json({ error: 'Token inválido' }, 401)
    const userData = await userRes.json()
    const callerId = userData?.id
    if (!callerId) return json({ error: 'Usuário não identificado' }, 401)

    // 3. Verificar se é admin
    const roleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/company_users?user_id=eq.${callerId}&select=role&limit=1`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    )
    const roleRows = await roleRes.json()
    if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
      return json({ error: 'Apenas admins podem criar clientes.' }, 403)
    }

    // 4. Receber dados
    const { empresa, nome, email, password } = await req.json()
    if (!empresa || !email || !password || password.length < 6) {
      return json({ error: 'Dados inválidos. Empresa, email e senha (mín. 6 chars) obrigatórios.' }, 400)
    }

    // 5. Criar empresa em companies
    const slug = empresa.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

    const compRes = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ name: empresa, slug, plan: 'trial' })
    })
    if (!compRes.ok) {
      const err = await compRes.text()
      return json({ error: 'Erro ao criar empresa.', detail: err }, 500)
    }
    const compData = await compRes.json()
    const company_id = compData[0]?.id
    if (!company_id) return json({ error: 'Empresa criada mas sem ID retornado.' }, 500)

    // 6. Criar usuário no Supabase Auth
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
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
        user_metadata: { nome: nome || email, perfil: 'admin' }
      })
    })
    if (!authRes.ok) {
      const err = await authRes.text()
      // Limpar empresa criada
      await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      })
      return json({ error: 'Erro ao criar usuário.', detail: err }, 500)
    }
    const authData = await authRes.json()
    const user_id = authData?.id
    if (!user_id) return json({ error: 'Usuário criado mas sem ID retornado.' }, 500)

    // 7. Vincular usuário à empresa em company_users
    const linkRes = await fetch(`${SUPABASE_URL}/rest/v1/company_users`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ company_id, user_id, role: 'admin', nome: nome || '', email })
    })
    if (!linkRes.ok) {
      const err = await linkRes.text()
      return json({ error: 'Usuário criado mas erro ao vincular empresa.', detail: err }, 500)
    }

    return json({ ok: true, company_id, user_id }, 200)

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
