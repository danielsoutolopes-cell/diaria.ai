import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  NivelSaudeSistema,
  RelatorioAuditoriaInterna,
} from '@/services/auditoriaEngine';

export type CadenciaSaudeSistema =
  | 'SOB_DEMANDA_19H30'
  | 'MANUAL'
  | 'CADA_6H'
  | 'CADA_12H';

export type OrigemExecucaoSaude = 'MANUAL' | 'CADENCIA';

export interface ConfiguracaoCadenciaSaude {
  cadencia: CadenciaSaudeSistema;
  atualizadoPor: string | null;
  atualizadoEmIso: string | null;
}

export interface HistoricoLaudoSaudeRecord {
  id: string;
  tenantId: string;
  executadoEmIso: string;
  executadoEmFormatado: string;
  origem: OrigemExecucaoSaude;
  executadoPor: string;
  periodo: string;
  scoreGeral: number;
  nivel: NivelSaudeSistema;
  totalLancamentosAuditados: number;
  totalValesAuditados: number;
  totalLotesAuditados: number;
  totalAnomalias: number;
  anomaliasAlta: number;
  duplicadosDetectados: number;
  fantasmasDetectados: number;
  impactoFinanceiroDelta: number;
}

export interface UltimoLaudoSalvoRecord {
  meta: HistoricoLaudoSaudeRecord;
  relatorio: RelatorioAuditoriaInterna;
}

interface EstadoSaudePersistido {
  config: ConfiguracaoCadenciaSaude;
  ultimoLaudo: UltimoLaudoSalvoRecord | null;
  historico: HistoricoLaudoSaudeRecord[];
}

export interface OpcaoCadenciaSaude {
  id: CadenciaSaudeSistema;
  label: string;
  descricaoCurta: string;
  horariosBRT: readonly string[];
}

export const OPCOES_CADENCIA_SAUDE: readonly OpcaoCadenciaSaude[] = [
  {
    id: 'SOB_DEMANDA_19H30',
    label: 'Sob Demanda + 19:30 (Recomendado)',
    descricaoCurta: 'Execução manual a qualquer hora + 1x ao dia às 19:30 (BRT)',
    horariosBRT: ['19:30'],
  },
  {
    id: 'MANUAL',
    label: 'Apenas Manual (Sob Demanda)',
    descricaoCurta: 'Somente quando você clicar em "Executar Varredura"',
    horariosBRT: [],
  },
  {
    id: 'CADA_6H',
    label: 'A cada 6h (07:00, 13:00, 19:00)',
    descricaoCurta: '3 varreduras automáticas por dia + sob demanda',
    horariosBRT: ['07:00', '13:00', '19:00'],
  },
  {
    id: 'CADA_12H',
    label: 'A cada 12h (07:30 e 19:30)',
    descricaoCurta: '2 varreduras automáticas por dia + sob demanda',
    horariosBRT: ['07:30', '19:30'],
  },
] as const;

export const CADENCIA_PADRAO_SAUDE: CadenciaSaudeSistema = 'SOB_DEMANDA_19H30';

export function validarCadenciaSaude(valor: unknown): CadenciaSaudeSistema {
  if (
    valor === 'SOB_DEMANDA_19H30' ||
    valor === 'MANUAL' ||
    valor === 'CADA_6H' ||
    valor === 'CADA_12H'
  ) {
    return valor;
  }
  return CADENCIA_PADRAO_SAUDE;
}

/**
 * Formata um Date ou ISO para "dd/MM/yyyy às HH:mm" no fuso America/Sao_Paulo.
 */
export function formatarDataHoraBrasilia(dataRef: Date | string): string {
  const dt = typeof dataRef === 'string' ? new Date(dataRef) : dataRef;
  if (Number.isNaN(dt.getTime())) return String(dataRef);
  const data = dt.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const hora = dt.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${data} às ${hora}`;
}

function extrairPartesBrasilia(dt: Date): {
  dataIso: string; // YYYY-MM-DD
  horaMin: string; // HH:MM
} {
  const dataIso = dt.toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
  const horaMin = dt.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { dataIso, horaMin };
}

function adicionarDiasIso(dataIso: string, dias: number): string {
  const [y, m, d] = dataIso.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + dias, 12, 0, 0));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatarIsoBRComHora(dataIso: string, hhmm: string): string {
  const [y, m, d] = dataIso.split('-');
  return `${d}/${m}/${y} às ${hhmm}`;
}

/**
 * Calcula a próxima execução agendada no fuso America/Sao_Paulo conforme a cadência.
 * Retorna null quando a cadência for MANUAL.
 */
export function calcularProximaExecucaoCadencia(
  cadencia: CadenciaSaudeSistema,
  agoraRef: Date = new Date()
): {
  proximaExecucaoIso: string | null;
  proximaExecucaoFormatada: string | null;
} {
  const opcao = OPCOES_CADENCIA_SAUDE.find((o) => o.id === cadencia);
  if (!opcao || opcao.horariosBRT.length === 0) {
    return {
      proximaExecucaoIso: null,
      proximaExecucaoFormatada: null,
    };
  }

  const { dataIso: hojeIso, horaMin: agoraHHMM } = extrairPartesBrasilia(agoraRef);
  const proximoHoje = opcao.horariosBRT.find((slot) => slot > agoraHHMM);

  if (proximoHoje) {
    return {
      proximaExecucaoIso: `${hojeIso}T${proximoHoje}:00-03:00`,
      proximaExecucaoFormatada: formatarIsoBRComHora(hojeIso, proximoHoje),
    };
  }

  const amanhaIso = adicionarDiasIso(hojeIso, 1);
  const primeiroSlotAmanha = opcao.horariosBRT[0];
  return {
    proximaExecucaoIso: `${amanhaIso}T${primeiroSlotAmanha}:00-03:00`,
    proximaExecucaoFormatada: formatarIsoBRComHora(amanhaIso, primeiroSlotAmanha),
  };
}

/**
 * Verifica se o tenant está devido para uma execução agendada na janela atual
 * (sem duplicar execução no mesmo slot do mesmo dia em America/Sao_Paulo).
 */
export function verificarExecucaoCadenciaDevida(
  cadencia: CadenciaSaudeSistema,
  ultimaExecucaoCadenciaIso: string | null,
  agoraRef: Date = new Date()
): { devida: boolean; slotAtual: string | null } {
  const opcao = OPCOES_CADENCIA_SAUDE.find((o) => o.id === cadencia);
  if (!opcao || opcao.horariosBRT.length === 0) {
    return { devida: false, slotAtual: null };
  }

  const { dataIso: hojeIso, horaMin: agoraHHMM } = extrairPartesBrasilia(agoraRef);
  // Último slot de hoje que já foi atingido (<= agoraHHMM)
  const slotsAtingidos = opcao.horariosBRT.filter((slot) => slot <= agoraHHMM);
  if (slotsAtingidos.length === 0) {
    return { devida: false, slotAtual: null };
  }

  const ultimoSlotHoje = slotsAtingidos[slotsAtingidos.length - 1];
  const slotIsoRef = `${hojeIso}T${ultimoSlotHoje}:00-03:00`;
  const slotMs = Date.parse(slotIsoRef);

  if (ultimaExecucaoCadenciaIso) {
    const ultimaMs = Date.parse(ultimaExecucaoCadenciaIso);
    if (!Number.isNaN(ultimaMs) && !Number.isNaN(slotMs) && ultimaMs >= slotMs) {
      return { devida: false, slotAtual: ultimoSlotHoje };
    }
  }

  return { devida: true, slotAtual: ultimoSlotHoje };
}

// ============================================================================
// PERSISTÊNCIA MULTI-TENANT (parametros_sistema.configuracoes.saude_sistema_v19)
// ============================================================================

async function lerEstadoSaudeTenant(tenantId: string): Promise<{
  paramRowId: string | null;
  cfgCompleta: Record<string, unknown>;
  estado: EstadoSaudePersistido;
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  const cfgCompleta = (data?.configuracoes as Record<string, unknown> | null) || {};
  const raw = (cfgCompleta.saude_sistema_v19 || {}) as Partial<EstadoSaudePersistido>;

  const config: ConfiguracaoCadenciaSaude = {
    cadencia: validarCadenciaSaude(raw.config?.cadencia),
    atualizadoPor: raw.config?.atualizadoPor ?? null,
    atualizadoEmIso: raw.config?.atualizadoEmIso ?? null,
  };

  const historico = Array.isArray(raw.historico) ? raw.historico : [];
  const ultimoLaudo =
    raw.ultimoLaudo && raw.ultimoLaudo.meta && raw.ultimoLaudo.relatorio
      ? raw.ultimoLaudo
      : null;

  return {
    paramRowId: data?.id ? String(data.id) : null,
    cfgCompleta,
    estado: {
      config,
      ultimoLaudo,
      historico,
    },
  };
}

async function gravarEstadoSaudeTenant(
  tenantId: string,
  paramRowId: string | null,
  cfgCompleta: Record<string, unknown>,
  estado: EstadoSaudePersistido
): Promise<void> {
  const novasCfg = {
    ...cfgCompleta,
    saude_sistema_v19: estado,
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

export async function obterEstadoSaudeSistema(tenantId: string): Promise<{
  config: ConfiguracaoCadenciaSaude;
  ultimoLaudo: UltimoLaudoSalvoRecord | null;
  historico: HistoricoLaudoSaudeRecord[];
  proximaExecucaoIso: string | null;
  proximaExecucaoFormatada: string | null;
}> {
  const { estado } = await lerEstadoSaudeTenant(tenantId);
  const prox = calcularProximaExecucaoCadencia(estado.config.cadencia);

  return {
    config: estado.config,
    ultimoLaudo: estado.ultimoLaudo,
    historico: estado.historico,
    proximaExecucaoIso: prox.proximaExecucaoIso,
    proximaExecucaoFormatada: prox.proximaExecucaoFormatada,
  };
}

export async function salvarConfiguracaoCadenciaSaude(params: {
  tenantId: string;
  cadencia: CadenciaSaudeSistema;
  atualizadoPor: string;
}): Promise<{
  config: ConfiguracaoCadenciaSaude;
  proximaExecucaoIso: string | null;
  proximaExecucaoFormatada: string | null;
}> {
  const { paramRowId, cfgCompleta, estado } = await lerEstadoSaudeTenant(
    params.tenantId
  );

  const novaConfig: ConfiguracaoCadenciaSaude = {
    cadencia: validarCadenciaSaude(params.cadencia),
    atualizadoPor: params.atualizadoPor,
    atualizadoEmIso: new Date().toISOString(),
  };

  await gravarEstadoSaudeTenant(params.tenantId, paramRowId, cfgCompleta, {
    ...estado,
    config: novaConfig,
  });

  const prox = calcularProximaExecucaoCadencia(novaConfig.cadencia);
  return {
    config: novaConfig,
    proximaExecucaoIso: prox.proximaExecucaoIso,
    proximaExecucaoFormatada: prox.proximaExecucaoFormatada,
  };
}

export async function salvarExecucaoLaudoSaude(params: {
  tenantId: string;
  relatorio: RelatorioAuditoriaInterna;
  totalValesAuditados: number;
  periodo: string;
  origem: OrigemExecucaoSaude;
  executadoPor: string;
  agoraRef?: Date;
}): Promise<{
  ultimoLaudo: UltimoLaudoSalvoRecord;
  historico: HistoricoLaudoSaudeRecord[];
  config: ConfiguracaoCadenciaSaude;
  proximaExecucaoIso: string | null;
  proximaExecucaoFormatada: string | null;
}> {
  const { paramRowId, cfgCompleta, estado } = await lerEstadoSaudeTenant(
    params.tenantId
  );
  const agora = params.agoraRef || new Date();
  const agoraIso = agora.toISOString();

  const meta: HistoricoLaudoSaudeRecord = {
    id: `saude-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: params.tenantId,
    executadoEmIso: agoraIso,
    executadoEmFormatado: formatarDataHoraBrasilia(agora),
    origem: params.origem,
    executadoPor: params.executadoPor,
    periodo: params.periodo,
    scoreGeral: params.relatorio.saudeSistema.scoreGeral,
    nivel: params.relatorio.saudeSistema.nivel,
    totalLancamentosAuditados: params.relatorio.totalLancamentosAnalisados,
    totalValesAuditados: params.totalValesAuditados,
    totalLotesAuditados: params.relatorio.totalLotesAnalisados,
    totalAnomalias: params.relatorio.simulacao.totalAnomalias,
    anomaliasAlta: params.relatorio.simulacao.anomaliasAlta,
    duplicadosDetectados: params.relatorio.saudeSistema.duplicadosDetectados,
    fantasmasDetectados: params.relatorio.saudeSistema.fantasmasDetectados,
    impactoFinanceiroDelta: params.relatorio.simulacao.impactoCorrecoesDelta,
  };

  const ultimoLaudo: UltimoLaudoSalvoRecord = {
    meta,
    relatorio: params.relatorio,
  };

  const historicoAtualizado = [meta, ...estado.historico].slice(0, 30);

  await gravarEstadoSaudeTenant(params.tenantId, paramRowId, cfgCompleta, {
    config: estado.config,
    ultimoLaudo,
    historico: historicoAtualizado,
  });

  const prox = calcularProximaExecucaoCadencia(estado.config.cadencia, agora);

  return {
    ultimoLaudo,
    historico: historicoAtualizado,
    config: estado.config,
    proximaExecucaoIso: prox.proximaExecucaoIso,
    proximaExecucaoFormatada: prox.proximaExecucaoFormatada,
  };
}
