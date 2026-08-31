# MedPronto — Módulo Fichas clínicas de consulta (especificação modular)

**Status:** especificação aprovada para implementação incremental.  
**Relacionado:** `docs/Plano_MedPronto_v2.md` (roadmap clínico), `docs/MODULO_COBRANCA.md` (cobrança — **desconto em M5**), `docs/INTEGRIDADE_VINCULOS.md` (regras de vínculo paciente/médico/ficha/conta).  
**Produto:** módulo clínico; não depende de cobrança. Ficha só quando o horário tem procedimento `modo_clinico = prontuario`.

---

## 0. Como usar este arquivo

Cada bloco **F0…F5** (e **F1′** opcional) é um pacote independente.  
Peça explicitamente, por exemplo: *“implementa F1”* ou *“implementa F2 e F3”*.

| Bloco | Nome resumido | Depende de |
|-------|---------------|------------|
| **F0** | Fundação: permissões, migration, seed default | — |
| **F1** | Autoria e CRUD de fichas (template + editor visual) | F0 |
| **F1′** | Criar ficha a partir de PDF (revisão obrigatória) | F1 |
| **F2** | Atendimento: render dinâmico + `dados_json` | F0, F1 |
| **F3** | Agenda / atendimento: escolher ficha | F1 |
| **F4** | Histórico e leitura com snapshot do template | F2 |
| **F5** | PDF / impressão alinhada ao template (opcional) | F2 |

**Legenda de status** (atualizar ao implementar):

- `[ ]` pendente  
- `[~]` em andamento  
- `[x]` concluído  

**Cobrança:** este módulo **não** trata preço, convênio ou pagamento. Ver `docs/MODULO_COBRANCA.md` — matriz **procedimento × convênio** (M1), conta no check-in (M3) e **desconto no fechamento** (M5).

---

## 1. Objetivo

Permitir que **médico e/ou admin** montem e gravem **formulários de consulta** personalizados (rótulos, ordem, campos), reutilizáveis em consultas futuras — sem conhecimento técnico e **sem importação JSON**.

Exemplos de variantes:

- Consulta — clínica geral  
- Consulta — gastroenterologia  
- Consulta — hepatologia  
- Consulta — modelo pessoal do Dr. Silva  

O atendimento continua no **layout papel** (`prontuario-papel.css`); muda apenas a **definição do formulário** e, opcionalmente, o **modo de exibição** (seções ou PDF de fundo).

---

## 2. Escopo

### 2.1 Dentro

- Templates de ficha **somente para consulta** (horário com `modo_clinico = prontuario`).
- **Autoria visual** (telas) — duas formas de **criar** a ficha (fora do atendimento):
  1. **A partir de template padrão** — duplicar, renomear rótulos, incluir/remover/reordenar campos.
  2. **A partir de PDF** — upload **único** na configuração; sistema sugere campos ou exibe PDF ao lado do editor; **revisão obrigatória** antes de ativar.
- Fichas **da clínica** (globais) e/ou **do médico** (`medico_id` nullable).
- Modos de exibição da ficha:
  - `secoes` — blocos numerados (padrão atual).
  - `pdf_fundo` — PDF de referência como fundo + campos digitáveis por cima (F1′+).
- Tipos de campo (v1 — F1): ver **§5.1**.
- Vínculo na **agenda** e/ou **abertura do atendimento** (`ficha_template_id`).
- Valores em **`dados_json`**; **snapshot** do template ao **finalizar**.

### 2.2 Fora (permanece como está)

| Área | Motivo |
|------|--------|
| **Import/export JSON** | **Explicitamente fora** — inviável para o usuário final |
| **Admissional** | Modelos de papel: `MODULO_ASO_MODELOS.md` (AM0–AM5). Este módulo continua **somente consulta**. |
| **Exames** | Anexo; sem laudo estruturado |
| **Receituário, atestado, pedido de exame** | Fluxos atuais |
| **Editor de templates para outros tipos** | Escopo futuro |
| **Upload de PDF na consulta** | PDF só na **criação** da ficha |
| **Cobrança** | `MODULO_COBRANCA.md` |

### 2.3 Nomenclatura

| Termo | Uso |
|-------|-----|
| **Ficha clínica** / **template** | Definição editável (campos + rótulos + modo) |
| **Autoria** | Criar/editar ficha (configuração) |
| **Prontuário** | Instância preenchida em um atendimento |
| **Snapshot** | Cópia congelada do template na finalização |

**Prefixo sugerido:** tabela `fichas_template`, rotas `/api/fichas-template/…`, permissões `fichas_config`, `fichas_medico`.

---

## 3. Decisões de produto (registradas)

1. **Sem JSON** — o usuário nunca edita ou importa arquivos técnicos; tudo por telas.
2. **Convênio não amarra ao tipo de atendimento** — preço em **procedimento × convênio** (`MODULO_COBRANCA.md` M1).
3. **Ficha clínica ≠ convênio** — personalização clínica independente do financeiro.
4. **Retorno não é `tipo_atendimento`** — vem do procedimento **Consulta retorno** na lista; `eh_retorno` é derivado. Cobrança usa o preço cadastrado em M1.
5. **Desconto** — na cobrança (M5): `valor_desconto_centavos` + motivo; exceção pontual, não regra do retorno.
6. **PDF na autoria, não na consulta** — upload uma vez; revisar; ativar; usar depois na biblioteca de fichas.
7. **Vínculos** — regras completas em `docs/INTEGRIDADE_VINCULOS.md` (ficha pessoal, paciente, conta).

---

## 4. Autoria de fichas (experiência do usuário)

### 4.1 Quem cria

| Perfil | Permissão | Escopo |
|--------|-----------|--------|
| **Admin** | `fichas_config` | Fichas globais da clínica + todas as do médico |
| **Médico** | `fichas_medico` | Fichas próprias (`medico_id` = usuário) |
| **Secretaria** | — | **Não** autoria; pode escolher ficha na agenda (F3) |

### 4.2 Nova ficha — escolha de origem

Tela **Config → Fichas clínicas → Nova ficha**:

```
○ A partir de template padrão (Consulta — clínica geral)
○ A partir do meu PDF (prontuário em papel)
○ Duplicar ficha existente
```

**Não há** opção JSON.

### 4.3 Caminho A — Template padrão

1. Duplicar seed **“Consulta — clínica geral”**.  
2. Editor visual: renomear rótulos, adicionar/remover campos, reordenar.  
3. Nomear (ex.: “Gastro — Dr. Silva”).  
4. **Salvar e ativar**.

### 4.4 Caminho B — PDF como base (F1′)

1. Upload do PDF **uma vez** (armazenado como referência da ficha).  
2. Sistema sugere rótulos (OCR opcional) **ou** PDF exibido ao lado do editor para montagem manual.  
3. Usuário **revisa** (corrige OCR, define tipos `textarea`/`cid`/`retorno`).  
4. Escolhe modo `secoes` ou `pdf_fundo`.  
5. **Pré-visualizar** → **Salvar e ativar**.

Regra: **nunca** ativar sem revisão explícita.

### 4.5 Uso nas consultas futuras

- Fichas ativas aparecem na **agenda** (secretaria) e/ou ao **abrir atendimento** (médico).  
- Na consulta: **escolher ficha** da biblioteca — **não** criar nem importar.  
- Finalizar grava **snapshot** — alterações posteriores na ficha não mudam consultas passadas.

---

## 5. Template padrão (seed F0)

Origem: `AtendimentoPage.tsx` + colunas `prontuarios`.

| id | label default | tipo |
|----|---------------|------|
| `queixa_principal` | Queixa principal: | textarea |
| `anamnese` | Anamnese: | textarea |
| `exame_fisico` | Exame físico: | textarea |
| `hipotese_diagnostica` | Hipótese diagnóstica: | textarea |
| `conduta` | Conduta: | textarea |
| `plano` | Plano: | textarea |
| `cid` | CID-10 | cid |
| `retorno` | Retorno (dias) | retorno |

**Título default:** “Prontuário de consulta”.

### 5.1 Tipos de campo (v1 — F1)

| `tipo` | Uso clínico | UI no atendimento | Valor em `dados_json` |
|--------|-------------|-------------------|------------------------|
| `textarea` | Blocos longos (anamnese, conduta…) | Área multilinha estilo ficha | `string` |
| `text` | Linha curta (PA, FC, peso…) | Input de uma linha | `string` |
| `busca` | Termo pesquisável (medicamento, achado…) | Input com ícone de busca; texto livre na v1 | `string` |
| `sim_nao` | Pergunta fechada | Botões **Sim / Não / N.I.** | `"sim"` \| `"nao"` \| `"ni"` \| `null` |
| `checkbox` | Marcador único (sim/não na consulta) | Uma caixa | `boolean` |
| `marcadores` | Várias opções — **uma ou mais** por consulta | Checkboxes **lado a lado** na folha (quebra linha se faltar espaço) | `string[]` (rótulos marcados) |
| `cid` | Diagnóstico CID-10 | Autocomplete CID (existente) | `{ codigo, descricao }` |
| `retorno` | Prazo de retorno | Presets + dias (existente) | `number` \| `null` (dias) |

**Definição no template** (`campos_json`):

```json
{
  "id": "tabagismo",
  "label": "Tabagismo:",
  "tipo": "sim_nao",
  "ordem": 4,
  "obrigatorio": false
}
```

**Marcadores (múltipla escolha):**

```json
{
  "id": "comorbidades",
  "label": "Comorbidades:",
  "tipo": "marcadores",
  "opcoes": ["DM", "HAS", "DLP", "Tabagismo"],
  "ordem": 5
}
```

Na folha, as opções aparecem **em linha** (`flex-wrap`) — lado a lado enquanto couber, quebrando para a linha de baixo automaticamente.

**Marcador único** (`checkbox` sem `opcoes`):

```json
{
  "id": "gestante",
  "label": "Gestante",
  "tipo": "checkbox",
  "ordem": 3
}
```

Legado: `checkbox` com `opcoes` é normalizado para `marcadores` ao carregar.

**Regras:**

- `id` estável (slug); único dentro da ficha.
- No máximo **um** campo `cid` e **um** `retorno` por ficha.
- `busca` na v1 é texto livre com UX de busca; catálogos externos (medicamentos, etc.) ficam para versão futura (`fonte` opcional).
- Tipos futuros (`select`, `data`, `numero`…) fora do escopo F1.

---

## 6. Permissões

| Código | Padrão | Função |
|--------|--------|--------|
| `fichas_config` | Admin | CRUD fichas globais, default da clínica |
| `fichas_medico` | Médico, Admin | CRUD fichas pessoais do médico |
| `prontuario_escrever` | Médico, Admin | Preencher no atendimento (existente) |
| `prontuario_ler` | Médico, Admin | Consultas finalizadas (existente) |

Permissões acima; sem teto de edição comercial (U14).

---

## 7. Modelo de dados

Migration sugerida: `011_fichas_template.sql`.

### 7.1 Templates

```
fichas_template (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  titulo_documento TEXT NOT NULL,
  modo TEXT NOT NULL DEFAULT 'secoes'
    CHECK (modo IN ('secoes', 'pdf_fundo')),
  campos_json TEXT NOT NULL,
  pdf_referencia_path TEXT,              -- nullable; F1′
  medico_id INTEGER REFERENCES usuarios(id),  -- null = clínica
  eh_default INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
)
```

**`campos_json`:** definições `{ id, label, tipo, obrigatorio?, ordem? }` — **sem valores**.

Regras: `id` estável; no máximo um `cid` e um `retorno` por ficha.

### 7.2 Posicionamento PDF (modo `pdf_fundo`, F1′+)

```
ficha_campos_posicao (
  ficha_template_id, campo_id,
  x_pct, y_pct, largura_pct, altura_pct
)
```

Percentual relativo à folha — facilita impressão.

### 7.3 Agenda e prontuário

```
agendamentos.ficha_template_id INTEGER REFERENCES fichas_template(id)

prontuarios (
  ... colunas legadas (migração gradual) ...
  ficha_template_id INTEGER REFERENCES fichas_template(id),
  template_snapshot_json TEXT,
  dados_json TEXT
)
```

- Agenda `consulta` sem ficha → default da clínica (`eh_default = 1`, `medico_id IS NULL`).  
- Ignorado para `admissional` e `exame`.

---

## 8. Fluxo operacional

```
AUTORIA (configuração, fora da consulta)
  → Template padrão OU PDF como base OU duplicar
  → Revisar → Ativar → biblioteca de fichas

AGENDA / ATENDIMENTO
  → Escolher ficha da biblioteca
  → Preencher (layout papel)
  → Finalizar → snapshot + dados_json

[Plus] COBRANÇA (independente)
  → M3: convênio na conta; eh_retorno → procedimento "Consulta retorno"
  → M5: pagamento; desconto pontual se necessário
```

---

## 9. Integração com cobrança

| Tema | Documento | Relação com fichas |
|------|-----------|-------------------|
| Preço por convênio | M1 | Independente da ficha |
| Convênio na conta | M2/M3 | Chegada/check-in; não vem da ficha |
| Retorno | M1 + M3 | `eh_retorno` → **Consulta retorno**; preço zerado/reduzido no **cadastro** |
| Desconto | M5 | Total líquido = Σ itens − desconto; motivo obrigatório |

Ver `docs/MODULO_COBRANCA.md`.

---

## 10. Blocos de implementação

### F0 — Fundação `[x]`

- Migration + seed “Consulta — clínica geral”.
- Permissões `fichas_config`, `fichas_medico`.
- Router `/api/fichas-template`.
- Menu Config → Fichas clínicas (placeholder).

**Aceite:** seed listável; 403 sem permissão.

---

### F1 — Autoria visual `[x]`

**Telas:**

- Lista de fichas (filtro: clínica / minhas).
- Nova ficha: template padrão ou duplicar.
- Editor: nome, título, campos (label, **tipo** §5.1, ordem, add/remove; opções em checkbox).
- Pré-visualizar atendimento.
- **UI:** autoria em **duas colunas** (montar campos | prévia ao vivo na folha) + fundo bege, igual admissional/atendimento.
- Salvar / ativar / inativar.
- Marcar default da clínica.
- **Apagar** ficha não usada (sem prontuário nem agendamento; não apaga padrão).

**API:** `GET/POST/PUT/PATCH /api/fichas-template`, `…/default`, `…/duplicar`, `GET …/disponiveis?medico_id=`, `DELETE …/:id`.

**Regras:** soft delete se usada em prontuário **ou agendamento**; médico só edita fichas com seu `medico_id` ou globais se admin.

**Aceite:** médico duplica CG, renomeia “Anamnese” → “HMA”, adiciona campo `sim_nao` “Tabagismo”, ativa, sem JSON.

---

### F1′ — PDF como base `[x]`

**Telas:**

- Wizard: upload PDF → sugestão OCR (opcional) + editor lado a lado.
- Modo `secoes` ou `pdf_fundo`.
- Posicionamento de campos (pdf_fundo).

**Regras:** ativação só após “Revisado e confirmo”.
- OCR falhou → fallback “montar olhando PDF” + template padrão.

**Aceite:** PDF do consultório vira ficha utilizável após revisão.

---

### F2 — Atendimento dinâmico `[x]`

- `AtendimentoPage` renderiza a partir de `campos_json`.
- Resolver ficha: agendamento → default; `assertFichaPermitida` (bloco **I5**, `INTEGRIDADE_VINCULOS.md`).
- Persistir `dados_json`; finalizar → `template_snapshot_json`.
- Migrar prontuários legados para `dados_json`.

**Aceite:** ficha customizada no atendimento; finalizado imutável.

---

### F3 — Escolha da ficha `[x]`

- Agenda: combo “Ficha clínica” (tipo consulta).
- Atendimento: combo trocar ficha (médico, consulta editável, não retificação).
- API: `ficha_template_id` no POST agendamento; `PATCH /agendamentos/:id/ficha`; `GET /fichas-template/disponiveis?medico_id=`.

**Aceite:** agenda Hepática → atendimento abre formulário correto.

---

### F4 — Histórico com snapshot `[x]`

- Histórico usa `template_snapshot_json` para labels antigos.
- API `GET /prontuarios/paciente/:id` enriquece itens com `ficha_campos` + `dados_json` (snapshot se finalizado).
- Detalhe no atendimento renderiza `FichaCamposCorpo` somente leitura com rótulos do snapshot.

**Aceite:** alteração de rótulo hoje não altera consulta de ontem.

---

### F5 — PDF / impressão (opcional) `[x]`

- `GET /prontuarios/:id/consulta/pdf` — PDF da consulta com rótulos do **snapshot** (consulta finalizada) ou ficha atual (em andamento).
- Botão **Consulta PDF** no histórico e **Imprimir / PDF da consulta** no atendimento finalizado.

**Aceite:** alteração de rótulo na ficha não muda o PDF de consulta antiga.

---

## 11. Ordem recomendada

```
F0 → F1 → F2 → F3 → F4 → F1′ → (F5)
```

Cobrança M0–M5 em paralelo. Retorno: seed procedimento **Consulta retorno** em M1 + regra M3.

---

## 12. Casos de borda

| Caso | Tratamento |
|------|------------|
| Médico sem ficha própria | Default da clínica |
| Ficha inativada | Some da agenda; prontuários antigos intactos |
| PDF ilegível | Editor manual + template padrão; PDF só referência |
| Retorno | `eh_retorno`; preço no cadastro M1, não na ficha |
| Desconto na saída | M5; independente da ficha |

---

## 13. Atualização do Plano v2

Quando **F0** for implementado, referenciar este doc em `Plano_MedPronto_v2.md`.

---

## 14. Histórico do documento

| Data | Alteração |
|------|-----------|
| 2026-06-28 | Versão inicial — consulta editável; autoria template + PDF; sem JSON; snapshot; ref. cobrança/desconto/retorno |
