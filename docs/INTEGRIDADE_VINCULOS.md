# MedPronto — Integridade e vínculos entre entidades

**Status:** regras aprovadas para implementação e endurecimento progressivo.  
**Relacionado:** `Plano_MedPronto_v2.md`, `MODULO_FICHAS_CLINICAS.md`, `MODULO_COBRANCA.md`, `MODULO_ADMISSIONAL.md`.  
**Migration de referência (parcial):** `database/011_vinculos_clinicos.sql`.

Este documento define **como as peças devem amarrar** (clínico + financeiro futuro), o que **não pode acontecer**, o que é **único**, o que **já existe** no código e o **plano de correção** do que ainda falta.

---

## 1. Princípio central

Toda operação clínica ou financeira tem **uma chave de episódio** que não pode ser trocada “no meio” sem fluxo explícito:

| Episódio | Chave | Identidade fixa |
|----------|-------|-----------------|
| **Consulta clínica** | `prontuarios.id` | `paciente_id` + `medico_id` + `data_atendimento` (e opcionalmente `agendamento_id`) |
| **Admissional** | `admissionais.id` | `paciente_id` + `medico_id` (+ `agendamento_id` se houver) |
| **Visita financeira** | `contas_atendimento.id` | Com horário: `agendamentos.id` (1:1). Walk-in: `paciente_id` + `data` sem `agendamento_id` |

**Regra de ouro:** dados de **paciente A** nunca gravam em registro de **paciente B**; dados de **médico A** não aparecem como se fossem de **médico B**; cobrança de **A** não entra na conta de **B**.

**Duas trilhas, um encontro no atendimento:**

- **Clínico:** ficha → prontuário → receita / pedido / atestado / anexo.  
- **Financeiro:** conta → itens (procedimentos) → pagamentos.  
- O encontro com horário é **`agendamentos.id`**. Walk-in (sem agenda) continua **`paciente_id` + data**, **sem** misturar convênio ou formulário na mesma tabela.

---

## 2. Mapa de amarrações (como deve ser)

### 2.1 Configuração (antes do atendimento)

| Entidade | Pertence a | Pode ser usada por |
|----------|------------|-------------------|
| `fichas_template` com `medico_id` **NULL** | Clínica | Qualquer médico (escolha explícita na agenda/atendimento) |
| `fichas_template` com `medico_id` **preenchido** | Médico dono | **Só** esse médico, **salvo** escolha explícita de ficha global (`medico_id` NULL) na agenda/atendimento |
| `procedimentos` / `convenios` / preços (M1) | Clínica | Todos os atendimentos; preço = par procedimento × convênio |

**Regra fichas (futuro F1/F3):** médico B **não** abre atendimento com ficha pessoal de médico A. Pode usar ficha **global** da clínica ou **a própria**; troca para ficha de outro médico só se admin expuser ficha global ou política “compartilhar modelo” (fora do escopo v1 — padrão: **não compartilhar fichas pessoais**).

### 2.2 Agenda → atendimento

```
agendamentos (paciente_id, medico_id, procedimentos N:N / modo_clinico, ficha_template_id?, eh_retorno derivado)
    → abrir consulta: prontuarios herda paciente_id e medico_id DO AGENDAMENTO (não do body)
    → abrir ASO: admissionais idem
```

- `paciente_id` e `medico_id` do prontuário/admissional **vêm do agendamento ou do cadastro validado** — nunca de campo livre ignorado na API.  
- Médico logado só abre agendamento **seu** (`ag.medico_id === usuario.id`), salvo admin.

### 2.3 Consulta → documentos

Todos derivados **do prontuário**:

| Filho | FK obrigatória | Deve bater com prontuário |
|-------|----------------|---------------------------|
| `receitas` | `prontuario_id` | `paciente_id`, `medico_id` |
| `atestados` | `prontuario_id` | `paciente_id`, `medico_id` |
| `pedidos_exame` | `prontuario_id` | `paciente_id`, `medico_id` |
| `exames_anexos` | `paciente_id`; `prontuario_id` opcional | Se `prontuario_id` setado, mesmo `paciente_id` |

**Conteúdo clínico** (queixa, CID, itens de receita) vive no filho ou em `prontuarios`; **não** altera cadastro de `pacientes` automaticamente.

### 2.4 Financeiro

| Regra | Detalhe |
|-------|---------|
| Conta pertence a **um** `paciente_id` | Imutável após abertura |
| Com horário | **Uma conta ativa** por `agendamentos.id`; `paciente_id` e `data` iguais aos do horário (`039_integridade_u13.sql`) |
| Walk-in | `agendamento_id` NULL; **uma** conta ativa por `paciente_id` + `data` |
| `convenio_id` | No horário e na conta; enquanto `em_aberto`, um acompanha o outro |
| Itens da conta | Só mudam com a conta `em_aberto` (e sem `fechada_em`); `045_conta_itens_conta_aberta.sql` |
| Itens referenciam `procedimento_id` | Preço = snapshot `valor_centavos` na inclusão |
| `conta_itens.agendamento_procedimento_id` | Se preenchido, é a linha N:N **do mesmo** `agendamento_id` da conta. Item só do médico fica NULL |
| `contas_atendimento.prontuario_id` | Opcional; se preenchido, **mesmo** `paciente_id` da conta |
| `conta_itens.admissional_id` | Mesmo `paciente_id` da conta |
| Retorno | `eh_retorno` derivado de Consulta retorno na lista; preço do cadastro |

**Proibido:** aplicar pagamento ou convênio da conta do paciente A na conta do paciente B; mover item entre contas de pacientes diferentes; misturar `prontuario` e `aso` no mesmo horário.

---

## 3. O que é único (não duplicar)

| Escopo | Unicidade | Motivo |
|--------|-----------|--------|
| `usuarios.login` | Único | Auth |
| `agendamentos` slot ativo | **Um** por `paciente_id` + `medico_id` + `data` + `hora` (exceto cancelado / não veio) | Evita card duplicado; N procedimentos no mesmo horário |
| `agendamentos` → `prontuarios` | **No máximo 1** prontuário por `agendamento_id` (consulta) | Um slot = uma consulta |
| `agendamentos` → `admissionais` | **No máximo 1** admissional por `agendamento_id` admissional | Idem |
| Mesmo `agendamento_id` em `prontuarios` **e** `admissionais` | **Impossível** (retificação usa `agendamento_id` NULL) | Consulta e ASO = dois horários; `044_horario_prontuario_aso.sql` |
| `prontuarios` em retificação | Nova linha com `retificacao_de_id`; original intacta; `agendamento_id` NULL na folha nova | Histórico imutável; 1 prontuário por horário |
| `admissionais` em retificação | Nova linha com `retificacao_de_id`; original intacta; `agendamento_id` NULL; `conta_itens.admissional_id` permanece no original | Histórico imutável; 1 ASO por horário |
| Modelo ASO vs ficha consulta | `aso_template_id` só template `destino=aso`; `ficha_template_id` só `destino=prontuario` | Evita papel de gastro num ASO e o contrário |
| `receitas` / `atestados` / `pedidos_exame` por prontuário | **Um documento ativo** por tipo por prontuário (padrão atual: upsert no último) | Evita PDFs duplicados |
| `contas_atendimento` | **Uma conta** por `agendamento_id` (horário) + **uma walk-in** por `paciente_id` + `data` | Fechamento por atendimento; walk-in separado |
| `fichas_template.eh_default` | **Uma** ficha default **por destino** (consulta `prontuario` e ASO `aso`) | Fallback agenda |
| Cadastro `pacientes` | Um registro por pessoa; CPF único quando informado (recomendado I2) | Evita paciente duplicado |

**Pode repetir (não é duplicação indevida):** várias consultas do mesmo paciente com o mesmo médico em dias diferentes; várias fichas-template com nomes parecidos; vários itens na mesma conta (consulta + eletro).

---

## 4. Cenários de erro — como o sistema deve impedir

### 4.1 Ficha do médico A usada pelo médico B sem escolha consciente

| Camada | Comportamento exigido |
|--------|----------------------|
| API ao abrir atendimento | Resolver `ficha_template_id`: agenda → se null, default clínica. **Rejeitar** ficha com `medico_id` ≠ médico da consulta. |
| UI | Combo só lista fichas **globais** + **do médico logado**. |
| Exceção documentada | Admin pode atribuir ficha global; médico B usando “modelo clínica” é **escolha explícita**, não vazamento de ficha pessoal de A. |

**Status:** `[x]` API (`assertFichaPermitida` em abrir/salvar/finalizar/trocar ficha); UI combo na agenda e no atendimento (F3).

### 4.2 Paciente A gravado com médico B (indevido)

| Camada | Comportamento |
|--------|---------------|
| `POST /prontuarios/abrir` | Insere `paciente_id` e `medico_id` **do agendamento**; médico só abre o próprio agendamento. |
| Triggers `011` | Prontuário com `agendamento_id` deve bater paciente+médico com `agendamentos`. |
| PUT prontuário | **Não** aceitar alteração de `paciente_id` / `medico_id` / `agendamento_id`. |

**Status:** `[x]` API abrir; `[x]` triggers; `[x]` PUT não altera chaves; `[x]` trigger `BEFORE UPDATE` impedindo troca de `paciente_id`/`medico_id`/`agendamento_id` (`012_integridade_i1.sql`).

### 4.3 Dados do paciente A substituídos pelos do paciente B

| Risco | Mitigação |
|-------|-----------|
| Trocar `paciente_id` no prontuário | Proibido no UPDATE (API + trigger I1). |
| Frontend `enriquecerProntuarioPaciente` com `location.state.paciente` errado | **Corrigido I3:** tela de atendimento usa **somente** dados do GET `/prontuarios/:id` (JOIN pacientes); `location.state` só para navegação (`fromAgenda`, `fromFila`, aba inicial, retificação). |
| Atualizar cadastro `pacientes` ao salvar consulta | **Não fazer** — consulta não sobrescreve cadastro. |
| Exame anexo com `paciente_id` ≠ prontuário | Trigger `[x]` `011_vinculos_clinicos.sql`. |

### 4.4 Financeiro no convênio errado ou na conta de outro paciente

| Regra (futuro M2/M3/M5) | |
|-------------------------|---|
| Abrir conta sempre com `paciente_id` do check-in/agendamento | |
| `convenio_id` só na conta; alterar convênio recalcula itens **não pagos** (confirmar usuário) | |
| `conta.paciente_id` imutável | |
| FK lógica: `prontuario_id` na conta ⇒ mesmo paciente | |
| Pagamentos só na `conta_id` correspondente | |
| Auditoria: `cobranca_desconto`, `cobranca_fechamento` com `usuario_id` | |

**Status:** `[x]` migration `023_integridade_i4_cobranca.sql` + validações em `cobrancaContas.ts` (bloco **I4**).

### 4.5 Misturar consulta A com cobrança B

- Conta do horário agrupa **serviços daquele `agendamentos.id`**, não “qualquer conta do paciente no dia”.  
- Dois horários no mesmo dia = duas contas (convênios podem diferir).  
- Walk-in no mesmo dia = terceira conta, sem `agendamento_id`.  
- Vínculo `contas_atendimento.prontuario_id` é **referência**, não fusão de identidade.  
- Item de eletro sem consulta ainda exige `paciente_id` da conta correto.

---

## 5. Crítica ao estado atual do projeto

### 5.1 O que já está bem encaminhado

| Item | Onde |
|------|------|
| Triggers paciente ↔ prontuário ↔ documentos | `011_vinculos_clinicos.sql` |
| Abertura de prontuário só do agendamento consulta | `prontuarios.ts` POST `/abrir` |
| Médico não abre agendamento de outro | `prontuarios.ts`, `admissionais.ts` |
| Médico não lê/edita prontuário de outro | `prontuarioAccess.ts` |
| Histórico do paciente filtrado ao médico logado | `prontuarios.ts` GET histórico |
| Documentos inseridos com `paciente_id`/`medico_id` do prontuário | `documentos.ts` |
| Consulta finalizada imutável | `consultaEncerrada.ts` |
| Vínculo médico–paciente para histórico | `vinculosClinicos.ts` |
| Um prontuário por agendamento (lógica transacional) | `prontuarios.ts` `/abrir` |
| Prontuário e ASO no mesmo `agendamento_id` | `044_horario_prontuario_aso.sql`; `POST /admissionais` chama `assertHorarioAbreAso` |
| Item de conta fechada | `045_conta_itens_conta_aberta.sql` (INSERT/UPDATE/DELETE) |

### 5.2 Lacunas e riscos (corrigir)

| # | Lacuna | Risco | Prioridade |
|---|--------|-------|------------|
| L1 | Sem `UNIQUE(agendamento_id)` em `prontuarios` / `admissionais` | Duplicata em condição de corrida | ~~Alta~~ `[x]` `012_integridade_i1.sql` |
| L2 | Sem trigger impedindo `UPDATE` de `paciente_id`/`medico_id` em `prontuarios` e `admissionais` | Bypass se API falhar | ~~Alta~~ `[x]` `012_integridade_i1.sql` |
| L3 | Triggers só em `INSERT` de receitas/atestados/pedidos; sem `UPDATE` de vínculos | Integridade frágil se houver UPDATE futuro | ~~Média~~ `[x]` `012_integridade_i1.sql` |
| L4 | `enriquecerProntuarioPaciente` podia mascarar paciente errado na UI | Médico vê dados de outro na tela | ~~Média~~ `[x]` I3 |
| L5 | `exames_anexos.paciente_nome` denormalizado | Nome desatualizado (cosmético) | Baixa |
| L6 | Fichas por médico sem regra implementada | Ficha de A para B (futuro) | ~~Alta antes de F2~~ `[x]` I5 |
| L7 | Cobrança sem barreira financeira no banco | Conta/item sem constraints de vínculo | ~~Alta no M2~~ `[x]` I4 (`023_integridade_i4_cobranca.sql`) |
| L8 | CPF de paciente sem UNIQUE no banco | Dois cadastros “mesma pessoa” | ~~Média~~ `[x]` `013_integridade_i2_cpf.sql` |
| L9 | `GET /prontuarios/:id` com `fila_medico` sem `assertMedicoVinculoPaciente` | Médico com ID adivinha outro prontuário? Bloqueado por `medico_id` — OK | — |

### 5.3 Fora do padrão desejado (aceito hoje, revisar depois)

- Identificação do paciente na tela pode vir de merge frontend (L4).  
- Documentos: upsert por prontuário sem versionar (uma receita “viva”) — OK para v1, não é vazamento entre pacientes.  
- Admin vê todos os prontuários — **por desenho** (perfil admin).

---

## 6. Plano de endurecimento (blocos I)

Implementar **antes ou junto** dos módulos que dependem das regras.

| Bloco | Nome | Entregas | Depende de |
|-------|------|----------|------------|
| **I0** | Documentação e testes de vínculo | Este arquivo; casos de teste manuais no checklist QA | — |
| **I1** | Constraints SQLite | `UNIQUE` em `prontuarios(agendamento_id)` onde not null; idem admissional; triggers `BEFORE UPDATE` proibindo troca de `paciente_id`/`medico_id`/`agendamento_id`; UPDATE em receitas/atestados/pedidos | — `[x]` |
| **I2** | Pacientes | Índice único `cpf` quando não vazio; validação na API | I0 `[x]` |
| **I3** | Frontend atendimento | Remover merge de `paciente` do `location.state` em identificação; só API | I0 `[x]` |
| **I4** | Cobrança íntegra | FK + checks em `023_integridade_i4_cobranca.sql`: conta↔paciente, item↔conta, prontuario_id/admissional_id mesmo paciente; `convenio_id` imutável após fechamento; services M3/M5 | M0, M2 `[x]` |
| **I5** | Fichas íntegras | `assertFichaPermitida`; validação em abrir prontuário e salvar `ficha_template_id` | F0, F2 `[x]` |

**Ordem sugerida:** `I1` → `I3` (rápido) → `F0`/`F2` com **I5** → `M0`/`M2` com **I4**.

---

## 7. Regras de implementação (checklist para PR)

Todo endpoint que grava dado clínico ou financeiro deve:

1. Resolver `paciente_id` e `medico_id` da **entidade pai** (agendamento, prontuário, conta), não do body isolado.  
2. Chamar `getProntuarioOrThrow` / equivalente antes de filhos.  
3. Para médico: `medico_id === req.usuario.id` ou admin.  
4. Não expor UPDATE de chaves de identidade (`paciente_id`, `medico_id`, `agendamento_id` em prontuário).  
5. Logar em `log_acesso` ações sensíveis (ler prontuário, fechar conta, desconto).  
6. Na cobrança: validar conta do **horário** (`agendamento_id`) quando houver agenda; walk-in só por paciente+data sem horário.

---

## 8. Referências cruzadas

| Módulo | Seção relevante |
|--------|-----------------|
| `MODULO_FICHAS_CLINICAS.md` | §2.1 fichas por médico; §6 modelo; amarração com prontuário |
| `MODULO_COBRANCA.md` | §3 conta; §7 modelo; M3 retorno; M5 desconto |
| `MODULO_ASO_MODELOS.md` | Vários papéis de ASO; não misturar com ficha de consulta |
| `MODULO_ADMISSIONAL.md` | §4 modelo; triggers agendamento |
| `Plano_MedPronto_v2.md` | Princípio “evoluções não se apagam”; consulta como centro |

---

## 9. Histórico

| Data | Alteração |
|------|-----------|
| 2026-08-26 | A5 — retificação de ASO (`041`/`042`); cobrança permanece no original |
| 2026-08-21 | **U13** — chave financeira = horário; `039_integridade_u13.sql` |
| 2026-07-05 | Bloco **I4** — integridade cobrança (`023_integridade_i4_cobranca.sql` + `cobrancaContas.ts`) |
| 2026-07-04 | Bloco **I3** — atendimento usa só GET `/prontuarios/:id` para identificação do paciente |
| 2026-07-04 | Bloco **I1** implementado — `012_integridade_i1.sql` |
| 2026-06-28 | Versão inicial — mapa de vínculos, crítica ao código atual, blocos I0–I5 |
