# MedPronto — Unificação clínico + financeiro e atendimento = procedimento

**Status:** especificação para implementação incremental. Não começar código sem ler a seção 1 (decisões congeladas) e a seção 2 (proibições).  
**Substitui, neste tema:** dualidade de edição `clinico` / `clinico_cobranca`; dualidade `tipo_atendimento` × `procedimento_id`; conta única por paciente/dia; convênio só na conta após check-in.  
**Não substitui:** `MODULO_ADMISSIONAL.md` (formulário ASO, PDF, conclusão). `MODULO_ASO_MODELOS.md` (vários papéis de ASO). `MODULO_FICHAS_CLINICAS.md` (editor de ficha de **consulta**). `MODULO_COBRANCA.md` (preço, caixa, pagamento, guia, relatórios) — alinhados no **U14**.  
**Relacionado:** `Plano_MedPronto_v2.md` §15, `INTEGRIDADE_VINCULOS.md`, `REGRAS_INFRA.md`.

---

## 0. Como usar este arquivo

Cada bloco **U0…U14** é um pacote. Pedir, por exemplo: *“implementa U3”* ou *“implementa U3 e U4”*.  
**Não pular bloco.** U4 (conta 1:1 com horário) **antes** de U5–U10. UI de N procedimentos **depois** do schema e da API.

| Bloco | Nome | Depende | Natureza |
|-------|------|---------|----------|
| **U0** | Fundação: nomenclatura, regras, aceite global | — | Doc + critérios |
| **U1** | Produto único (sempre clínico + cobrança) | U0 | Código + migration |
| **U2** | Cadastro: `modo_clinico` no procedimento | U1 | Schema + API + UI cadastro |
| **U3** | Schema do atendimento (N procedimentos + convênio no horário) | U2 | Schema + triggers |
| **U4** | Conta 1:1 com agendamento | U3 | Schema + serviço conta |
| **U5** | API de agendamento alinhada ao modelo | U4 | Backend |
| **U6** | Check-in gera conta do horário | U5 | Backend |
| **U7** | Agenda: formulário e lista | U5, U6 | Frontend |
| **U8** | Sala de espera + botão conta em todo status | U6, U7 | Frontend |
| **U9** | Abrir clínico a partir do procedimento (prontuário vs ASO) | U5, U8 | Backend + frontend |
| **U10** | Secretária inclui/edita procedimentos e convênio depois do agendar | U6–U9 | Backend + frontend |
| **U11** | WhatsApp: vários preparos + reenvio se `hoje < data` | U3, U10 | Backend + frontend |
| **U12** | Caixa, contas do dia, dashboard, relatórios | U4, U10 | Backend + frontend |
| **U13** | Integridade SQLite + testes de regressão | U4–U12 | SQL + scripts |
| **U14** | Instalador, licença, docs irmãos, limpeza `tipo_atendimento` na UI | U1, U13 | Scripts + docs |

**Legenda:** `[ ]` pendente · `[~]` em andamento · `[x]` concluído.

**Protocolo Cursor:** um bloco por conversa, quando possível. Migration nova = próximo número após `030`. Build: Node portátil em `d:\MedPronto\node`; `npm run build -w frontend` e, se API mudou, `-w backend`. Usuário só para/abre pelo atalho ou Ctrl+F5 — ver `.cursor/rules/medpronto-ver-mudancas.mdc`.

---

## 1. Decisões congeladas (não reabrir no meio da implementação)

Estas regras são o contrato. Atalho que as viole = retrabalho, não “fase 2”.

### 1.1 Produto

1. Existe **uma** edição: clínico + financeiro. Não há SKU `clinico`. Não há picker no instalador. Não há 403 “edição não inclui cobrança”.
2. Licença deixa de escolher edição. Campo `ed` no token, se existir, **ignora-se** (não rebaixa).
3. Bases antigas `clinico` sobem para o modelo único **na migration U1**, sem pergunta ao usuário.

### 1.2 O que é um atendimento

4. **Um horário na agenda** (`agendamentos.id`) = **um atendimento** = **um convênio** = **uma conta** = **N procedimentos**.
5. Duração do slot **não** soma procedimentos. Consulta 30 min + ultrassom no mesmo horário continua 30 min (salvo `duracao_minutos` explícito).
6. **Proibido** no mesmo horário: procedimento com `modo_clinico = prontuario` **e** procedimento com `modo_clinico = aso`. Consulta e ASO = **dois horários**.
7. Dois horários no mesmo dia, mesmo paciente, convênios diferentes = **duas contas**. Isso é correto.
8. Walk-in (conta sem agendamento) permanece. Não inventar agendamento fantasma.

### 1.3 Catálogo

9. A secretária **não escolhe “tipo de atendimento”**. Escolhe **procedimento(s)** no cadastro `procedimentos`.
10. `tipo_atendimento` deixa de ser campo de UI. Passa a ser **derivado** do procedimento clínico do horário (ver §3.3), só para compatibilidade interna até U14.
11. ASO **não some**. Continua tabela `admissionais`, PDF, apto/inapto, módulos `admissional` / `admissional_agenda`. Muda só a **entrada**: procedimento com `modo_clinico = aso`.
12. Prontuário de consulta **não mistura** com ASO. Um horário de consulta = no máximo um `prontuarios`. Um horário ASO = no máximo um `admissionais`.
13. Exame auxiliar (`modo_clinico = nenhum`) no horário de consulta: item de conta + anexo (M7). **Não** abre segundo prontuário.
14. Horário só com exames (`nenhum`): check-in e cobrança; **não** abre prontuário nem ASO. Médico não tem “Atender” clínico nesse card.

### 1.4 Secretária e convênio

15. Convênio é obrigatório **no agendar**. Um por atendimento.
16. Secretária inclui, troca e remove procedimentos **no agendar** e **depois** (status `agendado`, `presente`, `em_atendimento`, `finalizado`), enquanto a conta estiver `em_aberto` (ou reaberta).
17. Conta fechada: procedimentos e convênio **imutáveis** até reabrir (já existe trigger de convênio; estender a itens).
18. Médico continua com `cobranca_solicitar` na consulta. Item solicitado entra na **mesma** conta do horário. Não é fluxo paralelo.

### 1.5 WhatsApp

19. `{preparo}` = concatenação das `orientacoes_paciente` de **todos** os procedimentos do horário, na ordem de inclusão, pulando vazio.
20. Confirmação automática: qualquer horário `agendado` com telefone, inclusive ASO (ASO deixa de ser excluído).
21. Se o Zap **já foi enviado** e a secretária inclui exame **depois**: segundo recado **somente** se `hojeIsoLocal() < agendamentos.data`. No dia do atendimento ou depois: exame na conta, **sem** Zap.
22. Segundo recado leva **só** o preparo dos procedimentos novos (não reenvia o texto de confirmação inteiro). Sem orientação cadastrada no item novo: não envia.

### 1.6 Dados de homologação (não há produção)

Não existe cliente em produção. Instalações atuais são desenvolvimento/homologação. **Não congelar** o modelo antigo “uma conta por paciente/dia”.

23. U3/U4 **reescrevem** o banco: índices, contas, N procedimentos, convênio no horário. Se um dado de teste ficar inconsistente, apagar e recadastrar. Sem ramo “só daqui pra frente”.
24. Agendamentos de homologação: um `procedimento_id` (ou tipo ASO sem procedimento) vira linha em `agendamento_procedimentos`. Convênio do horário copia da conta se houver; senão Particular. Contas de teste podem ser recriadas no check-in.

---

## 2. Proibições (o que conta como gambiarra)

Não fazer:

| Atalho | Por que é atalho | Fazer em vez disso |
|--------|------------------|---------------------|
| `if (edicao === 'clinico')` em tela nova | Dualidade morta | Remover o conceito |
| Manter combo Tipo **e** lista de procedimentos | Dois donos da verdade | Só procedimentos + `modo_clinico` |
| `procedimento_id` no agendamento **e** tabela N:N sem desligar o campo na API | Drift | Coluna antiga só leitura pós-migration; escrita só na N:N |
| Lista na agenda diferente da lista da conta | Drift secretária vs caixa | Um serviço, uma transação (U10) |
| Conta por paciente/dia + “convênio do agendamento” só na UI | Mentira no segundo horário | U4 de verdade |
| Inferir ASO pelo **nome** `"Admissional"` | Quebra se a clínica renomear | `modo_clinico` |
| Inferir consulta pelo nome `"Consulta"` para abrir prontuário | Idem | `modo_clinico` |
| Botão Cobrança só se `podeConsultarFinalizado` (prontuário) | Secretária sem prontuário nunca vê o botão | Permissão `cobranca` + `conta_id` |
| Feature flag “se não tiver convenio_id, usa último do paciente” na UI nova | Esconde campo obrigatório | Campo obrigatório no form; último convênio só como **default** |
| Reenviar Zap no dia “porque o preparo mudou” | Viola decisão 21 | Calar |
| Criar agendamento invisível para walk-in | Lixo na agenda | Conta com `agendamento_id` NULL, índice próprio |
| Somar `duracao_minutos` dos procedimentos | Agenda vira mentira | Duração do slot independente |
| Abrir prontuário e ASO no mesmo card | Dois episódios clínicos | Bloquear no insert (U3/U13) |
| Patch de permissão só no default de usuário **novo** | Secretária antiga fica sem cobrança | Migration U1 grava `usuario_permissoes` |

---

## 3. Modelo alvo

### 3.1 Fonte da verdade

```
procedimentos          catálogo (modo_clinico, orientacoes_paciente, preço × convênio)
        │
agendamentos           episódio: paciente, médico, data, hora, convenio_id, duração
        │
agendamento_procedimentos   N procedimentos daquele horário (ordem, origem)
        │
        ├─ modo prontuario → prontuarios (≤1 por agendamento)
        ├─ modo aso        → admissionais (≤1 por agendamento)
        └─ check-in        → contas_atendimento (≤1 por agendamento, se houver horário)
                              └─ conta_itens (espelho financeiro + solicitados pelo médico)
```

**Antes do check-in:** verdade = `agendamentos` + `agendamento_procedimentos`.  
**Depois do check-in, conta `em_aberto`:** verdade operacional = o **mesmo conjunto** nas duas pontas, gravado numa transação.  
**Conta fechada:** verdade financeira = `conta_itens` congelados; agenda não edita.

`conta_itens.agendamento_procedimento_id` (nullable): item nascido do horário. Item só do médico (`cobranca_solicitar`) fica NULL nesse FK — aparece na conta, não no Zap de confirmação, não na lista “marcados na agenda”, a menos que a secretária o promova (opcional, fora do v1 deste plano).

### 3.2 `procedimentos.modo_clinico`

| Valor | Significado | Abre | Zap | Conta |
|-------|-------------|------|-----|-------|
| `prontuario` | Consulta clínica | `prontuarios` + ficha | sim | sim |
| `aso` | Exame ocupacional | `admissionais` | sim (U11) | sim (também no check-in; hoje **não**) |
| `nenhum` | Exame/procedimento auxiliar | nada clínico | sim se tiver orientação | sim |

Seed:

| Nome atual | `modo_clinico` |
|------------|----------------|
| Consulta | `prontuario` |
| Consulta retorno | `prontuario` |
| Admissional | `aso` |
| Endoscopia, Eletro, demais sem cadastro | `nenhum` |

Quem decide o fluxo é `modo_clinico`. Coluna `categoria` foi removida.

### 3.3 Derivação interna de `tipo_atendimento` (até U14)

Enquanto a coluna existir:

- há `prontuario` na lista → `consulta`
- senão há `aso` → `admissional`
- senão → `exame`

Escrita **somente** no serviço de agendamento, nunca no form. `eh_retorno = 1` se e somente se um dos procedimentos for o seed “Consulta retorno” (id estável via nome+codigo `RET` na migration, não via string solta no front).

### 3.4 Convênio

- `agendamentos.convenio_id` NOT NULL (após U3; Particular = id 1).
- `contas_atendimento.convenio_id` copia no check-in / abertura.
- Troca com conta `em_aberto`: PATCH único atualiza agendamento + conta e **reprecifica** itens não cancelados.
- Default no form: último `convenio_id` de conta/agendamento desse paciente; se vazio, Particular. Default ≠ ocultar campo.

### 3.5 Índices de conta (U4)

Substituir `idx_contas_paciente_data_unique` por:

1. `UNIQUE (agendamento_id) WHERE agendamento_id IS NOT NULL AND status != 'cancelada'`
2. `UNIQUE (paciente_id, data) WHERE agendamento_id IS NULL AND status != 'cancelada'`  
   (um walk-in ativo por paciente/dia; horários agendados **não** entram nesse índice)

Trigger `trg_conta_ids_imutaveis_upd`: paciente, data e `agendamento_id` imutáveis depois de preenchidos (já quase isso em `024`).

---

## 4. Estado atual (para o implementador não “descobrir” no meio)

| Peça | Hoje | Alvo |
|------|------|------|
| Edição | `app_meta.edicao`, default `clinico` (`009_admissional.sql`) | sempre cobrança ligada |
| Agenda | combo Tipo + 1 `procedimento_id`; ASO zera procedimento | só procedimentos N + convênio |
| Check-in | conta se Plus; ASO **não** abre conta | sempre; ASO também |
| Conta | 1 por paciente/dia (`023`) | 1 por horário (+ 1 walk-in/dia) |
| Convênio | na conta, no check-in (`ultimoConvenioPaciente`) | no horário, obrigatório |
| Secretária / botão conta | `podeCobranca && conta_id`; finalizado exige prontuário | `cobranca` + conta; **todos** os status |
| Zap | 1 `procedimento_id`; ASO fora; `confirmacao_enviada` trava | N preparos; ASO entra; reenvio condicional |
| Prontuário | só se `tipo = consulta` | se lista tem `modo_clinico = prontuario` |
| ASO | só se `tipo = admissional` | se lista tem `modo_clinico = aso` |

Arquivos âncora (não é lista fechada; o bloco cita os seus):

- Edição: `backend/src/auth/edicao.ts`, `backend/src/routes/cobranca.ts`, `cobrancaCheckin.ts`, `dashboardService.ts`, `scripts/instalador-lib.ps1`, `scripts/definir-edicao.mjs`
- Agenda: `backend/src/routes/agendamentos.ts`, `frontend/src/pages/AgendaPage.tsx`, `FilaMedicoPage.tsx`
- Conta: `backend/src/services/cobrancaContas.ts`, `cobrancaCheckin.ts`, `database/023_integridade_i4_cobranca.sql`
- Zap: `backend/src/services/whatsappService.ts`
- Clínico: `backend/src/routes/prontuarios.ts`, `admissionais.ts`
- Permissão botão: `AgendaPage.tsx` `podeConsultarFinalizado` + `renderAcoesLinha`

---

## 5. Blocos

### U0 — Fundação `[x]`

**Fazer:** este documento é o U0. Congelar decisões da §1. Não gerar código.

**Aceite:** próximo pedido é U1, não “já mete a tela da agenda”.

---

### U1 — Produto único `[x]`

**Objetivo:** cobrança sempre disponível. Permissão real nas secretárias antigas.

**Migration `031_edicao_unica.sql` (nome ilustrativo; usar próximo livre):**

- `UPDATE app_meta SET valor = 'clinico_cobranca' WHERE chave = 'edicao'`
- Insert `usuario_permissoes` `cobranca`, `cobranca_relatorios`, `cobranca_config` para perfil `secretaria` ativo que ainda não tenha
- Insert `cobranca_solicitar` para perfil `medico` ativo que ainda não tenha
- Admin: `cobranca*` se ainda não tiver (perfil admin usa `MODULOS` no default, mas linhas antigas podem estar incompletas)

**Código:**

- `getEdicaoClinica()` passa a retornar só `clinico_cobranca` **ou** remove-se o tipo `clinico` e todos os `=== "clinico_cobranca"` viram “sempre”.
- Preferir **remover o gate**, não `return "clinico_cobranca"` eterno com mortos em volta. Cada `if (getEdicaoClinica() !== "clinico_cobranca")` some.
- Tirar 403 no router `cobranca.ts`.
- `executarContaNoCheckin` / `enriquecerAgendamentoComConta`: não retornar null por edição.
- `dashboardService`: `cobranca_disponivel` = tabela existe (sempre, pós-018).
- `GET /api/auth/me`: `edicao` pode ficar constante para não quebrar o front numa PR; U14 remove o campo.
- Front: `AgendaPage` `cobrancaAgenda`, `AtendimentoPage` gate de edição, `DashboardPage` `cobranca_disponivel` — tratar como sempre verdadeiro **ou** apagar o if.
- `permissoesDefaults.ts` admin: incluir `cobranca*` (hoje o default de UI do admin **omite** cobrança).
- Instalador: U14. Em U1, se o picker ainda existir, **default único** Plus e não gravar `clinico`. Não deixar caminho de instalar clínico.

**Não fazer em U1:** mudar agenda, conta, Zap.

**Testes:** scripts `test-m*-cobranca.ts` deixam de dar skip por edição. Rodar pelo menos M3 e M6.

**Aceite:**

- Instalação que era `clinico` abre menu Cobrança para secretária (após relogin).
- Check-in de consulta cria conta.
- Nenhum 403 de edição em `/api/cobranca`.
- Login secretaria criado **antes** da cobrança ganha módulos na migration, sem o admin marcar na mão.

---

### U2 — `modo_clinico` no cadastro `[x]`

**Migration:** `ALTER TABLE procedimentos ADD COLUMN modo_clinico TEXT NOT NULL DEFAULT 'nenhum'` com CHECK (`prontuario`, `aso`, `nenhum`). Update seed: Consulta e Consulta retorno → `prontuario`; Admissional → `aso`.

**API cadastro** (`/api/cobranca/procedimentos`): campo obrigatório no create/update. Listagens devolvem o campo.

**UI** `CobrancaProcedimentosPage`: seletor com os três valores. Texto curto: o que cada um abre. Impedir desativar o último `prontuario` ativo e o último `aso` ativo se ainda houver agendamento futuro daquele modo (ou avisar e bloquear).

**Não** inferir modo pelo nome no runtime. Migration de seed pode usar nome **uma vez**.

**Aceite:** criar “Ultrassom” como `nenhum`; “Consulta” não perde `prontuario` no update acidental sem o campo.

---

### U3 — Schema do atendimento `[x]`

**Migration:** `database/034_agendamento_procedimentos.sql`.

**Tabelas/colunas:**

```sql
-- agendamentos
convenio_id INTEGER NOT NULL REFERENCES convenios(id)  -- backfill: 1

CREATE TABLE agendamento_procedimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  procedimento_id INTEGER NOT NULL REFERENCES procedimentos(id),
  ordem INTEGER NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'agenda'
    CHECK (origem IN ('agenda', 'secretaria', 'medico')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (agendamento_id, procedimento_id)
);
```

Backfill:

- Se `agendamentos.procedimento_id` NOT NULL → uma linha `origem = 'agenda'`.
- Se `tipo_atendimento = 'admissional'` e sem procedimento → procedimento seed Admissional.
- Senão (consulta sem procedimento) → seed Consulta.
- `convenio_id`: da conta do paciente/data se existir; senão 1.

Manter `agendamentos.procedimento_id` **preenchido** com o primeiro da lista (espelho) até U14, **somente pelo serviço** — API de escrita nova não aceita `procedimento_id` isolado sem a lista. Objetivo do espelho: Zap e listagens antigas não quebram no meio da série. U11 já lê a N:N; U14 dropa a coluna se nada mais ler.

**Triggers (mínimo no U3, fechar no U13):**

- Não misturar `prontuario` e `aso` no mesmo `agendamento_id`.
- Pelo menos um procedimento por agendamento.
- `convenio_id` obrigatório e convênio ativo na inserção.

**Aceite:** clinic vazia + clinic com dados reais de homologação: todo agendamento tem ≥1 linha N:N e `convenio_id`.

---

### U4 — Conta 1:1 com agendamento `[x]`

**Migration:** `database/035_conta_um_por_agendamento.sql`.

- Drop `idx_contas_paciente_data_unique`.
- Criar os dois UNIQUE da §3.5.
- Sem produção: reescrever contas de homologação para 1:1 com horário (ou apagar contas de teste e deixar o check-in recriar). Sem índice velho convivendo com o novo.

**Serviço `cobrancaContas.ts`:**

- `buscarContaPorPacienteData` **não** é mais o caminho do check-in agendado.
- Novo: `buscarContaPorAgendamento(agendamentoId)`.
- `abrirConta` com `agendamento_id`: recusa se já houver ativa para esse horário; **não** reutiliza conta de outro horário do mesmo dia.
- Walk-in: `agendamento_id` NULL; continua `buscarContaPorPacienteData` só nesse caso.

**`cobrancaCheckin.ts`:** usa conta do **horário**. ASO **não** retorna mais null por tipo. Resolve procedimento(s) pela N:N, não por `obterProcedimentoIdCheckin` de um id. Função antiga some ou vira loop na lista.

**Enriquecer agenda:** `conta_id` = conta daquele `agendamentos.id`, não “qualquer conta do paciente no dia”.

**Aceite (casos):**

1. Paciente, 10:00 Unimed consulta, 14:00 Particular ultrassom → duas contas, dois convênios.
2. Walk-in no mesmo dia de um horário → terceira conta sem `agendamento_id` **ou** recusar walk-in se a regra de negócio preferir só agenda (v1: **permitir** walk-in, índice 2).
3. Check-in do segundo horário **não** mete item na conta do primeiro.

Teste novo obrigatório (não só adaptar M3): dois agendamentos mesmo paciente/dia.

---

### U5 — API de agendamento `[x]`

**POST /agendamentos** body. Preço ausente: **permite agendar** (preço 0 no check-in, como hoje). Não bloqueia a agenda.

```ts
{
  paciente_id, medico_id, data, hora,
  duracao_minutos?, observacao_agenda?, eh_encaixe?, checkin?,
  convenio_id,                    // obrigatório
  procedimento_ids: number[],     // ≥1, ordem = índice
  ficha_template_id?              // só se houver modo prontuario na lista
}
```

Remover do contrato público: `tipo_atendimento` como input. Se cliente antigo mandar, **400** com mensagem clara (não mapear calado).

Validações no servidor (Zod + regras):

- procedimentos ativos, ids únicos
- mistura `prontuario`+`aso` → 400
- `ficha_template_id` só com `prontuario`; ASO ignora/recusa
- `eh_retorno` não vem do client; deriva de Consulta retorno na lista
- convênio ativo
- preço ausente: **permitir** agendar (preço 0 como hoje) **ou** 400 — **decidir no U5 e documentar no endpoint**. Recomendação profissional: agendar pode, check-in avisa; não bloquear agenda da clínica que ainda não preencheu tabela. UI mostra “sem preço”.

**GET lista / fila / um:** cada row traz `convenio_id`, `convenio_nome`, `procedimentos: { id, nome, modo_clinico, ordem }[]`, `conta_id`, `conta_status`.

**PATCH procedimentos** (pode nascer no U5 e a UI de “depois” no U10): mesmo validador. Transação com conta se existir e `em_aberto` (U6/U10).

**Aceite:** POST sem `tipo_atendimento` cria ASO só com id do procedimento Admissional. POST com tipo no body = 400.

---

### U6 — Check-in `[x]`

Status → `presente` (e create com `checkin: true`):

1. Garante conta do **agendamento**.
2. Convênio da conta = convênio do horário (se conta nova). Se conta walk-in reutilizada — **não reutilizar** para horário (U4).
3. Para cada linha N:N: `garantirItemPrevisto`.
4. Vincula `agendamento_id` na conta.
5. ASO: item Admissional na conta (fim do furo M8′ vs check-in).

Erro de cobrança **aborta** o check-in (já é transação em `agendamentos.ts`). Não deixar `presente` sem conta.

**Aceite:** check-in ASO cria conta + item. Check-in consulta+ultrassom cria dois previstos.

---

### U7 — Agenda (UI) `[x]`

`AgendaPage.tsx` — maior tela. Sem combo Tipo.

Form “Agendar agora”:

- Data, hora, paciente, médico (iguais)
- **Convênio** (select obrigatório, default último / Particular)
- **Procedimentos** (multi: chips + adicionar). Pelo menos um. Bloquear adicionar ASO se já houver consulta e vice-versa (mesmo erro do servidor, mensagem humana)
- Ficha clínica: visível só se a lista tiver `prontuario`
- Check-in hoje, encaixe, observação
- Retorno vigente: se a secretária incluir “Consulta retorno”, `eh_retorno` deriva no server; banner atual pode permanecer como ajuda, não como segundo eixo

Lista do dia:

- Badges = nomes dos procedimentos (não só tipo)
- Convênio curto
- Ações: Check-in / Não veio / Cancelar / WhatsApp / **Conta** se `conta_id` (U8 fecha finalizado; U7 já mostra em `presente` e `em_atendimento` para `cobranca`)

**Aceite:** secretária agenda Consulta+Ultrassom Unimed sem passar em Cobrança. ASO agenda pelo procedimento, não pelo combo.

---

### U8 — Sala de espera e botão conta `[x]`

`FilaMedicoPage.tsx` + `AgendaPage.renderAcoesLinha`:

- Botão/link de conta se `temModulo(cobranca) && conta_id`, **qualquer** status que tenha conta (`presente`, `em_atendimento`, `finalizado`). `agendado` só tem conta se check-in imediato no create.
- **Não** amarrar o botão a `podeConsultarFinalizado` / `prontuario_ler` / `fila_medico`.
- Finalizado: secretária vê **Conta** (ou “Conta paga” / “A faturar”). “Ver consulta” / “Ver ASO” só quem tem módulo clínico.
- Colunas da fila: mesmo botão em Aguardando, Em atendimento, Finalizados. Agendados: Check-in; conta só se já existir.

**Aceite:** login secretaria, paciente finalizado, conta em aberto → botão na agenda **e** na sala de espera. Médico sem `cobranca` (só `cobranca_solicitar`) **não** vê o botão da recepção; usa aba no atendimento.

---

### U9 — Abrir clínico pelo modo `[x]`

**Backend:**

- `POST /prontuarios/abrir`: recusa se o horário **não** tiver procedimento `prontuario`. Recusa ASO.
- `POST /admissionais/abrir`: recusa se **não** tiver `aso`. Recusa consulta.
- Mensagens de erro falam em procedimento, não em “tipo inválido” como conceito de UI.

**Frontend fila/agenda:**

- `Atender` / `Ver consulta` se modo prontuario
- `Atender` / `Ver ASO` se modo aso
- Só exames: sem Atender clínico

Histórico do paciente: abas atuais (consultas / ASO) permanecem. Não fundir tabelas.

**Aceite:** horário ASO não chama `prontuarioAbrir`. Horário consulta não chama `admissionalAbrir`.

---

### U10 — Editar depois do agendar `[x]`

**Serviço único** (ex. `sincronizarProcedimentosAgendamento` em `backend/src/services/`):

Entrada: `agendamento_id`, `procedimento_ids[]`, `convenio_id?`.  
Transação:

1. Recalcular `tipo_atendimento` derivado e `eh_retorno`.
2. Diff da N:N: insert/delete (não cancelar item de conta já `realizado` sem regra — **proibir remover** procedimento com item `realizado` / pago; 400).
3. Se conta `em_aberto`: insert `previsto` novos; cancelar item previsto/solicitado dos removidos; reprecificar se convênio mudou.
4. Se conta fechada: 400 “reabra a conta”.
5. Se `hoje < data` e confirmação já enviada e há procedimento **novo** com `orientacoes_paciente`: marcar `whatsapp_preparo_pendente` (coluna ou tabela de ids já notificados) — U11 envia. Não enviar Zap dentro deste serviço se quiser fila; ou chamar U11 no mesmo request. Preferir **mesmo request** após commit, falha de Zap **não** desfaz o lançamento (log erro).

**UI:** o mesmo editor de procedimentos+convênio:

- Form da agenda (editar horário `agendado` — se hoje não houver edit de linha, **criar**: abrir o form preenchido)
- Painel na conta (`CobrancaContaPage`) — já adiciona item; passar a usar o serviço do horário quando `agendamento_id` existe, para não divergir
- Atalho no card (U8) já leva à conta; na conta, incluir procedimento **é** incluir no horário

Status `finalizado` + conta `em_aberto`: secretária ainda inclui (exame pedido na saída). Médico já saiu do prontuário; item novo `origem = secretaria`.

**Aceite:** incluir ultrassom com paciente em atendimento → item na conta **e** na lista do horário na agenda após refresh. Remover previsto não realizado some dos dois. Remover realizado = erro.

---

### U11 — WhatsApp `[x]`

**Leitura de `{preparo}`:** JOIN N:N + `procedimentos.orientacoes_paciente`, concat com espaço, trim, colapsar espaços (já existe em `formatarTemplate`).

**Lista de disparo:** tirar exclusão de `admissional`. Continua `status = agendado'`, `confirmacao_enviada = 0`.

**Reenvio de preparo (decisão 21–22):**

- Coluna sugerida: `agendamento_procedimentos.preparo_enviado INTEGER NOT NULL DEFAULT 0`
- No primeiro `enviarConfirmacaoAgendamento`: marca todos daquele horário `preparo_enviado = 1` (mesmo orientação vazia).
- Depois do U10: se `hojeIsoLocal() < data` e existe linha com `preparo_enviado = 0` e orientação não vazia e telefone ok: envia mensagem **só** com os preparos novos (template curto, não o de confirmação SIM). Marca essas linhas. Se `hoje >= data`: marca `preparo_enviado = 1` **sem** enviar (não fica fila eterna).
- Disparo automático do dia: além da confirmação, processar preparos pendentes elegíveis (data futura).

Botão WhatsApp manual na agenda: continua confirmação se ainda não enviou. Se já enviou, **não** reenviar confirmação; pode disparar preparos pendentes se `hoje < data`.

**Aceite:**

- Consulta+endoscopia no agendar, um Zap com os dois preparos.
- Zap foi, no dia seguinte (ainda antes da consulta) inclui ultrassom com orientação → segundo Zap só ultrassom.
- Inclui ultrassom **no dia** da consulta → nenhum Zap extra; item na conta.

---

### U12 — Caixa, dashboard, relatórios `[x]`

Revisar todo SQL que assume 1 conta / paciente / dia:

- `cobrancaCaixa.ts`, `cobrancaRelatorios.ts`, `cobrancaFaturamentoConvenio.ts`, `dashboardService.ts`
- UI `CobrancaContasPage`, `CobrancaCaixaPage`: mesmo paciente pode aparecer **várias** linhas no dia (horários). Coluna hora / procedimentos obrigatória para não parecer duplicata.

Dashboard “contas em aberto” conta **contas**, não pacientes.

**Aceite:** dois horários, duas linhas no caixa do dia, totais somam as duas.

---

### U13 — Integridade e testes `[x]`

**SQL** (além de U3/U4): `INTEGRIDADE_VINCULOS.md` seção financeira reescrita: episódio financeiro = `agendamentos.id` quando houver horário; chave deixa de ser paciente+data.

Triggers:

- mistura modo no N:N
- conta com `agendamento_id` aponta para o mesmo `paciente_id` e `data` do horário
- `conta_itens.agendamento_procedimento_id` do mesmo `agendamento_id` da conta
- convênio do horário = convênio da conta enquanto `em_aberto` (ou sync só via serviço e trigger que recusa divergência)

**Scripts de teste novos** (espelhar `backend/scripts/test-m3-cobranca.ts`):

| Caso | Resultado |
|------|-----------|
| Dois horários, dois convênios, mesmo dia | duas contas |
| Check-in ASO | conta + item |
| POST com tipo_atendimento | 400 |
| Mistura consulta+ASO | 400 |
| Secretária sem prontuário, finalizado, tem conta | API da conta 200; (UI U8) |
| Zap segundo preparo `hoje < data` | log_whatsapp extra |
| Zap segundo preparo `hoje = data` | nenhum extra |
| Walk-in + horário mesmo dia | duas contas |
| Remover item realizado | 400 |

Regressão: M5 pagamento, M9 guia, abrir prontuário, abrir ASO, retificação.

**Aceite:** suíte nova verde em base limpa e em cópia de `medpronto.db` de homologação.

---

### U14 — Instalador, licença, docs, limpeza `[x]`

**Instalador:** remover `Show-EditionPicker`, `edicao.txt` como escolha, `definir-edicao.mjs` ou reduzir a no-op. Update não pergunta edição. `Apply-MedProntoEdicao` some ou só força Plus.

**Licença:** `syncEdicaoFromLicense` não rebaixa. Payload `ed` documentado como obsoleto.

**Front `tipo_atendimento`:** badges passam a usar `modo_clinico` do procedimento clínico (ou lista). Helpers em `tipoAtendimento.ts` podem ficar como rótulo derivado.

**Drop controlado (só se grep zerado):**

- parar de escrever `agendamentos.procedimento_id` (coluna pode ficar até migration `03x_drop` posterior; **não** drop no mesmo dia do U3)
- `me.edicao` / `modulos_edicao` simplificados

**Docs a atualizar no mesmo bloco (não deixar mentira publicada):**

| Arquivo | O quê |
|---------|--------|
| `Plano_MedPronto_v2.md` §1 planos comerciais, §15.1, §15.4 | um produto; apontar este arquivo |
| `MODULO_COBRANCA.md` §3 conta, §6.1 edições, M3 | conta = horário; edições mortas |
| `MODULO_ADMISSIONAL.md` §1 planos, A3 | entrada via procedimento |
| `INTEGRIDADE_VINCULOS.md` §1 e §2.4 | chave financeira |
| Este arquivo | marcar `[x]` |

**Aceite:** grep `clinico_cobranca` no `frontend/src` e `backend/src` só em constante obsoleta ou nenhum. Docs comerciais sem tabela de duas edições. Instalador não pergunta.

**Feito (2026-08-21):** picker e `edicao.txt` saíram do instalador/atualizador; `definir-edicao.mjs` só força o valor legado no `app_meta`; `syncEdicaoFromLicense` ignora `ed`; `/me` sem `edicao`/`modulos_edicao`; badges e ficha usam `modo_clinico`. `agendamentos.procedimento_id` continua espelho (trigger `034`); drop da coluna não entra neste bloco.

---

## 6. Ordem na tela (secretária / médico) — o que o usuário vê no fim

1. Secretária agenda: paciente, médico, hora, **convênio**, **procedimentos**, manda Zap se configurado (preparos da lista).
2. Incluiu exame no dia seguinte, ainda antes da consulta: segundo Zap só do exame.
3. Check-in: conta daquele horário, todos previstos, convênio já certo.
4. Espera / durante / depois: botão conta; inclui o que o paciente pediu; médico solicita na consulta se precisar.
5. Incluiu exame **no dia**: conta atualiza, Zap calado.
6. Médico: consulta → prontuário; ASO → ASO; exame sozinho → sem ficha.
7. Caixa: uma linha por horário.

---

## 7. Fora deste plano

- Laudo estruturado de ultrassom/endoscopia (continua anexo M7).
- TISS, NF, maquininha, PIX automático.
- Somar tempo de sala por procedimento.
- Vários convênios no mesmo horário.
- Fusão prontuário + ASO numa tabela.
- Reprecificar contas **já fechadas** do histórico paciente/dia.

---

## 8. Critério de pronto (Definition of Done global)

Código na `main` de homologação só quando:

- [x] U1–U14 `[x]` neste arquivo  
- [x] Nenhum combo “Tipo de atendimento” na agenda  
- [x] Secretária com módulo `cobranca` opera conta em espera, em atendimento e finalizado  
- [x] Dois horários / dois convênios / mesmo dia = duas contas  
- [x] ASO gera conta no check-in  
- [x] Zap N preparos + regra `hoje < data`  
- [x] Prontuário e ASO inalterados na essência clínica (papel, retificação, PDF ASO)  
- [x] Docs irmãos alinhados  
- [x] Sem `if` de edição e sem inferência por nome de procedimento no runtime  

Se um item acima for “depois a gente vê”, o plano **não** está implementado — está pela metade. A metade que sobra é exatamente o atalho que este documento recusa.
