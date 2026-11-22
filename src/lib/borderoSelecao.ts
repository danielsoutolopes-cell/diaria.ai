export interface LancamentoBorderoSelecionavel {
  id: string;
  tipo: 'PONTO' | 'VALE';
  obra?: string;
  valor: number;
  selecionado: boolean;
}

export interface FuncionarioBorderoSelecionavel<
  TLancamento extends LancamentoBorderoSelecionavel = LancamentoBorderoSelecionavel,
> {
  id: string;
  nome: string;
  obra: string;
  lancamentos: TLancamento[];
}

export interface ObraDisponivelBordero {
  nome: string;
  qtdDiarias: number;
  valorTotalDiarias: number;
  qtdFuncionarios: number;
}

export interface AvisoValeAbertoPorObra {
  funcionarioId: string;
  nome: string;
  qtdValesAbertos: number;
  valorTotalValesAbertos: number;
}

function normalizarChaveObra(obra: string | null | undefined): string {
  return (obra || '').trim().toUpperCase();
}

/**
 * Resolve o nome de obra efetivo de um lançamento no borderô,
 * priorizando a obra do lançamento e usando a obra principal do colaborador como fallback.
 */
export function resolverObraLancamento(
  lancamentoObra: string | undefined,
  funcionarioObra: string
): string {
  const limpa = (lancamentoObra || '').trim();
  if (limpa.length > 0) return limpa;
  return (funcionarioObra || 'Geral').trim() || 'Geral';
}

/**
 * Extrai a lista ordenada de obras presentes nos registros de diárias (PONTO) em aberto,
 * com quantidade de lançamentos, soma bruta das diárias e número de colaboradores distintos.
 */
export function extrairObrasComDiariasEmAberto<
  TLancamento extends LancamentoBorderoSelecionavel,
  TFunc extends FuncionarioBorderoSelecionavel<TLancamento>,
>(funcionarios: readonly TFunc[]): ObraDisponivelBordero[] {
  const mapa = new Map<
    string,
    {
      nome: string;
      qtdDiarias: number;
      valorTotalDiarias: number;
      funcionariosIds: Set<string>;
    }
  >();

  for (const func of funcionarios) {
    for (const lanc of func.lancamentos) {
      if (lanc.tipo !== 'PONTO') continue;
      const nomeObra = resolverObraLancamento(lanc.obra, func.obra);
      const chave = normalizarChaveObra(nomeObra);
      const atual = mapa.get(chave) || {
        nome: nomeObra,
        qtdDiarias: 0,
        valorTotalDiarias: 0,
        funcionariosIds: new Set<string>(),
      };
      atual.qtdDiarias += 1;
      atual.valorTotalDiarias = Number(
        (atual.valorTotalDiarias + Number(lanc.valor || 0)).toFixed(2)
      );
      atual.funcionariosIds.add(func.id);
      mapa.set(chave, atual);
    }
  }

  return Array.from(mapa.values())
    .map((item) => ({
      nome: item.nome,
      qtdDiarias: item.qtdDiarias,
      valorTotalDiarias: item.valorTotalDiarias,
      qtdFuncionarios: item.funcionariosIds.size,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Desmarca todos os registros de todos os funcionários de uma só vez (total selecionado = R$ 0,00).
 */
export function desmarcarTodosGlobal<
  TLancamento extends LancamentoBorderoSelecionavel,
  TFunc extends FuncionarioBorderoSelecionavel<TLancamento>,
>(funcionarios: readonly TFunc[]): TFunc[] {
  return funcionarios.map((func) => ({
    ...func,
    lancamentos: func.lancamentos.map((lanc) => ({
      ...lanc,
      selecionado: false,
    })),
  }));
}

/**
 * Marca todos os registros de todos os funcionários de uma só vez.
 */
export function marcarTodosGlobal<
  TLancamento extends LancamentoBorderoSelecionavel,
  TFunc extends FuncionarioBorderoSelecionavel<TLancamento>,
>(funcionarios: readonly TFunc[]): TFunc[] {
  return funcionarios.map((func) => ({
    ...func,
    lancamentos: func.lancamentos.map((lanc) => ({
      ...lanc,
      selecionado: true,
    })),
  }));
}

/**
 * Marca ou desmarca todos os registros exclusivamente de um único funcionário,
 * sem alterar a seleção de nenhum outro colaborador.
 */
export function alterarSelecaoFuncionario<
  TLancamento extends LancamentoBorderoSelecionavel,
  TFunc extends FuncionarioBorderoSelecionavel<TLancamento>,
>(
  funcionarios: readonly TFunc[],
  funcionarioId: string,
  selecionado: boolean
): TFunc[] {
  return funcionarios.map((func) => {
    if (func.id !== funcionarioId) return func;
    return {
      ...func,
      lancamentos: func.lancamentos.map((lanc) => ({
        ...lanc,
        selecionado,
      })),
    };
  });
}

/**
 * Modo "Pagar por Obra":
 * Desmarca todos os demais registros e deixa marcadas SOMENTE as diárias (PONTO)
 * pertencentes à obra escolhida. Vales permanecem desmarcados para conferência humana.
 */
export function selecionarPagarPorObra<
  TLancamento extends LancamentoBorderoSelecionavel,
  TFunc extends FuncionarioBorderoSelecionavel<TLancamento>,
>(funcionarios: readonly TFunc[], obraAlvo: string): TFunc[] {
  const chaveAlvo = normalizarChaveObra(obraAlvo);
  if (!chaveAlvo) return funcionarios.map((f) => ({ ...f }));

  return funcionarios.map((func) => ({
    ...func,
    lancamentos: func.lancamentos.map((lanc) => {
      const obraEfetiva = normalizarChaveObra(
        resolverObraLancamento(lanc.obra, func.obra)
      );
      const pertenceObra = lanc.tipo === 'PONTO' && obraEfetiva === chaveAlvo;
      return {
        ...lanc,
        selecionado: pertenceObra,
      };
    }),
  }));
}

/**
 * Lista colaboradores que têm diárias selecionadas na obra filtrada E possuem
 * vales em aberto (desmarcados) para que a administradora avalie na conferência.
 */
export function listarAvisosValesAbertosParaObra<
  TLancamento extends LancamentoBorderoSelecionavel,
  TFunc extends FuncionarioBorderoSelecionavel<TLancamento>,
>(
  funcionarios: readonly TFunc[],
  obraAlvo: string
): AvisoValeAbertoPorObra[] {
  const chaveAlvo = normalizarChaveObra(obraAlvo);
  if (!chaveAlvo) return [];

  const avisos: AvisoValeAbertoPorObra[] = [];

  for (const func of funcionarios) {
    const temDiariaNaObra = func.lancamentos.some((lanc) => {
      if (lanc.tipo !== 'PONTO' || !lanc.selecionado) return false;
      const obraEfetiva = normalizarChaveObra(
        resolverObraLancamento(lanc.obra, func.obra)
      );
      return obraEfetiva === chaveAlvo;
    });

    if (!temDiariaNaObra) continue;

    const valesAbertos = func.lancamentos.filter(
      (lanc) => lanc.tipo === 'VALE' && !lanc.selecionado
    );

    if (valesAbertos.length > 0) {
      avisos.push({
        funcionarioId: func.id,
        nome: func.nome,
        qtdValesAbertos: valesAbertos.length,
        valorTotalValesAbertos: Number(
          valesAbertos
            .reduce((acc, v) => acc + Number(v.valor || 0), 0)
            .toFixed(2)
        ),
      });
    }
  }

  return avisos;
}
