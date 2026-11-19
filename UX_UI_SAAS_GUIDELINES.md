# Diretrizes de UX/UI para Sistemas SaaS

Este documento define os padrões obrigatórios de experiência e interface para o desenvolvimento de telas, fluxos, dashboards, tabelas e onboarding. Priorize **clareza, velocidade no uso diário e redução de atrito** acima de efeitos puramente decorativos.

---

## 1. Diretrizes Gerais de SaaS

### 1.1. Revelação Progressiva (Progressive Disclosure)
- **Exiba o essencial primeiro:** Destaque os 20% de ações que resolvem 80% do trabalho diário.
- **Oculte complexidade com inteligência:** Coloque configurações avançadas, filtros secundários e regras complexas em abas, modais, *drawers* laterais ou seções expansíveis.
- **Evite sobrecarga cognitiva:** Nunca despeje todas as opções e botões de ação simultaneamente na mesma tela.

### 1.2. Eficiência para Uso Repetitivo (Power Users)
- **Busca global e atalhos:** Implemente paleta de comandos (`Cmd/Ctrl + K`) para navegação rápida e execução de ações frequentes.
- **Ações em massa (Bulk Actions):** Em qualquer listagem operacional, permita selecionar múltiplos itens para editar, mover, exportar ou excluir de uma vez.
- **Salvamento automático:** Em formulários longos ou editores, salve automaticamente e exiba um indicador discreto de status (ex: *"Salvo às 14:32"*).

### 1.3. Feedback Claro e Prevenção de Erros
- **Estados de carregamento:** Use *skeleton screens* que respeitam o layout final em vez de bloquear a tela inteira com spinners genéricos.
- **Mensagens de erro acionáveis:** Nunca exiba apenas códigos técnicos (ex: *"Erro 403"*). Informe o que aconteceu e como resolver (ex: *"Sem permissão para editar este relatório. Solicite acesso ao administrador."*).
- **Proteção contra ações destrutivas:** Exija confirmação explícita (modal com verbo específico no botão, ex: *"Excluir projeto"* em vez de *"OK"*) e, sempre que possível, ofereça **Desfazer (Undo)** via *toast* temporário.

### 1.4. Consistência e Navegação
- **Navegação previsível:** Mantenha a barra lateral (*sidebar*), cabeçalho e *breadcrumbs* consistentes em todo o sistema para que o usuário sempre saiba onde está.
- **Hierarquia de botões:** Use apenas **um botão primário** por seção ou modal. Ações secundárias devem ser *outline* ou *ghost*.
- **Acessibilidade básica:** Garanta contraste mínimo AA, foco visível para navegação por teclado (`Tab`) e rótulos claros em ícones (via `tooltip` e `aria-label`).

---

## 2. Boas Práticas para Dashboards

### 2.1. Arquitetura e Hierarquia Visual
- **Regra dos 5 segundos:** O usuário deve entender a saúde geral da operação nos primeiros 5 segundos ao abrir a tela.
- **Fluxo de leitura (Topo → Base):**
  1. **Topo:** Filtros globais (período, equipe, unidade) + 3 a 5 cards de KPIs principais.
  2. **Meio:** Gráficos de tendência ou comparação que explicam o *porquê* dos KPIs.
  3. **Base:** Tabelas detalhadas ou listas de itens que exigem ação imediata.
- **Contexto nos números:** Nunca mostre um número isolado (ex: `R$ 42.000`). Sempre acompanhe de variação percentual ou comparação com o período anterior (ex: `+12% vs. mês anterior`).

### 2.2. Gráficos com Propósito
- **Zero gráficos decorativos:** Todo gráfico deve responder a uma pergunta real de negócio e levar a uma decisão.
- **Escolha o tipo certo:**
  - Tendência ao longo do tempo → Gráfico de linha ou área.
  - Comparação entre categorias → Gráfico de barras (horizontais para rótulos longos).
  - Evite gráficos de pizza/rosca com mais de 4 fatias.
- **Interatividade útil:** Adicione *tooltips* claros ao passar o mouse e permita clicar em pontos/barras para filtrar os dados abaixo (*drill-down*).
- **Uso contido de cores:** Use cores semânticas (verde para positivo, vermelho para alerta/queda, cinza para neutro) e evite paletas arco-íris.

---

## 3. Boas Práticas para Tabelas Complexas

### 3.1. Estrutura e Escaneabilidade
- **Alinhamento rigoroso:**
  - Textos e status: alinhados à **esquerda**.
  - Números, moedas e porcentagens: alinhados à **direita** com `font-variant-numeric: tabular-nums` (dígitos tabulares para facilitar comparação vertical).
- **Cabeçalho fixo (Sticky Header):** Mantenha o cabeçalho visível durante a rolagem vertical. Em tabelas muito largas, fixe a primeira coluna (identificador) e a última (ações).
- **Densidade configurável:** Use altura de linha confortável (44px a 52px por padrão) e, em telas muito densas, ofereça alternância entre modo *Compacto* e *Confortável*.
- **Trunque com inteligência:** Evite quebras de linha descontroladas. Trunque textos longos com reticências (`...`) e exiba o conteúdo completo via *tooltip* ou *drawer* de detalhes.

### 3.2. Filtros, Busca e Personalização
- **Barra de ferramentas dedicada:** Posicione busca textual, filtros rápidos (*chips* ou dropdowns) e seletor de colunas imediatamente acima da tabela.
- **Filtros ativos visíveis:** Exiba os filtros aplicados como *tags* removíveis com um botão claro de *"Limpar tudo"*.
- **Ordenação clara:** Indique visualmente qual coluna está ordenada e em qual direção (ascendente/descendente).
- **Persistência de preferências:** Salve a ordenação, filtros ou colunas ocultadas/reordenadas pelo usuário (no `localStorage` ou perfil).

### 3.3. Ações e Estados
- **Ações por linha:** Mantenha no máximo 1 ou 2 ícones de ação direta visíveis; agrupe o restante em um menu de contexto (`...`).
- **Barra de ações em massa:** Ao marcar checkboxes, exiba uma barra flutuante ou fixa no topo informando quantos itens estão selecionados e as ações disponíveis.
- **Paginação e contagem:** Mostre sempre o total de registros (ex: *"Mostrando 1–25 de 430 resultados"*) e permita escolher itens por página (25, 50, 100).
- **Empty State de busca:** Se um filtro não retornar resultados, informe claramente e ofereça um botão *"Limpar filtros"*.

---

## 4. Estrutura de Onboarding para Reduzir Cancelamentos (Churn)

O objetivo do onboarding é reduzir ao máximo o **Time to Value (TTV)** — o tempo entre o cadastro e o momento em que o usuário extrai o primeiro valor real do produto.

### 4.1. Entrada sem Atrito
- **Cadastro mínimo:** Peça apenas e-mail/senha ou SSO (Google/Microsoft) na entrada.
- **Micro-pesquisa de personalização (1 a 3 passos):** Pergunte cargo, objetivo principal ou tamanho da equipe para adaptar o dashboard e os templates iniciais. Sempre permita pular (*"Pular por enquanto"*).

### 4.2. Primeiros Passos Acionáveis
- **Substitua tours longos por Checklists:** Evite pop-ups sequenciais de 10 passos que o usuário fecha sem ler. Use um checklist persistente e recolhível com **3 a 5 tarefas-chave** que levam ao "momento aha!" (ex: *1. Conectar conta → 2. Importar dados → 3. Criar primeiro relatório*).
- **Progresso visual:** Mostre barra de progresso (ex: *"2 de 4 concluídos"*) e dê feedback positivo ao completar cada etapa.
- **Empty States que ensinam:** Toda tela inicialmente vazia deve conter:
  1. Breve explicação do que aparecerá ali.
  2. Um botão primário (CTA) para criar o primeiro item.
  3. Opcionalmente, um botão secundário para **carregar dados de exemplo** ou **usar um template**.

### 4.3. Educação Contextual e Retenção
- **Ajuda no momento certo:** Use *tooltips* discretos ou pequenos banners contextuais apenas quando o usuário acessar uma funcionalidade complexa pela primeira vez.
- **Dados de demonstração (Sandbox/Templates):** Permita que o usuário explore dashboards e fluxos preenchidos com dados fictícios (com um banner claro no topo: *"Você está vendo dados de exemplo — Limpar dados"*).
- **Transparência em limites e planos:** Nunca bloqueie o usuário com um erro genérico ao atingir o limite do plano gratuito/trial. Mostre o progresso de uso (ex: *"8 de 10 projetos usados"*) e explique claramente o benefício do upgrade.

---

## 5. Checklist Rápido de Revisão (Antes de Finalizar uma Tela)

- [ ] A tela possui apenas um CTA primário evidente?
- [ ] Todos os estados foram implementados? (**Loading / Skeleton**, **Empty State**, **Erro** e **Sucesso**).
- [ ] Números em tabelas estão alinhados à direita com `tabular-nums`?
- [ ] Ações destrutivas pedem confirmação ou permitem desfazer?
- [ ] Mensagens de erro dizem exatamente como o usuário pode resolver o problema?
- [ ] Um usuário novo conseguiria entender a próxima ação nesta tela sem ler um manual?
