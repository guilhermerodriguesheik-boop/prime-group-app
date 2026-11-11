# Entregas por volume · Prime Group

Módulo independente das cargas Ortobom, acessível em `/entregas` pelo menu Transporte.

## Ativação

1. Aplicar a migração `supabase/migrations/20261111181500_prime_delivery_control.sql` ao projeto Supabase autorizado (fazer backup e conferir RLS).
2. Implantar esta branch no Next.js/Vercel. O módulo usa o login e o workspace `prime` existentes.
3. Para leitura de foto/PDF, manter `OPENAI_API_KEY` de servidor configurada. Modelo padrão: `gpt-4o-mini`, substituível por `PRIME_VISION_MODEL`. A API da OpenAI tem custo por uso.
4. Testar com uma foto de exemplo. Conferir linha por linha antes de confirmar a importação.

## Fluxo diário

- Informar a **contratante** (cliente que paga o frete) e a data da relação.
- Enviar JPG, PNG, WebP ou PDF até 3 MB, clicar em "Ler imagem / PDF".
- Conferir romaneio, número NF/Pedido, transportadora, destinatário, bairro e **volumes**.
- Campos encobertos/ilegíveis devem ficar vazios; corrigir manualmente ou desmarcar linha antes da importação.
- Importação nunca marca automaticamente como coletado, entregue ou faturado.
- O cadastro deduplica romaneios **por contratante** e não sobrescreve entregas existentes com nova foto.
- Dar baixa no pedido após coleta, saída e entrega, registrando o motorista e os volumes realmente movimentados.
- Registre a data de prestação de contas e uma identificação do comprovante. Com divergência entre volumes informados/coletados/entregues, a prestação é bloqueada.
- No fechamento semanal selecione a contratante e a segunda-feira; exporte a relação CSV e marque faturado após conferência. A gravação do fechamento é transacional; pedidos já faturados ficam bloqueados.

## Regra de cobrança (padrão do MVP)

- Volume faturável = **volume entregue**, desde que igual ao volume informado e ao coletado.
- Cobrança = volumes entregues × tarifa por volume cadastrada no pedido.
- Pedido faturável exige **entrega + prestação de contas + tarifa positiva + volumes coincidentes**.
- Semana de faturamento = segunda a domingo pela **data da prestação de contas** (pode exigir ajuste conforme contrato).
- Não mistura "faturado no piso" ou "aguardando faturamento" do remetente com status de transporte.
- Não emite NF-e nem CT-e automaticamente; o fechamento serve ao relatório comercial para cobrança ao cliente.
- Itens faturados são bloqueados contra edição; qualquer correção posterior exige ajuste documentado separado.

## Limites de escopo

- PDF/imagem é analisado em memória no servidor e não é arquivado no armazenamento nesta primeira versão. Guarde a imagem original da relação e os comprovantes separadamente para auditoria.
- A leitura visual pode errar; **todos** os volumes requerem revisão humana antes de faturar.
- O CSV contém pedidos que estavam abertos e aptos à cobrança no momento da exportação; exporte **antes** de fechar a semana e arquive o CSV.
- Por segurança, os pedidos não são apagados; a tela disponibiliza status de cancelamento para casos operacionais.
