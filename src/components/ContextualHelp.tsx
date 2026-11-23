'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { HelpCircle, X, Sparkles, CheckCircle2, BookOpen } from 'lucide-react';

interface AjudaRota {
  titulo: string;
  resumo: string;
  funcoes: Array<{ nome: string; descricao: string }>;
  exemplo: string;
}

const AJUDA_POR_ROTA: Record<string, AjudaRota> = {
  '/': {
    titulo: 'Visão Geral & Assistente IA',
    resumo:
      'Centro de comando da empresa ativa, com indicadores consolidados e o Assistente Executivo de Campo.',
    funcoes: [
      {
        nome: 'Assistente IA com "De Acordo"',
        descricao:
          'Interpreta mensagens em linguagem natural, verifica se faltou obra, data ou valor e só envia para Validação após sua confirmação.',
      },
      {
        nome: 'Indicadores de Caixa & Pendências',
        descricao:
          'Mostra o saldo líquido validado, vales deduzidos e quantas mensagens aguardam aprovação.',
      },
    ],
    exemplo:
      'Digite no chat: "Vale de R$ 100 para o João, Obra Residencial, hoje". Confira o rascunho exibido e clique em "De Acordo — Enviar para Validação".',
  },
  '/validacoes': {
    titulo: 'Validações de Campo / Efetivo',
    resumo:
      'Fila Human-in-the-Loop organizada em 1 card por mensagem enviada (com horário exato e texto original).',
    funcoes: [
      {
        nome: 'Aprovação por Mensagem',
        descricao:
          'Cada mensagem recebida (ex.: 06:37, 08:40) é revisada e aprovada de forma independente.',
      },
      {
        nome: 'Exclusão Auditada (Soft Delete)',
        descricao:
          'Use a lixeira para remover um registro errado ou descartar uma mensagem inteira sem perder a trilha de auditoria.',
      },
      {
        nome: 'Corte até Ontem',
        descricao:
          'Consolida pendências anteriores como validadas e impede que reconexões do WhatsApp reintroduzam mensagens antigas.',
      },
      {
        nome: 'Memória de Campo (IA) por Remetente',
        descricao:
          'Aprende automaticamente apelidos, listas exclusivas de vales (que nunca geram diárias), valor explícito por linha ("<nome> <valor> reais") e obra padrão de cada remetente. Clique em "Ver / Ajustar" para revisar ou editar regras aprendidas.',
      },
    ],
    exemplo:
      'Expanda "Ver Mensagem Original", ajuste frações (Integral / Meio Dia) se necessário e clique em "Aprovar Mensagem". Se corrigir um apelido ou obra, a IA memoriza automaticamente para os próximos envios.',
  },
  '/validacao/diarias': {
    titulo: 'Validação de Diárias & Efetivo',
    resumo:
      'Fila Human-in-the-Loop organizada em 1 card por mensagem enviada, com suporte a múltiplas obras no mesmo dia e rateio 0,5 + 0,5.',
    funcoes: [
      {
        nome: 'Aprovação por Mensagem',
        descricao:
          'Revise cada apontamento com o texto original do WhatsApp e horário exato antes de enviar para o fechamento.',
      },
      {
        nome: 'Separação de Ciclos & Obras',
        descricao:
          'Apontamentos em obras diferentes no mesmo dia ou após quitação anterior entram de forma independente sem colidir.',
      },
    ],
    exemplo:
      'Expanda "Ver Mensagem Original", confira a obra e as frações (Integral ou Meio Dia) e clique em "Aprovar Mensagem".',
  },
  '/validacao/vales': {
    titulo: 'Vales em 2 Etapas (Solicitação → PIX)',
    resumo:
      'Fluxo separado para controlar pedidos de vale em campo (Etapa 1) e a confirmação com comprovante PIX salvo em nuvem (Etapa 2).',
    funcoes: [
      {
        nome: 'Separação Estrita (0 Diárias) & Valor por Linha',
        descricao:
          'Mensagens exclusivas de pedido de vale (ex.: "6 vale por favor" seguido da lista de nomes) geram somente vales — nunca diárias. Linhas com valor explícito (ex.: "Colaborador B 50 reais") usam o valor informado; as demais recebem o padrão R$ 100,00.',
      },
      {
        nome: 'Leitura OCR com IA (Gemini Vision)',
        descricao:
          'Suba o print do pedido ou o comprovante PIX para preencher automaticamente e parear com o pedido pendente.',
      },
      {
        nome: 'KPI de Pendências de Envio',
        descricao:
          'Acompanhe em tempo real quantos pedidos ainda aguardam envio do PIX e quantos já foram conciliados.',
      },
    ],
    exemplo:
      'Quando o encarregado envia "Bom dia, 6 vale por favor" seguido de 5 nomes sem valor e "Colaborador B 50 reais", o sistema cria exatamente 6 vales (5 × R$ 100,00 + 1 × R$ 50,00 = R$ 550,00) e 0 diárias.',
  },
  '/caixinha': {
    titulo: 'Caixinha de Campo & Reembolsos',
    resumo:
      'Tela única que reúne a conta corrente de verbas operacionais em mãos dos encarregados (com proteção anti-duplicidade) e a seção integrada de Reembolsos & Adiantamentos.',
    funcoes: [
      {
        nome: 'Unificação de Perfis & Anti-Duplicidade',
        descricao:
          'Lançamentos enviados por diferentes apelidos do mesmo encarregado são agrupados em um único card consolidado, sem dupla contagem entre saldos pré-implantação e notas detalhadas.',
      },
      {
        nome: 'Coluna Própria (Sem Desconto Automático)',
        descricao:
          'O troco em mãos nunca é abatido automaticamente da folha de diárias. A administração decide manualmente quando registrar devolução ou transferir para o fechamento.',
      },
      {
        nome: 'Reembolsos & Adiantamentos Integrados + Leitura IA',
        descricao:
          'Alterne entre "Visão Completa", "Caixinha" e "Reembolsos" na mesma tela. Separe claramente o Portador do Caixinha (quem recebeu) do Emissor do PIX (quem transferiu) e registre Data + Hora exata (HH:MM).',
      },
      {
        nome: 'Ler Nota / PIX com IA & Fallback para Prints Cortados',
        descricao:
          'Suba a foto de um comprovante PIX ou cupom fiscal: a IA extrai valor, data, hora e pagador. Se o print vier cortado sem pagador ou horário completo, o sistema aplica fallback inteligente (remetente/horário do WhatsApp ou relógio da tela) exibindo a origem para revisão rápida antes de salvar.',
      },
    ],
    exemplo:
      'Se a gestão enviou R$ 700,00 em suprimentos PIX (ex.: PIX de Gestor A em 23/11/2026 às 14:32) e o encarregado comprovou R$ 544,62 em notas de material, o extrato mostra quem enviou cada PIX, o horário exato e o saldo Troco em Mãos: R$ 155,38.',
  },
  '/reembolsos': {
    titulo: 'Caixa de Campo & Reembolsos',
    resumo:
      'Conta corrente de verbas de obra (materiais, locações e reembolsos), 100% separada de diárias e vales pessoais.',
    funcoes: [
      {
        nome: 'Portador do Caixinha vs. Emissor do PIX',
        descricao:
          'Identifique separadamente quem recebeu o recurso (portador) e quem efetuou a transferência (emissor), sempre com data e hora exata (dd/mm/aaaa às HH:mm).',
      },
      {
        nome: 'Ler Nota / PIX com IA (com Fallback Inteligente)',
        descricao:
          'Suba a foto de um cupom fiscal ou comprovante de PIX para preencher automaticamente tipo, valor, emissor, data e hora — inclusive em prints cortados.',
      },
      {
        nome: 'Liquidação & Levar p/ Fechamento',
        descricao:
          'Zere o saldo registrando devolução de troco, pagamento de reembolso avulso ou transferindo opcionalmente para o Fechamento & Pagamentos.',
      },
    ],
    exemplo:
      'Selecione Portador, Emissor do PIX, Obra, Data e Hora (HH:MM). Se enviou R$ 400 de PIX e ele prestou R$ 289,18 em notas, o sistema calcula Troco em Mãos: R$ 110,82.',
  },
  '/bordero': {
    titulo: 'Fechamento & Pagamentos (PIX)',
    resumo:
      'Consolidação final por colaborador com seleção global, controle individual por colaborador, filtro Pagar por Obra, decisão 100% humana sobre vales e emissão de Recibo PIX em PDF.',
    funcoes: [
      {
        nome: 'Desmarcar Todos / Marcar Todos (Global & Por Colaborador)',
        descricao:
          'Use "Desmarcar Todos" no topo para zerar toda a folha (R$ 0,00) e começar limpo, ou use "Marcar Todos" / "Desmarcar" dentro do card de cada colaborador sem afetar os demais.',
      },
      {
        nome: 'Pagar por Obra (com Aviso de Vales em Aberto)',
        descricao:
          'Escolha uma obra no seletor "Pagar por Obra" para deixar marcadas somente as diárias daquela obra. Se algum colaborador tiver vales em aberto, um aviso discreto alerta para conferência humana.',
      },
      {
        nome: 'Desconto Opcional de Vales & Recibo PIX (PDF + Nuvem)',
        descricao:
          'Desmarcar um vale não o apaga (permanece como saldo a dever). Gere PIX Copia e Cola, QR Code e Recibo Individual em PDF com envio opcional no WhatsApp.',
      },
    ],
    exemplo:
      'Para pagar somente a equipe da Obra Residencial hoje, selecione-a em "Pagar por Obra": apenas as diárias dela ficam marcadas e o sistema avisa caso algum colaborador tenha vale em aberto para conferir antes do PIX.',
  },
  '/relatorios': {
    titulo: 'Relatórios, Excel 5 Abas & Envio Quinzenal',
    resumo:
      'Central analítica com Planilha Excel em 5 Abas (fórmulas nativas =SUM), Agendamento Quinzenal em PDF Paisagem, Borderô Consolidado, Custo por Obra e Calendários.',
    funcoes: [
      {
        nome: 'Planilha Excel em 5 Abas com Fórmulas (=SUM)',
        descricao:
          'Clique em "Excel V6 (5 Abas)" para baixar Resumo por Trabalhador, Detalhamento de Diárias, Controle de Vales, Caixinha de Campo e Custo por Obra já com totais automáticos.',
      },
      {
        nome: 'Agendamento Quinzenal Automático (PDF Paisagem)',
        descricao:
          'Dispara automaticamente na 2ª e última sexta-feira do mês às 18:00 (horário de Brasília) apenas os saldos em aberto para a diretoria, ou sob demanda no botão "Disparar PDF Quinzenal Agora".',
      },
      {
        nome: 'Sigilo Automático',
        descricao:
          'Administradores recebem os demonstrativos com valores em R$; encarregados e equipe recebem versão operacional sem valores.',
      },
    ],
    exemplo:
      'Selecione o período desejado (Semanal, Quinzenal ou Mensal) e clique em "Excel V6 (5 Abas)" para auditoria contábil ou em "Disparar PDF Quinzenal Agora" para gerar o fechamento em PDF Paisagem.',
  },
  '/diario-obra': {
    titulo: 'Diário de Obra & Relatório Fotográfico',
    resumo:
      'Registro mobile enxuto de evolução diária com Obra em dropdown, separação entre Condomínio/Acesso e Ocorrências, e gestão de subempreita (Empreiteiro × Funcionário + Etapa) para empresas em Modo Empreita.',
    funcoes: [
      {
        nome: 'Obra em Dropdown & Acesso Separado de Ocorrências',
        descricao:
          'Selecione a obra ativa no menu suspenso. Em obras internas, Condomínio/Acesso traz apenas condições de portaria e horário; ocorrências/impedimentos (ex.: Falta de Material do Cliente) ficam em bloco separado e só aparecem no relatório quando aplicável.',
      },
      {
        nome: 'Empreiteiro × Funcionário, Apelidos, Documento & Etapa (Modo Empreita)',
        descricao:
          'Cadastre separadamente Empreiteiros/Encarregados e seus Funcionários (com apelidos para busca e CPF/RG), selecione a Etapa/Serviço compatível com a obra (ex.: Hidráulica, Gesso) e gere relatórios em WhatsApp, PDF ou CSV filtrados por encarregado.',
      },
      {
        nome: 'Fluxo Direto (Modo Diarista) & Refinar IA',
        descricao:
          'Empresas em Modo Diarista mantêm o apontamento direto sem etapas de subempreita. Use "Refinar IA" para deixar o texto pronto para o cliente.',
      },
    ],
    exemplo:
      'Em uma Empresa Modo Empreita, escolha a Obra Residencial no dropdown, selecione o Empreiteiro e a Etapa "Hidráulica", busque os funcionários pelo nome ou apelido, anexe 2–3 fotos e filtre o relatório por Encarregado para enviar no WhatsApp ou exportar CSV/PDF.',
  },
  '/medicoes': {
    titulo: 'Propostas, Etapas & Medição IA',
    resumo:
      'Acompanhamento de avanço físico e medição de empreita assistido por IA — pensado para gestores não-engenheiros.',
    funcoes: [
      {
        nome: 'Leitura Automática de Proposta',
        descricao:
          'Suba o PDF, foto ou texto da proposta para a IA extrair automaticamente as etapas e seus pesos.',
      },
      {
        nome: 'Estimar Avanço com IA',
        descricao:
          'Cruza Diários de Obra e Homens-Dia acumulados para sugerir o % concluído de cada etapa em linguagem simples.',
      },
    ],
    exemplo:
      'Suba o PDF da proposta da reforma, aguarde a criação das etapas e, ao longo da semana, clique em "Estimar Avanço com IA".',
  },
  '/compras': {
    titulo: 'Gerador Inteligente de Pedido de Compras (IA)',
    resumo:
      'Transforma listas informais de materiais enviadas nos grupos de obra em pedidos organizados por categoria já com Alias do Cliente, Endereço e Complemento/Obs. de Entrega.',
    funcoes: [
      {
        nome: 'Cabeçalho Automático p/ Fornecedores',
        descricao:
          'Insere automaticamente o Nome do Cliente p/ Fornecedor (Alias), Endereço de Entrega, CEP, Complemento/Regras de Descarga e quem recebe na obra.',
      },
      {
        nome: 'Copiar Tudo ou Só Uma Categoria',
        descricao:
          'Copie o pedido completo ou clique em "Copiar só esta categoria" (ex.: só Elétrica ou só Hidráulica) já levando o cabeçalho de entrega.',
      },
      {
        nome: 'Ativação por Empresa (Feature Flag)',
        descricao:
          'Disponível para empresas com o módulo de compras ativo; permanece em standby nas empresas focadas apenas em folha de diárias.',
      },
    ],
    exemplo:
      'Cole "Precisando urgente de 20 sacos de cimento, 3 rolos de fio 2.5mm e 6 tubos pvc 50mm" e clique em "Copiar só esta categoria" em Elétrica para mandar direto à loja elétrica.',
  },
  '/conciliacao': {
    titulo: 'Conciliação Bancária Automática (OFX / CSV)',
    resumo:
      'Cruza automaticamente o extrato bancário (.OFX ou .CSV) com vales, diárias e repasses PIX do sistema para aprovar conciliações em 1 clique.',
    funcoes: [
      {
        nome: 'Leitura Multibanco (OFX e CSV)',
        descricao:
          'Compatível com arquivos de bancos digitais e tradicionais; identifica automaticamente saídas PIX, datas e favorecidos.',
      },
      {
        nome: 'Matching Inteligente & Divergências',
        descricao:
          'Classifica cada saída como Match Exato, Sugestão para validação em 1 clique ou Divergência sem lançamento correspondente.',
      },
    ],
    exemplo:
      'Baixe o extrato .OFX ou .CSV do mês no internet banking, arraste na área de upload e clique em "Aprovar em 1 clique" nos pares confirmados.',
  },
  '/auditoria': {
    titulo: 'Saúde do Sistema & Auditoria IA',
    resumo:
      'Painel de confiabilidade com Índice de Saúde (0–100), Caça-Fantasmas (órfãos, datas anômalas e lotes vazios), anti-duplicidade de diárias/vales e diagnóstico pericial com IA.',
    funcoes: [
      {
        nome: 'Índice de Saúde (0–100) & 6 Pilares',
        descricao:
          'Monitora Anti-Duplicidade (Diárias + Vales + Perfis), Caça-Fantasmas (datas absurdas, valor zero, obras órfãs e lotes WhatsApp vazios), Precificação, Idempotência, Nomes Canônicos e Prontidão PIX.',
      },
      {
        nome: 'Diff Antes × Depois & Aprovação Humana',
        descricao:
          'Permite descartar duplicados/fantasmas (Soft Delete) ou aprovar ajustes seguros (apelidos e chaves de idempotência) sempre com confirmação explícita.',
      },
      {
        nome: 'Diagnóstico Pericial IA, Cadência Configurável & Histórico Auditável',
        descricao:
          'Exibe imediatamente o último laudo salvo sem piscar. Roda sob demanda no botão "Executar Varredura" e em cadência automática configurável (padrão: 1x ao dia às 19:30 BRT, ou Manual / 6h / 12h), mantendo histórico auditável mesmo com a aba fechada.',
      },
    ],
    exemplo:
      'Antes de fechar a quinzena, abra a aba "Saúde & IA" em Relatórios: o último laudo salvo aparece na hora (com data/hora, lançamentos, vales e lotes auditados). Se desejar nova checagem imediata, clique em "Executar Varredura" ou consulte o Histórico Auditável.',
  },
  '/config-geral': {
    titulo: 'Configuração Geral (Hub Multi-Empresa & Homologação)',
    resumo:
      'Ponto único da administração para chaves de liberação (Feature Flags) em homologação/implantação, dados compartilhados e roteamento de grupos do WhatsApp.',
    funcoes: [
      {
        nome: 'Chaves de Liberação (Feature Flags por Empresa)',
        descricao:
          'Ligue ou desligue recursos em homologação ou implantação independentemente por empresa. Quando ativa, exibe o selo EM HOMOLOGAÇÃO; quando desligada, oculta e bloqueia 100% da UI, APIs e agendamentos.',
      },
      {
        nome: '1 Conta WhatsApp → N Obras/Empresas',
        descricao:
          'Clique em "Puxar Grupos do WhatsApp" e vincule cada grupo à empresa, nome da obra e ambiente (Interno/Externo).',
      },
    ],
    exemplo:
      'Ative "FF_EXTRATO_COLABORADOR_LINK" apenas para uma empresa piloto em homologação: o botão Link Extrato (EM HOMOLOGAÇÃO) aparece somente nela, enquanto a outra empresa permanece 100% intacta.',
  },
  '/setup': {
    titulo: 'Cadastro de Obras, Empreiteiros & Equipes (Setup)',
    resumo:
      'Adapta automaticamente o cadastro ao perfil da empresa: Modo Empreita exibe Empreiteiros, Funcionários vinculados e Obras & Etapas; Modo Diarista mantém o cadastro expresso com Nome, Chave PIX e Diária.',
    funcoes: [
      {
        nome: 'Empreiteiros, Funcionários & Etapas (Modo Empreita)',
        descricao:
          'Cadastre Empreiteiros/Encarregados (com apelidos, documento e etapa padrão), vincule Funcionários da equipe (com apelidos e CPF/RG, sem exigir PIX individual) e personalize as Etapas de cada obra para alimentar automaticamente o Diário de Obra. Se o próprio empreiteiro também atuar em campo, marque "Também atua na obra" no cadastro ou clique em "+ Incluir na Equipe" no card dele para replicá-lo em 1 clique.',
      },
      {
        nome: 'Cadastro Expresso & Logística de Entrega',
        descricao:
          'No Modo Diarista, apenas Nome e Chave PIX são obrigatórios. Nas empresas com módulo de compras, Alias do Cliente e Endereço (CEP) saem automaticamente nos pedidos.',
      },
      {
        nome: 'Emissores de PIX da Caixinha de Campo (Modo Diarista)',
        descricao:
          'Adicione, ative/desative ou remova pagadores adicionais do Caixinha de Campo (além dos emissores padrão obrigatórios), alimentando automaticamente o dropdown de Emissor no /caixinha sem alterar o fluxo de vales.',
      },
    ],
    exemplo:
      'Em uma Empresa Modo Empreita, cadastre o Empreiteiro na aba 1, vincule os funcionários dele na aba 2 com apelidos/CPF e marque "Hidráulica" e "Gesso" na obra pela aba 3 — tudo já aparece pronto nos dropdowns do Diário de Obra.',
  },
  '/whatsapp': {
    titulo: 'Conexão do Bot & Vínculo de Grupos',
    resumo:
      'Emparelhamento da conta WhatsApp via Pairing Code (8 dígitos) ou QR Code e vinculação direta de cada grupo à empresa e obra.',
    funcoes: [
      {
        nome: 'Pairing Code & QR Code',
        descricao:
          'Conecte seu aparelho em "Aparelhos Conectados" e sincronize os grupos ativos.',
      },
      {
        nome: 'Vínculo Rápido Grupo → Empresa & Obra',
        descricao:
          'Ao ativar o monitoramento de um grupo (ou clicar em "Vincular Obra"), escolha a empresa, o nome da obra e o ambiente (Interno/Externo) em 1 passo.',
      },
    ],
    exemplo:
      'Ative o monitoramento do grupo de uma reforma, selecione o modo Empreita + ambiente Interno e clique em "Vincular e Salvar" — a obra é criada e roteada automaticamente.',
  },
};

const AJUDA_PADRAO: AjudaRota = {
  titulo: 'Ajuda do Sistema',
  resumo:
    'Consulte o manual completo e exemplos práticos na central de ajuda.',
  funcoes: [
    {
      nome: 'Fluxo Human-in-the-Loop',
      descricao:
        'A IA organiza e sugere; toda aprovação financeira depende da confirmação da administração.',
    },
  ],
  exemplo:
    'Use o botão "Manual Completo" abaixo para acessar o guia passo a passo de todos os módulos.',
};

export default function ContextualHelp() {
  const pathname = usePathname() || '/';
  const [aberto, setAberto] = useState(false);

  if (
    pathname === '/login' ||
    pathname === '/ajuda' ||
    pathname.startsWith('/extrato/')
  ) {
    return null;
  }

  const ajuda = AJUDA_POR_ROTA[pathname] || AJUDA_PADRAO;
  const mobileBottomOffsetClass =
    pathname === '/bordero'
      ? 'bottom-44 right-3 lg:bottom-5 lg:right-5'
      : 'bottom-[74px] right-3 lg:bottom-5 lg:right-5';

  return (
    <>
      {/* Botão flutuante discreto */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`fixed ${mobileBottomOffsetClass} z-30 p-3 sm:px-3.5 sm:py-2.5 rounded-full bg-slate-900/95 hover:bg-slate-800 text-white text-xs font-bold shadow-lg border border-slate-700 flex items-center gap-2 transition-all active:scale-95 print:hidden`}
        title={`Ajuda desta tela: ${ajuda.titulo}`}
        aria-label={`Ajuda desta tela: ${ajuda.titulo}`}
      >
        <HelpCircle className="w-4 h-4 text-emerald-400" />
        <span className="hidden sm:inline">Ajuda desta tela</span>
      </button>

      {/* Modal / Drawer Contextual */}
      {aberto && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-end p-4 print:hidden"
          onClick={() => setAberto(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-slate-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold block">
                    Ajuda Contextual • {pathname}
                  </span>
                  <h3 className="text-sm font-black">{ajuda.titulo}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <p className="text-xs text-slate-600 leading-relaxed">
                {ajuda.resumo}
              </p>

              <div className="space-y-2.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                  Principais Funções desta Tela
                </span>
                {ajuda.funcoes.map((f, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-0.5"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{f.nome}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                      {f.descricao}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
                  Exemplo Prático de Uso
                </span>
                <p className="text-xs text-emerald-950 leading-relaxed">
                  {ajuda.exemplo}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <Link
                  href="/ajuda"
                  onClick={() => setAberto(false)}
                  className="text-xs font-bold text-indigo-700 hover:underline flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Abrir Manual Completo</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
