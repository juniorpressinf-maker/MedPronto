/** Cadastro de nomes de medicamentos e exames (Configurações → Medicamentos e exames). */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  atualizarItemCatalogo,
  listarCatalogo,
  salvarNomeCatalogo,
} from "../services/catalogoNomes.js";
import { logAcesso } from "../services/logAcesso.js";

export const catalogoRouter = Router();

catalogoRouter.use(requireAuth(), requireModulo("fichas_config", "fichas_medico"));

const tipoSchema = z.enum(["medicamento", "exame"]);

catalogoRouter.get(
  "/:tipo",
  asyncHandler(async (req, res) => {
    const tipo = tipoSchema.parse(req.params.tipo);
    const { q } = z.object({ q: z.string().max(200).optional().default("") }).parse(req.query);
    res.json({ itens: listarCatalogo(tipo, q) });
  }),
);

/** Inclui nome (ou ativa/desativa um nome existente / só usado na clínica). */
catalogoRouter.post(
  "/:tipo",
  asyncHandler(async (req, res) => {
    const tipo = tipoSchema.parse(req.params.tipo);
    const body = z
      .object({ nome: z.string().min(2).max(200), ativo: z.boolean().optional().default(true) })
      .parse(req.body);
    const item = salvarNomeCatalogo(tipo, body.nome, body.ativo);
    logAcesso({ usuarioId: req.usuario?.id ?? null, acao: "catalogo_salvar", detalhe: `${tipo}: ${item.nome} (${item.ativo ? "ativo" : "desativado"})` });
    res.status(201).json(item);
  }),
);

catalogoRouter.patch(
  "/:tipo/:id",
  asyncHandler(async (req, res) => {
    const tipo = tipoSchema.parse(req.params.tipo);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({ nome: z.string().min(2).max(200).optional(), ativo: z.boolean().optional() })
      .parse(req.body);
    const item = atualizarItemCatalogo(tipo, id, body);
    logAcesso({ usuarioId: req.usuario?.id ?? null, acao: "catalogo_alterar", detalhe: `${tipo} #${id}: ${item.nome} (${item.ativo ? "ativo" : "desativado"})` });
    res.json(item);
  }),
);
