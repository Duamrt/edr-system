import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const ASAAS_BASE=Deno.env.get("ASAAS_BASE_URL")??"https://sandbox.asaas.com/api/v3";
const ASAAS_KEY=Deno.env.get("ASAAS_API_KEY")??"";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ch={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function j(b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:{...ch,"content-type":"application/json"}});}
async function a(p:string,i:RequestInit={}){const r=await fetch(`${ASAAS_BASE}${p}`,{...i,headers:{...(i.headers||{}),"access_token":ASAAS_KEY,"content-type":"application/json","User-Agent":"EDR/1.0"}});const t=await r.text();const d=t?JSON.parse(t):{};if(!r.ok)throw new Error(`Asaas ${r.status}: ${t}`);return d;}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:ch});
  if(req.method!=="POST")return j({error:"method_not_allowed"},405);
  const jwt=(req.headers.get("authorization")??"").replace("Bearer ","");
  if(!jwt)return j({error:"unauthorized"},401);
  const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
  const {data:u}=await sb.auth.getUser(jwt);
  if(!u?.user)return j({error:"unauthorized"},401);
  const b=await req.json().catch(()=>({}));
  const {company_id,plano,valor,ciclo="MONTHLY",forma_pagamento="UNDEFINED"}=b;
  if(!company_id||!plano||!valor)return j({error:"missing_fields"},400);
  // EDR: company_users
  const {data:cu}=await sb.from("company_users").select("company_id, role").eq("user_id",u.user.id).eq("active",true).eq("company_id",company_id).maybeSingle();
  if(!cu||!["dono","admin"].includes(cu.role))return j({error:"forbidden"},403);
  const {data:co,error:ce}=await sb.from("companies").select("id,name,cnpj,phone,asaas_customer_id").eq("id",company_id).single();
  if(ce||!co)return j({error:"company_not_found"},404);
  try{
    let cid=co.asaas_customer_id;
    if(!cid){
      const c=await a("/customers",{method:"POST",body:JSON.stringify({name:co.name,cpfCnpj:(co.cnpj??"").replace(/\D/g,"")||undefined,email:u.user.email??undefined,mobilePhone:(co.phone??"").replace(/\D/g,"")||undefined,externalReference:co.id})});
      cid=c.id;
      await sb.from("companies").update({asaas_customer_id:cid}).eq("id",co.id);
    }
    const nd=new Date();nd.setDate(nd.getDate()+7);
    const ndi=nd.toISOString().slice(0,10);
    const sub=await a("/subscriptions",{method:"POST",body:JSON.stringify({customer:cid,billingType:forma_pagamento,value:Number(valor),nextDueDate:ndi,cycle:ciclo,description:`EDR System - Plano ${plano}`,externalReference:`edr:${co.id}`})});
    const {data:ass,error:ae}=await sb.from("assinaturas").insert({company_id:co.id,asaas_customer_id:cid,asaas_subscription_id:sub.id,plano,valor:Number(valor),ciclo,forma_pagamento,status:"ativa",proximo_vencimento:ndi}).select().single();
    if(ae)throw ae;
    await sb.from("companies").update({status_pagamento:"ativo",plan:plano,trial_ends_at:null}).eq("id",co.id);
    let iu:string|null=null;
    try{const ps=await a(`/payments?subscription=${sub.id}&limit=1`);if(ps?.data?.[0])iu=ps.data[0].invoiceUrl??ps.data[0].bankSlipUrl??null;}catch(_){}
    return j({ok:true,assinatura:ass,subscription_id:sub.id,invoice_url:iu});
  }catch(e){console.error("[edr-asaas-criar]",e);return j({error:"asaas_error",message:String(e instanceof Error?e.message:e)},500);}
});
