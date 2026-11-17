// Limpa resíduos de execuções antigas dos testes de aceite: tudo com data em 2099
// (ano reservado aos testes). Contas já fechadas/pagas são protegidas por triggers;
// aqui elas são suspensas só dentro da transação e recriadas idênticas no fim.
import type Database from "better-sqlite3";

const TRIGGERS_SUSPENSOS = ["trg_conta_item_conta_aberta_del", "trg_agend_proc_min_del"];

export function limparResiduos2099(db: Database.Database): void {
  db.transaction(() => {
    const salvos = TRIGGERS_SUSPENSOS.map((nome) => {
      const r = db
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?`)
        .get(nome) as { sql: string } | undefined;
      if (r) db.exec(`DROP TRIGGER ${nome}`);
      return r?.sql;
    });

    const contas = `SELECT id FROM contas_atendimento WHERE data LIKE '2099%'`;
    const ags = `SELECT id FROM agendamentos WHERE data LIKE '2099%'`;
    db.exec(`
      DELETE FROM conta_pagamentos WHERE conta_id IN (${contas});
      DELETE FROM conta_convenio_guia WHERE conta_id IN (${contas});
      DELETE FROM conta_itens WHERE conta_id IN (${contas});
      DELETE FROM contas_atendimento WHERE data LIKE '2099%' OR agendamento_id IN (${ags});
      DELETE FROM prontuarios WHERE data_atendimento LIKE '2099%' OR agendamento_id IN (${ags});
      DELETE FROM agendamento_procedimentos WHERE agendamento_id IN (${ags});
      DELETE FROM agendamentos WHERE data LIKE '2099%';
    `);

    for (const sql of salvos) if (sql) db.exec(sql);
  })();
}
