/**
 * Aceite B3 — Bloco 3 da auditoria de integridade (rotas HTTP + banco), numa CÓPIA do banco:
 *   [9]  horário com conta/prontuário não muda paciente/médico/dia nem por SQL direto;
 *   [10] modelo de ficha em uso: não remove campo preenchido em atendimento em andamento;
 *   [11] ficha desativada não é escolhida para horário novo;
 *   [12] datas da cobrança no horário local;
 *   [13] alteração de cadastro do paciente registra antes → depois;
 *   [14] WhatsApp com telefone de dois pacientes não confirma sozinho;
 *   [15] retificação de prontuário: uma em andamento por consulta (também no banco).
 */
import type { AddressInfo } from "node:net";
import { assert, prepararBancoCopia, removerBancoCopia } from "./lib/bancoCopia.js";

type Resp = { status: number; json: any };

async function main(): Promise<void> {
  const copia = await prepararBancoCopia("b3");
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
    const { registrarRespostaPaciente } = await import("../src/services/whatsappRespostas.js");
    const { hojeIsoLocal } = await import("../src/lib/diasUteis.js");

    runMigrations();
    const db = getDb();
    const um = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).pluck().get(...p) as T;
    const lancaErro = (fn: () => void, trecho: string, ctx: string) => {
      try {
        fn();
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        assert(m.includes(trecho), `${ctx}: erro "${m}" sem "${trecho}"`);
        return;
      }
      throw new Error(`FALHOU: ${ctx}: esperava erro`);
    };

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
    const SENHA = "Teste#B3-integridade";
    createUser(`b3sec_${sufixo}`, SENHA, "secretaria", "SEC TESTE B3");
    createUser(`b3adm_${sufixo}`, SENHA, "admin", "ADM TESTE B3");
    const med = createUser(`b3med_${sufixo}`, SENHA, "medico", "DR B3");
    const med2 = createUser(`b3med2_${sufixo}`, SENHA, "medico", "DR B3 DOIS");
    async function login(usuario: string): Promise<string> {
      const r = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: usuario, senha: SENHA }),
      });
      assert(r.status === 200, `login ${usuario}: HTTP ${r.status}`);
      return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    }
    const cSec = await login(`b3sec_${sufixo}`);
    const cAdm = await login(`b3adm_${sufixo}`);
    const cMed = await login(`b3med_${sufixo}`);
    const sec = (m: string, u: string, b?: unknown) => chamar(cSec, m, u, b);

    const novoPac = (nome: string, tel = "11999990000") =>
      Number(
        db.prepare(`INSERT INTO pacientes (nome, telefone, data_nasc) VALUES (?, ?, '1980-01-01')`)
          .run(`${nome} ${sufixo}`, tel).lastInsertRowid,
      );
    const pac = novoPac("PAC B3");
    const convenio = um<number>(`SELECT id FROM convenios WHERE ativo = 1 ORDER BY id LIMIT 1`);
    const CONS = um<number>(`SELECT id FROM procedimentos WHERE codigo = 'CONS'`);
    assert(convenio && CONS, "base sem convênio ou CONS");

    const DIA = "2098-07-14";
    assert(um<number>(`SELECT COUNT(*) FROM agendamentos WHERE data = ?`, DIA) === 0, "dia de teste já tem dados");
    const agendar = (hora: string, extra: Record<string, unknown> = {}, paciente = pac) =>
      sec("POST", "/agendamentos", {
        paciente_id: paciente, medico_id: med.id, convenio_id: convenio,
        procedimento_ids: [CONS], data: DIA, hora, ignorar_bloqueio: true, ...extra,
      });
    const status = (id: number, novo: string) => sec("PATCH", `/agendamentos/${id}/status`, { status: novo });

    // Ficha de teste (global, consulta)
    const cQueixa = { id: "queixa_principal", label: "Queixa", tipo: "textarea", ordem: 0 };
    const cExtra = { id: "obs_extra_b3", label: "Obs extra B3", tipo: "text", ordem: 1 };
    const F1 = Number(db.prepare(
      `INSERT INTO fichas_template (nome, titulo_documento, modo, campos_json, medico_id, ativo, destino)
       VALUES (?, 'Ficha B3', 'secoes', ?, NULL, 1, 'prontuario')`,
    ).run(`B3 F1 ${sufixo}`, JSON.stringify([cQueixa, cExtra])).lastInsertRowid);

    // ---------------------------------------- [12] + [9] conta do horário
    const h1 = esperar(await agendar("08:00", { ficha_template_id: F1 }), 201, "agendar h1").id;
    esperar(await status(h1, "presente"), 200, "check-in h1");
    const item = db.prepare(
      `SELECT ci.solicitado_em FROM conta_itens ci JOIN contas_atendimento c ON c.id = ci.conta_id
       WHERE c.agendamento_id = ? ORDER BY ci.id LIMIT 1`,
    ).get(h1) as { solicitado_em: string };
    const horaLocal = String(new Date().getHours()).padStart(2, "0");
    assert(
      item.solicitado_em.startsWith(hojeIsoLocal()) && item.solicitado_em.slice(11, 13) === horaLocal,
      `item no horário local: ${item.solicitado_em} (agora ${horaLocal}h)`,
    );
    lancaErro(() => db.prepare(`UPDATE agendamentos SET data = '2098-07-15' WHERE id = ?`).run(h1), "não pode mudar de paciente, médico ou dia", "[9] mudar dia com conta");
    lancaErro(() => db.prepare(`UPDATE agendamentos SET medico_id = ? WHERE id = ?`).run(med2.id, h1), "não pode mudar", "[9] mudar médico com conta");
    const livre = esperar(await agendar("09:00"), 201, "agendar livre").id;
    db.prepare(`UPDATE agendamentos SET data = '2098-07-15' WHERE id = ?`).run(livre);
    assert(um<string>(`SELECT data FROM agendamentos WHERE id = ?`, livre) === "2098-07-15", "[9] horário sem vínculo ainda remarca");

    // ---------------------------------------- [10] modelo em uso
    const pr = esperar(await chamar(cMed, "POST", "/prontuarios/abrir", { agendamento_id: h1 }), 200, "abrir h1").prontuario;
    esperar(await chamar(cMed, "PUT", `/prontuarios/${pr.id}`, {
      dados_json: { queixa_principal: "febre", obs_extra_b3: "dado que não pode sumir" },
    }), 200, "salvar prontuário");
    const r10 = esperar(await chamar(cAdm, "PUT", `/fichas-template/${F1}`, { campos: [cQueixa] }), 409, "[10] remover campo em uso");
    assert(String(r10.error).includes("Obs extra B3"), `mensagem: ${r10.error}`);
    esperar(await chamar(cAdm, "PUT", `/fichas-template/${F1}`, {
      campos: [cQueixa, cExtra, { id: "novo_b3", label: "Novo B3", tipo: "text", ordem: 2 }],
    }), 200, "[10] incluir campo é permitido");

    // ---------------------------------------- [15] retificação única
    esperar(await chamar(cMed, "POST", `/prontuarios/${pr.id}/finalizar`), 200, "finalizar h1");
    esperar(await chamar(cMed, "POST", `/prontuarios/${pr.id}/retificar`, { motivo_retificacao: "corrigir dado" }), 201, "retificar");
    esperar(await chamar(cMed, "POST", `/prontuarios/${pr.id}/retificar`, { motivo_retificacao: "de novo" }), 409, "[15] segunda retificação (API)");
    lancaErro(
      () => db.prepare(
        `INSERT INTO prontuarios (paciente_id, medico_id, retificacao_de_id, motivo_retificacao) VALUES (?, ?, ?, 'sql direto')`,
      ).run(pac, med.id, pr.id),
      "Já existe retificação em andamento",
      "[15] segunda retificação (banco)",
    );
    // Depois do finalizar, o modelo pode perder o campo: finalizados ficam no snapshot.
    esperar(await chamar(cAdm, "PUT", `/fichas-template/${F1}`, { campos: [cQueixa, cExtra] }), 200, "[10] remover campo novo (sem uso)");

    // ---------------------------------------- [11] ficha desativada
    db.prepare(`UPDATE fichas_template SET ativo = 0 WHERE id = ?`).run(F1);
    esperar(await agendar("10:00", { ficha_template_id: F1 }), 400, "[11] agendar com ficha desativada");

    // ---------------------------------------- [13] auditoria do cadastro
    esperar(await sec("PUT", `/pacientes/${pac}`, {
      nome: `PAC B3 RENOMEADO ${sufixo}`, data_nasc: "1980-01-01", telefone: "11999990000",
    }), 200, "editar paciente");
    const log13 = um<string>(`SELECT detalhe FROM log_acesso WHERE acao = 'paciente_alterado' AND paciente_id = ? ORDER BY id DESC LIMIT 1`, pac);
    assert(log13?.includes(`nome: "PAC B3 ${sufixo}" → "PAC B3 RENOMEADO ${sufixo}"`), `[13] log: ${log13}`);

    // ---------------------------------------- [14] WhatsApp telefone compartilhado
    const hoje = hojeIsoLocal();
    const TEL = "(31) 98877-1122";
    const mae = novoPac("MAE B3", TEL);
    const filho = novoPac("FILHO B3", TEL);
    const sozinho = novoPac("SOZINHO B3", "(31) 97766-5544");
    const agMae = esperar(await agendar("11:00", {}, mae), 201, "agendar mãe").id;
    const agFilho = esperar(await agendar("11:30", {}, filho), 201, "agendar filho").id;
    const agSo = esperar(await agendar("12:00", {}, sozinho), 201, "agendar sozinho").id;
    db.prepare(`UPDATE agendamentos SET confirmacao_enviada = 1 WHERE id IN (?, ?, ?)`).run(agMae, agFilho, agSo);
    const amb = registrarRespostaPaciente(TEL, "sim", hoje, db);
    assert(amb.tipo === "outra", `[14] ambíguo não confirma: ${amb.tipo}`);
    for (const id of [agMae, agFilho]) {
      const a = db.prepare(`SELECT confirmacao_respondida, whatsapp_ultima_resposta FROM agendamentos WHERE id = ?`).get(id) as {
        confirmacao_respondida: number; whatsapp_ultima_resposta: string;
      };
      assert(a.confirmacao_respondida === 0, `[14] ${id} não confirmado sozinho`);
      assert(a.whatsapp_ultima_resposta?.includes("confirme manualmente"), `[14] ${id} avisa a recepção`);
    }
    const ok = registrarRespostaPaciente("(31) 97766-5544", "sim", hoje, db);
    assert(ok.tipo === "confirmou", `[14] telefone único confirma: ${ok.tipo}`);

    assert(db.prepare(`PRAGMA foreign_key_check`).all().length === 0, "foreign_key_check");
    assert(um<string>(`PRAGMA integrity_check`) === "ok", "integrity_check");

    console.log("B3 OK — gatilho do horário, modelo em uso, ficha desativada, datas locais, auditoria do paciente, WhatsApp compartilhado, retificação única.");
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
