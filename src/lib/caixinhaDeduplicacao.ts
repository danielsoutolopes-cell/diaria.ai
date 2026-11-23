import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';
import {
  montarDataHoraEnvioIso,
  normalizarEmissorPix,
  type OrigemRastreabilidadeCaixinha,
} from '@/lib/caixinhaPixRastreabilidade';

export type TipoMovimentoCaixa =
  | 'ENTRADA_PIX'
  | 'NOTA_DESPESA'
  | 'DEVOLUCAO_TROCO';

export interface MovimentoCaixaCampo {
  id: string;
  encarregado: string;
  encarregadoOrigem?: string;
  obra: string;
  data: string;
  hora: string;
  dataHoraEnvio?: string | null;
  tipo: TipoMovimentoCaixa;
  categoria: string;
  descricao: string;
  valor: number;
  status: 'PENDENTE' | 'APROVADO';
  isPreImplantacao?: boolean;
  enviadoPor: string;
  emissorPix?: string | null;
  origemEmissor?: OrigemRastreabilidadeCaixinha | null;
  origemDataHora?: OrigemRastreabilidadeCaixinha | null;
  criadoEm: string;
}

export interface ContaCaixinhaConsolidada {
  encarregado: string;
  aliasesUnificados: string[];
  possuiPreImplantacao: boolean;
  totalRecebido: number;
  totalComprovado: number;
  totalDevolvido: number;
  saldoEmMaos: number;
  movimentos: MovimentoCaixaCampo[];
}

function normalizarTexto(valor: string | null | undefined): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Identifica lançamentos sintéticos consolidados (roll-ups pré-implantação)
 * que resumem múltiplas entradas/notas em uma única linha. Se existirem
 * lançamentos itemizados reais para o mesmo encarregado, o sintético é
 * suprimido automaticamente para eliminar qualquer risco de dupla contagem.
 */
export function isLancamentoSinteticoConsolidado(
  mov: MovimentoCaixaCampo
): boolean {
  const idNorm = normalizarTexto(mov.id);
  const descNorm = normalizarTexto(mov.descricao);
  if (idNorm.startsWith('v11-preimp-')) return true;
  if (
    descNorm.includes('entradas pix consolidadas') ||
    descNorm.includes('saidas e notas comprovadas')
  ) {
    return true;
  }
  return false;
}

/**
 * Deduplica movimentos vindos do SQL (`caixinha_movimentacoes`) e do JSONB
 * (`parametros_sistema.configuracoes.caixa_campo_movimentos`), eliminando:
 *  1. Duplicidades exatas por ID;
 *  2. Duplicidades por assinatura (encarregado canônico + data + tipo + valor + descrição);
 *  3. Sobreposição entre roll-ups sintéticos pré-implantação e lançamentos itemizados reais.
 */
export function deduplicarMovimentosCaixinha(
  movimentosSql: ReadonlyArray<MovimentoCaixaCampo>,
  movimentosJsonb: ReadonlyArray<MovimentoCaixaCampo>,
  aliasesExtras?: Record<string, string>
): MovimentoCaixaCampo[] {
  const porId = new Map<string, MovimentoCaixaCampo>();
  const assinaturas = new Set<string>();

  const adicionarUnico = (m: MovimentoCaixaCampo) => {
    if (porId.has(m.id)) return;
    const encarregadoCanon = normalizarNomeTrabalhadorCanonico(
      m.encarregado,
      aliasesExtras
    );
    const assinatura = [
      normalizarTexto(encarregadoCanon),
      m.data,
      m.tipo,
      Number(m.valor || 0).toFixed(2),
      normalizarTexto(m.descricao),
    ].join('|');

    if (assinaturas.has(assinatura)) return;
    assinaturas.add(assinatura);
    const emissorCanon =
      m.tipo === 'ENTRADA_PIX'
        ? normalizarEmissorPix(m.emissorPix || m.enviadoPor) ||
          m.emissorPix ||
          m.enviadoPor ||
          null
        : m.emissorPix
          ? normalizarEmissorPix(m.emissorPix)
          : null;
    porId.set(m.id, {
      ...m,
      encarregado: encarregadoCanon,
      encarregadoOrigem: m.encarregadoOrigem || m.encarregado,
      dataHoraEnvio:
        m.dataHoraEnvio || montarDataHoraEnvioIso(m.data, m.hora || '12:00'),
      emissorPix: emissorCanon,
      origemEmissor: m.origemEmissor || null,
      origemDataHora: m.origemDataHora || null,
      valor: Number(Number(m.valor || 0).toFixed(2)),
    });
  };

  movimentosSql.forEach(adicionarUnico);
  movimentosJsonb.forEach(adicionarUnico);

  const todos = Array.from(porId.values());

  // Mapeia encarregados que possuem lançamentos reais itemizados (não sintéticos)
  const encarregadosComItemizados = new Set<string>();
  for (const m of todos) {
    if (!isLancamentoSinteticoConsolidado(m)) {
      encarregadosComItemizados.add(normalizarTexto(m.encarregado));
    }
  }

  // Suprime roll-ups sintéticos quando já existem lançamentos itemizados do mesmo encarregado
  return todos.filter((m) => {
    if (!isLancamentoSinteticoConsolidado(m)) return true;
    return !encarregadosComItemizados.has(normalizarTexto(m.encarregado));
  });
}

/**
 * Consolida a conta corrente por encarregado canônico sem dupla contagem.
 */
export function consolidarContasCaixinha(
  movimentos: ReadonlyArray<MovimentoCaixaCampo>,
  aliasesExtras?: Record<string, string>
): ContaCaixinhaConsolidada[] {
  const contasMap = new Map<
    string,
    {
      encarregado: string;
      aliasesUnificados: Set<string>;
      possuiPreImplantacao: boolean;
      totalRecebido: number;
      totalComprovado: number;
      totalDevolvido: number;
      saldoEmMaos: number;
      movimentos: MovimentoCaixaCampo[];
    }
  >();

  for (const m of movimentos) {
    const nomeCanonico = normalizarNomeTrabalhadorCanonico(
      m.encarregado,
      aliasesExtras
    );
    const chave = nomeCanonico.toUpperCase();
    if (!contasMap.has(chave)) {
      contasMap.set(chave, {
        encarregado: nomeCanonico,
        aliasesUnificados: new Set<string>(),
        possuiPreImplantacao: false,
        totalRecebido: 0,
        totalComprovado: 0,
        totalDevolvido: 0,
        saldoEmMaos: 0,
        movimentos: [],
      });
    }
    const c = contasMap.get(chave)!;
    if (m.encarregadoOrigem) {
      m.encarregadoOrigem
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((alias) => c.aliasesUnificados.add(alias));
    } else if (m.encarregado.trim() !== nomeCanonico) {
      c.aliasesUnificados.add(m.encarregado.trim());
    }
    if (nomeCanonico === 'Gil') {
      c.aliasesUnificados.add('Gil');
      c.aliasesUnificados.add('Gilvan');
      c.aliasesUnificados.add('Gil335Revest');
    }
    if (m.isPreImplantacao || m.data === '2026-11-13') {
      c.possuiPreImplantacao = true;
    }

    c.movimentos.push({
      ...m,
      encarregado: nomeCanonico,
    });

    const valorNum = Number(m.valor || 0);
    if (m.tipo === 'ENTRADA_PIX') c.totalRecebido += valorNum;
    if (m.tipo === 'NOTA_DESPESA') c.totalComprovado += valorNum;
    if (m.tipo === 'DEVOLUCAO_TROCO') c.totalDevolvido += valorNum;

    c.totalRecebido = Number(c.totalRecebido.toFixed(2));
    c.totalComprovado = Number(c.totalComprovado.toFixed(2));
    c.totalDevolvido = Number(c.totalDevolvido.toFixed(2));
    c.saldoEmMaos = Number(
      (c.totalRecebido - c.totalComprovado - c.totalDevolvido).toFixed(2)
    );
  }

  return Array.from(contasMap.values()).map((c) => ({
    encarregado: c.encarregado,
    aliasesUnificados: Array.from(c.aliasesUnificados),
    possuiPreImplantacao: c.possuiPreImplantacao,
    totalRecebido: c.totalRecebido,
    totalComprovado: c.totalComprovado,
    totalDevolvido: c.totalDevolvido,
    saldoEmMaos: c.saldoEmMaos,
    movimentos: [...c.movimentos].sort((a, b) =>
      `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`)
    ),
  }));
}
