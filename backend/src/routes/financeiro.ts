import { Router } from "express";
import { z } from "zod";
import { requireModulo } from "../auth/middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { criarCategoria, excluirManual, lancarManual, listarCategorias, resumoCaixa } from "../services/financeiroCaixa.js";
import {
  alterarContaPagar,
  criarContaPagar,
  estornarContaPagar,
  excluirContaPagar,
  listarContasPagar,
  listarFornecedores,
  quitarContasPagar,
  salvarFornecedor,
} from "../services/contasPagar.js";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const centavos = z.number().int();

const dadosConta = z.object({
  fornecedor_id: z.number().int().positive().optional(),
  fornecedor_nome: z.string().max(80).optional(),
  categoria_id: z.number().int().positive(),
  descricao: z.string().max(120).optional(),
  documento: z.string().max(40).optional(),
  valor_centavos: centavos,
  vencimento: data,
  forma_prevista: z.string().max(30).nullable().optional(),
  linha_pagamento: z.string().max(200).optional(),
  observacao: z.string().max(500).optional(),
});

/** Contas a pagar. */
export const contasPagarRouter = Router();
contasPagarRouter.use(requireModulo("contas_pagar"));

contasPagarRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        q: z.string().optional(),
        situacao: z.enum(["paga", "vencida", "hoje", "a_vencer", "abertas"]).optional(),
        de: data.optional(),
        ate: data.optional(),
        categoria_id: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    res.json(listarContasPagar(q));
  }),
);

contasPagarRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = dadosConta
      .extend({
        parcelas: z.array(z.object({ valor_centavos: centavos, vencimento: data })).max(60).optional(),
        repetir_meses: z.number().int().min(0).max(24).optional(),
      })
      .parse(req.body);
    res.status(201).json(criarContaPagar(b, req.usuario!.id));
  }),
);

contasPagarRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(alterarContaPagar(Number(req.params.id), dadosConta.parse(req.body)));
  }),
);

contasPagarRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    excluirContaPagar(Number(req.params.id));
    res.json({ ok: true });
  }),
);

contasPagarRouter.post(
  "/quitar",
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        ids: z.array(z.number().int().positive()).min(1).max(200),
        data_pagamento: data,
        forma: z.string().min(1).max(30),
        juros_centavos: centavos.min(0).optional(),
        desconto_centavos: centavos.min(0).optional(),
        observacao: z.string().max(300).optional(),
      })
      .parse(req.body);
    res.json(quitarContasPagar(b, req.usuario!.id));
  }),
);

contasPagarRouter.post(
  "/:id/estornar",
  asyncHandler(async (req, res) => {
    const { motivo } = z.object({ motivo: z.string().max(300).optional() }).parse(req.body ?? {});
    res.json(estornarContaPagar(Number(req.params.id), motivo, req.usuario!.id));
  }),
);

contasPagarRouter.get(
  "/fornecedores",
  asyncHandler(async (_req, res) => {
    res.json(listarFornecedores());
  }),
);

contasPagarRouter.post(
  "/fornecedores",
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        id: z.number().int().positive().optional(),
        nome: z.string().min(1).max(80),
        documento: z.string().max(20).optional(),
        telefone: z.string().max(20).optional(),
      })
      .parse(req.body);
    res.json(salvarFornecedor(b));
  }),
);

/** Caixa (entradas e saídas). Categorias também servem às contas a pagar. */
export const caixaRouter = Router();

caixaRouter.get(
  "/categorias",
  requireModulo("caixa", "contas_pagar"),
  asyncHandler(async (_req, res) => {
    res.json(listarCategorias());
  }),
);

caixaRouter.post(
  "/categorias",
  requireModulo("caixa", "contas_pagar"),
  asyncHandler(async (req, res) => {
    const b = z.object({ nome: z.string().min(1).max(60), natureza: z.enum(["entrada", "saida"]) }).parse(req.body);
    res.status(201).json(criarCategoria(b));
  }),
);

caixaRouter.get(
  "/",
  requireModulo("caixa"),
  asyncHandler(async (req, res) => {
    const q = z.object({ de: data, ate: data }).parse(req.query);
    res.json(resumoCaixa(q));
  }),
);

caixaRouter.post(
  "/lancamentos",
  requireModulo("caixa"),
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        natureza: z.enum(["entrada", "saida"]),
        categoria_id: z.number().int().positive(),
        valor_centavos: centavos,
        data,
        descricao: z.string().min(1).max(160),
        forma: z.string().max(30).optional(),
      })
      .parse(req.body);
    res.status(201).json({ id: lancarManual(b, req.usuario!.id) });
  }),
);

caixaRouter.delete(
  "/lancamentos/:id",
  requireModulo("caixa"),
  asyncHandler(async (req, res) => {
    excluirManual(Number(req.params.id));
    res.json({ ok: true });
  }),
);
