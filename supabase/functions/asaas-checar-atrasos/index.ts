import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CS=Deno.env.get("CRON_SECRET")??"";
const GD=7;const AV=[1,3,6];
function j(b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json"}});}
Deno.serve(async(req)=>{
  if(req.method!=="POST"&&req.method!=="GET")return j({error:"method_not_allowed"},405);
  if(CS&&req.headers.get("x-cron-secret")!==CS)return j({error:"unauthorized"},401);
  const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
  const hj=new Date();hj.setHours(0,0,0,0);
  const {data:assins}=await sb.from("assinaturas").select("id,company_id,plano,valor,proximo_vencimento,status,companies(id,name,phone,status_pagamento,dias_atraso)").in("status",["atrasada","suspensa"]);
  const res:any[]=[];
  for(const a of assins||[]){
    const co:any=(a as any).companies;if(!co)continue;
    const v=a.proximo_vencimento?new Date(a.proximo_vencimento+"T00:00:00"):null;if(!v)continue;
    const d=Math.max(0,Math.floor((hj.getTime()-v.getTime())/86400000));
    const up:any={dias_atraso:d};
    if(d>GD){up.status_pagamento="bloqueado";up.bloqueado_em=new Date().toISOString();}
    else if(d>0){up.status_pagamento="atrasado";}
    if(Object.keys(up).length)await sb.from("companies").update(up).eq("id",co.id);
    if(AV.includes(d)&&co.phone)console.log(`[WA mock] ${co.phone}: EDR ${co.name} ${d}d atraso R$${a.valor}`);
    res.push({company:co.name,dias:d,bloqueado:d>GD});
  }
  return j({ok:true,processadas:res.length,resultados:res});
});
