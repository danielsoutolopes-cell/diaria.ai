/**
 * Unifica apelidos e variações de nomes de obras para um único nome canônico
 * nos relatórios, borderôs e painéis, preservando explicitamente a distinção
 * de tipologia quando a obra for PISCINA (ex.: PISCINA PORTO SEGURO).
 */
export function normalizarNomeObraCanonica(
  nomeBruto: string | null | undefined,
  tipoObra?: string | null
): string {
  const limpo = (nomeBruto || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!limpo) return 'PORTO SEGURO';

  // Preservar explicitamente PISCINA PORTO SEGURO (não achatar em PORTO SEGURO)
  if (
    (limpo.includes('PISCINA') && (limpo.includes('PORTO SEGURO') || limpo.includes('BAHIA'))) ||
    (limpo === 'PISCINA' && tipoObra === 'PISCINA')
  ) {
    return 'PISCINA PORTO SEGURO';
  }

  // Qualquer outra obra explicitamente nomeada como Piscina mantém sua grafia própria
  if (limpo.includes('PISCINA')) {
    return limpo;
  }

  // Obra Quase Tudo
  if (limpo.includes('QUASE TUDO')) {
    return 'QUASE TUDO';
  }

  // Variações genéricas conhecidas que devem ser unificadas em PORTO SEGURO
  if (
    limpo === 'GERAL' ||
    limpo === 'OBRA GERAL' ||
    limpo === 'CANTEIRO GERAL' ||
    limpo === 'GERAL / VOLANTE' ||
    limpo === 'CANTEIRO VOLANTE' ||
    limpo === 'OBRA BAHIA' ||
    limpo === 'OBRA BAHIA (PORTO SEGURO)' ||
    limpo === 'BAHIA' ||
    limpo === 'PORTO SEGURO'
  ) {
    return 'PORTO SEGURO';
  }

  return limpo;
}

/**
 * Mapa oficial de aliases de trabalhadores (V11) para unificação canônica
 * em apontamentos, borderô, relatórios e Caixinha de Campo.
 */
export const ALIAS_TRABALHADORES_PADRAO: Record<string, string> = {
  // Gil (unificação Gil + Gilvan + Gilvan (Gil) + Gil335Revest)
  GIL: 'Gil',
  GIL335REVEST: 'Gil',
  'GIL 335 REVEST': 'Gil',
  'GIL 335': 'Gil',
  GILVAN: 'Gil',
  'GILVAN - GIL': 'Gil',
  'GIL - GILVAN': 'Gil',
  'GIL (GILVAN)': 'Gil',
  'GILVAN (GIL)': 'Gil',
  'GILVAN GIL': 'Gil',
  // Wender (unificação Wender + Wender 22 + Weslen)
  WENDER: 'Wender',
  'WENDER 22': 'Wender',
  WESLEN: 'Wender',
  'WENDER / WESLEN': 'Wender',
  'WESLEN / WENDER': 'Wender',
  // Peu (Edmilson)
  PEU: 'Peu',
  EDMILSON: 'Peu',
  'EDMILSON - PEU': 'Peu',
  'EDMILSON (PEU)': 'Peu',
  'PEU (EDMILSON)': 'Peu',
  'PEU - EDMILSON': 'Peu',
  // Zé Baiano
  'JOSE BAIANO': 'Zé Baiano',
  'ZE BAIANO': 'Zé Baiano',
  // Lucas J (unificação Lucas J, Lucas.j., Lucas. J., Lucas J., Lucas-J, etc.)
  'LUCAS. J.': 'Lucas J',
  'LUCAS J.': 'Lucas J',
  'LUCAS J': 'Lucas J',
  'LUCAS.J.': 'Lucas J',
  'LUCAS.J': 'Lucas J',
  'LUCAS . J': 'Lucas J',
  'LUCAS . J.': 'Lucas J',
  'LUCAS-J': 'Lucas J',
  'LUCAS - J': 'Lucas J',
  'LUCAS - J.': 'Lucas J',
  // Daniel
  DANIEL: 'Daniel',
  'DANIEL.': 'Daniel',
  // Demais nomes canônicos da equipe
  MATEUS: 'Mateus',
  IAN: 'Ian',
  MANOEL: 'Manoel',
  'ZE ROBERTO': 'Zé Roberto',
  'JOSE ROBERTO': 'Zé Roberto',
  DIEGO: 'Diego',
};

function limparChaveNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Unifica variações e apelidos de colaboradores nos relatórios, borderô,
 * webhook e Caixinha para evitar linhas/perfis duplicados da mesma pessoa.
 */
export function normalizarNomeTrabalhadorCanonico(
  nomeBruto: string | null | undefined,
  aliasesExtras?: Record<string, string>
): string {
  const original = (nomeBruto || '').trim();
  if (!original) return 'Trabalhador';

  const chave = limparChaveNome(original);
  const chaveSemPontoFinal = chave.replace(/\.+$/, '').trim();

  if (aliasesExtras) {
    const extraDireto = aliasesExtras[chave] || aliasesExtras[chaveSemPontoFinal];
    if (extraDireto) {
      const chaveExtra = limparChaveNome(extraDireto);
      const chaveExtraSemPonto = chaveExtra.replace(/\.+$/, '').trim();
      return (
        ALIAS_TRABALHADORES_PADRAO[chaveExtra] ||
        ALIAS_TRABALHADORES_PADRAO[chaveExtraSemPonto] ||
        extraDireto
      );
    }
  }

  const direto =
    ALIAS_TRABALHADORES_PADRAO[chave] ||
    ALIAS_TRABALHADORES_PADRAO[chaveSemPontoFinal];
  if (direto) return direto;

  if (
    chave.includes('GIL335') ||
    chave === 'GILVAN GIL' ||
    chave.startsWith('GILVAN ') ||
    chave.startsWith('GILVAN(') ||
    chave.startsWith('GIL (') ||
    chave.startsWith('GIL(') ||
    chave.startsWith('GIL -')
  ) {
    return 'Gil';
  }
  if (/^LUCAS[\s.\-]+J\.?$/.test(chave)) {
    return 'Lucas J';
  }
  if (chave.includes('WESLEN') || chave.includes('WENDER')) {
    return 'Wender';
  }
  if (chave === 'EDMILSON PEU' || chave.startsWith('EDMILSON -') || chave.startsWith('PEU -')) {
    return 'Peu';
  }

  return original.replace(/\.+$/, '').trim();
}

/**
 * Retorna todas as grafias/aliases conhecidos equivalentes a um trabalhador
 * (útil para consultas no banco que ainda contenham registros históricos).
 */
export function obterAliasesEquivalentes(nomeBruto: string): string[] {
  const canonico = normalizarNomeTrabalhadorCanonico(nomeBruto);
  const canonicoNorm = limparChaveNome(canonico);
  const conjunto = new Set<string>([canonico, nomeBruto.trim()]);

  for (const [alias, destino] of Object.entries(ALIAS_TRABALHADORES_PADRAO)) {
    if (limparChaveNome(destino) === canonicoNorm) {
      conjunto.add(alias);
    }
  }

  return Array.from(conjunto).filter(Boolean);
}
