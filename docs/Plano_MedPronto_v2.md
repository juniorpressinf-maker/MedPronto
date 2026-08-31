# MedPronto — Plano de Desenvolvimento v2

**Sistema de Consultório Médico** — Agenda de pacientes, fila do dia, prontuário completo, receituário, documentos clínicos e **exame admissional**.

**Referência visual obrigatória:** `d:\agenda` — cores, CSS, tabelas, buscas, menu lateral, componentes de layout e padrões de tela devem seguir o projeto Agenda (tema Estnovo: azul, preto e branco).

**Nota técnica:** Infraestrutura (auth, backup, licença, instalador) portada de `d:\agenda` — ver `docs/REGRAS_INFRA.md`. Banco: `better-sqlite3` + Node 22 portátil. Visual clínico: Agenda só leitura.  
**Módulos complementares:** admissional clínico → `docs/MODULO_ADMISSIONAL.md`; fichas de consulta editáveis → `docs/MODULO_FICHAS_CLINICAS.md`; cobrança → `docs/MODULO_COBRANCA.md`; integridade de vínculos → `docs/INTEGRIDADE_VINCULOS.md`.  
**Fora de escopo:** estoque, NF, telemedicina, integrações contábeis, TISS.

---

## 1. Visão do produto

Sistema **local** para consultório médico, pensado para funcionar **com ou sem internet** no dia a dia clínico.

- A **secretaria** gerencia agenda de pacientes, check-in e upload de exames — **sem acesso ao prontuário**.
- O **médico** usa a **fila do dia** e atende em tela com **formato de prontuário em papel pré-impresso**.
- O **administrador** define **quais módulos** cada usuário pode usar (permissões granulares).
- O prontuário guarda **histórico imutável** de consultas, exames anexados, receitas e atestados.
- **Admissional** (exame ocupacional) é fluxo **separado** do prontuário de consulta — formulário + conclusão apto/inapto; ver `docs/MODULO_ADMISSIONAL.md`.

### Produto (um instalador)

Um produto: **clínico + financeiro**. Não há SKU `clinico` nem picker no instalador. Permissões por usuário ligam ou desligam o que cada login vê (agenda, prontuário, cobrança…).  
Contrato: `docs/PLANO_UNIFICACAO_ATENDIMENTO.md`. Cobrança: `docs/MODULO_COBRANCA.md`. Licença não escolhe edição (campo `ed` no token é obsoleto e ignorado).

### Princípios

1. **Consulta** é o centro — tudo clínico vincula a um atendimento.
2. **Evoluções não se apagam** — só retificação com registro.
3. **Offline-first** — CID-10, banco e arquivos locais.
4. **Escopo enxuto** — sem ERP, sem estoque, sem faturamento.
5. **UI herdada do Agenda** — mesmo design system, mesmos padrões de tabela/busca/menu.
6. **Telas do médico = prontuário papel** — layout de ficha clínica pré-impressa (ver seção 5).
7. **Permissões por módulo** — o admin define o que cada usuário acessa; perfil é só modelo inicial (ver seção 2).
8. **Evolução por fases** — MVP clínico primeiro; WhatsApp por último.

---

## 2. Usuários e permissões por módulo

O **administrador** cadastra usuários e marca **quais módulos** cada um pode usar.  
O campo `perfil` (`admin` | `medico` | `secretaria`) define **valores padrão** ao criar o usuário; o admin pode ajustar módulo a módulo.

### 2.1 Regra de ouro

| Tipo de dado | Secretaria (padrão) | Médico | Admin |
|--------------|---------------------|--------|-------|
| Dados cadastrais do paciente (nome, CPF, telefone) | Sim | Sim | Sim |
| **Prontuário / evoluções / receitas / atestados** | **Não** | Sim | Sim (se liberado) |
| Upload de exame (arquivo na ficha) | Sim | Ver no atendimento | Sim |
| Agenda e check-in | Sim | Ver fila do dia | Sim |
| **Admissional** (formulário + conclusão) | Agendar/check-in (`admissional_agenda`) | Preencher (`admissional`) | Sim |

> **Secretaria não vê prontuário** — nem leitura, nem edição. Pode cadastrar paciente e anexar exame, mas não abre histórico clínico.

### 2.2 Módulos do sistema

Cada linha é uma permissão que o admin liga/desliga por usuário:

| Código do módulo | Menu / área | Descrição |
|------------------|-------------|-----------|
| `agenda` | Agenda | Ver e gerenciar horários, agendamentos |
| `pacientes` | Pacientes | Cadastro e busca (somente dados administrativos) |
| `fila_recepcao` | Agenda / check-in | Marcar paciente presente, cancelar, não compareceu |
| `exames_anexos` | Pacientes / upload | Enviar PDF/imagem de exame (sem abrir prontuário) |
| `fila_medico` | Atendimento → Fila | Ver fila do dia (aguardando / em atendimento) |
| `prontuario_ler` | Atendimento | Ver histórico de consultas e evoluções |
| `prontuario_escrever` | Atendimento | Registrar consulta atual (ficha papel) |
| `receituario` | Atendimento | Emitir e imprimir receitas |
| `documentos` | Atendimento | Atestado, pedido de exame, PDFs clínicos |
| `admissional` | Admissional | Formulário, conclusão, PDF (exame ocupacional) |
| `admissional_agenda` | Agenda / fila | Agendar admissional, check-in, status |
| `usuarios` | Config → Usuários | CRUD de usuários e permissões |
| `clinica` | Config → Clínica | Dados e logo do consultório |
| `backup` | Config → Backup | Backup e restauração |
| `licenca` | Config → Licença | Licenciamento |
| `whatsapp` | Config → WhatsApp | Confirmação de consulta (Fase 6) |

### 2.3 Perfis = modelo inicial (admin pode alterar)

Ao criar usuário, o sistema **pré-marca** os módulos conforme o perfil; o admin ajusta na mesma tela:

**Secretaria (padrão)**  
`agenda`, `pacientes`, `fila_recepcao`, `exames_anexos`, `admissional_agenda`  
— sem `prontuario_*`, `receituario`, `documentos`, `fila_medico`, `admissional`

**Médico (padrão)**  
`fila_medico`, `prontuario_ler`, `prontuario_escrever`, `receituario`, `documentos`, `admissional`, `agenda` (somente leitura da própria agenda — opcional na Fase 1)  
— sem `usuarios`, `backup`, `licenca`, `clinica`, `admissional_agenda`

**Admin**  
Todos os módulos, inclusive `usuarios`, `clinica`, `backup`, `licenca`, `whatsapp`

### 2.4 Implementação (Fase 1)

**Banco** — migration `003_permissoes_modulos.sql`:

```sql
usuario_permissoes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL,
  permitido INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (usuario_id, modulo)
)
```

**Backend**

- `GET /api/auth/me` → retorna `permissoes: string[]` (módulos liberados)
- Middleware `requireModulo('prontuario_ler')` em rotas de prontuário
- Rotas de prontuário/receita **nunca** registradas sem checagem — secretaria recebe 403

**Frontend**

- Menu lateral (`navigation.ts`) filtrado pelas permissões do usuário logado
- Rotas protegidas: sem permissão → não aparece no menu e redirect se URL digitada
- Tela **Config → Usuários**: checklist de módulos por usuário (padrão Agenda, `CadastroSimples` + formulário)

**Auditoria**  
`log_acesso` registra tentativas de acesso negado a prontuário (LGPD).

### 2.5 Resumo visual

```
Admin cadastra usuário
    → escolhe perfil (secretaria | medico | admin)
    → sistema marca módulos padrão
    → admin ajusta checkboxes por módulo
    → salva em usuario_permissoes

Login
    → /api/auth/me traz permissoes[]
    → menu e rotas só mostram o permitido
```

---

## 2b. Perfis (referência rápida — subordinados às permissões)

| Perfil | Uso típico | Observação |
|--------|------------|------------|
| **secretaria** | Recepção | Padrão sem prontuário |
| **medico** | Consultório | CRM obrigatório; padrão com prontuário |
| **admin** | Dono / TI | Todos os módulos; gerencia permissões dos demais |

---

## 3. Fluxo da fila (estados)

```
agendado → presente → em_atendimento → finalizado
    ↓           ↓
 cancelado   nao_compareceu
```

| Status | Significado | Quem altera |
|--------|-------------|-------------|
| `agendado` | Consulta marcada, paciente ainda não chegou | Secretaria |
| `presente` | Paciente chegou, aguardando o médico | Secretaria (check-in) |
| `em_atendimento` | Médico abriu o atendimento | Médico (automático) |
| `finalizado` | Consulta encerrada | Médico |
| `nao_compareceu` | Não veio no horário | Secretaria |
| `cancelado` | Consulta cancelada antes | Secretaria |

### Tela do médico (fila do dia)

Três colunas ou abas:

1. **Aguardando** (`presente`)
2. **Em atendimento** (`em_atendimento`)
3. **Finalizados hoje** (`finalizado`)

Lista lateral: **Agendados** (ainda não chegaram).

Atualização da fila: polling 5–10 s no MVP; WebSocket na fase de polish.

---

## 4. Diretriz visual — baseada em `d:\agenda`

Todo o front-end deve reutilizar ou espelhar:

| Elemento | Referência em `d:\agenda` |
|----------|---------------------------|
| Tema / cores / CSS | `frontend/src/index.css` |
| Acessibilidade (fontes, botões) | `frontend/src/agenda-ux.css` → `medpronto-ux.css` |
| Menu lateral em árvore | `components/Layout.tsx` + `config/navigation.ts` |
| Cabeçalho de página | `components/PageHeader.tsx` |
| Tabelas e busca | `CadastroSimples.tsx`, `useTableSort`, `useTableRowNavScroll` |
| Busca (Enter, maiúsculas) | Padrão `toolbar-search` + `legacy-input` |
| Cards e painéis | `est-card`, `page-stack`, `dup-table-wrap` |

**Portas de desenvolvimento (evitar conflito com Agenda):**

- API: `3021`
- Frontend Vite: `5176`

---

## 5. Telas do médico — Prontuário tipo papel pré-impresso

As telas usadas pelo **médico** (fila, atendimento, histórico, receituário, atestado) devem simular uma **ficha clínica em papel pré-impresso**, não um formulário web genérico.

### Conceito visual

- Fundo **branco** (`--panel`), bordas finas cinza/azul como formulário impresso.
- **Cabeçalho fixo** da ficha: logo da clínica, nome do consultório, CRM do médico, data/hora.
- **Faixa de identificação do paciente**: nome, data de nascimento, idade, CPF, alertas (alergias em vermelho).
- Campos organizados em **blocos numerados** como ficha física:
  1. Queixa principal
  2. Anamnese
  3. Exame físico
  4. Hipótese diagnóstica / CID-10
  5. Conduta / Plano terapêutico
- Linhas pontilhadas ou áreas com borda inferior (`border-bottom: 1px dotted`) simulando espaço para escrita.
- Tipografia legível (herda `--agenda-font-base` do Agenda).
- Área de **histórico** à direita ou abaixo, como “folhas anteriores” empilhadas.
- Impressão/PDF deve reproduzir o mesmo layout da tela.

### Arquivo CSS dedicado

`frontend/src/prontuario-papel.css` — classes:

- `.prontuario-folha` — container principal (A4 proporcional na tela)
- `.prontuario-cabecalho` — logo + clínica + médico
- `.prontuario-paciente` — faixa de identificação
- `.prontuario-secao` — bloco numerado com título em caixa alta
- `.prontuario-campo` — label + área de preenchimento
- `.prontuario-alerta` — alergias / alertas clínicos em destaque
- `.prontuario-historico` — consultas anteriores em visual de documento

### Telas que usam este layout

| Tela | Layout papel |
|------|----------------|
| Atendimento (consulta atual) | Sim — principal |
| Histórico do paciente | Sim — folhas empilhadas |
| Receituário | Sim — cabeçalho clínico + itens |
| Atestado | Sim — documento formal |
| Fila do dia | Não — usa padrão Agenda (tabela/cards) |

---

## 6. Modelo de dados (SQLite)

### 6.1 Tabelas base

```sql
Clinica (id, nome, cnpj_cpf, telefone, endereco, logo_path, created_at)
Config_Licenca (id, data_instalacao, data_vencimento, ultima_contra_senha)
Usuarios (id, nome, login, senha_hash, senha_salt, perfil, crm, ativo, created_at, updated_at)
Usuario_Permissoes (usuario_id, modulo, permitido)  -- ver seção 2.4
Pacientes (id, nome, data_nasc, cpf, telefone, email, alergias, medicacoes_uso, observacoes_clinicas, created_at, updated_at)
```

### 6.2 Agenda e atendimento

```sql
Agendamentos (id, paciente_id, medico_id, data, hora, duracao_minutos, status,
  observacao_agenda, confirmacao_enviada, confirmacao_respondida, created_at, updated_at)
Agenda_Bloqueios (id, medico_id, data_inicio, data_fim, motivo)
```

### 6.3 Prontuário

```sql
Prontuarios (id, paciente_id, agendamento_id, medico_id, data_atendimento,
  queixa_principal, anamnese, exame_fisico, hipotese_diagnostica,
  cid_codigo, cid_descricao, conduta, plano,
  retificacao_de_id, motivo_retificacao, created_at)
```

### 6.4 Receituário

```sql
Receitas (id, prontuario_id, paciente_id, medico_id, data_emissao, observacoes, created_at)
Receita_Itens (id, receita_id, medicamento, dosagem, via, posologia, quantidade, duracao_dias)
Receita_Modelos (id, medico_id, nome_modelo, itens_json)  -- opcional Fase 2
```

### 6.5 Documentos e anexos

```sql
Atestados (id, prontuario_id, paciente_id, medico_id, dias_afastamento, cid_codigo, cid_descricao, texto_livre, data_emissao)
Pedidos_Exame (id, prontuario_id, paciente_id, medico_id, exames_solicitados, observacoes, data_emissao)
Exames_Anexos (id, paciente_id, prontuario_id, data_upload, descricao, arquivo_path, uploaded_by)
```

### 6.6 Auditoria e WhatsApp

```sql
Log_Acesso (id, usuario_id, paciente_id, acao, detalhe, created_at)
Config_WhatsApp (id, provedor, api_url, api_token, numero_origem, ativo, template_confirmacao)
Log_WhatsApp (id, agendamento_id, paciente_id, telefone, mensagem, status, created_at)
```

---

## 7. Módulos e telas

### Secretaria (padrão Agenda — tabelas e busca)

> Visível apenas com permissões `agenda`, `pacientes`, `fila_recepcao`, `exames_anexos`. **Sem aba de prontuário** na ficha do paciente.

| Tela | Permissão | Função |
|------|-----------|--------|
| Agenda do dia | `agenda` | Calendário/lista por médico e data |
| Novo agendamento | `agenda` | Paciente, data, hora, médico |
| Check-in | `fila_recepcao` | Marca `presente` na fila |
| Cadastro paciente | `pacientes` | Nome, CPF, telefone — **sem** histórico clínico |
| Upload exames | `exames_anexos` | PDF/imagem (metadado + arquivo) |
| Busca paciente | `pacientes` | Nome, CPF, telefone — Enter |

### Médico (fila Agenda + atendimento em prontuário papel)

> Requer `fila_medico` + `prontuario_*` conforme tela.

| Tela | Permissão | Função |
|------|-----------|--------|
| Fila do dia | `fila_medico` | Aguardando / em atendimento / finalizados |
| Atendimento | `prontuario_escrever` | Ficha papel — queixa, anamnese, exame, CID, conduta |
| Histórico | `prontuario_ler` | Folhas anteriores |
| Receituário | `receituario` | Itens + PDF |
| Atestado | `documentos` | Dias, CID, texto + PDF |
| Pedido de exame | `documentos` | Lista + PDF |

### Admin

| Tela | Permissão | Função |
|------|-----------|--------|
| Setup clínica | (1º acesso) | Dados + logo |
| Usuários | `usuarios` | CRUD + **checkboxes de módulos por usuário** |
| Backup / Restore | `backup` | ZIP do `.db` + `/uploads` |
| Licença | `licenca` | Vencimento + contra-senha |
| WhatsApp | `whatsapp` | Config (**última fase**) |

---

## 8. Stack técnica

| Camada | Tecnologia |
|--------|------------|
| Monorepo | npm workspaces (`backend`, `frontend`) |
| Backend | Node.js ESM, Express 5, TypeScript, **better-sqlite3**, Zod |
| Frontend | React 19, Vite 6, React Router 7, Tailwind v4, Lucide |
| Banco | SQLite via `better-sqlite3` (padrão Agenda, Node 22 portátil) |
| CID-10 | `backend/data/cid10.json` (~1,5 MB completo) |
| PDF | pdfkit ou HTML→PDF (Fase 2) |
| Auth | Sessão/cookie (padrão Agenda) |

### API CID-10

```
GET /api/cid?q=termo
→ até 10 resultados (código ou descrição)
```

---

## 9. Roteiro de desenvolvimento — passo a passo

### FASE 0 — Preparação do projeto ✅ (em andamento)

| # | Tarefa | Entregável |
|---|--------|------------|
| 0.1 | Monorepo `backend/` + `frontend/` | Estrutura espelhando `d:\agenda` |
| 0.2 | Node, React, Vite, TypeScript | Projeto sobe local |
| 0.3 | `.env.example` | Portas 3021 / 5176 |
| 0.4 | Migration `001_init.sql` | Schema completo |
| 0.5 | `cid10.json` + `GET /api/cid` | Autocomplete |
| 0.6 | CSS Agenda + `prontuario-papel.css` | Tema + base ficha médica |
| 0.7 | Página inicial com health + teste CID | Validação Fase 0 |

**Prompt Cursor:**
> Inicialize MedPronto com backend Node/SQLite, migration 001, endpoint GET /api/cid?q=, tema visual copiado de d:\agenda e CSS prontuario-papel.css para telas do médico.

---

### FASE 1 — MVP clínico (2–3 semanas)

| # | Tarefa |
|---|--------|
| 1.1 | Setup clínica (wizard primeiro acesso) |
| 1.2 | Login + perfis + **permissões por módulo** (`usuario_permissoes`) |
| 1.3 | Tela admin **Usuários** com checklist de módulos |
| 1.4 | `GET /api/auth/me` com `permissoes[]`; middleware `requireModulo` |
| 1.5 | Menu e rotas filtrados por permissão |
| 1.6 | CRUD pacientes — secretaria: só cadastro; **sem prontuário** |
| 1.7 | CRUD agendamentos |
| 1.8 | Máquina de estados da fila |
| 1.9 | Tela agenda secretaria + check-in (`presente`) |
| 1.10 | Tela fila do médico (`fila_medico`) |
| 1.11 | Abrir atendimento → `em_atendimento` |
| 1.12 | Formulário prontuário **layout papel** (`prontuario_escrever`) |
| 1.13 | Salvar e finalizar + histórico (`prontuario_ler`) |

**Critério de pronto:** secretaria agenda e faz check-in **sem ver prontuário**; médico atende na ficha papel; admin cria usuário secretaria com módulos limitados.

---

### FASE 2 — CID, receituário e documentos (1–2 semanas)

| # | Tarefa |
|---|--------|
| 2.1 | Autocomplete CID no atendimento |
| 2.2 | Receitas + Receita_Itens |
| 2.3 | PDF receita (layout papel + logo) |
| 2.4 | Atestado + PDF |
| 2.5 | Pedido de exame + PDF |
| 2.6 | Modelos de receita (opcional) |

---

### FASE 3 — Exames anexos e prontuário completo (1 semana)

| # | Tarefa |
|---|--------|
| 3.1 | Upload exames (secretaria) |
| 3.2 | Aba exames no atendimento |
| 3.3 | Vincular exame à consulta |
| 3.4 | Retificação de evolução |
| 3.5 | Alertas alergias/medicações em destaque na ficha |
| 3.6 | Bloqueios de agenda |

---

### FASE 7 — Admissional clínico (A0–A4)

**Especificação completa:** `docs/MODULO_ADMISSIONAL.md`  
**Edição:** incluído em **Clínico** e **Clínico + Cobrança** (cobrança do admissional = M8′ no doc de cobrança, só Plus).

| # | Tarefa | Bloco |
|---|--------|-------|
| 7.1 | Módulo `admissional` + migration + API base | A0 |
| 7.2 | Formulário, conclusão apto/inapto, finalizar | A1 |
| 7.3 | PDF admissional (logo clínica) | A2 |
| 7.4 | Agenda tipo admissional + fila/check-in | A3 |
| 7.5 | Histórico no paciente + anexo opcional | A4 |

**Critério de pronto:** secretaria agenda admissional e check-in; médico preenche e finaliza **sem** prontuário de consulta; PDF disponível.

**Ordem:** pode iniciar após Fase 3 (exames anexos) ou em paralelo ao polish — **não** depende de cobrança.

---

### FASE 4 — Auditoria, backup e licenciamento (1 semana) ✅

| # | Tarefa |
|---|--------|
| 4.1 | Log_Acesso |
| 4.2 | Tela auditoria (admin) |
| 4.3 | Backup ZIP |
| 4.4 | Restore |
| 4.5 | Validação de licença |
| 4.6 | Contra-senha |
| 4.7 | Tela admin licença |

---

### FASE 5 — Polish (3–5 dias) ✅

| # | Tarefa |
|---|--------|
| 5.1 | Polling/WebSocket da fila | `[x]` polling 8s agenda + fila |
| 5.2 | Encaixe na agenda | `[x]` |
| 5.3 | Impressão em lote | `[x]` PDF único mesclado |
| 5.4 | Validações (CPF, campos obrigatórios) | `[x]` CPF, e-mail e telefone no cadastro |
| 5.5 | Checklist QA | `[x]` §11 atualizado |

---

### FASE 6 — Confirmação de consulta por WhatsApp (módulo clínico)

**Único módulo que exige internet no momento do envio.**

| # | Tarefa |
|---|--------|
| 6.1 | Tabelas Config_WhatsApp + Log_WhatsApp | `[x]` |
| 6.2 | Tela config (admin) | `[x]` |
| 6.3 | Job cron — consultas de amanhã | `[x]` |
| 6.4 | Cliente Baileys (QR Code local, igual ZapMsg) | `[x]` |
| 6.5 | Template `{nome}`, `{data}`, `{hora}`, `{medico}` | `[x]` |
| 6.6 | Indicador na agenda (enviado/confirmado/erro) | `[x]` |
| 6.7 | Reenvio manual (secretaria) | `[x]` |
| 6.8 | Log de envios | `[x]` |

**Provedor:** WhatsApp Web via **Baileys** (sessão em `data/auth/`, QR na tela Config → WhatsApp) — mesmo modelo do ZapMsg.

---

## 10. Menu de navegação (MedPronto)

```
Início                              → /
Atendimento ▼
  ├ Fila do dia                     → /medico/fila
  └ (atendimento aberto)            → /medico/atendimento/:id
Agenda ▼
  ├ Agenda do dia                   → /agenda
  └ Pacientes                       → /pacientes
Cadastros ▼
  └ (reservado)
Configurações ▼
  ├ Clínica                         → /configuracoes/clinica
  ├ Usuários                        → /configuracoes/usuarios
  ├ Backup                          → /configuracoes/backup
  ├ Licença                         → /configuracoes/licenca
  └ WhatsApp                        → /configuracoes/whatsapp  (Fase 6)
```

---

## 11. Checklist QA

- [x] Secretaria cria paciente e agenda consulta
- [x] Check-in move para fila "aguardando"
- [x] Médico vê fila atualizada
- [x] Atendimento na **ficha papel** salva prontuário com CID
- [x] Receita gera PDF com logo
- [x] Histórico mostra consultas anteriores
- [x] Exame anexado aparece no atendimento
- [x] Admissional: agenda → check-in → formulário → PDF (Fase 7)
- [ ] Alergias visíveis em destaque na ficha
- [x] Backup/restore funciona
- [x] Licença vencida bloqueia acesso
- [x] WhatsApp envia e registra log (Fase 6)

---

## 12. Regras de ouro (Cursor)

1. **Uma etapa por vez** — ver **§15** (roteiro mestre); ao ouvir *“segue a próxima etapa”*, implementar **somente** a linha marcada como próxima.
2. **Visual sempre baseado em `d:\agenda`** — não inventar novo design system.
3. **Telas do médico = `prontuario-papel.css`** — exceto fila do dia.
4. **`@arquivo`** em correções pontuais.
5. **Migrations numeradas** — nunca alterar SQL antigo.
6. **Prontuário append-only** — sem DELETE em evoluções.
7. **Vínculos** — antes de gravar clínico/financeiro, seguir `docs/INTEGRIDADE_VINCULOS.md` §7.
8. **WhatsApp** só na Fase 6 (última etapa clínica do plano original).

---

## 13. Ordem visual do roadmap (visão geral)

```
Fases 0–3, 7 (clínico base)     → ver §9 e tabela §15
   ↓
I1, I3 (integridade)            → INTEGRIDADE_VINCULOS.md
   ↓
F0 → F1 → F2 → F3 → F4         → MODULO_FICHAS_CLINICAS.md (+ F1′, F5 opc.)
   ↓
Fase 4 (auditoria/backup/licença)
   ↓
Fase 5 (polish)
   ↓
M0 → M1 → M2 → M3 → M5 → M6   → MODULO_COBRANCA.md (+ I4; depois M4, M7, M8′, M9, M10)
   ↓
A4 (se pendente)                 → MODULO_ADMISSIONAL.md
   ↓
Fase 6 (WhatsApp)                ← ÚLTIMA ETAPA
```

**Detalhe passo a passo, status e próxima etapa:** **§15** (fonte da verdade para o Cursor).

---

## 14. Explicitamente fora do escopo (deste plano clínico)

- **Cobrança / caixa / preços** — no produto; ver `docs/MODULO_COBRANCA.md`
- Nota fiscal
- Estoque / farmácia
- Telemedicina
- TISS / convênios eletrônicos
- Internação hospitalar
- Receita controlada com validação ANVISA em tempo real (fase futura opcional)

> **Admissional** está **dentro** do plano clínico (`MODULO_ADMISSIONAL.md`), não confundir com cobrança.

---

## 15. Roteiro mestre — próxima etapa e protocolo Cursor

**Esta seção é a fonte da verdade** quando o usuário pedir *“segue a próxima etapa”*, *“implementa o próximo bloco”* ou similar.

### 15.1 Próxima etapa (atualizar ao concluir)

| Campo | Valor |
|-------|--------|
| **Código** | **—** |
| **Nome** | Roteiro mestre concluído (U0–U14) |
| **Documento** | `docs/PLANO_UNIFICACAO_ATENDIMENTO.md` §8 |
| **Atualizado em** | 2026-08-21 |

U14 (instalador, licença, docs, limpeza) concluído. Não há próxima etapa neste roteiro.

> Ao **terminar** uma etapa: marcar `[x]` no doc do módulo, avançar a linha **Próxima etapa** na tabela abaixo (primeira pendente na ordem §15.2) e atualizar §15.1.

### 15.2 Protocolo para o agente (Cursor)

Quando o usuário mandar seguir a próxima etapa:

1. Ler **§15.1** (código da próxima etapa).
2. Abrir o **documento** indicado e localizar o bloco (ex.: `### I1 —`, `### F0 —`, `### M3 —`).
3. Implementar **somente** esse bloco (aceite do bloco = critério de pronto).
4. Respeitar `docs/INTEGRIDADE_VINCULOS.md` §7 em qualquer gravação clínica/financeira.
5. Seguir `docs/REGRAS_INFRA.md` (migrations, build, portas).
6. Ao concluir: marcar bloco `[x]` no doc do módulo; atualizar §15.1 e a coluna **Status** na tabela §15.3.
7. **Não** pular etapas da ordem sem o usuário pedir explicitamente.

**Pedido explícito por bloco** (ex.: *“implementa M1”*): implementar esse bloco mesmo fora da ordem, mas avisar dependências pendentes.

### 15.3 Tabela mestre (ordem de execução)

Legenda status: `[x]` concluído · `[~]` em andamento · `[ ]` pendente

| Ordem | Código | Nome | Doc | Depende | Status |
|------:|--------|------|-----|---------|--------|
| 1 | Fase 0 | Preparação projeto | §9 Fase 0 | — | [x] |
| 2 | Fase 1 | MVP clínico | §9 Fase 1 | Fase 0 | [x] |
| 3 | Fase 2 | CID + receita + documentos | §9 Fase 2 | Fase 1 | [x] |
| 4 | Fase 3 | Exames + retificação | §9 Fase 3 | Fase 2 | [x] |
| 5 | A0–A3 | Admissional base | `MODULO_ADMISSIONAL.md` | Fase 3 | [x] |
| 6 | I1 | Constraints vínculos SQLite | `INTEGRIDADE_VINCULOS.md` | — | [x] |
| 7 | I3 | Atendimento: identificação só da API | `INTEGRIDADE_VINCULOS.md` | I0 | [x] |
| 8 | I2 | CPF único pacientes | `INTEGRIDADE_VINCULOS.md` | I0 | [x] |
| 9 | **F0** | **Fichas: fundação + seed** | `MODULO_FICHAS_CLINICAS.md` | I1 | [x] |
| 10 | **F1** | **Fichas: autoria visual** | `MODULO_FICHAS_CLINICAS.md` | F0 | [x] |
| 11 | **F2 + I5** | **Atendimento dinâmico + regra ficha/médico** | Fichas + Integridade | F1 | [x] |
| 12 | F3 | Agenda: escolher ficha | `MODULO_FICHAS_CLINICAS.md` | F1 | [x] |
| 13 | F4 | Histórico com snapshot | `MODULO_FICHAS_CLINICAS.md` | F2 | [x] |
| 14 | F1′ | Fichas: criar a partir de PDF | `MODULO_FICHAS_CLINICAS.md` | F1 | [x] |
| 15 | F5 | PDF consulta (opcional) | `MODULO_FICHAS_CLINICAS.md` | F2 | [x] |
| 16 | A4 | Admissional: histórico paciente | `MODULO_ADMISSIONAL.md` | A1 | [x] |
| 16′ | A5 | Admissional: retificação (folha nova) | `MODULO_ADMISSIONAL.md` | A1, A4 | [x] |
| 16″ | AM0–AM5 | Modelos de ASO (vários papéis, como fichas) | `MODULO_ASO_MODELOS.md` | A5, F1 | [x] |
| 17 | Fase 4 | Auditoria + backup + licença | §9 Fase 4 | Fase 3 | [x] |
| 18 | Fase 5 | Polish | §9 Fase 5 | Fase 4 | [x] |
| 19 | Fase 6 | WhatsApp (módulo clínico) | §9 Fase 6 | Fase 5 | [x] |
| 20 | M0 | Cobrança: fundação | `MODULO_COBRANCA.md` | I1 | [x] |
| 21 | M1 | Convênios + procedimentos + preços | `MODULO_COBRANCA.md` | M0 | [x] |
| 22 | M2 | Conta + itens | `MODULO_COBRANCA.md` | M1 | [x] |
| 23 | I4 | Cobrança: FK e checks | `INTEGRIDADE_VINCULOS.md` | M2 | [x] |
| 24 | M3 | Check-in → conta + retorno | `MODULO_COBRANCA.md` | M2 | [x] |
| 25 | M5 | Pagamentos + **desconto** | `MODULO_COBRANCA.md` | M2 | [x] |
| 26 | M6 | Caixa do dia | `MODULO_COBRANCA.md` | M5 | [x] |
| 27 | M4 | Médico solicita procedimento | `MODULO_COBRANCA.md` | M2 | [x] |
| 28 | M7 | Anexo exame no item | `MODULO_COBRANCA.md` | M2 | [x] |
| 29 | M8′ | Item ↔ admissional | `MODULO_COBRANCA.md` | M2, A1 | [x] |
| 30 | M9 | Guia convênio manual | `MODULO_COBRANCA.md` | M5 | [x] |
| 31 | M10 | Relatórios cobrança | `MODULO_COBRANCA.md` | M6 | [x] |
| 32 | M9′ | Convênio repasse mensal (`exige_guia`) | `MODULO_COBRANCA.md` §14.5 | M9 | [x] |
| 33 | **M11** | **Baixa recebimento convênio** | `MODULO_COBRANCA.md` §15 | M9, M10 | [x] |
| 34 | **U0** | Unificação: decisões congeladas | `PLANO_UNIFICACAO_ATENDIMENTO.md` | M11 | [x] |
| 35 | **U1** | Produto único (sem edição clínico vs Plus) | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U0 | [x] |
| 36 | **U2** | `modo_clinico` no procedimento | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U1 | [x] |
| 37 | **U3** | Schema do atendimento (N procedimentos + convênio no horário) | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U2 | [x] |
| 38 | **U4** | Conta 1:1 com agendamento | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U3 | [x] |
| 39 | **U5** | API de agendamento alinhada ao modelo | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U4 | [x] |
| 40 | **U6** | Check-in gera conta do horário | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U5 | [x] |
| 41 | **U7** | Agenda: formulário e lista | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U5, U6 | [x] |
| 42 | **U8** | Sala de espera + botão conta em todo status | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U7 | [x] |
| 43 | **U9** | Abrir clínico pelo modo do procedimento | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U8 | [x] |
| 44 | **U10** | Editar procedimentos depois do agendar | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U6–U9 | [x] |
| 45 | **U11** | WhatsApp: vários preparos + reenvio se hoje < data | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U3, U10 | [x] |
| 46 | **U12** | Caixa, contas do dia, dashboard, relatórios | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U4, U10 | [x] |
| 47 | **U13** | Integridade SQLite + testes de regressão | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U4–U12 | [x] |
| 48 | **U14** | Instalador, licença, docs, limpeza `tipo_atendimento` na UI | `PLANO_UNIFICACAO_ATENDIMENTO.md` | U1, U13 | [x] |

**I0** (documentação integridade): `[x]` — `INTEGRIDADE_VINCULOS.md` publicado.

### 15.4 Mapa de documentos (o que ler em cada tema)

| Tema | Documento principal | Também ler |
|------|---------------------|------------|
| Ordem e próxima etapa | **Este arquivo §15** | — |
| Vínculos paciente/médico/conta | `INTEGRIDADE_VINCULOS.md` | `database/011_vinculos_clinicos.sql` |
| Fichas de consulta editáveis | `MODULO_FICHAS_CLINICAS.md` | Integridade §4.1, I5 |
| Modelos de ASO (vários papéis) | `MODULO_ASO_MODELOS.md` | Admissional A5, Fichas F1/F1′ |
| Cobrança / convênio / desconto | `MODULO_COBRANCA.md` | Integridade §2.4, I4 |
| **Unificação atendimento = procedimento, um produto, conta por horário** | **`PLANO_UNIFICACAO_ATENDIMENTO.md`** | Cobrança M0–M11 (estado atual a substituir) |
| Admissional | `MODULO_ADMISSIONAL.md` | Integridade triggers |
| Infra / build / migrations | `REGRAS_INFRA.md` | — |
| Visual / UI | `d:\agenda` + §5 deste plano | `prontuario-papel.css` |

### 15.5 Decisões de produto já fechadas (não reabrir sem pedido)

**Unificação (2026-08-20):** decisões novas (um produto, atendimento = procedimentos, um convênio por horário, conta 1:1 com agendamento, Zap se `hoje < data`) estão em `PLANO_UNIFICACAO_ATENDIMENTO.md` §1. Onde este §15.5 **contrizer** esse arquivo, vale a unificação.

- Convênio **não** amarrado ao tipo de atendimento; preço = **procedimento × convênio** (M1).
- Retorno = procedimento **Consulta retorno** na lista (`eh_retorno` derivado); preço no cadastro.
- Fichas: **só consulta** (`modo_clinico = prontuario`); autoria por **template** ou **PDF** (sem JSON); snapshot ao finalizar.
- Com horário: encontro clínico/financeiro em **`agendamentos.id`** (uma conta por slot). Walk-in: `paciente_id` + data.
- Desconto na cobrança (M5): valor + motivo obrigatório.

### 15.6 Histórico desta seção

| Data | Alteração |
|------|-----------|
| 2026-06-28 | Criação §15 — roteiro mestre, próxima etapa I1, protocolo Cursor |
| 2026-07-06 | M9′ concluído; próxima etapa M11; doc operação convênio §14 em MODULO_COBRANCA |
| 2026-08-20 | U6 concluído; próxima etapa U7 |
| 2026-08-21 | U7 e U8 concluídos; próxima etapa U9 |
| 2026-08-21 | U9 concluído; próxima etapa U10 |
| 2026-08-21 | U10 concluído; próxima etapa U11 |
| 2026-08-21 | U11 concluído; próxima etapa U12 |
| 2026-08-21 | U12 concluído; próxima etapa U13 |
| 2026-08-21 | U13 concluído; próxima etapa U14 |
| 2026-08-21 | U14 concluído; roteiro mestre U0–U14 encerrado |
