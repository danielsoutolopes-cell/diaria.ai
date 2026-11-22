import * as XLSX from 'xlsx';

export interface LinhaBorderoExport {
  Colaborador: string;
  Obra: string;
  'Chave PIX': string;
  'Diárias Qtd': number;
  'Total Diárias (R$)': number;
  'Vales Deduzidos (R$)': number;
  'Líquido a Pagar (R$)': number;
  Período: string;
}

export interface LinhaExtratoAnaliticoExport {
  Data: string;
  Colaborador: string;
  Obra: string;
  Tipo: string;
  'Fração / Qtd': string;
  'Valor (R$)': number;
  Status: string;
  'Chave PIX': string;
}

export interface LinhaCustoObraExport {
  Obra: string;
  Tipo: string;
  'Total Diárias': number;
  'Total Vales': number;
  'Total Geral (R$)': number;
  'Qtd Trabalhadores': number;
}

export interface ExcelV6ResumoTrabalhador {
  trabalhador: string;
  obras: string;
  chavePix: string;
  qtdDiarias: number;
  totalDiariasValor: number;
  totalValesValor: number;
  liquidoPagar: number;
  quitadoAnterior: number;
  caixinhaEmMaos: number;
}

export interface ExcelV6DetalhamentoDiaria {
  data: string;
  trabalhador: string;
  obra: string;
  tipologiaRegra: string;
  fracao: number;
  valor: number;
  status: string;
  observacao: string;
}

export interface ExcelV6ControleVale {
  data: string;
  horario: string;
  trabalhador: string;
  obra: string;
  etapa: string;
  solicitadoPor: string;
  dataHoraSolicitacao?: string;
  aprovadoPor?: string;
  pagoPor: string;
  dataHoraEnvioEfetivo?: string;
  valor: number;
  status: string;
  comprovanteUrl: string;
}

export interface ExcelV6CaixinhaMovimento {
  data: string;
  hora: string;
  encarregado: string;
  perfisUnificados: string;
  obra: string;
  tipo: string;
  categoria: string;
  descricao: string;
  preImplantacao: string;
  entrada: number;
  saida: number;
}

export interface ExcelV6CustoObra {
  obra: string;
  tipologia: string;
  qtdTrabalhadores: number;
  diariasAbertas: number;
  diariasQuitadas: number;
  totalDiarias: number;
  valesRelacionados: number;
}

export interface ExtratoAnaliticoV6Payload {
  empresaNome: string;
  periodoLabel: string;
  resumoTrabalhadores: ExcelV6ResumoTrabalhador[];
  detalhamentoDiarias: ExcelV6DetalhamentoDiaria[];
  controleVales: ExcelV6ControleVale[];
  caixinhaCampo: ExcelV6CaixinhaMovimento[];
  custoPorObra: ExcelV6CustoObra[];
}

function aplicarLarguras(ws: XLSX.WorkSheet, larguras: number[]): void {
  ws['!cols'] = larguras.map((wch) => ({ wch }));
}

function adicionarLinhaFormulaSoma(
  ws: XLSX.WorkSheet,
  rowIndex1Based: number,
  colunasSoma: Array<{ colIndex0: number; colLetra: string; numFmt?: string }>,
  totalColunas: number,
  rotuloTotal = 'TOTAL GERAL'
): void {
  const labelRef = XLSX.utils.encode_cell({ r: rowIndex1Based - 1, c: 0 });
  ws[labelRef] = { t: 's', v: rotuloTotal };

  const ultimaLinhaDados = rowIndex1Based - 1;
  for (const col of colunasSoma) {
    const cellRef = XLSX.utils.encode_cell({
      r: rowIndex1Based - 1,
      c: col.colIndex0,
    });
    ws[cellRef] = {
      t: 'n',
      f:
        ultimaLinhaDados >= 2
          ? `SUM(${col.colLetra}2:${col.colLetra}${ultimaLinhaDados})`
          : '0',
      z: col.numFmt || '#,##0.00',
    };
  }

  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rowIndex1Based - 1, c: totalColunas - 1 },
  });
}

/**
 * Gera workbook .xlsx em 5 Abas Inteligentes (V6 — Prompt 6) com nomes canônicos,
 * chaves PIX, distinção Chuva/Piscina/Rateio e fórmulas nativas =SUM(...).
 */
export function gerarWorkbookAnalitico5AbasV6(
  payload: ExtratoAnaliticoV6Payload
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ABA 1: Resumo por Trabalhador
  const rowsAba1: Array<Array<string | number>> = [
    [
      'Trabalhador (Canônico)',
      'Obra(s)',
      'Chave PIX',
      'Qtd Diárias',
      'Diárias Abertas (R$)',
      'Vales Abertos (R$)',
      'Líquido a Pagar (R$)',
      'Quitado Anterior (R$)',
      'Caixinha em Mãos (R$)*',
    ],
    ...payload.resumoTrabalhadores.map((r) => [
      r.trabalhador,
      r.obras,
      r.chavePix,
      r.qtdDiarias,
      r.totalDiariasValor,
      r.totalValesValor,
      r.liquidoPagar,
      r.quitadoAnterior,
      r.caixinhaEmMaos,
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(rowsAba1);
  adicionarLinhaFormulaSoma(
    ws1,
    rowsAba1.length + 1,
    [
      { colIndex0: 3, colLetra: 'D', numFmt: '0.0' },
      { colIndex0: 4, colLetra: 'E' },
      { colIndex0: 5, colLetra: 'F' },
      { colIndex0: 6, colLetra: 'G' },
      { colIndex0: 7, colLetra: 'H' },
      { colIndex0: 8, colLetra: 'I' },
    ],
    9
  );
  aplicarLarguras(ws1, [22, 28, 28, 13, 20, 18, 20, 20, 22]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumo por Trabalhador');

  // ABA 2: Detalhamento de Diárias (distinguindo Chuva R$120 / Piscina / Rateio ½+½)
  const rowsAba2: Array<Array<string | number>> = [
    [
      'Data',
      'Colaborador',
      'Obra',
      'Tipologia / Regra',
      'Fração',
      'Valor (R$)',
      'Status',
      'Observação',
    ],
    ...payload.detalhamentoDiarias.map((d) => [
      d.data,
      d.trabalhador,
      d.obra,
      d.tipologiaRegra,
      d.fracao,
      d.valor,
      d.status,
      d.observacao,
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(rowsAba2);
  adicionarLinhaFormulaSoma(
    ws2,
    rowsAba2.length + 1,
    [
      { colIndex0: 4, colLetra: 'E', numFmt: '0.0' },
      { colIndex0: 5, colLetra: 'F' },
    ],
    8
  );
  aplicarLarguras(ws2, [12, 22, 24, 22, 10, 15, 14, 38]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Detalhamento de Diárias');

  // ABA 3: Controle de Vales (2 Etapas + Rastreabilidade Integral V15)
  const rowsAba3: Array<Array<string | number>> = [
    [
      'Data',
      'Horário',
      'Colaborador',
      'Obra',
      'Etapa',
      'Solicitado Por',
      'Data/Hora Solicitação',
      'Aprovado / Pago Por (PIX)',
      'Data/Hora Envio PIX',
      'Valor (R$)',
      'Status',
      'Comprovante PIX',
    ],
    ...payload.controleVales.map((v) => [
      v.data,
      v.horario,
      v.trabalhador,
      v.obra,
      v.etapa,
      v.solicitadoPor,
      v.dataHoraSolicitacao || `${v.data}T${v.horario || '12:00'}:00-03:00`,
      v.aprovadoPor || v.pagoPor,
      v.dataHoraEnvioEfetivo || '—',
      v.valor,
      v.status,
      v.comprovanteUrl,
    ]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(rowsAba3);
  adicionarLinhaFormulaSoma(
    ws3,
    rowsAba3.length + 1,
    [{ colIndex0: 9, colLetra: 'J' }],
    12
  );
  aplicarLarguras(ws3, [12, 10, 20, 24, 20, 18, 25, 22, 25, 14, 14, 34]);
  XLSX.utils.book_append_sheet(wb, ws3, 'Controle de Vales');

  // ABA 4: Caixinha de Campo (Unificado + Pré-implantação 13/11)
  const rowsAba4: Array<Array<string | number>> = [
    [
      'Data',
      'Hora',
      'Encarregado (Canônico)',
      'Perfis Unificados',
      'Obra',
      'Tipo',
      'Categoria',
      'Descrição',
      'Pré-Implantação',
      'Entrada PIX (R$)',
      'Saída / Nota (R$)',
    ],
    ...payload.caixinhaCampo.map((c) => [
      c.data,
      c.hora,
      c.encarregado,
      c.perfisUnificados,
      c.obra,
      c.tipo,
      c.categoria,
      c.descricao,
      c.preImplantacao,
      c.entrada,
      c.saida,
    ]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(rowsAba4);
  const totalRow4 = rowsAba4.length + 1;
  adicionarLinhaFormulaSoma(
    ws4,
    totalRow4,
    [
      { colIndex0: 9, colLetra: 'J' },
      { colIndex0: 10, colLetra: 'K' },
    ],
    11
  );
  // Linha extra de Saldo / Troco em Mãos (=J_total - K_total)
  const saldoRow4 = totalRow4 + 1;
  ws4[XLSX.utils.encode_cell({ r: saldoRow4 - 1, c: 0 })] = {
    t: 's',
    v: 'SALDO / TROCO EM MÃOS (ENTRADAS - SAÍDAS)',
  };
  ws4[XLSX.utils.encode_cell({ r: saldoRow4 - 1, c: 9 })] = {
    t: 'n',
    f: `J${totalRow4}-K${totalRow4}`,
    z: '#,##0.00',
  };
  ws4['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: saldoRow4 - 1, c: 10 },
  });
  aplicarLarguras(ws4, [12, 8, 20, 22, 22, 16, 20, 36, 16, 18, 18]);
  XLSX.utils.book_append_sheet(wb, ws4, 'Caixinha de Campo');

  // ABA 5: Custo por Obra
  const rowsAba5: Array<Array<string | number>> = [
    [
      'Obra (Canônica)',
      'Tipologia',
      'Qtd Trabalhadores',
      'Diárias Abertas (R$)',
      'Diárias Quitadas (R$)',
      'Total Diárias (R$)',
      'Vales Relacionados (R$)',
    ],
    ...payload.custoPorObra.map((o) => [
      o.obra,
      o.tipologia,
      o.qtdTrabalhadores,
      o.diariasAbertas,
      o.diariasQuitadas,
      o.totalDiarias,
      o.valesRelacionados,
    ]),
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(rowsAba5);
  adicionarLinhaFormulaSoma(
    ws5,
    rowsAba5.length + 1,
    [
      { colIndex0: 2, colLetra: 'C', numFmt: '0' },
      { colIndex0: 3, colLetra: 'D' },
      { colIndex0: 4, colLetra: 'E' },
      { colIndex0: 5, colLetra: 'F' },
      { colIndex0: 6, colLetra: 'G' },
    ],
    7
  );
  aplicarLarguras(ws5, [26, 16, 18, 20, 20, 20, 22]);
  XLSX.utils.book_append_sheet(wb, ws5, 'Custo por Obra');

  return wb;
}

/**
 * Dispara o download do Extrato Analítico V6 (5 Abas com =SUM) no navegador.
 */
export function exportarExtratoAnalitico5AbasV6(
  payload: ExtratoAnaliticoV6Payload,
  nomeArquivo?: string
): void {
  const wb = gerarWorkbookAnalitico5AbasV6(payload);
  const slugEmpresa = payload.empresaNome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const dataHoje = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
  XLSX.writeFile(
    wb,
    `${nomeArquivo || `extrato-analitico-v6-${slugEmpresa}-${dataHoje}`}.xlsx`
  );
}

/**
 * Dispara o download de uma planilha .xlsx simples no navegador (mantido para compatibilidade)
 */
export function exportarParaExcel<T>(
  dados: T[],
  nomeArquivo: string,
  nomeAba = 'Dados'
) {
  if (!dados || dados.length === 0) {
    alert('Nenhum dado disponível para exportação.');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nomeAba);

  const colProps = Object.keys(dados[0] as object).map((key) => ({
    wch: Math.max(key.length + 4, 14),
  }));
  ws['!cols'] = colProps;

  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
}

