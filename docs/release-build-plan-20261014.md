# Prime Finance — pacote consolidado de deploy

## Escopo técnico
Uma única alteração integra o pacote Premium (PR #29), a IA econômica (PR #31) e a preparação do emissor fiscal (PR #30).

## Cuidados para reduzir builds Vercel
- Não mesclar os PRs #29 e #30 separadamente na main.
- Validar nesta ramificação: CI GitHub, lint, build, test:ai e test:fiscal, RLS e migrações Supabase.
- Não gerar previews a cada correção; consolidar commits localmente/CI e fazer **uma única publicação de produção** quando todas as verificações passarem e o limite de builds permitir.
- A publicação final só deve ser considerada pronta após Vercel READY, alias final confirmado e testes de ponta a ponta.
- Não contratar Pro nem ativar deploy pago sem nova autorização.

## Restrições fiscais
O painel /fiscal cria somente rascunhos de CT-e. Ainda **não** emite CT-e nem MDF-e autorizado; não transmite documentos reais à SEFAZ. Validar o certificado A1 com arquitetura segura (segredo nunca em GitHub), números/séries, credenciamento, homologação, tributação, cancelamento, encerramento e requisitos antes de liberar emissão.

## Ordem de entrega
1. Testar integração financeira Premium e IA Luna/Sol sem movimentos reais.
2. Testar importação manual NF-e, CIOT, isolamento Supabase e duplicatas.
3. Verificar Google OAuth e WhatsApp Evolution Go com os consentimentos existentes.
4. Fazer apenas um deploy consolidado quando o produto viável estiver pronto, sem bloquear as atualizações financeiras pela falta do emissor SEFAZ homologado.

**O pacote é candidato de integração, não certificado de aplicação totalmente pronta.**

## Revisão de segurança e integração — 14/10/2026

### Validado sem deploy Vercel
- Branch consolidada `feat/prime-ai-economy-routing`, PR #31; não mesclar #29/#30 separadamente.
- CI GitHub: lint, TypeScript, build Next.js, testes do roteamento econômico da IA, parser de NF-e e payload `item/updated` da Pluggy.
- Pluggy: remover assinatura de `transactions/created` deste fluxo porque o payload tem `transactionIds`, não `itemId`. O importador atual depende da atualização concluída do Item (`item/updated`). Contrato documentado em https://docs.pluggy.ai/en/reference/webhooks.
- Supabase: migrações de Premium/Fiscal e guardas de credor, trabalhador e classificação bancária aplicadas. Política de credor recorrente corrigida com qualificação explícita `prime_recurring_bills.workspace_id`.
- Verificação RLS somente leitura: identidade UUID de teste sem acesso observou 0 conexões, 0 movimentos e 0 pareamentos; contexto de proprietário conseguiu consultar seus dados. Nenhum lançamento financeiro de teste foi criado.
- Env Vercel: chaves de Pluggy, Evolution Go, OpenAI e cron existem em produção (valores secretos não inspecionados nem exportados).
- Fiscal: scripts testam apenas interpretação sintática de NF-e e criação de rascunhos no código; nenhuma emissão SEFAZ ou assinatura A1.

### Ainda NÃO validado
- Atualização real do Itaú/Bradesco/Inter após novo evento Pluggy, envio e resposta de mensagem pela Evolution Go; no banco há somente uma conexão Pluggy ativa.
- Login autenticado e fluxo de cadastro/edit/exclusão e importação fiscal real em domínio de produção da branch consolidada.
- Chamadas reais de IA com credencial do projeto, encargos/limites e recuperação de erros; testes offline validam roteamento, não inferência.
- Execução real dos cronjobs nas datas/horários corretos e entrega dos relatórios. Nenhuma cobrança de teste deve ser enviada a terceiros.
- Recebimento Gmail OAuth automático dos XMLs (necessita consentimento do titular).
- Emissão de CT-e/MDF-e: fora do escopo desta versão, exigindo A1 seguro, motor, credenciamento e homologação oficiais.

### Gate único de produção
1. Reexecutar CI completo para o HEAD do PR #31 após as últimas correções.
2. Revisar migrações aplicadas e conferir autorização e ausência de efeitos financeiros.
3. Confirmar liberação de quota Vercel sem gerar builds para verificar.
4. **Apenas um merge do PR #31 para main**, disparando um único deploy de produção; não mesclar #29/#30 isoladamente.
5. Exigir Vercel READY e alias `prime-finance-ochre.vercel.app` no commit consolidado, depois fazer testes HTTP e de autenticação/integracão permitidos.
6. Se houver bloqueio ou teste não executável, declarar o estado incompleto e a ação mínima necessária; não notificar conclusão prematura.
