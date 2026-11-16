export type TipoObra = 'PISCINA' | 'OBRA_CIVIL';
export type NivelPermissao = 'APONTAMENTO' | 'CONSULTA' | 'MASTER';
export type TipoLancamento = 'PONTO' | 'VALE' | 'LIQUIDACAO';
export type StatusLancamento = 'PENDENTE' | 'VALIDADO' | 'LIQUIDADO';
export type StatusValidacao = 'PENDENTE' | 'VALIDADO';
export type RegimeRemuneracao = 'DIARISTA' | 'SEMANALISTA' | 'QUINZENALISTA';
export type CicloPagamento = 'SEMANAL' | 'QUINZENAL';

export interface ParametrosSistemaConfig {
  dia_viagem_padrao: number;
  dia_chuva_padrao: number;
  dia_parado_padrao: number;
  diaria_piscina_padrao: number;
  diaria_civil_padrao: number;
}

export interface ObraConfig {
  id: string;
  tenant_id: string;
  nome: string;
  local: string;
  tipo_obra: TipoObra;
  valor_diaria_padrao?: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface FuncionarioObra {
  id: string;
  tenant_id: string;
  obra_id: string | null;
  nome_trabalhador: string;
  funcao?: string;
  regime_remuneracao?: RegimeRemuneracao;
  ciclo_pagamento?: CicloPagamento;
  valor_base_contratual?: number;
  valor_diaria: number; // mantido para compatibilidade
  chave_pix?: string | null;
  telefone?: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface EncarregadoObra {
  id: string;
  tenant_id: string;
  telefone_encarregado: string;
  nome?: string | null;
  obra_id: string | null;
  nivel_permissao: NivelPermissao;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PontoLote {
  id: string;
  tenant_id: string;
  obra_id: string;
  data_referencia: string;
  texto_original: string;
  status_validacao: StatusValidacao;
  token_aprovacao: string;
  validado_por?: string | null;
  validado_em?: string | null;
  created_at: string;
}

export interface PontoDetalhe {
  id: string;
  tenant_id: string;
  ponto_lote_id: string;
  funcionario_id?: string | null;
  nome_trabalhador: string;
  fracao_dia: number;
  motivo_excecao?: string | null;
  created_at: string;
}

export interface LancamentoFinanceiro {
  id: string;
  tenant_id: string;
  obra_id: string | null;
  funcionario_id?: string | null;
  nome_trabalhador: string;
  tipo_lancamento: TipoLancamento;
  fracao_dia?: number;
  valor_monetario: number;
  status: StatusLancamento;
  data_referencia: string;
  observacao?: string | null;
  ponto_lote_id?: string | null;
  comprovante_url?: string | null;
  liquidado_em?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppGrupoMonitorado {
  id: string;
  tenant_id: string;
  group_jid: string;
  nome_grupo: string;
  obra_id?: string | null;
  monitorar: boolean;
  total_mensagens_processadas: number;
  ultima_sincronizacao: string;
  created_at: string;
}

export interface ObraFoto {
  id: string;
  tenant_id: string;
  obra_id?: string | null;
  autor_telefone?: string | null;
  autor_nome?: string | null;
  url_original: string;
  url_estampada: string;
  descricao?: string | null;
  etapa_obra: string;
  latitude?: number | null;
  longitude?: number | null;
  clima_resumo?: string | null;
  sha256_hash?: string | null;
  data_foto: string;
  created_at: string;
}

export interface NLPObraExtracao {
  nome_obra: string;
  data_referencia?: string;
  apontamentos: Array<{
    nome: string;
    fracao: number;
    motivo?: string;
  }>;
  vales: Array<{
    nome: string;
    valor: number;
  }>;
  setup?: boolean;
}

export interface NLPExtracaoResponse {
  obras: NLPObraExtracao[];
}


export interface TrabalhadorObraValor {
  id: string;
  tenant_id: string;
  funcionario_id?: string | null;
  nome_trabalhador: string;
  obra_id?: string | null;
  nome_obra?: string | null;
  valor_diaria: number;
  observacao?: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export type StatusReembolso = 'PENDENTE_ANALISE' | 'APROVADO' | 'PAGO_PARCIAL' | 'LIQUIDADO' | 'RECUSADO';

export interface PedidoReembolso {
  id: string;
  tenant_id: string;
  obra_id?: string | null;
  nome_obra?: string | null;
  solicitante_nome: string;
  solicitante_telefone?: string | null;
  categoria: 'COMBUSTIVEL' | 'MATERIAL' | 'ALIMENTACAO' | 'PEDAGIO' | 'OUTROS';
  descricao?: string | null;
  valor_solicitado: number;
  valor_aprovado: number;
  valor_pago: number;
  saldo_pendente: number;
  status: StatusReembolso;
  comprovante_url?: string | null;
  motivo_recusa?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PagamentoReembolso {
  id: string;
  tenant_id: string;
  reembolso_id: string;
  valor_pago: number;
  data_pagamento: string;
  forma_pagamento: string;
  comprovante_pix_url?: string | null;
  registrado_por: string;
  observacao?: string | null;
  created_at: string;
}
