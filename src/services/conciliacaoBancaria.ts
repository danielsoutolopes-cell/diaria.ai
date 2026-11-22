import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';

export type BancoExtratoSuportado = 'C6_BANK' | 'ITAU' | 'SANTANDER' | 'OUTRO';

export interface TransacaoExtratoBancario {
  id: string;
  fitId: string;
  banco: BancoExtratoSuportado;
  data: string; // YYYY-MM-DD
  descricao: string;
  favorecidoDetectado: string;
  valorSaida: number; // sempre positivo representando débito/saída PIX
  tipo: 'PIX_SAIDA' | 'DEBITO';
}

export interface RegistroSistemaConciliacao {
  id: string;
  origem: 'LANCAMENTO_FINANCEIRO' | 'CAIXINHA';
  tipo: string; // PONTO | VALE | LIQUIDACAO | ENTRADA_PIX
  trabalhador: string;
  obra: string;
  data: string; // YYYY-MM-DD
  valor: number;
  status: string;
}

export type StatusMatchBancario =
  | 'CONCILIADO_EXATO'
  | 'SUGESTAO_MATCH'
  | 'DIVERGENCIA';

export interface ResultadoMatchTransacao {
  transacao: TransacaoExtratoBancario;
  statusMatch: StatusMatchBancario;
  score: number;
  motivo: string;
  candidato: RegistroSistemaConciliacao | null;
  diferencaValor: number;
}

export interface RelatorioConciliacaoBancaria {
  bancoDetectado: BancoExtratoSuportado;
  formato: 'OFX' | 'CSV';
  totalTransacoesSaida: number;
  totalValorSaidas: number;
  qtdConciliadoExato: number;
  qtdSugestaoMatch: number;
  qtdDivergencias: number;
  itens: ResultadoMatchTransacao[];
}

function normalizarTextoComparacao(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDataFlexivel(raw: string): string | null {
  const limpo = raw.trim().replace(/^["']|["']$/g, '');
  // OFX: YYYYMMDD ou YYYYMMDDHHMMSS
  const mOfx = limpo.match(/^(\d{4})(\d{2})(\d{2})/);
  if (mOfx) {
    return `${mOfx[1]}-${mOfx[2]}-${mOfx[3]}`;
  }
  // ISO: YYYY-MM-DD
  const mIso = limpo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) {
    return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  }
  // BR: DD/MM/YYYY
  const mBr = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (mBr) {
    return `${mBr[3]}-${mBr[2]}-${mBr[1]}`;
  }
  return null;
}

function parseNumeroBRouUS(raw: string): number {
  const limpo = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '');
  if (!limpo) return NaN;
  // Formato brasileiro 1.250,50 ou -100,00
  if (limpo.includes(',')) {
    const semMilhar = limpo.replace(/\./g, '').replace(',', '.');
    return Number(semMilhar);
  }
  return Number(limpo);
}

export function detectarBancoExtrato(
  conteudo: string,
  nomeArquivo = ''
): BancoExtratoSuportado {
  const amostra = `${nomeArquivo} ${conteudo.slice(0, 1200)}`.toUpperCase();
  if (amostra.includes('C6 BANK') || amostra.includes('C6BANK') || amostra.includes('BANCO C6') || amostra.includes('336')) {
    return 'C6_BANK';
  }
  if (amostra.includes('ITAU') || amostra.includes('ITAÚ') || amostra.includes('341')) {
    return 'ITAU';
  }
  if (amostra.includes('SANTANDER') || amostra.includes('033')) {
    return 'SANTANDER';
  }
  return 'OUTRO';
}

function extrairFavorecidoDescricao(descricao: string): string {
  const limpo = descricao
    .replace(/pix\s*(enviado|transf|transferencia|debito)?\s*[-:]*\s*/gi, '')
    .replace(/transf(?:erencia)?\s*pix\s*[-:]*\s*/gi, '')
    .replace(/pagto\s*pix\s*[-:]*\s*/gi, '')
    .trim();
  const primeiroTrecho = limpo.split(/\s*[-–|\/]\s*/)[0]?.trim() || limpo;
  return primeiroTrecho || descricao.trim();
}

/**
 * Parser de arquivos OFX (C6 Bank, Itaú, Santander e padrão bancário FEBRABAN).
 * Extrai apenas saídas/débitos (TRNAMT < 0).
 */
export function parseExtratoOFX(
  conteudo: string,
  bancoForcado?: BancoExtratoSuportado,
  nomeArquivo = ''
): TransacaoExtratoBancario[] {
  const banco = bancoForcado || detectarBancoExtrato(conteudo, nomeArquivo);
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  const transacoes: TransacaoExtratoBancario[] = [];

  const extrairTag = (bloco: string, tag: string): string => {
    const m = bloco.match(
      new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i')
    );
    return m ? m[1].trim() : '';
  };

  blocos.forEach((bloco, idx) => {
    const trnAmt = parseNumeroBRouUS(extrairTag(bloco, 'TRNAMT'));
    if (!Number.isFinite(trnAmt) || trnAmt >= 0) return; // somente saídas

    const dtPosted = parseDataFlexivel(extrairTag(bloco, 'DTPOSTED'));
    if (!dtPosted) return;

    const memo = extrairTag(bloco, 'MEMO');
    const name = extrairTag(bloco, 'NAME');
    const fitId = extrairTag(bloco, 'FITID') || `ofx-${dtPosted}-${idx + 1}`;
    const descricao = [name, memo].filter(Boolean).join(' - ') || 'Saída Bancária';
    const isPix = /pix/i.test(descricao);

    transacoes.push({
      id: `ofx-${idx + 1}-${fitId}`,
      fitId,
      banco,
      data: dtPosted,
      descricao,
      favorecidoDetectado: extrairFavorecidoDescricao(descricao),
      valorSaida: Number(Math.abs(trnAmt).toFixed(2)),
      tipo: isPix ? 'PIX_SAIDA' : 'DEBITO',
    });
  });

  return transacoes;
}

/**
 * Parser de extratos CSV (C6 Bank, Itaú e Santander).
 * Suporta delimitador ";" ou ",", cabeçalho em PT-BR e valores negativos ou coluna "Saída".
 */
export function parseExtratoCSV(
  conteudo: string,
  bancoForcado?: BancoExtratoSuportado,
  nomeArquivo = ''
): TransacaoExtratoBancario[] {
  const banco = bancoForcado || detectarBancoExtrato(conteudo, nomeArquivo);
  const linhas = conteudo
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (linhas.length < 2) return [];

  // Encontra linha de cabeçalho contendo "data" e ("valor" ou "saida" ou "debito")
  let headerIdx = 0;
  let delimitador = ';';
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    const norm = normalizarTextoComparacao(linhas[i]);
    if (
      norm.includes('DATA') &&
      (norm.includes('VALOR') ||
        norm.includes('SAIDA') ||
        norm.includes('DEBITO') ||
        norm.includes('LANCAMENTO') ||
        norm.includes('DESCRICAO') ||
        norm.includes('HISTORICO'))
    ) {
      headerIdx = i;
      delimitador =
        (linhas[i].match(/;/g)?.length || 0) >=
        (linhas[i].match(/,/g)?.length || 0)
          ? ';'
          : ',';
      break;
    }
  }

  const splitCols = (linha: string): string[] => {
    const cols: string[] = [];
    let atual = '';
    let emAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"') {
        emAspas = !emAspas;
      } else if (ch === delimitador && !emAspas) {
        cols.push(atual.trim());
        atual = '';
      } else {
        atual += ch;
      }
    }
    cols.push(atual.trim());
    return cols;
  };

  const headers = splitCols(linhas[headerIdx]).map((h) =>
    normalizarTextoComparacao(h)
  );
  const idxData = headers.findIndex((h) => h.includes('DATA'));
  const idxDesc = headers.findIndex(
    (h) =>
      h.includes('DESCRICAO') ||
      h.includes('HISTORICO') ||
      h.includes('LANCAMENTO') ||
      h.includes('FAVORECIDO') ||
      h.includes('TITULO')
  );
  const idxSaida = headers.findIndex(
    (h) => h.includes('SAIDA') || h.includes('DEBITO')
  );
  const idxValor = headers.findIndex((h) => h.includes('VALOR'));

  if (idxData < 0 || (idxValor < 0 && idxSaida < 0)) {
    return [];
  }

  const transacoes: TransacaoExtratoBancario[] = [];
  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const cols = splitCols(linhas[i]);
    const dataIso = parseDataFlexivel(cols[idxData] || '');
    if (!dataIso) continue;

    let valorSaida = 0;
    if (idxSaida >= 0 && cols[idxSaida]) {
      const vSaida = parseNumeroBRouUS(cols[idxSaida]);
      if (Number.isFinite(vSaida) && Math.abs(vSaida) > 0) {
        valorSaida = Math.abs(vSaida);
      }
    }
    if (valorSaida === 0 && idxValor >= 0 && cols[idxValor]) {
      const v = parseNumeroBRouUS(cols[idxValor]);
      if (Number.isFinite(v) && v < 0) {
        valorSaida = Math.abs(v);
      }
    }

    if (valorSaida <= 0) continue;

    const descricao =
      (idxDesc >= 0 ? cols[idxDesc] : '')?.replace(/^["']|["']$/g, '').trim() ||
      'Saída Bancária';
    const isPix = /pix/i.test(descricao);

    transacoes.push({
      id: `csv-${i}-${dataIso}`,
      fitId: `csv-${banco}-${dataIso}-${i}-${valorSaida.toFixed(2)}`,
      banco,
      data: dataIso,
      descricao,
      favorecidoDetectado: extrairFavorecidoDescricao(descricao),
      valorSaida: Number(valorSaida.toFixed(2)),
      tipo: isPix ? 'PIX_SAIDA' : 'DEBITO',
    });
  }

  return transacoes;
}

function diffDias(dataA: string, dataB: string): number {
  const msA = Date.parse(`${dataA}T12:00:00Z`);
  const msB = Date.parse(`${dataB}T12:00:00Z`);
  if (Number.isNaN(msA) || Number.isNaN(msB)) return 999;
  return Math.round(Math.abs(msA - msB) / (1000 * 60 * 60 * 24));
}

function nomeCombinaComDescricao(
  trabalhador: string,
  descricaoExtrato: string
): boolean {
  const descNorm = normalizarTextoComparacao(descricaoExtrato);
  const canon = normalizarNomeTrabalhadorCanonico(trabalhador);
  const tokens = new Set<string>();

  for (const base of [trabalhador, canon]) {
    normalizarTextoComparacao(base)
      .split(' ')
      .filter((t) => t.length >= 3)
      .forEach((t) => tokens.add(t));
  }

  // Sinônimos de nomes civis de campo
  const canonUp = normalizarTextoComparacao(canon);
  if (canonUp === 'PEU') tokens.add('EDMILSON');
  if (canonUp === 'GIL') {
    tokens.add('GILVAN');
    tokens.add('GIL');
  }
  if (canonUp === 'WENDER') tokens.add('WESLEN');
  if (canonUp === 'ZE ROBERTO') tokens.add('ROBERTO');
  if (canonUp === 'LUCAS J') tokens.add('LUCAS');
  if (canonUp === 'IAN') tokens.add('IAN');

  for (const token of Array.from(tokens)) {
    if (descNorm.includes(token)) return true;
  }
  return false;
}

/**
 * Motor de Matching Inteligente PIX (Feature 1 — V16):
 * Cruza saídas PIX do extrato OFX/CSV com registros do sistema (vales, diárias, liquidações e caixinha)
 * isolados pelo tenant_id ativo, sugerindo conciliação em 1 clique e apontando divergências.
 */
export function executarMatchingConciliacaoPix(params: {
  conteudoArquivo: string;
  nomeArquivo: string;
  bancoForcado?: BancoExtratoSuportado;
  registrosSistema: readonly RegistroSistemaConciliacao[];
}): RelatorioConciliacaoBancaria {
  const isOfx =
    params.nomeArquivo.toLowerCase().endsWith('.ofx') ||
    /<OFX>|<STMTTRN>/i.test(params.conteudoArquivo);
  const formato: 'OFX' | 'CSV' = isOfx ? 'OFX' : 'CSV';

  const transacoes = isOfx
    ? parseExtratoOFX(
        params.conteudoArquivo,
        params.bancoForcado,
        params.nomeArquivo
      )
    : parseExtratoCSV(
        params.conteudoArquivo,
        params.bancoForcado,
        params.nomeArquivo
      );

  const bancoDetectado =
    params.bancoForcado ||
    transacoes[0]?.banco ||
    detectarBancoExtrato(params.conteudoArquivo, params.nomeArquivo);

  const registrosUsados = new Set<string>();
  const itens: ResultadoMatchTransacao[] = [];

  for (const tx of transacoes) {
    let melhorCandidato: RegistroSistemaConciliacao | null = null;
    let melhorScore = 0;
    let melhorMotivo = 'Nenhuma correspondência encontrada no sistema.';

    for (const reg of params.registrosSistema) {
      if (registrosUsados.has(reg.id)) continue;

      const difValor = Math.abs(tx.valorSaida - reg.valor);
      const dias = diffDias(tx.data, reg.data);
      const nomeBate = nomeCombinaComDescricao(reg.trabalhador, tx.descricao);

      let score = 0;
      const razoes: string[] = [];

      if (difValor <= 0.05) {
        score += 55;
        razoes.push('valor exato');
      } else if (difValor <= 5.0 && nomeBate) {
        score += 25;
        razoes.push(`diferença de R$ ${difValor.toFixed(2)}`);
      } else {
        continue;
      }

      if (nomeBate) {
        score += 30;
        razoes.push(`favorecido compatível (${reg.trabalhador})`);
      }

      if (dias === 0) {
        score += 15;
        razoes.push('mesma data');
      } else if (dias <= 2) {
        score += 10;
        razoes.push(`janela ±${dias}d`);
      } else if (dias <= 5) {
        score += 5;
        razoes.push(`janela ±${dias}d`);
      }

      if (score > melhorScore) {
        melhorScore = score;
        melhorCandidato = reg;
        melhorMotivo = `Match por ${razoes.join(' + ')}`;
      }
    }

    if (melhorCandidato && melhorScore >= 85) {
      registrosUsados.add(melhorCandidato.id);
      itens.push({
        transacao: tx,
        statusMatch: 'CONCILIADO_EXATO',
        score: melhorScore,
        motivo: melhorMotivo,
        candidato: melhorCandidato,
        diferencaValor: Number(
          (tx.valorSaida - melhorCandidato.valor).toFixed(2)
        ),
      });
    } else if (melhorCandidato && melhorScore >= 55) {
      registrosUsados.add(melhorCandidato.id);
      itens.push({
        transacao: tx,
        statusMatch: 'SUGESTAO_MATCH',
        score: melhorScore,
        motivo: `${melhorMotivo} — validar em 1 clique`,
        candidato: melhorCandidato,
        diferencaValor: Number(
          (tx.valorSaida - melhorCandidato.valor).toFixed(2)
        ),
      });
    } else {
      itens.push({
        transacao: tx,
        statusMatch: 'DIVERGENCIA',
        score: melhorScore,
        motivo:
          'Saída PIX no extrato sem lançamento compatível no período (possível vale/diária não lançado ou PIX avulso).',
        candidato: null,
        diferencaValor: tx.valorSaida,
      });
    }
  }

  return {
    bancoDetectado,
    formato,
    totalTransacoesSaida: transacoes.length,
    totalValorSaidas: Number(
      transacoes.reduce((acc, t) => acc + t.valorSaida, 0).toFixed(2)
    ),
    qtdConciliadoExato: itens.filter((i) => i.statusMatch === 'CONCILIADO_EXATO')
      .length,
    qtdSugestaoMatch: itens.filter((i) => i.statusMatch === 'SUGESTAO_MATCH')
      .length,
    qtdDivergencias: itens.filter((i) => i.statusMatch === 'DIVERGENCIA')
      .length,
    itens,
  };
}
