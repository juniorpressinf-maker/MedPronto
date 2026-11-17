/**
 * Aceite B2 — Bloco 2 da auditoria de integridade, testado PELAS ROTAS HTTP.
 * Roda numa CÓPIA de data/medpronto.db (o banco real não é tocado):
 *   [4] trocar ficha com prontuário aberto não perde dado (recusa se perderia);
 *   [6] procedimentos não perdem a consulta/ASO que já foi aberto;
 *   [7] o mesmo ASO não é cobrado em duas contas;
 *   [8] pagamento não passa do saldo; estorno só admin, conta reaberta/aberta e do dia;
 *   [5] cancelar conta avulsa sem pagamento; conta de horário ativo não cancela por aqui.
 */
import type { AddressInfo } from "node:net";
import { assert, prepararBancoCopia, removerBancoCopia } from "./lib/bancoCopia.js";

type Resp = { status: number; json: any };

async function main(): Promise<void> {
  const copia = await prepararBancoCopia("b2");
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

    const sufixo = Date.now().toString(36);
    const SENHA = "Teste#B2-integridade";
    createUser(`b2sec_${sufixo}`, SENHA, "secretaria", "SEC TESTE B2");
    createUser(`b2adm_${sufixo}`, SENHA, "admin", "ADM TESTE B2");
    const med = createUser(`b2med_${sufixo}`, SENHA, "medico", "DR B2");
    async function login(usuario: string): Promise<string> {
      const r = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: usuario, senha: SENHA }),
      });
      assert(r.status === 200, `login ${usuario}: HTTP ${r.status}`);
      return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    }
    const cSec = await login(`b2sec_${sufixo}`);
    const cAdm = await login(`b2adm_${sufixo}`);
    const cMed = await login(`b2med_${sufixo}`);
    const sec = (m: string, u: string, b?: unknown) => chamar(cSec, m, u, b);
    const adm = (m: string, u: string, b?: unknown) => chamar(cAdm, m, u, b);

    const pac = Number(
      db.prepare(`INSERT INTO pacientes (nome, telefone, data_nasc) VALUES (?, '11999990000', '1980-01-01')`)
        .run(`PAC B2 ${sufixo}`).lastInsertRowid,
    );
    const convenio = um<number>(`SELECT id FROM convenios WHERE ativo = 1 ORDER BY id LIMIT 1`);
    const CONS = um<number>(`SELECT id FROM procedimentos WHERE codigo = 'CONS'`);
    const ASO = um<number>(`SELECT id FROM procedimentos WHERE modo_clinico = 'aso' AND ativo = 1 ORDER BY id LIMIT 1`);
    const EXAME = um<number>(`SELECT id FROM procedimentos WHERE modo_clinico = 'nenhum' AND ativo = 1 ORDER BY id LIMIT 1`);
    assert(convenio && CONS && ASO && EXAME, "base sem convênio ou procedimentos CONS/ASO/exame");

    const DIA = "2098-06-16";
    assert(um<number>(`SELECT COUNT(*) FROM agendamentos WHERE data = ?`, DIA) === 0, "dia de teste já tem dados");
    const agendar = async (hora: string, procs: number[], extra: Record<string, unknown> = {}): Promise<number> =>
      esperar(await sec("POST", "/agendamentos", {
        paciente_id: pac, medico_id: med.id, convenio_id: convenio,
        procedimento_ids: procs, data: DIA, hora, ignorar_bloqueio: true, ...extra,
      }), 201, `agendar ${hora}`).id;
    const status = (id: number, novo: string) => sec("PATCH", `/agendamentos/${id}/status`, { status: novo });
    const contaDoHorario = (id: number) =>
      um<number>(`SELECT id FROM contas_atendimento WHERE agendamento_id = ? AND status != 'cancelada'`, id);

    // Fichas de teste (globais, consulta)
    const novaFicha = (nome: string, campos: unknown[]) =>
      Number(
        db.prepare(
          `INSERT INTO fichas_template (nome, titulo_documento, modo, campos_json, medico_id, ativo, destino)
           VALUES (?, 'Ficha teste', 'secoes', ?, NULL, 1, 'prontuario')`,
        ).run(`${nome} ${sufixo}`, JSON.stringify(campos)).lastInsertRowid,
      );
    const cQueixa = { id: "queixa_principal", label: "Queixa", tipo: "textarea", ordem: 0 };
    const cExtra = { id: "obs_extra_b2", label: "Obs extra B2", tipo: "text", ordem: 1 };
    const cOutro = { id: "outro_b2", label: "Outro B2", tipo: "text", ordem: 2 };
    const F1 = novaFicha("B2 F1", [cQueixa, cExtra]);
    const F2 = novaFicha("B2 F2 (maior)", [cQueixa, cExtra, cOutro]);
    const F3 = novaFicha("B2 F3 (menor)", [cQueixa]);

    // ---------------------------------------- [4] trocar ficha sem perder dado
    const h1 = await agendar("08:00", [CONS], { ficha_template_id: F1 });
    esperar(await status(h1, "presente"), 200, "check-in h1");
    const pr = esperar(await chamar(cMed, "POST", "/prontuarios/abrir", { agendamento_id: h1 }), 200, "abrir h1").prontuario;
    assert(pr.ficha_template_id === F1, "prontuário nasce com a ficha do horário");
    esperar(await chamar(cMed, "PUT", `/prontuarios/${pr.id}`, {
      dados_json: { queixa_principal: "dor de cabeça", obs_extra_b2: "anotação importante" },
    }), 200, "salvar prontuário");
    const r4 = esperar(await chamar(cMed, "PATCH", `/agendamentos/${h1}/ficha`, { ficha_template_id: F3 }), 409, "trocar para ficha menor");
    assert(String(r4.error).includes("Obs extra B2"), `mensagem cita o campo: ${r4.error}`);
    assert(um<number>(`SELECT ficha_template_id FROM prontuarios WHERE id = ?`, pr.id) === F1, "prontuário intacto");
    assert(um<number>(`SELECT ficha_template_id FROM agendamentos WHERE id = ?`, h1) === F1, "horário intacto");
    esperar(await chamar(cMed, "PATCH", `/agendamentos/${h1}/ficha`, { ficha_template_id: F2 }), 200, "trocar para ficha maior");
    const dados = JSON.parse(um<string>(`SELECT dados_json FROM prontuarios WHERE id = ?`, pr.id));
    assert(um<number>(`SELECT ficha_template_id FROM prontuarios WHERE id = ?`, pr.id) === F2, "prontuário na ficha nova");
    assert(dados.obs_extra_b2 === "anotação importante" && dados.queixa_principal === "dor de cabeça", `dados preservados: ${JSON.stringify(dados)}`);

    // ---------------------------------------- [6] procedimentos com prontuário aberto
    const r6 = esperar(await sec("PATCH", `/agendamentos/${h1}/procedimentos`, { procedimento_ids: [EXAME] }), 409, "tirar consulta com prontuário");
    assert(r6.codigo === "tem_prontuario", `código ${r6.codigo}`);
    esperar(await sec("PATCH", `/agendamentos/${h1}/procedimentos`, { procedimento_ids: [CONS, EXAME] }), 200, "incluir exame mantendo consulta");

    const h2 = await agendar("09:00", [ASO]);
    esperar(await status(h2, "presente"), 200, "check-in h2");
    const aso = esperar(await chamar(cMed, "POST", "/admissionais/abrir", { agendamento_id: h2 }), 200, "abrir ASO h2");
    const r6b = esperar(await sec("PATCH", `/agendamentos/${h2}/procedimentos`, { procedimento_ids: [EXAME] }), 409, "tirar ASO com ASO aberto");
    assert(r6b.codigo === "tem_aso", `código ${r6b.codigo}`);

    // ---------------------------------------- [7] mesmo ASO em duas contas
    const walkin = esperar(await sec("POST", "/cobranca/contas", { paciente_id: pac, data: DIA }), 201, "conta avulsa").id;
    const contaH2 = contaDoHorario(h2);
    const jaLigado = um<number>(`SELECT COUNT(*) FROM conta_itens WHERE admissional_id = ? AND status != 'cancelado'`, aso.id);
    const addAso = (contaId: number) =>
      sec("POST", `/cobranca/contas/${contaId}/itens`, { procedimento_id: ASO, admissional_id: aso.id, confirmar_duplicata: true });
    if (jaLigado === 0) {
      // Conta do horário: o item do ASO veio do check-in; liga-se ao ASO editando o item.
      const itemAso = um<number>(
        `SELECT id FROM conta_itens WHERE conta_id = ? AND procedimento_id = ? AND status != 'cancelado'`,
        contaH2, ASO,
      );
      assert(itemAso, "item do ASO na conta do horário");
      esperar(await sec("PATCH", `/cobranca/contas/${contaH2}/itens/${itemAso}`, { admissional_id: aso.id }), 200, "ligar ASO ao item do horário");
    }
    const r7 = await addAso(walkin);
    assert(r7.status === 400 && String(r7.json.error).includes("já vinculado"), `ASO em segunda conta: ${r7.status} ${JSON.stringify(r7.json)}`);
    assert(um<number>(`SELECT COUNT(*) FROM conta_itens WHERE admissional_id = ? AND status != 'cancelado'`, aso.id) === 1, "ASO cobrado uma vez só");

    // ---------------------------------------- [8] teto do pagamento e estorno
    const h3 = await agendar("10:00", [CONS]);
    esperar(await status(h3, "presente"), 200, "check-in h3");
    const c3 = contaDoHorario(h3);
    db.prepare(`UPDATE conta_itens SET valor_centavos = 10000, quantidade = 1 WHERE conta_id = ?`).run(c3);
    const saldo = esperar(await sec("GET", `/cobranca/contas/${c3}`), 200, "detalhe c3").saldo_pendente_centavos;
    assert(saldo === 10000, `saldo da conta: ${saldo}`);
    esperar(await sec("POST", `/cobranca/contas/${c3}/pagamentos`, { forma: "pix", valor_centavos: 10001 }), 400, "pagar acima do saldo");
    const comPag = esperar(await sec("POST", `/cobranca/contas/${c3}/pagamentos`, { forma: "pix", valor_centavos: 3000 }), 201, "pagamento parcial");
    const pagId = comPag.pagamentos[0].id;
    esperar(await sec("POST", `/cobranca/contas/${c3}/pagamentos/${pagId}/estornar`, { motivo: "lançado errado" }), 403, "secretaria não estorna");
    esperar(await adm("POST", `/cobranca/contas/${c3}/pagamentos/${pagId}/estornar`, { motivo: "x" }), 400, "estorno sem motivo");
    const est = esperar(await adm("POST", `/cobranca/contas/${c3}/pagamentos/${pagId}/estornar`, { motivo: "lançado errado" }), 200, "estorno pelo admin");
    assert(est.pagamentos.length === 0 && est.saldo_pendente_centavos === 10000, "estorno devolve o saldo");
    assert(um<number>(`SELECT COUNT(*) FROM log_acesso WHERE acao = 'cobranca_estorno' AND detalhe LIKE ?`, `conta=${c3} %`) === 1, "estorno no log");
    const velho = Number(db.prepare(
      `INSERT INTO conta_pagamentos (conta_id, forma, valor_centavos, registrado_em) VALUES (?, 'pix', 1000, '2000-01-01 10:00:00')`,
    ).run(c3).lastInsertRowid);
    esperar(await adm("POST", `/cobranca/contas/${c3}/pagamentos/${velho}/estornar`, { motivo: "dia antigo" }), 400, "estorno de outro dia");

    // ---------------------------------------- [5] cancelar conta
    esperar(await sec("POST", `/cobranca/contas/${c3}/cancelar`, { motivo: "teste" }), 400, "cancelar conta com pagamento");
    db.prepare(`DELETE FROM conta_pagamentos WHERE id = ?`).run(velho);
    const r5 = esperar(await sec("POST", `/cobranca/contas/${c3}/cancelar`, { motivo: "teste" }), 400, "cancelar conta de horário ativo");
    assert(String(r5.error).includes("horário"), `mensagem: ${r5.error}`);
    esperar(await sec("POST", `/cobranca/contas/${walkin}/cancelar`, {}), 400, "cancelar sem motivo");
    const canc = esperar(await sec("POST", `/cobranca/contas/${walkin}/cancelar`, { motivo: "aberta por engano" }), 200, "cancelar avulsa");
    assert(canc.status === "cancelada", `status ${canc.status}`);
    esperar(await sec("POST", `/cobranca/contas/${walkin}/cancelar`, { motivo: "de novo" }), 400, "cancelar de novo");

    assert(db.prepare(`PRAGMA foreign_key_check`).all().length === 0, "foreign_key_check");
    assert(um<string>(`PRAGMA integrity_check`) === "ok", "integrity_check");

    console.log("B2 OK — troca de ficha sem perda, procedimentos x clínico, ASO uma vez, teto/estorno de pagamento, cancelar conta.");
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
