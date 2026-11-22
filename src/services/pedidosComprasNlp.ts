import { GoogleGenerativeAI } from '@google/generative-ai';

export type CategoriaCompra =
  | 'Alvenaria & Estrutura'
  | 'Hidráulica'
  | 'Elétrica'
  | 'Acabamento & Revestimento'
  | 'Pintura'
  | 'Ferramentas & EPI'
  | 'Fixação & Ferragens'
  | 'Consumíveis & Diversos';

export type UrgenciaCompra = 'ALTA' | 'NORMAL' | 'PROGRAMADA';

export type StatusPedidoCompra =
  | 'NOVO'
  | 'ENVIADO_PATRICIA'
  | 'EM_COTACAO'
  | 'COMPRADO'
  | 'ENTREGUE'
  | 'CANCELADO';

export interface ItemPedidoCompra {
  categoria: CategoriaCompra;
  nome: string;
  quantidade: string;
  unidade: string;
  urgencia: UrgenciaCompra;
  observacao?: string;
}

export interface PedidoCompraRecord {
  id: string;
  tenantId: string;
  empresaNome: string;
  obraNome: string;
  grupoJid?: string | null;
  solicitadoPor: string;
  textoOriginal: string;
  itens: ItemPedidoCompra[];
  mensagemFormatada: string;
  status: StatusPedidoCompra;
  enviadoWhatsAppPatricia: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

const CATEGORIAS_VALIDAS: CategoriaCompra[] = [
  'Alvenaria & Estrutura',
  'Hidráulica',
  'Elétrica',
  'Acabamento & Revestimento',
  'Pintura',
  'Ferramentas & EPI',
  'Fixação & Ferragens',
  'Consumíveis & Diversos',
];

/**
 * Detecta se uma mensagem de grupo de obra (Intermack) representa uma solicitação de compra de materiais.
 * Evita falsos positivos com listas de presença/ponto ou pedidos de vale.
 */
export function isMensagemPedidoCompra(texto: string): boolean {
  const limpo = (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (limpo.length < 8) return false;

  // Bloqueia sinais claros de vale ou ponto diário
  if (
    /\b(vale|adiantamento|pix|faltou|meio dia|diaria|diarias|presenca|trabalhou|ponto)\b/.test(
      limpo
    ) &&
    !/\b(pedido|comprar|compra|material|materiais|fornecedor|orcamento)\b/.test(
      limpo
    )
  ) {
    return false;
  }

  const gatilhosExplicitos =
    /\b(pedido de compra|lista de material|lista de materiais|precisa comprar|precisando de|comprar|faltando material|pedir material|material pra obra|material para obra|cotacao|cotar|manda comprar)\b/;
  if (gatilhosExplicitos.test(limpo)) {
    return true;
  }

  // Detecta combinação de unidades/materiais típicos de construção civil (>= 2 sinais)
  const sinaisMaterial = [
    /\b\d+\s*(saco|sacos|sc|kg|m|m2|m3|un|unid|cx|caixa|caixas|lata|latas|galao|galoes|rolo|rolos|barra|barras|tubo|tubos|balde|baldes|pc|peca|pecas|par|pares|metro|metros|pacote|pacotes)\b/,
    /\b(cimento|argamassa|areia|brita|cal|tijolo|bloco|rejunte|piso|porcelanato|azulejo|massa corrida|tinta|selador|verniz|lixa|rolo|pincel|fio|cabo|disjuntor|tomada|interruptor|eletroduto|conduite|cano|tubo|pvc|joelho|luva|registro|cola|veda rosca|silicone|parafuso|bucha|prego|disco de corte|broca|luva|capacete|oculos|bota)\b/,
  ];

  let hits = 0;
  for (const regex of sinaisMaterial) {
    if (regex.test(limpo)) hits += 1;
  }
  return hits >= 2;
}

function classificarCategoriaHeuristica(nomeItem: string): CategoriaCompra {
  const n = nomeItem
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/\b(cimento|areia|brita|cal|bloco|tijolo|vergalhao|ferro|arame|impermeabilizante|vedacit|bianco|concreto|madeira|tabua|sarrafo|prego)\b/.test(n)) {
    return 'Alvenaria & Estrutura';
  }
  if (/\b(cano|tubo|pvc|joelho|te |luva pvc|registro|ralo|sifao|caixa d|cola pvc|veda rosca|torneira|hidraul|esgoto|agua|flexivel)\b/.test(n)) {
    return 'Hidráulica';
  }
  if (/\b(fio|cabo|disjuntor|tomada|interruptor|eletroduto|conduite|quadro|fita isolante|lampada|led|spot|reator|eletric|caixinha 4x2|4x4)\b/.test(n)) {
    return 'Elétrica';
  }
  if (/\b(argamassa|ac1|ac2|ac3|rejunte|porcelanato|piso|revestimento|azulejo|pastilha|espacador|cunha|nivelador|rodape|soleira|silicone|pu)\b/.test(n)) {
    return 'Acabamento & Revestimento';
  }
  if (/\b(tinta|massa corrida|massa acrilica|selador|fundo preparador|lixa|thinner|aguarras|rolo de la|pincel|trincha|fita crepe|lona|verniz)\b/.test(n)) {
    return 'Pintura';
  }
  if (/\b(disco|broca|serra|martelo|marreta|desempenadeira|colher de pedreiro|trena|nivel|epi|capacete|bota|oculos|mascara|luva de raspa|luva nitrilica)\b/.test(n)) {
    return 'Ferramentas & EPI';
  }
  if (/\b(parafuso|bucha|dobradica|fechadura|trinco|cadeado|corrente|arruela|porca|chumbador)\b/.test(n)) {
    return 'Fixação & Ferragens';
  }
  return 'Consumíveis & Diversos';
}

/**
 * Fallback determinístico para agrupar pedidos quando a API Gemini não estiver disponível.
 */
export function extrairItensCompraHeuristico(
  textoOriginal: string
): ItemPedidoCompra[] {
  const isUrgenteGlobal = /\b(urgente|hoje|agora|parada|parado|imediato)\b/i.test(
    textoOriginal
  );

  const linhasBrutas = textoOriginal
    .split(/\r?\n|,|;/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((l) => l.length >= 2)
    .filter(
      (l) =>
        !/^(bom dia|boa tarde|boa noite|ola|olá|por favor|obrigado|valeu|pessoal|patricia|patrícia|pedido|lista de materiais?|preciso de|precisando de|material)$/i.test(
          l
        )
    );

  const itens: ItemPedidoCompra[] = [];

  for (const linha of linhasBrutas) {
    const limpa = linha
      .replace(
        /^(precisando de|precisa de|pedir|comprar|mandar|manda|falta|faltando)\s+/i,
        ''
      )
      .trim();
    if (!limpa) continue;

    const matchQtdUnid = limpa.match(
      /^(\d+(?:[.,]\d+)?)\s*(sacos?|sc|kg|g|m2|m3|m|metros?|unid(?:ades?)?|un|cx|caixas?|latas?|gal(?:ao|oes|ão|ões)|rolos?|barras?|tubos?|baldes?|p[cç]s?|pe[cç]as?|pares?|par|pacotes?|pct|litros?|l)\s+(?:de\s+)?(.+)$/i
    );

    const matchQtdSimples = limpa.match(/^(\d+(?:[.,]\d+)?)\s+(?:de\s+)?(.+)$/i);

    let quantidade = '1';
    let unidade = 'un';
    let nome = limpa;

    if (matchQtdUnid) {
      quantidade = matchQtdUnid[1];
      unidade = matchQtdUnid[2].toLowerCase();
      nome = matchQtdUnid[3].trim();
    } else if (matchQtdSimples) {
      quantidade = matchQtdSimples[1];
      unidade = 'un';
      nome = matchQtdSimples[2].trim();
    }

    const urgencia: UrgenciaCompra =
      isUrgenteGlobal || /\burgente\b/i.test(limpa) ? 'ALTA' : 'NORMAL';

    itens.push({
      categoria: classificarCategoriaHeuristica(nome),
      nome: nome.charAt(0).toUpperCase() + nome.slice(1),
      quantidade,
      unidade,
      urgencia,
    });
  }

  return itens;
}

/**
 * Agrupa itens de compra por categoria via Gemini AI, com fallback heurístico seguro.
 */
export async function agruparItensCompraComGemini(
  textoOriginal: string,
  obraNome: string
): Promise<{ itens: ItemPedidoCompra[]; motor: 'GEMINI' | 'HEURISTICO' }> {
  const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '');
  if (!apiKey) {
    return {
      itens: extrairItensCompraHeuristico(textoOriginal),
      motor: 'HEURISTICO',
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `
Você é um comprador sênior de engenharia civil da Intermack Engenharia e Construção.
Analise o pedido informal de materiais abaixo enviado no grupo da obra "${obraNome}".

Extraia TODOS os itens solicitados, padronize unidade/quantidade e classifique cada item estritamente em uma destas categorias:
${CATEGORIAS_VALIDAS.map((c) => `- "${c}"`).join('\n')}

Retorne ESTRITAMENTE um JSON válido neste formato:
{
  "itens": [
    {
      "categoria": "Alvenaria & Estrutura",
      "nome": "Cimento CP-II 50kg",
      "quantidade": "20",
      "unidade": "sacos",
      "urgencia": "ALTA" | "NORMAL" | "PROGRAMADA",
      "observacao": "opcional"
    }
  ]
}

MENSAGEM DO GRUPO DE OBRA:
"""
${textoOriginal}
"""
`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as {
      itens?: Array<Partial<ItemPedidoCompra>>;
    };

    if (Array.isArray(parsed.itens) && parsed.itens.length > 0) {
      const normalizados: ItemPedidoCompra[] = parsed.itens
        .filter((it) => typeof it.nome === 'string' && it.nome.trim().length > 0)
        .map((it) => {
          const catRaw = String(it.categoria || '');
          const categoria: CategoriaCompra = CATEGORIAS_VALIDAS.includes(
            catRaw as CategoriaCompra
          )
            ? (catRaw as CategoriaCompra)
            : classificarCategoriaHeuristica(String(it.nome));
          const urgRaw = String(it.urgencia || 'NORMAL').toUpperCase();
          const urgencia: UrgenciaCompra =
            urgRaw === 'ALTA' || urgRaw === 'PROGRAMADA' ? urgRaw : 'NORMAL';

          return {
            categoria,
            nome: String(it.nome).trim(),
            quantidade: String(it.quantidade || '1').trim(),
            unidade: String(it.unidade || 'un').trim(),
            urgencia,
            observacao: it.observacao ? String(it.observacao).trim() : undefined,
          };
        });

      if (normalizados.length > 0) {
        return { itens: normalizados, motor: 'GEMINI' };
      }
    }
  } catch (err) {
    console.warn('[COMPRAS-NLP] Fallback heurístico acionado:', err);
  }

  return {
    itens: extrairItensCompraHeuristico(textoOriginal),
    motor: 'HEURISTICO',
  };
}

/**
 * Formata o pedido agrupado por categoria pronto para copiar e colar no WhatsApp de fornecedores ou da Patrícia.
 */
export function formatarMensagemPedidoWhatsApp(params: {
  empresaNome: string;
  obraNome: string;
  solicitadoPor: string;
  dataHoraLabel: string;
  itens: ItemPedidoCompra[];
}): string {
  const porCategoria = new Map<CategoriaCompra, ItemPedidoCompra[]>();

  for (const item of params.itens) {
    const lista = porCategoria.get(item.categoria) || [];
    lista.push(item);
    porCategoria.set(item.categoria, lista);
  }

  const linhas: string[] = [
    `🛒 *PEDIDO DE COMPRAS — ${params.empresaNome.toUpperCase()}*`,
    `🏗️ *Obra:* ${params.obraNome}`,
    `👤 *Solicitado por:* ${params.solicitadoPor}`,
    `📅 *Data/Hora:* ${params.dataHoraLabel}`,
    `--------------------------------------`,
  ];

  for (const [categoria, lista] of Array.from(porCategoria.entries())) {
    linhas.push('');
    linhas.push(`📦 *${categoria.toUpperCase()}*`);
    for (const it of lista) {
      const tagUrg = it.urgencia === 'ALTA' ? ' 🚨 [URGENTE]' : '';
      const obs = it.observacao ? ` _(${it.observacao})_` : '';
      linhas.push(`• ${it.quantidade} ${it.unidade} — ${it.nome}${tagUrg}${obs}`);
    }
  }

  linhas.push('');
  linhas.push(`--------------------------------------`);
  linhas.push(
    `✅ *Total de itens:* ${params.itens.length} (${porCategoria.size} categoria(s))`
  );
  linhas.push(`_Mensagem pronta para copiar e encaminhar ao fornecedor._`);

  return linhas.join('\n');
}
