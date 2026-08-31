import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { convenioExigeGuia, CONVENIO_PARTICULAR_ID } from "./cobrancaCadastros.js";
import { logAcesso } from "./logAcesso.js";
import {
  FORMAS_PAGAMENTO,
  assertContaTemItensCobraveis,
  carregarGuiaConvenio,
  obterContaDetalhe,
  salvarGuiaConvenio,
  type ContaDetalhe,
  type ContaRow,
  type FormaPagamento,
} from "./cobrancaContas.js";

export { FORMAS_PAGAMENTO, type FormaPagamento };

function getContaRow(contaId: number, db: Database): ContaRow {
  const conta = db
    .prepare(`SELECT * FROM contas_atendimento WHERE id = ?`)
    .get(contaId) as ContaRow | undefined;
  if (!conta) throw new Error("Conta não encontrada");
  return conta;
}

function assertContaRecebePagamento(conta: ContaRow): void {
  if (conta.status !== "em_aberto") {
    throw new Error("Só é possível registrar pagamento em conta em aberto");
  }
  if (conta.fechada_em) {
    throw new Error("Conta já fechada");
  }
}

function ehConvenioParticular(convenioId: number | null, db: Database): boolean {
  if (!convenioId || convenioId === CONVENIO_PARTICULAR_ID) return true;
  const row = db
    .prepare(`SELECT tipo FROM convenios WHERE id = ?`)
    .get(convenioId) as { tipo: string } | undefined;
  return row?.tipo === "particular";
}

export function registrarPagamento(
  contaId: number,
  dados: {
    forma: FormaPagamento;
    valor_centavos: number;
    observacao?: string;
  },
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  if (!FORMAS_PAGAMENTO.includes(dados.forma)) {
    throw new Error("Forma de pagamento inválida");
  }
  if (!Number.isInteger(dados.valor_centavos) || dados.valor_centavos <= 0) {
    throw new Error("Valor do pagamento deve ser positivo");
  }

  const conta = getContaRow(contaId, db);
  assertContaRecebePagamento(conta);

  db.prepare(
    `INSERT INTO conta_pagamentos (conta_id, forma, valor_centavos, registrado_por, observacao)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    contaId,
    dados.forma,
    dados.valor_centavos,
    usuarioId,
    dados.observacao?.trim() || null,
  );

  logAcesso({
    usuarioId,
    pacienteId: conta.paciente_id,
    acao: "cobranca_pagamento",
    detalhe: `conta=${contaId} forma=${dados.forma} valor=${dados.valor_centavos}`,
  });

  return obterContaDetalhe(contaId, db);
}

export function aplicarDesconto(
  contaId: number,
  dados: {
    valor_desconto_centavos: number;
    motivo_desconto: string | null;
  },
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  const conta = getContaRow(contaId, db);
  assertContaRecebePagamento(conta);

  const desconto = Math.max(0, dados.valor_desconto_centavos);
  if (desconto > 0 && !dados.motivo_desconto?.trim()) {
    throw new Error("Motivo do desconto é obrigatório");
  }

  const detalheAntes = obterContaDetalhe(contaId, db);
  if (desconto > detalheAntes.total_itens_centavos) {
    throw new Error("Desconto não pode ser maior que o total dos itens");
  }

  db.prepare(
    `UPDATE contas_atendimento
     SET valor_desconto_centavos = ?, motivo_desconto = ?
     WHERE id = ?`,
  ).run(desconto, dados.motivo_desconto?.trim() || null, contaId);

  logAcesso({
    usuarioId,
    pacienteId: conta.paciente_id,
    acao: "cobranca_desconto",
    detalhe: `conta=${contaId} desconto=${desconto}`,
  });

  return obterContaDetalhe(contaId, db);
}

export function fecharConta(
  contaId: number,
  dados: {
    modo?: "normal" | "convenio" | "isento";
    motivo?: string;
    convenio_guia?: {
      numero_guia?: string | null;
      senha?: string | null;
      autorizacao?: string | null;
      data_envio?: string | null;
      observacao?: string | null;
    };
  },
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  const conta = getContaRow(contaId, db);
  if (conta.status !== "em_aberto") {
    throw new Error("Conta já fechada ou não pode ser fechada");
  }

  const detalhe = obterContaDetalhe(contaId, db);
  const modo = dados.modo ?? "normal";
  const agora = new Date().toISOString().slice(0, 19).replace("T", " ");
  let status: string;

  assertContaTemItensCobraveis(contaId, db);

  if (modo === "isento") {
    const motivo = dados.motivo?.trim();
    if (!motivo) throw new Error("Motivo da isenção é obrigatório");
    db.prepare(
      `UPDATE contas_atendimento
       SET valor_desconto_centavos = ?, motivo_desconto = ?, status = 'isento',
           fechada_em = ?, fechada_por = ?
       WHERE id = ?`,
    ).run(detalhe.total_itens_centavos, motivo, agora, usuarioId, contaId);
    status = "isento";
  } else if (modo === "convenio") {
    if (ehConvenioParticular(conta.convenio_id, db)) {
      throw new Error("Convênio particular não fecha como a faturar");
    }
    if (dados.convenio_guia) {
      salvarGuiaConvenio(contaId, dados.convenio_guia, db);
    }
    const exigeGuia = convenioExigeGuia(conta.convenio_id, db);
    if (exigeGuia) {
      const guia = carregarGuiaConvenio(contaId, db);
      if (!guia?.numero_guia?.trim()) {
        throw new Error("Informe o número da guia para faturar convênio");
      }
    }
    db.prepare(
      `UPDATE contas_atendimento
       SET status = 'a_faturar_convenio', fechada_em = ?, fechada_por = ?
       WHERE id = ?`,
    ).run(agora, usuarioId, contaId);
    status = "a_faturar_convenio";
  } else {
    const saldo = detalhe.saldo_pendente_centavos;
    if (saldo > 0) {
      throw new Error(
        `Saldo pendente de ${(saldo / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} — registre pagamento ou isenção`,
      );
    }
    status = "pago";
    db.prepare(
      `UPDATE contas_atendimento
       SET status = ?, fechada_em = ?, fechada_por = ?
       WHERE id = ?`,
    ).run(status, agora, usuarioId, contaId);
  }

  logAcesso({
    usuarioId,
    pacienteId: conta.paciente_id,
    acao: "cobranca_fechamento",
    detalhe: `conta=${contaId} status=${status}`,
  });

  return obterContaDetalhe(contaId, db);
}

export function receberConta(
  contaId: number,
  dados: {
    valor_desconto_centavos: number;
    motivo_desconto: string | null;
    forma?: FormaPagamento;
  },
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  return db.transaction(() => {
    aplicarDesconto(
      contaId,
      {
        valor_desconto_centavos: dados.valor_desconto_centavos,
        motivo_desconto: dados.motivo_desconto,
      },
      usuarioId,
      db,
    );
    const detalhe = obterContaDetalhe(contaId, db);
    const saldo = detalhe.saldo_pendente_centavos;
    if (saldo > 0) {
      if (!dados.forma) {
        throw new Error("Forma de pagamento obrigatória");
      }
      registrarPagamento(
        contaId,
        { forma: dados.forma, valor_centavos: saldo },
        usuarioId,
        db,
      );
    }
    return fecharConta(contaId, { modo: "normal" }, usuarioId, db);
  })();
}

export function reabrirConta(
  contaId: number,
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  const conta = getContaRow(contaId, db);
  if (conta.status === "em_aberto" && !conta.fechada_em) {
    throw new Error("Conta já está em aberto");
  }
  if (conta.status === "cancelada") {
    throw new Error("Conta cancelada não pode ser reaberta");
  }

  db.prepare(
    `UPDATE contas_atendimento
     SET status = 'em_aberto', fechada_em = NULL, fechada_por = NULL
     WHERE id = ?`,
  ).run(contaId);

  logAcesso({
    usuarioId,
    pacienteId: conta.paciente_id,
    acao: "cobranca_reabrir",
    detalhe: `conta=${contaId}`,
  });

  return obterContaDetalhe(contaId, db);
}
