/**
 * Aceite A2 — Projeto Agenda Nova (backend), testado PELAS ROTAS HTTP.
 *
 * Roda numa CÓPIA de data/medpronto.db: sobe o Express em processo (porta livre),
 * cria usuários/pacientes de teste, faz login e exercita:
 *   config (tipos, médicos, bloqueios) · grade com e sem expediente · vagos ·
 *   sobreposição (aviso) · tipo × procedimentos · duração sugerida · bloqueio (409) ·
 *   mover · trocar · retorno · permissões de médico · rotas antigas sem campos novos.
 */
import type { AddressInfo } from "node:net";
import { assert, prepararBancoCopia, removerBancoCopia } from "./lib/bancoCopia.js";

type Resp = { status: number; json: any };

async function main(): Promise<void> {
  const copia = await prepararBancoCopia("a2");
  console.log(`Cópia de teste: ${copia}`);
  let fecharServidor: (() => void) | undefined;
  let fecharDb: (() => void) | undefined;

  try {
    // Imports só depois de DATABASE_PATH apontar para a cópia.
    const express = (await import("express")).default;
    const { runMigrations } = await import("../src/db/migrate.js");
    const { getDb, closeDb } = await import("../src/db/index.js");
    fecharDb = closeDb;
    const { sessionMiddleware, attachPermissoes } = await import("../src/auth/middleware.js");
    const { createUser } = await import("../src/auth/users.js");
    const { apiRouter } = await import("../src/routes/index.js");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { diaSemana, somarDias } = await import("../src/services/agendaHorario.js");

    runMigrations();
    const db = getDb();
    const um = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).pluck().get(...p) as T;

    // ---------------------------------------------------------------- servidor
    const app = express();
    app.use(express.json());
    app.use(sessionMiddleware());
    app.use(attachPermissoes());
    app.use("/api", apiRouter);
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    fecharServidor = () => server.close();
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

    async function chamar(cookie: string, metodo: string, url: string, body?: unknown): Promise<Resp> {
      const r = await fetch(base + url, {
        method: metodo,
        headers: { "content-type": "application/json", cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const txt = await r.text();
      return { status: r.status, json: txt ? JSON.parse(txt) : null };
    }
    function esperar(r: Resp, status: number, ctx: string): any {
      assert(r.status === status, `${ctx}: HTTP ${r.status} (esperado ${status}) ${JSON.stringify(r.json)}`);
      return r.json;
    }

    // ------------------------------------------------------------ dados de teste
    const sufixo = Date.now().toString(36);
    const SENHA = "Teste#A2-agenda";
    const sec = createUser(`a2sec_${sufixo}`, SENHA, "secretaria", "SEC TESTE A2");
    const med1 = createUser(`a2med1_${sufixo}`, SENHA, "medico", "DR A2 UM");
    const med2 = createUser(`a2med2_${sufixo}`, SENHA, "medico", "DR A2 DOIS");

    async function login(usuario: string): Promise<string> {
      const r = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: usuario, senha: SENHA }),
      });
      assert(r.status === 200, `login ${usuario}: HTTP ${r.status}`);
      const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
      assert(cookie.includes("medpronto_sid="), "login sem cookie de sessão");
      return cookie;
    }
    const cSec = await login(`a2sec_${sufixo}`);
    const cMed1 = await login(`a2med1_${sufixo}`);
    const cMed2 = await login(`a2med2_${sufixo}`);
    const sAPI = (m: string, u: string, b?: unknown) => chamar(cSec, m, u, b);
    // O teste não depende do horário padrão que a clínica escolheu (ex.: 15 min no ⚙):
    // fixa o padrão de fábrica nesta cópia do banco.
    esperar(await sAPI("PUT", "/agenda-config/horario-padrao", { inicio: "07:00", fim: "19:00", intervalo_minutos: 30 }), 200, "padrão de fábrica para o teste");

    const novoPaciente = (nome: string) =>
      Number(
        db
          .prepare(`INSERT INTO pacientes (nome, telefone, data_nasc) VALUES (?, '11999990000', '1980-01-01')`)
          .run(`${nome} ${sufixo}`).lastInsertRowid,
      );
    const p1 = novoPaciente("PAC A2 UM");
    const p2 = novoPaciente("PAC A2 DOIS");
    const p3 = novoPaciente("PAC A2 TRES");
    const p4 = novoPaciente("PAC A2 QUATRO");

    const convenio = um<number>(`SELECT id FROM convenios WHERE ativo = 1 ORDER BY id LIMIT 1`);
    const CONS = um<number>(`SELECT id FROM procedimentos WHERE codigo = 'CONS'`);
    const RET = um<number>(`SELECT id FROM procedimentos WHERE codigo = 'RET'`);
    const EXAME = um<number>(`SELECT id FROM procedimentos WHERE modo_clinico = 'nenhum' AND ativo = 1 ORDER BY id LIMIT 1`);
    assert(convenio && CONS && RET && EXAME, "base sem convênio ou procedimentos CONS/RET/exame");
    const tipo = (codigo: string) => um<number>(`SELECT id FROM agendamento_tipos WHERE codigo = ?`, codigo);

    // Segunda-feira de uma semana sem dados e sem feriado (2098; 03/03 é Carnaval)
    let SEG = "2098-03-08";
    while (diaSemana(SEG) !== 1) SEG = somarDias(SEG, 1);
    const TER = somarDias(SEG, 1);
    const DOM = somarDias(SEG, 6);
    assert(um<number>(`SELECT COUNT(*) FROM agendamentos WHERE data BETWEEN ? AND ?`, SEG, DOM) === 0, "semana de teste já tem dados");

    const agendar = (b: Record<string, unknown>, cookie = cSec) =>
      chamar(cookie, "POST", "/agendamentos", {
        convenio_id: convenio,
        procedimento_ids: [CONS],
        medico_id: med1.id,
        data: SEG,
        ...b,
      });

    // ------------------------------------------------------------ 1. tipos
    const tipos = esperar(await sAPI("GET", "/agenda-config/tipos"), 200, "listar tipos");
    assert(tipos.length >= 6, "tipos do sistema");
    esperar(await chamar(cMed1, "POST", "/agenda-config/tipos", {
      nome: "X", cor: "#000000", duracao_minutos: 30, tipo_atendimento: "consulta",
    }), 403, "médico sem agenda_config cria tipo");
    const tCustom = esperar(await sAPI("POST", "/agenda-config/tipos", {
      nome: `Retorno curto ${sufixo}`, cor: "#123abc", duracao_minutos: 15,
      tipo_atendimento: "consulta", eh_retorno: true,
    }), 201, "criar tipo");
    assert(tCustom.cor === "#123ABC", "cor normalizada");
    const tRen = esperar(await sAPI("PATCH", `/agenda-config/tipos/${tCustom.id}`, { nome: `Ret curto ${sufixo}` }), 200, "renomear tipo");
    assert(tRen.eh_retorno === 1 && tRen.duracao_minutos === 15, "PATCH só do nome não pode zerar outros campos (zod 4)");
    esperar(await sAPI("PATCH", `/agenda-config/tipos/${tipo("CONSULTA")}`, { ativo: false }), 400, "desativar tipo do sistema");
    esperar(await sAPI("DELETE", `/agenda-config/tipos/${tipo("RETORNO")}`), 400, "excluir tipo do sistema");
    esperar(await sAPI("POST", "/agenda-config/tipos", {
      nome: `Ret curto ${sufixo}`, cor: "#000000", duracao_minutos: 30, tipo_atendimento: "consulta",
    }), 409, "nome de tipo repetido");
    esperar(await sAPI("POST", "/agenda-config/tipos", {
      nome: "Exame retorno", cor: "#000000", duracao_minutos: 30, tipo_atendimento: "exame", eh_retorno: true,
    }), 400, "retorno só em consulta");

    // ------------------------------------------------------------ 2. médicos
    const cfg = esperar(await sAPI("PUT", `/agenda-config/medicos/${med1.id}`, {
      modo: "horario", intervalo_minutos: 30,
      expediente: [
        { dia_semana: 1, inicio: "08:00", fim: "12:00" },
        { dia_semana: 1, inicio: "14:00", fim: "18:00" },
        { dia_semana: 2, inicio: "08:00", fim: "12:00" },
      ],
    }), 200, "configurar médico 1");
    assert(cfg.expediente.length === 3, "expediente salvo");
    esperar(await sAPI("PUT", `/agenda-config/medicos/${med1.id}`, { cor: "#000000" }), 400, "médico não tem cor (cor é do tipo)");
    const sobreposto = esperar(await sAPI("PUT", `/agenda-config/medicos/${med1.id}`, {
      expediente: [
        { dia_semana: 1, inicio: "08:00", fim: "12:00" },
        { dia_semana: 1, inicio: "11:00", fim: "13:00" },
      ],
    }), 400, "turnos sobrepostos");
    assert(String(sobreposto.error).includes("sobreposto"), "mensagem do trigger preservada");
    assert(um<number>(`SELECT COUNT(*) FROM medico_expediente WHERE medico_id = ?`, med1.id) === 3, "falha não pode apagar o expediente (transação)");
    esperar(await sAPI("PUT", `/agenda-config/medicos/${med2.id}`, { modo: "horario", expediente: [] }), 400, "horário sem turno");
    esperar(await chamar(cMed1, "PUT", `/agenda-config/medicos/${med1.id}`, { cor: "#000000" }), 403, "médico sem agenda_config");

    // ------------------------------------------------------------ 3. grade vazia
    const gSem = esperar(await sAPI("GET", `/agendamentos/grade?de=${SEG}&ate=${DOM}&medico_ids=${med2.id}`), 200, "grade sem config");
    assert(gSem.faixa.inicio === "07:00" && gSem.faixa.fim === "19:00", `faixa padrão: ${JSON.stringify(gSem.faixa)}`);
    assert(gSem.agendamentos.length === 0 && gSem.medicos.length === 1, "grade vazia de 1 médico");
    const gCom = esperar(await sAPI("GET", `/agendamentos/grade?de=${SEG}&ate=${DOM}&medico_ids=${med1.id}`), 200, "grade com config");
    // Faixa = horário padrão (07–19) ∪ expediente (08–18) → 07–19
    assert(gCom.faixa.inicio === "07:00" && gCom.faixa.fim === "19:00", `faixa padrão ∪ expediente: ${JSON.stringify(gCom.faixa)}`);
    esperar(await sAPI("GET", `/agendamentos/grade?de=${SEG}&ate=${somarDias(SEG, 60)}`), 400, "período longo demais");
    esperar(await sAPI("GET", `/agendamentos/grade?de=2098-02-31&ate=${DOM}`), 400, "data inexistente");
    esperar(await sAPI("GET", `/agendamentos/grade?de=${SEG}&ate=${DOM}&medico_ids=abc`), 400, "medico_ids inválido");

    // ------------------------------------------------------------ 4. criar
    const a1 = esperar(await agendar({ paciente_id: p1, hora: "08:00" }), 201, "POST sem campos novos (tela antiga)");
    assert(a1.agendamento_tipo_id === tipo("CONSULTA") && a1.duracao_minutos === 30, "tipo inferido e 30 min");
    assert(Array.isArray(a1.avisos?.sobreposicao) && a1.avisos.sobreposicao.length === 0, "avisos no POST");

    const a2 = esperar(await agendar({ paciente_id: p2, hora: "08:00", hora_fim: "09:00", agendamento_tipo_id: tipo("PRIMEIRA") }), 201, "POST com tipo e hora_fim");
    assert(a2.duracao_minutos === 60 && a2.agendamento_tipo_id === tipo("PRIMEIRA"), "duração por hora_fim");
    assert(a2.avisos.sobreposicao.some((s: any) => s.id === a1.id), "sobreposição é aviso, não bloqueio");

    const incompat1 = esperar(await agendar({ paciente_id: p3, hora: "09:00", agendamento_tipo_id: tipo("RETORNO") }), 400, "tipo Retorno com Consulta");
    assert(incompat1.codigo === "tipo_incompativel", "código tipo_incompativel");
    esperar(await agendar({ paciente_id: p3, hora: "09:00", agendamento_tipo_id: tipo("ADMISSIONAL") }), 400, "tipo ASO com Consulta");
    esperar(await agendar({ paciente_id: p3, hora: "09:00", agendamento_tipo_id: tipo("ENCAIXE"), eh_encaixe: false }), 400, "encaixe contraditório");
    const enc = esperar(await agendar({ paciente_id: p3, hora: "09:00", agendamento_tipo_id: tipo("ENCAIXE") }), 201, "tipo Encaixe");
    assert(enc.eh_encaixe === 1, "eh_encaixe vem do tipo");
    esperar(await agendar({ paciente_id: p3, hora: "09:30", hora_fim: "10:30", duracao_minutos: 30 }), 400, "hora_fim × duração");
    esperar(await agendar({ paciente_id: p3, hora: "23:50", duracao_minutos: 30 }), 400, "passa da meia-noite");
    esperar(await agendar({ paciente_id: p3, hora: "25:00" }), 400, "hora inexistente");

    // Duração pelo cadastro de procedimentos (A3: rota da cobrança aceita duracao_minutos)
    esperar(await sAPI("PUT", `/cobranca/procedimentos/${EXAME}`, { duracao_minutos: 2 }), 400, "duração inválida");
    const procDur = esperar(await sAPI("PUT", `/cobranca/procedimentos/${EXAME}`, { duracao_minutos: 45 }), 200, "duração do procedimento");
    assert(procDur.duracao_minutos === 45, "duração salva no procedimento");
    const procNome = esperar(await sAPI("PUT", `/cobranca/procedimentos/${EXAME}`, { orientacoes_paciente: "Jejum" }), 200, "editar outro campo");
    assert(procNome.duracao_minutos === 45, "editar outro campo não apaga a duração");
    const ex = esperar(await agendar({ paciente_id: p4, hora: "11:00", procedimento_ids: [EXAME], agendamento_tipo_id: tipo("EXAME") }), 201, "exame");
    assert(ex.duracao_minutos === 45, `duração sugerida pelo procedimento: ${ex.duracao_minutos}`);

    // ------------------------------------------------------------ 5. bloqueios
    const bl = esperar(await sAPI("POST", "/agenda-config/bloqueios", {
      medico_id: med1.id, data_inicio: SEG, data_fim: SEG, hora_inicio: "10:00", hora_fim: "11:00", motivo: "Reunião",
    }), 201, "criar bloqueio");
    assert(bl.agendamentos_afetados === 0, "nenhum afetado");
    const afet = esperar(await sAPI("POST", "/agenda-config/bloqueios", {
      medico_id: med1.id, data_inicio: SEG, data_fim: SEG, hora_inicio: "11:00", hora_fim: "11:15",
    }), 201, "bloqueio sobre agendamento");
    assert(afet.agendamentos_afetados === 1, "conta o exame das 11:00 como afetado");
    esperar(await sAPI("DELETE", `/agenda-config/bloqueios/${afet.bloqueio.id}`), 200, "remover bloqueio");
    const bloqueado = esperar(await agendar({ paciente_id: p4, hora: "10:30" }), 409, "agendar em bloqueio");
    assert(bloqueado.codigo === "horario_bloqueado" && bloqueado.bloqueios.length === 1, "409 com o bloqueio");
    const forcado = esperar(await agendar({ paciente_id: p4, hora: "10:30", ignorar_bloqueio: true }), 201, "agendar em bloqueio confirmado");
    esperar(await chamar(cMed2, "POST", "/agenda-config/bloqueios", {
      medico_id: med1.id, data_inicio: SEG, data_fim: SEG,
    }), 403, "médico bloqueia agenda de outro");
    esperar(await chamar(cMed2, "DELETE", `/agenda-config/bloqueios/${bl.bloqueio.id}`), 403, "médico remove bloqueio de outro");
    esperar(await sAPI("POST", "/agenda-config/bloqueios", {
      medico_id: null, data_inicio: TER, data_fim: TER, hora_inicio: "08:00", hora_fim: "09:00", motivo: "Dedetização",
    }), 201, "bloqueio da clínica toda");
    esperar(await sAPI("POST", "/agenda-config/bloqueios", {
      medico_id: med1.id, data_inicio: TER, data_fim: SEG,
    }), 400, "período invertido");

    // ------------------------------------------------------------ 6. vagos
    const v = esperar(await sAPI("GET", `/agendamentos/vagos?de=${SEG}&ate=${TER}&medico_id=${med1.id}`), 200, "vagos");
    const vagosSeg = v.vagos.filter((x: any) => x.data === SEG).map((x: any) => x.hora);
    for (const h of ["09:30", "14:00", "17:30"]) assert(vagosSeg.includes(h), `${h} deveria estar vago`);
    for (const h of ["08:00", "08:30", "09:00", "10:00", "10:30", "11:00", "11:30", "12:00", "13:30", "18:00"]) {
      assert(!vagosSeg.includes(h), `${h} não deveria estar vago (${vagosSeg.join(" ")})`);
    }
    const vagosTer = v.vagos.filter((x: any) => x.data === TER).map((x: any) => x.hora);
    assert(!vagosTer.includes("08:00") && !vagosTer.includes("08:30") && vagosTer.includes("09:00"), "bloqueio da clínica tira o vago");
    const v2 = esperar(await sAPI("GET", `/agendamentos/vagos?de=${SEG}&ate=${SEG}&medico_id=${med2.id}`), 200, "vagos sem expediente");
    assert(v2.sem_expediente === true && v2.vagos.length === 0, "sem expediente");

    // ------------------------------------------------------------ 7. grade cheia
    const g = esperar(await sAPI("GET", `/agendamentos/grade?de=${SEG}&ate=${DOM}&medico_ids=${med1.id}`), 200, "grade cheia");
    const g2 = g.agendamentos.find((x: any) => x.id === a2.id);
    assert(g2 && g2.hora_fim === "09:00" && Array.isArray(g2.procedimentos) && typeof g2.total_previsto_centavos === "number", "card completo");
    assert(g.bloqueios.length === 2, `bloqueio do médico + da clínica: ${g.bloqueios.length}`);
    assert(g.bloqueios.some((b: any) => b.medico_id === null), "bloqueio da clínica aparece para o médico");
    assert(g.tipos.every((t: any) => /^#[0-9A-F]{6}$/i.test(t.cor)), "cor vem do tipo");
    assert(g.tipos.some((t: any) => t.codigo === "ENCAIXE"), "tipos na grade");

    // ------------------------------------------------------------ 8. mover
    db.prepare(`UPDATE agendamentos SET confirmacao_enviada = 1, confirmacao_respondida = 1 WHERE id = ?`).run(a1.id);
    const m1 = esperar(await sAPI("POST", `/agendamentos/${a1.id}/mover`, { data: SEG, hora: "15:00" }), 200, "mover");
    assert(m1.confirmacao_zerada === true && m1.avisos.fora_expediente === false, "mover dentro do expediente");
    assert(um<number>(`SELECT confirmacao_enviada + confirmacao_respondida FROM agendamentos WHERE id = ?`, a1.id) === 0, "confirmação zerada");
    const foraPergunta = esperar(await sAPI("POST", `/agendamentos/${a1.id}/mover`, { data: SEG, hora: "19:00" }), 409, "mover fora do expediente pede confirmação");
    assert(foraPergunta.codigo === "dia_especial" && String(foraPergunta.mensagem).includes("fora do expediente"), `dia_especial: ${foraPergunta.mensagem}`);
    const fora = esperar(await sAPI("POST", `/agendamentos/${a1.id}/mover`, { data: SEG, hora: "19:00", confirmar_dia_especial: true }), 200, "mover fora do expediente confirmado");
    assert(fora.avisos.fora_expediente === true, "aviso fora do expediente");
    // Domingo: pergunta (sem mover)
    const domingo = esperar(await sAPI("POST", `/agendamentos/${a1.id}/mover`, { data: DOM, hora: "09:00" }), 409, "mover para domingo pede confirmação");
    assert(String(domingo.mensagem).includes("domingo"), `domingo: ${domingo.mensagem}`);
    const noBloq = esperar(await sAPI("POST", `/agendamentos/${a1.id}/mover`, { data: SEG, hora: "10:00" }), 409, "mover para bloqueio");
    assert(noBloq.codigo === "horario_bloqueado", "código horario_bloqueado");
    esperar(await sAPI("POST", `/agendamentos/${a1.id}/mover`, { data: SEG, hora: "19:00" }), 400, "nada mudou");
    esperar(await sAPI("POST", `/agendamentos/${a1.id}/mover`, { data: "2020-01-06", hora: "08:00" }), 400, "data passada");
    esperar(await chamar(cMed2, "POST", `/agendamentos/${a1.id}/mover`, { data: SEG, hora: "15:00" }), 403, "médico move agendamento de outro");
    esperar(await chamar(cMed1, "POST", `/agendamentos/${a1.id}/mover`, { data: SEG, hora: "15:00", medico_id: med2.id }), 403, "médico passa para outro médico");
    const outroMed = esperar(await sAPI("POST", `/agendamentos/${a1.id}/mover`, { data: SEG, hora: "15:00", medico_id: med2.id, hora_fim: "15:45" }), 200, "mover para outro médico");
    assert(outroMed.para.medico_id === med2.id && outroMed.para.duracao_minutos === 45, "médico e duração novos");
    esperar(await sAPI("DELETE", `/agendamentos/${forcado.id}`), 200, "cancelar pela rota antiga");
    const cancelado = esperar(await sAPI("POST", `/agendamentos/${forcado.id}/mover`, { data: SEG, hora: "16:00" }), 409, "mover cancelado");
    assert(cancelado.codigo === "nao_remarcavel", "código nao_remarcavel");

    // ------------------------------------------------------------ 9. trocar
    const t = esperar(await sAPI("POST", `/agendamentos/${a2.id}/trocar`, { outro_id: enc.id }), 200, "trocar");
    const a2Depois = esperar(await sAPI("GET", `/agendamentos/${a2.id}`), 200, "ler a2");
    const encDepois = esperar(await sAPI("GET", `/agendamentos/${enc.id}`), 200, "ler encaixe");
    assert(a2Depois.hora === "09:00" && encDepois.hora === "08:00", "horas trocadas");
    assert(a2Depois.duracao_minutos === 60 && encDepois.duracao_minutos === 30, "cada um mantém a duração");
    assert(t.a.para.hora === "09:00" && t.b.para.hora === "08:00", "resposta da troca");
    esperar(await sAPI("POST", `/agendamentos/${a2.id}/trocar`, { outro_id: a2.id }), 400, "trocar consigo mesmo");
    // Mesmo paciente e médico nos dois: passa pela hora provisória (índice 036)
    const s1 = esperar(await agendar({ paciente_id: p4, hora: "16:00" }), 201, "p4 16:00");
    const s2 = esperar(await agendar({ paciente_id: p4, hora: "16:30", hora_fim: "17:30" }), 201, "p4 16:30");
    esperar(await sAPI("POST", `/agendamentos/${s1.id}/trocar`, { outro_id: s2.id }), 200, "trocar mesmo paciente");
    assert(um<string>(`SELECT hora FROM agendamentos WHERE id = ?`, s1.id) === "16:30", "s1 foi para 16:30");
    assert(um<string>(`SELECT hora FROM agendamentos WHERE id = ?`, s2.id) === "16:00", "s2 foi para 16:00");
    assert(um<number>(`SELECT COUNT(*) FROM agendamentos WHERE hora = '--:--'`) === 0, "hora provisória não sobra");
    esperar(await sAPI("POST", `/agendamentos/${s1.id}/trocar`, { outro_id: forcado.id }), 409, "trocar com cancelado");

    // ------------------------------------------------------------ 10. retorno
    db.prepare(
      `INSERT INTO prontuarios (paciente_id, medico_id, retorno_dias, retorno_ate) VALUES (?, ?, 30, ?)`,
    ).run(p3, med1.id, somarDias(SEG, 10));
    const ret = esperar(await agendar({ paciente_id: p3, hora: "17:00", procedimento_ids: [RET], agendamento_tipo_id: tipo("RETORNO") }), 201, "agendar retorno");
    assert(ret.eh_retorno === 1, "retorno derivado do procedimento");
    const retOutro = esperar(await sAPI("POST", `/agendamentos/${ret.id}/mover`, { data: SEG, hora: "17:00", medico_id: med2.id }), 400, "mover retorno para outro médico");
    assert(String(retOutro.error).includes("retorno vigente é com"), `mensagem de retorno: ${retOutro.error}`);
    const foraPrazo = esperar(await sAPI("POST", `/agendamentos/${ret.id}/mover`, { data: somarDias(SEG, 20), hora: "08:00" }), 409, "mover retorno para depois do prazo");
    assert(foraPrazo.codigo === "retorno_confirmar" && foraPrazo.motivo === "data_apos_prazo", "pede confirmação (prazo)");
    esperar(await sAPI("POST", `/agendamentos/${ret.id}/mover`, { data: TER, hora: "10:00" }), 200, "retorno dentro do prazo");
    esperar(await sAPI("POST", `/agendamentos/${ret.id}/mover`, { data: somarDias(SEG, 21), hora: "08:00", confirmar_retorno: true }), 200, "retorno depois do prazo confirmado");

    // Decisão do cliente (13/11): retorno sem consulta vigente → avisar e perguntar
    const retorno = (paciente: number, extra: Record<string, unknown> = {}) =>
      // 18:00 está fora do expediente (até 18:00): confirmado aqui, o assunto é o retorno.
      agendar({ paciente_id: paciente, hora: "18:00", procedimento_ids: [RET], agendamento_tipo_id: tipo("RETORNO"), confirmar_dia_especial: true, ...extra });
    const semConsulta = esperar(await retorno(p4), 409, "retorno sem consulta prévia");
    assert(semConsulta.codigo === "retorno_confirmar" && semConsulta.motivo === "sem_consulta", `motivo: ${semConsulta.motivo}`);
    assert(String(semConsulta.mensagem).includes("não tem consulta anterior") && String(semConsulta.mensagem).includes("mesmo assim?"), "mensagem pergunta");
    esperar(await retorno(p4, { confirmar_retorno: true }), 201, "retorno sem consulta confirmado");

    const p5 = novoPaciente("PAC A2 CINCO");
    db.prepare(`INSERT INTO prontuarios (paciente_id, medico_id, data_atendimento, retorno_dias, retorno_ate) VALUES (?, ?, '2020-01-10 10:00:00', 30, '2020-02-09')`).run(p5, med1.id);
    const vencido = esperar(await retorno(p5), 409, "retorno com prazo vencido");
    assert(vencido.motivo === "prazo_vencido" && String(vencido.mensagem).includes("09/02/2020"), `prazo vencido: ${vencido.mensagem}`);
    esperar(await retorno(p5, { confirmar_retorno: true }), 201, "retorno vencido confirmado");

    const p6 = novoPaciente("PAC A2 SEIS");
    db.prepare(`INSERT INTO prontuarios (paciente_id, medico_id, data_atendimento) VALUES (?, ?, '2025-05-05 09:00:00')`).run(p6, med1.id);
    const semPrazo = esperar(await retorno(p6), 409, "consulta sem prazo de retorno");
    assert(semPrazo.motivo === "sem_prazo", `sem prazo: ${semPrazo.motivo}`);

    // Retorno vigente com OUTRO médico continua recusado, mesmo confirmando
    esperar(await retorno(p3, { medico_id: med2.id, confirmar_retorno: true }), 400, "retorno com outro médico");
    const depoisPrazo = esperar(await retorno(p3, { data: somarDias(SEG, 20) }), 409, "retorno marcado depois do prazo");
    assert(depoisPrazo.motivo === "data_apos_prazo", `depois do prazo: ${depoisPrazo.motivo}`);

    // ------------------------------------------------------------ 11. PATCH /agenda e rotas antigas
    esperar(await sAPI("PATCH", `/agendamentos/${a2.id}/agenda`, { agendamento_tipo_id: tipo("RETORNO") }), 400, "tipo incompatível no PATCH");
    const obs = esperar(await sAPI("PATCH", `/agendamentos/${a2.id}/agenda`, { agendamento_tipo_id: tipo("CONSULTA"), observacao_agenda: "  Trazer exames  " }), 200, "PATCH tipo + comentário");
    assert(obs.agendamento_tipo_id === tipo("CONSULTA") && obs.observacao_agenda === "Trazer exames", "PATCH aplicado");
    esperar(await sAPI("PATCH", `/agendamentos/${a2.id}/agenda`, {}), 400, "PATCH vazio");
    esperar(await sAPI("PATCH", `/agendamentos/${a2.id}/agenda`, { status: "finalizado" }), 400, "campo desconhecido (strict)");
    // Rota antiga troca procedimentos → trigger re-infere o tipo
    esperar(await sAPI("PATCH", `/agendamentos/${a2.id}/procedimentos`, { procedimento_ids: [RET] }), 200, "rota antiga de procedimentos");
    assert(um<number>(`SELECT agendamento_tipo_id FROM agendamentos WHERE id = ?`, a2.id) === tipo("RETORNO"), "tipo acompanhou o procedimento");
    const lista = esperar(await sAPI("GET", `/agendamentos?data=${SEG}`), 200, "GET antigo");
    assert(lista.some((x: any) => x.id === a2.id && "agendamento_tipo_id" in x), "lista antiga continua");

    // ------------------------------------------------------------ 12. médico só vê a própria agenda
    const gMed2 = esperar(await chamar(cMed2, "GET", `/agendamentos/grade?de=${SEG}&ate=${DOM}&medico_ids=${med1.id}`), 200, "grade do médico 2");
    assert(gMed2.agendamentos.every((x: any) => x.medico_id === med2.id), "médico vê só os próprios");
    assert(gMed2.agendamentos.some((x: any) => x.id === a1.id), "inclui o que foi passado para ele");
    const bMed2 = esperar(await chamar(cMed2, "GET", `/agenda-config/bloqueios?de=${SEG}&ate=${DOM}&medico_ids=${med1.id}`), 200, "bloqueios do médico 2");
    assert(bMed2.every((b: any) => b.medico_id === null || b.medico_id === med2.id), "médico vê só bloqueios próprios e da clínica");

    // ------------------------------------------------------------ 13. cor do procedimento (047)
    const procNovo = esperar(await sAPI("POST", "/cobranca/procedimentos", {
      nome: `PROC A2 ${sufixo}`, modo_clinico: "nenhum",
    }), 201, "procedimento sem cor");
    assert(/^#[0-9A-F]{6}$/.test(procNovo.cor ?? ""), `cor automática: ${procNovo.cor}`);
    const usadas = db.prepare(`SELECT cor FROM procedimentos WHERE id <> ? AND cor IS NOT NULL`).pluck().all(procNovo.id) as string[];
    const totalPaleta = um<number>(`SELECT COUNT(*) FROM agenda_paleta_procedimento`);
    if (usadas.length < totalPaleta) assert(!usadas.includes(procNovo.cor), "cor automática não repete enquanto houver livre");
    const procCor = esperar(await sAPI("PUT", `/cobranca/procedimentos/${EXAME}`, { cor: "#12ab34" }), 200, "trocar cor do procedimento");
    assert(procCor.cor === "#12AB34", "cor normalizada");
    esperar(await sAPI("PUT", `/cobranca/procedimentos/${EXAME}`, { cor: "azul" }), 400, "cor inválida");
    const gCor = esperar(await sAPI("GET", `/agendamentos/grade?de=${SEG}&ate=${DOM}&medico_ids=${med1.id}`), 200, "grade com cor");
    const cardExame = gCor.agendamentos.find((x: any) => x.id === ex.id);
    assert(cardExame?.procedimentos?.[0]?.cor === "#12AB34", "card traz a cor do procedimento");

    // ------------------------------------------------------------ 13b. prévia da marcação (A4c)
    db.prepare(
      `INSERT INTO procedimento_precos (procedimento_id, convenio_id, valor_centavos) VALUES (?, ?, 15000)
       ON CONFLICT(procedimento_id, convenio_id) DO UPDATE SET valor_centavos = 15000`,
    ).run(CONS, convenio);
    const prev = esperar(await sAPI("GET", `/agendamentos/previa?convenio_id=${convenio}&procedimento_ids=${CONS},${EXAME}`), 200, "prévia");
    const precoExame = um<number>(`SELECT COALESCE((SELECT valor_centavos FROM procedimento_precos WHERE procedimento_id = ? AND convenio_id = ?), 0)`, EXAME, convenio);
    assert(prev.total_centavos === 15000 + precoExame, `total da prévia: ${prev.total_centavos}`);
    assert(prev.duracao_sugerida === 45, `duração sugerida pelo exame (45): ${prev.duracao_sugerida}`);
    const prevVazia = esperar(await sAPI("GET", `/agendamentos/previa?convenio_id=${convenio}&procedimento_ids=`), 200, "prévia vazia");
    assert(prevVazia.total_centavos === 0 && prevVazia.duracao_sugerida === 30, "prévia vazia: 0 e intervalo padrão");
    const prevErro = esperar(await sAPI("GET", `/agendamentos/previa?procedimento_ids=abc`), 400, "prévia com lista inválida");
    assert(String(prevErro.error).includes("procedimentos"), "mensagem fala de procedimentos");

    // ------------------------------------------------------------ 14. horário padrão único (botão ⚙)
    const hp = esperar(await sAPI("GET", "/agenda-config/horario-padrao"), 200, "ler horário padrão");
    assert(hp.inicio === "07:00" && hp.fim === "19:00" && hp.intervalo_minutos === 30, `padrão de fábrica: ${JSON.stringify(hp)}`);
    esperar(await chamar(cMed1, "PUT", "/agenda-config/horario-padrao", { inicio: "06:00", fim: "20:00", intervalo_minutos: 15 }), 403, "médico não ajusta o padrão");
    esperar(await sAPI("PUT", "/agenda-config/horario-padrao", { inicio: "19:00", fim: "07:00", intervalo_minutos: 30 }), 400, "fim antes do início");
    esperar(await sAPI("PUT", "/agenda-config/horario-padrao", { inicio: "07:00", fim: "19:00", intervalo_minutos: 25 }), 400, "intervalo inválido");
    esperar(await sAPI("PUT", "/agenda-config/horario-padrao", { inicio: "06:00", fim: "20:00", intervalo_minutos: 15 }), 200, "ajustar padrão");
    const gPad = esperar(await sAPI("GET", `/agendamentos/grade?de=${SEG}&ate=${DOM}&medico_ids=${med2.id}`), 200, "grade com padrão novo");
    assert(gPad.faixa.inicio === "06:00" && gPad.faixa.fim === "20:00", `faixa segue o padrão: ${JSON.stringify(gPad.faixa)}`);
    assert(gPad.horario_padrao.intervalo_minutos === 15, "grade traz o padrão");
    const semDur = esperar(await agendar({ paciente_id: p6, hora: "07:00", medico_id: med2.id }), 201, "marcar sem duração");
    assert(semDur.duracao_minutos === 15, `duração vem do intervalo padrão: ${semDur.duracao_minutos}`);
    const comFim = esperar(await agendar({ paciente_id: p6, hora: "08:00", hora_fim: "08:50", medico_id: med2.id }), 201, "mudar o fim na marcação");
    assert(comFim.duracao_minutos === 50, "fim escolhido na hora vale");
    esperar(await sAPI("PUT", "/agenda-config/horario-padrao", { inicio: "07:00", fim: "19:00", intervalo_minutos: 30 }), 200, "restaurar padrão");

    // ------------------------------------------------------------ integridade
    assert(db.prepare(`PRAGMA foreign_key_check`).all().length === 0, "foreign_key_check");
    assert(um<string>(`PRAGMA integrity_check`) === "ok", "integrity_check");
    void sec;

    console.log("A2 OK — config, grade, vagos, avisos, tipo, bloqueio, mover, trocar, retorno e rotas antigas.");
  } finally {
    fecharServidor?.();
    fecharDb?.();
    removerBancoCopia(copia);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
