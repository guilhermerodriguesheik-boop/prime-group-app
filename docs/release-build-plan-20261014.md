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
