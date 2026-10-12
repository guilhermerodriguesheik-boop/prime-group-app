# Prime Finance

Painel financeiro e operacional para **Prime Group + finanças pessoais + recebíveis/juros**, com integração preparada para **Cargozilla, WhatsApp, Open Finance/Pluggy, Supabase e API oficial da OpenAI**.

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
- agente financeiro com API oficial OpenAI Responses / AI SDK, ferramentas de registro e leitura de imagens;
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

## 2.1. Ativar a IA OpenAI em produção

1. Acesse https://platform.openai.com e crie um projeto de API com faturamento habilitado. A assinatura do ChatGPT não inclui créditos de API.
2. Crie uma chave de API em https://platform.openai.com/api-keys. Não coloque a chave no GitHub nem a envie por chat.
3. No projeto `prime-finance` da Vercel, em **Settings > Environment Variables**, adicione:
   - `OPENAI_API_KEY` (sensitive/encrypted, produção/preview/desenvolvimento conforme necessário);
   - `PRIME_AGENT_MODEL=gpt-6-astra` (opcional: esse já é o padrão da aplicação);
   - `PRIME_VISION_MODEL` somente se quiser outro modelo para imagens.
4. Faça um novo deploy em produção para aplicar a chave.
5. Após login, envie a mensagem `Quais funções você pode executar? Não registre nada.` para confirmar a resposta sem alterar dados.
6. Teste um lançamento fictício, confira o painel e só depois registre valores reais.

**Segurança:** a chave é lida somente no servidor; chamadas usam `store: false` e desabilitam chamadas paralelas de ferramentas. Controle os limites e o consumo na OpenAI Platform. Sem `OPENAI_API_KEY`, a API retorna erro de configuração, sem tentar o antigo modelo gratuito.

## 2.2. Áudios e documentos fiscais no chat

- **Gravar áudio:** abra o chat e clique em `Gravar áudio`, fale e clique em `Parar gravação`. O servidor autenticado envia o áudio diretamente para a transcrição da OpenAI. O resultado entra no campo como texto editável; revise datas, valores e nomes **antes** de clicar em Enviar. O arquivo de áudio não fica armazenado no Supabase.
- **Enviar áudio:** também aceita MP3, M4A, WAV, OGG, WebM e mensagens de voz exportadas em OPUS. Limite de até 4 MB por gravação/arquivo (limite de payload da Vercel).
- **Fotos e PDF:** imagens são enviadas para análise visual. O PDF é repassado ao modelo multimodal para leitura de documentos escaneados, tabelas e notas fiscais quando tiver até 12 MB; no máximo 3 PDFs visuais por solicitação, para controlar custo e consumo de tokens.
- **XML fiscal:** extração estruturada dos campos principais de NF-e e CT-e (chave, fornecedor, destinatário, data e valores), preservando o XML original para verificação.
- **Controle contábil:** nota fiscal emitida não é comprovante de pagamento. Se o arquivo isolado não provar que foi quitado, a IA pergunta antes de contabilizar como pago. Se o arquivo não indicar com segurança o ambiente Prime/Pessoal/Juros, acrescente uma frase curta identificando o destino; o anexo permanece selecionado.
- **WhatsApp:** enviar e receber áudios pelo WhatsApp ainda requer a ativação da WhatsApp Cloud API na Meta. Essas funcionalidades são do chat web do Prime Finance.

O áudio transcrito envolve uma chamada adicional à API da OpenAI e pode gerar cobrança de uso. Configure `PRIME_TRANSCRIPTION_MODEL` somente se quiser substituir o padrão `gpt-4o-mini-transcribe`.

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
