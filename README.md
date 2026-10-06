# Prime Finance

Painel financeiro e operacional para **Prime Group + finanças pessoais + recebíveis/juros**, com integração preparada para **Cargozilla, WhatsApp, Open Finance/Pluggy, Supabase e Vercel AI Gateway**.

## O que já existe neste starter

- dashboard consolidado sem misturar as três contabilidades;
- páginas Prime, Pessoal, Juros, Contas, Viagens, Frota, Documentos, Assistente e Integrações;
- schema Supabase completo com RLS;
- ledger de partidas dobradas;
- contas recorrentes, recebíveis, contratos a juros e pagamentos;
- frota, motoristas, CT-e, viagens, combustível, pedágio e manutenção;
- documentos e fila de eventos externos;
- motor inicial de conciliação;
- parser de XML de CT-e;
- webhook WhatsApp com validação HMAC quando `WHATSAPP_APP_SECRET` estiver configurado;
- endpoint de interpretação financeira com Vercel AI Gateway / AI SDK;
- adaptadores de Cargozilla e Pluggy desacoplados do domínio;
- CI de build no GitHub.

## 1. Criar o projeto Supabase

1. Crie um projeto no Supabase.
2. Rode, nesta ordem:
   - `supabase/migrations/0001_core.sql`
   - `supabase/migrations/0002_bootstrap.sql`
3. Crie um bucket **privado** chamado `finance-documents`.
4. Copie URL e Publishable Key para o `.env.local`.
5. A service role fica apenas no servidor/Vercel.

## 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha somente o que for usar.

Sem essas variáveis, a interface continua em modo de demonstração.

## 3. Instalar e rodar

```bash
npm install
npm run dev
```

## 4. Bootstrap após login

```sql
select * from public.bootstrap_my_finance();
```

A função cria os workspaces Prime Group, Pessoal e Recebíveis e Juros.

## 5. Integrações

- Cargozilla: `src/lib/integrations/cargozilla.ts`
- WhatsApp: `/api/whatsapp/webhook`
- Open Finance/Pluggy: adaptador desacoplado
- CT-e XML fallback: `POST /api/cte/import`

## 6. Deploy

GitHub → Vercel → env vars → preview por branch → produção após checks.

## Estrutura

```text
src/app                 telas e APIs
src/lib/finance         regras financeiras puras
src/lib/integrations    conectores externos
src/lib/supabase        clientes Supabase
supabase/migrations     schema e funções
docs                    arquitetura, roadmap e prompt do Cursor
```
