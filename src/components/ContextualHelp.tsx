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
    ],
    exemplo:
      'Expanda "Ver Mensagem Original", ajuste frações (Integral / Meio Dia) se necessário e clique em "Aprovar Mensagem".',
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
        nome: 'Valor Padrão & Dropdowns Oficiais',
        descricao:
          'Selecione Trabalhador e Obra nos menus suspensos. Se o valor for omitido na solicitação, o sistema sugere R$ 100,00.',
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
      'Quando o encarregado pedir "Um vale para o João" no grupo, o pedido aparece na Etapa 1. Ao subir o comprovante PIX, ele muda para Etapa 2 (Confirmado) e fica disponível no Borderô.',
  },
  '/caixinha': {
    titulo: 'Caixinha de Campo (Unificado)',
    resumo:
      'Conta corrente unificada de verbas operacionais em mãos dos encarregados, com consolidação automática de apelidos e preservação de saldos pré-implantação.',
    funcoes: [
      {
        nome: 'Unificação de Perfis & Apelidos',
        descricao:
          'Lançamentos enviados por diferentes apelidos ou números do mesmo encarregado são agrupados automaticamente em um único card consolidado.',
      },
      {
        nome: 'Coluna Própria (Sem Desconto Automático)',
        descricao:
          'O troco em mãos nunca é abatido automaticamente da folha de diárias. A administração decide manualmente quando devolver troco ou transferir para o fechamento.',
      },
      {
        nome: 'Leitura de Notas & PIX com IA',
        descricao:
          'Envie a foto de um cupom fiscal ou comprovante PIX para preencher tipo, valor e descrição automaticamente.',
      },
    ],
    exemplo:
      'Se o encarregado recebeu R$ 700,00 em suprimentos PIX e comprovou R$ 546,94 em notas de material, o card unificado exibirá Troco em Mãos: R$ 153,06 separado da folha salarial.',
  },
  '/reembolsos': {
    titulo: 'Caixa de Campo & Reembolsos',
    resumo:
      'Conta corrente de verbas de obra (materiais, locações e reembolsos), 100% separada de diárias e vales pessoais.',
    funcoes: [
      {
        nome: 'Entradas PIX vs Notas Fiscais',
        descricao:
          'Saldo positivo = troco em mãos do encarregado. Saldo negativo = reembolso que a empresa deve pagar.',
      },
      {
        nome: 'Ler Nota / PIX com IA',
        descricao:
          'Suba a foto de um cupom fiscal ou comprovante de PIX para preencher automaticamente tipo, valor e descrição.',
      },
      {
        nome: 'Liquidação & Levar p/ Fechamento',
        descricao:
          'Zere o saldo registrando devolução de troco, pagamento de reembolso avulso ou transferindo opcionalmente para o Fechamento & Pagamentos.',
      },
    ],
    exemplo:
      'Selecione Colaborador, Obra e Data (aceita retroativo). Se enviou R$ 400 de PIX e ele prestou R$ 289,18 em notas, o sistema calcula Troco em Mãos: R$ 110,82.',
  },
  '/bordero': {
    titulo: 'Fechamento & Pagamentos (PIX)',
    resumo:
      'Consolidação final por colaborador com decisão 100% humana sobre cada vale, leitura OCR de comprovante PIX e emissão de Recibo Individual em PDF salvo em nuvem.',
    funcoes: [
      {
        nome: 'Desconto Opcional de Vales',
        descricao:
          'Desmarcar um vale não o apaga: ele continua ativo como saldo a dever para os próximos fechamentos.',
      },
      {
        nome: 'PIX Copia e Cola & QR Code',
        descricao:
          'Gera o código PIX com o valor líquido exato e discriminação de rateio multi-obra calculado apenas sobre os itens marcados.',
      },
      {
        nome: 'Recibo Individual de Liquidação PIX (PDF + Nuvem)',
        descricao:
          'Clique em "Recibo PIX" no card do colaborador para gerar o comprovante detalhado em PDF com hash pericial, salvo automaticamente em nuvem, com opção de baixar, imprimir e envio OPCIONAL no WhatsApp.',
      },
    ],
    exemplo:
      'Marque as diárias e vales que entram no pagamento, copie o PIX, clique em "Recibo PIX" para arquivar/imprimir o comprovante e, somente se desejar, clique em "Enviar no Zap".',
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
    titulo: 'Diário de Obra (2 a 3 Fotos)',
    resumo:
      'Registro rápido de evolução diária da obra com efetivo presente, fotos e relatório pronto para o cliente.',
    funcoes: [
      {
        nome: 'Ambiente Interno vs Externo',
        descricao:
          'Obras internas destacam Condomínio/Acesso; obras externas destacam Clima.',
      },
      {
        nome: 'Refinar com IA & PDF Zap',
        descricao:
          'Transforma anotações curtas em texto executivo limpo e envia o PDF timbrado direto no WhatsApp.',
      },
    ],
    exemplo:
      'Puxe o efetivo do dia, anexe 2 ou 3 fotos, escreva 2 linhas de resumo, clique em "Refinar com IA" e salve o relatório.',
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
        nome: 'Diagnóstico Pericial IA & Aba em Relatórios',
        descricao:
          'Acessível também pela aba "Saúde do Sistema & IA" na tela de Relatórios, com parecer executivo sob demanda antes do fechamento PIX.',
      },
    ],
    exemplo:
      'Antes de fechar a quinzena, abra a aba "Saúde do Sistema & IA" em Relatórios, confira se Duplicados = 0 e Fantasmas = 0, e clique em "Diagnóstico Pericial IA" para validar a folha.',
  },
  '/config-geral': {
    titulo: 'Configuração Geral (Hub Multi-Empresa)',
    resumo:
      'Painel exclusivo da administração para dados compartilhados e roteamento de grupos do WhatsApp.',
    funcoes: [
      {
        nome: '1 Conta WhatsApp → N Obras/Empresas',
        descricao:
          'Clique em "Puxar Grupos do WhatsApp" e vincule cada grupo à empresa, nome da obra e ambiente (Interno/Externo).',
      },
    ],
    exemplo:
      'Vincule o grupo de cada obra uma única vez: toda mensagem enviada ali já cai automaticamente na empresa e obra corretas.',
  },
  '/setup': {
    titulo: 'Cadastro de Obras & Equipes (Setup)',
    resumo:
      'Cadastro expresso de obras (com Alias de Cliente p/ Fornecedores, CEP/Endereço, Complemento/Obs. de Entrega e Contato de Recebimento) e colaboradores.',
    funcoes: [
      {
        nome: 'Logística de Entrega & Alias do Cliente p/ Fornecedores',
        descricao:
          'Nas empresas com módulo de compras ativo, o Endereço de Entrega (com busca automática por CEP) e o Alias do Cliente são obrigatórios para sair automaticamente nos pedidos.',
      },
      {
        nome: 'Apelidos para IA',
        descricao:
          'Cadastre apelidos usuais de campo para que a IA reconheça automaticamente obras e profissionais nas mensagens.',
      },
    ],
    exemplo:
      'Cadastre a obra com o Alias do Cliente (como o fornecedor identifica), digite o CEP para preencher o endereço e informe no Complemento "Portaria de serviço • Descarga 08h–17h".',
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
