/**
 * Aceite FIN1 — contas a pagar + caixa (molde CliniCar).
 * Conta única / parcelas / repetir mês; quitar gera saída no caixa; estorno reabre e
 * lança entrada; lançamento manual entra e sai; movimento automático não se exclui.
 */
import "./lib/exigirCopia.js"; // trava: nunca no banco real (rodar via npm run test:fin1)
import { getDb } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrate.js";
import {
  criarContaPagar,
  estornarContaPagar,
  excluirContaPagar,
  listarContasPagar,
  obterContaPagar,
  quitarContasPagar,
} from "../src/services/contasPagar.js";
import { excluirManual, lancarManual, listarCategorias, resumoCaixa } from "../src/services/financeiroCaixa.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  console.log(`ok - ${msg}`);
}

function status(e: unknown): number | undefined {
  return (e as { status?: number }).status;
}

function main(): void {
  runMigrations();
  const db = getDb();
  const dia = "2099-03-10";
  const cats = listarCategorias(db);
  const forn = cats.find((c) => c.nome === "Fornecedores");
  const sangria = cats.find((c) => c.nome === "Sangria");
  assert(!!forn && !!sangria, "categorias padrão existem");

  const base = resumoCaixa({ de: dia, ate: dia }, db);

  const [unica] = criarContaPagar(
    { fornecedor_nome: "teste fin1", categoria_id: forn!.id, valor_centavos: 15000, vencimento: dia },
    null,
    db,
  );
  assert(unica!.fornecedor_nome === "TESTE FIN1", "conta única cria fornecedor");

  const parc = criarContaPagar(
    {
      categoria_id: forn!.id,
      valor_centavos: 0,
      vencimento: "2099-01-31",
      parcelas: [
        { valor_centavos: 100, vencimento: "2099-01-31" },
        { valor_centavos: 100, vencimento: "2099-02-28" },
      ],
    },
    null,
    db,
  );
  assert(parc.length === 2 && parc[0]!.fornecedor_nome === "DIVERSOS", "parcelas (sem fornecedor = DIVERSOS)");

  const rep = criarContaPagar(
    { fornecedor_nome: "TESTE FIN1", categoria_id: forn!.id, valor_centavos: 1000, vencimento: "2099-01-31", repetir_meses: 3 },
    null,
    db,
  );
  assert(rep.map((r) => r.vencimento).join() === "2099-01-31,2099-02-28,2099-03-31", "repetir mês ajusta dia 31");

  quitarContasPagar({ ids: [unica!.id], data_pagamento: dia, forma: "boleto", juros_centavos: 500 }, null, db);
  const paga = obterContaPagar(unica!.id, db);
  assert(paga.status === "paga" && paga.valor_pago_centavos === 15500, "quitar com juros");

  let r = resumoCaixa({ de: dia, ate: dia }, db);
  assert(r.saidas_centavos - base.saidas_centavos === 15500, "conta paga sai do caixa");

  let erro: number | undefined;
  try {
    excluirContaPagar(unica!.id, db);
  } catch (e) {
    erro = status(e);
  }
  assert(erro === 409, "conta paga não se exclui");

  const mov = r.movimentos.find((m) => m.origem === "conta_pagar");
  erro = undefined;
  try {
    excluirManual(mov!.id, db);
  } catch (e) {
    erro = status(e);
  }
  assert(erro === 409, "movimento automático não se exclui pelo caixa");

  const idm = lancarManual(
    { natureza: "saida", categoria_id: sangria!.id, valor_centavos: 2000, data: dia, descricao: "sangria teste" },
    null,
    db,
  );
  r = resumoCaixa({ de: dia, ate: dia }, db);
  assert(r.saidas_centavos - base.saidas_centavos === 17500, "lançamento manual entra no caixa");
  excluirManual(idm, db);

  const est = estornarContaPagar(unica!.id, "teste", null, db);
  assert(est.status === "aberta" && est.pagamento_id === null, "estorno reabre a conta");
  quitarContasPagar({ ids: [unica!.id], data_pagamento: dia, forma: "pix" }, null, db);
  assert(obterContaPagar(unica!.id, db).status === "paga", "pode pagar de novo após estorno");

  const lote = quitarContasPagar(
    { ids: parc.map((p) => p.id), data_pagamento: dia, forma: "pix", juros_centavos: 999 },
    null,
    db,
  );
  assert(lote.every((c) => c.valor_pago_centavos === 100), "lote ignora juros");

  const l = listarContasPagar({ situacao: "paga", de: dia, ate: dia }, db);
  assert(l.rows.filter((c) => c.fornecedor_nome === "TESTE FIN1" || c.fornecedor_nome === "DIVERSOS").length >= 3, "filtro pagas por data");

  console.log("FIN1 OK");
}

main();
