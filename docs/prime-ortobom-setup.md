# Ortobom → Prime Finance

A caixa `lgtransporteelogistica@gmail.com` recebe mensagens `Arquivos da carga XXXXX` contendo o frete contratado, CIOT e um ou mais XMLs de NF-e. Importar **uma carga com todas as NF-e**, nunca somar o frete para cada nota. Existem mensagens com dez XMLs no mesmo e-mail.

## Disponível no app
- `/fiscal`: colar assunto/corpo do email e selecionar múltiplos XMLs; importação validada, agrupada e idempotente por carga.
- `/motoristas`: cadastro CPF/CNH da equipe;
- `/frota`: veículos existentes e link para consulta oficial RNTRC.

## Sincronização automática sem taxa de conexão
O arquivo `docs/ortobom-gmail-apps-script.js` traz um script da própria Google que lê emails selecionados e publica os XMLs no webhook `/api/integrations/ortobom-email` de hora em hora. É necessário consentimento uma vez na conta Google que recebe as notas.

Condições para **ativar** o webhook:
1. Configurar na Vercel como variáveis server-side: `ORTOBOM_EMAIL_INGRESS_SECRET` (valor aleatório >=32 caracteres), `ORTOBOM_WORKSPACE_ID` (workspace Prime correto) e `SUPABASE_SERVICE_ROLE_KEY` (chave de servidor, nunca cliente).
2. Abrir https://script.google.com na conta destinatária, criar projeto e colar o JS.
3. Em Script Properties criar `ORTOBOM_EMAIL_SECRET` com o mesmo valor da chave de entrada da Vercel.
4. Executar `activatePrimeOrtobomHourly` e aceitar autorização Gmail/UrlFetch; conferir registro no app.

Não colocar credenciais no GitHub nem nas mensagens ao assistente. O acesso ao Gmail que o ChatGPT possui não é automaticamente transferível para o aplicativo.
O endpoint nunca emite CT-e ou MDF-e: prepara rascunhos que exigem checagem fiscal. O certificado A1 só será consumido no serviço fiscal autorizador cadastrado e homologado.

Consulta ANTT por placa e transportador: https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx
Sem API pública automatizada verificada, manter consulta manual e evitar resultados inventados.
