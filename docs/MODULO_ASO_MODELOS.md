# MedPronto — Modelos de ASO (vários formulários, como fichas clínicas)

**Status:** AM0–AM5 implementados. Pedir *“implementa AM0”* só se for reabrir um bloco.  
**Relacionado:** `MODULO_ADMISSIONAL.md` (ASO, A5 retificação), `MODULO_FICHAS_CLINICAS.md` (motor de autoria — **não** misturar lista), `INTEGRIDADE_VINCULOS.md`, `PLANO_UNIFICACAO_ATENDIMENTO.md` (U5/U9 congelados).  
**Não é série U.**

---

## 0. Como usar este arquivo

Cada bloco **AM0…AM5** (e **AM1′** opcional) é independente na hora de pedir, mas a **ordem** abaixo é a segura.

| Bloco | Nome resumido | Depende de |
|-------|---------------|------------|
| **AM0** | Fundação: `destino`, colunas, travas, default por destino | A1, A5, F0 |
| **AM1** | Autoria: tela Modelos ASO + seed + campos travados | AM0 |
| **AM1′** | Criar modelo a partir de PDF (fundo + posições) | AM1, F1′ |
| **AM2** | Preencher ASO com o modelo (legado v2 intacto) | AM1 |
| **AM3** | Agenda: escolher modelo só em horário ASO | AM1, U5 |
| **AM4** | Snapshot + retificação copia modelo | AM2, A5 |
| **AM5** | PDF do modelo (legado continua PDFKit) | AM2 |

**Legenda:** `[ ]` pendente · `[~]` em andamento · `[x]` concluído

**Como pedir:** *implementa AM0* — só aquele bloco, aceite da seção do bloco.

---

## 1. Decisões (não reabrir no meio)

1. **Motor das fichas, destino separado.** Reusar editor, duplicar, inativar, PDF de fundo. Coluna `destino TEXT NOT NULL CHECK (destino IN ('prontuario','aso'))`. Templates atuais = `prontuario`.
2. **Tela separada.** Config → **Modelos ASO**. Config → **Fichas clínicas** lista **somente** `destino = prontuario`.
3. **Coluna nova, não a da consulta.** `agendamentos.aso_template_id` e `admissionais.aso_template_id`. **Proibido** gravar modelo ASO em `agendamentos.ficha_template_id` (U5: ficha só com `modo_clinico = prontuario`).
4. **Chrome NR-7 fora do “apagar campo”.** Sempre existem: identificação (paciente/médico/data/nº), **tipo de atestado**, **conclusão** (`admissionais.conclusao` + `restricoes_texto`). O miolo (riscos, exames, empresa, PDF) é o modelo.
5. **Legado sem migração.** ASO já existente sem `aso_template_id` e com `dados_json` versao 2 abre o formulário **atual** e o PDF **atual**.
6. **Retificação A5 permanece.** Folha nova, original intacto, `agendamento_id` NULL, cobrança no original. AM4 só passa a copiar modelo + snapshot.
7. **Um default ASO e um default consulta.** `eh_default` é por `destino` (global `medico_id IS NULL`). O UPDATE que hoje zera **todos** os defaults tem de filtrar `destino`.
8. **Autoria** = `fichas_config` / `fichas_medico`. **Preencher** = `admissional`. Secretaria agenda modelo (AM3); não edita o papel clínico.
9. **Não misturar consulta e ASO no mesmo horário** (já U). Combo de ficha some no ASO; combo de modelo ASO some na consulta.

---

## 2. Proibições

| Não fazer | Por quê |
|-----------|---------|
| Fundir `admissionais` com `prontuarios` | Contrato U11 / U14 |
| Listar modelo ASO na página Fichas clínicas | Médico escolhe CID/retorno num ASO |
| Usar `ficha_template_id` da agenda para ASO | U5 |
| `getDefaultFichaTemplateId()` sem `destino` | ASO padrão vira ficha da consulta (quebra gravíssima) |
| Migrar ASO antigo para template | PDF e dados mudam sem o médico ver |
| Permitir remover `tipo_atestado` / `conclusao` do modelo | NR-7 |
| Trocar modelo em ASO finalizado ou em retificação | Igual consulta |
| Nova série U (U15…) | Fora do contrato de unificação |
| Reabrir ASO finalizado no mesmo `id` | A5 / prontuário |

---

## 3. Objetivo de produto

A clínica monta **vários papéis de ASO** reutilizáveis (admissional “padrão”, periódico empresa X, PDF próprio), como faz com fichas de consulta — **sem** JSON, **sem** misturar com prontuário.

Fluxo:

```
AUTORIA (Config → Modelos ASO)
  → seed padrão OU duplicar OU PDF (AM1′)
  → revisar → ativar → biblioteca ASO

AGENDA (horário com modo aso)
  → opcional: escolher modelo (senão default ASO)
  → check-in → Atender → /admissional/:id

PREENCHIMENTO
  → chrome NR-7 + miolo do modelo
  → Finalizar → snapshot
  → PDF do modelo (ou PDF legado se ASO antigo)

CORREÇÃO
  → Retificar (A5) → folha nova com o mesmo snapshot
```

---

## 4. Modelo de dados (AM0)

```
fichas_template.destino TEXT NOT NULL DEFAULT 'prontuario'
  CHECK (destino IN ('prontuario', 'aso'))

-- um padrão global por destino
CREATE UNIQUE INDEX ... ON fichas_template (destino)
  WHERE eh_default = 1 AND medico_id IS NULL;

agendamentos.aso_template_id INTEGER REFERENCES fichas_template(id)
admissionais.aso_template_id INTEGER REFERENCES fichas_template(id)
admissionais.template_snapshot_json TEXT
```

**Triggers (além da API):**

- `ficha_template_id` no agendamento / prontuário → template `destino = prontuario`.
- `aso_template_id` no agendamento / admissional → template `destino = aso`.
- `aso_template_id` no agendamento só se o horário for ASO (lista com `modo_clinico = aso` / `tipo_atendimento = admissional`).
- `ficha_template_id` no agendamento só se houver consulta (já recusado hoje para não-consulta; endurecer no banco se possível).

**Marcar padrão (código hoje em `fichasTemplate.ts`):** o `UPDATE … SET eh_default = 0 WHERE medico_id IS NULL` **deve** incluir `AND destino = ?`. Sem isso, AM1 quebra consulta.

---

## 5. Campos

### 5.1 Travados no modelo ASO (não remover, não mudar `id`)

| id | tipo | Notas |
|----|------|--------|
| `tipo_atestado` | `escolha` (um valor) | Opções NR-7: admissional, demissional, periodico, retorno_trabalho, mudanca_funcao |
| `conclusao` | `escolha` | `apto` \| `inapto` \| `apto_com_restricao` — **espelha** coluna `admissionais.conclusao` |

Restrições: se conclusão = apto com restrição, `restricoes_texto` obrigatório (já existe na API de finalizar).

### 5.2 Tipo novo `escolha`

Radio de uma opção. Valor em `dados_json`: `string`. Necessário porque fichas hoje têm `marcadores` (vários) e `sim_nao`, não “um entre N”. Consulta **não** precisa ganhar isso no AM0; pode nascer só validado em templates `destino = aso` até alguém pedir na consulta.

### 5.3 Seed “ASO — padrão clínica” (AM1)

Espelhar o checklist atual (`admissionalAso.ts` / `checklist.ts`): empresa, CI, função, riscos (texto + químicos/físicos/acidentes como `marcadores` ou checkboxes), exames, NR-35, observações. `modo = secoes`. `destino = aso`. `eh_default = 1` **só neste destino**.

Não incluir `cid` nem `retorno`.

### 5.4 Identificação

Nome, CPF, médico, ASO nº, data — **não** são campos do template. Continuam no topo da folha (como hoje / como a consulta faz com o paciente).

---

## 6. Blocos

### AM0 — Fundação `[x]`

**Entregas:**

- Migration: `destino` (backfill `prontuario`); índice de default por destino; `aso_template_id` em `agendamentos` e `admissionais`; `template_snapshot_json` em `admissionais`; triggers da §4.
- `getDefaultFichaTemplateId(destino)` (ou função irmã `getDefaultAsoTemplateId`). Toda chamada atual de default de **consulta** passa `prontuario`.
- Marcar padrão filtra `destino`.
- GET lista de fichas: query `destino` (default `prontuario` para não vazar ASO na tela antiga).
- POST agendamento: `aso_template_id` opcional; 400 se horário não for ASO ou template não for `aso`. `ficha_template_id` 400 se template for `aso`.
- Página Fichas clínicas: pede `destino=prontuario` (já o default).
- Teste rollback: criar default ASO **não** altera `getDefaultFichaTemplateId('prontuario')`; agendar consulta com `aso_template_id` → 400; agendar ASO com `ficha_template_id` de gastro → 400.

**Aceite:** abrir consulta e ASO legado iguais a antes; Fichas clínicas sem item novo de ASO.

---

### AM1 — Autoria `[x]`

**Entregas:**

- Menu Config → **Modelos ASO** (`/configuracoes/modelos-aso`), mesmas permissões `fichas_config` / `fichas_medico`.
- Reusar o editor de `FichasClinicasPage` filtrado `destino=aso` (componente compartilhado **ou** página irmã — não ramificar regras de PDF/campos).
- Seed AM1 se AM0 não tiver inserido o padrão ASO.
- Duplicar, editar, inativar, padrão ASO, não apagar o default.
- Validar campos travados ao salvar.
- Tipo `escolha` no editor quando `destino=aso`.

**Aceite:** dois modelos ASO na biblioteca ASO; nenhum deles na lista de Fichas clínicas; default de consulta intacto.

---

### AM1′ — PDF de fundo `[x]`

Mesmo fluxo F1′: upload único, revisão obrigatória, posições `%`, modo `pdf_fundo`. Só em modelo `destino=aso`.

**Aceite:** modelo ASO com PDF da clínica; pré-visualizar; não ativa sem revisão.

---

### AM2 — Preenchimento `[x]`

**Resolução do modelo ao abrir / GET:**

1. Se `admissionais.aso_template_id` (ou snapshot) → render dinâmico.
2. Senão, se horário tem `aso_template_id` → copia para o ASO na abertura.
3. Senão, se existe default ASO **e** o registro é novo (sem `dados_json` v2 preenchido / recém-inserido) → default ASO. **Não** aplicar default em ASO legado que já tem versao 2 sem template.
4. Senão → `AdmissionalFormPage` atual (checklist v2).

**Tela:** chrome identificação + conclusão (coluna) + corpo `FichaCamposCorpo` / `FichaPdfFundoCorpo`. Secretaria continua sem o miolo clínico.

**Trocar modelo:** só `em_preenchimento`, não retificação, não finalizado. Confirmar se já há dados. Recalcular `dados_json` vazio do novo template; **não** apagar `conclusao` da coluna sem perguntar.

PUT/finalizar: `conclusao` na coluna obrigatória como hoje; `dados_json` = campos do modelo (+ tipo_atestado).

**Aceite:** ASO novo com modelo preenche e finaliza; ASO antigo (sem template) abre e finaliza como hoje (se ainda `em_preenchimento`) ou só lê se finalizado.

---

### AM3 — Agenda `[x]`

- Formulário da agenda: se a lista tem `aso` e **não** tem `prontuario`, mostrar **Modelo ASO** (ativos do médico + globais `destino=aso`). Esconder combo de ficha de consulta.
- POST/PATCH `aso_template_id`; ao abrir ASO, copiar para `admissionais`.
- Horário só exame (`nenhum`): sem os dois combos (já hoje).

**Aceite:** secretária agenda ASO escolhendo modelo B; médico Atender abre modelo B. Agenda consulta não mostra modelos ASO.

---

### AM4 — Snapshot e retificação `[x]`

- Finalizar grava `template_snapshot_json` (espelho `TemplateSnapshot` da consulta: id, nome, título, modo, campos, posições).
- GET/histórico/PDF de finalizado usam **snapshot**, não o template vivo.
- `POST /admissionais/:id/retificar` copia `aso_template_id`, `template_snapshot_json`, `dados_json`, conclusão (já copia dados hoje). Sem `agendamento_id`.
- Sem combo trocar modelo na folha de retificação.

**Aceite:** mudar rótulo no modelo depois **não** muda ASO já finalizado; retificação mostra o mesmo papel; original intacto; Consultar na agenda continua no ASO do slot.

---

### AM5 — PDF `[x]`

| Caso | Motor |
|------|--------|
| Sem template / legado v2 | `gerarPdfAdmissional` atual (PDFKit Med Center) |
| Snapshot `secoes` ou `pdf_fundo` | Mesmo caminho do PDF de consulta (F5 / fundo) + faixa RETIFICAÇÃO se `retificacao_de_id` |
| Conclusão / restrições | Sempre a partir das **colunas** do admissional, não só do JSON |

**Aceite:** PDF antigo bit-a-bit no legado; PDF novo no modelo; retificação identificada.

---

## 7. Integração (não mexer)

| Peça | Comportamento |
|------|----------------|
| Check-in / conta | Igual U6; `conta_itens.admissional_id` no **original** |
| Fila / Consultar | `SQL_ADISSIONAL_ID` pelo `agendamento_id` |
| Dashboard | Conta originais (`retificacao_de_id IS NULL`) |
| Zap | Horário ASO já entra; modelo não muda mensagem |
| Receita / CID / atestado de consulta | Não existem no ASO |

---

## 8. Ordem e QA mínimo

```
AM0 → AM1 → AM2 → AM3
         ↘ AM1′ (pode com AM1)
AM2 → AM4 → AM5
```

AM3 pode logo após AM1 se a abertura (AM2) ainda cair no legado: o id fica gravado e AM2 passa a usar.

**QA (além do aceite de cada bloco):**

- [ ] Default consulta inalterado depois de criar/padrão ASO
- [ ] Fichas clínicas sem modelos ASO
- [ ] ASO legado PDF igual
- [ ] Dois modelos, dois horários, papéis diferentes
- [ ] Retificar não duplica horário nem move cobrança
- [ ] Mistura ficha gastro + horário ASO → 400
- [ ] Secretaria não edita miolo; médico com `admissional` sim

---

## 9. Histórico

| Data | Alteração |
|------|-----------|
| 2026-08-26 | AM0–AM5 implementados — biblioteca Modelos ASO, legado v2 intacto |
| 2026-08-26 | Especificação inicial AM0–AM5 — vários ASO como fichas, sem série U |
