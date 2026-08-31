# MedPronto — Módulo de Cobrança (especificação modular)

**Status do documento:** especificação aprovada para implementação incremental.  
**Relacionado:** `docs/Plano_MedPronto_v2.md` (clínico), `docs/MODULO_ADMISSIONAL.md` (admissional clínico), `docs/MODULO_FICHAS_CLINICAS.md` (templates de prontuário de consulta), `docs/INTEGRIDADE_VINCULOS.md` (vínculos paciente/médico/conta), `docs/REGRAS_INFRA.md` (infra).  
**Este documento passa a reger a parte de cobrança/receita da clínica** e substitui a menção genérica “financeiro fora de escopo” do plano v2 **somente para cobrança de procedimentos** (não inclui despesas, NF, TISS, estoque).

---

## 0. Como usar este arquivo

Cada bloco **M0…M10** é um pacote independente de implementação.  
Peça explicitamente, por exemplo: *“implementa M1”* ou *“implementa M2 e M3”*.

| Bloco | Nome resumido | Depende de |
|-------|---------------|------------|
| **M0** | Fundação (nomenclatura, permissões, migration vazia) | — |
| **M1** | Cadastros: convênios, procedimentos, tabela de preços | M0 |
| **M2** | Conta do atendimento + itens de cobrança | M0, M1 |
| **M3** | Integração agenda / check-in | M2 |
| **M4** | Médico solicita procedimento na consulta | M2 |
| **M5** | Pagamentos, fechamento e baixa | M2 |
| **M6** | Caixa do dia (recepção) | M2, M5 |
| **M7** | Anexo de resultado de exame no item | M2, exames_anexos existente |
| **M8′** | Vínculo admissional ↔ item de conta | M2, **A1** (`MODULO_ADMISSIONAL.md`) |
| **M9** | Convênio: faturamento manual (guia/senha) | M2, M5 |
| **M9′** | Convênio repasse mensal (`exige_guia`) | M9 |
| **M10** | Relatórios básicos de cobrança | M5, M6 |
| **M11** | Baixa: recebimento do convênio (pós-repasse) | M9, M10 |

**Legenda de status** (atualizar ao implementar):

- `[ ]` pendente  
- `[~]` em andamento  
- `[x]` concluído  

**Roteiro:** ordem de blocos **M0…M10** e *próxima etapa* em `Plano_MedPronto_v2.md` **§15**.

---

## 1. Nomenclatura obrigatória (evitar confusão clínica × financeira)

| Termo no sistema | Significado | **Não confundir com** |
|------------------|-------------|------------------------|
| **Receituário** / `receitas` (tabela existente) | Prescrição médica de medicamentos | Cobrança |
| **Conta do atendimento** | Episódio financeiro de **um horário** (ou walk-in no dia) | Agendamento isolado |
| **Item de cobrança** | Linha faturável (consulta, eletro, endoscopia…) | Item de receituário |
| **Pagamento** | Registro manual de valor recebido (PIX, cartão…) | Integração bancária |
| **Baixa** | Conta fechada + pagamento registrado (ou marcada “a faturar convênio”) | Baixa contábil / NF |
| **Convênio** | Plano operadora ou “Particular” | TISS / autorização online |

**Prefixo sugerido no banco e na API:** `cobranca_` (tabelas), rotas `/api/cobranca/…`, módulo de permissão `cobranca`.

---

## 2. Escopo

### 2.1 Dentro (v1 deste módulo)

- Cobrança de **procedimentos/atendimentos** (consulta, endoscopia, eletro, audiometria, admissional, etc.).
- Preço por **procedimento × convênio**.
- **Conta do atendimento** com itens editáveis até fechamento.
- **Formas de pagamento manuais:** PIX, crédito, débito, dinheiro, transferência.
- Pagamento **antes**, **depois** ou **misto** (parcial + complemento).
- Inclusão de procedimentos **durante a consulta** (ex.: consulta → eletro no mesmo dia).
- **Convênio** com fechamento “a faturar” (campos manuais de guia, sem TISS).
- **Admissional:** cobrança do procedimento via **M8′**; formulário clínico em `docs/MODULO_ADMISSIONAL.md`.
- Demais exames auxiliares: **anexo** de resultado (M7), sem laudo estruturado por tipo.

### 2.2 Fora (não implementar neste módulo)

- Despesas, DRE, fluxo de caixa de saídas.
- Nota fiscal, TISS, integração contábil.
- PIX automático, maquininha, gateway.
- Laudos clínicos estruturados por exame (eletro, endoscopia…).
- Repasse médico (apenas reservar campo `executado_por` nos itens para uso futuro).
- Estoque e farmácia.

---

## 3. Conceito central: Conta do atendimento

O **horário na agenda** (`agendamentos.id`) é a unidade financeira quando há agendamento.

```
Agendamento (1 horário)
        ↓
Conta do atendimento (1:1 com o horário; convênio do slot)
        ↓
Itens de cobrança (N procedimentos) — status próprio
        ↓
Pagamento(s) manual(is)
        ↓
Fechamento / baixa
```

**Regras:**

1. **Um horário = uma conta.** Dois horários no mesmo dia (mesmo paciente, convênios iguais ou não) = duas contas.
2. Procedimento **agendado para outro dia** → **outra conta** na data daquele horário.
3. Walk-in sem agendamento → uma conta ativa por `paciente_id` + `data` (`agendamento_id` NULL).
4. Conta permanece **em aberto** enquanto puder entrar item ou pagamento; **fechamento** trava edição de itens (reabrir só com permissão admin).

---

## 4. Status e fluxos

### 4.1 Status da conta

| Status | Significado |
|--------|-------------|
| `em_aberto` | Itens e pagamentos podem ser incluídos/alterados |
| `aguardando_pagamento` | Itens definidos; saldo pendente |
| `pago` | Total quitado (particular) |
| `parcialmente_pago` | Houve pagamento; ainda há saldo |
| `a_faturar_convenio` | Fechada; cobrança via operadora (sem dinheiro na recepção) |
| `isento` | Cortesia/isenção registrada |
| `cancelada` | Conta anulada (com motivo) |

### 4.2 Status do item de cobrança

| Status | Significado |
|--------|-------------|
| `previsto` | Veio do agendamento / expectativa na chegada |
| `solicitado` | Médico ou recepção incluiu (ex.: eletro na consulta) |
| `realizado` | Procedimento/exame executado |
| `cancelado` | Não será cobrado |

**Regra de total:** por padrão, somar itens `previsto`, `solicitado` e `realizado`; `cancelado` não entra. Configuração futura opcional: cobrar só `realizado` (documentar na clínica qual regra adotar — padrão do sistema: **cobrar solicitado+realizado** para não esquecer na saída).

### 4.3 Fluxo operacional (recepção + consultório)

```
CHEGADA
  → Check-in clínico (já existe)
  → Abrir ou vincular Conta do atendimento (M3)
  → Confirmar convênio
  → Itens previstos (ex.: consulta marcada)

PAGAMENTO ANTECIPADO (opcional)
  → Registrar pagamento parcial ou total do previsto
  → Conta continua em_aberto

CONSULTA
  → Médico pode solicitar itens (M4): eletro, etc.
  → Itens entram como solicitado/realizado

EXAMES DO DIA
  → Marcar realizado quando feito
  → Anexar resultado (M7) — PDF/imagem

SAÍDA
  → Fechar conta (M5)
  → Complemento se pagou antes e surgiram itens
  → Baixa: pagamento(s) ou a_faturar_convenio
```

### 4.4 Pagamento antes vs depois

| Cenário | Comportamento |
|---------|----------------|
| Pagou só consulta antes; surgiu eletro | Baixa parcial na chegada; **complemento na saída** |
| Pagou depois | Baixa **na saída**, após itens do dia definidos |
| Convênio | Fechamento `a_faturar_convenio`; campos guia/senha (M9) |
| Pagamento dividido | Vários registros de pagamento na mesma conta (PIX + dinheiro) |

---

## 5. Clínico × financeiro × anexos

| Tipo de atendimento | Prontuário clínico | Financeiro | Resultado / documento |
|---------------------|-------------------|------------|------------------------|
| Consulta médica | Sim (existente) | Item na conta | Receituário, atestado (existente) |
| Eletro, audiometria, endoscopia… | **Não** laudo próprio | Item na conta | **Anexo** PDF/imagem (M7) |
| Admissional | Formulário leve (**A1–A4**, doc admissional) | Item na conta (**M8′**) | PDF + conclusão apto/inapto |

**Opinião registrada:** não construir laudos estruturados por exame; anexo + metadados cobre a operação. **Admissional clínico** é módulo próprio (`MODULO_ADMISSIONAL.md`); **cobrança do admissional** é só M8′ neste doc.

---

## 6. Permissões

Novos módulos (adicionar em `modulos.ts` quando implementar M0):

| Código | Quem (padrão) | Função |
|--------|---------------|--------|
| `cobranca` | Secretaria, Admin | Caixa, pagamentos, fechamento, cadastros operacionais |
| `cobranca_solicitar` | Médico, Admin | Incluir item solicitado na consulta (sem alterar preço) |
| `cobranca_config` | Admin | Convênios, procedimentos, tabela de preços, descontos |
| `cobranca_relatorios` | Admin | Relatórios (M10) |

### 6.1 Produto único (U1 / U14)

**Decisão:** um repositório, um instalador, um banco (`medpronto.db`), **sempre** clínico + cobrança. Não há SKU `clinico`. Não há picker de edição. Não há 403 “edição não inclui cobrança”.

O teto do que o login pode fazer é **só** `usuario_permissoes` (módulos). Admin liga/desliga `cobranca*` por usuário.

`app_meta.edicao` pode continuar gravado como valor legado (`clinico_cobranca`) para bases antigas; o runtime **não** ramifica por esse campo. Campo `ed` na licença é **obsoleto** e ignorado (`syncEdicaoFromLicense` nunca rebaixa).

Instalador e atualização **não perguntam** edição. `GET /api/auth/me` **não** devolve `edicao` / `modulos_edicao`.

**Secretaria:** não acessa prontuário; acessa cobrança se tiver o módulo `cobranca`.  
**Médico:** solicita procedimentos se tiver `cobranca_solicitar`; não registra pagamento por padrão.  
**Admin:** todos os módulos por padrão.

Histórico M0 (duas edições comerciais) ficou para trás na unificação — ver `PLANO_UNIFICACAO_ATENDIMENTO.md`.

---

## 7. Modelo de dados (visão geral)

Migration sugerida: `008_cobranca.sql` (criada em M0; tabelas preenchidas conforme blocos).

### 7.1 Cadastros (M1)

```
convenios (id, nome, tipo: particular|operadora, ativo)
procedimentos (id, codigo, nome, categoria, ativo)
procedimento_precos (id, procedimento_id, convenio_id, valor_centavos, vigencia_inicio, vigencia_fim?)
```

- Convênio **Particular** é registro fixo (seed).
- Valores em **centavos** (`INTEGER`).
- Retorno (`agendamentos.eh_retorno`): **não** é `tipo_atendimento`; na conta (M3) item previsto = procedimento **“Consulta retorno”**; preço zerado ou reduzido **cadastrado** aqui (M1) por convênio. Desconto manual na conta (M5) só para exceção pontual.

### 7.2 Conta e itens (M2)

```
contas_atendimento (
  id, paciente_id, data, convenio_id,
  agendamento_id,           -- origem principal; nullable se walk-in
  prontuario_id,            -- nullable; preenchido quando consulta abrir prontuário
  status,
  observacao,
  valor_desconto_centavos, motivo_desconto,
  fechada_em, fechada_por,
  created_at, created_by
)

conta_itens (
  id, conta_id, procedimento_id,
  executado_por,            -- usuario_id; reserva repasse futuro
  status,                   -- previsto|solicitado|realizado|cancelado
  valor_centavos,           -- snapshot do preço na inclusão
  quantidade DEFAULT 1,
  solicitado_por, solicitado_em,
  realizado_em,
  exame_anexo_id,           -- M7; nullable
  admissional_id,           -- M8′; nullable — ver MODULO_ADMISSIONAL.md
  observacao
)
```

### 7.3 Pagamentos (M5)

```
conta_pagamentos (
  id, conta_id,
  forma: pix|credito|debito|dinheiro|transferencia,
  valor_centavos,
  registrado_em, registrado_por,
  observacao
)
```

### 7.4 Convênio manual (M9)

```
conta_convenio_guia (
  conta_id PRIMARY KEY,
  numero_guia, senha, autorizacao,
  data_envio, observacao
)
```

### 7.5 Admissional (M8′ — só vínculo financeiro)

Tabela **`admissionais`** definida em `docs/MODULO_ADMISSIONAL.md` (módulo clínico).

Neste módulo de cobrança, apenas:

```
conta_itens.admissional_id INTEGER REFERENCES admissionais(id)  -- nullable
```

Regra: item procedimento “Admissional” na conta aponta para o registro clínico finalizado (ou em andamento — definir na implementação M8′).

### 7.6 Auditoria

Reutilizar `log_acesso` com ações: `cobranca_item_add`, `cobranca_pagamento`, `cobranca_fechamento`, `cobranca_desconto`, `cobranca_reabrir`.

---

## 8. Integração com o que já existe

| Existente | Integração |
|-----------|------------|
| `agendamentos` | Check-in abre/vincula conta (M3); `procedimento_id` = item previsto no check-in |
| `agendamentos.eh_retorno` | M3: item previsto = **“Consulta retorno”**; preço de M1 (zerado/reduzido por convênio) |
| `prontuarios` | Conta pode referenciar `prontuario_id`; médico solicita item na tela de atendimento (M4) |
| `fichas_template` | **Independente** — ver `MODULO_FICHAS_CLINICAS.md`; ficha escolhida não altera convênio/preço |
| `exames_anexos` | Vincular `exame_anexo_id` no item (M7) |
| `admissionais` | Vincular `admissional_id` no item (M8′) — tabela clínica em `MODULO_ADMISSIONAL.md` |
| `usuario_permissoes` | Novos módulos `cobranca*` (M0) |
| Backup ZIP | Sem mudança: novas tabelas no mesmo `medpronto.db` |
| Integridade | Regras de conta↔paciente e item↔conta: `INTEGRIDADE_VINCULOS.md` §2.4 e bloco **I4** `[x]` |

---

## 9. Blocos de implementação (detalhe)

### M0 — Fundação `[x]`

**Objetivo:** preparar permissões, rotas vazias, migration inicial, menu placeholder.

**Entregas:**
- Migration `008_cobranca.sql` (tabelas vazias ou só `convenios` seed Particular).
- `cobranca*` em `MODULOS`, labels, defaults secretaria/admin.
- Router `/api/cobranca` com `requireModulo('cobranca'…)` (gates de edição removidos em U1/U14).
- Item menu “Cobrança” visível se o usuário tiver o módulo.
- Atualizar checklist deste doc e `Plano_MedPronto_v2.md` (seção 12).

**Aceite (histórico M0; supersedido por U1/U14):** usuário com `cobranca` vê o menu; sem módulo → 403 na rota. Não há edição `clinico`.

---

### M1 — Cadastros `[x]`

**Objetivo:** convênios, procedimentos, tabela procedimento × convênio.

**Telas:**
- Config → Cobrança → Convênios
- Config → Cobrança → Procedimentos
- Config → Cobrança → Tabela de preços (grid procedimento × convênio)

**API (exemplos):**
- `GET/POST/PUT /api/cobranca/convenios`
- `GET/POST/PUT /api/cobranca/procedimentos`
- `GET/PUT /api/cobranca/precos` (matriz ou por par)

**Regras:**
- Não excluir procedimento com item em conta (soft delete `ativo=0`).
- Particular não pode ser excluído.

**Aceite:** admin cadastra “Consulta”, “Eletro”, preços Particular e Unimed.

---

### M2 — Conta + itens `[x]`

**Objetivo:** CRUD da conta do atendimento e linhas, sem pagamento ainda.

**Telas:**
- Cobrança → Conta (detalhe): paciente, data, convênio, lista de itens, total.

**API:**
- `POST /api/cobranca/contas` (abrir)
- `GET /api/cobranca/contas/:id`
- `GET /api/cobranca/contas?data=&paciente_id=`
- `POST /api/cobranca/contas/:id/itens`
- `PATCH /api/cobranca/contas/:id/itens/:itemId` (status, cancelar)
- `DELETE` ou cancelar item (nunca hard delete se pagamento existir — M5)

**Regras:**
- Ao incluir item, snapshot `valor_centavos` da tabela de preços (convênio da conta).
- Alterar convênio da conta recalcula itens **não pagos** (confirmar com usuário).

**Aceite:** abrir conta, adicionar consulta + eletro, total correto.

---

### M3 — Agenda / check-in `[x]`

**Objetivo:** conta nasce no check-in.

**Telas:**
- Agenda ou fila recepção: indicador “Conta aberta” / botão “Cobrança”.
- Modal ou painel lateral da conta do agendamento.

**Regras:**
- Check-in (`presente`) → criar **a conta daquele horário** se não existir; itens `previsto` = procedimentos da lista N:N (`agendamento_procedimentos`).
- Convênio: o do horário (`agendamentos.convenio_id`); default no agendar = último do paciente ou Particular.
- ASO (`modo_clinico = aso`) também gera conta no check-in.

**Aceite:** check-in → conta visível com os procedimentos do horário; retorno → item “Consulta retorno”; dois horários no mesmo dia → duas contas.

---

### M4 — Solicitação na consulta `[x]`

**Objetivo:** médico adiciona procedimento durante atendimento.

**Telas:**
- Atendimento: bloco “Procedimentos / cobrança” (só solicitar, sem valores se perfil médico sem `cobranca`).

**API:**
- `POST /api/cobranca/contas/:id/itens` com `requireModulo('cobranca_solicitar')`

**Regras:**
- Médico não altera preço nem registra pagamento.
- Item entra `solicitado`; recepção marca `realizado` quando aplicável.

**Aceite:** na consulta, médico adiciona eletro; recepção vê na conta.

---

### M5 — Pagamentos e fechamento `[x]`

**Objetivo:** baixa manual, parcial, complemento, desconto.

**Telas:**
- Conta → Registrar pagamento (forma + valor)
- Conta → Fechar conta
- Conta → Reabrir (admin)

**API:**
- `POST /api/cobranca/contas/:id/pagamentos`
- `POST /api/cobranca/contas/:id/fechar`
- `POST /api/cobranca/contas/:id/reabrir` (admin)
- `PATCH /api/cobranca/contas/:id` (desconto)

**Regras:**
- **Total líquido** = soma dos itens cobráveis − `valor_desconto_centavos`.
- **Desconto:** valor (centavos) + `motivo_desconto` **obrigatório** se desconto > 0; registrar em `log_acesso` (`cobranca_desconto`).
- **Isenção / cortesia:** desconto 100% ou status `isento` com motivo.
- Soma dos **pagamentos** vs total líquido na baixa.
- Fechar com saldo → `parcialmente_pago` ou bloquear (config: **bloquear fechamento se saldo > 0** exceto convênio).
- Convênio: fechar como `a_faturar_convenio` sem pagamento em dinheiro.
- Pagamento antecipado não impede novos itens; na saída exige complemento ou estorno manual (registrar observação).

**Aceite:** pagamento parcial antes, eletro depois, complemento na saída, conta `pago`; desconto com motivo e total líquido correto; isenção sem recebimento.

---

### M6 — Caixa do dia `[x]`

**Objetivo:** visão recepção de contas do dia.

**Telas:**
- Cobrança → Caixa do dia (filtro data): contas em aberto, aguardando, pagas, totais por forma.

**API:**
- `GET /api/cobranca/caixa?data=`

**Aceite:** secretaria vê todas as contas de hoje e saldo pendente.

---

### M7 — Anexo de exame no item `[x]`

**Objetivo:** ligar resultado PDF ao item (eletro, audiometria…).

**Telas:**
- Item da conta → Anexar resultado (reusa fluxo `exames_anexos`)
- Paciente / atendimento: ver anexo pelo item

**Regras:**
- Criar `exames_anexos` com `prontuario_id` nullable se exame sem consulta clínica.
- Preencher `conta_itens.exame_anexo_id`.

**Aceite:** eletro realizado → PDF anexado → visível na conta e no paciente.

---

### M8′ — Vínculo admissional ↔ cobrança `[x]`

**Objetivo:** ligar item de conta ao admissional clínico já existente (**A1** em `MODULO_ADMISSIONAL.md`).

**Pré-requisito:** A1 (formulário) + M2 (conta) + procedimento “Admissional” em M1.

**Telas:**
- Conta: adicionar item “Admissional” → selecionar admissional do dia/paciente ou criar atalho para A1
- Admissional finalizado: indicador “Cobrança pendente / vinculada”

**API:**
- `PATCH /api/cobranca/contas/:id/itens/:itemId` → `{ admissional_id }`
- `GET /api/cobranca/contas/:id/itens?sugerir_admissional=1`

**Regras:**
- Não duplicar formulário admissional neste módulo.

**Aceite:** item admissional ligado ao registro clínico (`conta_itens.admissional_id`).

---

### M9 — Guia convênio manual `[x]`

**Objetivo:** campos para faturamento posterior sem TISS.

**Telas:**
- Conta convênio → Guia / senha / autorização

**Aceite:** conta fechada `a_faturar_convenio` com nº guia preenchido (quando `exige_guia = 1`).

---

### M9′ — Convênio repasse mensal (`exige_guia`) `[x]`

**Objetivo:** convênios que **não** exigem guia/senha por atendimento (ex.: prefeitura).

**Implementação:** `convenios.exige_guia`; migration `028_convenio_exige_guia.sql`; cadastro em Convênios; fechamento sem nº guia.

**Aceite:** prefeitura cadastrada com repasse mensal → encerrar conta → relatório M10 agrupa atendimentos do mês.

**Detalhe operacional:** §14.5 e §14.6 deste documento.

---

### M10 — Relatórios `[x]`

**Objetivo:** visão gerencial mínima.

**Relatórios:**
- Receita por período (particular recebido vs convênio a faturar)
- Por procedimento
- Por convênio
- Por forma de pagamento

**Aceite:** admin exporta ou visualiza período no navegador.

---

## 10. Casos de borda (referência rápida)

| Caso | Tratamento |
|------|------------|
| Paciente não veio | Sem conta ou conta cancelada; sem baixa |
| Desistiu do eletro após pagar | Cancelar item; estorno manual (observação + ajuste pagamento) |
| Exame só amanhã | Nova conta amanhã; item **não** entra na conta de hoje |
| Isenção / cortesia | Desconto 100% ou status `isento` com motivo |
| Retorno gratuito | Procedimento preço zero ou flag retorno na agenda |
| Médico diferente por procedimento | `executado_por` no item |
| Reabrir conta errada | Só admin; log auditoria |

---

## 11. Ordem recomendada de pedidos

```
A0 → A1 → … (admissional clínico — ver MODULO_ADMISSIONAL.md; independente)

M0 → M1 → M2 → M3 → M5 → M6 → M4 → M7 → M8′ → M9 → M9′ → M10 → M11 [x]
```

**Admissional clínico (A0–A4)** pode ser feito **antes ou em paralelo** à cobrança.  
M5 antes de M4 é opcional. M7/M8′ após M2 estável.

---

## 12. Atualização do Plano v2

Quando **M0** for implementado, alterar em `Plano_MedPronto_v2.md`:

- Linha “Fora de escopo: financeiro” → “Cobrança: ver `docs/MODULO_COBRANCA.md`”.
- Incluir módulos `cobranca*` na tabela de permissões (seção 2.2).

---

## 13. Histórico do documento

| Data | Alteração |
|------|-----------|
| 2026-06-27 | Versão inicial — especificação modular cobrança/receita |
| 2026-06-27 | Seção 6.1 — edições do produto (`clinico` vs `clinico_cobranca`); M0 ampliado |
| 2026-06-27 | M8 → **M8′** (só vínculo financeiro); admissional clínico em `MODULO_ADMISSIONAL.md`; edição `clinico` inclui admissional |
| 2026-06-28 | Referência `MODULO_FICHAS_CLINICAS.md`; M3 retorno → Consulta retorno; M5 desconto/isenção detalhados |
| 2026-07-06 | §14 operação convênio (guia de uso); §15 futuro M11; M9′ `exige_guia` implementado |
| 2026-08-21 | U14: §3 conta = horário; §6.1 produto único; M3 itens da lista N:N |
| 2026-08-21 | Convênio/prefeitura: Receber conta (à vista + desconto) na mesma tela do faturar |

---

## 14. Operação convênio — guia de uso (estado atual)

**Base:** conversa de produto 2026-07-06. Descreve o que **já está implementado** (M0–M10 + M9′) e o que **ainda não existe** (M11).

### 14.1 Dois significados de “pagamento OK”

| Significado | Particular | Convênio (operadora / prefeitura) |
|-------------|------------|-------------------------------------|
| Paciente paga na recepção (à vista, com desconto se houver) | **Receber conta** → `pago` | **Receber conta** → `pago` (mesmo fluxo) |
| Paciente liberado sem pagar na hora | — | **Faturar convênio** / faturamento mensal → `a_faturar_convenio` |
| Dinheiro do convênio na conta da clínica (repasse) | — | M11: registrar recebimento do convênio |

Na agenda/fila, **Conta paga** (verde) aparece com status `pago` — particular **ou** convênio recebido à vista. Convênio só faturado mostra **A faturar**.

### 14.2 Status dos itens de cobrança

| Status | Significado | Quem / quando |
|--------|-------------|---------------|
| `previsto` | Procedimento esperado na chegada (agenda) | **Automático** no check-in (`presente`) |
| `solicitado` | Incluído na consulta ou pela recepção | **Médico** (`cobranca_solicitar`) ou **secretaria** ao adicionar item |
| `realizado` | Procedimento/exame executado | **Secretaria** — dropdown na conta (`cobranca`) |
| `cancelado` | Não entra no total | Remover item na conta |

**Total da conta:** soma `previsto` + `solicitado` + `realizado` (padrão do sistema — evita esquecer cobrança na saída).

### 14.3 Fluxo particular (referência)

```
Check-in → itens → Receber conta (desconto, forma PIX/cartão/dinheiro)
         → status pago → botão verde na agenda
```

Bloco **Receber conta** (desconto, forma, valor) aparece em **toda conta em aberto**, inclusive convênio/prefeitura (à vista após a consulta). **Faturar convênio** continua disponível na mesma tela, se o paciente não pagar na recepção.

### 14.4 Fluxo convênio — recepção (hoje)

```
Check-in → conta em aberto → confirmar convênio e itens
         → marcar realizado quando aplicável
         → SAÍDA:
              operadora com guia → Faturar convênio (nº guia obrigatório se exige_guia)
              repasse mensal     → Encerrar para faturamento mensal (sem nº guia)
         → status a_faturar_convenio → conta travada → volta à agenda
```

**Quando fechar:** itens corretos, procedimentos `realizado` quando feitos, convênio certo.

**Após fechar:** não há toast de confirmação (decisão UX 2026-07-06). A tela volta à origem (agenda / contas do dia).

**Correção:** admin → **Reabrir conta** na tela da conta → edita → fecha de novo.

### 14.5 M9′ — Convênio com e sem guia por atendimento `[x]`

Migration `028_convenio_exige_guia.sql`. Campo `convenios.exige_guia` (default `1`).

| Configuração | Cadastro | Fechamento na conta |
|--------------|----------|---------------------|
| **Exige guia** (padrão; ex.: plano de saúde) | Cobrança → Convênios → ☑ Exige guia por atendimento | Nº guia obrigatório; senha/autorização/data envio opcionais |
| **Repasse mensal** (ex.: prefeitura) | Mesmo tipo `operadora`, ☐ Exige guia | Só observação opcional; botão **Encerrar para faturamento mensal** |

**Prefeitura / município:** a clínica atende com folha de autorização em papel (fora do sistema); no fim do mês gera **Relatórios → Faturamento convênio** (paciente + procedimentos + totais) e envia para pagamento. Não há TISS nem guia eletrônica por atendimento.

### 14.6 Repasse mensal — fim do mês (hoje)

1. Cobrança → **Relatórios** → aba **Faturamento convênio**
2. Filtrar período e convênio (ex.: Prefeitura X)
3. Exportar PDF e enviar ao convênio

O **pagamento do convênio na conta bancária** não é registrado no MedPronto hoje — conciliação fica externa (planilha, banco, NF).

### 14.7 O que o botão “A faturar” **não** faz hoje

- Na **agenda**, “A faturar” é **rótulo** de conta já fechada — não é ação na tela de itens.
- **Não** libera bloco de pagamento (desconto / forma / dia) — esse bloco **não existe** para operadora.
- **Não** muda status para `pago` quando o convênio deposita.

Ideia discutida para **M11** (abaixo): segunda etapa “registrar recebimento do convênio”.

---

## 15. M11: baixa do recebimento do convênio `[x]`

**Objetivo:** depois que a operadora/prefeitura paga o repasse, marcar a conta (ou lote) como quitada no sistema — equivalente ao **Pago** do particular, mas **sem** dinheiro na recepção no dia do atendimento.

### 15.1 Problema que resolve

Hoje todas as contas convênio ficam eternamente em `a_faturar_convenio`. O caixa/relatório não distingue “já recebemos do convênio” vs “ainda aguardando repasse”. O botão verde **Conta paga** nunca aparece para convênio.

### 15.2 Fluxo proposto (duas etapas)

```
ETAPA 1 — Recepção (já existe — M9 / M9′)
  Itens OK → Faturar convênio / Encerrar repasse mensal
  → status a_faturar_convenio
  → paciente liberado; conta travada para itens

ETAPA 2 — Financeiro (M11 — novo)
  Quando o convênio pagar (dia do crédito ou após conferir extrato):
  → abrir conta com status a_faturar_convenio
  → Registrar recebimento do convênio
  → status pago (+ data e valor opcionais)
  → botão verde na agenda / relatório “recebido vs a faturar”
```

**Não confundir** com **Receber conta** do particular: etapa 2 é **posterior**, feita por quem faz conciliação (admin ou financeiro), não pela secretaria na saída do paciente.

### 15.3 Telas (rascunho)

| Onde | O quê |
|------|--------|
| Conta `a_faturar_convenio` | Botão **Registrar recebimento do convênio** (substitui expectativa de “liberar pagamento/dia/forma” na recepção) |
| Mesmo painel | Data do crédito, valor recebido (default = total líquido), observação (ex.: “Repasse mar/2026 — NF 123”) |
| Opcional | Baixa em **lote** a partir do relatório faturamento convênio (marcar várias contas do período de uma vez) |
| Caixa / Relatórios | Separar **a faturar** (pendente repasse) vs **pago convênio** (recebido) |

### 15.4 API (rascunho)

```
POST /api/cobranca/contas/:id/receber-convenio
Body: { data_recebimento?, valor_centavos?, observacao? }
Pré: status === 'a_faturar_convenio'
Pós: status === 'pago'; opcional registro em conta_pagamentos com forma 'repasse_convenio'
```

Alternativa: `PATCH` com `modo: 'baixa_convenio'` em endpoint de fechamento já existente — preferir rota explícita para auditoria.

### 15.5 Regras de negócio

- Só conta `a_faturar_convenio` pode receber baixa convênio.
- Valor recebido default = total líquido; permitir valor diferente + observação (glosa parcial, futuro).
- `conta_pagamentos`: nova forma `repasse_convenio` (ou `convenio`) — não misturar com PIX/dinheiro da recepção.
- Log em `log_acesso`: `cobranca_baixa_convenio`.
- Reabrir conta após baixa: só admin; mesmo padrão de `reabrirConta` atual.
- **Não** reabrir itens na etapa 2 — só baixa financeira.

### 15.6 Aceite (critério de pronto M11)

- [x] Conta prefeitura fechada sem guia → depois de “Registrar recebimento” → status `pago`, botão verde na agenda.
- [x] Relatório período: total **a faturar** diminui e **recebido convênio** aumenta.
- [x] Particular inalterado (`Receber conta` na saída).
- [x] Baixa em lote: selecionar contas do período → baixar todas.

### 15.7 Dependências e ordem

```
M9′ [x] → M10 [x] → M11 [x]
```

Atualizar `Plano_MedPronto_v2.md` §15.3 ao implementar M11.

### 15.8 Decisões já tomadas (não reabrir sem pedido)

- Convênio **não** usa “Receber conta” na saída do paciente.
- `a_faturar_convenio` = OK na **recepção**, não = pago pelo convênio.
- Repasse mensal sem guia por atendimento = `exige_guia = 0` (M9′).
- Sem toast “Conta encaminhada para faturamento” ao fechar convênio.

### 15.9 Fora de escopo de M11

- TISS / autorização online
- Nota fiscal eletrônica
- Conciliação bancária automática (OFX)
- Glosa e recurso por item (fase posterior opcional M12)
