# MedPronto — Financeiro: Contas a pagar e Caixa

Portado do CliniCar (`d:\CliniCar`: migração 016, `contasPagar.ts`, `caixa.ts`, `ContasPagarPage`, `CaixaPage`).

## Menu e permissões

- Menu **Financeiro** → **Contas a pagar** (`/financeiro/contas-pagar`) e **Caixa (entradas e saídas)** (`/financeiro/caixa`).
- Módulos novos: `contas_pagar` e `caixa` (padrão da secretaria e do admin).
- A Cobrança (Caixa do dia da recepção) continua igual.

## Contas a pagar

- Fornecedor digitado livre (cria sozinho; vazio = `DIVERSOS`), categoria de **saída**, documento/NF, descrição, valor, vencimento, forma prevista (boleto mostra a linha digitável), observação.
- Lançamento: **conta única**, **parcelado** (divide o total, 2–60, centavos que sobram na 1ª) ou **repetir todo mês** (2–24; dia 31 vira o último dia do mês curto). Cada parcela ou mês é uma conta própria.
- Cards: em aberto, vencidas, vencem hoje, próximos 7 dias, pagas no mês, todas. Busca por fornecedor/descrição/documento e período (pagas filtram pela data do pagamento).
- **Pagar**: uma conta (com juros/multa e desconto) ou várias marcadas de uma vez. Gera a **saída no Caixa** na data do pagamento, na categoria da conta.
- **Estornar** (conta paga): volta a ficar em aberto; o pagamento fica no histórico e o Caixa recebe uma **entrada "Estorno de conta paga"** com a data de hoje.
- Conta paga não se altera nem se exclui (estorne antes).

## Caixa

- Período (dia, mês, de/até) com setas, Hoje, Este mês, Imprimir.
- Cards: saldo anterior, entradas, saídas, saldo do período, saldo final. Resumos por forma e por categoria.
- Entradas da Cobrança são lidas **direto de `conta_pagamentos`** (não são copiadas): categoria "Atendimentos (cobrança)" ou "Repasse de convênio". Estorno feito na Cobrança some do Caixa sozinho. O nome do paciente abre a conta.
- Lançamento manual de **entrada** (suprimento/troco, outras) ou **saída** (sangria, despesas do dia), com nova categoria na hora. Só lançamento manual se exclui pelo Caixa.
- O saldo anterior soma tudo antes do período (cobrança + caixa_movimentos).

## Dados (migração `059_financeiro_contas_pagar_caixa.sql`)

`caixa_categorias`, `caixa_movimentos` (manual / `conta_pagar_pagamento_id`), `fornecedores`, `contas_pagar`, `contas_pagar_pagamentos` (uma quitação válida por conta).

## API

- `GET/POST /api/contas-pagar`, `PUT/DELETE /api/contas-pagar/:id`, `POST /api/contas-pagar/quitar`, `POST /api/contas-pagar/:id/estornar`, `GET/POST /api/contas-pagar/fornecedores`
- `GET /api/caixa?de=&ate=`, `GET/POST /api/caixa/categorias`, `POST /api/caixa/lancamentos`, `DELETE /api/caixa/lancamentos/:id`

## Teste

`npm run test:fin1 -w backend` (numa cópia do banco).
