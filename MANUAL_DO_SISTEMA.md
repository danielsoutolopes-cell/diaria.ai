# 📘 Manual Oficial do Sistema - Ponto Patrícia (Diária.AI)
*Micro-ERP de Campo para Obras & Piscinas com IA Human-in-the-Loop*

---

## 🏗️ 1. Visão Geral da Solução (Arquitetura Multi-Empresa)
O **Diária.AI** opera em arquitetura **Multi-Empresa (`tenant_id`)** com isolamento total de dados, permitindo gerir operações com perfis diferentes no mesmo painel:
- **Perfil Diarista / Folha Própria (Ex.: Empresa de Obras de Campo)**: Controle completo de diárias em R$, vales pessoais, **Fechamento & Pagamentos (PIX)**, **Caixa de Campo & Reembolsos** e relatórios financeiros.
- **Perfil Empreita / Controle de Efetivo (Ex.: Empresa de Reformas Internas)**: Focado em obras executadas por empreiteiros, controlando **efetivo presente (Dia Inteiro ou Meio Dia, sem falta e sem valores em R$)**, **Diário de Obra (2 a 3 fotos)** e **Propostas & Medição Assistida por IA**.

### 💡 Exemplos Práticos de Uso das Principais Funções
1. **Pré-Validação no Assistente IA (com "De Acordo"):**
   - *Exemplo:* Digite *"Vale de R$ 100,00 para o João, Obra Residencial, hoje"*. A IA confere se faltou obra, data ou valor; quando tudo estiver completo, exibe o rascunho e só envia para a fila de Validação após o clique em **De Acordo**.
2. **Validação por Mensagem Enviada + Exclusão Auditada:**
   - *Exemplo:* Chegaram mensagens às `06:37` e às `08:40`. Cada uma aparece em seu próprio card com o texto original expansível. Se um nome veio errado, clique na lixeira (Soft Delete `DESCARTADO`) e aprove apenas os registros corretos.
3. **Caixa de Campo & Reembolsos (Separado do Salário):**
   - *Exemplo:* A empresa envia R$ 400,00 via PIX para o encarregado comprar materiais; ele sobe 4 notinhas somando R$ 289,18 (lidas automaticamente pela IA). O sistema calcula **Troco em Mãos: R$ 110,82** sem descontar da diária dele. Na hora de encerrar, você escolhe **Devolver Troco**, **Pagar Reembolso** ou **Levar p/ Fechamento**.
4. **Diário de Obra (`/diario-obra`) & Medição IA (`/medicoes`):**
   - *Exemplo (Empresa Modo Empreita):* Suba o PDF da proposta da reforma em `/medicoes` para a IA extrair as etapas. No `/diario-obra`, selecione a **Obra** no dropdown, mantenha **Condomínio / Acesso** separado de **Ocorrência / Impedimento** (ex.: *Falta de Material do Cliente* só aparece se aplicável), escolha o **Empreiteiro / Encarregado** e a **Etapa / Serviço** (*Hidráulica*, *Gesso*, etc.), adicione os **Funcionários** da equipe buscando por nome oficial ou apelido (com CPF/RG) e gere o relatório filtrado por encarregado em WhatsApp, PDF ou CSV. Empresas em *Modo Diarista* mantêm o fluxo direto sem subempreita.
5. **Relatórios 4, 5 e 6 com Envio Direto no WhatsApp (`PDF Zap`):**
   - *Exemplo:* No Espelho do Ponto (Relatório 4) ou no Calendário Visual (Relatório 5), escolha o destinatário no seletor do banco e clique em **PDF Zap**. Administradores recebem com valores em `R$`; encarregados e equipe recebem versão operacional **sem valores**.

O **Diária.AI** foi arquitetado para resolver as maiores dores de gestão de campo na construção civil e reformas:
1. **Descentralização de Apontamentos**: Fim das anotações em papel molhado, cadernos rasurados ou mensagens perdidas no WhatsApp.
2. **Controle Rigoroso de Vales & Saldos Devedores (Decisão 100% Humana)**:
   - Cada vale solicitado no canteiro é registrado com foto do recibo físico e entra como pendência.
   - **O vale NÃO é descontado compulsoriamente ou de forma cega pela IA.**
   - A Administradora (Patrícia) decide no Borderô se desconta naquele pagamento ou se o colaborador precisa receber o valor cheio.
   - **Se o vale for desmarcado pela administradora, ele NÃO é liquidado**: o sistema preserva o lançamento no banco de dados e ele **continua como saldo a dever** para os fechamentos futuros até que haja autorização explícita de abatimento.
3. **Auditoria Fotográfica com Prova Temporal (Date Stamp)**: Registro de evolução de obra com carimbo indelével contendo obra, data/hora oficial de Brasília, coordenadas GPS, clima em tempo real e hash criptográfico SHA-256.
4. **Fechamento de Folha em 1 Clique (Borderô com PIX Dinâmico)**: Geração instantânea do payload PIX Copia & Cola e QR Code para pagamento de diárias parciais ou integrais na sexta-feira.

---

## 📱 2. Instalação do PWA & Login por Biometria

### 2.1 Como instalar o Aplicativo no Celular (PWA)
O sistema é uma **Aplicação Web Progressiva (PWA)** e não precisa ser baixado da Play Store ou App Store:
- **No iPhone (iOS / Safari)**:
  1. Acesse o endereço do sistema no Safari.
  2. Toque no ícone de **Compartilhar** (quadrado com seta para cima).
  3. Role e toque em **"Adicionar à Tela de Início"**.
- **No Android (Chrome)**:
  1. Acesse pelo navegador Chrome.
  2. Toque nos **3 pontinhos** do canto superior ou clique no banner **"Instalar Aplicativo"**.
  3. O ícone do **Ponto Patrícia** aparecerá na tela do celular como um aplicativo nativo.

### 2.2 Autenticação por Biometria (Face ID / Digital)
- Na tela de login, após o primeiro acesso com o celular autorizado e senha, clique em **"Acessar com Biometria"**.
- O sistema utiliza a tecnologia nativa **WebAuthn / Passkeys** do aparelho, permitindo desbloqueio instantâneo sem precisar redigitar a senha.

---

## 💬 3. O Bot de WhatsApp (Baileys) e o Terminal de IA (NLP)

### 3.1 Motor Oficial Baileys & Conexão por QR Code
O sistema utiliza a biblioteca open-source **Baileys** como motor oficial e exclusivo de integração com o WhatsApp:
- **Zero Custo por Conversa**: Não depende da API paga do WhatsApp Cloud/Meta, nem exige aprovação prévia de templates.
- **Suporte Nativo a Grupos de Canteiro (`@g.us`)**: O Baileys lê mensagens e mídias de grupos fechados de obras e canteiros.
- **Emparelhamento Direto**:
  1. Acesse a aba **Configuração do Bot (WhatsApp)** (`/whatsapp`).
  2. O sistema gera o QR Code do Baileys para leitura direta.
  3. No aparelho com o WhatsApp da empresa ou da Patrícia, vá em **Aparelhos Conectados** e aponte a câmera.
  4. A sessão sincroniza os grupos ativos, permitindo marcar quais canteiros serão monitorados.

### 3.2 Interceptação Pericial e Mídias no Baileys
- **Estrutura das Mensagens**: O Baileys intercepta os objetos nativos `data.key.id`, `data.key.remoteJid` (grupo da obra) e `data.key.participant` (telefone remetente pericial).
- **Recibos de Vales (`imageMessage`)**: Quando o encarregado envia foto de um recibo no grupo, o Baileys captura os bytes JPEG e envia automaticamente ao Cloudflare R2 com hash criptográfico SHA-256.

### 3.3 Como Enviar Mensagens de Campo (Linguagem Natural)
O encarregado ou mestre de obras não precisa preencher planilhas. Basta mandar mensagens naturais no grupo da obra:

- **Exemplo de Ponto Coletivo**:
  > *"Hoje na Obra Alphaville: Tião trabalhou o dia todo, Zé Pedreiro meio dia e o Maranhão faltou."*
  - **O que a IA faz**: Identifica a obra, calcula 1x diária para Tião, 0.5x diária para Zé, registra falta para Maranhão e define status como **PENDENTE**.

- **Exemplo de Vale / Adiantamento**:
  > *"Manda 100 de vale pro Tião pegar material no depósito."*
  - Se acompanhado de foto, o sistema intercepta a imagem, envia para o Cloudflare R2 com link permanente e cria o registro com a foto anexada.

### 3.3 Regras de Diárias por Canteiro & Exceções Automáticas
O robô interpreta automaticamente as situações de canteiro e aplica a precificação de forma inteligente:
- **Diárias Flexíveis por Obra / Canteiro (Tabela Obra x Trabalhador)**:
  - O sistema suporta remunerações variáveis por local. Exemplo: um mesmo colaborador recebe **R$ 220,00** na obra *"Quase Tudo"* e **R$ 200,00** na obra *"Jabaquara"*.
  - A IA detecta a obra citada na mensagem, cruza com a tabela de precificação do colaborador naquele canteiro e calcula a remuneração exata sem exigir retrabalho manual.
- **Dia de Viagem**: R$ 120,00 para os passageiros da equipe. Se for indicado quem dirigiu (*motorista*), ele recebe a **diária integral**.
- **Dia de Chuva**: R$ 120,00 quando o tempo impede os serviços de alvenaria ou piscina.
- **Dia Parado (Sem Acesso)**: R$ 120,00 quando a portaria do condomínio barra a entrada ou há impedimentos externos.
- **Meio Período (0.5x)**: Aplicação automática de metade da diária correspondente ao canteiro.
- **Valores Editáveis**: Todos esses valores podem ser reajustados pela Administradora na tela de **Configurações do Sistema**.

### 3.4 Gestão de Reembolsos de Despesas de Campo (Alinhamento Patrícia x Joabson)
- **Zero Poluição de WhatsApp**: Quando o Joabson ou encarregado envia notas de combustível, pedágio, alimentação ou materiais no grupo:
  - O bot **permanece 100% em silêncio no grupo** da obra.
  - O bot **NÃO envia mensagens para o Joabson** (WhatsApp dele continua limpo e sem automações).
  - O recibo é armazenado com segurança no Cloudflare R2 e registrado como `PENDENTE_ANALISE`.
- **Governança Centrada na Patrícia**:
  - Apenas a Patrícia Grubel conversa diretamente com o Joabson para aprovar ou rejeitar a despesa.
  - Daniel Lopes acessa o sistema apenas como suporte técnico e apoio operacional à Patrícia.
- **Liquidação Flexível (Data Livre & Pagamento Parcial/Total)**:
  - Reembolsos não ficam presos à quinzena do borderô de diárias. Podem ser pagos a qualquer momento via PIX avulso.
  - **Suporte a Abatimento Parcial**: Se o valor aprovado for R$ 600,00 e for pago R$ 350,00, o sistema registra a baixa parcial e mantém R$ 250,00 pendentes até a quitação total.

### 3.5 Sigilo Financeiro & Emissão de Tickets Bilaterais
- **Valores Monetários em R$ (Exclusividade Daniel e Patrícia)**:
  - **Ninguém além de Daniel Lopes e Patrícia Grubel visualiza valores em R$**.
- **Comprovante Operacional do Encarregado (Sem Valores)**:
  - O remetente do ponto recebe no privado dele uma confirmação contendo apenas a lista de nomes e turnos (Integral/Meio/Chuva) e a quantidade de notas anexadas, garantindo sigilo absoluto dos números da empresa.
- **Ticket Executivo para Patrícia e Daniel**:
  - Ambos recebem no WhatsApp privado o resumo financeiro completo com valores em R$ detalhados e o link mágico para aprovação em 1 clique.

### 3.4 Terminal de IA (Dashboard)
Dentro do painel web, você conta com um chat interno que executa as mesmas regras de inteligência artificial. Digite qualquer comando e o robô interpreta e organiza os lançamentos automaticamente.

---

## 🛡️ 4. Regra Human-in-the-Loop & Governança Multi-Admin (Patrícia & Daniel)
**Regra Fundamental de Engenharia**: A IA nunca lança dinheiro como pago diretamente.

1. Todas as mensagens recebidas via WhatsApp ou Terminal de IA entram na tela **Validações Pendentes** (`/validacoes`) com status `PENDENTE`.
2. **Validação Dividida por Mensagem Enviada (1 Card = 1 Mensagem)**:
   - Cada mensagem recebida no WhatsApp gera um card independente identificado pelo **horário exato de envio** (ex.: `06:37`, `08:40`), data, obra e remetente.
   - É possível expandir o **texto original enviado no WhatsApp** diretamente no card para conferência humana antes de aprovar.
   - Cada card possui seu próprio subtotal e botão **"Aprovar Mensagem (HH:MM)"**, evitando misturar apontamentos de horários diferentes.
3. **Exclusão Auditada (Soft Delete) na Validação**:
   - Cada colaborador ou vale dentro de uma mensagem possui botão de **Excluir** (lixeira) para remover eventuais registros incorretos, duplicados ou extraídos de ruído no grupo.
   - Também é possível **Descartar a Mensagem Inteira** pelo botão no cabeçalho do card.
   - Os itens excluídos são marcados como `DESCARTADO` (soft delete) com autoria e carimbo de data/hora, saindo imediatamente da fila e do Borderô sem perder a trilha de auditoria e sem bloquear novos apontamentos do mesmo colaborador no dia.
4. **Ponto de Corte Operacional ("Corte até Ontem")**:
   - Permite consolidar em 1 clique todas as mensagens e lançamentos pendentes até o final do dia anterior como `VALIDADO`, mantendo a fila limpa apenas com as mensagens novas.
   - A `data_corte_operacional` fica salva em `parametros_sistema`, impedindo que reconexões do Baileys/WhatsApp reintroduzam mensagens antigas na fila.
5. **Prevenção de Conflito Multi-Admin ("Já Confirmado")**:
   - Como agora dois gestores (Patrícia Grubel e Daniel Lopes) recebem os avisos e têm acesso ao sistema, se um lote já foi validado anteriormente por um deles, qualquer tentativa de revalidação ou alteração exibe uma tela de guarda:
     > *"O registro já foi confirmado por [NOME]. Quer continuar e alterar?"*
6. **Alerta Obrigatório & Exclusivo para Patrícia Grubel**:
   - **REGRA CRÍTICA INVIOLÁVEL**: Sempre que qualquer registro já confirmado for editado ou alterado por qualquer usuário (seja Daniel Lopes ou outro operador), a Administradora Central **Patrícia Grubel** recebe imediatamente uma notificação exclusiva no WhatsApp contendo o autor da edição, colaborador, canteiro, motivo da alteração e o ajuste de valor (antes vs depois).
7. **Memória de Campo (IA) por Remetente**:
   - Na faixa discreta **Memória de Campo (IA)** no topo da tela `/validacoes`, o sistema registra automaticamente apelidos, hábitos de pontuação/quebra de linha e a obra padrão de cada remetente (a partir da 2ª passagem automática ou de correções humanas em diárias e vales).
   - *Exemplo Prático*: Se um encarregado costuma abreviar um nome ou omitir o canteiro na mensagem, após a primeira correção da administração, a IA aplica o mapeamento automaticamente nos envios seguintes. Você pode expandir **Ver / Ajustar** a qualquer momento para editar ou excluir uma regra.
8. Ao clicar em **"Aprovar Mensagem"**, os lançamentos daquela mensagem passam para o status `VALIDADO` e ficam liberados para pagamento no Borderô.

---

## 💵 5. Fechamento de Folha & Borderô (Sexta VIP)

Na tela de **Fechamento (Borderô)**:
1. O sistema agrupa todos os lançamentos validados por colaborador.
2. **Cálculo Sob Demanda (Human-in-the-Loop)**:
   $$\text{Líquido a Pagar} = \sum (\text{Diárias Marcadas}) - \sum (\text{Vales Marcados})$$
3. **Controles de Seleção Rápida & Pagar por Obra**:
   - **Desmarcar Todos / Marcar Todos (Global)**: No topo do Borderô, desmarque todos os lançamentos de todos os colaboradores de uma só vez (zerando o total a pagar para `R$ 0,00`) ou marque toda a folha aberta novamente em 1 clique.
   - **Marcar Todos / Desmarcar (Por Colaborador)**: Dentro da janela/card de cada colaborador, os botões **Marcar Todos** e **Desmarcar** atuam exclusivamente naquele colaborador, sem alterar a seleção dos demais.
   - **Pagar por Obra**: Escolha uma obra no seletor **Pagar por Obra** para desmarcar as demais e manter marcadas **somente as diárias daquela obra**. Quando algum colaborador da obra selecionada possuir vales em aberto, o sistema exibe um aviso discreto (no topo e no card do colaborador) para conferência humana antes do pagamento.
   - *Exemplo Prático*: Em uma Empresa Modo Diarista com duas frentes ativas (*Obra Residencial* e *Obra Piscina*), selecione *Obra Piscina* em **Pagar por Obra** para pagar apenas aquela frente hoje; se um colaborador tiver um vale de R$ 100,00 em aberto, o aviso discreto lembra a administradora de decidir manualmente se deseja marcá-lo ou postergá-lo.
4. **Liquidação Seletiva e Manutenção do Saldo a Dever**:
   - **Toda decisão final de desconto é humana**: se a administradora desmarcar a caixa de um vale, ele **NÃO** é descontado da folha atual e **NÃO** é liquidado.
   - O vale desmarcado permanece gravado com segurança no banco de dados e **continua ativo como saldo a dever** para os fechamentos futuros.
   - Isso permite, por exemplo, que a empresa parcele o desconto de um vale alto ou poupe o trabalhador em semanas de poucas diárias.
5. **PIX Dinâmico com 1 Clique**:
   - Clique em **"Copiar PIX Copia e Cola"** para colar direto no aplicativo do banco.
   - Ou clique em **"Ver QR Code PIX"** para ler o código na tela do computador com o celular do banco.
   - O payload PIX contém a chave do trabalhador, o valor exato calculado e a identificação do lote/obra.
6. **Recibos Anexos (Lightbox)**:
   - Na coluna **"Anexo/Recibo"**, clique no ícone para ampliar a foto do comprovante do vale e baixar o arquivo com o nome oficial `recibo-[nome]-[data].jpg`.
7. Ao clicar em **"Liquidar e Encerrar Semana"**, os itens marcados passam para `LIQUIDADO`.

---

## 📸 6. Gestão Fotográfica de Obras & Date Stamp Pericial

Ao enviar fotos de canteiro de obras (via WhatsApp ou tela de Obras):
1. O motor **Sharp** aplica automaticamente uma tarja inferior de auditoria na foto:
   - **Nome da Obra e Etapa**: Ex: *RESIDENCIAL ALPHAVILLE | PISCINA*.
   - **Data e Hora de Brasília**: Registrado com precisão de segundos.
   - **Clima em Tempo Real**: Captura a temperatura e condição do céu via OpenWeather.
   - **Assinatura & GPS**: Coordenadas geográficas e nome do encarregado.
2. A foto recebe um **Hash Criptográfico SHA-256** garantindo autenticidade jurídica pericial (impossível fraudar a data sem corromper o hash).
3. As fotos original e carimbada ficam salvas no **Cloudflare R2** para consulta a qualquer momento.

---

## 📊 7. Relatórios & Exportações para Excel (.xlsx)

Na aba **Relatórios & Exportações**:
- **Filtros de Período**: Selecione entre **Semanal**, **Quinzenal** e **Mensal**.
- **3 Relatórios Integrados**:
  1. **Borderô Consolidado**: Resumo por trabalhador, obra, diárias, abatimentos, líquido e chave PIX.
  2. **Custo por Canteiro**: Apuração do valor gasto em cada obra civil ou piscina.
  3. **Extrato Analítico (Auditoria)**: Histórico detalhado linha a linha com frações e datas.
- **Exportação Excel (.xlsx)**:
  - Botão **"Exportar Excel"** disponível no topo para abrir nativamente no Microsoft Excel, Google Planilhas ou LibreOffice.
- **Disparos Automáticos no WhatsApp**:
  - **Para a Diretoria**: Clique no botão superior verde para enviar o resumo financeiro executivo consolidado.
  - **Para o Trabalhador**: Clique no ícone de WhatsApp em qualquer linha para mandar o comprovante individual de fechamento para o celular do colaborador.

---

## 👥 8. Cadastro Expresso de Colaboradores e Obras (Setup) & Múltiplos Apelidos

Na aba **Lançamentos em Lote (Setup)**:
- **Cadastro de Colaborador (Rápido)**:
  - **Campos Obrigatórios**: Apenas **Nome** e **Chave PIX**.
  - **Campos Automáticos**: Valor da diária (assume R$ 150 para Piscina ou R$ 180 para Civil) e Canteiro Vinculado.
  - **Mapeamento de Apelidos**: Cadastre apelidos de campo (ex: *"Wender 22"*, *"Zé baiano"*, *"Mauro obra"*, *"Peu"*). A IA cruza esses apelidos nas mensagens do WhatsApp e localiza o colaborador correspondente com precisão.
- **Cadastro e Apelidos de Obras**:
  - Defina o nome oficial da obra (ex: *"Bahia"*), tipo de canteiro e adicione apelidos usuais (ex: *"Piscina porto seguro"*, *"Porto Seguro"*, *"Quase Tudo"*).
- **Confirmação de Segurança**: Quando a Patrícia abre o link de validação, o sistema confirma explicitamente a obra vinculada para garantir total acurácia contábil.

---

## 💬 9. Central de Mensageria & Solicitação de Relatórios (IA)

> [!NOTE]
> **Acesso Exclusivo**: Neste primeiro momento, a Central de Mensageria está habilitada exclusivamente para a Administradora Central (**Patrícia Grubel**) e para o Desenvolvedor/Arquiteto (**Daniel Lopes**). Demais perfis não visualizam o atalho nem acessam a tela.

Na aba **Mensageria & Pedidos IA** (`/mensageria`):
1. **Chat com o Arquiteto de Software Gemini**:
   - A Patrícia descreve em português simples qualquer necessidade de relatório, gráfico ou melhoria no sistema.
   - A IA conversa de forma humanizada, esclarecendo colunas necessárias, formatos de exportação, agrupamentos e periodicidade.
2. **Geração Instantânea do Prompt Técnico para a IDE**:
   - Assim que o escopo fica claro, a IA compila um **Prompt Técnico Estruturado** detalhando requisitos, rotas, tipos TypeScript e componentes a serem alterados.
   - O prompt fica disponível na tela com botão de **"Copiar Prompt para a IDE"**.
3. **Notificação ao Desenvolvedor (Daniel Lopes)**:
   - Um alerta é disparado automaticamente para o WhatsApp pessoal de **Daniel Lopes** (`5511988139833`) com o resumo da solicitação e o link direto para acesso.
4. **Fechamento do Pedido pelo Desenvolvedor**:
   - Daniel abre o pedido, cola o prompt no Antigravity/Cursor para implementação e clica em **"Fechar Pedido"** após a entrega, registrando a data e o responsável pela conclusão.

---

## 🔒 10. Níveis de Acesso e Perfis (RBAC)

1. **MASTER (Patrícia Grubel, Daniel Lopes, Joabson Nascimento)**:
   - Acesso irrestrito a todas as obras, aprovação de pagamentos, liquidação de borderô, cadastro de usuários e configurações globais.
2. **CONSULTA (Sócios / Engenheiros / Contabilidade)**:
   - Apenas visualização de relatórios, gráficos de caixa e diário fotográfico, sem permissão para aprovar ou liquidar pagamentos.
3. **APONTAMENTO (Encarregados de Campo)**:
   - Permissão estrita para envio de mensagens via WhatsApp e registro de fotos no canteiro em que está alocado.

---

## ❓ 11. Perguntas Frequentes & Suporte Rápido

- **E se a internet cair no canteiro?**
  - As mensagens do WhatsApp ficam enfileiradas e a IA processa assim que a conexão retornar.
- **Posso pagar um trabalhador com diária diferente do padrão?**
  - Sim! No cadastro do colaborador você pode customizar o valor específico da diária dele, ou ajustar pontualmente na tela de validação.
- **O que acontece se eu desmarcar um vale no Borderô?**
  - O sistema abate apenas os itens marcados. O item desmarcado continua ativo no banco de dados e aparecerá automaticamente na folha da próxima semana.

---

## 💼 12. Caixinha de Campo Unificado (`/caixinha`) & Reinício Pós-Quitação

### 12.1 Caixinha de Campo & Reembolsos Integrados (`/caixinha`)
- **Entrada Única no Menu**: O módulo **Caixinha de Campo** reúne em uma única tela a conta corrente de verbas de obra e a seção integrada de **Reembolsos & Adiantamentos** (alternável entre *Visão Completa*, *Caixinha* e *Reembolsos*).
- **Portador do Caixinha × Emissor do PIX + Data e Hora (`HH:MM`)**: No formulário de novo lançamento, selecione separadamente o **Colaborador / Portador do Caixinha** (quem recebeu ou prestou contas) e o **Emissor / Quem Enviou o PIX** (já vem com os emissores padrão ativos e aceita cadastrar, ativar/desativar ou remover novos emissores diretamente no `/setup`, oculto automaticamente em lançamentos de Nota/Despesa e sem alterar o fluxo de vales), além da **Data** e **Hora exata (`HH:MM`)**.
- **OCR com Fallback Inteligente para Comprovantes Cortados**: Ao usar **Ler Nota / PIX com IA** ou enviar o comprovante pelo WhatsApp, o sistema extrai pagador e data/hora direto do comprovante. Quando o print vier cortado (ex.: sem o pagador ou sem o campo "Quando" completo), preenche automaticamente com o remetente/timestamp do WhatsApp (ou horário da barra de status da tela) e exibe a origem (**OCR Comprovante** vs. **Inferido via WhatsApp**) para conferência e edição rápida antes de salvar.
- **Unificação de Apelidos & Proteção Anti-Duplicidade**: Caso um mesmo encarregado envie comprovantes usando apelidos diferentes no WhatsApp, o sistema consolida automaticamente em um único card canônico e impede sobreposição entre consolidados pré-implantação e notas detalhadas.
- **Separação da Folha de Pagamento**: O saldo de troco em mãos fica em coluna própria e **nunca é descontado automaticamente** das diárias. A administração decide manualmente quando registrar devolução ou transferir para o fechamento.
- **Exemplo Prático**: Um gestor envia R$ 700,00 em suprimentos PIX para compras de canteiro (ex.: `PIX de Gestor A` em `23/11/2026 às 14:32`) e o encarregado presta contas de R$ 544,62 em notas fiscais itemizadas. O extrato exibe quem enviou cada PIX, o horário completo (`dd/mm/aaaa às HH:mm`) e o saldo **Troco em Mãos: R$ 155,38**.

### 12.2 Reinício de Contagem Pós-Quitação & Separação de Obras no Mesmo Dia
- **Isolamento de Ciclos**: Ao liquidar um fechamento via PIX, apenas os lançamentos selecionados até aquele corte são marcados como `LIQUIDADO`.
- **Novo Ciclo no Mesmo Dia**: Qualquer novo apontamento enviado após a quitação (inclusive no mesmo dia, em obra civil ou em obra de piscina) abre automaticamente um **novo ciclo em aberto**, sem colidir com o saldo já quitado e sem ser zerado retroativamente.
- **Exemplo Prático**: Um colaborador teve seu ciclo anterior quitado pela manhã via PIX. À tarde, o encarregado envia uma nova diária integral em outro canteiro. O painel e os relatórios exibem o ciclo anterior como quitado e a nova diária separadamente no saldo em aberto atual.

---

## ⚡ 13. Vales em 2 Etapas, Rateio Multi-Obra (`½ + ½`) & Quitação PIX por Foto

### 13.1 Vales em 2 Etapas (`/validacao/vales`) & Separação Estrita (0 Diárias)
- **Etapa 1 (Solicitação Exclusiva de Vales — 0 Diárias)**: Mensagens no WhatsApp que indiquem apenas pedido de vale (ex.: *"Bom dia, 6 vale por favor"* seguido por lista vertical de nomes) são classificadas **exclusivamente como vales**, nunca gerando diárias nem lotes de ponto fantasmas.
- **Valor Explícito por Linha + Fallback R$ 100,00 + Aprendizado por Remetente**: Linhas com valor específico (ex.: *"Colaborador B 50 reais."*) têm o valor extraído (`R$ 50,00`) e o nome limpo/canonizado automaticamente; linhas sem valor recebem o padrão **R$ 100,00**. O padrão de escrita e os apelidos ficam salvos no perfil do remetente na **Memória de Campo (IA)** para aplicação automática nos envios seguintes.
- **Etapa 2 (Confirmação PIX + OCR)**: Ao anexar o comprovante PIX (manualmente ou pelo WhatsApp), a IA lê favorecido, valor e data, salva o arquivo na nuvem e pareia automaticamente com a solicitação pendente, liberando o vale no Borderô e no extrato.
- **Exemplo Prático**: O encarregado envia *"Bom dia, 6 vale por favor"* com 5 nomes sem valor e *"Colaborador B 50 reais"*. O sistema registra **somente os 6 vales** (`5 × R$ 100,00 + 1 × R$ 50,00 = R$ 550,00`) na Etapa 1 e **0 diárias**. Assim que a administração anexa os comprovantes PIX, o status muda para **Etapa 2: PIX Confirmado**.

### 13.2 Rateio Multi-Obra (`0,5 + 0,5`) & Regra de Chuva (`R$ 120,00`)
- Um colaborador pode atuar meio período em um canteiro e meio período em outro no mesmo dia (soma $\le 1,0$).
- No **Espelho do Ponto** (tela e PDF), o dia aparece com o selo **`½+½`** detalhando cada obra no tooltip e no descritivo do código PIX Copia e Cola.
- Dias paralisados por chuva aplicam automaticamente o valor fixo de **R$ 120,00**.

### 13.3 Liquidação PIX por Comprovante (OCR) & Regimes Especiais
- No **Borderô** (`/bordero`), clique em **Liquidar PIX (Foto OCR)** para subir o comprovante de pagamento de um colaborador. O sistema identifica o favorecido e exibe a prévia *Antes × Depois* dos lançamentos que serão quitados após sua aprovação.
- Suporte nativo a **Mensalista diluído semanalmente** e à regra de **Dias Úteis Segunda a Sábado = 1 diária**.

---

## 📑 14. Excel Analítico em 5 Abas, Recibo PIX Individual & Envio Quinzenal em PDF Paisagem

### 14.1 Planilha Excel Analítica em 5 Abas com Fórmulas (`=SUM`)
Na tela **Relatórios & Exportações** (`/relatorios`), clique em **Excel V6 (5 Abas)** para baixar uma pasta de trabalho estruturada pronta para contabilidade e controladoria:
1. **Resumo por Trabalhador**: Nomes unificados, obras, chave PIX, quantidade de diárias, valor aberto, vales, líquido a pagar, histórico já quitado e Caixinha em Mãos em coluna separada (sem desconto automático).
2. **Detalhamento de Diárias**: Registro dia a dia distinguindo Obra Civil, Piscina, Dia de Chuva (`R$ 120,00`) e Rateio Multi-Obra (`½+½`).
3. **Controle de Vales**: Rastreabilidade completa de solicitação, etapa (Solicitado vs Confirmado com PIX), responsáveis e link do comprovante em nuvem.
4. **Caixinha de Campo**: Entradas PIX, notas fiscais comprovadas, devoluções de troco e saldo líquido calculado por fórmula nativa.
5. **Custo por Obra**: Comparativo de diárias em aberto, diárias quitadas, total geral e vales por canteiro.
- **Exemplo Prático**: Ao selecionar o período **Quinzenal** e clicar em **Excel V6 (5 Abas)**, todas as abas já chegam com a linha `TOTAL GERAL` preenchida com fórmulas nativas `=SUM(...)` prontas para edição no Microsoft Excel ou Google Planilhas.

### 14.2 Comprovante Detalhado Individual de Liquidação PIX (PDF + Nuvem + Envio Opcional)
Na tela **Fechamento & Pagamentos** (`/bordero`):
- Clique em **Recibo PIX** no card de qualquer colaborador para gerar o **Comprovante Detalhado Individual de Liquidação PIX** em PDF A4 com lista de diárias, vales abatidos, valor líquido e **hash criptográfico SHA-256**.
- Uma cópia pericial é arquivada automaticamente em nuvem para consulta futura.
- Você pode **Baixar PDF**, **Abrir / Imprimir** e — **apenas se desejar** — informar/confirmar o telefone do trabalhador e clicar em **Enviar no Zap** (o envio para o colaborador é sempre opcional e nunca disparado automaticamente).
- **Exemplo Prático**: Após conferir o pagamento de um colaborador, clique em **Recibo PIX**, salve a cópia para arquivo ou clique em **Abrir / Imprimir** para assinatura presencial na obra.

### 14.3 Envio Quinzenal Automático em PDF Paisagem (2ª e Última Sexta às 18:00)
- O agendador nativo do sistema dispara automaticamente na **2ª sexta-feira** e na **última sexta-feira** de cada mês, às **18:00 (Horário de Brasília)**, o **Relatório Financeiro Quinzenal em PDF Paisagem** diretamente no WhatsApp da diretoria cadastrada.
- O relatório exibe **exclusivamente os saldos em aberto** (respeitando liquidações parciais seletivas já encerradas) e mantém a Caixinha de Campo em coluna informativa própria.
- Caso precise antecipar o fechamento, clique em **Disparar PDF Quinzenal Agora** na faixa de agendamento em `/relatorios` para gerar, baixar imediatamente e enviar o PDF sob demanda.

---

## 🛒 15. Pedidos de Compras por Grupo de Obra (`/compras`) & Auditoria Interna IA (`/auditoria`)

### 15.1 Gerador Inteligente de Pedido de Compras (`/compras`) & Logística de Obra (`/setup`)
- **Controle por Empresa (`modulo_compras_ativo`)**: Ativado especificamente nas empresas com rotina de suprimentos por grupo de obra (Modo Empreita), permanecendo em *standby* nas empresas focadas apenas em folha de diárias.
- **Cadastro Obrigatório de Entrega, Alias do Cliente & Subempreita (`/setup`)**: Nas empresas em **Modo Empreita**, o `/setup` exibe automaticamente 3 abas dedicadas: **Empreiteiros / Encarregados** (apelidos, documento, etapa padrão e PIX opcional), **Funcionários / Equipe** (vinculados ao empreiteiro com apelidos, CPF/RG e etapa, sem exigir PIX individual) e **Obras & Etapas** (Alias p/ Fornecedores, Endereço/CEP, Complemento/Descarga, Contato e Etapas da obra integradas direto ao `/diario-obra`). Empresas em **Modo Diarista** preservam o formulário direto de diaristas (`Nome`, `Chave PIX obrigatória` e `Diária R$`).
- **Captura Automática & Cópia por Categoria**: Mensagens solicitando materiais em grupos monitorados ou coladas em `/compras` são agrupadas pela IA por categoria (**Alvenaria**, **Hidráulica**, **Elétrica**, **Acabamento**, **Pintura**, **Ferramentas & EPI**, **Fixação**), com botões para copiar o pedido completo ou **Copiar só esta categoria** já levando automaticamente o cabeçalho de entrega e o Alias do Cliente.
- **Exemplo Prático**: A obra cadastrada com Alias *"Cliente XPTO"*, endereço *"Av. Paulista, 1000"* e complemento *"Portaria de Serviço • Descarga 08h–17h"* recebe uma lista mista no grupo. Ao clicar em **Copiar só esta categoria** em *Elétrica*, a mensagem já sai pronta para a casa elétrica com todos os dados de entrega e faturamento.

### 15.2 Relatório de Saúde do Sistema, Caça-Fantasmas & Auditoria IA (`/relatorios?aba=saude` e `/auditoria`)
- **Aba Integrada + Tela Dedicada**: Acessível diretamente na aba **Saúde & IA** dentro de `/relatorios` (com selo de Health Score em tempo real) ou pelo atalho dedicado **Saúde do Sistema (IA)** (`/auditoria`).
- **Health Score (0–100) em 6 Pilares**: Avalia automaticamente a empresa ativa nos pilares de **Duplicidades (Diárias & Vales)**, **Caça-Fantasmas**, **Regras & Valores**, **Idempotência Anti-Duplicidade**, **Cadastro & Chaves PIX** e **Rastreabilidade WhatsApp**.
- **Detector de Duplicados & Caça-Fantasmas**:
  - Localiza **diárias duplicadas**, **vales duplicados** (preservando os metadados mais completos de solicitante, horário e comprovante PIX) e **cadastros duplicados de colaboradores**.
  - Caça **registros fantasmas**: datas anômalas (ex.: lançamento de meses atrás criado hoje ou data futura), registros ativos com valor zerado (`R$ 0,00`), obras órfãs/inativas, trabalhadores não cadastrados e **lotes fantasmas do WhatsApp** sem nenhum lançamento vinculado.
- **Diagnóstico Executivo via IA + Lote Seguro + Diff `Antes × Depois`**:
  - O botão **Diagnóstico IA** aciona a IA para emitir um parecer executivo priorizado (pontos críticos, duplicados, fantasmas e próximos passos).
  - O botão **Corrigir Lote Seguro** aplica em massa apenas correções sem risco financeiro (normalização de apelidos e preenchimento de chaves de idempotência).
  - Qualquer ajuste financeiro ou descarte de duplicidade exige clique humano (**Human-in-the-Loop**) com **Soft Delete** (`CANCELADO`) e simulação pré-fechamento em tempo real.
- **Último Laudo Estável, Cadência Configurável (`19:30` Padrão) & Histórico Auditável**:
  - Ao carregar a aba, o **último laudo salvo** da empresa é exibido de imediato (data/hora BRT, origem `Manual` ou `Cadência`, quantidade de lançamentos, vales e lotes auditados, score e anomalias), sem recarregamentos contínuos.
  - A cadência padrão recomendada é **Sob Demanda + 1x ao dia às 19:30 (Horário de Brasília)**, podendo ser alterada por empresa para **Apenas Manual**, **A cada 6h (07:00, 13:00, 19:00)** ou **A cada 12h (07:30 e 19:30)** diretamente no painel.
  - Todas as execuções (manuais e agendadas) ficam registradas no **Histórico Auditável de Laudos**, visível mesmo sem manter a tela aberta.
- **Exemplo Prático**: Antes de fechar a folha da semana em uma Empresa Modo Diarista, abra **Relatórios → Saúde & IA** para visualizar imediatamente o último laudo automático das 19:30 (com score, duplicados e fantasmas). Caso tenha acabado de aprovar novas mensagens, clique em **Executar Varredura** e confira o Diff `Antes × Depois` antes de liberar os pagamentos no Borderô.

---

## 🏦 16. Conciliação Bancária Automática (`/conciliacao`) & Central Única de Homologação (Feature Flags no `/config-geral`)

### 16.1 Conciliação Bancária OFX / CSV + Matching Inteligente PIX (`/conciliacao`)
- **Upload Multibanco**: Suporta arquivos `.OFX` e `.CSV` exportados de bancos digitais e tradicionais (detecção automática de delimitador, data e saídas PIX).
- **Cruzamento Inteligente**: Compara valor, janela de data e nome/apelido do favorecido contra diárias, vales e repasses de caixinha isolados da empresa ativa, apontando **Match Exato**, **Sugestão de Match** ou **Divergência**.
- **Aprovação Human-in-the-Loop em 1 Clique**: A administração revisa e aprova a conciliação sem risco de baixas automáticas indevidas.
- **Exemplo Prático**: Baixe o extrato `.OFX` da semana no internet banking, suba em `/conciliacao` e aprove em 1 clique os vales PIX já pareados; saídas sem lançamento aparecem destacadas em vermelho para conferência.

### 16.2 Central Única de Homologação & Implantação (`/config-geral` — Administração)
A rota `/config-geral` (Hub Multi-Empresa) é o **ponto único** para ativar ou desativar independentemente por empresa todas as **Feature Flags de Homologação e Implantação** (sem controles duplicados em telas operacionais como `/setup` e sem necessidade de novo deploy):
1. **`FF_RESUMO_DIARIO_19H` (Resumo Diário Automático às 19h — `EM HOMOLOGAÇÃO`)**: Envia às 19:00 (Horário de Brasília, **24/7 — todos os dias da semana, inclusive domingos e feriados** sempre que houver trabalho registrado) o espelho de presenças do dia no grupo da obra (sem valores em R$) e captura automaticamente a resposta **"OK"** do encarregado para homologar o dia. Quando ativa, exibe o selo **`EM HOMOLOGAÇÃO`** no `/whatsapp` e no resumo enviado.
2. **`FF_EXTRATO_COLABORADOR_LINK` (Portal / Extrato Simplificado do Colaborador — `EM HOMOLOGAÇÃO`)**: Libera no Borderô o botão **Link Extrato (`EM HOMOLOGAÇÃO`)**, gerando um link temporário assinado (`/extrato/[token]`, sem login) para o colaborador consultar suas diárias, dias de chuva (`R$ 120,00`), rateios (`½+½`) e vales no celular.
- **Isolamento Seguro**: Quando uma flag está desligada para uma empresa, os botões, selos, rotas e agendamentos ficam 100% ocultos e bloqueados para aquela empresa.

