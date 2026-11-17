import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { agoraLocalSql } from "../lib/diasUteis.js";
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

  // B2 [8]: não aceita pagar mais do que o saldo (evita saldo negativo e arrecadado inflado).
  const saldo = obterContaDetalhe(contaId, db).saldo_pendente_centavos;
  if (dados.valor_centavos > saldo) {
    const fmt = (c: number) =>
      (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    throw new Error(
      saldo > 0
        ? `Valor maior que o saldo pendente (${fmt(saldo)})`
        : "Esta conta não tem saldo pendente",
    );
  }

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
  const agora = agoraLocalSql();
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
    /** Vários pagamentos (ex.: parte no PIX, parte no cartão). A soma tem de fechar o saldo. */
    pagamentos?: { forma: FormaPagamento; valor_centavos: number }[];
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
    if (saldo > 0 && dados.pagamentos?.length) {
      const soma = dados.pagamentos.reduce((t, p) => t + p.valor_centavos, 0);
      if (soma !== saldo) {
        throw new Error(
          `A soma dos pagamentos (R$ ${(soma / 100).toFixed(2)}) precisa ser igual ao valor a receber (R$ ${(saldo / 100).toFixed(2)})`,
        );
      }
      for (const p of dados.pagamentos) {
        registrarPagamento(contaId, { forma: p.forma, valor_centavos: p.valor_centavos }, usuarioId, db);
      }
    } else if (saldo > 0) {
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

/**
 * B2 [8] — estorno de pagamento lançado errado.
 * Só na conta em aberto (reabra antes) e só pagamento do PRÓPRIO DIA:
 * estornar dia anterior mudaria um caixa já conferido.
 * Repasse de convênio não se estorna por aqui.
 */
export function estornarPagamento(
  contaId: number,
  pagamentoId: number,
  motivo: string,
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  const motivoLimpo = motivo?.trim();
  if (!motivoLimpo || motivoLimpo.length < 3) {
    throw new Error("Informe o motivo do estorno");
  }
  return db.transaction(() => {
    const conta = getContaRow(contaId, db);
    if (conta.status !== "em_aberto" || conta.fechada_em) {
      throw new Error("Reabra a conta antes de estornar um pagamento");
    }
    const pag = db
      .prepare(
        `SELECT id, forma, valor_centavos, registrado_em, registrado_por,
                date(registrado_em) = date('now', 'localtime') AS hoje
         FROM conta_pagamentos WHERE id = ? AND conta_id = ?`,
      )
      .get(pagamentoId, contaId) as
      | {
          id: number;
          forma: string;
          valor_centavos: number;
          registrado_em: string;
          registrado_por: number | null;
          hoje: number;
        }
      | undefined;
    if (!pag) throw new Error("Pagamento não encontrado nesta conta");
    if (pag.forma === "repasse_convenio") {
      throw new Error("Recebimento de convênio não pode ser estornado por aqui");
    }
    if (!pag.hoje) {
      throw new Error("Só é possível estornar pagamento registrado hoje (o caixa de outro dia já foi fechado)");
    }
    db.prepare(`DELETE FROM conta_pagamentos WHERE id = ?`).run(pag.id);
    logAcesso({
      usuarioId,
      pacienteId: conta.paciente_id,
      acao: "cobranca_estorno",
      detalhe: `conta=${contaId} pagamento=${pag.id} forma=${pag.forma} valor=${pag.valor_centavos} registrado_em=${pag.registrado_em} registrado_por=${pag.registrado_por ?? ""} motivo=${motivoLimpo.slice(0, 300)}`,
    });
    return obterContaDetalhe(contaId, db);
  })();
}

/**
 * B2 [5] — cancelar conta (lançada por engano).
 * Só conta em aberto e sem pagamento. Conta de horário só se o horário já foi
 * cancelado ou marcado como falta (cancelar o horário na agenda já cancela a conta vazia).
 */
export function cancelarConta(
  contaId: number,
  motivo: string,
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  const motivoLimpo = motivo?.trim();
  if (!motivoLimpo || motivoLimpo.length < 3) {
    throw new Error("Informe o motivo do cancelamento");
  }
  return db.transaction(() => {
    const conta = getContaRow(contaId, db);
    if (conta.status !== "em_aberto" || conta.fechada_em) {
      throw new Error("Só é possível cancelar conta em aberto");
    }
    const pagos = (
      db
        .prepare(`SELECT COUNT(*) AS qtd FROM conta_pagamentos WHERE conta_id = ?`)
        .get(contaId) as { qtd: number }
    ).qtd;
    if (pagos > 0) {
      throw new Error("Conta com pagamento não pode ser cancelada — estorne os pagamentos antes");
    }
    if (conta.agendamento_id) {
      const ag = db
        .prepare(`SELECT status FROM agendamentos WHERE id = ?`)
        .get(conta.agendamento_id) as { status: string } | undefined;
      if (ag && !["cancelado", "nao_compareceu"].includes(ag.status)) {
        throw new Error(
          "Esta conta é de um horário da agenda. Cancele ou marque falta no horário — a conta vazia é cancelada junto.",
        );
      }
    }
    const obs = [conta.observacao?.trim(), `Cancelada: ${motivoLimpo}`]
      .filter(Boolean)
      .join(" | ");
    db.prepare(
      `UPDATE contas_atendimento SET status = 'cancelada', observacao = ?
       WHERE id = ? AND status = 'em_aberto'`,
    ).run(obs.slice(0, 2000), contaId);
    logAcesso({
      usuarioId,
      pacienteId: conta.paciente_id,
      acao: "cobranca_cancelar_conta",
      detalhe: `conta=${contaId} motivo=${motivoLimpo.slice(0, 300)}`,
    });
    return obterContaDetalhe(contaId, db);
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
