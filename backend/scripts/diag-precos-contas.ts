import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const dbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/medpronto.db");
const db = new Database(dbPath);

const data = process.argv[2] ?? "2026-07-05";
const contas = db
  .prepare(
    `SELECT c.id, c.convenio_id, cv.nome as convenio, c.status
     FROM contas_atendimento c
     LEFT JOIN convenios cv ON cv.id = c.convenio_id
     WHERE c.data = ? AND c.status != 'cancelada'`,
  )
  .all(data) as { id: number; convenio_id: number; convenio: string; status: string }[];

console.log(`=== Contas ${data} (${contas.length}) ===`);
for (const c of contas) {
  const itens = db
    .prepare(
      `SELECT ci.id, ci.procedimento_id, p.nome, ci.status, ci.valor_centavos, ci.quantidade
       FROM conta_itens ci
       LEFT JOIN procedimentos p ON p.id = ci.procedimento_id
       WHERE ci.conta_id = ?`,
    )
    .all(c.id) as {
    id: number;
    procedimento_id: number | null;
    nome: string;
    status: string;
    valor_centavos: number;
    quantidade: number;
  }[];
  if (itens.length === 0) {
    console.log(`\nConta #${c.id} ${c.convenio} [${c.status}] *** SEM ITENS ***`);
    continue;
  }
  const soma = itens
    .filter((i) => ["previsto", "solicitado", "realizado"].includes(i.status))
    .reduce((s, i) => s + i.valor_centavos * i.quantidade, 0);
  console.log(`\nConta #${c.id} ${c.convenio} [${c.status}] soma_itens=${soma}`);
  for (const it of itens) {
    const tab = db
      .prepare(
        `SELECT valor_centavos FROM procedimento_precos
         WHERE procedimento_id = ? AND convenio_id = ?`,
      )
      .get(it.procedimento_id, c.convenio_id) as { valor_centavos: number } | undefined;
    const mismatch =
      tab && tab.valor_centavos !== it.valor_centavos && it.status !== "cancelado"
        ? " *** DIVERGE da tabela ***"
        : "";
    console.log(
      `  item ${it.id} ${it.nome} [${it.status}] gravado=${it.valor_centavos} tabela=${tab?.valor_centavos ?? "SEM PRECO"}`,
      mismatch,
    );
  }
}

const zeros = db
  .prepare(
    `SELECT COUNT(*) as n FROM conta_itens ci
     JOIN contas_atendimento c ON c.id = ci.conta_id
     WHERE c.data = ? AND ci.valor_centavos = 0
       AND ci.status IN ('previsto','solicitado','realizado')`,
  )
  .get(data) as { n: number };
const totalItens = db
  .prepare(
    `SELECT COUNT(*) as n FROM conta_itens ci
     JOIN contas_atendimento c ON c.id = ci.conta_id
     WHERE c.data = ?`,
  )
  .get(data) as { n: number };
console.log(`\nTotal itens no dia (qualquer status): ${totalItens.n}`);
console.log(`Itens ativos com valor 0 no dia: ${zeros.n}`);

db.close();
