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

/**
 * Dispara o download de uma planilha .xlsx no navegador do usuário
 */
export function exportarParaExcel<T>(dados: T[], nomeArquivo: string, nomeAba = 'Dados') {
  if (!dados || dados.length === 0) {
    alert('Nenhum dado disponível para exportação.');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nomeAba);

  // Auto-ajuste aproximado da largura das colunas
  const colProps = Object.keys(dados[0] as object).map((key) => ({
    wch: Math.max(key.length + 4, 14),
  }));
  ws['!cols'] = colProps;

  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
}

