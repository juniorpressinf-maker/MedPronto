/**
 * Aceite A1 — Projeto Agenda Nova (database/046_agenda_tipos_grade.sql).
 *
 * Roda numa CÓPIA de data/medpronto.db (nunca no banco real):
 *   1. copia o banco (API de backup do SQLite, segura com WAL);
 *   2. tira a conferência "antes" (scripts/conferir-agenda.mjs);
 *   3. aplica as migrações pendentes na cópia;
 *   4. confere backfill, cores, legado e os triggers novos (dentro de SAVEPOINT desfeito);
 *   5. compara com a conferência "antes": agendamentos e vínculos têm de estar idênticos.
 */
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assert, assertThrows, prepararBancoCopia, removerBancoCopia } from "./lib/bancoCopia.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, "../..");
const conferir = path.join(raiz, "scripts", "conferir-agenda.mjs");
const MIGRACAO = "046_agenda_tipos_grade.sql";

const PALETA = [
  "#1A4D7A", "#7A1A4D", "#2D6A2D", "#8B4513", "#5C2D91",
  "#C45C00", "#006D6D", "#8B1A1A", "#4A4A8B", "#6B4423",
];

function rodarConferir(args: string[]): { status: number; saida: string } {
  const r = spawnSync(process.execPath, [conferir, ...args], { encoding: "utf8" });
  return { status: r.status ?? 2, saida: `${r.stdout}${r.stderr}` };
}

async function main(): Promise<void> {
  // 1. Cópia (DATABASE_PATH passa a apontar para ela)
  const copia = await prepararBancoCopia("a1");
  console.log(`Cópia de teste: ${copia}`);

  let fechar: (() => void) | undefined;
  try {
    const pre = new Database(copia, { readonly: true });
    const jaAplicada = !!pre
      .prepare(`SELECT 1 FROM schema_migrations WHERE name = ?`)
      .get(MIGRACAO);
    const legadoAntes = jaAplicada
      ? null
      : (pre.prepare(`SELECT COUNT(*) FROM agenda_bloqueios`).pluck().get() as number);
    pre.close();

    // 2. Conferência antes
    const snap = path.join(os.tmpdir(), `conferir-a1-${process.pid}.json`);
    const antes = rodarConferir(["--db", copia, "--rotulo", "teste-a1-antes"]);
    assert(antes.status === 0, `conferir (antes) falhou:\n${antes.saida}`);
    const gravado = /Snapshot gravado: (.+\.json)/.exec(antes.saida)?.[1]?.trim();
    assert(gravado, "conferir não informou o arquivo do snapshot");
    fs.copyFileSync(gravado, snap); // rename falha entre discos (D: -> %TEMP%)
    fs.rmSync(gravado, { force: true });

    // 3. Migração na cópia (DATABASE_PATH antes de importar config/db)
    const { runMigrations } = await import("../src/db/migrate.js");
    const { getDb, closeDb } = await import("../src/db/index.js");
    fechar = closeDb;
    const aplicadas = runMigrations();
    if (jaAplicada) {
      console.log(`(${MIGRACAO} já estava aplicada no banco real — pulando checagem de backfill)`);
    } else {
      assert(aplicadas.includes(MIGRACAO), `${MIGRACAO} não foi aplicada: ${aplicadas.join(", ")}`);
    }
    const db = getDb();
    const um = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).pluck().get(...p) as T;

    // 4a. Tipos do sistema
    const codigos = db
      .prepare(`SELECT codigo FROM agendamento_tipos WHERE codigo IS NOT NULL ORDER BY ordem`)
      .pluck()
      .all();
    assert(
      JSON.stringify(codigos) ===
        JSON.stringify(["CONSULTA", "PRIMEIRA", "RETORNO", "ENCAIXE", "EXAME", "ADMISSIONAL"]),
      `tipos do sistema: ${codigos.join(",")}`,
    );

    // 4b. Backfill: todo agendamento tem tipo e o tipo bate com a inferência
    assert(
      um<number>(`SELECT COUNT(*) FROM agendamentos WHERE agendamento_tipo_id IS NULL`) === 0,
      "agendamento sem tipo após backfill",
    );
    if (!jaAplicada) {
      const divergentes = um<number>(`
        SELECT COUNT(*) FROM agendamentos a
        JOIN agendamento_tipos t ON t.id = a.agendamento_tipo_id
        LEFT JOIN agendamento_tipo_inferencia i
          ON i.tipo_atendimento = a.tipo_atendimento
         AND i.eh_retorno = a.eh_retorno
         AND i.eh_encaixe = a.eh_encaixe
        WHERE t.codigo IS NOT COALESCE(i.codigo, 'CONSULTA')`);
      assert(divergentes === 0, `${divergentes} agendamento(s) com tipo diferente da inferência`);
    }

    // 4c. Configuração de agenda de todos os médicos, com a cor da paleta antiga
    const medicos = db
      .prepare(
        `SELECT u.id, m.cor, m.modo FROM usuarios u
         LEFT JOIN medico_agenda m ON m.medico_id = u.id WHERE u.perfil = 'medico'`,
      )
      .all() as { id: number; cor: string | null; modo: string | null }[];
    for (const m of medicos) {
      assert(m.cor, `médico ${m.id} sem medico_agenda`);
      if (!jaAplicada) {
        // Coluna cor da 046 ficou sem uso (cor é do tipo — decisão 13/11); só o formato.
        assert(/^#[0-9A-F]{6}$/i.test(m.cor), `médico ${m.id}: cor ${m.cor}`);
        assert(m.modo === "chegada", `médico ${m.id}: modo ${m.modo}`);
      }
    }

    // 4d. Bloqueios antigos preservados
    if (legadoAntes !== null) {
      assert(
        um<number>(`SELECT COUNT(*) FROM agenda_bloqueios_legado_001`) === legadoAntes,
        "linhas da agenda_bloqueios antiga não foram preservadas",
      );
    }

    // 4e. Triggers — tudo dentro de um SAVEPOINT desfeito no fim
    const paciente = um<number>(`SELECT id FROM pacientes ORDER BY id LIMIT 1`);
    const medico = um<number>(
      `SELECT id FROM usuarios WHERE perfil = 'medico' AND ativo = 1 ORDER BY id LIMIT 1`,
    );
    const convenio = um<number>(`SELECT id FROM convenios WHERE ativo = 1 ORDER BY id LIMIT 1`);
    const procCons = um<number>(`SELECT id FROM procedimentos WHERE codigo = 'CONS'`);
    assert(paciente && medico && convenio && procCons, "base sem paciente/médico/convênio/CONS");
    const tipo = (codigo: string) =>
      um<number>(`SELECT id FROM agendamento_tipos WHERE codigo = ?`, codigo);
    const tipoDe = (id: number | bigint) =>
      um<string>(
        `SELECT t.codigo FROM agendamentos a JOIN agendamento_tipos t ON t.id = a.agendamento_tipo_id
         WHERE a.id = ?`,
        id,
      );

    db.exec("SAVEPOINT teste_a1");
    try {
      // Inserção "da tela antiga" (sem tipo) ganha o tipo inferido
      const ins = db.prepare(
        `INSERT INTO agendamentos
           (paciente_id, medico_id, data, hora, convenio_id, procedimento_id, tipo_atendimento, eh_retorno, eh_encaixe)
         VALUES (?, ?, '2099-12-31', ?, ?, ?, 'consulta', ?, ?)`,
      );
      const a1 = ins.run(paciente, medico, "07:00", convenio, procCons, 0, 0).lastInsertRowid;
      assert(tipoDe(a1) === "CONSULTA", `inserção sem tipo: ${tipoDe(a1)}`);
      const a2 = ins.run(paciente, medico, "07:30", convenio, procCons, 0, 1).lastInsertRowid;
      assert(tipoDe(a2) === "ENCAIXE", `encaixe sem tipo: ${tipoDe(a2)}`);

      // Tela antiga marca retorno -> re-infere
      db.prepare(`UPDATE agendamentos SET eh_retorno = 1 WHERE id = ?`).run(a1);
      assert(tipoDe(a1) === "RETORNO", `após eh_retorno=1: ${tipoDe(a1)}`);

      // Tela nova grava tipo + colunas coerentes -> não é sobrescrito
      db.prepare(
        `UPDATE agendamentos SET agendamento_tipo_id = ?, eh_retorno = 0 WHERE id = ?`,
      ).run(tipo("PRIMEIRA"), a1);
      assert(tipoDe(a1) === "PRIMEIRA", `tipo coerente foi sobrescrito: ${tipoDe(a1)}`);

      // Tipo inativo / inexistente
      const custom = db
        .prepare(
          `INSERT INTO agendamento_tipos (nome, cor, duracao_minutos, ativo) VALUES ('Teste A1', '#123456', 20, 0)`,
        )
        .run().lastInsertRowid;
      assertThrows(
        () => db.prepare(`UPDATE agendamentos SET agendamento_tipo_id = ? WHERE id = ?`).run(custom, a1),
        "inexistente ou inativo",
      );
      assertThrows(
        () => db.prepare(`UPDATE agendamentos SET agendamento_tipo_id = 999999 WHERE id = ?`).run(a1),
        "inexistente ou inativo",
      );

      // Tipo personalizado em uso não pode ser excluído
      db.prepare(`UPDATE agendamento_tipos SET ativo = 1 WHERE id = ?`).run(custom);
      db.prepare(`UPDATE agendamentos SET agendamento_tipo_id = ? WHERE id = ?`).run(custom, a2);
      assertThrows(
        () => db.prepare(`DELETE FROM agendamento_tipos WHERE id = ?`).run(custom),
        "em uso",
      );

      // Tipos do sistema protegidos
      assertThrows(
        () => db.prepare(`DELETE FROM agendamento_tipos WHERE codigo = 'RETORNO'`).run(),
        "não pode ser excluído",
      );
      assertThrows(
        () => db.prepare(`UPDATE agendamento_tipos SET ativo = 0 WHERE codigo = 'CONSULTA'`).run(),
        "do sistema",
      );
      assertThrows(
        () => db.prepare(`UPDATE agendamento_tipos SET eh_retorno = 0 WHERE codigo = 'RETORNO'`).run(),
        "do sistema",
      );
      db.prepare(`UPDATE agendamento_tipos SET nome = 'Consulta padrão', cor = '#000000' WHERE codigo = 'CONSULTA'`).run();
      assertThrows(
        () =>
          db.prepare(`INSERT INTO agendamento_tipos (codigo, nome, cor) VALUES ('X', 'X', '#000000')`).run(),
        "código de sistema",
      );
      assertThrows(
        () => db.prepare(`INSERT INTO agendamento_tipos (nome, cor) VALUES ('Cor ruim', 'azul')`).run(),
        "CHECK",
      );

      // Médico novo nasce com configuração; expediente sem sobreposição
      const novo = db
        .prepare(
          `INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES ('DR TESTE A1', ?, 'x', 'medico')`,
        )
        .run(`teste_a1_${Date.now()}`).lastInsertRowid;
      assert(
        um<number>(`SELECT COUNT(*) FROM medico_agenda WHERE medico_id = ?`, novo) === 1,
        "médico novo sem medico_agenda",
      );
      const exp = db.prepare(
        `INSERT INTO medico_expediente (medico_id, dia_semana, inicio, fim) VALUES (?, ?, ?, ?)`,
      );
      exp.run(novo, 1, "08:00", "12:00");
      exp.run(novo, 1, "12:00", "18:00"); // encostado: permitido
      exp.run(novo, 2, "08:00", "12:00");
      assertThrows(() => exp.run(novo, 1, "11:00", "13:00"), "sobreposto");
      assertThrows(() => exp.run(novo, 3, "14:00", "13:00"), "CHECK");
      assertThrows(() => exp.run(novo, 7, "08:00", "09:00"), "CHECK");
      assertThrows(
        () => exp.run(um<number>(`SELECT id FROM usuarios WHERE perfil <> 'medico' LIMIT 1`), 1, "08:00", "09:00"),
        "FOREIGN KEY",
      );
      assertThrows(
        () =>
          db.prepare(
            `INSERT INTO medico_agenda (medico_id, cor) VALUES ((SELECT id FROM usuarios WHERE perfil <> 'medico' LIMIT 1), '#000000')`,
          ).run(),
        "só para usuário médico",
      );

      // Bloqueios
      const bloq = db.prepare(
        `INSERT INTO agenda_bloqueios (medico_id, data_inicio, data_fim, hora_inicio, hora_fim, motivo)
         VALUES (?, ?, ?, ?, ?, 'teste')`,
      );
      bloq.run(novo, "2099-12-01", "2099-12-15", "00:00", "24:00");
      bloq.run(null, "2099-12-24", "2099-12-24", "12:00", "18:00"); // clínica toda
      assertThrows(() => bloq.run(novo, "2099-02-31", "2099-03-01", "08:00", "09:00"), "CHECK");
      assertThrows(() => bloq.run(novo, "2099-12-10", "2099-12-01", "08:00", "09:00"), "CHECK");
      assertThrows(() => bloq.run(novo, "2099-12-10", "2099-12-10", "09:00", "09:00"), "CHECK");
      assertThrows(
        () =>
          bloq.run(
            um<number>(`SELECT id FROM usuarios WHERE perfil <> 'medico' LIMIT 1`),
            "2099-12-10", "2099-12-10", "08:00", "09:00",
          ),
        "não é médico",
      );

      // Excluir médico continua funcionando (cascata nas tabelas novas)
      db.prepare(`DELETE FROM agenda_bloqueios WHERE medico_id = ?`).run(novo); // como routes/medicos.ts
      db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(novo);
      assert(
        um<number>(`SELECT COUNT(*) FROM medico_expediente WHERE medico_id = ?`, novo) === 0,
        "expediente não foi removido em cascata",
      );

      // Duração do procedimento
      db.prepare(`UPDATE procedimentos SET duracao_minutos = 45 WHERE id = ?`).run(procCons);
      assertThrows(
        () => db.prepare(`UPDATE procedimentos SET duracao_minutos = 2 WHERE id = ?`).run(procCons),
        "CHECK",
      );
    } finally {
      db.exec("ROLLBACK TO teste_a1");
      db.exec("RELEASE teste_a1");
    }

    // 4f. Integridade geral
    const fk = db.prepare(`PRAGMA foreign_key_check`).all();
    assert(fk.length === 0, `foreign_key_check: ${JSON.stringify(fk.slice(0, 5))}`);
    assert(um<string>(`PRAGMA integrity_check`) === "ok", "integrity_check");
    closeDb();

    // 5. Conferência depois = antes
    const depois = rodarConferir(["--db", copia, "--comparar", snap]);
    fs.rmSync(snap, { force: true });
    assert(depois.status === 0, `conferir-agenda mudou após a A1:\n${depois.saida}`);

    console.log("A1 OK — banco aditivo, backfill coerente, triggers e conferência iguais.");
  } finally {
    try {
      fechar?.();
      removerBancoCopia(copia);
    } catch (e) {
      console.warn(`Aviso: não consegui apagar a cópia ${copia}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
