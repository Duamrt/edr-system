// ⚠️ PENDENTE DE DEPLOY (2026-06-11) — NÃO DEPLOYAR sem antes setar os secrets abaixo.
// Esta versão remove o token do Telegram que estava HARDCODED na função em produção.
// Antes de `supabase functions deploy relatorio-semanal`:
//   1. BotFather → /revoke (ou /token) pra GERAR NOVO token do bot (o antigo vazou no código).
//   2. Setar os secrets:
//        supabase secrets set TELEGRAM_REPORT_TOKEN="<novo token>"
//        supabase secrets set TELEGRAM_REPORT_CHAT="-5239426430"
//   3. Só então deployar. Sem os secrets, a função aborta (não envia com token vazio).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_REPORT_TOKEN") ?? "";
const TELEGRAM_CHAT = Deno.env.get("TELEGRAM_REPORT_CHAT") ?? "";

// Só dados da EDR Engenharia
const EDR_COMPANY_ID = "3d040713-320f-4639-8a0e-35f62ef10ba7";

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Deno.serve(async () => {
  try {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) {
      return new Response(JSON.stringify({ ok: false, error: "TELEGRAM_REPORT_TOKEN/CHAT não configurados" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const hoje = new Date();
    const quinzenaAtras = new Date(hoje);
    quinzenaAtras.setDate(quinzenaAtras.getDate() - 15);
    const de = quinzenaAtras.toISOString().split("T")[0];
    const ate = hoje.toISOString().split("T")[0];

    // Busca obras da EDR primeiro pra filtrar tudo
    const obrasRes = await db.from("obras").select("id,nome").eq("company_id", EDR_COMPANY_ID);
    const obrasList = obrasRes.data || [];
    const obrasIds = new Set(obrasList.map((o: any) => o.id));
    const obraNome: Record<string, string> = {};
    obrasList.forEach((o: any) => { obraNome[o.id] = o.nome; });

    const [nfs, lancamentos, distribuicoes, contasPagar, diarias, funcionarios] = await Promise.all([
      db.from("notas_fiscais").select("*").eq("company_id", EDR_COMPANY_ID).gte("criado_em", de).lte("criado_em", ate + "T23:59:59"),
      db.from("lancamentos").select("*").eq("company_id", EDR_COMPANY_ID).gte("data", de).lte("data", ate),
      db.from("distribuicoes").select("*").eq("company_id", EDR_COMPANY_ID).gte("criado_em", de).lte("criado_em", ate + "T23:59:59"),
      db.from("contas_pagar").select("*").eq("company_id", EDR_COMPANY_ID).lte("data_vencimento", ate).eq("status", "pendente"),
      db.from("diarias").select("*").eq("company_id", EDR_COMPANY_ID).gte("data", de).lte("data", ate),
      db.from("diarias_funcionarios").select("*").eq("company_id", EDR_COMPANY_ID),
    ]);

    // Filtra só lançamentos de obras da EDR
    const lancList = (lancamentos.data || []).filter((l: any) => obrasIds.has(l.obra_id));
    const distList = (distribuicoes.data || []).filter((d: any) => obrasIds.has(d.obra_id));
    const nfList = nfs.data || [];
    const contasList = contasPagar.data || [];
    const diarList = diarias.data || [];
    const funcList = funcionarios.data || [];

    // Totais gerais
    const totalNFs = nfList.length;
    const totalDist = distList.length;
    const totalDiarias = diarList.length;
    const contasVencendo = contasList.length;
    const totalGasto = lancList.reduce((s: number, l: any) => s + Number(l.total || 0), 0);

    // Gastos por obra (lançamentos)
    const gastosPorObra: Record<string, number> = {};
    lancList.forEach((l: any) => {
      const nome = obraNome[l.obra_id] || "Sem obra";
      gastosPorObra[nome] = (gastosPorObra[nome] || 0) + Number(l.total || 0);
    });

    // Mão de obra por funcionário
    const maoPorFunc: Record<string, { dias: number; valor: number }> = {};
    diarList.forEach((d: any) => {
      const nome = d.funcionario || "Sem nome";
      if (!maoPorFunc[nome]) maoPorFunc[nome] = { dias: 0, valor: 0 };
      maoPorFunc[nome].dias += Number(d.total_fracoes || 0);
      maoPorFunc[nome].valor += Number(d.valor || 0);
    });
    const totalMaoObra = Object.values(maoPorFunc).reduce((s, f) => s + f.valor, 0);

    // Mão de obra por obra
    const maoPorObra: Record<string, number> = {};
    diarList.forEach((d: any) => {
      try {
        const periodos = typeof d.periodos === "string" ? JSON.parse(d.periodos) : d.periodos;
        if (Array.isArray(periodos)) {
          periodos.forEach((p: any) => {
            const obra = p.obra || "Sem obra";
            maoPorObra[obra] = (maoPorObra[obra] || 0) + Number(d.diaria_base || 0) * Number(p.fracao || 0.5);
          });
        }
      } catch (_) {}
    });

    // Montar mensagem
    const diaFmt = (d: string) => { const p = d.split("-"); return `${p[2]}/${p[1]}`; };

    let msg = `📊 *RESUMO QUINZENAL EDR*\n`;
    msg += `📅 ${diaFmt(de)} a ${diaFmt(ate)}\n\n`;

    msg += `📄 *${totalNFs}* NFs lancadas\n`;
    msg += `📦 *${totalDist}* distribuicoes de material\n`;
    msg += `👷 *${totalDiarias}* diarias registradas\n`;
    if (contasVencendo > 0) msg += `⚠️ *${contasVencendo}* contas a pagar vencidas\n`;
    msg += `💰 Total gasto: *R$ ${fmt(totalGasto)}*\n`;
    msg += `🔨 Total mao de obra: *R$ ${fmt(totalMaoObra)}*\n`;

    if (Object.keys(gastosPorObra).length > 0) {
      msg += `\n🏗 *Gastos por obra:*\n`;
      Object.entries(gastosPorObra).sort((a, b) => b[1] - a[1]).forEach(([nome, valor]) => {
        msg += `  • ${nome}: R$ ${fmt(valor)}\n`;
      });
    }

    if (Object.keys(maoPorFunc).length > 0) {
      msg += `\n👷 *Mao de obra por funcionario:*\n`;
      Object.entries(maoPorFunc).sort((a, b) => b[1].valor - a[1].valor).forEach(([nome, f]) => {
        msg += `  • ${nome}: ${f.dias} dias = R$ ${fmt(f.valor)}\n`;
      });
    }

    if (Object.keys(maoPorObra).length > 0) {
      msg += `\n🏠 *Mao de obra por obra:*\n`;
      Object.entries(maoPorObra).sort((a, b) => b[1] - a[1]).forEach(([nome, valor]) => {
        msg += `  • ${nome}: R$ ${fmt(valor)}\n`;
      });
    }

    if (contasVencendo > 0) {
      msg += `\n💳 *Contas vencidas:*\n`;
      contasList.slice(0, 5).forEach((c: any) => {
        msg += `  • ${c.descricao || "Sem desc"}: R$ ${fmt(Number(c.valor || 0))} (venc. ${c.data_vencimento})\n`;
      });
    }

    msg += `\n_Gerado automaticamente pelo EDR System_`;

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: msg, parse_mode: "Markdown" }),
    });

    const result = await res.json();
    return new Response(JSON.stringify({ ok: true, telegram: result.ok, resumo: { nfs: totalNFs, diarias: totalDiarias, maoObra: totalMaoObra, gastoTotal: totalGasto } }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
