export type TipoObra = 'PISCINA' | 'OBRA_CIVIL';
export type NivelPermissao = 'APONTAMENTO' | 'CONSULTA' | 'MASTER';
export type TipoLancamento = 'PONTO' | 'VALE' | 'LIQUIDACAO';
export type StatusLancamento = 'PENDENTE' | 'VALIDADO' | 'LIQUIDADO';
export type StatusValidacao = 'PENDENTE' | 'VALIDADO';

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
  valor_diaria: number;
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

