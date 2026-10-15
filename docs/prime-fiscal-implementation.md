# Prime Emissor Fiscal — Implantação gradual

## Estado desta ramificação

Este PR **não é um emissor homologado**. Implementa a primeira etapa segura:
- importação manual de NF-e autorizada (XML `nfeProc`);
- validação sintática, chave/protocolo e limites do arquivo;
- preenchimento explícito de CIOT e valor contratado do frete;
- rascunho de CT-e salvo com isolamento Supabase RLS;
- prevenção básica de registros repetidos (NF-e por chave e rascunho idêntico);
- painel `/fiscal` com link em `/viagens`;
- testes de parser no CI.

**Não há** assinatura XML, transmissão SEFAZ, credenciamento, sincronização Gmail OAuth, geração de DACTE/DAMDFE, averbação, MDF-e autorizado ou lançamento contábil automático.

## Segurança

**Nunca** adicionar ao GitHub, banco de dados de rascunhos, ticket ou logs:
- arquivo A1 `.p12`/`.pfx`;
- senha A1 ou chave privada;
- tokens Gmail/Google OAuth;
- segredo de serviços SEFAZ.

O A1 foi entregue fora do repositório e a senha foi compartilhada por chat. Recomenda-se **reemitir/rotacionar** antes da configuração em produção. A validação deste certificado fornecido aponta validade até **19/12/2026**. Separar o motor de assinatura em servidor privado, com segredo criptografado e acesso restrito. Nunca enviar certificado para IA.

## Ordem para concluir um emissor legalmente utilizável

1. Homologar campos fiscais da Prime com contador: IE, CRT, RNTRC, tomador, CST/ICMS, IBS/CBS, códigos municipais, séries e próxima numeração após Cargozilla.
2. Validar obrigatoriedades e APIs vigentes para CT-e 4.00 e MDF-e 3.00, inclusive atualizações de 2026; baixar schemas XSD oficiais e documentações dos serviços.
3. Implementar assinatura XMLDSig no servidor, autenticação TLS mútua A1, comunicação SOAP, requisições assíncronas, retentativas seguras e consulta do protocolo.
4. Controlar numeração atômica por `(CNPJ,tipo,ambiente,serie)` e idempotência por chave de acesso para evitar documentos duplicados.
5. Criar rotinas de emissão, consulta, eventos, cancelamento, inutilização se aplicável, encerramento MDF-e e armazenamento imutável de XML autorizado/protocolo.
6. Conferir CIOT fornecido pela Ortobom e situação ANTT/RNTRC; ele não pode ser assumido como válido apenas pelo formato.
7. Homologação oficial com casos reais anonimizados: rejeição, duplicidade, queda da rede, cancelamento, encerramento, contingência.
8. Configurar OAuth Google do mailbox da transportadora com menor escopo possível, consentimento do titular, renovação de tokens e ingestão idempotente por `(message_id,attachment_sha256)`. Alternativamente, importação manual permanece disponível.
9. Construir DACTE/DAMDFE e envio automatizado condicionado a autorização. Frete **a receber** não é frete **recebido**; jamais contabilizar recebimento pelo XML.
10. Atualizar a interface para confirmação explícita antes da transmissão fiscal. Só ativar produção após aprovação por contador e testes, mantendo Cargozilla como contingência.

## Banco

Migrar `supabase/migrations/20261014_prime_fiscal_drafts.sql` via fluxo de migrações antes do deploy desta interface. Não rodar a migração duas vezes sem verificar políticas RLS. Manter backup.

## Rotinas de desenvolvimento

```bash
npm install
npm run test:fiscal
npm run lint
npm run build
```

Nenhuma credencial de emissão fiscal deve fazer parte desses testes.
