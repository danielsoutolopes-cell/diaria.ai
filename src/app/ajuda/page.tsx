'use client';

import React, { useState } from 'react';
import {
  HelpCircle,
  BookOpen,
  QrCode,
  Smartphone,
  ShieldCheck,
  CreditCard,
  FileSpreadsheet,
  Camera,
  Share2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Users,
  HardHat,
  MessageCircle,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import HelpCenter from '@/components/HelpCenter';

interface SecaoAjuda {
  id: string;
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  descricao: string;
  conteudo: React.ReactNode;
}

export default function AjudaPage() {
  const [secaoAberta, setSecaoAberta] = useState<string>('geral');

  const secoes: SecaoAjuda[] = [
    {
      id: 'geral',
      titulo: '1. O que é o Ponto Patrícia (Diária.AI)?',
      icone: Sparkles,
      descricao: 'Visão geral da solução, canteiros de obra, piscinas e inteligência artificial',
      conteudo: (
        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
          <p>
            O <strong>Ponto Patrícia (Diária.AI)</strong> é um Micro-ERP de campo desenhado sob medida para
            gestão de obras civis e instalação de piscinas.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
              <span className="font-bold text-slate-900 block text-xs">Apontamentos por WhatsApp</span>
              <p className="text-[11px] text-slate-500">
                O encarregado manda mensagens em linguagem natural no grupo. A IA extrai diárias e vales automaticamente.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
              <span className="font-bold text-slate-900 block text-xs">Human-in-the-Loop</span>
              <p className="text-[11px] text-slate-500">
                A IA nunca liquida dinheiro sozinha. Todos os lançamentos dependem de aprovação expressa da Administração.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
              <span className="font-bold text-slate-900 block text-xs">PIX Dinâmico Instantâneo</span>
              <p className="text-[11px] text-slate-500">
                Fechamento de folha em 1 clique com QR Code e Copia e Cola com o valor líquido exato descontado dos vales.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'exemplos-praticos',
      titulo: '1B. Exemplos Práticos do Dia a Dia (Guia Rápido)',
      icone: CheckCircle2,
      descricao: 'Passo a passo com exemplos reais de uso: Assistente IA, Caixinha Unificado, Reinício Pós-Quitação, Diário de Obra e PDF no WhatsApp',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
              <span className="font-black text-emerald-950 block">1. Assistente IA com &quot;De Acordo&quot;</span>
              <p className="text-[11px] text-emerald-900">
                <strong>Exemplo:</strong> Digite <em>&quot;Vale de R$ 100 para o João, Obra Residencial, hoje&quot;</em>. A IA verifica se faltou alguma informação e só envia para Validação após você clicar em <strong>De Acordo</strong>.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-1">
              <span className="font-black text-indigo-950 block">2. Caixinha de Campo, Emissor PIX &amp; OCR Inteligente (/caixinha)</span>
              <p className="text-[11px] text-indigo-900">
                <strong>Exemplo:</strong> Em uma única tela, separe o <strong>Portador do Caixinha</strong> do <strong>Emissor do PIX</strong> (gerencie emissores adicionais direto no <strong>/setup</strong> sem alterar o fluxo de vales) e grave <strong>Data + Hora (HH:MM)</strong>. Mesmo em prints cortados, o OCR aplica fallback inteligente e exibe no extrato quem enviou e o horário (<code>dd/mm/aaaa às HH:mm</code>).
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200/80 space-y-1">
              <span className="font-black text-sky-950 block">3. Reinício de Contagem Pós-Quitação</span>
              <p className="text-[11px] text-sky-900">
                <strong>Exemplo:</strong> Quando você liquida o ciclo de um colaborador via PIX pela manhã, qualquer nova diária apontada à tarde (na mesma obra ou em outra) abre automaticamente um <strong>novo ciclo em aberto</strong> sem colisão e sem ser zerada retroativamente.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-1">
              <span className="font-black text-amber-950 block">4. Vales em 2 Etapas (/validacao/vales) &amp; Separação Estrita (0 Diárias)</span>
              <p className="text-[11px] text-amber-900">
                <strong>Exemplo:</strong> Listas exclusivas de vale (ex.: <em>&quot;6 vale por favor&quot;</em> com <em>&quot;Colaborador B 50 reais&quot;</em> e demais sem valor) geram <strong>somente vales</strong> (valor por linha + padrão R$ 100,00) e <strong>0 diárias indevidas</strong>, memorizando o padrão do remetente para próximos envios.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-1">
              <span className="font-black text-purple-950 block">5. Rateio Multi-Obra (½ + ½) &amp; Excel 5 Abas</span>
              <p className="text-[11px] text-purple-900">
                <strong>Exemplo:</strong> Quando um colaborador trabalha 0,5d na Obra A e 0,5d na Obra B no mesmo dia, o Espelho do Ponto exibe <strong>½+½</strong> e o Extrato Analítico baixa 5 abas completas com fórmulas <code className="font-mono">=SUM</code> (incluindo Mão de Obra + Caixinha em Custo por Obra).
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200/80 space-y-1">
              <span className="font-black text-teal-950 block">6. Conciliação Bancária (/conciliacao) &amp; Feature Flags (/config-geral)</span>
              <p className="text-[11px] text-teal-900">
                <strong>Exemplo:</strong> Suba extratos <strong>.OFX / .CSV</strong> para cruzar saídas PIX em 1 clique. No Hub <strong>/config-geral</strong> (ponto único de homologação), a administração ativa ou desativa recursos <strong>EM HOMOLOGAÇÃO</strong> (Resumo 19h &quot;OK&quot; e Portal <code>/extrato/[token]</code>) independentemente por empresa.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-100/90 border border-slate-200 space-y-1 md:col-span-2">
              <span className="font-black text-slate-950 block">7. Diário de Obra por Empreiteiro &amp; Etapa (/diario-obra — Modo Empreita)</span>
              <p className="text-[11px] text-slate-700">
                <strong>Exemplo:</strong> Em uma <em>Empresa Modo Empreita</em>, selecione a <strong>Obra</strong> no dropdown, mantenha <strong>Condomínio / Acesso</strong> separado de <strong>Ocorrência / Impedimento</strong> (ex.: Falta de Material do Cliente só aparece quando marcada), escolha o <strong>Empreiteiro / Encarregado</strong> e a <strong>Etapa</strong> (ex.: Hidráulica, Gesso), adicione os <strong>Funcionários</strong> da equipe buscando por nome oficial ou apelido (com CPF/RG) e filtre o relatório (WhatsApp, PDF ou CSV) por encarregado. Empresas em <em>Modo Diarista</em> preservam o fluxo direto sem subempreita.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'pwa',
      titulo: '2. Como Instalar o App no Celular (PWA) e Usar Biometria',
      icone: Smartphone,
      descricao: 'Instalação rápida no iPhone e Android sem precisar de loja de aplicativos',
      conteudo: (
        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-900" />
                No iPhone (iOS / Safari)
              </h4>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-500">
                <li>Abra o link do sistema no <strong>Safari</strong>.</li>
                <li>Toque no botão de <strong>Compartilhar</strong> (quadrado com seta).</li>
                <li>Role a lista e clique em <strong>Adicionar à Tela de Início</strong>.</li>
                <li>O ícone aparecerá como um app nativo na sua tela principal.</li>
              </ol>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                No Android (Chrome)
              </h4>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-500">
                <li>Abra o link do sistema no <strong>Google Chrome</strong>.</li>
                <li>Toque nos <strong>3 pontinhos</strong> no canto superior direito.</li>
                <li>Selecione <strong>Instalar Aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                <li>Pronto! O app abre em tela cheia com alta velocidade.</li>
              </ol>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 space-y-1.5">
            <h4 className="font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Acesso por Biometria (Face ID / Digital)
            </h4>
            <p className="text-[11px] text-emerald-800">
              Após fazer o primeiro login com seu celular e senha autorizada, você pode ativar a biometria. No próximo acesso, basta tocar em <strong>"Acessar com Biometria"</strong> e desbloquear o sistema instantaneamente com seu rosto ou digital.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'whatsapp',
      titulo: '3. Integração Baileys e Mensagens no WhatsApp de Campo',
      icone: MessageCircle,
      descricao: 'Motor oficial Baileys por QR Code, monitoramento de grupos de canteiro e envio de comprovantes',
      conteudo: (
        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-[11px] text-emerald-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5 text-emerald-950">
              <QrCode className="w-4 h-4 text-emerald-700" />
              Motor Oficial WhatsApp: Baileys Open-Source
            </span>
            <p>
              O sistema utiliza a biblioteca <strong>Baileys</strong> conectada diretamente via QR Code na aba <strong>Configuração do Bot (WhatsApp)</strong>. Não há custo de mensagens por conversa e funciona perfeitamente em grupos de obras e piscinas (<code>@g.us</code>).
            </p>
          </div>

          <p>
            O robô monitora os grupos oficiais dos canteiros configurados. O encarregado pode escrever normalmente:
          </p>

          <div className="space-y-2">
            <div className="p-3 bg-slate-100 rounded-2xl font-mono text-[11px] text-slate-800 border border-slate-200">
              💬 <em>"Hoje na Obra Alphaville: Tião trabalhou o dia todo, Zé Pedreiro meio dia e o Maranhão faltou."</em>
            </div>
            <p className="text-[11px] text-slate-500">
              👉 <strong>Resultado:</strong> A IA lança 1 diária para Tião, 0.5 diária para Zé, marca falta para Maranhão e joga para a tela de Validações Pendentes com status PENDENTE.
            </p>
          </div>

          <div className="space-y-2">
            <div className="p-3 bg-slate-100 rounded-2xl font-mono text-[11px] text-slate-800 border border-slate-200">
              💬 <em>"Manda 100 de vale pro Tião almoço com foto do comprovante."</em> (acompanhado de imagem)
            </div>
            <p className="text-[11px] text-slate-500">
              👉 <strong>Resultado:</strong> O bot faz download automático da imagem do WhatsApp, salva com segurança no Cloudflare R2 e cria o vale de R$ 100,00 vinculado à foto do recibo.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200/80">
            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">
              Regras Especiais de Diárias de Campo:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
              <li><strong>Diária Variável por Canteiro</strong>: Suporte a valores diferentes para o mesmo funcionário (ex: R$ 220 no <em>Quase Tudo</em> e R$ 200 no <em>Jabaquara</em>).</li>
              <li><strong>Dia de Viagem</strong>: R$ 120,00 para os trabalhadores em trânsito; motorista que dirigiu recebe diária integral.</li>
              <li><strong>Dia de Chuva</strong>: R$ 120,00 (padrão <strong>1.0 integral</strong>, sem meio-dia automático, pois cobre alimentação/estadia em dia não trabalhado por chuva).</li>
              <li><strong>Dia Parado</strong>: R$ 120,00 quando o condomínio não autoriza a entrada ou a portaria trava o acesso.</li>
              <li><em>(Todos esses valores podem ser editados na tela de Configurações)</em>.</li>
            </ul>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200/80">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
              🔒 Sigilo Financeiro & Emissão de Tickets:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
              <li><strong>Valores Monetários</strong>: Visíveis EXCLUSIVAMENTE para <strong>Daniel Lopes</strong> e <strong>Patrícia Grubel</strong>.</li>
              <li><strong>Sem Ruído no Grupo</strong>: O bot nunca responde nem posta nada no grupo de WhatsApp da obra.</li>
              <li><strong>Ticket do Encarregado</strong>: Recebe no privado dele confirmação dos nomes e faltas, com <strong>ZERO valores em R$</strong>.</li>
              <li><strong>Ticket Executivo</strong>: Patrícia e Daniel recebem o resumo financeiro completo com valores e link mágico de validação.</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'validacoes',
      titulo: '4. Validação Human-in-the-Loop & Governança Multi-Admin (Patrícia & Daniel)',
      icone: CheckCircle2,
      descricao: 'Como revisar, travas de registro já confirmado e alerta obrigatório para Patrícia',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            A tela de <Link href="/validacoes" className="text-emerald-600 font-bold underline">Validações Pendentes</Link> é a central de controle e segurança da folha de pagamento.
          </p>
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
            <li><strong>Validação por Mensagem Enviada (Card por Horário)</strong>: Cada mensagem do WhatsApp (ex.: <code>06:37</code>, <code>08:40</code>) aparece em seu próprio card com botão para ver o texto original, subtotal individual e botão <strong>"Aprovar Mensagem"</strong>.</li>
            <li><strong>Exclusão de Registro Individual ou Mensagem Inteira</strong>: Use o ícone de lixeira para descartar um colaborador extraído indevidamente ou descartar uma mensagem inteira. A exclusão usa <em>Soft Delete</em> (<code>DESCARTADO</code>), preservando a auditoria e impedindo reenvio.</li>
            <li><strong>Ponto de Corte Operacional ("Corte até Ontem")</strong>: Consolida todas as pendências anteriores a hoje como <code>VALIDADO</code> e protege o webhook contra mensagens antigas em reconexões do WhatsApp.</li>
            <li><strong>Revisão de Fração</strong>: Confira se a IA classificou 1x diária ou meio período (0.5x).</li>
            <li><strong>Recibos em Lightbox</strong>: Na coluna Anexo/Recibo, clique no clipe de papel para ampliar a foto do comprovante e baixar localmente.</li>
            <li><strong>Trava de Confirmação Prévia ("Já Confirmado")</strong>: Como agora Patrícia e Daniel recebem avisos e operam o sistema, se um lote já foi aprovado por um deles, qualquer tentativa de revalidação exibe o alerta: <em>"O registro já foi confirmado por [Nome]. Quer continuar?"</em></li>
            <li><strong>Memória de Campo (IA) por Remetente</strong>: O sistema aprende automaticamente apelidos, hábitos de pontuação e a obra padrão de cada remetente (tanto a partir da 2ª passagem automática quanto de correções humanas na validação). Na faixa discreta <strong>&quot;Memória de Campo (IA)&quot;</strong> no topo de <code>/validacoes</code>, você pode revisar, ajustar ou excluir qualquer regra aprendida.</li>
            <li><strong>Alerta Obrigatório para Patrícia</strong>: Sempre que qualquer registro for alterado por outro usuário (como Daniel), a Administradora Patrícia Grubel recebe uma mensagem detalhada no WhatsApp informando quem alterou, colaborador, obra e os novos valores.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'bordero',
      titulo: '5. Borderô de Pagamento (Sexta VIP) e Saldo Devedor de Vales',
      icone: CreditCard,
      descricao: 'Decisão 100% humana: abater hoje ou manter como saldo a dever',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Na tela de <Link href="/bordero" className="text-emerald-600 font-bold underline">Fechamento (Borderô)</Link>, o sistema consolida o extrato de cada trabalhador, mas <strong>a decisão de descontar ou não o vale é estritamente humana</strong>:
          </p>
          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-950 font-semibold text-[11px]">
            Líquido a Pagar = (Soma das Diárias Marcadas) - (Vales Marcados para Desconto Hoje)
          </div>
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
            <li><strong>Desmarcar Todos / Marcar Todos (Global)</strong>: Na barra superior do Borderô, clique em <strong>&quot;Desmarcar Todos&quot;</strong> para zerar toda a folha selecionada (<code>R$ 0,00</code>) de uma vez ou em <strong>&quot;Marcar Todos&quot;</strong> para selecionar toda a folha aberta.</li>
            <li><strong>Marcar Todos / Desmarcar por Colaborador</strong>: Dentro do card de cada colaborador, os atalhos <strong>&quot;Marcar Todos&quot;</strong> e <strong>&quot;Desmarcar&quot;</strong> atuam exclusivamente nos lançamentos daquele colaborador, sem alterar os demais.</li>
            <li><strong>Pagar por Obra (com Aviso de Vales em Aberto)</strong>: Escolha uma obra no seletor <strong>&quot;Pagar por Obra&quot;</strong> para desmarcar as demais e manter marcadas <strong>somente as diárias daquela obra</strong>. Caso algum colaborador tenha vales em aberto, o sistema exibe um aviso discreto para conferência humana antes do PIX.</li>
            <li><strong>Desconto Opcional &amp; Saldo a Dever</strong>: Se a administração desmarcar a caixa de um vale, ele <strong>não é descontado da folha atual</strong> e <strong>não é liquidado</strong>, permanecendo ativo como saldo a dever para os próximos fechamentos.</li>
            <li><strong>PIX Copia e Cola, QR Code &amp; Exportar XLS</strong>: Gera o código padrão do Banco Central com valor exato ajustado na hora, QR Code para leitura direta e planilha de fechamento do dia.</li>
          </ul>
          <div className="p-3 bg-slate-100 rounded-2xl text-[11px] text-slate-700 border border-slate-200">
            <strong>Exemplo Prático:</strong> Para quitar hoje apenas as diárias de uma <em>Obra Residencial</em>, escolha-a em <strong>Pagar por Obra</strong>; o total líquido passa a refletir só aquela obra e um aviso discreto lembra quais colaboradores possuem vales em aberto caso deseje abater algum deles.
          </div>
        </div>
      ),
    },
    {
      id: 'reembolsos',
      titulo: '6. Módulo de Reembolsos de Despesas (Alinhamento Patrícia x Joabson)',
      icone: CreditCard,
      descricao: 'Controle de notas de combustível, pedágio e materiais com liquidação parcial ou total',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            O fluxo de reembolsos foi desenhado para manter o WhatsApp do Joabson totalmente despoluído e a tomada de decisão 100% nas mãos da Patrícia:
          </p>
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
            <li><strong>Zero Mensagens para o Joabson</strong>: As fotos de notas enviadas no grupo são capturadas silenciosamente. O bot não manda mensagens nem tickets para o Joabson.</li>
            <li><strong>Alinhamento Exclusivo da Patrícia</strong>: Somente a Patrícia Grubel conversa diretamente com o Joabson para definir se a despesa é elegível.</li>
            <li><strong>Data Livre para Pagamento</strong>: Não depende da quinzena da folha. A Patrícia pode quitar via Pix em qualquer dia da semana.</li>
            <li><strong>Baixa Parcial ou Total</strong>: Permite pagar frações do saldo (ex: reembolsar R$ 400 agora e R$ 200 depois). O sistema mantém a conta corrente do saldo aberta até a quitação integral.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'date-stamp',
      titulo: '7. Auditoria Fotográfica & Date Stamp Indelével',
      icone: Camera,
      descricao: 'Carimbo automático de data, hora de Brasília, clima e hash SHA-256 nas fotos de canteiro',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Para comprovação jurídica e pericial de evolução de obra contra contestações de clientes ou empreiteiros, toda foto de obra processada pelo sistema recebe uma estampa permanente via motor <strong>Sharp</strong>:
          </p>
          <div className="p-4 bg-slate-900 text-white rounded-2xl font-mono text-[11px] space-y-1">
            <p className="text-emerald-400 font-bold">OBRA: RESIDENCIAL ALPHAVILLE | ETAPA: PISCINA</p>
            <p className="text-slate-300">DATA/HORA: 14/11/2026 17:15 (Horário de Brasília) | CLIMA: Céu Limpo 27°C</p>
            <p className="text-slate-400 text-[10px]">Ponto Patrícia (Diária.AI) • Registro de Campo | GPS: -23.5505, -46.6333</p>
          </div>
          <p className="text-[11px] text-slate-500">
            Além do carimbo visual, cada foto possui um <strong>Hash SHA-256</strong> gravado no banco de dados, provando que o arquivo não foi alterado ou adulterado posteriormente.
          </p>
        </div>
      ),
    },
    {
      id: 'relatorios',
      titulo: '7. Relatórios & Disparos via WhatsApp',
      icone: FileSpreadsheet,
      descricao: 'Demonstrativos semanais, quinzenais e mensais com envio direto no WhatsApp',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Na aba <Link href="/relatorios" className="text-emerald-600 font-bold underline">Relatórios & Exportações</Link>, você tem visão executiva completa:
          </p>
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
            <li><strong>Seletor de Período</strong>: Alterne entre <em>Semanal</em>, <em>Quinzenal</em> e <em>Mensal</em>.</li>
            <li><strong>Borderô Consolidado</strong>: Planilha completa para conciliação bancária.</li>
            <li><strong>Custo por Canteiro</strong>: Total investido em mão de obra por obra (Piscina x Obra Civil).</li>
            <li><strong>Disparo para Diretoria</strong>: Botão verde superior envia o resumo financeiro formatado para a Patrícia ou sócios no WhatsApp.</li>
            <li><strong>Disparo para o Trabalhador</strong>: Botão em cada linha envia o comprovante individual direto no WhatsApp do funcionário.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'setup',
      titulo: '8. Cadastro Expresso de Funcionários e Obras',
      icone: Users,
      descricao: 'Como cadastrar trabalhadores com apenas Nome e Chave PIX obrigatórios e múltiplos apelidos',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Para agilidade de campo na tela de <Link href="/setup" className="text-emerald-600 font-bold underline">Setup</Link>:
          </p>
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
            <li><strong>Obrigatório (Modo Diarista)</strong>: Apenas <strong>Nome do Trabalhador</strong> e <strong>Chave PIX</strong>.</li>
            <li><strong>Subempreita em 3 Abas (Modo Empreita)</strong>: Exibe automaticamente as abas <strong>Empreiteiros / Encarregados</strong> (com apelidos, documento, etapa padrão e PIX opcional), <strong>Funcionários / Equipe</strong> (vinculados ao empreiteiro com apelidos, CPF/RG e etapa, sem exigir PIX individual) e <strong>Obras &amp; Etapas</strong> (alimentando direto os dropdowns do Diário de Obra).</li>
            <li><strong>Múltiplos Apelidos</strong>: Você pode cadastrar apelidos alternativos para profissionais e obras. A IA e a busca do Diário de Obra reconhecem esses apelidos automaticamente.</li>
            <li><strong>Opcional</strong>: Telefone, Canteiro de Obra e Valor da Diária. Se deixar a diária em branco, o sistema assume automaticamente a diária padrão da obra.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'mensageria',
      titulo: '9. Central de Mensageria & Solicitação de Relatórios (IA)',
      icone: MessageCircle,
      descricao: 'Como solicitar novos relatórios ou ajustes ao Arquiteto Gemini e repassar para Daniel Lopes',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Na tela de <Link href="/mensageria" className="text-emerald-600 font-bold underline">Mensageria & Pedidos IA</Link>, a Patrícia pode conversar em linguagem natural com a IA para pedir qualquer novo relatório, filtro ou melhoria:
          </p>
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
            <li><strong>Chat Inteligente com Gemini</strong>: A IA conversa, faz perguntas de alinhamento (quais colunas, filtros, periodicidade) até entender perfeitamente a necessidade.</li>
            <li><strong>Geração do Prompt para a IDE</strong>: Assim que tudo é alinhado, o sistema sintetiza um prompt técnico de engenharia de software pronto para copiar em 1 clique.</li>
            <li><strong>Aviso no WhatsApp do Daniel Lopes</strong>: Um alerta com o link direto da solicitação é enviado para o Daniel Lopes (5511988139833) para execução na IDE.</li>
            <li><strong>Fechamento do Pedido</strong>: Daniel acessa a tela, copia o prompt para o ambiente de desenvolvimento e clica em <strong>&quot;Fechar Pedido&quot;</strong> assim que a entrega for concluída.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'relatorios-avancados-recibos',
      titulo: '10. Excel em 5 Abas (=SUM), Recibo PIX Individual & Envio Quinzenal em PDF',
      icone: FileSpreadsheet,
      descricao: 'Exportação analítica com fórmulas, comprovante individual salvo em nuvem e fechamento quinzenal automático',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
            <li>
              <strong>Planilha Excel V6 em 5 Abas</strong>: Em{' '}
              <Link href="/relatorios" className="text-emerald-600 font-bold underline">
                Relatórios &amp; Exportações
              </Link>
              , clique em <strong>&quot;Excel V6 (5 Abas)&quot;</strong> para gerar automaticamente as abas <em>Resumo por Trabalhador</em>, <em>Detalhamento de Diárias</em> (com Chuva, Piscina e Rateio ½+½), <em>Controle de Vales</em>, <em>Caixinha de Campo</em> e <em>Custo por Obra</em> com fórmulas nativas <code>=SUM(...)</code>.
            </li>
            <li>
              <strong>Comprovante Individual de Liquidação PIX</strong>: Em{' '}
              <Link href="/bordero" className="text-emerald-600 font-bold underline">
                Fechamento (Borderô)
              </Link>
              , clique em <strong>&quot;Recibo PIX&quot;</strong> no card do colaborador para gerar o PDF detalhado com hash SHA-256, arquivamento automático em nuvem, download/impressão e botão <strong>opcional</strong> para enviar no WhatsApp do trabalhador.
            </li>
            <li>
              <strong>Automação Quinzenal (2ª e Última Sexta às 18:00 BRT)</strong>: O sistema envia automaticamente à diretoria o Relatório Financeiro Quinzenal em PDF Paisagem contendo apenas saldos em aberto e Caixinha em coluna informativa própria — também disponível sob demanda no botão <strong>&quot;Disparar PDF Quinzenal Agora&quot;</strong>.
            </li>
          </ul>
          <div className="p-3 bg-slate-100 rounded-2xl text-[11px] text-slate-700 border border-slate-200">
            <strong>Exemplo Prático:</strong> Na sexta-feira de fechamento, gere o <strong>Excel V6 (5 Abas)</strong> para conferência contábil, emita o <strong>Recibo PIX</strong> para o colaborador que solicitar comprovante impresso ou por WhatsApp e acompanhe na faixa superior o horário do próximo disparo quinzenal automático.
          </div>
        </div>
      ),
    },
    {
      id: 'compras-e-auditoria',
      titulo: '11. Pedidos de Compras (IA) & Relatório de Saúde do Sistema (IA)',
      icone: ShieldCheck,
      descricao: 'Health Score 0–100, detector de duplicados, Caça-Fantasmas, diagnóstico IA e compras por obra',
      conteudo: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
            <li>
              <strong>Aba &quot;Saúde &amp; IA&quot; em Relatórios (<code>/relatorios?aba=saude</code>) &amp; Tela Dedicada (<code>/auditoria</code>)</strong>: Calcula o <strong>Health Score (0 a 100)</strong> em <strong>6 pilares</strong> (Duplicidades de Diárias/Vales, Caça-Fantasmas, Regras &amp; Valores, Idempotência Anti-Duplicidade, Cadastro &amp; PIX e Rastreabilidade WhatsApp).
            </li>
            <li>
              <strong>Detector de Duplicados &amp; Caça-Fantasmas</strong>: Localiza automaticamente <strong>diárias ou vales duplicados</strong> (preservando os metadados mais completos), <strong>datas anômalas</strong> (ex.: registro de meses atrás criado hoje ou data futura), <strong>lançamentos com valor zerado</strong>, <strong>obras órfãs/inativas</strong>, <strong>trabalhadores sem cadastro ativo</strong> e <strong>lotes fantasmas do WhatsApp</strong> sem lançamentos vinculados.
            </li>
            <li>
              <strong>Diagnóstico Executivo IA + Correções Seguras em 1 Clique</strong>: Gera um parecer executivo via IA sobre os principais riscos da empresa ativa, oferece botão de <strong>Lote Seguro</strong> (apenas normalização de nomes e chaves de idempotência) e exibe <strong>Diff Antes × Depois</strong> para cada correção sob aprovação humana (<em>Human-in-the-Loop</em> — descartes usam exclusão lógica segura).
            </li>
            <li>
              <strong>Último Laudo Estável, Cadência Configurável (19:30 Padrão) &amp; Histórico Auditável</strong>: Ao abrir a aba, o último laudo salvo é exibido instantaneamente (data/hora, origem <em>Manual</em> ou <em>Cadência</em>, total de lançamentos/vales/lotes auditados e score). A empresa pode escolher entre <strong>Sob Demanda + 19:30 (Recomendado)</strong>, <strong>Apenas Manual</strong>, <strong>A cada 6h</strong> ou <strong>A cada 12h</strong>, consultando todas as execuções no <strong>Histórico Auditável de Laudos</strong> sem precisar deixar a tela aberta.
            </li>
            <li>
              <strong>Gerador de Pedido de Compras (<code>/compras</code>) &amp; Logística da Obra (<code>/setup</code>)</strong>: Nas empresas com módulo de compras habilitado, o cadastro da obra exige <strong>Alias / Cliente p/ Fornecedores</strong> e <strong>Endereço de Entrega</strong> (CEP, complemento de descarga e contato). Os pedidos agrupados pela IA permitem clicar em <strong>&quot;Copiar só esta categoria&quot;</strong> para enviar direto a cada fornecedor.
            </li>
          </ul>
          <div className="p-3 bg-slate-100 rounded-2xl text-[11px] text-slate-700 border border-slate-200">
            <strong>Exemplo Prático:</strong> Antes de fechar o pagamento da semana em uma Empresa Modo Diarista, abra <strong>Relatórios → Aba &quot;Saúde &amp; IA&quot;</strong>: o último laudo das 19:30 já estará disponível na tela. Clique em <strong>&quot;Executar Varredura&quot;</strong> se acabou de lançar novos apontamentos ou consulte o <strong>Histórico Auditável</strong> para confirmar a evolução do Health Score.
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8">
      {/* Manual Vivo & Guia Rápido */}
      <HelpCenter />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              Central de Conhecimento
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-950 mt-1">Manual de Operação & Ajuda</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Guia completo de uso do Ponto Patrícia (Diária.AI), rotinas de campo, regras da IA e atalhos de fechamento.
          </p>
        </div>

        {/* Link para baixar manual completo */}
        <div className="flex items-center gap-2">
          <Link
            href="/MANUAL_DO_SISTEMA.md"
            target="_blank"
            className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 active:scale-95"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Documento MD</span>
          </Link>
        </div>
      </div>

      {/* Accordion Interativo de Tópicos de Ajuda */}
      <div className="space-y-4">
        {secoes.map((secao) => {
          const Aberto = secaoAberta === secao.id;
          const Icone = secao.icone;

          return (
            <div
              key={secao.id}
              className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden transition-all"
            >
              <button
                onClick={() => setSecaoAberta(Aberto ? '' : secao.id)}
                className="w-full p-6 text-left flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`p-3 rounded-2xl transition-colors ${
                      Aberto ? 'bg-emerald-600 text-white shadow-md shadow-emerald-700/20' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icone className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-black text-slate-950 text-sm md:text-base">{secao.titulo}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{secao.descricao}</p>
                  </div>
                </div>

                <span className="p-2 text-slate-400">
                  {Aberto ? <ChevronDown className="w-5 h-5 text-emerald-600" /> : <ChevronRight className="w-5 h-5" />}
                </span>
              </button>

              {Aberto && (
                <div className="p-6 pt-0 border-t border-slate-100 mt-2 bg-slate-50/40">
                  {secao.conteudo}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Card de Suporte & Super Usuários */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
              SUPORTE MASTER
            </span>
          </div>
          <h3 className="text-base font-black text-white">Precisa de suporte operacional na folha?</h3>
          <p className="text-xs text-slate-400">
            Os Super Administradores (Patrícia Grubel, Daniel Lopes e Joabson Nascimento) possuem acesso total de auditoria e parametrização.
          </p>
        </div>

        <Link
          href="/configuracoes"
          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 text-center shrink-0"
        >
          Ver Controle de Acessos (RBAC)
        </Link>
      </div>
    </div>
  );
}

