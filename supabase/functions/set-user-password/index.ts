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
    // 1. Extrair JWT do caller
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerToken = authHeader.replace('Bearer ', '').trim()
    if (!callerToken) {
      return json({ error: 'Não autorizado', step: 1 }, 401)
    }

    if (!SERVICE_KEY) {
      return json({ error: 'SERVICE_KEY não configurado', step: 0 }, 500)
    }

    // 2. Verificar se o caller é admin via service key (mais confiável)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${callerToken}`,
      }
    })
    if (!userRes.ok) {
      const errBody = await userRes.json().catch(() => ({}))
      return json({ error: 'Token inválido', step: 2, detail: errBody }, 401)
    }
    const userData = await userRes.json()
    const callerId = userData?.id
    if (!callerId) return json({ error: 'Usuário não identificado', step: 2 }, 401)

    // 3. Checar role via company_users (usando service key pra bypassar RLS)
    const roleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/company_users?user_id=eq.${callerId}&select=role&limit=1`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        }
      }
    )
    const roleRows = await roleRes.json()
    if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
      return json({ error: 'Apenas admins podem redefinir senhas.', step: 3, role: roleRows[0]?.role ?? 'nenhum' }, 403)
    }

    // 4. Receber dados
    const { user_id, password } = await req.json()
    if (!user_id || !password || password.length < 6) {
      return json({ error: 'Dados inválidos. Mínimo 6 caracteres.', step: 4 }, 400)
    }

    // 5. Atualizar senha via Admin API
    const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: 'PUT',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password })
    })

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '(sem corpo)')
      return json({ error: 'Erro ao atualizar senha.', step: 5, status: updateRes.status, detail: errText }, 500)
    }

    return json({ ok: true }, 200)

  } catch (e) {
    return json({ error: String(e), step: 'catch' }, 500)
  }
})

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
