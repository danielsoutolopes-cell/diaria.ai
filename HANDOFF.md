# Diário de Bordo & Transição de Contexto (HANDOFF.md)

## Estado Atual
- **Regras Operacionais de Diárias Parametrizáveis**:
  - **Dia de Viagem**: R$ 120,00 para passageiros da equipe; diária integral para o motorista que conduz o veículo.
  - **Dia de Chuva**: R$ 120,00 quando as condições meteorológicas inviabilizam o trabalho.
  - **Dia Parado**: R$ 120,00 quando o condomínio barra o acesso à obra ou há impedimento por terceiros.
  - **Configurável**: Todos os valores são gerenciáveis dinamicamente pela Administradora na tela de Configurações (`/configuracoes`) via tabela `parametros_sistema`.
- **Notificações Espelhadas (Patrícia Grubel & Daniel Lopes)**:
  - Todo alerta de novo apontamento, lote pendente, aprovação e fechamento é duplicado simultaneamente para o WhatsApp da Patrícia (`5511978543369`) e do Daniel (`5511913192703`).
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

## Últimas Ações
- Atualização do [.env](file:///c:/diaria/.env) com as credenciais S3/R2 completas.
- Atualização do [.env.example](file:///c:/diaria/.env.example).
- Criação de `src/lib/r2.ts` e `src/services/r2Storage.ts` com `@aws-sdk/client-s3` (`PutObjectCommand` e `DeleteObjectCommand`).
- Atualização de `supabase/schema.sql` e `src/types/database.ts` com o campo `comprovante_url`.
- Atualização do webhook Baileys (`src/app/api/webhook/whatsapp/route.ts`) para interceptação de fotos de comprovantes de vales e envio automático ao Cloudflare R2 com UUID.
- Criação de `src/components/ReceiptLightbox.tsx` com visualização modal e download local forçado com convenção de nome `recibo-[nome]-[data].jpg`.
- Integração da coluna "Anexo/Recibo" e Lightbox nas telas de Validações Pendentes (`src/app/validacoes/page.tsx`) e Borderô Semanal (`src/app/bordero/page.tsx`).
- Criação do endpoint de exclusão de lançamentos (`src/app/api/lancamentos/excluir/route.ts`) com limpeza física e preventiva de arquivos órfãos no Cloudflare R2.
- Compilação de produção com 0 erros de tipagem TypeScript e Next.js (`npm run build`).
