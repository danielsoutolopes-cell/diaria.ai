import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import type { NLPExtracaoResponse } from '@/types/database';
import type { ResultadoSanitizacaoMensagem } from '@/lib/extracaoDiariasParser';

export type TipoRegraAprendizado =
  | 'ALIAS_TRABALHADOR'
  | 'ALIAS_OBRA'
  | 'ASSINATURA_ESTRUTURAL'
  | 'EXPRESSAO_RECORRENTE'
  | 'FRACAO_PADRAO';

export type OrigemAprendizado =
  | 'SEED_OFICIAL'
  | 'AUTO_PASSAGEM_2'
  | 'CORRECAO_HUMANA'
  | 'MANUAL_ADMIN';

export interface HabitosEscritaRemetente {
  usaPontoFinalCabecalho?: boolean;
  usaLinhasEmBranco?: boolean;
  usaIniciaisComPonto?: boolean;
  expressoesRecorrentes?: string[];
  ultimaObraValidada?: string;
}

export interface SenderProfileRecord {
  id: string;
  tenant_id: string;
  remetente_telefone: string;
  remetente_nome: string;
  obra_padrao_sugerida: string | null;
  habitos_escrita: HabitosEscritaRemetente;
  total_mensagens_validadas: number;
  ultimo_envio_em: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ParserLearningRuleRecord {
  id: string;
  tenant_id: string;
  sender_profile_id?: string | null;
  remetente_telefone: string | null;
  remetente_nome: string | null;
  tipo_regra: TipoRegraAprendizado;
  origem_padrao: string;
  destino_canonico: string;
  origem_aprendizado: OrigemAprendizado;
  confianca: number;
  ocorrencias: number;
  exemplo_mensagem: string | null;
  ativo: boolean;
  criado_por: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContextoAprendizadoRemetente {
  tenantId: string;
  remetenteTelefone: string | null;
  perfilRemetente: SenderProfileRecord | null;
  regrasAtivas: ParserLearningRuleRecord[];
}

interface MemoriaFallbackConfig {
  rules: ParserLearningRuleRecord[];
  senderProfiles: SenderProfileRecord[];
}

function normalizarTelefone(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

function chaveNorm(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extrai o telefone do remetente salvo no cabeçalho pericial de ponto_lote.texto_original.
 */
export function extrairRemetenteDeTextoLote(
  textoOriginal: string | null | undefined
): string | null {
  if (!textoOriginal) return null;
  const match = textoOriginal.match(/Remetente:\s*([^\n]+)/);
  if (!match || !match[1]) return null;
  return normalizarTelefone(match[1]);
}

/**
 * Aplica regras aprendidas (aliases de trabalhador e de obra) sobre o texto higienizado
 * ANTES de enviar à IA, priorizando regras específicas do remetente sobre regras globais do tenant.
 * Nunca altera o texto original bruto de auditoria.
 */
export function aplicarRegrasAprendidasTexto(
  textoHigienizado: string,
  contexto: ContextoAprendizadoRemetente
): {
  textoEnriquecido: string;
  regrasAplicadas: string[];
} {
  if (!textoHigienizado || contexto.regrasAtivas.length === 0) {
    return { textoEnriquecido: textoHigienizado, regrasAplicadas: [] };
  }

  // Prioridade: regras do remetente específico primeiro, depois tenant-wide, depois mais longas
  const ordenadas = [...contexto.regrasAtivas]
    .filter(
      (r) =>
        r.ativo &&
        (r.tipo_regra === 'ALIAS_TRABALHADOR' || r.tipo_regra === 'ALIAS_OBRA')
    )
    .sort((a, b) => {
      const aSpec = a.remetente_telefone ? 1 : 0;
      const bSpec = b.remetente_telefone ? 1 : 0;
      if (bSpec !== aSpec) return bSpec - aSpec;
      return b.origem_padrao.length - a.origem_padrao.length;
    });

  const regrasAplicadas: string[] = [];
  const linhas = textoHigienizado.split('\n');

  const linhasTransformadas = linhas.map((linha) => {
    let atual = linha;
    for (const regra of ordenadas) {
      const origemLimpa = regra.origem_padrao.trim();
      const destinoLimpo = regra.destino_canonico.trim();
      if (!origemLimpa || !destinoLimpo) continue;
      if (chaveNorm(origemLimpa) === chaveNorm(destinoLimpo)) continue;

      // Match exato de linha inteira (muito seguro para listas verticais de trabalhadores)
      if (chaveNorm(atual) === chaveNorm(origemLimpa)) {
        atual = destinoLimpo;
        regrasAplicadas.push(`${origemLimpa} -> ${destinoLimpo}`);
        break;
      }

      // Match por fronteira de palavra dentro da linha (ex.: "Wender 22 0.5", "José baiano chuva")
      const regexPalavra = new RegExp(
        `(^|[\\s,;:(-])${escapeRegex(origemLimpa)}(?=$|[\\s,;:)\\-])`,
        'i'
      );
      if (regexPalavra.test(atual)) {
        atual = atual.replace(regexPalavra, `$1${destinoLimpo}`);
        regrasAplicadas.push(`${origemLimpa} -> ${destinoLimpo}`);
      }
    }
    return atual;
  });

  return {
    textoEnriquecido: linhasTransformadas.join('\n'),
    regrasAplicadas: Array.from(new Set(regrasAplicadas)),
  };
}

/**
 * Gera o bloco dinâmico de exemplos few-shot e hábitos do remetente para injeção no
 * prompt de sistema do Gemini (Passagem 2), isolado estritamente ao tenant ativo.
 */
export function gerarBlocoFewShotPrompt(
  contexto: ContextoAprendizadoRemetente
): string {
  const { perfilRemetente, regrasAtivas } = contexto;
  const ativas = regrasAtivas.filter((r) => r.ativo);

  if (!perfilRemetente && ativas.length === 0) {
    return '';
  }

  const linhas: string[] = [
    '\n\nMEMÓRIA DE APRENDIZADO CONTÍNUO DE CAMPO (ISOLADA POR EMPRESA/REMETENTE):',
  ];

  if (perfilRemetente) {
    linhas.push(
      `PERFIL DO REMETENTE ATIVO: ${perfilRemetente.remetente_nome} (${perfilRemetente.remetente_telefone})`
    );
    if (perfilRemetente.obra_padrao_sugerida) {
      linhas.push(
        `• Contexto Padrão de Obra deste remetente: "${perfilRemetente.obra_padrao_sugerida}" (use como sugestão se ele omitir o nome da obra na mensagem).`
      );
    }
    const habitos = perfilRemetente.habitos_escrita || {};
    const listaHabitos: string[] = [];
    if (habitos.usaPontoFinalCabecalho) {
      listaHabitos.push('coloca ponto final no cabeçalho da obra/data');
    }
    if (habitos.usaLinhasEmBranco) {
      listaHabitos.push('usa linhas em branco entre cabeçalho e nomes');
    }
    if (habitos.usaIniciaisComPonto) {
      listaHabitos.push('abrevia iniciais com ponto (ex.: "Lucas. J")');
    }
    if (listaHabitos.length > 0) {
      linhas.push(`• Hábitos de escrita aprendidos: ${listaHabitos.join('; ')}.`);
    }
  }

  const aliasesTrab = ativas
    .filter((r) => r.tipo_regra === 'ALIAS_TRABALHADOR')
    .slice(0, 20);
  if (aliasesTrab.length > 0) {
    linhas.push('ALIASES APRENDIDOS DE TRABALHADORES (FEW-SHOT):');
    for (const r of aliasesTrab) {
      linhas.push(`• "${r.origem_padrao}" -> "${r.destino_canonico}"`);
    }
  }

  const aliasesObra = ativas
    .filter((r) => r.tipo_regra === 'ALIAS_OBRA')
    .slice(0, 10);
  if (aliasesObra.length > 0) {
    linhas.push('ALIASES APRENDIDOS DE OBRAS:');
    for (const r of aliasesObra) {
      linhas.push(`• "${r.origem_padrao}" -> "${r.destino_canonico}"`);
    }
  }

  const expressoes = ativas
    .filter(
      (r) =>
        r.tipo_regra === 'EXPRESSAO_RECORRENTE' ||
        r.tipo_regra === 'ASSINATURA_ESTRUTURAL'
    )
    .slice(0, 8);
  if (expressoes.length > 0) {
    linhas.push('PADRÕES ESTRUTURAIS E EXPRESSÕES RECORRENTES APRENDIDAS:');
    for (const r of expressoes) {
      const ex = r.exemplo_mensagem
        ? ` | Ex.: "${r.exemplo_mensagem.replace(/\n/g, ' / ').slice(0, 90)}"`
        : '';
      linhas.push(`• ${r.origem_padrao} => ${r.destino_canonico}${ex}`);
    }
  }

  const fracoes = ativas
    .filter((r) => r.tipo_regra === 'FRACAO_PADRAO')
    .slice(0, 6);
  if (fracoes.length > 0) {
    linhas.push('AJUSTES DE FRAÇÃO APRENDIDOS:');
    for (const r of fracoes) {
      linhas.push(`• ${r.origem_padrao} => fracao ${r.destino_canonico}`);
    }
  }

  return linhas.join('\n');
}

/**
 * Gera a assinatura estrutural de uma mensagem que precisou de 2ª passagem complementar,
 * permitindo que futuras mensagens semelhantes sejam extraídas em 1 única passada.
 */
export function extrairAssinaturaEstruturalMensagem(
  textoOriginal: string,
  sanitizacao: ResultadoSanitizacaoMensagem,
  extracao: NLPExtracaoResponse
): {
  assinatura: string;
  descricaoDestino: string;
  habitosDetectados: HabitosEscritaRemetente;
} {
  const tokens: string[] = [];
  const habitosDetectados: HabitosEscritaRemetente = {};

  if (sanitizacao.alteracoesAplicadas.includes('REMOVER_PONTOS_FINAIS_TEXTO')) {
    tokens.push('CABECALHO_PONTO_FINAL');
    habitosDetectados.usaPontoFinalCabecalho = true;
  }
  if (sanitizacao.alteracoesAplicadas.includes('COLAPSAR_QUEBRAS_E_RUIDO')) {
    tokens.push('LINHA_EM_BRANCO');
    habitosDetectados.usaLinhasEmBranco = true;
  }
  if (sanitizacao.alteracoesAplicadas.includes('NORMALIZAR_INICIAIS_COM_PONTO')) {
    tokens.push('INICIAL_COM_PONTO');
    habitosDetectados.usaIniciaisComPonto = true;
  }
  if (tokens.length === 0) {
    tokens.push('LISTA_VERTICAL_CAMPO');
  }

  const totalNomes = extracao.obras.reduce(
    (acc, o) => acc + (o.apontamentos?.length || 0),
    0
  );
  const primeiraObra = extracao.obras[0]?.nome_obra || 'GERAL';

  return {
    assinatura: tokens.join('+'),
    descricaoDestino: `LISTA_VERTICAL_COMPLETA (${totalNomes} nomes • obra ${primeiraObra})`,
    habitosDetectados,
  };
}

/**
 * Sugere a obra padrão do remetente quando o ajudante omitiu o canteiro (nome_obra = "GERAL").
 */
export function sugerirObraPadraoSeOmitida(
  extracao: NLPExtracaoResponse,
  perfilRemetente: SenderProfileRecord | null
): {
  extracao: NLPExtracaoResponse;
  obraSugeridaAplicada: string | null;
} {
  const obraPadrao = perfilRemetente?.obra_padrao_sugerida?.trim();
  if (!obraPadrao || !extracao.obras || extracao.obras.length === 0) {
    return { extracao, obraSugeridaAplicada: null };
  }

  let aplicada: string | null = null;
  const obrasAtualizadas = extracao.obras.map((o) => {
    const obraAtualUpper = chaveNorm(o.nome_obra || '');
    if (!obraAtualUpper || obraAtualUpper === 'GERAL' || obraAtualUpper === 'CANTEIRO GERAL') {
      aplicada = normalizarNomeObraCanonica(obraPadrao);
      return {
        ...o,
        nome_obra: aplicada,
      };
    }
    return o;
  });

  return {
    extracao: { obras: obrasAtualizadas },
    obraSugeridaAplicada: aplicada,
  };
}

// ============================================================================
// CAMADA DE PERSISTÊNCIA MULTI-TENANT (Supabase tabelas V18 + Fallback seguro)
// ============================================================================

async function lerFallbackParametros(
  tenantId: string
): Promise<{ paramRowId: string | null; cfg: Record<string, unknown>; mem: MemoriaFallbackConfig }> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  const cfg = ((data?.configuracoes || {}) as Record<string, unknown>);
  const rawMem = (cfg.aprendizado_campo_v18 || {}) as Partial<MemoriaFallbackConfig>;
  return {
    paramRowId: data?.id ? String(data.id) : null,
    cfg,
    mem: {
      rules: Array.isArray(rawMem.rules) ? rawMem.rules : [],
      senderProfiles: Array.isArray(rawMem.senderProfiles) ? rawMem.senderProfiles : [],
    },
  };
}

async function salvarFallbackParametros(
  tenantId: string,
  paramRowId: string | null,
  cfg: Record<string, unknown>,
  mem: MemoriaFallbackConfig
): Promise<void> {
  const novasCfg = {
    ...cfg,
    aprendizado_campo_v18: mem,
  };
  if (paramRowId) {
    await supabaseAdmin
      .from('parametros_sistema')
      .update({ configuracoes: novasCfg })
      .eq('id', paramRowId)
      .eq('tenant_id', tenantId);
  } else {
    await supabaseAdmin.from('parametros_sistema').insert({
      tenant_id: tenantId,
      configuracoes: novasCfg,
    });
  }
}

export async function listarMemoriaAprendizado(tenantId: string): Promise<{
  rules: ParserLearningRuleRecord[];
  senderProfiles: SenderProfileRecord[];
  fonte: 'TABELAS_V18' | 'PARAMETROS_FALLBACK';
}> {
  const [resRules, resProfiles] = await Promise.all([
    supabaseAdmin
      .from('parser_learning_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('ocorrencias', { ascending: false })
      .order('updated_at', { ascending: false }),
    supabaseAdmin
      .from('sender_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('total_mensagens_validadas', { ascending: false }),
  ]);

  if (!resRules.error && !resProfiles.error) {
    const rules = ((resRules.data || []) as unknown as ParserLearningRuleRecord[]).map((r) => ({
      ...r,
      confianca: Number(r.confianca ?? 1),
      ocorrencias: Number(r.ocorrencias ?? 1),
    }));
    const senderProfiles = (resProfiles.data || []) as unknown as SenderProfileRecord[];
    return { rules, senderProfiles, fonte: 'TABELAS_V18' };
  }

  const fb = await lerFallbackParametros(tenantId);
  return {
    rules: fb.mem.rules,
    senderProfiles: fb.mem.senderProfiles,
    fonte: 'PARAMETROS_FALLBACK',
  };
}

export async function carregarContextoAprendizado(
  tenantId: string,
  remetenteTelefoneRaw?: string | null
): Promise<ContextoAprendizadoRemetente> {
  const tel = normalizarTelefone(remetenteTelefoneRaw);
  try {
    const memoria = await listarMemoriaAprendizado(tenantId);
    const perfilRemetente = tel
      ? memoria.senderProfiles.find(
          (p) => normalizarTelefone(p.remetente_telefone) === tel
        ) || null
      : null;

    const regrasAtivas = memoria.rules.filter((r) => {
      if (!r.ativo) return false;
      if (!r.remetente_telefone) return true;
      return tel !== null && normalizarTelefone(r.remetente_telefone) === tel;
    });

    return {
      tenantId,
      remetenteTelefone: tel,
      perfilRemetente,
      regrasAtivas,
    };
  } catch {
    return {
      tenantId,
      remetenteTelefone: tel,
      perfilRemetente: null,
      regrasAtivas: [],
    };
  }
}

export async function registrarRegraAprendida(params: {
  tenantId: string;
  tipoRegra: TipoRegraAprendizado;
  origemPadrao: string;
  destinoCanonico: string;
  origemAprendizado: OrigemAprendizado;
  remetenteTelefone?: string | null;
  remetenteNome?: string | null;
  exemploMensagem?: string | null;
  criadoPor?: string | null;
  confianca?: number;
}): Promise<ParserLearningRuleRecord | null> {
  const origemLimpa = params.origemPadrao.trim();
  const destinoLimpo = params.destinoCanonico.trim();
  if (!origemLimpa || !destinoLimpo) return null;

  const tel = normalizarTelefone(params.remetenteTelefone);
  const agora = new Date().toISOString();

  // Tenta tabela oficial parser_learning_rules primeiro
  const { data: existentes, error: errBusca } = await supabaseAdmin
    .from('parser_learning_rules')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .eq('tipo_regra', params.tipoRegra);

  if (!errBusca) {
    const lista = (existentes || []) as unknown as ParserLearningRuleRecord[];
    const match = lista.find(
      (r) =>
        chaveNorm(r.origem_padrao) === chaveNorm(origemLimpa) &&
        (normalizarTelefone(r.remetente_telefone) || '') === (tel || '')
    );

    if (match) {
      const { data: upd } = await supabaseAdmin
        .from('parser_learning_rules')
        .update({
          destino_canonico: destinoLimpo,
          ocorrencias: Number(match.ocorrencias || 1) + 1,
          ativo: true,
          exemplo_mensagem: params.exemploMensagem || match.exemplo_mensagem,
          updated_at: agora,
        })
        .eq('id', match.id)
        .eq('tenant_id', params.tenantId)
        .select('*')
        .single();
      return (upd as unknown as ParserLearningRuleRecord) || match;
    }

    const { data: ins } = await supabaseAdmin
      .from('parser_learning_rules')
      .insert({
        tenant_id: params.tenantId,
        remetente_telefone: tel,
        remetente_nome: params.remetenteNome || null,
        tipo_regra: params.tipoRegra,
        origem_padrao: origemLimpa,
        destino_canonico: destinoLimpo,
        origem_aprendizado: params.origemAprendizado,
        confianca: params.confianca ?? 1.0,
        ocorrencias: 1,
        exemplo_mensagem: params.exemploMensagem?.slice(0, 300) || null,
        ativo: true,
        criado_por: params.criadoPor || 'Sistema IA',
        created_at: agora,
        updated_at: agora,
      })
      .select('*')
      .single();

    return (ins as unknown as ParserLearningRuleRecord) || null;
  }

  // Fallback seguro em parametros_sistema (isolado por tenant_id)
  const fb = await lerFallbackParametros(params.tenantId);
  const idx = fb.mem.rules.findIndex(
    (r) =>
      r.tipo_regra === params.tipoRegra &&
      chaveNorm(r.origem_padrao) === chaveNorm(origemLimpa) &&
      (normalizarTelefone(r.remetente_telefone) || '') === (tel || '')
  );

  let salvo: ParserLearningRuleRecord;
  if (idx >= 0) {
    salvo = {
      ...fb.mem.rules[idx],
      destino_canonico: destinoLimpo,
      ocorrencias: Number(fb.mem.rules[idx].ocorrencias || 1) + 1,
      ativo: true,
      exemplo_mensagem: params.exemploMensagem || fb.mem.rules[idx].exemplo_mensagem,
      updated_at: agora,
    };
    fb.mem.rules[idx] = salvo;
  } else {
    salvo = {
      id: `lr-${crypto.randomUUID().slice(0, 12)}`,
      tenant_id: params.tenantId,
      remetente_telefone: tel,
      remetente_nome: params.remetenteNome || null,
      tipo_regra: params.tipoRegra,
      origem_padrao: origemLimpa,
      destino_canonico: destinoLimpo,
      origem_aprendizado: params.origemAprendizado,
      confianca: params.confianca ?? 1.0,
      ocorrencias: 1,
      exemplo_mensagem: params.exemploMensagem?.slice(0, 300) || null,
      ativo: true,
      criado_por: params.criadoPor || 'Sistema IA',
      created_at: agora,
      updated_at: agora,
    };
    fb.mem.rules.unshift(salvo);
  }

  await salvarFallbackParametros(params.tenantId, fb.paramRowId, fb.cfg, fb.mem);
  return salvo;
}

export async function atualizarPerfilRemetenteValidado(params: {
  tenantId: string;
  remetenteTelefone?: string | null;
  remetenteNome?: string | null;
  obraValidada?: string | null;
  habitosAdicionais?: HabitosEscritaRemetente;
}): Promise<SenderProfileRecord | null> {
  const tel = normalizarTelefone(params.remetenteTelefone);
  if (!tel) return null;

  const agora = new Date().toISOString();
  const obraCanonica = params.obraValidada
    ? normalizarNomeObraCanonica(params.obraValidada)
    : null;
  const nomeFinal = params.remetenteNome?.trim() || `Remetente ${tel.slice(-4)}`;

  const { data: existente, error: errBusca } = await supabaseAdmin
    .from('sender_profiles')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .eq('remetente_telefone', tel)
    .maybeSingle();

  if (!errBusca) {
    const atual = existente as unknown as SenderProfileRecord | null;
    const habitosMesclados: HabitosEscritaRemetente = {
      ...(atual?.habitos_escrita || {}),
      ...(params.habitosAdicionais || {}),
      ...(obraCanonica ? { ultimaObraValidada: obraCanonica } : {}),
    };

    if (atual) {
      const { data: upd } = await supabaseAdmin
        .from('sender_profiles')
        .update({
          remetente_nome: params.remetenteNome?.trim() || atual.remetente_nome,
          obra_padrao_sugerida: obraCanonica || atual.obra_padrao_sugerida,
          habitos_escrita: habitosMesclados,
          total_mensagens_validadas: Number(atual.total_mensagens_validadas || 0) + 1,
          ultimo_envio_em: agora,
          updated_at: agora,
        })
        .eq('id', atual.id)
        .eq('tenant_id', params.tenantId)
        .select('*')
        .single();
      return (upd as unknown as SenderProfileRecord) || atual;
    }

    const { data: ins } = await supabaseAdmin
      .from('sender_profiles')
      .insert({
        tenant_id: params.tenantId,
        remetente_telefone: tel,
        remetente_nome: nomeFinal,
        obra_padrao_sugerida: obraCanonica,
        habitos_escrita: habitosMesclados,
        total_mensagens_validadas: 1,
        ultimo_envio_em: agora,
        created_at: agora,
        updated_at: agora,
      })
      .select('*')
      .single();
    return (ins as unknown as SenderProfileRecord) || null;
  }

  // Fallback em parametros_sistema
  const fb = await lerFallbackParametros(params.tenantId);
  const idx = fb.mem.senderProfiles.findIndex(
    (p) => normalizarTelefone(p.remetente_telefone) === tel
  );

  let salvo: SenderProfileRecord;
  if (idx >= 0) {
    const atual = fb.mem.senderProfiles[idx];
    salvo = {
      ...atual,
      remetente_nome: params.remetenteNome?.trim() || atual.remetente_nome,
      obra_padrao_sugerida: obraCanonica || atual.obra_padrao_sugerida,
      habitos_escrita: {
        ...(atual.habitos_escrita || {}),
        ...(params.habitosAdicionais || {}),
        ...(obraCanonica ? { ultimaObraValidada: obraCanonica } : {}),
      },
      total_mensagens_validadas: Number(atual.total_mensagens_validadas || 0) + 1,
      ultimo_envio_em: agora,
      updated_at: agora,
    };
    fb.mem.senderProfiles[idx] = salvo;
  } else {
    salvo = {
      id: `sp-${crypto.randomUUID().slice(0, 12)}`,
      tenant_id: params.tenantId,
      remetente_telefone: tel,
      remetente_nome: nomeFinal,
      obra_padrao_sugerida: obraCanonica,
      habitos_escrita: {
        ...(params.habitosAdicionais || {}),
        ...(obraCanonica ? { ultimaObraValidada: obraCanonica } : {}),
      },
      total_mensagens_validadas: 1,
      ultimo_envio_em: agora,
      created_at: agora,
      updated_at: agora,
    };
    fb.mem.senderProfiles.unshift(salvo);
  }

  await salvarFallbackParametros(params.tenantId, fb.paramRowId, fb.cfg, fb.mem);
  return salvo;
}

/**
 * Registra automaticamente uma correção humana feita na validação de diárias ou vales
 * (Daniel ou Patrícia) para automatizar os próximos envios do mesmo tenant/remetente.
 */
export async function registrarCorrecaoHumanaAprendizado(params: {
  tenantId: string;
  autorCorrecao: string;
  remetenteTelefone?: string | null;
  trabalhadorAnterior?: string | null;
  trabalhadorCorrigido?: string | null;
  obraAnterior?: string | null;
  obraCorrigida?: string | null;
  fracaoAnterior?: number | null;
  fracaoCorrigida?: number | null;
  exemploMensagem?: string | null;
}): Promise<number> {
  let regrasGravadas = 0;

  // 1. Correção de nome de trabalhador (de -> para)
  if (
    params.trabalhadorAnterior &&
    params.trabalhadorCorrigido &&
    chaveNorm(params.trabalhadorAnterior) !== chaveNorm(params.trabalhadorCorrigido)
  ) {
    await registrarRegraAprendida({
      tenantId: params.tenantId,
      tipoRegra: 'ALIAS_TRABALHADOR',
      origemPadrao: params.trabalhadorAnterior.trim(),
      destinoCanonico: params.trabalhadorCorrigido.trim(),
      origemAprendizado: 'CORRECAO_HUMANA',
      remetenteTelefone: params.remetenteTelefone,
      exemploMensagem: params.exemploMensagem,
      criadoPor: params.autorCorrecao,
    });
    regrasGravadas++;
  }

  // 2. Correção de obra (de -> para)
  if (
    params.obraAnterior &&
    params.obraCorrigida &&
    chaveNorm(params.obraAnterior) !== chaveNorm(params.obraCorrigida)
  ) {
    await registrarRegraAprendida({
      tenantId: params.tenantId,
      tipoRegra: 'ALIAS_OBRA',
      origemPadrao: params.obraAnterior.trim(),
      destinoCanonico: normalizarNomeObraCanonica(params.obraCorrigida),
      origemAprendizado: 'CORRECAO_HUMANA',
      remetenteTelefone: params.remetenteTelefone,
      exemploMensagem: params.exemploMensagem,
      criadoPor: params.autorCorrecao,
    });
    regrasGravadas++;
  }

  // 3. Correção de fração em validação (registra preferência para auditoria/few-shot)
  if (
    params.fracaoAnterior !== undefined &&
    params.fracaoAnterior !== null &&
    params.fracaoCorrigida !== undefined &&
    params.fracaoCorrigida !== null &&
    Math.abs(params.fracaoAnterior - params.fracaoCorrigida) > 0.01 &&
    params.trabalhadorCorrigido
  ) {
    const trabCanon = normalizarNomeTrabalhadorCanonico(params.trabalhadorCorrigido);
    await registrarRegraAprendida({
      tenantId: params.tenantId,
      tipoRegra: 'FRACAO_PADRAO',
      origemPadrao: `${trabCanon} (${params.obraCorrigida || params.obraAnterior || 'Geral'})`,
      destinoCanonico: String(params.fracaoCorrigida),
      origemAprendizado: 'CORRECAO_HUMANA',
      remetenteTelefone: params.remetenteTelefone,
      exemploMensagem: params.exemploMensagem,
      criadoPor: params.autorCorrecao,
    });
    regrasGravadas++;
  }

  return regrasGravadas;
}

export async function atualizarRegraAprendida(params: {
  tenantId: string;
  ruleId: string;
  origemPadrao?: string;
  destinoCanonico?: string;
  ativo?: boolean;
}): Promise<boolean> {
  const agora = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: agora };
  if (params.origemPadrao !== undefined) updates.origem_padrao = params.origemPadrao.trim();
  if (params.destinoCanonico !== undefined) updates.destino_canonico = params.destinoCanonico.trim();
  if (params.ativo !== undefined) updates.ativo = params.ativo;

  const { error } = await supabaseAdmin
    .from('parser_learning_rules')
    .update(updates)
    .eq('id', params.ruleId)
    .eq('tenant_id', params.tenantId);

  if (!error) return true;

  const fb = await lerFallbackParametros(params.tenantId);
  const idx = fb.mem.rules.findIndex((r) => r.id === params.ruleId);
  if (idx < 0) return false;
  fb.mem.rules[idx] = {
    ...fb.mem.rules[idx],
    ...(params.origemPadrao !== undefined ? { origem_padrao: params.origemPadrao.trim() } : {}),
    ...(params.destinoCanonico !== undefined ? { destino_canonico: params.destinoCanonico.trim() } : {}),
    ...(params.ativo !== undefined ? { ativo: params.ativo } : {}),
    updated_at: agora,
  };
  await salvarFallbackParametros(params.tenantId, fb.paramRowId, fb.cfg, fb.mem);
  return true;
}

export async function excluirRegraAprendida(
  tenantId: string,
  ruleId: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('parser_learning_rules')
    .delete()
    .eq('id', ruleId)
    .eq('tenant_id', tenantId);

  if (!error) return true;

  const fb = await lerFallbackParametros(tenantId);
  const antes = fb.mem.rules.length;
  fb.mem.rules = fb.mem.rules.filter((r) => r.id !== ruleId);
  if (fb.mem.rules.length === antes) return false;
  await salvarFallbackParametros(tenantId, fb.paramRowId, fb.cfg, fb.mem);
  return true;
}
