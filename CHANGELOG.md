# Changelog

## 2026-07-16 — Órfãos e segurança da importação

- Corrigida a função transacional do Supabase para converter `issue_date`, `due_date`, `promise_date` e `last_contact_date` de texto ISO para `date`, eliminando a recusa da importação por incompatibilidade de tipos.
- Adicionada reconciliação integral explícita por origem para recuperar carteiras antigas infladas sem remover a trava normal de 70%.
- A reconciliação recalcula as baixas no banco, protege registros manuais e outras origens, exige chave oficial completa e única, grava o estado anterior em auditoria e confirma tudo numa única transação.
- O payload de reconciliação passou a enviar apenas as chaves do relatório atual, evitando transmitir e processar dezenas de milhares de IDs individualmente.
- As listas de alerta e auditoria na tela foram limitadas visualmente para não travar o navegador; as contagens e o plano completo permanecem preservados.

- Corrigido o mapeamento por índice do FINR1253/Topcon: série, número, sequência, NF Serviço, datas, valores, atraso e portador agora seguem o layout real do arquivo.
- `Receb.Prc.` do FINR1253 deixou de ser tratado como valor pago: o saldo em aberto vem da coluna 9 e o total com juros permanece separado na coluna `Receber`.
- Adicionado teste de regressão com a linha real do título 9831/2, incluindo datas seriais do Excel, saldo de R$ 147.900,75 e total a receber de R$ 181.281,95.
- Validado o FINR1253 real completo: 199 títulos, R$ 3.196.048,18 de saldo em aberto e nenhum saldo zerado indevidamente.
- Validado o RPT_7007/EB real completo: 41 títulos e R$ 1.598.198,51 de saldo oficial.
- Adicionado teste ponta a ponta que remove um título de uma importação FINR segura, confirma sua saída da Carteira Geral, sua entrada no Impacto no Caixa e a preservação dos dados manuais.
- Confirmado no arquivo EB real que os títulos 6598 (PREMIX) e 1627 (SUPERTEX) usam o `Saldo` oficial de R$ 9.159,07 e R$ 3.339,53, respectivamente.
- Confirmado `public.titles` como carteira oficial em todo o schema e nas migrations; o adaptador não cria nem grava em `public.titulos`.
- Adicionado indicador global do modo de dados: Supabase, somente neste navegador ou Supabase indisponível com gravações bloqueadas.
- A mensagem final da importação agora diferencia uma gravação no Supabase de uma importação mantida apenas no navegador.
- Identificadores de documento (`REC`, `NF`, `NFE`, `NFSE`, `FAT`, `CTE`, `DUP`, `DUPLICATA`, `TITULO`, `PARCELA`) deixaram de ser aceitos como nomes de cliente na consolidação.
- Mantido o limite mínimo de 70% para baixa automática em massa. O limite existe para impedir que uma planilha filtrada ou incompleta desative grande parte da carteira.
- A cobertura passou a ser calculada separadamente por origem importada, evitando que uma fonte com boa cobertura seja bloqueada por outra fonte incompleta.
- Títulos ativos ausentes de uma fonte coberta agora sempre aparecem como `possibleOrphans`, mesmo quando o limite de 70% bloqueia a automação.
- Possíveis órfãos com fonte exata, chave oficial completa e ocorrência única podem ser aprovados individualmente na auditoria da Pré-validação.
- Registros legados `RPT_E_FINR` aparecem no relatório, mas exigem cobertura dos dois relatórios para não confundir ausência no EB com permanência no Topcon.
- A Pré-validação informa percentual, mínimo de 70%, quantidade bloqueada, fontes não cobertas e lista de títulos para revisão.

Estas travas são complementares: cobertura protege contra baixa em massa indevida; fonte/chave protege cada título individual. Não reduzir o threshold nem ampliar as fontes cobertas sem validar importações parciais, chaves ambíguas e baixa cruzada EB/Topcon.
