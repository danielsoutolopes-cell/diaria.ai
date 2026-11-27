import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';

export const dynamic = 'force-dynamic';

type PeriodoGerencial = 'MENSAL' | 'QUINZENA_1' | 'QUINZENA_2';

export interface ObraDreResumo {
  obraNome: string;
  diariasQtd: number;
  maoDeObraBruto: number;
  maoDeObraPago: number;
  maoDeObraAberto: number;
  valesTotal: number;
  notasCaixinha: number;
  suprimentosPixCaixinha: number;
  custoChuvaViagem: number;
  diasChuvaViagem: number;
  custoTotalReal: number;
  participacaoPct: number;
}

export interface FluxoDiaItem {
  data: string;
  diariasPagas: number;
  vales: number;
  caixinhaPix: number;
  caixinhaNotas: number;
  totalSaidaDia: number;
}

export interface ColaboradorResumoGerencial {
  nome: string;
  obraPrincipal: string;
  dias: number;
  bruto: number;
  pago: number;
  vales: number;
  liquidoAPagar: number;
}

function sanitize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function calcularIntervalo(mes: string, periodo: PeriodoGerencial): { inicio: string; fim: string; label: string } {
  const [anoStr, mesStr] = mes.split('-');
  const diasNoMes = new Date(Number(anoStr), Number(mesStr), 0).getDate();
  if (periodo === 'QUINZENA_1') {
    return { inicio: `${mes}-01`, fim: `${mes}-15`, label: `1a Quinzena (${mes})` };
  }
  if (periodo === 'QUINZENA_2') {
    return {
      inicio: `${mes}-16`,
      fim: `${mes}-${String(diasNoMes).padStart(2, '0')}`,
      label: `2a Quinzena (${mes})`,
    };
  }
  return {
    inicio: `${mes}-01`,
    fim: `${mes}-${String(diasNoMes).padStart(2, '0')}`,
    label: `Mensal (${mes})`,
  };
}

/**
 * Gera PDF Executivo Multi-Página (2 páginas A4 Paisagem: 842 x 595 pt)
 * Página 1: KPIs Executivos + DRE / Custo Total por Obra (Mão de Obra + Caixinha + Chuva/Viagem)
 * Página 2: Fluxo Financeiro Cronológico (Dia a Dia) + Posição Líquida por Colaborador
 */
function gerarPdfGerencialMultiPagina(params: {
  empresa: string;
  periodoLabel: string;
  kpis: {
    custoTotalReal: number;
    maoDeObraBruto: number;
    totalPago: number;
    totalVales: number;
    totalNotasCaixinha: number;
    custoChuvaViagem: number;
    saldoLiquidoAPagar: number;
  };
  obras: ObraDreResumo[];
  fluxo: FluxoDiaItem[];
  colaboradores: ColaboradorResumoGerencial[];
}): { base64: string; fileName: string } {
  const { empresa, periodoLabel, kpis, obras, fluxo, colaboradores } = params;
  const emitidoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // ==================== PÁGINA 1: CAPA EXECUTIVA + DRE POR OBRA ====================
  const p1: string[] = [];
  p1.push('0.059 0.090 0.165 rg 20 532 802 46 re f');
  p1.push('0.063 0.725 0.506 rg 20 532 6 46 re f');
  p1.push(`BT 1 1 1 rg /F4 13 Tf 1 0 0 1 36 558 Tm (${sanitize(`RELATORIO GERENCIAL EXECUTIVO — ${empresa.toUpperCase()} (${periodoLabel})`)}) Tj`);
  p1.push(`0.64 0.72 0.82 rg /F3 8 Tf 1 0 0 1 36 542 Tm (${sanitize(`PAGINA 1 DE 2: DRE POR OBRA, CUSTO REAL E IMPACTO CLIMATICO | EMITIDO EM ${emitidoEm}`)}) Tj ET`);

  const cards = [
    { l: 'CUSTO TOTAL REAL', v: `R$ ${kpis.custoTotalReal.toFixed(2)}`, bg: '0.94 0.96 0.99', fg: '0.06 0.09 0.16' },
    { l: 'MAO DE OBRA + VALES', v: `R$ ${kpis.maoDeObraBruto.toFixed(2)}`, bg: '0.92 0.99 0.96', fg: '0.02 0.47 0.34' },
    { l: 'NOTAS CAIXINHA (MAT.)', v: `R$ ${kpis.totalNotasCaixinha.toFixed(2)}`, bg: '0.95 0.94 1.00', fg: '0.31 0.27 0.90' },
    { l: 'LIQUIDO A PAGAR', v: `R$ ${kpis.saldoLiquidoAPagar.toFixed(2)}`, bg: '1.00 0.97 0.88', fg: '0.57 0.25 0.05' },
  ];
  cards.forEach((c, i) => {
    const x = 20 + i * 202;
    p1.push(`${c.bg} rg ${x} 480 194 42 re f`);
    p1.push(`0.85 0.88 0.92 RG 0.5 w ${x} 480 194 42 re S`);
    p1.push(`BT 0.40 0.45 0.52 rg /F4 7 Tf 1 0 0 1 ${x + 10} 508 Tm (${sanitize(c.l)}) Tj`);
    p1.push(`${c.fg} rg /F4 12 Tf 1 0 0 1 ${x + 10} 490 Tm (${sanitize(c.v)}) Tj ET`);
  });

  // Tabela DRE por Obra
  p1.push('BT 0.06 0.09 0.16 rg /F4 10 Tf 1 0 0 1 20 458 Tm (1. CRUZAMENTO FINANCEIRO POR OBRA — DRE SIMPLIFICADO) Tj ET');
  p1.push('0.12 0.16 0.23 rg 20 434 802 18 re f');
  p1.push(
    `BT 1 1 1 rg /F2 7.5 Tf 1 0 0 1 26 440 Tm (${sanitize(
      'OBRA / CANTEIRO'.padEnd(24, ' ') +
        'DIAS'.padStart(7, ' ') +
        'MAO DE OBRA'.padStart(14, ' ') +
        'JA PAGO'.padStart(13, ' ') +
        'VALES'.padStart(12, ' ') +
        'CAIXINHA'.padStart(13, ' ') +
        'CHUVA/VIAG.'.padStart(13, ' ') +
        'CUSTO TOTAL'.padStart(14, ' ') +
        'PART.'.padStart(7, ' ')
    )}) Tj ET`
  );

  let y1 = 418;
  obras.forEach((o, idx) => {
    if (y1 < 64) return;
    if (idx % 2 === 1) p1.push(`0.97 0.98 0.99 rg 20 ${y1 - 4} 802 16 re f`);
    const row =
      o.obraNome.slice(0, 22).padEnd(24, ' ') +
      o.diariasQtd.toFixed(1).padStart(7, ' ') +
      o.maoDeObraBruto.toFixed(2).padStart(14, ' ') +
      o.maoDeObraPago.toFixed(2).padStart(13, ' ') +
      o.valesTotal.toFixed(2).padStart(12, ' ') +
      o.notasCaixinha.toFixed(2).padStart(13, ' ') +
      o.custoChuvaViagem.toFixed(2).padStart(13, ' ') +
      o.custoTotalReal.toFixed(2).padStart(14, ' ') +
      `${o.participacaoPct.toFixed(0)}%`.padStart(7, ' ');
    p1.push(`BT 0.10 0.14 0.20 rg /F1 7.5 Tf 1 0 0 1 26 ${y1} Tm (${sanitize(row)}) Tj ET`);
    y1 -= 16;
  });

  const f1Y = Math.max(42, y1 - 6);
  p1.push(`0.059 0.090 0.165 rg 20 ${f1Y} 802 18 re f`);
  p1.push(
    `BT 1 1 1 rg /F4 8 Tf 1 0 0 1 28 ${f1Y + 6} Tm (${sanitize(
      `CONSOLIDADO: MAO DE OBRA R$ ${kpis.maoDeObraBruto.toFixed(2)} | PAGO R$ ${kpis.totalPago.toFixed(2)} | VALES R$ ${kpis.totalVales.toFixed(2)} | CAIXINHA R$ ${kpis.totalNotasCaixinha.toFixed(2)} | CHUVA/VIAGEM R$ ${kpis.custoChuvaViagem.toFixed(2)} | TOTAL REAL R$ ${kpis.custoTotalReal.toFixed(2)}`
    )}) Tj ET`
  );

  // ==================== PÁGINA 2: FLUXO DE CAIXA DIA A DIA + COLABORADORES ====================
  const p2: string[] = [];
  p2.push('0.059 0.090 0.165 rg 20 532 802 46 re f');
  p2.push('0.063 0.725 0.506 rg 20 532 6 46 re f');
  p2.push(`BT 1 1 1 rg /F4 13 Tf 1 0 0 1 36 558 Tm (${sanitize(`FLUXO FINANCEIRO & POSICAO POR COLABORADOR — ${periodoLabel}`)}) Tj`);
  p2.push(`0.64 0.72 0.82 rg /F3 8 Tf 1 0 0 1 36 542 Tm (${sanitize(`PAGINA 2 DE 2: SAIDAS DIARIAS DE CAIXA E CONFERENCIA INDIVIDUAL | PONTO PATRICIA (DIARIA.AI)`)}) Tj ET`);

  // Bloco Esquerdo: Fluxo de Caixa Dia a Dia
  p2.push('BT 0.06 0.09 0.16 rg /F4 9.5 Tf 1 0 0 1 20 510 Tm (2. FLUXO DE CAIXA DIARIO (DESEMBOLSOS)) Tj ET');
  p2.push('0.12 0.16 0.23 rg 20 488 390 16 re f');
  p2.push(
    `BT 1 1 1 rg /F2 7 Tf 1 0 0 1 26 493 Tm (${sanitize(
      'DATA'.padEnd(11, ' ') + 'DIARIAS PG'.padStart(11, ' ') + 'VALES'.padStart(10, ' ') + 'CAIXINHA'.padStart(11, ' ') + 'TOTAL DIA'.padStart(12, ' ')
    )}) Tj ET`
  );

  let y2L = 472;
  fluxo.slice(0, 26).forEach((fl, idx) => {
    if (y2L < 38) return;
    if (idx % 2 === 1) p2.push(`0.97 0.98 0.99 rg 20 ${y2L - 3} 390 14 re f`);
    const dt = fl.data.includes('-') ? `${fl.data.split('-')[2]}/${fl.data.split('-')[1]}` : fl.data;
    const row =
      dt.padEnd(11, ' ') +
      fl.diariasPagas.toFixed(2).padStart(11, ' ') +
      fl.vales.toFixed(2).padStart(10, ' ') +
      (fl.caixinhaPix + fl.caixinhaNotas).toFixed(2).padStart(11, ' ') +
      fl.totalSaidaDia.toFixed(2).padStart(12, ' ');
    p2.push(`BT 0.10 0.14 0.20 rg /F1 7 Tf 1 0 0 1 26 ${y2L} Tm (${sanitize(row)}) Tj ET`);
    y2L -= 14;
  });

  // Bloco Direito: Posição Líquida por Colaborador
  p2.push('BT 0.06 0.09 0.16 rg /F4 9.5 Tf 1 0 0 1 430 510 Tm (3. POSICAO LIQUIDA POR COLABORADOR) Tj ET');
  p2.push('0.12 0.16 0.23 rg 430 488 392 16 re f');
  p2.push(
    `BT 1 1 1 rg /F2 7 Tf 1 0 0 1 436 493 Tm (${sanitize(
      'COLABORADOR'.padEnd(15, ' ') + 'DIAS'.padStart(6, ' ') + 'BRUTO'.padStart(10, ' ') + 'PAGO'.padStart(9, ' ') + 'VALES'.padStart(9, ' ') + 'A PAGAR'.padStart(10, ' ')
    )}) Tj ET`
  );

  let y2R = 472;
  colaboradores.slice(0, 26).forEach((c, idx) => {
    if (y2R < 38) return;
    if (idx % 2 === 1) p2.push(`0.97 0.98 0.99 rg 430 ${y2R - 3} 392 14 re f`);
    const row =
      c.nome.slice(0, 14).padEnd(15, ' ') +
      c.dias.toFixed(1).padStart(6, ' ') +
      c.bruto.toFixed(0).padStart(10, ' ') +
      c.pago.toFixed(0).padStart(9, ' ') +
      c.vales.toFixed(0).padStart(9, ' ') +
      c.liquidoAPagar.toFixed(0).padStart(10, ' ');
    p2.push(`BT 0.10 0.14 0.20 rg /F1 7 Tf 1 0 0 1 436 ${y2R} Tm (${sanitize(row)}) Tj ET`);
    y2R -= 14;
  });

  const s1 = p1.join('\n');
  const s2 = p2.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 9 0 R] /Count 2 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> >> /Contents 8 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `8 0 obj\n<< /Length ${Buffer.byteLength(s1, 'utf8')} >>\nstream\n${s1}\nendstream\nendobj\n`,
    '9 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> >> /Contents 10 0 R >>\nendobj\n',
    `10 0 obj\n<< /Length ${Buffer.byteLength(s2, 'utf8')} >>\nstream\n${s2}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return {
    base64: Buffer.from(pdf, 'utf8').toString('base64'),
    fileName: `Relatorio-Gerencial-${periodoLabel.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`,
  };
}

async function montarDadosGerenciais(tenantId: string, mes: string, periodo: PeriodoGerencial, obraFiltro: string) {
  const { inicio, fim, label } = calcularIntervalo(mes, periodo);

  const [lancRes, caixaRes, adRes] = await Promise.all([
    supabaseAdmin
      .from('lancamentos_financeiros')
      .select('id, nome_trabalhador, tipo_lancamento, status, fracao_dia, valor_monetario, data_referencia, updated_at, observacao, obra_id, obras_config ( nome, tipo_obra )')
      .eq('tenant_id', tenantId)
      .in('tipo_lancamento', ['PONTO', 'VALE'])
      .neq('status', 'DESCARTADO')
      .gte('data_referencia', inicio)
      .lte('data_referencia', fim),
    supabaseAdmin
      .from('caixa_campo_movimentos')
      .select('data_movimento, obra_nome, tipo_movimento, valor')
      .eq('tenant_id', tenantId)
      .gte('data_movimento', inicio)
      .lte('data_movimento', fim),
    supabaseAdmin
      .from('adiantamentos_diarias')
      .select('quantidade_restante, valor_unitario, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'ATIVO'),
  ]);

  const obrasMap = new Map<string, ObraDreResumo>();
  const fluxoMap = new Map<string, FluxoDiaItem>();
  const colabMap = new Map<string, ColaboradorResumoGerencial>();

  const getObra = (nomeRaw: string) => {
    const key = nomeRaw.toUpperCase();
    if (!obrasMap.has(key)) {
      obrasMap.set(key, {
        obraNome: nomeRaw,
        diariasQtd: 0,
        maoDeObraBruto: 0,
        maoDeObraPago: 0,
        maoDeObraAberto: 0,
        valesTotal: 0,
        notasCaixinha: 0,
        suprimentosPixCaixinha: 0,
        custoChuvaViagem: 0,
        diasChuvaViagem: 0,
        custoTotalReal: 0,
        participacaoPct: 0,
      });
    }
    return obrasMap.get(key)!;
  };

  const getFluxo = (data: string) => {
    if (!fluxoMap.has(data)) {
      fluxoMap.set(data, {
        data,
        diariasPagas: 0,
        vales: 0,
        caixinhaPix: 0,
        caixinhaNotas: 0,
        totalSaidaDia: 0,
      });
    }
    return fluxoMap.get(data)!;
  };

  for (const l of lancRes.data || []) {
    const rel = Array.isArray(l.obras_config) ? l.obras_config[0] : l.obras_config;
    const obraNome = normalizarNomeObraCanonica(rel?.nome, rel?.tipo_obra);
    if (obraFiltro !== 'TODAS' && obraNome.toUpperCase() !== obraFiltro.toUpperCase()) continue;

    const nomeColab = normalizarNomeTrabalhadorCanonico(String(l.nome_trabalhador || 'Colaborador'));
    const val = Math.abs(Number(l.valor_monetario || 0));
    const ob = getObra(obraNome);

    if (!colabMap.has(nomeColab.toUpperCase())) {
      colabMap.set(nomeColab.toUpperCase(), {
        nome: nomeColab,
        obraPrincipal: obraNome,
        dias: 0,
        bruto: 0,
        pago: 0,
        vales: 0,
        liquidoAPagar: 0,
      });
    }
    const col = colabMap.get(nomeColab.toUpperCase())!;

    if (l.tipo_lancamento === 'VALE') {
      ob.valesTotal = Number((ob.valesTotal + val).toFixed(2));
      col.vales = Number((col.vales + val).toFixed(2));
      const fl = getFluxo(String(l.data_referencia));
      fl.vales = Number((fl.vales + val).toFixed(2));
      fl.totalSaidaDia = Number((fl.totalSaidaDia + val).toFixed(2));
    } else {
      const frac = Number(l.fracao_dia ?? 1);
      const obsU = String(l.observacao || '').toUpperCase();
      ob.diariasQtd = Number((ob.diariasQtd + frac).toFixed(2));
      ob.maoDeObraBruto = Number((ob.maoDeObraBruto + val).toFixed(2));
      col.dias = Number((col.dias + frac).toFixed(2));
      col.bruto = Number((col.bruto + val).toFixed(2));

      if (l.status === 'LIQUIDADO') {
        ob.maoDeObraPago = Number((ob.maoDeObraPago + val).toFixed(2));
        col.pago = Number((col.pago + val).toFixed(2));
        const fl = getFluxo(String(l.data_referencia));
        fl.diariasPagas = Number((fl.diariasPagas + val).toFixed(2));
        fl.totalSaidaDia = Number((fl.totalSaidaDia + val).toFixed(2));
      } else {
        ob.maoDeObraAberto = Number((ob.maoDeObraAberto + val).toFixed(2));
      }

      if (
        obsU.includes('CHUVA') ||
        obsU.includes('PARADO') ||
        (obsU.includes('VIAGEM') && !obsU.includes('MOTORISTA'))
      ) {
        ob.custoChuvaViagem = Number((ob.custoChuvaViagem + val).toFixed(2));
        ob.diasChuvaViagem = Number((ob.diasChuvaViagem + frac).toFixed(2));
      }
    }
  }

  for (const c of caixaRes.data || []) {
    const obraNome = normalizarNomeObraCanonica(String(c.obra_nome || 'Geral'));
    if (obraFiltro !== 'TODAS' && obraNome.toUpperCase() !== obraFiltro.toUpperCase()) continue;
    const val = Math.abs(Number(c.valor || 0));
    const ob = getObra(obraNome);
    const fl = getFluxo(String(c.data_movimento));
    if (c.tipo_movimento === 'ENTRADA_PIX') {
      ob.suprimentosPixCaixinha = Number((ob.suprimentosPixCaixinha + val).toFixed(2));
      fl.caixinhaPix = Number((fl.caixinhaPix + val).toFixed(2));
      fl.totalSaidaDia = Number((fl.totalSaidaDia + val).toFixed(2));
    } else if (c.tipo_movimento === 'NOTA_DESPESA') {
      ob.notasCaixinha = Number((ob.notasCaixinha + val).toFixed(2));
      fl.caixinhaNotas = Number((fl.caixinhaNotas + val).toFixed(2));
    }
  }

  const obrasLista = Array.from(obrasMap.values()).map((o) => ({
    ...o,
    custoTotalReal: Number((o.maoDeObraBruto + o.notasCaixinha).toFixed(2)),
  }));
  const custoTotalGeral = obrasLista.reduce((s, o) => s + o.custoTotalReal, 0);
  obrasLista.forEach((o) => {
    o.participacaoPct = custoTotalGeral > 0 ? Number(((o.custoTotalReal / custoTotalGeral) * 100).toFixed(1)) : 0;
  });
  obrasLista.sort((a, b) => b.custoTotalReal - a.custoTotalReal);

  const colaboradores = Array.from(colabMap.values())
    .map((c) => ({
      ...c,
      liquidoAPagar: Number(Math.max(0, c.bruto - c.pago - c.vales).toFixed(2)),
    }))
    .sort((a, b) => b.liquidoAPagar - a.liquidoAPagar);

  const fluxo = Array.from(fluxoMap.values()).sort((a, b) => a.data.localeCompare(b.data));

  const adiantamentosAbertosValor = (adRes.data || []).reduce(
    (s, a) => s + Number(a.quantidade_restante || 0) * Number(a.valor_unitario || 0),
    0
  );

  const kpis = {
    custoTotalReal: Number(custoTotalGeral.toFixed(2)),
    maoDeObraBruto: Number(obrasLista.reduce((s, o) => s + o.maoDeObraBruto, 0).toFixed(2)),
    totalPago: Number(obrasLista.reduce((s, o) => s + o.maoDeObraPago, 0).toFixed(2)),
    totalVales: Number(obrasLista.reduce((s, o) => s + o.valesTotal, 0).toFixed(2)),
    totalNotasCaixinha: Number(obrasLista.reduce((s, o) => s + o.notasCaixinha, 0).toFixed(2)),
    custoChuvaViagem: Number(obrasLista.reduce((s, o) => s + o.custoChuvaViagem, 0).toFixed(2)),
    saldoLiquidoAPagar: Number(colaboradores.reduce((s, c) => s + c.liquidoAPagar, 0).toFixed(2)),
    adiantamentosAbertosValor: Number(adiantamentosAbertosValor.toFixed(2)),
  };

  return { periodoLabel: label, inicio, fim, kpis, obras: obrasLista, fluxo, colaboradores };
}

export async function GET(req: NextRequest) {
  try {
    const tenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const mes = searchParams.get('mes') || new Date().toISOString().slice(0, 7);
    const periodo = (searchParams.get('periodo') as PeriodoGerencial) || 'MENSAL';
    const obra = searchParams.get('obra') || 'TODAS';

    const dados = await montarDadosGerenciais(tenant.id, mes, periodo, obra);
    return NextResponse.json({ success: true, empresa: tenant.nome, ...dados });
  } catch (err) {
    console.error('[GET /api/relatorio-gerencial]', err);
    return NextResponse.json({ error: 'Erro ao montar Relatório Gerencial.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as {
      acao: 'PDF_BAIXAR' | 'PDF_ZAP';
      mes: string;
      periodo: PeriodoGerencial;
      obra?: string;
      destinatario?: 'PATRICIA' | 'DANIEL' | 'JOABSON';
      telefoneCustom?: string;
    };

    const dados = await montarDadosGerenciais(
      tenant.id,
      body.mes || new Date().toISOString().slice(0, 7),
      body.periodo || 'MENSAL',
      body.obra || 'TODAS'
    );

    const { base64, fileName } = gerarPdfGerencialMultiPagina({
      empresa: tenant.nome,
      periodoLabel: dados.periodoLabel,
      kpis: dados.kpis,
      obras: dados.obras,
      fluxo: dados.fluxo,
      colaboradores: dados.colaboradores,
    });

    if (body.acao === 'PDF_BAIXAR') {
      return NextResponse.json({ success: true, pdfBase64: base64, fileName });
    }

    let tel = String(body.telefoneCustom || '').replace(/\D/g, '');
    if (!tel) {
      if (body.destinatario === 'PATRICIA') tel = '5511978543369';
      else if (body.destinatario === 'DANIEL') tel = '5511988139833';
      else {
        const { data: row } = await supabaseAdmin
          .from('funcionarios_obra')
          .select('telefone')
          .eq('tenant_id', tenant.id)
          .ilike('nome_trabalhador', '%joabson%')
          .limit(1)
          .maybeSingle();
        tel = String(row?.telefone || '').replace(/\D/g, '');
      }
    }

    const baileysBase = (
      process.env.BAILEYS_SERVER_URL ||
      process.env.BAILEYS_LOCAL_URL ||
      'http://127.0.0.1:3001'
    ).replace(/\/+$/, '');

    let enviado = false;
    if (tel) {
      try {
        const r = await fetch(`${baileysBase}/send-document`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: tel,
            to: tel,
            jid: `${tel}@s.whatsapp.net`,
            fileName,
            mimetype: 'application/pdf',
            base64,
            caption: `📊 *RELATÓRIO GERENCIAL EXECUTIVO (${dados.periodoLabel})*\n💰 Custo Total Real: R$ ${dados.kpis.custoTotalReal.toFixed(2)}\n💵 Líquido a Pagar: R$ ${dados.kpis.saldoLiquidoAPagar.toFixed(2)}\n_Ponto Patrícia (Diária.AI)_`,
          }),
        });
        enviado = r.ok;
      } catch {
        enviado = false;
      }
    }

    return NextResponse.json({
      success: true,
      enviadoViaWhatsApp: enviado,
      pdfBase64: base64,
      fileName,
      message: enviado
        ? `PDF Gerencial (2 páginas) enviado no WhatsApp!`
        : 'PDF Gerencial (2 páginas) baixado automaticamente.',
    });
  } catch (err) {
    console.error('[POST /api/relatorio-gerencial]', err);
    return NextResponse.json({ error: 'Falha ao gerar PDF Gerencial.' }, { status: 500 });
  }
}
