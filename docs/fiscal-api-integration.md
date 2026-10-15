# Prime Finance — autorizador CT-e / MDF-e

O certificado A1 da Prime Group foi verificado fora do repositório (validade até 19/12/2026; chave privada presente).
Nenhuma senha, P12 ou chave privada deve entrar no GitHub ou no código JavaScript entregue ao navegador.

## Estado da integração
- `src/lib/fiscal/focus.ts` implementa as operações de emissão, consulta, cancelamento de CT-e/MDF-e e encerramento de MDF-e na API Focus NFe.
- `/fiscal` mostra somente se as credenciais de homologação e produção estão configuradas; a interface operacional e a vinculação do status da SEFAZ aos documentos ainda precisam ser concluídas.
- A assinatura dos documentos é feita pelo autorizador após cadastramento do certificado da empresa no serviço; o arquivo A1 fornecido pelo usuário ainda não foi transferido para nenhum terceiro.
- Não existe autorização SEFAZ real comprovada. Não rotular documento como autorizado sem protocolo.

## Configuração necessária
Credenciais server-side no projeto Vercel `prime-finance`:
- `FOCUS_NFE_HOMOLOGATION_TOKEN`: token do CNPJ habilitado para homologação;
- `FOCUS_NFE_PRODUCTION_TOKEN`: token da empresa em produção;
- `PRIME_FISCAL_CNPJ=42361401000117`: CNPJ da Prime Group.

Endpoints oficiais:
- Homologação: `https://homologacao.focusnfe.com.br/v2/cte` e `/v2/mdfe`;
- Produção: `https://api.focusnfe.com.br/v2/cte` e `/v2/mdfe`;
- Consulta `GET /v2/{cte|mdfe}/{ref}`;
- Cancelamento `DELETE /v2/{cte|mdfe}/{ref}`;
- Encerramento `POST /v2/mdfe/{ref}/encerrar`.

O provedor exige credenciais próprias e configuração do certificado A1 no cadastro. Não há contratação nem custo autorizado por este PR.

## Operação fiscal
1. XML de NF-e da Ortobom é importado como fonte da carga, não como prova de valor de frete.
2. CIOT da contratante, placa, RNTRC, tomador, CPF, municípios IBGE, tributação, série e número fiscal devem ser conferidos.
3. Preparar CT-e 4.00, transmitir ao autorizador, consultar até obter protocolo de autorização.
4. Preparar MDF-e 3.00b referenciando o CT-e autorizado e dados corretos da viagem.
5. Após a viagem, consultar e registrar o encerramento do MDF-e.
6. Armazenar XML e protocolo autorizados, preservar cancelamento e eventos de correção.

Documentação:
- https://doc.focusnfe.com.br/reference/emitir_cte
- https://doc.focusnfe.com.br/reference/emitir_mdfe
- https://doc.focusnfe.com.br/reference/encerrar_mdfe
- https://www.cte.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=0xlG1bdBass%3D

Ainda não estão disponíveis no projeto de produção: tokens do autorizador, eventos SEFAZ reais, consentimento Gmail OAuth ou validação fiscal da sequência/natureza tributária.
