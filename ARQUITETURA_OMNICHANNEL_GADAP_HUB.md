# Arquitetura Omnichannel (WhatsApp + IA) & Plano de Integração no GADAP HUB

**Documento Técnico & Estratégico**  
**Origem:** Plataforma `Diária.AI` (Micro-ERP de Campo Multi-Tenant)  
**Destino:** Replicação e Integração no **GADAP HUB** (`https://gapad-hub.vercel.app/`)

---

## 1. Motor WhatsApp Open-Source (Baileys — Zero Custo Meta)

A comunicação de campo opera sobre a biblioteca open-source **Baileys** rodando em serviço dedicado (local `127.0.0.1:3001` no Fly.io / instância persistente):
- **Zero taxas por conversa:** Sem dependência da Cloud API paga da Meta e sem aprovação prévia de templates.
- **Suporte nativo a Grupos (`@g.us`):** Captura texto, legendas e fotos (`imageMessage`) diretamente nos grupos operacionais.
- **Emparelhamento Híbrido:** Suporta **QR Code** e **Pairing Code (8 dígitos)** — eliminando falhas de câmera em iOS/iPhone.
- **Arquitetura 1 Conta → N Grupos/Empresas:** Uma única conta WhatsApp monitora dezenas de grupos simultaneamente. O Hub de Configuração Geral (`/config-geral`) mapeia cada `groupJid` → `{ empresa (tenant_id), obra, ambiente }`.

---

## 2. Webhook Inteligente & Blindagens Operacionais (`/api/webhook/whatsapp`)

Cada mensagem recebida no webhook passa por 6 camadas de proteção antes de virar um registro:
1. **Mutex & Deduplicação (`messageId` + `remoteJid`):** Impede processamento duplicado em reconexões do WhatsApp.
2. **Ponto de Corte Operacional (`data_corte_operacional`):** Ignora automaticamente mensagens com timestamp anterior ao corte inicial, impedindo reentrada de histórico antigo.
3. **Roteamento Multi-Empresa Automático:** Consulta o mapa de grupos pelo `remoteJid` e define automaticamente o `tenant_id` (ex.: Empresa A vs Empresa B) e o nome oficial da unidade/obra — mesmo se o usuário esquecer de citar o nome na mensagem.
4. **Extração NLP & Vision (`Gemini 3.5 Flash`):** Traduz linguagem natural informal em JSON estruturado (diárias, frações, exceções climáticas/viagem, vales, notas fiscais e comprovantes de PIX).
5. **Auditoria Pericial & Cloudflare R2:** Mídias são enviadas ao bucket S3 compatível (Cloudflare R2) com carimbo temporal de Brasília (`America/Sao_Paulo`) e hash criptográfico **SHA-256**.
6. **Sigilo Financeiro Bilateral:** O remetente/encarregado recebe apenas confirmação operacional **sem valores em R$**; valores monetários e links de aprovação vão **exclusivamente** para a Administração.

---

## 3. Terminal Omnichannel & IA (Pré-Validação com "De Acordo")

Na interface web (`TerminalIA.tsx` + `/api/terminal/confirmar`), o assistente opera em **2 etapas conversacionais**:
- **Etapa 1 — Rascunho & Checklist de Completude (Nada vai para o banco ainda):** A IA analisa a mensagem, acumula contexto multi-turno e verifica se faltou alguma informação obrigatória (obra, colaboradores, valor de vale). Se faltar, pergunta objetivamente no chat.
- **Etapa 2 — Confirmação Explícita ("De Acordo"):** Somente após o clique em **"De Acordo — Enviar para Validação"** o sistema grava no Supabase (`ponto_lote`, `ponto_detalhe` e `lancamentos_financeiros`) respeitando o `tenant_id` ativo.
- **Extensões de IA já validadas em produção:**
  - **Refinar Resumo com IA:** transforma anotações curtas de campo em texto executivo no Diário de Obra (`/diario-obra`).
  - **Leitura de Notas & PIX (Gemini Vision):** extrai tipo, valor e categoria direto da foto no Caixa de Campo (`/reembolsos`).
  - **Leitura de Propostas & Medição IA (`/medicoes`):** lê PDF/foto da proposta, extrai etapas/pesos e cruza Diários + Homens-Dia para estimar `% concluído` em linguagem simples para não-engenheiros.

---

## 4. Fluxo Human-in-the-Loop, Governança & Relatórios PDF Zap

- **Validação por Mensagem Enviada:** 1 card = 1 mensagem (com horário exato, texto original expansível e aprovação independente).
- **Exclusão Auditada (Soft Delete `DESCARTADO`):** Nunca perde histórico e permite restauração em 1 clique.
- **Guarda Multi-Admin (`409 Conflict`):** Impede sobrescrita silenciosa entre administradores e notifica a administradora central em qualquer alteração pós-aprovação.
- **Disparo Direto de PDF Base64 no WhatsApp (`PDF Zap`):** Geração vetorial leve em Base64 (sem Puppeteer) para Diário de Obra, Espelho do Ponto (Relatório 4) e Calendário Visual 7 colunas (Relatório 5), disparado via Baileys local (`127.0.0.1:3001/send-document` com fallback `/send-message` + link R2), respeitando sigilo automático por destinatário.

---

## 5. Plano de Integração no GADAP HUB (`https://gapad-hub.vercel.app/`)

Para integrar este SaaS ao **GADAP HUB** e escalá-lo para **N empresas e outras verticais/soluções**, siga este roadmap em 4 passos:

### Passo 1 — Catálogo Dinâmico de Tenants (Substituir Mapa Estático)
- Criar tabela `tenants` no Supabase compartilhado do GADAP HUB:
  - `id (UUID)`, `slug`, `nome_exibicao`, `modo_operacao ('DIARISTA' | 'EMPREITA' | 'SERVICOS' | 'CUSTOM')`, `modulos_ativos (JSONB)`, `cor_primaria`, `logo_url`, `ativo`.
- Trocar o mapa fixo `TENANTS` em `src/lib/tenant.ts` por consulta com cache curto à tabela `tenants`. Assim, qualquer nova empresa cadastrada no GADAP HUB nasce pronta em segundos sem deploy!

### Passo 2 — Identidade & SSO Unificados (GADAP HUB → Módulos)
- O **GADAP HUB** atua como provedor de sessão (Supabase Auth / JWT assinado).
- Ao clicar no card **"Diária.AI / Gestão de Campo"** dentro do GADAP HUB, o Hub redireciona com token/sessão compartilhada passando `user_id`, `role` e `tenant_id` ativo (via subdomínio compartilhado, ex.: `hub.gadap.com.br` + `diaria.gadap.com.br`, ou rota proxy `/apps/diaria`).
- As permissões (RBAC) passam a ser lidas da tabela `tenant_memberships (user_id, tenant_id, role)` do GADAP HUB.

### Passo 3 — Motor WhatsApp + IA como Serviço Compartilhado do GADAP HUB
- Extrair o serviço **Baileys + Webhook Router** para um microsserviço central do GADAP HUB (`gadap-omnichannel-gateway`):
  - **1 conta WhatsApp por empresa** (ou conta compartilhada) roteada por `remoteJid` → `{ produto: 'diaria' | 'crm' | 'financeiro' | 'suporte', tenant_id }`.
  - O **Terminal IA com "De Acordo"** vira um componente reutilizável (`@gadap/ai-terminal`) que recebe apenas o *schema de extração* e o *endpoint de confirmação* de cada produto do Hub!

### Passo 4 — Empacotamento White-Label, Billing & Observabilidade
- **White-Label nativo:** Todos os manuais, `ContextualHelp.tsx`, PDFs e cabeçalhos já usam linguagem genérica e puxam `nome_exibicao` / `cor_primaria` do tenant ativo.
- **Feature Flags por Plano:** Controlar via `tenants.modulos_ativos` quais recursos cada cliente do GADAP HUB contratou (`whatsapp_bot`, `diario_obra`, `medicoes_ia`, `caixa_campo`, `fechamento_pix`).
- **Offline-First pronto (`IndexedDB Outbox` + `NetworkStatusBar`):** Reaproveitável em qualquer aplicativo de campo do ecossistema GADAP HUB.
