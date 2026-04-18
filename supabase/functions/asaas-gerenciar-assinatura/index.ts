// asaas-gerenciar-assinatura (EDR System)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const ASAAS_BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://sandbox.asaas.com/api/v3";
const ASAAS_KEY = Deno.env.get("ASAAS_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const h = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, "content-type": "application/json" } });
async function a(path: string, init: RequestInit = {}) {
  const r = await fetch(`${ASAAS_BASE}${path}`, { ...init, headers: { ...(init.headers || {}), "access_token": ASAAS_KEY, "content-type": "application/json", "User-Agent": "EDR-System/1.0" } });
  const t = await r.text();
  const d = t ? JSON.parse(t) : {};
  if (!r.ok) throw new Error(`Asaas ${r.status}: ${t}`);
  return d;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405);
  const jwt = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return j({ error: "unauthorized" }, 401);
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: u, error: ue } = await sb.auth.getUser(jwt);
  if (ue || !u?.user) return j({ error: "unauthorized" }, 401);
  const b = await req.json().catch(() => ({}));
  const { action, assinatura_id } = b;
  if (!action || !assinatura_id) return j({ error: "missing_fields" }, 400);
  const { data: ass } = await sb.from("assinaturas").select("*").eq("id", assinatura_id).single();
  if (!ass) return j({ error: "assinatura_not_found" }, 404);
  const { data: cu } = await sb.from("company_users").select("company_id,role").eq("user_id", u.user.id).eq("active", true).eq("company_id", ass.company_id).maybeSingle();
  if (!cu || !["dono", "admin"].includes(cu.role)) return j({ error: "forbidden" }, 403);
  try {
    if (action === "cancelar") {
      await a(`/subscriptions/${ass.asaas_subscription_id}`, { method: "DELETE" });
      await sb.from("assinaturas").update({ status: "cancelada" }).eq("id", ass.id);
      await sb.from("companies").update({ status_pagamento: "cancelado", bloqueado_em: new Date().toISOString() }).eq("id", ass.company_id);
      return j({ ok: true, cancelada: true });
    }
    if (action === "proxima_cobranca") {
      const ps = await a(`/payments?subscription=${ass.asaas_subscription_id}&status=PENDING&limit=1`);
      const p = ps?.data?.[0];
      if (!p) return j({ error: "sem_cobranca_pendente", message: "Não há cobrança pendente no momento." }, 404);
      return j({ ok: true, invoice_url: p.invoiceUrl ?? p.bankSlipUrl, due_date: p.dueDate, value: p.value });
    }
    return j({ error: "action_invalida" }, 400);
  } catch (e) {
    console.error("[edr-gerenciar]", e);
    return j({ error: "asaas_error", message: String(e instanceof Error ? e.message : e) }, 500);
  }
});
