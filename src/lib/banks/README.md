# Integração bancária Open Finance — arquitetura

O app não se conecta diretamente à infraestrutura restrita do Banco Central. Ele usa
um agregador autorizado (Pluggy) e consome **somente leitura** (saldos e transações),
com autenticação via CLIENT_ID / CLIENT_SECRET em variáveis de ambiente do servidor.
Não capture senhas bancárias, certificados de terceiros ou tokens em tabelas públicas.

**Bancos desejados:** Itaú Empresas (workspace prime); Bradesco Empresas (prime);
Inter pessoal (personal). O conector Open Finance da Pluggy declara suportar os três
para PF/PJ. Disponibilidade final depende dos consentimentos bancários e da conexão.

**Modelo de custos:** a Pluggy anunciou plano comercial de dados a partir de R$ 2.500/mês.
A modalidade Meu Pluggy permite gratuitamente até 5 conexões para **uso pessoal,
não comercial** e exige que o próprio usuário conecte contas no Meu Pluggy e
crie itens no Dashboard via conector MeuPluggy. Não usar essa oferta para revenda,
produto de terceiros ou automação empresarial sem confirmar as condições com a Pluggy.
Se envolver movimentações empresariais, validar elegibilidade contratual antes.

**Configuração para o provedor:**
- PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET (server-only; produção, criptografados)
- PLUGGY_PERSONAL_OWNER_ID (opcional): UUID do único usuário do app autorizado
  a registrar itens do Meu Pluggy cujo clientUserId venha null. Nunca habilite
  esse bypass para múltiplos usuários ou para itens de terceiros.
- Não colocar nenhum segredo com NEXT_PUBLIC_. O app mostra o estado 'aguardando'
  até existir um par de credenciais real.

**Fluxo:** POST /api/banks/token emite token Pluggy limitado ao usuário conectado.
O widget oficial faz o consentimento externo e retorna itemId. POST /api/banks com
action=attach valida o usuário e workspace antes de armazenar conexão.
POST action=sync lê GET /items/{id}, GET /accounts?itemId=... e
GET /v2/transactions?accountId=... com paginação cursor. Banco está separado em
bank_connections, bank_accounts e bank_transactions; RLS vincula owner e workspace.
Upsert com IDs do provedor impede duplicação em importação repetida.
POST action=pause interrompe consultas no app, mas não revoga o consentimento
existente no provedor. Não há iniciação de Pix, transferências nem pagamento.

**Importante:** banco bancário não é livro-caixa:
nem balance nem extratos importados alteram transactions, payables, receivables
ou accounts existentes. De-para, matching de transferências e baixa automática
só podem ser habilitados após confirmação explícita e testes reais.

**Atualização:** cada acesso ao painel tenta atualizar conexões com último sync
>24h, mais sincronização manual. O próprio Meu Pluggy atualiza suas fontes a cada 24h.
Um cron background de app, além de não ser necessário ao primeiro uso, exigiria
credencial privilegiada específica e autorização operacional; não foi ativado.

**Testes esperados:** conexão PF e PJ, consentimento, perda/revogação, erro de API,
paginação, reimportação idempotente, RLS entre usuários, separação PJ/PF, alerta de
saldo desatualizado, transferências duplicadas, leitura sem efetivar pagamentos.
