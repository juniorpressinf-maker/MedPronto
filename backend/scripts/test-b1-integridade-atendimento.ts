/**
 * Aceite B1 — Bloco 1 da auditoria de integridade, testado PELAS ROTAS HTTP.
 *
 * Roda numa CÓPIA de data/medpronto.db (o banco real não é tocado):
 *   1. Cancelar / falta / desfazer chegada: conta em aberto sem pagamento é cancelada junto;
 *      conta com pagamento, prontuário ou ASO bloqueiam (409).
 *   2. DELETE /agendamentos/:id segue as mesmas regras e não cancela finalizado.
 *   3. Finalizar prontuário só em atendimento; consulta finalizada não reabre
 *      mesmo que o status do horário seja alterado por fora.
 *   4. POST /admissionais: médico não vê ASO de outro médico nem cria em nome dele;
 *      ASO avulso não duplica.
 */
import type { AddressInfo } from "node:net";
import { assert, prepararBancoCopia, removerBancoCopia } from "./lib/bancoCopia.js";

type Resp = { status: number; json: any };

async function main(): Promise<void> {
  const copia = await prepararBancoCopia("b1");
  console.log(`Cópia de teste: ${copia}`);
  let fecharServidor: (() => void) | undefined;
  let fecharDb: (() => void) | undefined;

  try {
    const express = (await import("express")).default;
    const { runMigrations } = await import("../src/db/migrate.js");
    const { getDb, closeDb } = await import("../src/db/index.js");
    fecharDb = closeDb;
    const { sessionMiddleware, attachPermissoes } = await import("../src/auth/middleware.js");
    const { createUser } = await import("../src/auth/users.js");
    const { apiRouter } = await import("../src/routes/index.js");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");

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
    const SENHA = "Teste#B1-integridade";
    createUser(`b1sec_${sufixo}`, SENHA, "secretaria", "SEC TESTE B1");
    const med1 = createUser(`b1med1_${sufixo}`, SENHA, "medico", "DR B1 UM");
    const med2 = createUser(`b1med2_${sufixo}`, SENHA, "medico", "DR B1 DOIS");

    async function login(usuario: string): Promise<string> {
      const r = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: usuario, senha: SENHA }),
      });
      assert(r.status === 200, `login ${usuario}: HTTP ${r.status}`);
      return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    }
    const cSec = await login(`b1sec_${sufixo}`);
    const cMed1 = await login(`b1med1_${sufixo}`);
    const cMed2 = await login(`b1med2_${sufixo}`);
    const sec = (m: string, u: string, b?: unknown) => chamar(cSec, m, u, b);

    const pac = Number(
      db.prepare(`INSERT INTO pacientes (nome, telefone, data_nasc) VALUES (?, '11999990000', '1980-01-01')`)
        .run(`PAC B1 ${sufixo}`).lastInsertRowid,
    );
    const convenio = um<number>(`SELECT id FROM convenios WHERE ativo = 1 ORDER BY id LIMIT 1`);
    const CONS = um<number>(`SELECT id FROM procedimentos WHERE codigo = 'CONS'`);
    const ASO = um<number>(`SELECT id FROM procedimentos WHERE modo_clinico = 'aso' AND ativo = 1 ORDER BY id LIMIT 1`);
    assert(convenio && CONS && ASO, "base sem convênio ou procedimentos CONS/ASO");

    const DIA = "2098-05-12";
    assert(um<number>(`SELECT COUNT(*) FROM agendamentos WHERE data = ?`, DIA) === 0, "dia de teste já tem dados");

    const agendar = async (hora: string, procs = [CONS]): Promise<number> =>
      esperar(await sec("POST", "/agendamentos", {
        paciente_id: pac, medico_id: med1.id, convenio_id: convenio,
        procedimento_ids: procs, data: DIA, hora, ignorar_bloqueio: true,
      }), 201, `agendar ${hora}`).id;
    const status = (id: number, novo: string, cookie = cSec) =>
      chamar(cookie, "PATCH", `/agendamentos/${id}/status`, { status: novo });
    const statusAg = (id: number) => um<string>(`SELECT status FROM agendamentos WHERE id = ?`, id);
    const contaAtiva = (id: number) =>
      db.prepare(`SELECT id, status FROM contas_atendimento WHERE agendamento_id = ? AND status != 'cancelada'`)
        .get(id) as { id: number; status: string } | undefined;
    const contasCanceladas = (id: number) =>
      um<number>(`SELECT COUNT(*) FROM contas_atendimento WHERE agendamento_id = ? AND status = 'cancelada'`, id);

    // ---------------------------------------- 1. cancelar com conta sem pagamento
    const h1 = await agendar("08:00");
    esperar(await status(h1, "presente"), 200, "check-in h1");
    assert(contaAtiva(h1)?.status === "em_aberto", "check-in abre conta");
    esperar(await sec("DELETE", `/agendamentos/${h1}`), 200, "DELETE h1 com conta sem pagamento");
    assert(statusAg(h1) === "cancelado", "h1 cancelado");
    assert(!contaAtiva(h1) && contasCanceladas(h1) === 1, "conta de h1 cancelada junto");

    // ---------------------------------------- 2. desfazer chegada + nova chegada
    const h2 = await agendar("08:30");
    esperar(await status(h2, "presente"), 200, "check-in h2");
    esperar(await status(h2, "agendado"), 200, "desfazer chegada h2");
    assert(!contaAtiva(h2) && contasCanceladas(h2) === 1, "desfazer chegada cancela conta vazia");
    esperar(await status(h2, "presente"), 200, "nova chegada h2");
    assert(contaAtiva(h2)?.status === "em_aberto", "nova chegada abre conta nova");

    // ---------------------------------------- 3. conta com pagamento bloqueia
    const h3 = await agendar("09:00");
    esperar(await status(h3, "presente"), 200, "check-in h3");
    db.prepare(`INSERT INTO conta_pagamentos (conta_id, forma, valor_centavos) VALUES (?, 'pix', 1000)`)
      .run(contaAtiva(h3)!.id);
    const r3 = esperar(await status(h3, "nao_compareceu"), 409, "falta com pagamento");
    assert(r3.codigo === "conta_com_pagamento", `código ${r3.codigo}`);
    esperar(await sec("DELETE", `/agendamentos/${h3}`), 409, "DELETE com pagamento");
    assert(statusAg(h3) === "presente" && contaAtiva(h3)?.status === "em_aberto", "h3 e conta intactos");

    // ---------------------------------------- 4. prontuário bloqueia e finalizar
    const h4 = await agendar("09:30");
    esperar(await status(h4, "presente"), 200, "check-in h4");
    const ab = esperar(await chamar(cMed1, "POST", "/prontuarios/abrir", { agendamento_id: h4 }), 200, "abrir prontuário h4");
    const prId: number = ab.prontuario.id;
    assert(statusAg(h4) === "em_atendimento", "abrir põe em atendimento");
    esperar(await status(h4, "presente"), 200, "voltar para presente");
    const r4 = esperar(await status(h4, "cancelado"), 409, "cancelar com prontuário");
    assert(r4.codigo === "tem_prontuario", `código ${r4.codigo}`);
    esperar(await status(h4, "nao_compareceu"), 409, "falta com prontuário");
    esperar(await status(h4, "agendado"), 409, "desfazer chegada com prontuário");
    esperar(await sec("DELETE", `/agendamentos/${h4}`), 409, "DELETE com prontuário");
    esperar(await chamar(cMed1, "POST", `/prontuarios/${prId}/finalizar`), 409, "finalizar fora de atendimento");
    assert(statusAg(h4) === "presente", "finalizar recusado não mexe no horário");
    esperar(await chamar(cMed1, "POST", "/prontuarios/abrir", { agendamento_id: h4 }), 200, "reabrir atendimento");
    esperar(await chamar(cMed1, "POST", `/prontuarios/${prId}/finalizar`), 200, "finalizar em atendimento");
    assert(statusAg(h4) === "finalizado", "horário finalizado");
    esperar(await sec("DELETE", `/agendamentos/${h4}`), 409, "DELETE de finalizado");
    assert(statusAg(h4) === "finalizado", "finalizado continua finalizado");
    // Mesmo alterando o status por fora, a consulta finalizada não reabre.
    db.prepare(`UPDATE agendamentos SET status = 'cancelado' WHERE id = ?`).run(h4);
    esperar(await chamar(cMed1, "PUT", `/prontuarios/${prId}`, {}), 409, "editar prontuário finalizado");
    const det = esperar(await chamar(cMed1, "GET", `/prontuarios/${prId}`), 200, "ler prontuário");
    assert(det.consulta_encerrada === true, "continua encerrada");

    // ---------------------------------------- 5. ASO de outro médico
    const h5 = await agendar("10:00", [ASO]);
    esperar(await status(h5, "presente"), 200, "check-in h5");
    const aso = esperar(await chamar(cMed1, "POST", "/admissionais/abrir", { agendamento_id: h5 }), 200, "abrir ASO h5");
    esperar(await chamar(cMed2, "POST", "/admissionais", {
      paciente_id: pac, medico_id: med2.id, agendamento_id: h5,
    }), 403, "médico 2 pega ASO do médico 1");
    const proprio = esperar(await chamar(cMed1, "POST", "/admissionais", {
      paciente_id: pac, medico_id: med1.id, agendamento_id: h5,
    }), 201, "médico 1 no próprio horário");
    assert(proprio.id === aso.id, "devolve o mesmo ASO");
    esperar(await status(h5, "presente"), 200, "ASO: voltar para presente");
    const r5 = esperar(await status(h5, "cancelado"), 409, "cancelar com ASO");
    assert(r5.codigo === "tem_aso", `código ${r5.codigo}`);

    // ---------------------------------------- 6. ASO avulso
    esperar(await chamar(cMed2, "POST", "/admissionais", {
      paciente_id: pac, medico_id: med1.id,
    }), 403, "médico 2 cria avulso em nome do médico 1");
    const av1 = esperar(await chamar(cMed2, "POST", "/admissionais", { paciente_id: pac, medico_id: med2.id }), 201, "avulso 1");
    const av2 = esperar(await chamar(cMed2, "POST", "/admissionais", { paciente_id: pac, medico_id: med2.id }), 201, "avulso 2 (duplo clique)");
    assert(av1.id === av2.id, "duplo clique não duplica ASO avulso");

    // ------------------------------------------------------------ integridade
    assert(db.prepare(`PRAGMA foreign_key_check`).all().length === 0, "foreign_key_check");
    assert(um<string>(`PRAGMA integrity_check`) === "ok", "integrity_check");

    console.log("B1 OK — cancelar/falta/desfazer chegada, DELETE, finalizar prontuário, ASO entre médicos e avulso.");
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
