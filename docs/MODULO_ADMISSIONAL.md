# MedPronto — Módulo Admissional clínico (especificação modular)

**Status:** especificação para implementação incremental.  
**Relacionado:** `docs/Plano_MedPronto_v2.md` (roadmap clínico), `docs/MODULO_COBRANCA.md` (vínculo financeiro M8′), `docs/MODULO_ASO_MODELOS.md` (vários papéis de ASO).  
**Produto:** um instalador, clínico + cobrança. ASO entra pela agenda como procedimento com `modo_clinico = aso` — ver `PLANO_UNIFICACAO_ATENDIMENTO.md`.

---

## 0. Como usar este arquivo

Cada bloco **A0…A5** é independente. Peça, por exemplo: *“implementa A1”* ou *“implementa A0 e A2”*.

| Bloco | Nome resumido | Depende de |
|-------|---------------|------------|
| **A0** | Fundação: módulo `admissional`, migration, rotas | — |
| **A1** | CRUD admissional + formulário + conclusão | A0 |
| **A2** | PDF + impressão | A1 |
| **A3** | Agenda / fila / check-in (tipo admissional) | A1 |
| **A4** | Histórico no paciente + anexo opcional | A1, `exames_anexos` |
| **A5** | Retificação (folha nova; original intacto) | A1, A4 |

**Legenda:** `[ ]` pendente · `[~]` em andamento · `[x]` concluído

**Roteiro:** ordem dos blocos **A0…A5** e *próxima etapa* em `Plano_MedPronto_v2.md` **§15**.

**Cobrança:** tabela `admissionais` e fluxo clínico vivem **aqui**. No plano Plus, **M8′** em `MODULO_COBRANCA.md` só liga `conta_itens.admissional_id` — implementar **depois** de A1 e M2.

---

## 1. Posição no produto

O ASO é módulo clínico (`admissional` / `admissional_agenda`). A secretária **não** escolhe “tipo admissional”: agenda o procedimento cadastrado com **Abre ASO**. Cobrança do item é M8′ em `MODULO_COBRANCA.md` (sempre disponível se o usuário tiver `cobranca`).

---

## 2. Escopo

### 2.1 Dentro

**Formulário:** modelo ASO (Atestado de Saúde Ocupacional) — referência `docs/referencias/ASO_med_center_modelo.pdf` (clínica med center).
- Conclusão: **apto** | **inapto** | **apto com restrição** + texto de restrições.
- Vínculo: **paciente** + **agendamento** (opcional) + **médico executor**.
- PDF com logo da clínica + conclusão.
- Anexo externo opcional (reusa `exames_anexos`).
- Agenda/fila: o horário abre ASO se a lista tiver procedimento `modo_clinico = aso`.
- **Sem** prontuário clínico completo (não usar ficha consulta longa).

### 2.2 Fora

- Laudos estruturados de eletro/endoscopia (usar anexo — ver `MODULO_COBRANCA` seção 5).
- Cobrança, preço, pagamento (M8′ no doc de cobrança).
- TISS / guia convênio no admissional (fica na conta, M9).

### 2.3 Nomenclatura

| Termo | Uso |
|-------|-----|
| **Admissional** | Este módulo — exame ocupacional |
| **Receituário** / `receitas` | Prescrição — **não misturar** |
| **Prontuário** | Consulta clínica — admissional **não substitui** |

---

## 3. Permissões

Novo módulo em `modulos.ts` (A0):

| Código | Padrão | Função |
|--------|--------|--------|
| `admissional` | Médico, Admin | Preencher formulário, conclusão, PDF |
| `admissional_agenda` | Secretaria, Admin | Agendar, check-in, ver status (sem formulário clínico detalhado) |

**Secretaria:** agenda + check-in; **não** edita checklist clínico nem conclusão (salvo política futura).  
**Médico:** formulário + conclusão + PDF.  
**Admin:** tudo.

Módulos disponíveis no produto único; o admin liga/desliga por usuário.

---

## 4. Modelo de dados

Migration sugerida: `008_admissional.sql` (numeração antes ou depois de `008_cobranca` — **não reutilizar número**; se cobrança usar 008, admissional = **009**, ou vice versa; registrar no repo ao implementar).

```
admissionais (
  id INTEGER PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
  agendamento_id INTEGER REFERENCES agendamentos(id),
  medico_id INTEGER NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'em_preenchimento'
    CHECK (status IN ('em_preenchimento', 'finalizado', 'cancelado')),
  conclusao TEXT CHECK (conclusao IN ('apto', 'inapto', 'apto_com_restricao')),
  restricoes_texto TEXT,
  dados_json TEXT NOT NULL DEFAULT '{}',   -- checklist / campos dinâmicos
  documento_path TEXT,                     -- PDF gerado (A2)
  exame_anexo_id INTEGER REFERENCES exames_anexos(id),
  finalizado_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  created_by INTEGER REFERENCES usuarios(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
)
```

**Agenda (A3):** `agendamentos.tipo_atendimento` permanece coluna **derivada** (U14: a UI usa `modo_clinico`).  
Valores internos: `consulta` | `admissional` | `exame`.

**Cobrança (M8′):** `conta_itens.admissional_id INTEGER REFERENCES admissionais(id)` — nullable.

---

## 5. Fluxo operacional

```
Agenda (procedimento Abre ASO) ou walk-in
  → Check-in (presente) — gera conta do horário
  → Abrir ASO (A1) — formulário
  → Médico preenche checklist + conclusão
  → Finalizar → PDF (A2) + opcional anexo (A4)
  → Status finalizado
  Secretaria: item “Admissional” na conta (M8′)
```

Admissional **no mesmo dia** que consulta: dois fluxos separados (consulta → prontuário; admissional → `admissionais`), podem compartilhar `agendamento_id` só se for **um** slot admissional — não misturar consulta e admissional no mesmo prontuário.

---

## 6. Blocos de implementação

### A0 — Fundação `[x]`

**Entregas:**
- Migration tabela `admissionais` (campos acima).
- `admissional`, `admissional_agenda` em `MODULOS` + defaults.
- Router `/api/admissionais` (ping).
- Menu “Admissional” ou entrada na fila — placeholder.
- `frontend/src/lib/permissoesDefaults.ts` espelho.

**Aceite:** módulo na tela Usuários; rota protegida retorna 403 sem permissão.

---

### A1 — Formulário e CRUD `[x]`

**Telas:**
- `/admissional/:id` — formulário no **layout folha de papel** (`prontuario-papel.css`), igual prontuário.
- Criar admissional a partir da fila ou botão “Novo admissional” (paciente + médico).

**API:**
- `POST /api/admissionais`
- `GET /api/admissionais/:id`
- `PUT /api/admissionais/:id` (salvar em andamento)
- `POST /api/admissionais/:id/finalizar`

**Regras:**
- Finalizado = imutável no original. Correção = **A5** (folha nova; nunca UPDATE do finalizado).
- `dados_json`: checklist inicial em seed ou config admin (fase posterior).

**Aceite:** criar, preencher, conclusão apto/inapto, finalizar.

---

### A2 — PDF `[x]`

**Entregas:**
- `GET /api/admissionais/:id/pdf` — logo clínica, paciente, data, conclusão, restrições.
- Botão imprimir na tela (finalizado) e no histórico; pergunta ao finalizar.

**Aceite:** PDF gerado e aberto no navegador para impressão.

---

### A3 — Agenda e fila `[x]`

**Decisão de fluxo (2026-06-27, revisado 2026-06-28):**
- **Mesmo fluxo da consulta:** cadastrar paciente → agendar (procedimento Abre ASO) → check-in → sala de espera → médico **Atender** abre `/admissional/:id` (sem prontuário).
- **Walk-in no mesmo dia:** recepção agenda na **Agenda** (procedimento ASO; opcional check-in imediato se for hoje) — **sem** botão ou dialog especial.
- **Histórico:** consulta via **Agenda do dia** ou **Sala de espera** (botão Consultar em finalizados); rota `/admissional` redireciona para agenda.
- **Futuro (combo):** botão admissional na tela de consulta para mesmo dia (A3.1).

**Entregas:**
- Campo `tipo_atendimento` no agendamento (migration `010_tipo_atendimento.sql`) — **derivado**; a agenda não expõe combo de tipo.
- Agenda: procedimento `modo_clinico = aso`; fila mostra badge do procedimento.
- Check-in → médico atende → formulário admissional via `POST /api/admissionais/abrir`.
- Finalizar admissional → agendamento `finalizado`.

**Aceite:** agendar ASO pelo procedimento → check-in → abrir formulário sem passar por prontuário consulta.

---

### A4 — Paciente e anexo `[x]`

**Entregas:**
- Lista de admissionais na ficha paciente (metadados: data, conclusão — **sem** prontuário).
- Opcional: vincular `exames_anexos` ao admissional.

**Aceite:** histórico admissional visível; anexo PDF externo associado.

---

### A5 — Retificação `[x]`

Igual à retificação de consulta: **não se edita o ASO finalizado**. Correção = **INSERT** de nova linha em `admissionais`.

**Regras:**
- Só o **original** (`retificacao_de_id IS NULL`) finalizado pode ser retificado.
- Uma **retificação aberta** por original (`retificacao_finalizada = 0`).
- Folha nova com **`agendamento_id = NULL`** — o índice `idx_admissionais_agendamento_unique` continua 1 ASO por horário.
- Agenda / “Consultar” abre o ASO **do slot** (original). A folha nova só pelo histórico do paciente ou pelo próprio formulário.
- `conta_itens.admissional_id` **permanece no original**. Retificação não entra na cobrança.
- Módulo `admissional` (médico/admin). Secretaria (`admissional_agenda`) **não** retifica.
- `POST /api/admissionais/:id/finalizar` só fecha o horário se `agendamento_id` estiver preenchido **e** o slot estiver `em_atendimento`. Retificação não reabre nem altera a agenda.
- Original e retificações **não** vão para `prontuarios` / fichas / receita.

**API:**
- `POST /api/admissionais/:id/retificar` `{ motivo_retificacao }` → 201 folha nova (cópia de checklist/conclusão); 409 se já houver aberta (`admissional_id`).
- `POST /api/admissionais/:id/cancelar-retificacao` — apaga só a folha aberta.
- Finalizar a folha nova: `retificacao_finalizada = 1`; PDF traz faixa “RETIFICAÇÃO DO ASO Nº …”.

**UI:** histórico do paciente agrupa original + retificações; **Retificar** / **Continuar**; no formulário, **Salvar retificação** e **Desistir**.

**Aceite:** original intacto após retificar; horário único; cobrança no original; PDF da folha nova identificado como retificação.

**Modelos de papel (vários ASO):** não é este bloco. Ver `docs/MODULO_ASO_MODELOS.md` (AM0–AM5).

---

## 7. Integração com cobrança (referência — não implementar aqui)

Quando existir **M2 + A1**:

| Ação | Onde |
|------|------|
| Item “Admissional” na conta | `MODULO_COBRANCA` **M8′** |
| Preço por convênio | M1 procedimento “Admissional” |
| Pagamento | M5 |

Campo `conta_itens.admissional_id` liga financeiro ao registro clínico já finalizado (ou em andamento, conforme regra da clínica).

---

## 8. Ordem recomendada

```
A0 → A1 → A2 → A3 → A4 → A5
```

A2 pode ser pedido junto com A1. A3/A4 podem ser paralelos após A1. A5 depois de A1 (histórico A4 ajuda na UI).

**Independente de cobrança** — pode implementar admissional **agora** sem M0–M2.

---

## 9. Checklist QA (admissional)

- [x] Secretaria agenda admissional e faz check-in
- [x] Médico preenche formulário sem acessar prontuário de consulta
- [x] Conclusão apto/inapto/restrito registrada
- [x] PDF imprime com logo da clínica
- [x] Histórico no paciente (sem expor prontuário à secretaria)
- [x] Item na conta ligado ao admissional via M8′ (quando há cobrança no horário)
- [x] Retificação: folha nova, original intacto, horário e cobrança inalterados

---

## 10. Histórico

| Data | Alteração |
|------|-----------|
| 2026-06-27 | Versão inicial — admissional clínico A0–A4; separado de M8 cobrança |
| 2026-06-27 | A3 implementado — admissional via agenda/fila; histórico separado |
| 2026-06-28 | Removido botão “Chegada admissional”; walk-in usa Agenda + check-in (mesmo fluxo consulta) |
| 2026-08-21 | U14: entrada via procedimento `modo_clinico = aso`; sem tabela de duas edições |
| 2026-08-26 | A5: retificação de ASO (folha nova; `agendamento_id` NULL; cobrança no original) |
