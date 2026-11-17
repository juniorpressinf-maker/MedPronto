// Projeto Agenda Nova — A0: conferência da agenda (SOMENTE LEITURA).
//
// Tira uma "fotografia" dos agendamentos e dos vínculos que dependem deles
// (contagens + impressão digital SHA-256). Rodar antes e depois de cada etapa
// do projeto: os números têm de bater.
//
// Uso (a partir de d:\MedPronto, com o Node portátil no PATH):
//   node scripts/conferir-agenda.mjs                         -> grava snapshot
//   node scripts/conferir-agenda.mjs --rotulo antes-a1       -> idem, com rótulo no nome
//   node scripts/conferir-agenda.mjs --comparar <snap.json>  -> compara banco atual x snapshot
//   node scripts/conferir-agenda.mjs --db <arquivo.db>       -> outro banco (ex.: cópia do cliente)
//
// Saída: data/conferencia-agenda/agenda-AAAAMMDD-HHMMSS[-rotulo].json
// Código de saída: 0 = ok/igual, 1 = diferença encontrada, 2 = erro.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const VERSAO_FORMATO = 1;
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Colunas de `agendamentos` que nenhuma etapa do projeto pode alterar.
// `updated_at` fica de fora de propósito; colunas novas (ex.: agendamento_tipo_id) também.
const COLUNAS_AGENDAMENTO = [
  "id",
  "paciente_id",
  "medico_id",
  "data",
  "hora",
  "duracao_minutos",
  "status",
  "observacao_agenda",
  "confirmacao_enviada",
  "confirmacao_respondida",
  "eh_retorno",
  "eh_encaixe",
  "tipo_atendimento",
  "convenio_id",
  "procedimento_id",
  "ficha_template_id",
  "aso_template_id",
  "created_at",
];

// Tabelas que apontam para agendamentos: os vínculos têm de continuar idênticos.
const VINCULOS = [
  { tabela: "agendamento_procedimentos", colunas: ["agendamento_id", "procedimento_id"] },
  { tabela: "contas_atendimento", colunas: ["id", "agendamento_id"] },
  { tabela: "prontuarios", colunas: ["id", "agendamento_id"] },
  { tabela: "admissionais", colunas: ["id", "agendamento_id"] },
];

function lerArgs(argv) {
  const args = { db: null, rotulo: null, comparar: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`Faltou o valor de ${a}`);
      return v;
    };
    if (a === "--db") args.db = valor();
    else if (a === "--rotulo") args.rotulo = valor();
    else if (a === "--comparar") args.comparar = valor();
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  if (args.rotulo && !/^[\w.-]{1,40}$/.test(args.rotulo)) {
    throw new Error("Rótulo inválido (use letras, números, ponto, hífen ou _; até 40)");
  }
  return args;
}

function caminhoBanco(arg) {
  const p = arg ?? process.env.DATABASE_PATH ?? path.join("data", "medpronto.db");
  return path.isAbsolute(p) ? p : path.join(raiz, p);
}

function colunasDe(db, tabela) {
  return db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
}

function existeTabela(db, tabela) {
  return !!db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tabela);
}

/** Hash estável das linhas (ordem fixa, NULL distinto de string vazia). */
function impressaoDigital(db, tabela, colunas, ordem) {
  const hash = createHash("sha256");
  let linhas = 0;
  const sql = `SELECT ${colunas.join(", ")} FROM ${tabela} ORDER BY ${ordem}`;
  for (const linha of db.prepare(sql).raw().iterate()) {
    hash.update(JSON.stringify(linha));
    hash.update("\n");
    linhas++;
  }
  return { linhas, sha256: hash.digest("hex") };
}

function agruparContagem(db, sql) {
  const out = {};
  for (const { chave, n } of db.prepare(sql).all()) out[String(chave)] = n;
  return out;
}

function tirarSnapshot(db, arquivoDb) {
  const colAg = colunasDe(db, "agendamentos");
  const usadas = COLUNAS_AGENDAMENTO.filter((c) => colAg.includes(c));
  const ausentes = COLUNAS_AGENDAMENTO.filter((c) => !colAg.includes(c));
  const tem = (c) => colAg.includes(c);

  const agendamentos = {
    total: db.prepare(`SELECT COUNT(*) AS n FROM agendamentos`).get().n,
    periodo: db.prepare(`SELECT MIN(data) AS de, MAX(data) AS ate FROM agendamentos`).get(),
    porStatus: agruparContagem(
      db,
      `SELECT status AS chave, COUNT(*) AS n FROM agendamentos GROUP BY status ORDER BY status`,
    ),
    porMes: agruparContagem(
      db,
      `SELECT substr(data, 1, 7) AS chave, COUNT(*) AS n FROM agendamentos GROUP BY chave ORDER BY chave`,
    ),
    porMedico: agruparContagem(
      db,
      `SELECT a.medico_id || ' ' || COALESCE(u.nome, '(sem usuário)') AS chave, COUNT(*) AS n
         FROM agendamentos a LEFT JOIN usuarios u ON u.id = a.medico_id
        GROUP BY a.medico_id ORDER BY a.medico_id`,
    ),
    porTipoAtendimento: tem("tipo_atendimento")
      ? agruparContagem(
          db,
          `SELECT tipo_atendimento AS chave, COUNT(*) AS n FROM agendamentos GROUP BY chave ORDER BY chave`,
        )
      : null,
    retornos: tem("eh_retorno")
      ? db.prepare(`SELECT COUNT(*) AS n FROM agendamentos WHERE eh_retorno = 1`).get().n
      : null,
    encaixes: tem("eh_encaixe")
      ? db.prepare(`SELECT COUNT(*) AS n FROM agendamentos WHERE eh_encaixe = 1`).get().n
      : null,
    porDuracao: agruparContagem(
      db,
      `SELECT duracao_minutos AS chave, COUNT(*) AS n FROM agendamentos GROUP BY chave ORDER BY chave`,
    ),
    impressao: { colunas: usadas, ausentes, ...impressaoDigital(db, "agendamentos", usadas, "id") },
  };

  const vinculos = {};
  for (const v of VINCULOS) {
    if (!existeTabela(db, v.tabela)) {
      vinculos[v.tabela] = null;
      continue;
    }
    const filtro = `${v.tabela} WHERE agendamento_id IS NOT NULL`;
    vinculos[v.tabela] = {
      comAgendamento: db.prepare(`SELECT COUNT(*) AS n FROM ${filtro}`).get().n,
      ...impressaoDigital(db, `(SELECT * FROM ${filtro})`, v.colunas, v.colunas.join(", ")),
    };
  }

  const integridade = {
    semPaciente: db
      .prepare(
        `SELECT COUNT(*) AS n FROM agendamentos a
          WHERE NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.id = a.paciente_id)`,
      )
      .get().n,
    semMedico: db
      .prepare(
        `SELECT COUNT(*) AS n FROM agendamentos a
          WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = a.medico_id)`,
      )
      .get().n,
    quickCheck: db.prepare(`PRAGMA quick_check`).pluck().all().join("; "),
  };

  const ultimaMigracao = existeTabela(db, "schema_migrations")
    ? (db.prepare(`SELECT name FROM schema_migrations ORDER BY id DESC LIMIT 1`).pluck().get() ??
      null)
    : null;

  return {
    formato: VERSAO_FORMATO,
    meta: {
      geradoEm: new Date().toISOString(),
      banco: arquivoDb,
      ultimaMigracao,
      bloqueiosExistentes: existeTabela(db, "agenda_bloqueios")
        ? db.prepare(`SELECT COUNT(*) FROM agenda_bloqueios`).pluck().get()
        : null,
    },
    agendamentos,
    vinculos,
    integridade,
  };
}

/** Lista as diferenças entre dois valores (ignora `meta`). */
function diferencas(a, b, caminho = "", out = []) {
  if (caminho === "meta") return out;
  const objeto = (x) => x !== null && typeof x === "object";
  if (objeto(a) && objeto(b) && Array.isArray(a) === Array.isArray(b)) {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of chaves) diferencas(a[k], b[k], caminho ? `${caminho}.${k}` : k, out);
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ caminho, antes: a, depois: b });
  }
  return out;
}

function carimbo(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function resumo(s) {
  const a = s.agendamentos;
  console.log(`Banco: ${s.meta.banco}`);
  console.log(`Última migração: ${s.meta.ultimaMigracao ?? "-"}`);
  console.log(`Agendamentos: ${a.total} (${a.periodo.de ?? "-"} a ${a.periodo.ate ?? "-"})`);
  console.log(`  por status: ${JSON.stringify(a.porStatus)}`);
  console.log(`  médicos: ${Object.keys(a.porMedico).length} | meses: ${Object.keys(a.porMes).length}`);
  console.log(`  impressão: ${a.impressao.sha256.slice(0, 16)}…`);
  if (a.impressao.ausentes.length) {
    console.log(`  colunas ausentes neste banco: ${a.impressao.ausentes.join(", ")}`);
  }
  for (const [t, v] of Object.entries(s.vinculos)) {
    console.log(`  ${t}: ${v ? `${v.comAgendamento} vínculo(s)` : "tabela inexistente"}`);
  }
  const i = s.integridade;
  console.log(
    `Integridade: sem paciente=${i.semPaciente}, sem médico=${i.semMedico}, quick_check=${i.quickCheck}`,
  );
}

function main() {
  const args = lerArgs(process.argv.slice(2));
  const arquivoDb = caminhoBanco(args.db);
  if (!existsSync(arquivoDb)) throw new Error(`Banco não encontrado: ${arquivoDb}`);

  const db = new Database(arquivoDb, { readonly: true, fileMustExist: true });
  let atual;
  try {
    // Uma transação de leitura garante que todas as contagens vêm do mesmo instante.
    atual = db.transaction(() => tirarSnapshot(db, arquivoDb))();
  } finally {
    db.close();
  }

  resumo(atual);

  if (args.comparar) {
    const anterior = JSON.parse(readFileSync(path.resolve(args.comparar), "utf8"));
    if (anterior.formato !== VERSAO_FORMATO) {
      throw new Error(`Snapshot em formato ${anterior.formato}; esperado ${VERSAO_FORMATO}`);
    }
    const difs = diferencas(anterior, atual);
    console.log("");
    if (difs.length === 0) {
      console.log(`OK — banco idêntico ao snapshot ${path.basename(args.comparar)}.`);
      return 0;
    }
    console.log(`DIFERENÇAS (${difs.length}) em relação a ${path.basename(args.comparar)}:`);
    for (const d of difs) {
      console.log(`  ${d.caminho}: ${JSON.stringify(d.antes)} -> ${JSON.stringify(d.depois)}`);
    }
    return 1;
  }

  const pasta = path.join(raiz, "data", "conferencia-agenda");
  mkdirSync(pasta, { recursive: true });
  const nome = `agenda-${carimbo()}${args.rotulo ? `-${args.rotulo}` : ""}.json`;
  const destino = path.join(pasta, nome);
  writeFileSync(destino, JSON.stringify(atual, null, 2) + "\n", "utf8");
  console.log(`\nSnapshot gravado: ${destino}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error("[conferir-agenda] ERRO:", err instanceof Error ? err.message : err);
  process.exitCode = 2;
}
