# Diário de Bordo & Transição de Contexto (HANDOFF.md)

## Estado Atual
- **Motor Oficial WhatsApp (Baileys Open-Source & Instância Render)**:
  - O sistema opera exclusivamente sob a biblioteca open-source **Baileys** para conexão e automação do WhatsApp.
  - Vantagens arquiteturais: isenção de custos por mensagem (zero taxas da Meta/Cloud API) e suporte nativo a leitura/envio em grupos fechados de canteiro (`@g.us`).
  - O webhook (`src/app/api/webhook/whatsapp/route.ts`) extrai dados periciais nativos do Baileys (`data.key.id`, `data.key.remoteJid`, `data.key.participant`) e mídias de comprovantes (`data.message.imageMessage`).
  - **Instância Dedicada no Render**: Daniel Lopes já possui uma instância dedicada do Baileys/Evolution API ativa no Render (`https://diaria-ai.onrender.com`), garantindo estabilidade e persistência de sessão.
  - **Emparelhamento Nativo via Pairing Code (8 Dígitos)**: Suporte completo para conexão direta por código de telefone (`gerarPairingCodePorTelefone`), resolvendo definitivamente rejeições de QR Code no iOS (iPhone).
- **Prevenção de Conflito Multi-Admin (Patrícia Grubel & Daniel Lopes)**:
  - Como agora ambos os administradores recebem notificações do sistema, foi implementada a trava de confirmação prévia:
  - Se um lote ou lançamento financeiro já foi confirmado ou validado por um dos gestores, qualquer tentativa de revalidação ou reedição exibe o diálogo de guarda:
    *"O registro já foi confirmado por [NOME DO GESTOR]. Quer continuar e alterar?"*
- **Regra de Notificação Obrigatória para Patrícia Grubel**:
  - **REGRA CRÍTICA INVIOLÁVEL**: Sempre que qualquer registro (lote ou lançamento financeiro) for editado ou alterado por qualquer usuário (Daniel Lopes ou outro operador), a Administradora Central **Patrícia Grubel** (`5511978543369`) recebe imediatamente uma notificação exclusiva no WhatsApp contendo:
    - Nome do colaborador e Canteiro/Obra;
    - Quem realizou a alteração (`autorEdicao`);
    - Quem havia aprovado antes;
    - Motivo e descritivo do que foi alterado;
    - Ajuste de valores (Antes vs Depois) e data/hora exata.
- **Edição em Linha no Borderô & Validações**:
  - Novo endpoint `POST /api/lancamentos/editar` permitindo ajustar fração do dia, valor monetário e motivo de qualquer lançamento confirmado.
  - Endpoints `POST /api/obras` e `POST /api/funcionarios` criados com cliente administrativo de backend seguro (`supabaseAdmin`), garantindo sincronização e persistência mesmo com RLS ativo.
  - Semente inicial de canteiros e colaboradores cadastrada no banco remoto.
- **Regras Operacionais de Diárias Parametrizáveis**:
  - **Dia de Viagem**: R$ 120,00 para passageiros da equipe; diária integral para o motorista que conduz o veículo.
  - **Dia de Chuva**: R$ 120,00 quando as condições meteorológicas inviabilizam o trabalho.
  - **Dia Parado**: R$ 120,00 quando o condomínio barra o acesso à obra ou há impedimento por terceiros.
  - **Configurável**: Todos os valores são gerenciáveis dinamicamente pela Administradora na tela de Configurações (`/configuracoes`) via tabela `parametros_sistema`.
- **Notificações Espelhadas (Patrícia Grubel & Daniel Lopes)**:
  - Todo alerta de novo apontamento, lote pendente, aprovação e fechamento é duplicado simultaneamente para o WhatsApp da Patrícia (`5511978543369`) e do Daniel (`5511988139833`).
- **Regra Central de Negócio - Human-in-the-Loop & Gestão de Vales**:
  - Toda decisão de abatimento financeiro é 100% humana.
  - Vales registrados no canteiro **não são abatidos compulsoriamente**. Na tela de Borderô, a Administradora (Patrícia Grubel) tem total liberdade para marcar ou desmarcar cada vale.
  - Vales desmarcados **não são liquidados** e **permanecem ativos no banco de dados como saldo a dever** para as semanas subsequentes até autorização expressa de liquidação.
- **Configuração Cloudflare R2 & Date Stamp Pericial**:
  - Armazenamento em bucket `diaria-ai` com endpoint S3 compatível.
  - Motor `sharp` aplicando carimbo indelével em fotos de canteiro (Obra, Etapa, Data/Hora de Brasília, Clima em tempo real via OpenWeather, GPS e hash SHA-256).
- **Exportações XLS & Relatórios**:
  - Biblioteca `xlsx` integrada com relatórios Semanal, Quinzenal e Mensal.
  - Disparos automáticos de resumos executivos e extratos individuais via WhatsApp.
- **Cadastro Expresso de Colaboradores**:
  - Na tela de Setup, apenas Nome e Chave PIX são obrigatórios.
- **Documentação & Ajuda**:
  - `MANUAL_DO_SISTEMA.md` completo e tela interativa `/ajuda` no menu lateral.
- **Build de Produção**: 100% aprovado (`npm run build`).

## Regra Permanente de Documentação (OBRIGATÓRIA)
- **Sempre atualizar Manuais, Guias, Ajuda Contextual e Tela de Ajuda**: A cada nova funcionalidade, nova rota, correção relevante ou mudança de fluxo, é obrigatório atualizar:
  1. `src/components/ContextualHelp.tsx` (**Ajuda Contextual por Tela** — botão `? Ajuda desta tela` presente em todas as rotas com funções e exemplo prático daquela rota específica);
  2. `MANUAL_DO_SISTEMA.md` e `src/app/ajuda/page.tsx`;
  3. Este `HANDOFF.md`.
- **Padrão White-Label / Genérico**: Os manuais, guias e ajudas voltados ao usuário final devem usar linguagem **genérica** (ex.: *Empresa Modo Diarista*, *Empresa Modo Empreita*, *Obra Residencial*, *Encarregado*), **sem citar nomes reais de empresas ou clientes específicos**, e sempre incluir **pequenos exemplos práticos de uso**.

## Últimas Ações (Ciclo Atual)
- **Arquitetura Multi-Empresa Real (Jhonton + Intermack) & Diário de Obra Expresso (`/diario-obra`)**:
  - **Camada Multi-Tenant (`src/lib/tenant.ts`)**: Suporte nativo a duas empresas isoladas por `tenant_id`:
    - **Jhonton** (`...0001`, Modo `DIARISTA`): fluxo completo de diárias, vales, borderô e PIX.
    - **Intermack** (`...0002`, Modo `EMPREITA`): acesso **exclusivo para Patrícia Grubel e Daniel Lopes**, focado em controle de efetivo do empreiteiro (**Dia Inteiro / Meio Dia**, sem `0 Falta` e sem valores em `R$`) e Diário de Obra.
  - **Seletor de Empresa na Sidebar (`src/components/Sidebar.tsx`)**: Alternância instantânea Jhonton ↔ Intermack visível apenas para Patrícia e Daniel, com identidade visual distinta (Esmeralda vs Índigo) e menu adaptado ao modo da empresa.
  - **Validações Adaptadas (`src/app/validacoes/page.tsx`)**: No modo Intermack, exibe apenas `Dia Inteiro` / `Meio Dia` e contabiliza em **Homens-Dia** (zero valores monetários).
  - **Módulo Diário de Obra (`/diario-obra` & `src/app/api/diario-obra/route.ts`)**: Registro rápido de Obra, Data, Ambiente (`Interno / Condomínio` na Intermack vs `Externo / Clima` na Jhonton), Empreiteiro, Efetivo Presente, upload de **2 a 3 fotos**, botão **"Refinar com IA"** (Gemini), **Relatório PDF Timbrado** + **Envio Direto de PDF (Base64) via WhatsApp** (`src/lib/pdfDiario.ts`).
  - **Configuração Geral Hub (`/config-geral` & `src/app/api/config-geral/route.ts`)**: Exclusiva para Patrícia e Daniel; gerencia dados compartilhados e mapeia **1 conta WhatsApp → N grupos** (com puxador automático de grupos do Baileys e roteamento automático de empresa/obra no webhook).
  - **Propostas, Etapas & Medição com IA (`/medicoes` & `src/app/api/medicoes/route.ts`)**: Upload de proposta (PDF, imagem ou texto) com extração automática de etapas pelo Gemini + botão **"Estimar Avanço com IA"** cruzando Diários de Obra e Homens-Dia em linguagem simples (com ajuste manual Human-in-the-Loop).
  - **Restauração de Descartados (`GET/POST /api/pendentes/descartar`)**: Suporte a consulta de registros `DESCARTADO` e `modo: 'RESTAURAR'`.
- **Validação por Mensagem Enviada, Exclusão Auditada (Soft Delete) e Ponto de Corte Operacional**:
  - **Ponto de Corte (`POST /api/pendentes/corte`)**: Consolida todos os lotes (`ponto_lote`) e lançamentos (`lancamentos_financeiros`) pendentes até o final do dia anterior como `VALIDADO` e persiste `data_corte_operacional` em `parametros_sistema`.
  - **Proteção no Webhook (`src/app/api/webhook/whatsapp/route.ts`)**: Mensagens com timestamp anterior ou igual à `data_corte_operacional` são ignoradas automaticamente; barreira de duplicidade ignora registros `DESCARTADO`.
  - **Agrupamento por Mensagem (`GET /api/pendentes` & `src/app/validacoes/page.tsx`)**: A fila de validações foi evoluída de lista única para **cards independentes por mensagem enviada**, exibindo badge de horário exato (ex.: `06:37`, `08:40`), obra, remetente, visualizador expansível do texto original do WhatsApp e aprovação individual por mensagem.
  - **Exclusão Auditada (`POST /api/pendentes/descartar`)**: Suporte a exclusão de registro individual (`modo: 'ITEM'`) ou da mensagem inteira (`modo: 'LOTE'`) via Soft Delete (`DESCARTADO`), descartando automaticamente o lote caso todos os seus itens sejam removidos.
  - **Documentação Atualizada**: `MANUAL_DO_SISTEMA.md`, `src/app/ajuda/page.tsx` e este `HANDOFF.md`.
- **Central de Mensageria & Solicitação de Features/Relatórios (`/mensageria`)**:
  - Restrição de Acesso Exclusivo: Disponível neste primeiro momento apenas para **Patrícia Grubel** e **Daniel Lopes** (oculto no menu lateral e com guarda de tela contra outros usuários).
  - Implementado chat interativo no frontend (`src/app/mensageria/page.tsx`) com a IA Gemini (`gemini-3.5-flash-lite`).
  - A IA atua como arquiteto de software, alinhando necessidades com Patrícia Grubel e gerando automaticamente um **Prompt Técnico para a IDE**.
  - O prompt conta com botão de cópia de 1 clique (`Copiar Prompt para a IDE`).
  - Alerta automático enviado para o WhatsApp de Daniel Lopes (`5511988139833`) com o resumo e link da solicitação.
  - Implementada a ação de **"Fechar Pedido"** para Daniel Lopes concluir e arquivar as demandas entregues.
  - Armazenamento resiliente e persistente implementado em `src/services/mensageriaStorage.ts` via chaves de metadados no Supabase.
- **Rastreabilidade e Carimbo Pericial de Apontamentos (TimeStamp & SHA-256)**:
  - Captura do telefone remetente, ID do grupo do WhatsApp e carimbo temporal oficial de Brasília com hash SHA-256 na criação de cada lote em `src/app/api/webhook/whatsapp/route.ts`.
  - Exibição do remetente e data/hora do disparo na tela de Validações Pendentes (`src/app/validacoes/page.tsx`).
- **Ticket de Marcação de Ponto sem Valores para Grupos de WhatsApp**:
  - Geração de ticket de ponto (`src/services/ticketPonto.ts`) sem exibição de valores em R$, com carimbo pericial e hash SHA-256, disparado de volta para o grupo de campo após aprovação de Patrícia.
- **Sistema de Múltiplos Apelidos de Obras e Funcionários**:
  - Interface de cadastro e gestão de apelidos na tela de Setup (`/setup`).
  - Injeção dinâmica de apelidos nas diretrizes do modelo de NLP Gemini (`src/lib/gemini.ts`), garantindo reconhecimento instantâneo de gírias e apelidos usuais de canteiro.
  - Confirmação de segurança da obra na tela de validação.
- **Fechamento Quinzenal com Rotina de Sexta-feira**:
  - Adicionado badge "Quinzenal" na navegação e ajustada a semântica do borderô para pagamento quinzenal com fechamento e conferência operacional semanal.
- **Atualização de Modelos Gemini**:
  - Migração de modelos descontinuados para o modelo ativo e rápido `gemini-3.5-flash-lite`.
- **Documentação & Navegação**:
  - Atualizados `Sidebar.tsx`, `MANUAL_DO_SISTEMA.md`, tela interativa `/ajuda` e este `HANDOFF.md`.
