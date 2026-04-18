import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WT=Deno.env.get("ASAAS_WEBHOOK_TOKEN")??"";
const ch={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, OPTIONS"};
function j(b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:{...ch,"content-type":"application/json"}});}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:ch});
  if(req.method!=="POST")return j({error:"method_not_allowed"},405);
  if(WT&&req.headers.get("asaas-access-token")!==WT)return j({error:"invalid_token"},401);
  const p=await req.json().catch(()=>null);
  if(!p)return j({error:"invalid_payload"},400);
  const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
  const ev=p.event as string;const pay=p.payment??{};
  const sid=pay.subscription??p.subscription?.id??null;const cid=pay.customer??p.customer??null;
  const eid=p.id??`${ev}:${pay.id??""}:${pay.status??""}:${pay.paymentDate??pay.dueDate??""}`;
  const {data:ex}=await sb.from("asaas_eventos").select("id,processado").eq("asaas_event_id",eid).maybeSingle();
  if(ex?.processado)return j({ok:true,duplicado:true});
  const {data:log}=await sb.from("asaas_eventos").insert({asaas_event_id:eid,tipo:ev,payment_id:pay.id??null,subscription_id:sid,customer_id:cid,payload:p}).select("id").single();
  try{
    let a:any=null;
    if(sid){const {data}=await sb.from("assinaturas").select("*").eq("asaas_subscription_id",sid).maybeSingle();a=data;}
    if(!a){await sb.from("asaas_eventos").update({processado:true,erro:"sem_assinatura"}).eq("id",log!.id);return j({ok:true,ignorado:true});}
    const coid=a.company_id;
    switch(ev){
      case "PAYMENT_CONFIRMED":case "PAYMENT_RECEIVED":case "PAYMENT_RECEIVED_IN_CASH":{
        const cc=pay.creditCard??{};
        await sb.from("assinaturas").update({status:"ativa",forma_pagamento:pay.billingType??a.forma_pagamento,ultimo_pagamento_em:new Date().toISOString(),proximo_vencimento:pay.nextDueDate??a.proximo_vencimento,cartao_ultimos_digitos:cc.creditCardNumber??a.cartao_ultimos_digitos,cartao_bandeira:cc.creditCardBrand??a.cartao_bandeira}).eq("id",a.id);
        await sb.from("companies").update({status_pagamento:"ativo",plan:a.plano,trial_ends_at:null,dias_atraso:0,bloqueado_em:null}).eq("id",coid);
        break;
      }
      case "PAYMENT_OVERDUE":{
        await sb.from("assinaturas").update({status:"atrasada"}).eq("id",a.id);
        await sb.from("companies").update({status_pagamento:"atrasado",dias_atraso:1}).eq("id",coid);
        break;
      }
      case "PAYMENT_DELETED":case "PAYMENT_REFUNDED":case "PAYMENT_CHARGEBACK_REQUESTED":case "PAYMENT_CHARGEBACK_DISPUTE":{
        await sb.from("assinaturas").update({status:"suspensa"}).eq("id",a.id);
        await sb.from("companies").update({status_pagamento:"atrasado"}).eq("id",coid);
        break;
      }
      case "SUBSCRIPTION_DELETED":case "SUBSCRIPTION_INACTIVATED":{
        await sb.from("assinaturas").update({status:"cancelada"}).eq("id",a.id);
        await sb.from("companies").update({status_pagamento:"cancelado",bloqueado_em:new Date().toISOString()}).eq("id",coid);
        break;
      }
      case "SUBSCRIPTION_UPDATED":{
        const s=p.subscription??{};
        if(s.billingType)await sb.from("assinaturas").update({forma_pagamento:s.billingType,valor:s.value??a.valor,proximo_vencimento:s.nextDueDate??a.proximo_vencimento}).eq("id",a.id);
        break;
      }
    }
    await sb.from("asaas_eventos").update({processado:true}).eq("id",log!.id);
    return j({ok:true});
  }catch(e){const m=String(e instanceof Error?e.message:e);console.error("[edr-webhook]",m);await sb.from("asaas_eventos").update({erro:m}).eq("id",log!.id);return j({error:"processing_error",message:m},500);}
});
