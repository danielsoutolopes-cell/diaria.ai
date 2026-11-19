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
      'Consolidação final por colaborador para pagamento da folha com decisão 100% humana sobre cada vale.',
    funcoes: [
      {
        nome: 'Desconto Opcional de Vales',
        descricao:
          'Desmarcar um vale não o apaga: ele continua ativo como saldo a dever para os próximos fechamentos.',
      },
      {
        nome: 'PIX Copia e Cola & QR Code',
        descricao:
          'Gera o código PIX com o valor líquido exato calculado apenas sobre os itens marcados.',
      },
    ],
    exemplo:
      'Marque as diárias e vales que entram no pagamento de hoje, confira o valor líquido e clique em "Copiar PIX Copia e Cola".',
  },
  '/relatorios': {
    titulo: 'Relatórios & Exportações (1 a 6)',
    resumo:
      'Central analítica com Borderô Consolidado, Custo por Obra, Extrato XLS, Espelho do Ponto (4), Calendário Visual (5) e Calendário de Vales/Caixa (6).',
    funcoes: [
      {
        nome: 'Envio Direto em PDF no WhatsApp (PDF Zap)',
        descricao:
          'Nos Relatórios 4 e 5, escolha o destinatário no seletor do banco e dispare o PDF direto no WhatsApp.',
      },
      {
        nome: 'Sigilo Automático',
        descricao:
          'Administradores recebem o PDF com valores em R$; encarregados e equipe recebem versão operacional sem valores.',
      },
    ],
    exemplo:
      'No Relatório 5 (Calendário Visual), selecione o mês, escolha o destinatário no seletor e clique em "PDF Zap".',
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
      'Cadastro expresso de obras, colaboradores, apelidos reconhecidos pela IA e valores de diária.',
    funcoes: [
      {
        nome: 'Apelidos para IA',
        descricao:
          'Cadastre apelidos usuais de campo para que a IA reconheça automaticamente obras e profissionais nas mensagens.',
      },
    ],
    exemplo:
      'Cadastre a obra com seu nome oficial e adicione apelidos curtos usados pela equipe no WhatsApp.',
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

  if (pathname === '/login' || pathname === '/ajuda') return null;

  const ajuda = AJUDA_POR_ROTA[pathname] || AJUDA_PADRAO;

  return (
    <>
      {/* Botão flutuante discreto */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="fixed bottom-5 right-5 z-40 px-3.5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-lg border border-slate-700 flex items-center gap-2 transition-all active:scale-95 print:hidden"
        title={`Ajuda desta tela: ${ajuda.titulo}`}
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
