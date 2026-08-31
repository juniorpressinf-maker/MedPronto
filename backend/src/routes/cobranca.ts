import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { usuarioTemModulo } from "../auth/modulos.js";
import type { Perfil } from "../auth/users.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  atualizarConvenio,
  atualizarProcedimento,
  CONVENIO_PARTICULAR_ID,
  criarConvenio,
  criarProcedimento,
  desativarProcedimento,
  listarConvenios,
  listarProcedimentos,
  obterMatrizPrecos,
  salvarPrecos,
} from "../services/cobrancaCadastros.js";
import {
  abrirConta,
  adicionarItemConta,
  atualizarConta,
  atualizarItemConta,
  cancelarItemConta,
  listarContas,
  listarAdmissionaisSugeridosConta,
  obterContaDetalhe,
  obterContaPorProntuario,
  ProcedimentoDuplicadoError,
  salvarGuiaConvenio,
  sanitizarContaParaSolicitante,
  STATUS_ITEM_COBRAVEL,
} from "../services/cobrancaContas.js";
import {
  aplicarDesconto,
  fecharConta,
  reabrirConta,
  receberConta,
  registrarPagamento,
} from "../services/cobrancaPagamentos.js";
import {
  AgendamentoAtendimentoError,
  listarProcedimentosDoAgendamento,
  sincronizarProcedimentosAgendamento,
} from "../services/agendamentoAtendimento.js";
import { tentarPreparoZapAposEdicao } from "../services/whatsappService.js";
import { requireAdmin } from "../auth/middleware.js";
import { obterCaixaDoDia } from "../services/cobrancaCaixa.js";
import { obterRelatorioCobranca } from "../services/cobrancaRelatorios.js";
import { obterFaturamentoConvenio } from "../services/cobrancaFaturamentoConvenio.js";
import {
  obterPendentesRepasseConvenio,
  receberConvenio,
  receberConvenioLote,
} from "../services/cobrancaReceberConvenio.js";
import {
  gerarPdfFaturamentoConvenio,
  gerarPdfRelatorioCobranca,
} from "../services/cobrancaRelatorioPdf.js";
import { getDb } from "../db/index.js";

function carregarClinicaPdf() {
  return getDb()
    .prepare(
      `SELECT nome, cnpj_cpf, telefone, endereco, logo_path AS logo
       FROM clinica WHERE id = 1`,
    )
    .get() as {
    nome: string;
    cnpj_cpf: string | null;
    telefone: string | null;
    endereco: string | null;
    logo: string | null;
  } | undefined;
}

export const cobrancaRouter = Router();

function idsDoHorario(agendamentoId: number): number[] {
  return listarProcedimentosDoAgendamento(agendamentoId).map((p) => p.id);
}

function responderErroHorario(
  res: import("express").Response,
  e: unknown,
): boolean {
  if (e instanceof AgendamentoAtendimentoError) {
    res.status(400).json({ error: e.message });
    return true;
  }
  return false;
}

function usuarioTemCobrancaCaixa(req: import("express").Request): boolean {
  const u = req.usuario!;
  return usuarioTemModulo(u.id, u.perfil as Perfil, "cobranca");
}

function responderContaDetalhe(
  req: import("express").Request,
  res: import("express").Response,
  conta: import("../services/cobrancaContas.js").ContaDetalhe,
): void {
  if (usuarioTemCobrancaCaixa(req)) {
    res.json(conta);
  } else {
    res.json(sanitizarContaParaSolicitante(conta));
  }
}

cobrancaRouter.use(requireAuth());

cobrancaRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({
      ok: true,
      modulo: "cobranca",
      versao: "M11",
    });
  }),
);

const convenioBody = z.object({
  nome: z.string().min(1).max(120),
  tipo: z.enum(["particular", "operadora"]),
  exige_guia: z.boolean().optional(),
});

const convenioUpdateBody = z.object({
  nome: z.string().min(1).max(120).optional(),
  tipo: z.enum(["particular", "operadora"]).optional(),
  ativo: z.union([z.literal(0), z.literal(1)]).optional(),
  exige_guia: z.boolean().optional(),
});

cobrancaRouter.get(
  "/convenios",
  requireModulo("cobranca_config"),
  asyncHandler(async (req, res) => {
    const incluirInativos = req.query.inativos !== "0";
    res.json(listarConvenios(undefined, incluirInativos));
  }),
);

cobrancaRouter.post(
  "/convenios",
  requireModulo("cobranca_config"),
  asyncHandler(async (req, res) => {
    const body = convenioBody.parse(req.body);
    try {
      res.status(201).json(criarConvenio(body.nome, body.tipo, body.exige_guia ?? true));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao criar convênio",
      });
    }
  }),
);

cobrancaRouter.put(
  "/convenios/:id",
  requireModulo("cobranca_config"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = convenioUpdateBody.parse(req.body);
    try {
      res.json(
        atualizarConvenio(id, {
          nome: body.nome,
          tipo: body.tipo,
          ativo: body.ativo,
          exige_guia:
            body.exige_guia !== undefined ? (body.exige_guia ? 1 : 0) : undefined,
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao atualizar";
      res.status(id ? 400 : 404).json({ error: msg });
    }
  }),
);

cobrancaRouter.delete(
  "/convenios/:id",
  requireModulo("cobranca_config"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (id === CONVENIO_PARTICULAR_ID) {
      res.status(400).json({ error: "O convênio Particular não pode ser excluído" });
      return;
    }
    try {
      res.json(atualizarConvenio(id, { ativo: 0 }));
    } catch (e) {
      res.status(404).json({
        error: e instanceof Error ? e.message : "Convênio não encontrado",
      });
    }
  }),
);

const procedimentoBody = z.object({
  codigo: z.string().max(32).optional(),
  nome: z.string().min(1).max(200),
  orientacoes_paciente: z.string().max(1000).optional(),
  modo_clinico: z.enum(["prontuario", "aso", "nenhum"]),
});

const procedimentoUpdateBody = z.object({
  codigo: z.string().max(32).nullable().optional(),
  nome: z.string().min(1).max(200).optional(),
  ativo: z.union([z.literal(0), z.literal(1)]).optional(),
  orientacoes_paciente: z.string().max(1000).nullable().optional(),
  modo_clinico: z.enum(["prontuario", "aso", "nenhum"]).optional(),
});

cobrancaRouter.get(
  "/procedimentos",
  requireModulo("cobranca_config", "cobranca", "cobranca_solicitar"),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "");
    const incluirInativos = req.query.inativos !== "0";
    res.json(listarProcedimentos(q, incluirInativos));
  }),
);

cobrancaRouter.post(
  "/procedimentos",
  requireModulo("cobranca_config"),
  asyncHandler(async (req, res) => {
    const body = procedimentoBody.parse(req.body);
    try {
      res.status(201).json(criarProcedimento(body));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao incluir",
      });
    }
  }),
);

cobrancaRouter.put(
  "/procedimentos/:id",
  requireModulo("cobranca_config"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = procedimentoUpdateBody.parse(req.body);
    try {
      res.json(atualizarProcedimento(id, body));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao atualizar",
      });
    }
  }),
);

cobrancaRouter.delete(
  "/procedimentos/:id",
  requireModulo("cobranca_config"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    try {
      res.json(desativarProcedimento(id));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao desativar",
      });
    }
  }),
);

cobrancaRouter.get(
  "/precos",
  requireModulo("cobranca_config"),
  asyncHandler(async (_req, res) => {
    res.json(obterMatrizPrecos());
  }),
);

const precosBody = z.object({
  precos: z.array(
    z.object({
      procedimento_id: z.number().int().positive(),
      convenio_id: z.number().int().positive(),
      valor_centavos: z.number().int().min(0),
    }),
  ),
});

cobrancaRouter.put(
  "/precos",
  requireModulo("cobranca_config"),
  asyncHandler(async (req, res) => {
    const body = precosBody.parse(req.body);
    try {
      res.json(salvarPrecos(body.precos));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao salvar preços",
      });
    }
  }),
);

const abrirContaBody = z.object({
  paciente_id: z.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  convenio_id: z.number().int().positive().optional(),
  agendamento_id: z.number().int().positive().optional(),
  prontuario_id: z.number().int().positive().optional(),
  observacao: z.string().max(2000).optional(),
});

const atualizarContaBody = z.object({
  convenio_id: z.number().int().positive().optional(),
  observacao: z.string().max(2000).nullable().optional(),
  valor_desconto_centavos: z.number().int().min(0).optional(),
  motivo_desconto: z.string().max(500).nullable().optional(),
});

const pagamentoBody = z.object({
  forma: z.enum(["pix", "credito", "debito", "dinheiro", "transferencia"]),
  valor_centavos: z.number().int().positive(),
  observacao: z.string().max(500).optional(),
});

const fecharContaBody = z.object({
  modo: z.enum(["normal", "convenio", "isento"]).optional(),
  motivo: z.string().max(500).optional(),
  convenio_guia: z
    .object({
      numero_guia: z.string().max(100).nullable().optional(),
      senha: z.string().max(100).nullable().optional(),
      autorizacao: z.string().max(100).nullable().optional(),
      data_envio: z.string().max(30).nullable().optional(),
      observacao: z.string().max(500).nullable().optional(),
    })
    .optional(),
});

const convenioGuiaBody = z.object({
  numero_guia: z.string().max(100).nullable().optional(),
  senha: z.string().max(100).nullable().optional(),
  autorizacao: z.string().max(100).nullable().optional(),
  data_envio: z.string().max(30).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});

const receberContaBody = z.object({
  valor_desconto_centavos: z.number().int().min(0).default(0),
  motivo_desconto: z.string().max(500).nullable().optional(),
  forma: z.enum(["pix", "credito", "debito", "dinheiro", "transferencia"]).optional(),
});

const receberConvenioBody = z.object({
  data_recebimento: z.string().max(10).optional(),
  valor_centavos: z.number().int().positive().optional(),
  observacao: z.string().max(500).optional(),
});

const receberConvenioLoteBody = z.object({
  conta_ids: z.array(z.number().int().positive()).min(1),
  data_recebimento: z.string().max(10),
  observacao: z.string().max(500).optional(),
});

const itemBody = z.object({
  procedimento_id: z.number().int().positive(),
  quantidade: z.number().int().positive().optional(),
  status: z.enum(["previsto", "solicitado", "realizado", "cancelado"]).optional(),
  observacao: z.string().max(500).optional(),
  admissional_id: z.number().int().positive().optional(),
  confirmar_duplicata: z.boolean().optional(),
});

const itemSolicitarBody = z.object({
  procedimento_id: z.number().int().positive(),
  quantidade: z.number().int().positive().optional(),
  observacao: z.string().max(500).optional(),
  confirmar_duplicata: z.boolean().optional(),
});

const itemPatchBody = z.object({
  status: z.enum(["previsto", "solicitado", "realizado", "cancelado"]).optional(),
  observacao: z.string().max(500).nullable().optional(),
  exame_anexo_id: z.number().int().positive().nullable().optional(),
  admissional_id: z.number().int().positive().nullable().optional(),
});

cobrancaRouter.get(
  "/relatorios/faturamento-convenio/pdf",
  requireModulo("cobranca_relatorios"),
  asyncHandler(async (req, res) => {
    const de = String(req.query.de ?? "").trim();
    const ate = String(req.query.ate ?? "").trim();
    const convenioId = req.query.convenio_id
      ? Number(req.query.convenio_id)
      : undefined;
    try {
      const rel = obterFaturamentoConvenio(
        de,
        ate,
        convenioId && convenioId > 0 ? convenioId : null,
      );
      const clinica = carregarClinicaPdf();
      const pdf = await gerarPdfFaturamentoConvenio(rel, {
        nome: clinica?.nome ?? "Clínica",
        cnpj_cpf: clinica?.cnpj_cpf ?? null,
        telefone: clinica?.telefone ?? null,
        endereco: clinica?.endereco ?? null,
        logo: clinica?.logo ?? null,
      });
      const sufixo = rel.convenio_nome
        ? rel.convenio_nome.replace(/\s+/g, "-").toLowerCase()
        : "todos";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="faturamento-${sufixo}-${de}-${ate}.pdf"`,
      );
      res.send(pdf);
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao gerar PDF",
      });
    }
  }),
);

cobrancaRouter.get(
  "/relatorios/faturamento-convenio",
  requireModulo("cobranca_relatorios"),
  asyncHandler(async (req, res) => {
    const de = String(req.query.de ?? "").trim();
    const ate = String(req.query.ate ?? "").trim();
    const convenioId = req.query.convenio_id
      ? Number(req.query.convenio_id)
      : undefined;
    try {
      res.json(
        obterFaturamentoConvenio(
          de,
          ate,
          convenioId && convenioId > 0 ? convenioId : null,
        ),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao gerar relatório",
      });
    }
  }),
);

cobrancaRouter.get(
  "/convenios/pendentes-repasse",
  requireModulo("cobranca_relatorios"),
  asyncHandler(async (req, res) => {
    const de = String(req.query.de ?? "").trim();
    const ate = String(req.query.ate ?? "").trim();
    const convenioId = req.query.convenio_id
      ? Number(req.query.convenio_id)
      : undefined;
    try {
      res.json(
        obterPendentesRepasseConvenio(
          de,
          ate,
          convenioId && convenioId > 0 ? convenioId : null,
        ),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao listar pendentes",
      });
    }
  }),
);

cobrancaRouter.post(
  "/convenios/receber-lote",
  requireModulo("cobranca_relatorios"),
  asyncHandler(async (req, res) => {
    const body = receberConvenioLoteBody.parse(req.body ?? {});
    try {
      res.json(
        receberConvenioLote(body, req.usuario!.id),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro na baixa em lote",
      });
    }
  }),
);

cobrancaRouter.get(
  "/relatorios/pdf",
  requireModulo("cobranca_relatorios"),
  asyncHandler(async (req, res) => {
    const de = String(req.query.de ?? "").trim();
    const ate = String(req.query.ate ?? "").trim();
    try {
      const rel = obterRelatorioCobranca(de, ate);
      const clinica = carregarClinicaPdf();
      const pdf = await gerarPdfRelatorioCobranca(rel, {
        nome: clinica?.nome ?? "Clínica",
        cnpj_cpf: clinica?.cnpj_cpf ?? null,
        telefone: clinica?.telefone ?? null,
        endereco: clinica?.endereco ?? null,
        logo: clinica?.logo ?? null,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="cobranca-${de}-${ate}.pdf"`,
      );
      res.send(pdf);
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao gerar PDF",
      });
    }
  }),
);

cobrancaRouter.get(
  "/relatorios",
  requireModulo("cobranca_relatorios"),
  asyncHandler(async (req, res) => {
    const de = String(req.query.de ?? "").trim();
    const ate = String(req.query.ate ?? "").trim();
    try {
      res.json(obterRelatorioCobranca(de, ate));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao gerar relatório",
      });
    }
  }),
);

cobrancaRouter.get(
  "/caixa",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const data = String(req.query.data ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      res.status(400).json({ error: "Parâmetro data obrigatório (AAAA-MM-DD)" });
      return;
    }
    res.json(obterCaixaDoDia(data));
  }),
);

cobrancaRouter.get(
  "/contas",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const data = String(req.query.data ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      res.status(400).json({ error: "Parâmetro data obrigatório (AAAA-MM-DD)" });
      return;
    }
    const pacienteId = req.query.paciente_id
      ? Number(req.query.paciente_id)
      : undefined;
    res.json(listarContas(data, pacienteId));
  }),
);

cobrancaRouter.post(
  "/contas",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const body = abrirContaBody.parse(req.body);
    try {
      const conta = abrirConta(body, req.usuario!.id);
      res.status(201).json(conta);
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao abrir conta",
      });
    }
  }),
);

cobrancaRouter.get(
  "/contas/por-prontuario/:prontuarioId",
  requireModulo("cobranca", "cobranca_solicitar"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    try {
      const conta = obterContaPorProntuario(prontuarioId);
      if (!conta) {
        res.status(404).json({
          error: "Conta não aberta para esta consulta. Faça check-in na recepção.",
        });
        return;
      }
      responderContaDetalhe(req, res, conta);
    } catch (e) {
      res.status(404).json({
        error: e instanceof Error ? e.message : "Prontuário não encontrado",
      });
    }
  }),
);

cobrancaRouter.get(
  "/contas/:id",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    try {
      res.json(obterContaDetalhe(Number(req.params.id)));
    } catch (e) {
      res.status(404).json({
        error: e instanceof Error ? e.message : "Conta não encontrada",
      });
    }
  }),
);

cobrancaRouter.patch(
  "/contas/:id",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const body = atualizarContaBody.parse(req.body);
    const contaId = Number(req.params.id);
    try {
      if (body.valor_desconto_centavos !== undefined) {
        res.json(
          aplicarDesconto(
            contaId,
            {
              valor_desconto_centavos: body.valor_desconto_centavos,
              motivo_desconto: body.motivo_desconto ?? null,
            },
            req.usuario!.id,
          ),
        );
        return;
      }
      if (body.convenio_id != null) {
        const conta = obterContaDetalhe(contaId);
        if (conta.agendamento_id) {
          sincronizarProcedimentosAgendamento({
            agendamentoId: conta.agendamento_id,
            procedimentoIds: idsDoHorario(conta.agendamento_id),
            convenioId: body.convenio_id,
            usuarioId: req.usuario!.id,
            origemNovos: "secretaria",
          });
          if (body.observacao !== undefined) {
            res.json(
              atualizarConta(contaId, { observacao: body.observacao }),
            );
            return;
          }
          res.json(obterContaDetalhe(contaId));
          return;
        }
      }
      res.json(
        atualizarConta(contaId, {
          convenio_id: body.convenio_id,
          observacao: body.observacao,
        }),
      );
    } catch (e) {
      if (responderErroHorario(res, e)) return;
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao atualizar conta",
      });
    }
  }),
);

cobrancaRouter.post(
  "/contas/:id/receber",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const body = receberContaBody.parse(req.body ?? {});
    try {
      res.json(
        receberConta(
          Number(req.params.id),
          {
            valor_desconto_centavos: body.valor_desconto_centavos,
            motivo_desconto: body.motivo_desconto ?? null,
            forma: body.forma,
          },
          req.usuario!.id,
        ),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao receber conta",
      });
    }
  }),
);

cobrancaRouter.post(
  "/contas/:id/pagamentos",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const body = pagamentoBody.parse(req.body);
    try {
      res.status(201).json(
        registrarPagamento(Number(req.params.id), body, req.usuario!.id),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao registrar pagamento",
      });
    }
  }),
);

cobrancaRouter.patch(
  "/contas/:id/convenio-guia",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const body = convenioGuiaBody.parse(req.body);
    const contaId = Number(req.params.id);
    try {
      salvarGuiaConvenio(contaId, body);
      res.json(obterContaDetalhe(contaId));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao salvar guia",
      });
    }
  }),
);

cobrancaRouter.post(
  "/contas/:id/receber-convenio",
  requireModulo("cobranca_relatorios"),
  asyncHandler(async (req, res) => {
    const body = receberConvenioBody.parse(req.body ?? {});
    try {
      responderContaDetalhe(
        req,
        res,
        receberConvenio(Number(req.params.id), body, req.usuario!.id),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao registrar recebimento",
      });
    }
  }),
);

cobrancaRouter.post(
  "/contas/:id/fechar",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const body = fecharContaBody.parse(req.body ?? {});
    try {
      res.json(
        fecharConta(Number(req.params.id), body, req.usuario!.id),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao fechar conta",
      });
    }
  }),
);

cobrancaRouter.post(
  "/contas/:id/reabrir",
  requireModulo("cobranca"),
  requireAdmin(),
  asyncHandler(async (req, res) => {
    try {
      res.json(reabrirConta(Number(req.params.id), req.usuario!.id));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao reabrir conta",
      });
    }
  }),
);

cobrancaRouter.post(
  "/contas/:id/itens",
  requireModulo("cobranca", "cobranca_solicitar"),
  asyncHandler(async (req, res) => {
    const contaId = Number(req.params.id);
    try {
      if (usuarioTemCobrancaCaixa(req)) {
        const body = itemBody.parse(req.body);
        const conta = obterContaDetalhe(contaId);
        if (conta.agendamento_id) {
          const atuais = idsDoHorario(conta.agendamento_id);
          if (atuais.includes(body.procedimento_id)) {
            throw new ProcedimentoDuplicadoError(
              conta.itens.find((i) => i.procedimento_id === body.procedimento_id)
                ?.procedimento_nome ?? "Procedimento",
            );
          }
          sincronizarProcedimentosAgendamento({
            agendamentoId: conta.agendamento_id,
            procedimentoIds: [...atuais, body.procedimento_id],
            usuarioId: req.usuario!.id,
            origemNovos: "secretaria",
          });
          await tentarPreparoZapAposEdicao(conta.agendamento_id);
          responderContaDetalhe(req, res, obterContaDetalhe(contaId));
          return;
        }
        responderContaDetalhe(
          req,
          res,
          adicionarItemConta(contaId, body, req.usuario!.id),
        );
        return;
      }
      const body = itemSolicitarBody.parse(req.body);
      responderContaDetalhe(
        req,
        res,
        adicionarItemConta(
          contaId,
          { ...body, status: "solicitado" },
          req.usuario!.id,
        ),
      );
    } catch (e) {
      if (e instanceof ProcedimentoDuplicadoError) {
        res.status(409).json({
          codigo: e.codigo,
          error: e.message,
          procedimento_nome: e.procedimento_nome,
        });
        return;
      }
      if (responderErroHorario(res, e)) return;
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao incluir item",
      });
    }
  }),
);

cobrancaRouter.get(
  "/contas/:id/admissionais-sugeridos",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const contaId = Number(req.params.id);
    const itemId = req.query.item_id ? Number(req.query.item_id) : undefined;
    try {
      res.json(listarAdmissionaisSugeridosConta(contaId, itemId));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao listar admissionais",
      });
    }
  }),
);

cobrancaRouter.patch(
  "/contas/:id/itens/:itemId",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const body = itemPatchBody.parse(req.body);
    try {
      res.json(
        atualizarItemConta(
          Number(req.params.id),
          Number(req.params.itemId),
          body,
        ),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao atualizar item",
      });
    }
  }),
);

cobrancaRouter.delete(
  "/contas/:id/itens/:itemId",
  requireModulo("cobranca"),
  asyncHandler(async (req, res) => {
    const contaId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    try {
      const conta = obterContaDetalhe(contaId);
      const item = conta.itens.find((i) => i.id === itemId);
      if (
        conta.agendamento_id &&
        item?.procedimento_id &&
        (STATUS_ITEM_COBRAVEL as readonly string[]).includes(item.status)
      ) {
        const noHorario = idsDoHorario(conta.agendamento_id);
        if (noHorario.includes(item.procedimento_id)) {
          const ativosMesmo = conta.itens.filter(
            (i) =>
              i.procedimento_id === item.procedimento_id &&
              (STATUS_ITEM_COBRAVEL as readonly string[]).includes(i.status),
          );
          if (ativosMesmo.length <= 1) {
            sincronizarProcedimentosAgendamento({
              agendamentoId: conta.agendamento_id,
              procedimentoIds: noHorario.filter(
                (id) => id !== item.procedimento_id,
              ),
              usuarioId: req.usuario!.id,
              origemNovos: "secretaria",
            });
            res.json(obterContaDetalhe(contaId));
            return;
          }
        }
      }
      res.json(cancelarItemConta(contaId, itemId));
    } catch (e) {
      if (responderErroHorario(res, e)) return;
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao cancelar item",
      });
    }
  }),
);
