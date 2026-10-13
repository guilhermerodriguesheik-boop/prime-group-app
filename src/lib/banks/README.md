# Integração bancária Open Finance — arquitetura

O app não se conecta diretamente à infraestrutura restrita do Banco Central. Ele usa
um agregador autorizado (Pluggy) e consome **somente leitura** (saldos e transações),
com autenticação via CLIENT_ID / CLIENT_SECRET em variáveis de ambiente do servidor.
Não capture senhas bancárias, certificados de terceiros ou tokens em tabelas públicas.

**Bancos desejados:** Itaú Empresas (workspace prime); Bradesco Empresas (prime);
Inter pessoal (personal). O conector Open Finance da Pluggy declara suportar os três
para PF/PJ. Disponibilidade final depende dos consentimentos bancários e da conexão.

**Uso exclusivo do titular:** seguir https://meu.pluggy.ai/api-guide.
O caminho gratuito para ler os próprios dados usa bancos conectados no Meu Pluggy
e um item proxy por banco, criado pelo conector MeuPluggy na aplicação demo.
O ID original do Meu Pluggy e o ID proxy do Dashboard são distintos.
Não é necessário contratar plano nem habilitar listagem de itens em /v2/items.
Com PLUGGY_PERSONAL_OWNER_ID configurado, o widget oferece somente o conector
MeuPluggy, descoberto pelo nome na API; não usa um ID de conector presumido.

**Configuração para o provedor:**
- PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET (server-only; produção, criptografados)
- PLUGGY_PERSONAL_OWNER_ID (opcional): UUID do único usuário do app autorizado
  a registrar itens do Meu Pluggy cujo clientUserId venha null. Nunca habilite
  essa permissão para múltiplos usuários ou para itens de terceiros. A titularidade
  é verificada tanto ao vincular quanto a cada sincronização.
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

**Importação sem assinatura:** no painel /bancos a pessoa pode importar um OFX de
Itaú PJ, Bradesco PJ ou Inter PF, com idempotência pelo FITID de cada movimento.
A fonte manual aparece rotulada como OFX e não é sincronizada por API. O arquivo
é enviado apenas ao servidor autenticado, limitado em tamanho, e não armazena
senhas. Cuidado para escolher o banco/ambiente correto; faça conferência.

**Importante:** extrato bancário não é livro-caixa:
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
