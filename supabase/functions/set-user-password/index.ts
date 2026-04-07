import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('EDR_SERVICE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Validar que o chamador está autenticado e é admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const callerToken = authHeader.replace('Bearer ', '')

    // Verificar perfil do chamador via company_users
    const callerRes = await fetch(`${SUPABASE_URL}/rest/v1/company_users?select=role&limit=1`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${callerToken}`,
      }
    })
    const callerRows = await callerRes.json()
    const role = callerRows?.[0]?.role
    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Apenas admins podem redefinir senhas.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Receber user_id e nova senha
    const { user_id, password } = await req.json()
    if (!user_id || !password || password.length < 6) {
      return new Response(JSON.stringify({ error: 'Dados inválidos. Mínimo 6 caracteres.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Atualizar senha via Admin API (service key fica só aqui no servidor)
    const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password })
    })

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: err.message || 'Erro ao atualizar senha.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
