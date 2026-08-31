/**
 * Checklist de aceite I4 — roda após db:migrate.
 * Uso: npm run test:i4 (na pasta backend)
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import {
  abrirConta,
  assertVinculoContaPaciente,
  adicionarItemConta,
  atualizarConta,
} from "../src/services/cobrancaContas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/medpronto.db");

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

function assertThrows(fn: () => void, fragment: string): void {
  try {
    fn();
    throw new Error(`FALHOU: esperava erro contendo "${fragment}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("FALHOU:")) throw e;
    assert(msg.includes(fragment), `erro "${msg}" não contém "${fragment}"`);
  }
}

function main(): void {
  runMigrations();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const pacienteA = (
    db.prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`).get() as
      | { id: number }
      | undefined
  )?.id;
  const pacienteB = (
    db
      .prepare(`SELECT id FROM pacientes WHERE id != ? ORDER BY id LIMIT 1`)
      .get(pacienteA ?? 0) as { id: number } | undefined
  )?.id;
  const proc = (
    db.prepare(`SELECT id FROM procedimentos WHERE ativo = 1 LIMIT 1`).get() as
      | { id: number }
      | undefined
  )?.id;
  const prontuarioA = pacienteA
    ? (db
        .prepare(`SELECT id FROM prontuarios WHERE paciente_id = ? LIMIT 1`)
        .get(pacienteA) as { id: number } | undefined)
    : undefined;
  const prontuarioB = pacienteB
    ? (db
        .prepare(`SELECT id FROM prontuarios WHERE paciente_id = ? LIMIT 1`)
        .get(pacienteB) as { id: number } | undefined)
    : undefined;

  assert(!!pacienteA && !!proc, "precisa de ao menos 1 paciente e 1 procedimento");

  const dataTeste = "2099-01-15";
  db.prepare(
    `DELETE FROM conta_itens WHERE conta_id IN (
       SELECT id FROM contas_atendimento WHERE data = ?
     )`,
  ).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);

  // 1. Abrir conta — OK
  const conta = abrirConta(
    { paciente_id: pacienteA!, data: dataTeste },
    1,
    db,
  );
  assert(conta.paciente_id === pacienteA, "conta aberta para paciente A");

  // 2. Segunda conta mesmo paciente/data — API retorna existente
  const conta2 = abrirConta(
    { paciente_id: pacienteA!, data: dataTeste },
    1,
    db,
  );
  assert(conta2.id === conta.id, "reabrir retorna mesma conta");

  // Duplicata direta no banco — rejeitada
  assertThrows(
    () =>
      db
        .prepare(
          `INSERT INTO contas_atendimento (paciente_id, data, status)
           VALUES (?, ?, 'em_aberto')`,
        )
        .run(pacienteA, dataTeste),
    "UNIQUE",
  );

  // 3. prontuario_id de outro paciente — rejeitada
  if (prontuarioB && pacienteB) {
    assertThrows(
      () =>
        assertVinculoContaPaciente(
          pacienteA!,
          { prontuario_id: prontuarioB.id },
          db,
        ),
      "Prontuário inconsistente",
    );
    assertThrows(
      () =>
        db
          .prepare(
            `INSERT INTO contas_atendimento
             (paciente_id, data, prontuario_id, status)
             VALUES (?, '2099-01-16', ?, 'em_aberto')`,
          )
          .run(pacienteA, prontuarioB.id),
      "Prontuário inconsistente",
    );
  }

  // 4. Item com admissional de outro paciente (se houver admissional B)
  if (pacienteB) {
    const admB = db
      .prepare(`SELECT id FROM admissionais WHERE paciente_id = ? LIMIT 1`)
      .get(pacienteB) as { id: number } | undefined;
    if (admB) {
      assertThrows(
        () =>
          adicionarItemConta(
            conta.id,
            { procedimento_id: proc!, admissional_id: admB.id },
            1,
            db,
          ),
        "inconsistente com paciente da conta",
      );
    }
  }

  // 5. Convênio bloqueado após fechamento simulado
  const convenioAlt = (
    db
      .prepare(`SELECT id FROM convenios WHERE id != ? AND ativo = 1 LIMIT 1`)
      .get(conta.convenio_id ?? 1) as { id: number } | undefined
  )?.id;
  db.prepare(
    `UPDATE contas_atendimento SET fechada_em = datetime('now'), status = 'pago' WHERE id = ?`,
  ).run(conta.id);
  if (convenioAlt) {
    assertThrows(
      () => atualizarConta(conta.id, { convenio_id: convenioAlt }, db),
      "não editável",
    );
    assertThrows(
      () =>
        db
          .prepare(`UPDATE contas_atendimento SET convenio_id = ? WHERE id = ?`)
          .run(convenioAlt, conta.id),
      "conta fechada",
    );
  }

  assertThrows(
    () =>
      db
        .prepare(
          `INSERT INTO conta_itens
           (conta_id, procedimento_id, status, valor_centavos, quantidade)
           VALUES (?, ?, 'previsto', 0, 1)`,
        )
        .run(conta.id, proc),
    "não está em aberto",
  );

  // prontuario válido na API
  if (prontuarioA) {
    assertVinculoContaPaciente(
      pacienteA!,
      { prontuario_id: prontuarioA.id },
      db,
    );
  }

  db.close();
  console.log("I4 aceite: todos os testes passaram.");
}

main();
