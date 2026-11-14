# Diretrizes de Desenvolvimento e Regras de Engenharia - Ponto Patrícia (Diária.AI)

Este documento estabelece os padrões e regras estritas de desenvolvimento para o projeto Ponto Patrícia / Diária.AI.

## 1. Princípios de Engenharia
- **TypeScript Estrito (`strict: true`)**: O uso de `any` é terminantemente proibido. Todas as interfaces, payloads de requisição, retornos de funções e entidades de banco devem ter tipagem explícita.
- **Tipagem Supabase**: Todas as respostas de consultas ao Supabase devem ser devidamente tipadas utilizando os tipos de banco de dados (`Database['public']['Tables']...`).
- **Next.js 14 (App Router)**: Utilizar Server Components por padrão; utilizar `'use client'` apenas onde houver interatividade direta de UI (formulários interativos, hooks de estado, chat).
- **Estilização**: Tailwind CSS com componentes acessíveis baseados no padrão shadcn/ui.
- **Segurança & RLS (Row Level Security)**: Todas as tabelas no Supabase operam sob o modelo Multi-Tenant utilizando `tenant_id`. Nenhuma operação no banco deve ignorar a cláusula de isolamento do tenant.
- **Preservação de Código & Justificativas**: A IA e os desenvolvedores **nunca devem apagar ou reescrever códigos funcionais antigos sem justificativa detalhada** registrada no arquivo `HANDOFF.md`.
- **Human-in-the-Loop**: Automações e extrações de IA processam mensagens e marcam dados como `PENDENTE`. A consolidação financeira e a alteração de status para `VALIDADO` e `LIQUIDADO` dependem de aprovação explícita da Administradora.

## 2. Padrões de Projeto
- **Monorepo / Estrutura Modular**:
  - `/src/app`: Rotas e páginas do Next.js (Dashboard, Validação, Setup, Borderô, Configurações).
  - `/src/components`: Componentes reutilizáveis de UI (Terminal de IA, Tabelas com Checkboxes, Modais).
  - `/src/lib`: Clientes de API, SDK Supabase, Gemini AI Client, utilitários de formatação e cálculo.
  - `/src/server`: Backend de serviços NLP, rotas de Webhook e geradores de PDF/Borderô.
  - `/supabase`: Scripts de migração SQL, schemas e RLS.

## 3. Segurança de Segredos e Credenciais
- Nenhuma chave secreta (`SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, senhas de banco) deve ser comitada no repositório Git. Todas devem permanecer no `.env` local e configuradas nas variáveis de ambiente do Render/Vercel.

