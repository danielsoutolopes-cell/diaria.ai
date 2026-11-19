/**
 * Unifica apelidos e variações de nomes de obras para um único nome canônico
 * nos relatórios, borderôs e painéis (regra: 1 obra = 1 nome oficial).
 */
export function normalizarNomeObraCanonica(nomeBruto: string | null | undefined): string {
  const limpo = (nomeBruto || '').trim().toUpperCase();
  if (!limpo) return 'PORTO SEGURO';

  // Variações conhecidas que devem ser unificadas em PORTO SEGURO
  if (
    limpo === 'GERAL' ||
    limpo === 'OBRA GERAL' ||
    limpo === 'CANTEIRO GERAL' ||
    limpo === 'GERAL / VOLANTE' ||
    limpo === 'CANTEIRO VOLANTE' ||
    limpo.includes('PORTO SEGURO') ||
    limpo === 'OBRA BAHIA' ||
    limpo === 'BAHIA'
  ) {
    return 'PORTO SEGURO';
  }

  return limpo;
}
