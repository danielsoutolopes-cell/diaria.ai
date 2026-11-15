# 📘 Manual Oficial do Sistema - Ponto Patrícia (Diária.AI)
*Micro-ERP de Campo para Obras & Piscinas com IA Human-in-the-Loop*

---

## 🏗️ 1. Visão Geral da Solução
O **Ponto Patrícia (Diária.AI)** foi arquitetado especialmente para resolver as maiores dores de gestão de campo na construção civil e instalação de piscinas:
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

## 💬 3. O Bot de WhatsApp e o Terminal de IA (NLP)

### 3.1 Conexão com o WhatsApp
Na aba **Configuração do Bot (WhatsApp)**:
1. O sistema exibe um **QR Code** de emparelhamento direto com a API Baileys/Evolution.
2. Com o celular do encarregado ou do número oficial da empresa, acesse **Aparelhos Conectados** no WhatsApp e aponte a câmera.
3. Após sincronizado, o bot monitora os grupos oficiais dos canteiros selecionados.

### 3.2 Como Enviar Mensagens de Campo (Linguagem Natural)
O encarregado ou mestre de obras não precisa preencher planilhas. Basta mandar mensagens naturais no grupo da obra:

- **Exemplo de Ponto Coletivo**:
  > *"Hoje na Obra Alphaville: Tião trabalhou o dia todo, Zé Pedreiro meio dia e o Maranhão faltou."*
  - **O que a IA faz**: Identifica a obra, calcula 1x diária para Tião, 0.5x diária para Zé, registra falta para Maranhão e define status como **PENDENTE**.

- **Exemplo de Vale / Adiantamento**:
  > *"Manda 100 de vale pro Tião pegar material no depósito."*
  - Se acompanhado de foto, o sistema intercepta a imagem, envia para o Cloudflare R2 com link permanente e cria o registro com a foto anexada.

### 3.3 Regras de Diárias & Exceções Automáticas
O robô interpreta automaticamente as situações de canteiro:
- **Dia de Viagem**: R$ 120,00 para os passageiros da equipe. Se for indicado quem dirigiu (*motorista*), ele recebe a **diária integral**.
- **Dia de Chuva**: R$ 120,00 quando o tempo impede os serviços de alvenaria ou piscina.
- **Dia Parado (Sem Acesso)**: R$ 120,00 quando a portaria do condomínio barra a entrada ou há impedimentos externos.
- **Valores Editáveis**: Todos esses valores podem ser reajustados pela Administradora na tela de **Configurações do Sistema**.

### 3.4 Terminal de IA (Dashboard)
Dentro do painel web, você conta com um chat interno que executa as mesmas regras de inteligência artificial. Digite qualquer comando e o robô interpreta e organiza os lançamentos automaticamente.

---

## 🛡️ 4. Regra Human-in-the-Loop & Governança Multi-Admin (Patrícia & Daniel)
**Regra Fundamental de Engenharia**: A IA nunca lança dinheiro como pago diretamente.

1. Todas as mensagens recebidas via WhatsApp ou Terminal de IA entram na tela **Validações Pendentes** com status `PENDENTE`.
2. A Administradora (Patrícia Grubel) ou a Diretoria revisam as caixas de seleção, nomes, obras e valores.
3. Se houver divergência, podem editar frações ou valores.
4. **Prevenção de Conflito Multi-Admin ("Já Confirmado")**:
   - Como agora dois gestores (Patrícia Grubel e Daniel Lopes) recebem os avisos e têm acesso ao sistema, se um lote já foi validado anteriormente por um deles, qualquer tentativa de revalidação ou alteração exibe uma tela de guarda:
     > *"O registro já foi confirmado por [NOME]. Quer continuar e alterar?"*
5. **Alerta Obrigatório & Exclusivo para Patrícia Grubel**:
   - **REGRA CRÍTICA INVIOLÁVEL**: Sempre que qualquer registro já confirmado for editado ou alterado por qualquer usuário (seja Daniel Lopes ou outro operador), a Administradora Central **Patrícia Grubel** recebe imediatamente uma notificação exclusiva no WhatsApp contendo o autor da edição, colaborador, canteiro, motivo da alteração e o ajuste de valor (antes vs depois).
6. Ao clicar em **"Aprovar Selecionados"**, os lançamentos passam para o status `VALIDADO` e ficam liberados para pagamento no Borderô.

---

## 💵 5. Fechamento de Folha & Borderô (Sexta VIP)

Na tela de **Fechamento (Borderô)**:
1. O sistema agrupa todos os lançamentos validados por colaborador.
2. **Cálculo Sob Demanda (Human-in-the-Loop)**:
   $$\text{Líquido a Pagar} = \sum (\text{Diárias Marcadas}) - \sum (\text{Vales Marcados})$$
3. **Liquidação Seletiva e Manutenção do Saldo a Dever**:
   - **Toda decisão final de desconto é humana**: se a administradora desmarcar a caixa de um vale, ele **NÃO** é descontado da folha atual e **NÃO** é liquidado.
   - O vale desmarcado permanece gravado com segurança no banco de dados e **continua ativo como saldo a dever** para os fechamentos futuros.
   - Isso permite, por exemplo, que a empresa parcele o desconto de um vale alto ou poupe o trabalhador em semanas de poucas diárias.
4. **PIX Dinâmico com 1 Clique**:
   - Clique em **"Copiar PIX Copia e Cola"** para colar direto no aplicativo do banco.
   - Ou clique em **"Ver QR Code PIX"** para ler o código na tela do computador com o celular do banco.
   - O payload PIX contém a chave do trabalhador, o valor exato calculado e a identificação do lote.
5. **Recibos Anexos (Lightbox)**:
   - Na coluna **"Anexo/Recibo"**, clique no ícone para ampliar a foto do comprovante do vale e baixar o arquivo com o nome oficial `recibo-[nome]-[data].jpg`.
6. Ao clicar em **"Liquidar e Baixar Folha"**, os itens marcados passam para `LIQUIDADO`.

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

Na aba **Mensageria & Pedidos IA** (`/mensageria`):
1. **Chat com o Arquiteto de Software Gemini**:
   - A Patrícia descreve em português simples qualquer necessidade de relatório, gráfico ou melhoria no sistema.
   - A IA conversa de forma humanizada, esclarecendo colunas necessárias, formatos de exportação, agrupamentos e periodicidade.
2. **Geração Instantânea do Prompt Técnico para a IDE**:
   - Assim que o escopo fica claro, a IA compila um **Prompt Técnico Estruturado** detalhando requisitos, rotas, tipos TypeScript e componentes a serem alterados.
   - O prompt fica disponível na tela com botão de **"Copiar Prompt para a IDE"**.
3. **Notificação ao Desenvolvedor (Daniel Lopes)**:
   - Um alerta é disparado automaticamente para o WhatsApp pessoal de **Daniel Lopes** (`5511913192703`) com o resumo da solicitação e o link direto para acesso.
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

