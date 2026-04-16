import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const TG_BOT  = Deno.env.get('TG_BOT') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    if (!TG_BOT) return new Response(JSON.stringify({ error: 'TG_BOT não configurado' }), { status: 500, headers: cors })

    const { chat_id, texto } = await req.json()
    if (!chat_id || !texto) return new Response(JSON.stringify({ error: 'chat_id e texto obrigatórios' }), { status: 400, headers: cors })

    const res = await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
    })

    const data = await res.json()
    return new Response(JSON.stringify(data), { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors })
  }
})
