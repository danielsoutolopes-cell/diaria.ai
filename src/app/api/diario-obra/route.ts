import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { uploadToR2 } from '@/services/r2Storage';
import { gerarPdfDiarioBase64 } from '@/lib/pdfDiario';
import { listarEquipesDiarioTenant } from '@/services/diarioEquipesService';
import {
  isSubempreitaHabilitada,
  montarTextoOcorrencia,
  normalizarTextoBusca,
  sanitizarStatusCondominio,
  type DiarioObraRegistro,
  type EfetivoItem,
} from '@/lib/diarioObraRelatorio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

export type { DiarioObraRegistro, EfetivoItem };

export const dynamic = 'force-dynamic';

interface EscopoMedicaoMin {
  obraNome?: string;
  etapas?: Array<{ id?: string; nome?: string }>;
}

async function lerDiariosEEtapesDoTenant(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  diarios: DiarioObraRegistro[];
  etapasPorObra: Record<string, Array<{ id: string | null; nome: string }>>;
}> {
  const { data: paramData } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs = ((paramData?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;
  const diarios = Array.isArray(configs.diarios_obra)
    ? (configs.diarios_obra as DiarioObraRegistro[])
    : [];

  const etapasPorObra: Record<string, Array<{ id: string | null; nome: string }>> = {};
  if (Array.isArray(configs.medicoes_escopo)) {
    const escopos = configs.medicoes_escopo as EscopoMedicaoMin[];
    for (const escopo of escopos) {
      const chaveObra = normalizarTextoBusca(escopo.obraNome);
      if (!chaveObra || !Array.isArray(escopo.etapas)) continue;
      etapasPorObra[chaveObra] = escopo.etapas
        .filter((e) => Boolean(e?.nome?.trim()))
        .map((e) => ({
          id: e.id || null,
          nome: String(e.nome).trim(),
        }));
    }
  }

  // Etapas gerenciadas em /setup -> Obras & Etapas (Intermack)
  const rawSetupEtapas = configs.etapas_por_obra_v22 as
    | Record<string, unknown>
    | undefined;
  if (rawSetupEtapas && typeof rawSetupEtapas === 'object') {
    for (const [chaveBruta, lista] of Object.entries(rawSetupEtapas)) {
      const chaveObra = normalizarTextoBusca(chaveBruta);
      if (!chaveObra || !Array.isArray(lista)) continue;
      const existentes = etapasPorObra[chaveObra] || [];
      const vistos = new Set(existentes.map((e) => normalizarTextoBusca(e.nome)));
      const combinadas = [...existentes];
      for (const item of lista) {
        const nomeLimpo = String(item || '').trim();
        const chaveEt = normalizarTextoBusca(nomeLimpo);
        if (!chaveEt || vistos.has(chaveEt)) continue;
        vistos.add(chaveEt);
        combinadas.push({ id: null, nome: nomeLimpo });
      }
      etapasPorObra[chaveObra] = combinadas;
    }
  }

  return {
    paramId: (paramData?.id as string | undefined) || null,
    configs,
    diarios,
    etapasPorObra,
  };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const subempreitaAtiva = isSubempreitaHabilitada(activeTenant.slug);

    const [{ diarios, etapasPorObra }, resObras] = await Promise.all([
      lerDiariosEEtapesDoTenant(activeTenant.id),
      supabaseAdmin
        .from('obras_config')
        .select('id, nome, tipo_obra, ativo')
        .eq('tenant_id', activeTenant.id)
        .eq('ativo', true)
        .order('nome', { ascending: true }),
    ]);

    const obras = (resObras.data || []).map((o) => ({
      id: String(o.id),
      nome: String(o.nome),
      tipoObra: o.tipo_obra ? String(o.tipo_obra) : null,
    }));

    // Subempreita (Empreiteiro × Funcionário + Etapas) carregada somente na Intermack
    const equipes = subempreitaAtiva
      ? await listarEquipesDiarioTenant(activeTenant.id)
      : { empreiteiros: [], funcionarios: [], usandoFallback: false };

    return NextResponse.json({
      tenant: activeTenant,
      subempreitaAtiva,
      diarios,
      obras,
      etapasPorObra: subempreitaAtiva ? etapasPorObra : {},
      empreiteiros: equipes.empreiteiros,
      funcionarios: equipes.funcionarios,
    });
  } catch (error) {
    console.error('Erro em GET /api/diario-obra:', error);
    return NextResponse.json(
      {
        diarios: [],
        obras: [],
        empreiteiros: [],
        funcionarios: [],
        etapasPorObra: {},
        subempreitaAtiva: false,
        error: 'Erro ao carregar diários de obra.',
      },
      { status: 500 }
    );
  }
}

interface DiarioPostBody {
  action: 'salvar' | 'excluir' | 'efetivo-dia' | 'refinar' | 'enviar-whatsapp';
  id?: string;
  destinoJid?: string;
  filtroEmpreiteiro?: string;
  obraId?: string | null;
  obraNome?: string;
  ambiente?: 'INTERNO' | 'EXTERNO';
  data?: string;
  clima?: string;
  statusCondominio?: string;
  ocorrenciaTipo?: string;
  empreiteiroId?: string | null;
  empreiteiro?: string;
  etapaId?: string | null;
  etapaNome?: string | null;
  efetivo?: EfetivoItem[];
  resumo?: string;
  ocorrencias?: string;
  fotosBase64?: string[];
  usuarioLogado?: string;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const subempreitaAtiva = isSubempreitaHabilitada(activeTenant.slug);
    const body = (await req.json()) as DiarioPostBody;

    // 0. Refinar rascunho de resumo com IA (Gemini)
    if (body.action === 'refinar') {
      const rascunho = (body.resumo || '').trim();
      if (!rascunho) {
        return NextResponse.json(
          { error: 'Escreva um rascunho primeiro.' },
          { status: 400 }
        );
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({
          success: true,
          resumoRefinado: rascunho,
          aviso: 'GEMINI_API_KEY não configurada; mantendo texto original.',
        });
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const contextoExtra =
        subempreitaAtiva && (body.etapaNome || body.empreiteiro)
          ? ` Etapa/Serviço: ${body.etapaNome || 'Geral'}. Empreiteiro: ${body.empreiteiro || 'Equipe'}.`
          : '';
      const prompt = `Reescreva o rascunho abaixo de um Diário de Obra (${activeTenant.nome}, Obra: ${body.obraNome || 'Obra'}.${contextoExtra}) em português claro, profissional e objetivo para enviar ao cliente final. Mantenha no máximo 4 frases curtas ou 3-4 tópicos diretos. Não invente informações nem mencione valores financeiros.\n\nRascunho:\n${rascunho}`;
      const result = await model.generateContent(prompt);
      const texto = result.response.text().trim();
      return NextResponse.json({ success: true, resumoRefinado: texto || rascunho });
    }

    // 1. Puxar efetivo validado do dia (sem valores financeiros)
    if (body.action === 'efetivo-dia') {
      const dataRef = body.data || new Date().toISOString().split('T')[0];
      const { data: lancs } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select('nome_trabalhador, fracao_dia, obras_config ( nome )')
        .eq('tenant_id', activeTenant.id)
        .eq('tipo_lancamento', 'PONTO')
        .eq('data_referencia', dataRef)
        .neq('status', 'DESCARTADO')
        .neq('status', 'CANCELADO');

      const equipes = subempreitaAtiva
        ? await listarEquipesDiarioTenant(activeTenant.id)
        : { empreiteiros: [], funcionarios: [] };

      const filtroObra = (body.obraNome || '').trim().toLowerCase();
      const efetivo: EfetivoItem[] = [];

      for (const row of lancs || []) {
        const obraRow = (
          row as unknown as { obras_config?: { nome?: string | null } | null }
        ).obras_config?.nome;
        if (
          filtroObra &&
          obraRow &&
          !obraRow.toLowerCase().includes(filtroObra)
        ) {
          continue;
        }
        const fracao = Number(row.fracao_dia || 0);
        if (fracao <= 0) continue;

        const nomeBruto = String(row.nome_trabalhador || 'Profissional').trim();
        if (subempreitaAtiva) {
          const norm = normalizarTextoBusca(nomeBruto);
          const matchFunc = equipes.funcionarios.find(
            (f) =>
              normalizarTextoBusca(f.nomeOficial) === norm ||
              f.apelidos.some((ap) => normalizarTextoBusca(ap) === norm)
          );
          efetivo.push({
            funcionarioId: matchFunc?.id || null,
            nome: matchFunc?.nomeOficial || nomeBruto,
            apelidos: matchFunc?.apelidos || [],
            documento: matchFunc?.documento || null,
            empreiteiroId: matchFunc?.empreiteiroId || null,
            empreiteiroNome: matchFunc?.empreiteiroNome || null,
            etapaNome: body.etapaNome || null,
            periodo: fracao >= 1 ? 'INTEGRAL' : 'MEIO_DIA',
          });
        } else {
          efetivo.push({
            nome: nomeBruto,
            periodo: fracao >= 1 ? 'INTEGRAL' : 'MEIO_DIA',
          });
        }
      }

      return NextResponse.json({ success: true, efetivo });
    }

    const { paramId, configs, diarios } = await lerDiariosEEtapesDoTenant(
      activeTenant.id
    );

    // 2. Enviar Diário de Obra em PDF (Base64) para WhatsApp via Baileys
    if (body.action === 'enviar-whatsapp' && body.id) {
      const diario = diarios.find((d) => d.id === body.id);
      if (!diario) {
        return NextResponse.json({ error: 'Diário não encontrado.' }, { status: 404 });
      }

      const filtroEmp = subempreitaAtiva
        ? (body.filtroEmpreiteiro || '').trim() || undefined
        : undefined;
      const { base64, fileName } = gerarPdfDiarioBase64(diario, filtroEmp);
      const destino = (body.destinoJid || '').trim() || '5511978543369';
      const baileysBase =
        process.env.BAILEYS_API_URL ||
        process.env.WHATSAPP_API_URL ||
        'https://diaria-ai.onrender.com';

      const legenda =
        `📋 *DIÁRIO DE OBRA — ${diario.empresaNome.toUpperCase()}*\n` +
        `🏗️ *Obra:* ${diario.obraNome} | 📅 ${diario.data}\n` +
        (filtroEmp ? `👷 *Empreiteiro:* ${filtroEmp}\n` : '') +
        `👥 *Efetivo:* ${diario.efetivo.length} profissional(is)`;

      let enviado = false;
      try {
        const resDoc = await fetch(`${baileysBase}/send-document`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: destino,
            phone: destino,
            jid: destino,
            fileName,
            mimetype: 'application/pdf',
            base64,
            caption: legenda,
          }),
        });
        enviado = resDoc.ok;
      } catch (errSend) {
        console.error('Erro ao disparar PDF via Baileys:', errSend);
      }

      return NextResponse.json({
        success: true,
        enviadoViaWhatsApp: enviado,
        destino,
        fileName,
        pdfBase64: base64,
        message: enviado
          ? `PDF (${fileName}) enviado com sucesso para o WhatsApp!`
          : `PDF (${fileName}) gerado para download. Conecte o WhatsApp para envio automático.`,
      });
    }

    // 3. Excluir um diário
    if (body.action === 'excluir' && body.id) {
      const atualizados = diarios.filter((d) => d.id !== body.id);
      const novasConfigs = { ...configs, diarios_obra: atualizados };
      if (paramId) {
        await supabaseAdmin
          .from('parametros_sistema')
          .update({ configuracoes: novasConfigs })
          .eq('id', paramId)
          .eq('tenant_id', activeTenant.id);
      }
      return NextResponse.json({ success: true, diarios: atualizados });
    }

    // 4. Salvar novo diário com upload de até 3 fotos no R2 (fallback para dataURL)
    if (body.action === 'salvar') {
      const fotosInput = (body.fotosBase64 || []).slice(0, 3);
      const fotosUrls: string[] = [];

      for (let i = 0; i < fotosInput.length; i++) {
        const raw = fotosInput[i];
        if (!raw) continue;
        if (raw.startsWith('http://') || raw.startsWith('https://')) {
          fotosUrls.push(raw);
          continue;
        }
        try {
          const cleanBase64 = raw.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(cleanBase64, 'base64');
          const safeObra = (body.obraNome || 'obra')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-');
          const fileName = `diario-${activeTenant.slug}-${safeObra}-${Date.now()}-${i + 1}.jpg`;
          const uploadRes = await uploadToR2(buffer, fileName, 'image/jpeg');
          if (uploadRes.success && uploadRes.url) {
            fotosUrls.push(uploadRes.url);
          } else {
            fotosUrls.push(raw);
          }
        } catch {
          fotosUrls.push(raw);
        }
      }

      const efetivoLimpo: EfetivoItem[] = (body.efetivo || [])
        .filter((e) => e.nome.trim().length > 0)
        .map((e) => {
          if (!subempreitaAtiva) {
            return {
              nome: e.nome.trim(),
              periodo: e.periodo === 'MEIO_DIA' ? 'MEIO_DIA' : 'INTEGRAL',
            };
          }
          return {
            funcionarioId: e.funcionarioId || null,
            nome: e.nome.trim(),
            apelidos: Array.isArray(e.apelidos) ? e.apelidos : [],
            documento: e.documento?.trim() || null,
            empreiteiroId: e.empreiteiroId ?? body.empreiteiroId ?? null,
            empreiteiroNome:
              (e.empreiteiroNome || body.empreiteiro || '').trim() || null,
            etapaId: e.etapaId ?? body.etapaId ?? null,
            etapaNome: (e.etapaNome || body.etapaNome || '').trim() || null,
            periodo: e.periodo === 'MEIO_DIA' ? 'MEIO_DIA' : 'INTEGRAL',
          };
        });

      const ocorrenciaTipo = (body.ocorrenciaTipo || '').trim();
      const ocorrenciasFinal = montarTextoOcorrencia(
        ocorrenciaTipo,
        body.ocorrencias
      );

      const novoRegistro: DiarioObraRegistro = {
        id: crypto.randomUUID(),
        tenantSlug: activeTenant.slug,
        empresaNome: activeTenant.nome,
        obraId: body.obraId || null,
        obraNome: (body.obraNome || 'OBRA SEM NOME').trim().toUpperCase(),
        ambiente:
          body.ambiente || (subempreitaAtiva ? 'INTERNO' : 'EXTERNO'),
        data: body.data || new Date().toISOString().split('T')[0],
        clima: body.clima || 'Ensolarado',
        statusCondominio: sanitizarStatusCondominio(body.statusCondominio),
        ocorrenciaTipo: ocorrenciaTipo || undefined,
        empreiteiroId: subempreitaAtiva ? body.empreiteiroId || null : null,
        empreiteiro: subempreitaAtiva
          ? (body.empreiteiro || '').trim()
          : '',
        etapaId: subempreitaAtiva ? body.etapaId || null : null,
        etapaNome: subempreitaAtiva
          ? (body.etapaNome || '').trim() || null
          : null,
        efetivo: efetivoLimpo,
        resumo: (body.resumo || '').trim(),
        ocorrencias: ocorrenciasFinal,
        fotos: fotosUrls,
        criadoPor: body.usuarioLogado || 'Patrícia Grubel',
        criadoEm: new Date().toISOString(),
      };

      const atualizados = [novoRegistro, ...diarios];
      const novasConfigs = { ...configs, diarios_obra: atualizados };

      if (paramId) {
        await supabaseAdmin
          .from('parametros_sistema')
          .update({ configuracoes: novasConfigs })
          .eq('id', paramId)
          .eq('tenant_id', activeTenant.id);
      } else {
        await supabaseAdmin.from('parametros_sistema').insert({
          tenant_id: activeTenant.id,
          configuracoes: novasConfigs,
        });
      }

      return NextResponse.json({
        success: true,
        diario: novoRegistro,
        diarios: atualizados,
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro em POST /api/diario-obra:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar diário de obra.' },
      { status: 500 }
    );
  }
}
