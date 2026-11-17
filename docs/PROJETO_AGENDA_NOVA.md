# Projeto: nova agenda no MedPronto (moldes iMedicina) — estudo de impacto e etapas

## Contexto
O cliente reclama que a agenda atual, uma **lista do dia** com hora digitada, não dá **visão ampla** dos agendados: quem está marcado, distribuído por horário e por dia, com cor por médico.

A ideia é trocar **só a tela de agendamento** para os moldes do iMedicina, sem copiar o sistema inteiro. Os demais módulos e telas continuam iguais. O MedPronto é **multi-médico**. Os dados do cliente em produção devem ser preservados.

### O que as 3 telas do iMedicina mostram (referência visual)
1. **Grade da semana** (tela principal):
   - colunas Seg–Dom e linhas de 30 em 30 min, numa faixa "07:00 às 19:00";
   - botões Semana / Dia / Lista, Hoje e setas ‹ ›, período "9–15 Nov 2026";
   - filtros em chips (especialidade, profissional) e botão "+" para novo agendamento;
   - card = "hora – PACIENTE – Tipo – Convênio", com ✓ verde quando confirmado;
   - **bloco escuro "Horário Bloqueado"** (ex.: 08:00–12:00) = agenda do médico fechada naquele período;
   - fora do expediente aparece hachurado; fim de semana sombreado; **linha vermelha da hora atual**;
   - botão "Ver Horários Vagos".
2. **Clique no card** abre um **painel lateral à direita**, com a grade visível ao lado:
   - tipo e médico; data e "de 10:00 às 10:30";
   - **status** (dropdown), botões Editar e Excluir;
   - comentário; **Enviar pelo WhatsApp**;
   - convênio, total dos procedimentos;
   - **Lançar no financeiro** e **Iniciar atendimento**;
   - cartão do paciente (telefone, nascimento) com **Prontuário** e Editar.
3. **Editar** abre uma **janela de 2 colunas**:
   - **esquerda:** profissional, **tipo de agendamento**, chave **Agendar / Bloquear**, data, **início e fim com setas**, "Repetir evento";
   - **direita:** paciente (Editar / Trocar paciente), convênio, plano, matrícula, **adicionar procedimentos** (busca), senha, **valor total**, comentários, notificações.

### Adaptações ao MedPronto (decisões)
- **Decisão do cliente (13/11/2026): a agenda mostra UM médico por vez e a cor do card é a do TIPO de agendamento** (igual ao iMedicina), definida no cadastro do tipo. Médico não tem cor. A coluna `medico_agenda.cor` da 046 ficou sem uso (migração aplicada não se edita).
- **Mesmo horário, vários pacientes:** dentro da coluna do dia, os cards que se sobrepõem (encaixes) ficam **lado a lado**, dividindo a largura. Seletor de médico no topo (um por vez, lembrado por usuário).
- **Visão Dia:** um dia do médico selecionado. **Visão Lista:** nova, escrita do zero (é o "modo chegada").
- **Decisão do cliente (13/11/2026): a tela nova não reaproveita código da agenda atual** (`AgendaPage.tsx`, `AgendaMesPage.tsx`, `AgendaCalendarioMes.tsx` e seus helpers de tela). Todo o frontend da agenda é escrito do zero em `pages/agenda/` e `components/agenda/`. Continuam valendo, por serem dados e contratos e não a tela: a tabela `agendamentos`, as rotas do backend, `lib/api.ts` e as regras de status. A tela atual fica intocada como `/agenda-classica` até a A8.
- Mapeamento das ações do painel lateral para o que já existe:

| iMedicina | MedPronto |
|---|---|
| Status | `agendamentos.status` (`lib/agendamentoStatus.ts`) |
| ✓ confirmado | `confirmacao_respondida` |
| Comentário | `observacao_agenda` |
| Enviar pelo WhatsApp | ação WhatsApp atual da agenda |
| Lançar no financeiro | abrir/ver conta (`cobrancaContas`, 1 conta por agendamento — 035) |
| Iniciar atendimento | check-in → fila (`cobrancaCheckin.ts`) |
| Prontuário / Editar paciente | rotas atuais de prontuário e cadastro de paciente |
| Senha / guia | `conta_convenio_guia` (fica na conta, como hoje) |
| Bloquear | `agenda_bloqueios` (novo) |

## Conclusão do impacto
**A troca é viável sem perda de dados**, desde que a mudança seja **aditiva**: a tabela `agendamentos` e todas as rotas atuais continuam iguais.

Motivo: `agendamentos` é o eixo de cerca de 20 módulos:
- fila, check-in e conta (triggers 023/024);
- prontuário e ASO (011/012);
- WhatsApp e retorno;
- dashboard e faturamento.

Recriar a tabela quebraria esses vínculos. Acrescentar colunas e tabelas, e trocar só o frontend da agenda, não toca nesses módulos.

| Área | Impacto |
|---|---|
| `AgendaPage.tsx` (1632 linhas), `AgendaMesPage.tsx`, `AgendaCalendarioMes.tsx` | **Tela nova, do zero**. A antiga fica só como `/agenda-classica` (reserva) |
| `routes/agendamentos.ts`, `services/agendamentoAtendimento.ts` | **Extensão** (campos opcionais + endpoint de grade). Rotas atuais intactas |
| Cadastro de procedimentos | Campo novo: duração |
| Médicos | Tela nova: horários de atendimento e cor |
| Fila, check-in, conta, caixa, prontuário, ASO, WhatsApp, dashboard | **Sem mudança** |
| Dados existentes | **100% preservados** (nenhum DROP ou recriação) |

## Riscos já tratados
1. **Ordem de chegada.** Os vários pacientes na mesma hora que já existem aparecem lado a lado no slot. A visão Lista continua para quem trabalha por chegada. Configuração por médico: `modo` `horario` | `chegada`.
2. **Agendamentos antigos.** Todos têm `hora` + `duracao_minutos` (30), então caem no lugar certo da grade. Nada é movido.
3. **Sobreposição.** Vira aviso, não bloqueio. Encaixe continua passando. O índice 036 é mantido.
4. **Flags antigas.** `eh_retorno`/`eh_encaixe` passam a ser derivadas do tipo por uma função única, `aplicarTipoAgendamento()`.
5. **Rollback.** Chave "Agenda nova" com `/agenda-classica` durante o piloto.

## Etapas (pedir uma por vez: "implementa A1", etc.)

### A0 — Segurança dos dados
- Backup ZIP (`utils/backup.ts`) e cópia do `medpronto.db` do cliente para teste — **dispensados pelo cliente em 13/11/2026** (pouco uso em produção). A conferência abaixo continua obrigatória.
- `scripts/conferir-agenda.mjs` (só leitura): contagens por status, mês e médico, gravadas num snapshot JSON. Roda antes e depois de cada etapa, e os números têm de bater.

### A1 — Banco (aditivo) — `database/046_agenda_tipos_grade.sql`
- `agendamento_tipos`: `nome`, `cor`, `duracao_minutos`, `eh_retorno`, `eh_encaixe`, `ativo`, `ordem`.
  - Seed: Primeira consulta, Consulta, Retorno, Encaixe, Exame/Procedimento.
- `agendamentos.agendamento_tipo_id` (nullable, FK por trigger, padrão 034).
- `procedimentos.duracao_minutos` (nullable).
- `medico_agenda_config`: `medico_id`, `dia_semana`, `inicio`, `fim`, `intervalo_minutos`, `modo`. É usada para hachurar o fora-do-expediente e calcular os horários vagos.
- `agenda_bloqueios`: `medico_id` (nullable = clínica toda), `data`, `inicio`, `fim`, `motivo`, `criado_por`. Vira o bloco escuro "Horário Bloqueado".
  - **Atenção (achado na A0):** a tabela já existe desde a `001_init` com outro formato (`medico_id NOT NULL`, `data_inicio`, `data_fim`, `motivo`) e não é usada (só o DELETE em `routes/medicos.ts:102`). A A1 deve conferir se há linhas e migrá-la com segurança (nova tabela + cópia), sem `CREATE IF NOT EXISTS` silencioso.
- ~~Cor do médico~~ — cancelado (13/11): cor é só do tipo.
- **Backfill:**
  - `eh_retorno` → Retorno; `eh_encaixe` → Encaixe;
  - procedimento `aso`/`nenhum` → Exame;
  - o resto → Consulta.
  - Médicos sem configuração → `modo='chegada'`.
- **Aceite:** `conferir-agenda` igual antes/depois; `test:u13` e `test:i4` passam.

**Como ficou implementado (13/11/2026)** — `database/046_agenda_tipos_grade.sql` + `backend/scripts/test-a1-agenda-banco.ts` (`npm run test:a1-agenda -w backend`, roda numa **cópia** do banco):
- `agendamento_tipos` com `codigo` para os 6 tipos do sistema (CONSULTA, PRIMEIRA, RETORNO, ENCAIXE, EXAME, ADMISSIONAL), que são protegidos por trigger (não excluir/desativar; só nome, cor, duração e ordem mudam). O tipo declara a que `tipo_atendimento`/retorno corresponde; na A2 isso virou regra de **compatibilidade** com os procedimentos (que continuam sendo a fonte do significado clínico).
- `agendamento_tipo_inferencia`: única fonte da regra colunas antigas → tipo. Usada no backfill e nos triggers que dão tipo a horários gravados pela tela antiga (insert sem tipo, ou update que deixa o tipo incoerente).
- `agendamentos.agendamento_tipo_id` com FK real (nullable) + trigger de tipo ativo. Colunas antigas nunca são alteradas.
- `medico_agenda` (1 por médico: cor, intervalo, modo) + `medico_expediente` (N turnos por dia, sem sobreposição). Cor inicial = paleta de `corMedicoAgenda.ts`. Médico novo ganha a linha por trigger. `ON DELETE CASCADE` para não quebrar a exclusão de médico.
- `agenda_bloqueios` nova: período `data_inicio`–`data_fim` + `hora_inicio`–`hora_fim` (dia inteiro = 00:00–24:00), `medico_id` NULL = clínica toda. A antiga foi copiada para `agenda_bloqueios_legado_001` (sem FKs) e removida.

### A2 — Backend
- `routes/agendaConfig.ts` (tipos, horários, bloqueios), registrado em `routes/index.ts`.
  - Leitura: `requireModulo("agenda")`. Edição: config/admin.
- `GET /agendamentos/grade?de=&ate=&medico_ids=` devolve, num período (semana ou dia):
  - os agendamentos (com paciente, tipo, convênio, total de procedimentos, confirmação);
  - os bloqueios;
  - o expediente de cada médico.

  Reaproveita a consulta do `GET /agendamentos` (`routes/agendamentos.ts:350`).
- `GET /agendamentos/vagos?de=&ate=&medico_id=`: horários livres (expediente − agendados − bloqueios).
- `POST`/`PATCH /agendamentos`:
  - `agendamento_tipo_id` opcional (a tela antiga continua funcionando);
  - aceitam `hora` + `hora_fim` → `duracao_minutos`;
  - duração sugerida = soma das durações dos procedimentos → a do tipo → 30;
  - resposta inclui `aviso_sobreposicao`.
- `POST /agendamentos/:id/mover` (data, hora, médico), para arrastar o card. Mesmas validações do PATCH.
- `POST /agendamentos/:id/trocar` (`outro_id`): troca data/hora/médico entre dois agendamentos (ver A4d).
**Como ficou implementado (13/11/2026)** — `npm run test:a2-agenda -w backend` (HTTP real, numa cópia do banco):
- **Correção de modelo:** o significado clínico (`tipo_atendimento`, retorno) continua vindo dos **procedimentos** (regra U5). O tipo de agendamento é a categoria da agenda (cor, duração, encaixe) e tem de ser **compatível** com os procedimentos — senão 400 `codigo: tipo_incompativel`. `eh_encaixe` passa a vir do tipo quando ele é informado.
- Serviços: `agendaHorario.ts` (puro), `agendaErro.ts` (`AgendaErro` com `codigo`), `agendaConfig.ts`, `agendaGrade.ts`. Rotas: `routes/agendaConfig.ts` (`/api/agenda-config/tipos|medicos|bloqueios`) e extensões em `routes/agendamentos.ts`.
- Módulo de permissão novo **`agenda_config`** (padrão: admin e secretaria). Bloqueios ficam no módulo `agenda`; médico só mexe nos próprios.
- `GET /agendamentos/grade` (até 42 dias; médicos, tipos, agendamentos com procedimentos/total/conta, bloqueios, faixa de horas). Inclui médicos inativos/admin que aparecem nos agendamentos.
- `GET /agendamentos/vagos` (até 31 dias; `sem_expediente` quando não há turnos).
- `POST /agendamentos`: `agendamento_tipo_id`, `hora_fim`, `ignorar_bloqueio` opcionais; duração sugerida; resposta com `avisos` (sobreposição, fora do expediente, bloqueios). Bloqueio → 409 `horario_bloqueado` (inclusive pela tela antiga). Hora agora validada de verdade (antes aceitava `25:99`).
- `PATCH /agendamentos/:id/agenda` (tipo e comentário — não existia rota para editar o comentário).
- `POST /agendamentos/:id/mover` e `/:id/trocar`: só `agendado` sem conta/prontuário/ASO; retorno com o mesmo médico e no prazo; ficha revalidada; data passada recusada; confirmação do WhatsApp zerada; concorrência otimista; troca com hora provisória para o índice 036.

**Pendências registradas:** a tela antiga não sabe tratar o 409 `horario_bloqueado` (mostra só a mensagem) — aceitável no piloto, pois bloqueios só nascem na tela nova.

- **Aceite original:** `backend/scripts/test-a2-agenda-grade.ts` cobrindo:
  - grade com e sem configuração;
  - bloqueio;
  - vagos;
  - sobreposição;
  - flags derivadas do tipo;
  - rotas antigas sem os campos novos.

### A3 — Telas de configuração
- Configurações → **Tipos de agendamento** (`CadastroSimples.tsx`, com cor e duração).
- Configurações → **Horários dos médicos** (dias, turnos, intervalo, modo, **cor**).
- Procedimento: campo **Duração (min)**. Itens novos em `config/navigation.ts`.

**Como ficou implementado (13/11/2026):**
- Uma tela só: **Configurações → Agenda** (`/configuracoes/agenda`, módulo `agenda_config`), com abas *Horários dos médicos* e *Tipos de agendamento*. Não usa `CadastroSimples` nem nada da agenda antiga. Arquivos: `pages/agenda/AgendaConfigPage.tsx`, `components/agenda/config/*`, `lib/agendaNova/{api,horario}.ts`, `agenda-nova.css` (prefixo `.agn-`).
- Horários: lista de médicos à esquerda; à direita cor (paleta + seletor livre), modo (por horário / ordem de chegada), intervalo e expediente por dia com vários turnos, botão "Seg–Sex" para copiar. Valida sobreposição na hora; alteração não salva é avisada ao trocar de médico e ao fechar a janela; as abas ficam montadas para não perder edição.
- Tipos: tabela com ordem (↑↓), etiqueta colorida, atendimento, categoria (normal/retorno/encaixe), duração, ativo; tipos do sistema com cadeado (só nome, cor e duração).
- Procedimentos (Cobrança): campo e coluna **Duração (min)**, em branco = usa a do tipo. Backend: `duracao_minutos` em `PUT/POST /cobranca/procedimentos`.

**Decisão do cliente (13/11/2026) — retorno sem consulta vigente:**
- Sem consulta prévia, consulta sem prazo de retorno, prazo vencido ou data depois do prazo → **avisa e pergunta** "Agendar o retorno mesmo assim?" (409 `codigo: retorno_confirmar` + `motivo`; reenviar com `confirmar_retorno: true`).
- Retorno vigente com **outro médico** → continua **recusado** (é nova consulta).
- Regra única em `backend/src/services/retornoAgenda.ts`, usada pelo POST e por mover/trocar. A tela antiga recebeu ajuste mínimo para mostrar a pergunta (antes bloqueava no próprio navegador).

### A4 — Grade da semana / dia (tela principal)
- Página nova `pages/AgendaGradePage.tsx` + `components/agenda/` (`GradeSemana`, `GradeDia`, `CardAgendamento`).
- **Cabeçalho:**
  - Semana | Dia | Lista; Hoje e ‹ ›; período; faixa de horário automática (menor início e maior fim dos expedientes, padrão 07–19);
  - **seletor de médico** (um por vez, lembrado por usuário);
  - botão **+ Agendar** e **Ver horários vagos**.
- **Grade:**
  - linhas pela menor granularidade (padrão 30 min);
  - altura do card proporcional à duração;
  - **cor = tipo de agendamento** (fundo do card);
  - ✓ verde = confirmado; status cancelado/não veio esmaecido ou riscado;
  - sobrepostos lado a lado;
  - fora do expediente hachurado; bloqueios em cinza escuro com cadeado;
  - linha vermelha da hora atual; fim de semana sombreado.
- **Clique em espaço vago** → janela de agendamento (A4c) com data, hora e médico já preenchidos.
- **Visão Lista** nova (do zero): agendamentos do dia por horário ou chegada, com as mesmas ações do painel lateral.

### A4b — Painel lateral do agendamento
- Abre à direita ao clicar no card; a grade continua visível.
- Conteúdo:
  - tipo, médico, data, "de HH:MM às HH:MM";
  - **status** (dropdown com as transições atuais);
  - Editar, Cancelar;
  - comentário;
  - Enviar WhatsApp;
  - convênio e total dos procedimentos;
  - **Abrir conta** (Lançar no financeiro);
  - **Check-in / Iniciar atendimento**;
  - cartão do paciente com **Prontuário** e **Editar paciente**.
- Ações escritas do zero num hook próprio (`useAcoesAgendamento`), usado pelo painel e pela visão Lista, chamando as rotas atuais do backend. Não extrair código de `AgendaPage.tsx`.

### A4c — Janela de agendamento (novo / editar) em 2 colunas
- **Esquerda:**
  - médico;
  - **tipo**;
  - chave **Agendar / Bloquear**: Bloquear grava em `agenda_bloqueios` com motivo;
  - data;
  - início e fim com setas, o fim calculado pela duração;
  - (Repetir evento → fase futura, fora deste projeto).
- **Direita:**
  - paciente (busca, cadastrar novo, trocar);
  - convênio (sugerido por `/convenio-sugerido`) e plano;
  - procedimentos com busca e **valor total** (`lib/agendaProcedimentos.ts`);
  - comentário;
  - "Avisar por WhatsApp";
  - aviso de retorno vigente (`/retorno-vigente`).
- Formulário e validações escritos do zero. A validação definitiva é sempre a do backend.

### A4d — Arrastar para remarcar (pedido do cliente, como no iMedicina)
- Arrastar o card para outro horário, dia ou médico (visão Dia) → confirmação → grava.
- **Soltar sobre um card existente** → os dois **trocam de lugar** (data, hora e médico de um vão para o outro).
  - `POST /agendamentos/:id/trocar` com `{ outro_id }`, numa única transação.
  - O índice 036 é por paciente+médico+data+hora: se for o mesmo paciente nos dois, a troca passa por um horário provisório dentro da transação.
  - Só troca agendamentos em `agendado`; em atendimento/finalizado não podem ser arrastados.
- **Soltar ao lado (espaço livre do mesmo slot)** → fica **no mesmo horário**, lado a lado → `POST /agendamentos/:id/mover` (sobreposição vira aviso, não bloqueio).
- Na interface, o alvo fica destacado enquanto arrasta: card realçado = trocar; faixa livre do slot = mover.
- Ambas respeitam bloqueios e as mesmas validações do PATCH; a duração de cada um é mantida.

### A5 — Agenda do mês
- `AgendaMesPage.tsx`: ocupação por dia e por médico (pontos coloridos). Clicar no dia abre a visão Dia.

### A6 — Convivência e piloto
- Chave "Agenda nova" (padrão desligada); `/agenda` escolhe a tela, e `/agenda-classica` fica como reserva. Piloto de 1–2 semanas.

### A7 — Conferência dos módulos dependentes
- `test:u5`, `u6`, `u9`, `u10`, `u11`, `u13`, `m3`, `c1`.
- Roteiro manual:
  - fila e sala de espera;
  - check-in → conta;
  - prontuário e ASO;
  - WhatsApp;
  - retorno;
  - caixa e dashboard;
  - faturamento.

### A8 — Desligar a tela antiga
- Remover a chave, `/agenda-classica` e os arquivos da tela antiga. A visão **Lista** nova permanece. As colunas antigas do banco ficam.

## Recuperação de dados
- **Agendamentos:** preservados integralmente. Só ganham `agendamento_tipo_id` por backfill.
- **Demais dados:** não são tocados.
- Falha em qualquer etapa: restaurar o backup da A0 (restore atual, exit 42) e desligar a chave da A6.

## Verificação geral
- `conferir-agenda.mjs` igual antes e depois de A1, A2 e A6.
- `test-a2-*` mais os `test:*` existentes.
- Teste visual da A4 com a base de cópia do cliente:
  - semana cheia com 2+ médicos no mesmo horário;
  - bloqueio;
  - painel lateral → check-in → conta.
- Piloto com a tela antiga como reserva antes da A8.

## Ao aprovar
Salvar esta versão por cima de `D:\MedPronto\docs\PROJETO_AGENDA_NOVA.md`. Nenhum código é alterado.

## Revisão de 13/11/2026 (decisões do cliente — substituem o que conflitar acima)
- **Sem configuração prévia:** clicar em Agenda abre a grade pronta para marcar. A tela *Configurações → Agenda* (abas horários/tipos, feita na A3) foi **removida**.
- **Um médico por vez** na grade. **Médico não tem cor.**
- **Cor e duração ficam no cadastro do procedimento** (Cobrança → Procedimentos). Migração `047_procedimento_cor_agenda_padrao.sql`: `procedimentos.cor` com paleta automática (cor ainda não usada) e backfill. O card usa a cor do procedimento.
- **Horário padrão único da clínica** (início, fim, intervalo; fábrica 07–19 / 30 min) em `app_meta`, ajustado pelo **botão ⚙ da própria agenda** (`GET/PUT /api/agenda-config/horario-padrao`, módulo `agenda_config`). A grade usa esse padrão (e estica para não esconder ninguém).
- **Na marcação**, "de … às …" vem preenchido (duração do procedimento → intervalo padrão) e **pode ser mudado na hora**.
- **Tipos de agendamento** ficam só internos (deduzidos dos procedimentos). **Expediente por médico** fica sem tela (tabelas/rotas mantidas para o futuro).

## A4 — implementado (13/11/2026)
- Rota piloto **`/agenda-nova`** (menu "Agenda nova · piloto"); `/agenda` antiga intacta até a A6.
- `pages/agenda/AgendaGradePage.tsx` + `components/agenda/grade/` (`GradeTempo`, `CardAgendamento`, `ListaDia`, `HorarioPadraoDialog`, `VagosDialog`). Lógica pura em `lib/agendaNova/{layoutGrade,semana}.ts`, testada por `frontend/scripts/test-a4-layout.ts` (24 verificações; rodar com `node_modules/.bin/tsx`).
- Barra: Semana | Dia | Lista · Hoje ‹ › · data · período · **seletor de médico** (lembrado no computador; médico vê só a própria) · Ver horários vagos · + Agendar (próximo vago) · Atualizar · **⚙ horário padrão** (só com `agenda_config`).
- Grade: faixa do horário padrão (estica para não esconder ninguém), fora do padrão hachurado, fim de semana e dias passados sombreados, **cards na cor do procedimento** com altura pela duração, ✓ confirmado, cancelado/não veio riscados, **encaixes lado a lado**, bloqueios escuros com cadeado, **linha vermelha da hora atual**. Atualiza a cada 60 s e ao voltar para a janela.
- Horários vagos calculados no navegador: slots do horário padrão − agendados ativos − bloqueios − passado.
- Clique no horário vazio / no card: por enquanto mostra um resumo; a janela de marcação é a **A4c** e o painel lateral a **A4b**.

## A4c — implementado (13/11/2026): janela de marcação (novo + bloquear)
- `components/agenda/marcar/AgendarDialog.tsx` (2 colunas, modelo do print do iMedicina), `PacienteSeletor.tsx` (busca ↑↓/Enter, trocar, **cadastro rápido** nome/nascimento/celular, **completar cadastro** sem apagar dados — PUT a partir do GET completo), `ProcedimentosSeletor.tsx` (busca, etiquetas na cor do procedimento, valor por item e **valor total**).
- Esquerda: profissional, chave **Agendar | Bloquear**, data, **"de … às …" com setas** (anda no intervalo padrão). Fim automático = duração dos procedimentos → intervalo padrão; mexeu no fim, vira manual (link para voltar à sugerida).
- Direita: paciente, aviso de retorno vigente, convênio (sugerido), procedimentos + total, comentário, encaixe.
- Confirmações do servidor tratadas em `lib/agendaNova/confirmacoes.ts` (puro, testado): retorno vigente → "marcar consulta nova?", retorno sem consulta/prazo vencido → "agendar retorno?", horário bloqueado → "agendar mesmo assim?". Pergunta e reenvia.
- Bloquear: motivo, dia inteiro, todos os médicos (não aparece para perfil médico).
- Backend: `GET /api/agendamentos/previa?convenio_id=&procedimento_ids=` (total no convênio + duração sugerida), sem exigir permissão de configuração de cobrança.
- **Editar agendamento existente** fica junto com o painel lateral (A4b).

## A4b — implementado (13/11/2026): painel lateral + editar
- `components/agenda/painel/PainelAgendamento.tsx` (abre à direita ao clicar no card; a grade continua visível; Esc fecha) e `PacienteEditarDialog.tsx` (nome/nascimento/celular, preservando o resto do cadastro).
- Painel: procedimentos (topo na cor do card), médico, data "de … às …", situação + **Mudar situação…** (transições em `lib/agendaNova/status.ts`, backend valida), **Paciente chegou (check-in)** quando é hoje, **Ir para a sala de espera** quando presente, **Editar**, **Cancelar**, comentário, **WhatsApp** (enviar/reenviar; só com módulo `whatsapp`), convênio e total, **Abrir conta** (só com `cobranca`; senão "abre no check-in"), cartão do paciente com **Editar paciente** e **Prontuário** (quando já existe).
- **Editar** = mesma janela da marcação (`AgendarDialog` com `editar`): paciente fixo, sem chave Agendar/Bloquear e sem encaixe. Salva só o que mudou, nesta ordem: remarcar (`/mover`, com as confirmações), procedimentos/convênio (`PATCH /:id/procedimentos`), comentário (`PATCH /:id/agenda`). Fora de "agendado", data/hora/médico ficam travados (regra do backend).
- Painel sempre mostra a versão recarregada do agendamento; se ele sair do período/médico, o painel fecha.
- **Pendências do plano original:** "Trocar paciente" na edição não existe (backend não troca paciente de um horário — o certo é cancelar e marcar outro).

## A4d — implementado (13/11/2026): arrastar para remarcar
- Arrastar um card (só "Agendado", de hoje em diante, com módulo `agenda`):
  - **soltar em espaço livre** de um horário → remarca para lá (`/mover`), fica lado a lado se já houver alguém;
  - **soltar em cima de outro card** (destaque laranja) → os dois **trocam de lugar** (`/trocar`).
- Sempre pede confirmação ("de … para …"); bloqueio e retorno sem consulta perguntam "mesmo assim?" via `comConfirmacoes` (`lib/agendaNova/confirmacoes.ts`, testado). Duração mantida; confirmação do WhatsApp zerada pelo backend.
- Enquanto arrasta, os cards ocupam 78% da largura para sempre sobrar o espaço "ao lado"; bloqueios deixam passar o soltar.
- HTML5 drag-and-drop (mouse). Toque em tablet não arrasta (usar Editar no painel).

## Sala de espera (13/11/2026)
- Card da fila com contorno de 2px na cor do médico (`corMedicoAgenda.ts`, a mesma cor já usada no nome). Cor por `id % 10` — repete só com mais de 10 médicos.

## A5 — implementado (13/11/2026): visão do mês
- Botão **Mês** (antes de Semana/Dia/Lista). `components/agenda/grade/GradeMes.tsx`: calendário fixo de 6 semanas (seg–dom), quantidade de pacientes por dia (sem cancelados/"não veio"), cadeado em dia com bloqueio (dia inteiro bloqueado fica hachurado), hoje destacado, dias de outro mês esmaecidos. **Clicar no dia abre a visão Dia.**
- Usa a mesma rota da grade (`/agendamentos/grade`, 42 dias = limite) — ⚙, horários vagos e + Agendar continuam funcionando no mês. ‹ › anda 1 mês (31/03 → 28/02 tratado).
- Funções em `lib/agendaNova/semana.ts` (`diasDaGradeMes`, `somarMeses`, `rotuloMes`…), testadas em `frontend/scripts/test-a4-layout.ts`.
- A antiga `AgendaMesPage.tsx` não foi usada nem alterada (sai na A8).

## A6 — implementado (13/11/2026): a Agenda Nova vira a Agenda
- **`/agenda` = Agenda Nova** (item "Agenda" do menu). O item "Agenda nova · piloto" saiu; `/agenda-nova` redireciona para `/agenda`.
- **Tela antiga em `/agenda-classica`** (reserva do piloto), acessível pelo link discreto "Agenda antiga" no cabeçalho da agenda nova. Os links internos dela usam `AGENDA_CLASSICA_PATH` (`lib/agendaNav.ts`), então ela continua funcionando sozinha. Sem chave liga/desliga: o cliente pediu a troca direta.
- **Pacientes → Agendar** agora abre `/agenda?paciente=ID`: a Agenda Nova abre a janela de marcação no próximo horário vago, com o paciente já escolhido (`pacienteInicialId` no `AgendarDialog`).
- Rotas que redirecionavam para `/agenda` (ex.: `/admissional`) passam a cair na agenda nova.
- **A7** (conferência dos módulos dependentes) e **A8** (remover a tela antiga) continuam pendentes.

## A7 — conferência (13/11/2026)
- `scripts/test-a7-regressao.mjs` (`npm run test:regressao`): roda todos os `test:*` do backend, **cada um numa cópia nova do banco** (apagada em seguida). Os 28 testes antigos passaram a aceitar `DATABASE_PATH` (sem ele, comportamento antigo). Fora: `s1` (backup .zip).
- Resultado: **19/27 passam**, incluindo agendamento (u5), check-in (u6), abrir prontuário/ASO (u9), WhatsApp (u11), caixa/dashboard (u12), ASO (a5, am0, c1), cobrança (i4, m4, m6, m7, m10) e a agenda nova (a1, a2). Banco real conferido idêntico antes/depois.
- **8 falhas pré-existentes, não causadas pela agenda nova:** m3, u10, u13, m5, m8, m9, m11, m10p. Causa: resíduos de execuções antigas desses testes **no banco real** (dados de 2099 criados em jul–ago/2026: contas já pagas/a faturar, agendamentos fixos repetidos). A limpeza dos próprios testes esbarra nas travas 045 (item de conta fechada) e 036 (slot único). **Pendência:** dar a esses testes datas/limpeza próprias (ou um banco de teste semeado), em etapa separada.
- **Corrigido (13/11/2026): 27/27 passam.** Novo `backend/scripts/lib/limparResiduos2099.ts` (apaga tudo de 2099, suspendendo as travas só na transação), chamado no início dos 8 testes. Além disso: m5 usava o mesmo dia da conta isenta (fechada) → `2099-03-04`; m9 passou a usar convênio com `exige_guia = 1`; u13 escolhe hora livre hoje e devolve o agendamento para 2099 no fim.

## A8 — remoção da agenda antiga (13/11/2026)

- Removidos: `AgendaPage.tsx`, `AgendaMesPage.tsx`, `AgendaCalendarioMes.tsx`, `AgendaMesMedicosCard.tsx`, `lib/agendaCalendario.ts`, `lib/diasEspeciais.ts`, `lib/agendaNav.ts`, `agenda-folha.css` (recuperáveis pelo git).
- `/agenda-classica` agora redireciona para `/agenda`; link "Agenda antiga" saiu da grade; entrada removida de `permissoes.ts`.
- Backend intacto (rotas antigas de `agendamentos` seguem usadas por fila/check-in/testes). `tsc -b` OK; regressão 27/27.
