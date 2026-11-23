// ==============================================================================
// Domínio puro do Diário de Obra: Empreiteiros, Funcionários (com apelidos e
// documento), Etapas/Frentes de Serviço, Separação Acesso x Ocorrência e
// Relatórios agrupados por Empreiteiro / Encarregado (WhatsApp, CSV e PDF).
// ==============================================================================

export interface EmpreiteiroDiarioRecord {
  id: string;
  tenantId: string;
  nome: string;
  apelidos: string[];
  documento: string | null;
  telefone?: string | null;
  etapaPadrao?: string | null;
  ativo: boolean;
  createdAt?: string;
}

export interface FuncionarioEmpreiteiroRecord {
  id: string;
  tenantId: string;
  empreiteiroId: string | null;
  empreiteiroNome?: string | null;
  nomeOficial: string;
  apelidos: string[];
  documento: string | null;
  funcao?: string | null;
  ativo: boolean;
  createdAt?: string;
}

export interface EtapaOpcaoDiario {
  id: string | null;
  nome: string;
  origem: 'OBRA' | 'PADRAO';
}

export interface EfetivoItem {
  funcionarioId?: string | null;
  nome: string;
  apelidos?: string[];
  documento?: string | null;
  empreiteiroId?: string | null;
  empreiteiroNome?: string | null;
  etapaId?: string | null;
  etapaNome?: string | null;
  periodo: 'INTEGRAL' | 'MEIO_DIA';
}

export interface DiarioObraRegistro {
  id: string;
  tenantSlug: string;
  empresaNome: string;
  obraId?: string | null;
  obraNome: string;
  ambiente: 'INTERNO' | 'EXTERNO';
  data: string;
  clima: string;
  statusCondominio?: string;
  ocorrenciaTipo?: string;
  empreiteiroId?: string | null;
  empreiteiro: string;
  etapaId?: string | null;
  etapaNome?: string | null;
  efetivo: EfetivoItem[];
  resumo: string;
  ocorrencias: string;
  fotos: string[];
  criadoPor: string;
  criadoEm: string;
}

export interface GrupoEmpreiteiroRelatorio {
  empreiteiroId: string | null;
  empreiteiroNome: string;
  etapas: string[];
  funcionarios: EfetivoItem[];
  totalProfissionais: number;
  totalHomensDia: number;
}

/**
 * Condições exclusivas de Condomínio / Acesso (portaria, horário e barulho).
 * Impedimentos de material ou terceiros ficam no bloco separado de Ocorrências.
 */
export const OPCOES_CONDOMINIO_ACESSO: readonly string[] = [
  'Acesso Normal',
  'Restrição de Horário / Barulho',
  'Aguardando Liberação de Portaria',
  'Restrição de Elevador / Carga',
] as const;

/**
 * Tipos de Ocorrência / Impedimento — exibidos apenas quando aplicável.
 */
export const OPCOES_OCORRENCIA_IMPEDIMENTO: readonly string[] = [
  'Falta de Material do Cliente',
  'Aguardando Definição / Projeto',
  'Impedimento Climático / Chuva',
  'Interferência de Terceiros / Condomínio',
  'Atraso de Entrega / Fornecedor',
  'Outra Ocorrência',
] as const;

export const OPCOES_CLIMA: readonly string[] = [
  'Ensolarado',
  'Nublado',
  'Chuva Parcial',
  'Chuva Forte',
] as const;

export const ETAPAS_PADRAO_OBRA: readonly string[] = [
  'Hidráulica',
  'Gesso',
  'Elétrica',
  'Demolição',
  'Alvenaria',
  'Revestimentos',
  'Pintura',
  'Marcenaria',
  'Piscina / Estrutura',
  'Acabamento',
  'Limpeza / Organização',
] as const;

export function normalizarTextoBusca(valor: string | null | undefined): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsearApelidosLista(
  raw: string | string[] | null | undefined
): string[] {
  if (!raw) return [];
  const lista = Array.isArray(raw) ? raw : raw.split(/[,;/\n]+/);
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const item of lista) {
    const limpo = String(item || '').trim();
    if (!limpo) continue;
    const chave = normalizarTextoBusca(limpo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(limpo);
  }
  return resultado;
}

export function sanitizarStatusCondominio(valor: string | null | undefined): string {
  const limpo = (valor || '').trim();
  if (!limpo) return 'Acesso Normal';
  const norm = normalizarTextoBusca(limpo);
  if (norm.includes('falta de material')) {
    return 'Acesso Normal';
  }
  if (norm.includes('barulho') || norm.includes('horario')) {
    return 'Restrição de Horário / Barulho';
  }
  if (norm.includes('portaria') || norm.includes('liberacao')) {
    return 'Aguardando Liberação de Portaria';
  }
  if (norm.includes('elevador') || norm.includes('carga')) {
    return 'Restrição de Elevador / Carga';
  }
  const exato = OPCOES_CONDOMINIO_ACESSO.find(
    (op) => normalizarTextoBusca(op) === norm
  );
  return exato || 'Acesso Normal';
}

export function montarTextoOcorrencia(
  ocorrenciaTipo: string | null | undefined,
  ocorrenciasDetalhes: string | null | undefined
): string {
  const tipo = (ocorrenciaTipo || '').trim();
  const detalhes = (ocorrenciasDetalhes || '').trim();
  if (!tipo && !detalhes) return '';
  if (tipo && detalhes) {
    if (normalizarTextoBusca(detalhes).startsWith(normalizarTextoBusca(tipo))) {
      return detalhes;
    }
    return `${tipo}: ${detalhes}`;
  }
  return tipo || detalhes;
}

/**
 * Combina as etapas cadastradas da obra (vindas de /medicoes) no topo com as
 * etapas padrão, sem duplicar entradas equivalentes.
 */
export function montarOpcoesEtapasObra(
  etapasDaObra: ReadonlyArray<{ id?: string | null; nome: string }>
): EtapaOpcaoDiario[] {
  const resultado: EtapaOpcaoDiario[] = [];
  const vistos = new Set<string>();

  for (const etapa of etapasDaObra) {
    const nome = (etapa.nome || '').trim();
    const chave = normalizarTextoBusca(nome);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push({
      id: etapa.id ?? null,
      nome,
      origem: 'OBRA',
    });
  }

  for (const padrao of ETAPAS_PADRAO_OBRA) {
    const chave = normalizarTextoBusca(padrao);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push({
      id: null,
      nome: padrao,
      origem: 'PADRAO',
    });
  }

  return resultado;
}

/**
 * Filtra funcionários por empreiteiro selecionado (opcional) e termo de busca
 * que casa com nome oficial, qualquer apelido ou documento (CPF/RG).
 */
export function filtrarFuncionariosPorEmpreiteiroEBusca(
  funcionarios: ReadonlyArray<FuncionarioEmpreiteiroRecord>,
  empreiteiroId: string | null | undefined,
  termoBusca?: string | null,
  incluirTodosSeSemMatchEquipe = false
): FuncionarioEmpreiteiroRecord[] {
  const ativos = funcionarios.filter((f) => f.ativo !== false);
  const termoNorm = normalizarTextoBusca(termoBusca);
  const termoDigitos = (termoBusca || '').replace(/\D/g, '');

  const casaBusca = (f: FuncionarioEmpreiteiroRecord): boolean => {
    if (!termoNorm) return true;
    if (normalizarTextoBusca(f.nomeOficial).includes(termoNorm)) return true;
    if (
      (f.apelidos || []).some((ap) => normalizarTextoBusca(ap).includes(termoNorm))
    ) {
      return true;
    }
    if (f.documento) {
      if (normalizarTextoBusca(f.documento).includes(termoNorm)) return true;
      if (termoDigitos.length >= 3) {
        const docDigitos = f.documento.replace(/\D/g, '');
        if (docDigitos.includes(termoDigitos)) return true;
      }
    }
    return false;
  };

  if (empreiteiroId) {
    const daEquipe = ativos.filter(
      (f) => f.empreiteiroId === empreiteiroId && casaBusca(f)
    );
    if (daEquipe.length > 0 || !incluirTodosSeSemMatchEquipe) {
      return daEquipe;
    }
  }

  return ativos.filter(casaBusca);
}

/**
 * Formata um funcionário para exibição/relatório incluindo apelidos e documento
 * quando informados.
 */
export function formatarNomeFuncionarioComMetadados(item: {
  nome: string;
  apelidos?: string[];
  documento?: string | null;
}): string {
  const partes: string[] = [item.nome.trim()];
  const apelidosLimpos = (item.apelidos || []).filter(
    (a) =>
      a.trim().length > 0 &&
      normalizarTextoBusca(a) !== normalizarTextoBusca(item.nome)
  );
  if (apelidosLimpos.length > 0) {
    partes[0] = `${partes[0]} (${apelidosLimpos.join(', ')})`;
  }
  if (item.documento && item.documento.trim().length > 0) {
    partes.push(`Doc: ${item.documento.trim()}`);
  }
  return partes.join(' • ');
}

export function extrairEmpreiteirosDoDiario(diario: DiarioObraRegistro): string[] {
  const nomes: string[] = [];
  const vistos = new Set<string>();
  const add = (nome: string | null | undefined) => {
    const limpo = (nome || '').trim();
    if (!limpo) return;
    const chave = normalizarTextoBusca(limpo);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    nomes.push(limpo);
  };

  for (const item of diario.efetivo || []) {
    add(item.empreiteiroNome || diario.empreiteiro);
  }
  if (nomes.length === 0) {
    add(diario.empreiteiro || 'Equipe de Campo');
  }
  return nomes;
}

/**
 * Agrupa os profissionais presentes de um diário por Empreiteiro / Encarregado,
 * consolidando as etapas executadas e o total de homens-dia de cada equipe.
 */
export function agruparEfetivoPorEmpreiteiro(
  diario: DiarioObraRegistro,
  filtroEmpreiteiro?: string | null
): GrupoEmpreiteiroRelatorio[] {
  const filtroNorm = normalizarTextoBusca(filtroEmpreiteiro);
  const mapa = new Map<string, GrupoEmpreiteiroRelatorio>();

  const efetivoLista = diario.efetivo || [];
  if (efetivoLista.length === 0) {
    const empFallback = (diario.empreiteiro || 'Equipe de Campo').trim();
    if (!filtroNorm || normalizarTextoBusca(empFallback) === filtroNorm) {
      const etapasFallback = diario.etapaNome?.trim()
        ? [diario.etapaNome.trim()]
        : [];
      return [
        {
          empreiteiroId: diario.empreiteiroId ?? null,
          empreiteiroNome: empFallback,
          etapas: etapasFallback,
          funcionarios: [],
          totalProfissionais: 0,
          totalHomensDia: 0,
        },
      ];
    }
    return [];
  }

  for (const item of efetivoLista) {
    const empNome = (
      item.empreiteiroNome ||
      diario.empreiteiro ||
      'Equipe de Campo'
    ).trim();
    const chaveEmp = normalizarTextoBusca(empNome) || 'equipe-de-campo';
    if (filtroNorm && chaveEmp !== filtroNorm) {
      continue;
    }

    let grupo = mapa.get(chaveEmp);
    if (!grupo) {
      grupo = {
        empreiteiroId: item.empreiteiroId ?? diario.empreiteiroId ?? null,
        empreiteiroNome: empNome,
        etapas: [],
        funcionarios: [],
        totalProfissionais: 0,
        totalHomensDia: 0,
      };
      mapa.set(chaveEmp, grupo);
    }

    const etapaItem = (item.etapaNome || diario.etapaNome || '').trim();
    if (
      etapaItem &&
      !grupo.etapas.some(
        (et) => normalizarTextoBusca(et) === normalizarTextoBusca(etapaItem)
      )
    ) {
      grupo.etapas.push(etapaItem);
    }

    grupo.funcionarios.push({
      ...item,
      empreiteiroNome: empNome,
      etapaNome: etapaItem || null,
    });
    grupo.totalProfissionais += 1;
    grupo.totalHomensDia += item.periodo === 'INTEGRAL' ? 1 : 0.5;
  }

  return Array.from(mapa.values());
}

/**
 * A estrutura de subempreita (Empreiteiro/Encarregado × Funcionário + Etapa)
 * é exclusiva do tenant Intermack (modo EMPREITA), mantendo a Jhoston no fluxo direto.
 */
export function isSubempreitaHabilitada(
  tenantSlugOrId: string | null | undefined
): boolean {
  const norm = normalizarTextoBusca(tenantSlugOrId);
  return (
    norm === 'intermack' ||
    norm === '00000000-0000-0000-0000-000000000002'
  );
}

/**
 * Gera o texto formatado para WhatsApp de um Diário de Obra.
 * - Na Intermack: agrupa por Empreiteiro / Encarregado com Etapa executada e
 *   relação de funcionários (apelidos e documento), com suporte a filtro.
 * - Na Jhoston: mantém o fluxo direto de operação (sem subempreita).
 */
export function gerarTextoWhatsAppDiario(
  diario: DiarioObraRegistro,
  filtroEmpreiteiro?: string | null
): string {
  const ocorrenciaFinal = montarTextoOcorrencia(
    diario.ocorrenciaTipo,
    diario.ocorrencias
  );

  if (!isSubempreitaHabilitada(diario.tenantSlug)) {
    const listaDireta =
      diario.efetivo.length > 0
        ? diario.efetivo
            .map(
              (e) =>
                `• ${e.nome} (${e.periodo === 'INTEGRAL' ? 'Dia Inteiro' : 'Meio Dia'})`
            )
            .join('\n')
        : '• Não informado';

    return (
      `📋 *DIÁRIO DE OBRA — ${diario.empresaNome.toUpperCase()}*\n` +
      `🏗️ *Obra:* ${diario.obraNome}\n` +
      `📅 *Data:* ${diario.data} | ☀️ *Clima:* ${diario.clima || 'Ensolarado'}\n` +
      `\n👥 *Efetivo Presente (${diario.efetivo.length}):*\n${listaDireta}\n` +
      `\n📝 *Resumo das Atividades:*\n${diario.resumo}\n` +
      (ocorrenciaFinal
        ? `\n⚠️ *Ocorrências / Pendências:*\n${ocorrenciaFinal}\n`
        : '') +
      `\n📸 *Fotos:* ${diario.fotos.length} registro(s).`
    );
  }

  const grupos = agruparEfetivoPorEmpreiteiro(diario, filtroEmpreiteiro);
  const totalPresentes = grupos.reduce((acc, g) => acc + g.totalProfissionais, 0);
  const condicaoLinha =
    diario.ambiente === 'INTERNO'
      ? `🏢 *Condomínio / Acesso:* ${sanitizarStatusCondominio(diario.statusCondominio)}`
      : `☀️ *Clima:* ${diario.clima || 'Ensolarado'}`;

  const blocosEquipes =
    grupos.length > 0
      ? grupos
          .map((g) => {
            const etapasTxt =
              g.etapas.length > 0 ? g.etapas.join(', ') : 'Serviço geral';
            const listaFuncs =
              g.funcionarios.length > 0
                ? g.funcionarios
                    .map((f) => {
                      const nomeMeta = formatarNomeFuncionarioComMetadados(f);
                      const periodoTxt =
                        f.periodo === 'INTEGRAL' ? 'Dia Inteiro' : 'Meio Dia';
                      const etapaExtra =
                        f.etapaNome && g.etapas.length > 1
                          ? ` • ${f.etapaNome}`
                          : '';
                      return `   • ${nomeMeta}${etapaExtra} (${periodoTxt})`;
                    })
                    .join('\n')
                : '   • Sem efetivo listado';
            return (
              `👷 *Empreiteiro:* ${g.empreiteiroNome}\n` +
              `🔧 *Etapa / Serviço:* ${etapasTxt}\n` +
              `👥 *Equipe (${g.totalProfissionais} | ${g.totalHomensDia.toFixed(1)} H/D):*\n` +
              listaFuncs
            );
          })
          .join('\n\n')
      : '👥 *Efetivo:* Nenhum profissional encontrado para o filtro selecionado.';

  return (
    `📋 *DIÁRIO DE OBRA — ${diario.empresaNome.toUpperCase()}*\n` +
    `🏗️ *Obra:* ${diario.obraNome}\n` +
    `📅 *Data:* ${diario.data} | ${condicaoLinha}\n` +
    (filtroEmpreiteiro ? `🔎 *Filtro Encarregado:* ${filtroEmpreiteiro}\n` : '') +
    `\n${blocosEquipes}\n` +
    `\n📝 *Resumo das Atividades (${totalPresentes} presente(s)):*\n${diario.resumo}\n` +
    (ocorrenciaFinal
      ? `\n⚠️ *Ocorrência / Impedimento:*\n${ocorrenciaFinal}\n`
      : '') +
    `\n📸 *Fotos:* ${diario.fotos.length} registro(s).`
  );
}

/**
 * Gera relatório consolidado para WhatsApp filtrando múltiplos diários por
 * Empreiteiro / Encarregado e/ou Obra.
 */
export function gerarTextoWhatsAppConsolidadoEmpreiteiro(
  diarios: ReadonlyArray<DiarioObraRegistro>,
  filtroEmpreiteiro?: string | null,
  filtroObra?: string | null
): string {
  const obraNorm = normalizarTextoBusca(filtroObra);
  const empNorm = normalizarTextoBusca(filtroEmpreiteiro);

  const filtrados = diarios.filter((d) => {
    if (obraNorm && normalizarTextoBusca(d.obraNome) !== obraNorm) return false;
    if (empNorm) {
      const grupos = agruparEfetivoPorEmpreiteiro(d, filtroEmpreiteiro);
      return grupos.length > 0;
    }
    return true;
  });

  if (filtrados.length === 0) {
    return '📋 Nenhum registro de diário encontrado para o filtro selecionado.';
  }

  const empresa = filtrados[0].empresaNome.toUpperCase();
  const cabecalho =
    `📊 *RELATÓRIO DE DIÁRIOS POR ENCARREGADO — ${empresa}*\n` +
    (filtroEmpreiteiro ? `👷 *Empreiteiro / Encarregado:* ${filtroEmpreiteiro}\n` : '') +
    (filtroObra ? `🏗️ *Obra:* ${filtroObra}\n` : '') +
    `🗂️ *Registros:* ${filtrados.length}\n`;

  const blocos = filtrados.map((d) => {
    const grupos = agruparEfetivoPorEmpreiteiro(d, filtroEmpreiteiro);
    const linhasGrupos = grupos
      .map((g) => {
        const etapasTxt =
          g.etapas.length > 0 ? g.etapas.join(', ') : 'Serviço geral';
        const nomes = g.funcionarios
          .map(
            (f) =>
              `   • ${formatarNomeFuncionarioComMetadados(f)} (${
                f.periodo === 'INTEGRAL' ? 'Dia Inteiro' : 'Meio Dia'
              })`
          )
          .join('\n');
        return `👷 *${g.empreiteiroNome}* — 🔧 ${etapasTxt}\n${nomes || '   • Sem efetivo'}`;
      })
      .join('\n');
    const ocorrenciaFinal = montarTextoOcorrencia(d.ocorrenciaTipo, d.ocorrencias);
    return (
      `📅 *${d.data}* — 🏗️ *${d.obraNome}*\n` +
      `${linhasGrupos}\n` +
      (ocorrenciaFinal ? `⚠️ *Ocorrência:* ${ocorrenciaFinal}\n` : '')
    );
  });

  return `${cabecalho}\n${blocos.join('\n')}`.trim();
}

function escaparCsv(valor: string): string {
  const limpo = valor.replace(/\r?\n/g, ' ').trim();
  if (limpo.includes(';') || limpo.includes('"') || limpo.includes(',')) {
    return `"${limpo.replace(/"/g, '""')}"`;
  }
  return limpo;
}

/**
 * Gera CSV (delimitador ';' + UTF-8 BOM compatível com Excel PT-BR) agrupável
 * por Empreiteiro / Encarregado com Etapa, Funcionário, Apelidos e Documento.
 */
export function gerarCsvRelatorioEmpreiteiro(
  diarios: ReadonlyArray<DiarioObraRegistro>,
  filtroEmpreiteiro?: string | null,
  filtroObra?: string | null
): string {
  const obraNorm = normalizarTextoBusca(filtroObra);
  const linhas: string[] = [
    [
      'Data',
      'Obra',
      'Ambiente',
      'Acesso / Clima',
      'Empreiteiro / Encarregado',
      'Etapa / Servico',
      'Funcionario',
      'Apelidos',
      'Documento',
      'Periodo',
      'Ocorrencia / Impedimento',
      'Resumo',
    ].join(';'),
  ];

  for (const d of diarios) {
    if (obraNorm && normalizarTextoBusca(d.obraNome) !== obraNorm) continue;
    const grupos = agruparEfetivoPorEmpreiteiro(d, filtroEmpreiteiro);
    const acessoOuClima =
      d.ambiente === 'INTERNO'
        ? sanitizarStatusCondominio(d.statusCondominio)
        : d.clima || 'Ensolarado';
    const ocorrencia = montarTextoOcorrencia(d.ocorrenciaTipo, d.ocorrencias);

    for (const g of grupos) {
      if (g.funcionarios.length === 0) {
        linhas.push(
          [
            d.data,
            d.obraNome,
            d.ambiente,
            acessoOuClima,
            g.empreiteiroNome,
            g.etapas.join(', '),
            '',
            '',
            '',
            '',
            ocorrencia,
            d.resumo,
          ]
            .map(escaparCsv)
            .join(';')
        );
        continue;
      }

      for (const f of g.funcionarios) {
        linhas.push(
          [
            d.data,
            d.obraNome,
            d.ambiente,
            acessoOuClima,
            g.empreiteiroNome,
            f.etapaNome || g.etapas.join(', '),
            f.nome,
            (f.apelidos || []).join(', '),
            f.documento || '',
            f.periodo === 'INTEGRAL' ? 'Dia Inteiro' : 'Meio Dia',
            ocorrencia,
            d.resumo,
          ]
            .map(escaparCsv)
            .join(';')
        );
      }
    }
  }

  return `\uFEFF${linhas.join('\n')}`;
}
