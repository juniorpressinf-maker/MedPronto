/**
 * Aceite CAT1 — busca automática de medicamentos/exames e memória de prescrição,
 * testado PELAS ROTAS HTTP numa CÓPIA de data/medpronto.db (o banco real não é tocado).
 *   1. Catálogo oficial carregado; busca sem depender de acento.
 *   2. Salvamento automático não registra nome digitado pela metade.
 *   3. Nome novo digitado vira sugestão ("aprende sozinho"); uso conta 1x por prontuário.
 *   4. Memória: médico A recupera dose/posologia; médico B não vê; ocultar funciona.
 *   5. Pedido de exames idem; cadastro desativa sugestão.
 *   6. Receita gravada continua intacta (é texto, não vínculo).
 */
import type { AddressInfo } from "node:net";
import { assert, prepararBancoCopia, removerBancoCopia } from "./lib/bancoCopia.js";

type Resp = { status: number; json: any };

async function main(): Promise<void> {
  const copia = await prepararBancoCopia("cat1");
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
    const { garantirCatalogosIniciais, registrarUsoEncerradosPendentes } = await import("../src/services/catalogoNomes.js");

    runMigrations();
    const db = getDb();
    garantirCatalogosIniciais(db);
    const um = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).pluck().get(...p) as T;

    // 1. catálogo oficial
    const nMed = um<number>(`SELECT COUNT(*) FROM catalogo_itens WHERE tipo='medicamento' AND origem='oficial'`);
    const nEx = um<number>(`SELECT COUNT(*) FROM catalogo_itens WHERE tipo='exame' AND origem='oficial'`);
    assert(nMed > 5000 && nEx > 1000, `catálogo oficial carregado (med ${nMed}, exames ${nEx})`);
    garantirCatalogosIniciais(db);
    assert(
      um<number>(`SELECT COUNT(*) FROM catalogo_itens WHERE tipo='medicamento' AND origem='oficial'`) === nMed,
      "carga inicial não duplica",
    );

    // consultas já finalizadas entram no índice de uso (backfill do boot)
    registrarUsoEncerradosPendentes(db);
    const pendentes = um<number>(
      `SELECT COUNT(*) FROM prontuarios p LEFT JOIN agendamentos a ON a.id = p.agendamento_id
       WHERE a.status = 'finalizado'
         AND EXISTS (SELECT 1 FROM receita_itens ri JOIN receitas r ON r.id = ri.receita_id WHERE r.prontuario_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM catalogo_uso cu WHERE cu.prontuario_id = p.id)`,
    );
    assert(pendentes === 0, `finalizadas com receita sem uso registrado: ${pendentes}`);
    console.log(`Usos registrados das consultas finalizadas: ${um<number>(`SELECT COUNT(*) FROM catalogo_uso`)}`);

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

    const sufixo = Date.now().toString(36);
    const SENHA = "Teste#CAT1-catalogo";
    createUser(`c1sec_${sufixo}`, SENHA, "secretaria", "SEC TESTE CAT1");
    createUser(`c1adm_${sufixo}`, SENHA, "admin", "ADM TESTE CAT1");
    const med1 = createUser(`c1med1_${sufixo}`, SENHA, "medico", "DR CAT1 UM");
    const med2 = createUser(`c1med2_${sufixo}`, SENHA, "medico", "DR CAT1 DOIS");
    async function login(usuario: string): Promise<string> {
      const r = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: usuario, senha: SENHA }),
      });
      assert(r.status === 200, `login ${usuario}: HTTP ${r.status}`);
      return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    }
    const cSec = await login(`c1sec_${sufixo}`);
    const cAdm = await login(`c1adm_${sufixo}`);
    const cMed1 = await login(`c1med1_${sufixo}`);
    const cMed2 = await login(`c1med2_${sufixo}`);

    const pac = Number(
      db.prepare(`INSERT INTO pacientes (nome, telefone, data_nasc) VALUES (?, '11999990000', '1980-01-01')`)
        .run(`PAC CAT1 ${sufixo}`).lastInsertRowid,
    );
    const convenio = um<number>(`SELECT id FROM convenios WHERE ativo = 1 ORDER BY id LIMIT 1`);
    const CONS = um<number>(`SELECT id FROM procedimentos WHERE codigo = 'CONS'`);
    assert(convenio && CONS, "base sem convênio ou procedimento CONS");
    const DIA = "2098-06-15";
    assert(um<number>(`SELECT COUNT(*) FROM agendamentos WHERE data = ?`, DIA) === 0, "dia de teste já tem dados");

    /** Agenda, faz check-in e abre o prontuário pelo médico. */
    async function prontuario(medicoId: number, cookieMed: string, hora: string): Promise<number> {
      const ag = esperar(await chamar(cSec, "POST", "/agendamentos", {
        paciente_id: pac, medico_id: medicoId, convenio_id: convenio,
        procedimento_ids: [CONS], data: DIA, hora, ignorar_bloqueio: true,
        confirmar_dia_especial: true, // DIA é domingo
      }), 201, `agendar ${hora}`).id;
      esperar(await chamar(cSec, "PATCH", `/agendamentos/${ag}/status`, { status: "presente" }), 200, `check-in ${hora}`);
      return esperar(await chamar(cookieMed, "POST", "/prontuarios/abrir", { agendamento_id: ag }), 200, `abrir ${hora}`)
        .prontuario.id;
    }
    const pr1 = await prontuario(med1.id, cMed1, "08:00");
    const pr2 = await prontuario(med1.id, cMed1, "08:30");
    const pr3 = await prontuario(med2.id, cMed2, "09:00");

    const sugMed = async (cookie: string, pr: number, q: string) =>
      esperar(await chamar(cookie, "GET", `/prontuarios/${pr}/receita/sugestoes?q=${encodeURIComponent(q)}`), 200, `sugestões ${q}`)
        .itens as { nome: string; usos: number }[];

    // busca sem acento / várias palavras
    const s1 = await sugMed(cMed1, pr1, "dipirona");
    assert(s1.some((i) => i.nome === "DIPIRONA"), `"dipirona" acha DIPIRONA: ${s1.map((i) => i.nome).slice(0, 5)}`);
    const s2 = await sugMed(cMed1, pr1, "acido acetilsalicilico");
    assert(s2.some((i) => i.nome.normalize("NFD").replace(/\p{M}/gu, "").startsWith("ACIDO ACETILSALICILICO")), "busca sem acento");
    const s2b = await sugMed(cMed1, pr1, "ácido acetilsalicílico");
    assert(s2b.length > 0 && s2b[0].nome === s2[0].nome, "com ou sem acento dá o mesmo resultado");
    assert((await sugMed(cMed1, pr1, "d")).length === 0, "1 letra não busca");
    esperar(await chamar(cMed2, "GET", `/prontuarios/${pr1}/receita/sugestoes?q=dip`), 403, "médico 2 no prontuário do médico 1");

    // 2. salvamento automático com nome pela metade, depois completo
    const NOVO = `XAROPE TESTE ${sufixo.toUpperCase()}`;
    esperar(await chamar(cMed1, "PUT", `/prontuarios/${pr1}/receita`, { itens: [{ medicamento: "DIPI" }] }), 200, "autosave parcial");
    const itensPr1 = [
      { medicamento: "DIPIRONA", dosagem: "500 MG", via: "ORAL", posologia: "1 CP DE 6/6H SE DOR", quantidade: "1 CX", duracao_dias: 3 },
      { medicamento: NOVO, posologia: "10 ML 8/8H" },
    ];
    esperar(await chamar(cMed1, "PUT", `/prontuarios/${pr1}/receita`, { itens: itensPr1 }), 200, "receita pr1");
    esperar(await chamar(cMed1, "PUT", `/prontuarios/${pr1}/receita`, { itens: itensPr1 }), 200, "receita pr1 (de novo)");
    assert(
      um<number>(`SELECT COUNT(*) FROM catalogo_uso WHERE prontuario_id = ? AND nome_busca = 'dipi'`, pr1) === 0,
      "nome pela metade não fica registrado",
    );

    // 3. só aprende o que foi EMITIDO (PDF / finalizar), não o salvamento automático
    assert(!(await sugMed(cMed1, pr2, `xarope teste ${sufixo}`)).some((i) => i.nome === NOVO), "salvo sem imprimir não vira sugestão");
    const pdf1 = await fetch(`${base}/prontuarios/${pr1}/receita/pdf`, { headers: { cookie: cMed1 } });
    assert(pdf1.status === 200, `PDF receita: ${pdf1.status}`);
    await pdf1.arrayBuffer();
    const s3 = await sugMed(cMed1, pr2, `xarope teste ${sufixo}`);
    assert(s3.some((i) => i.nome === NOVO && i.usos === 1), `nome novo vira sugestão com 1 uso: ${JSON.stringify(s3)}`);
    const s4 = await sugMed(cMed1, pr2, "dipirona");
    assert(s4[0]?.nome === "DIPIRONA", `mais usado pelo médico vem primeiro: ${s4[0]?.nome}`);

    // 4. memória de prescrição
    const mem = async (cookie: string, pr: number, nome: string) =>
      esperar(await chamar(cookie, "GET", `/prontuarios/${pr}/receita/memoria?nome=${encodeURIComponent(nome)}`), 200, `memória ${nome}`)
        .variacoes as { assinatura: string; posologia: string; dosagem: string; duracao_dias: number }[];
    const m1 = await mem(cMed1, pr2, "dipirona");
    assert(m1.length === 1 && m1[0].posologia === "1 CP DE 6/6H SE DOR" && m1[0].dosagem === "500 MG" && m1[0].duracao_dias === 3,
      `médico 1 recupera a forma: ${JSON.stringify(m1)}`);
    assert((await mem(cMed1, pr1, "DIPIRONA")).length === 1, "a própria receita já alimenta a memória (2ª linha do mesmo remédio)");
    assert((await mem(cMed2, pr3, "DIPIRONA")).length === 0, "médico 2 não vê memória do médico 1");

    // segunda forma no pr2 → duas variações
    esperar(await chamar(cMed1, "PUT", `/prontuarios/${pr2}/receita`, {
      itens: [{ medicamento: "Dipirona", dosagem: "1 G", via: "ORAL", posologia: "1 CP 8/8H", duracao_dias: 5 }],
    }), 200, "receita pr2");
    assert((await mem(cMed1, pr1, "dipirona")).length === 1, "receita só salva (sem imprimir) não entra na memória");
    const pdfPr2 = await fetch(`${base}/prontuarios/${pr2}/receita/pdf`, { headers: { cookie: cMed1 } });
    assert(pdfPr2.status === 200, `PDF receita pr2: ${pdfPr2.status}`);
    await pdfPr2.arrayBuffer();
    const m2 = await mem(cMed1, pr1, "dipirona"); // as duas formas (pr1 e pr2)
    const f8 = m2.find((v) => v.posologia === "1 CP 8/8H");
    assert(m2.length === 2 && !!f8, `duas formas lembradas: ${JSON.stringify(m2)}`);
    esperar(await chamar(cMed1, "POST", `/prontuarios/${pr1}/receita/memoria/ocultar`, {
      nome: "DIPIRONA", assinatura: f8!.assinatura,
    }), 200, "ocultar variação");
    const m3 = await mem(cMed1, pr1, "dipirona");
    assert(m3.length === 1 && m3[0].posologia === "1 CP DE 6/6H SE DOR", "variação oculta some");

    // 5. pedido de exames
    const EXN = `EXAME TESTE ${sufixo.toUpperCase()}`;
    esperar(await chamar(cMed1, "PUT", `/prontuarios/${pr1}/pedido-exame`, {
      exames_solicitados: `HEMOGRAMA COMPLETO\n${EXN}\n`,
    }), 200, "pedido pr1");
    const pdf2 = await fetch(`${base}/prontuarios/${pr1}/pedido-exame/pdf`, { headers: { cookie: cMed1 } });
    assert(pdf2.status === 200, `PDF pedido: ${pdf2.status}`);
    await pdf2.arrayBuffer();
    const sugEx = async (q: string) =>
      esperar(await chamar(cMed1, "GET", `/prontuarios/${pr2}/pedido-exame/sugestoes?q=${encodeURIComponent(q)}`), 200, `sug exame ${q}`)
        .itens as { nome: string; usos: number }[];
    assert((await sugEx("hemog"))[0]?.nome === "HEMOGRAMA COMPLETO", "exame usado vem primeiro");
    assert((await sugEx("glicose")).some((i) => i.nome === "GLICOSE"), "TUSS sem sufixo");
    assert((await sugEx(`exame teste ${sufixo}`)).some((i) => i.nome === EXN), "exame novo vira sugestão");

    // cadastro: secretaria sem permissão; admin desativa o exame novo
    esperar(await chamar(cSec, "GET", `/catalogo/exame?q=hemo`), 403, "secretaria no cadastro");
    const lista = esperar(await chamar(cMed1, "GET", `/catalogo/exame?q=${encodeURIComponent(`exame teste ${sufixo}`)}`), 200, "cadastro lista");
    assert(lista.itens.some((i: any) => i.nome === EXN && i.origem === "uso"), "cadastro mostra nome só usado");
    esperar(await chamar(cAdm, "POST", `/catalogo/exame`, { nome: EXN, ativo: false }), 201, "desativar exame novo");
    assert(!(await sugEx(`exame teste ${sufixo}`)).some((i) => i.nome === EXN), "desativado não é sugerido");
    const dip = db.prepare(`SELECT id FROM catalogo_itens WHERE tipo='medicamento' AND nome='DIPIRONA'`).get() as { id: number };
    esperar(await chamar(cAdm, "PATCH", `/catalogo/medicamento/${dip.id}`, { nome: "amoxicilina" }), 409, "renomear para nome existente");

    // 6. receita gravada intacta
    const rec = esperar(await chamar(cMed1, "GET", `/prontuarios/${pr1}/receita`), 200, "ler receita pr1");
    assert(rec.itens.length === 2 && rec.itens[0].medicamento === "DIPIRONA" && rec.itens[1].medicamento === NOVO,
      "receita continua como foi gravada");

    console.log("OK — CAT1 catálogo + memória de prescrição");
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
