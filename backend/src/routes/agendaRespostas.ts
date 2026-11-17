/**
 * Agenda Nova — helpers de rota compartilhados por agendaConfig.ts e pelas
 * extensões de agendamentos.ts.
 */
import type { NextFunction, Request, Response } from "express";
import { AgendaErro } from "../services/agendaErro.js";

type Rota = (req: Request, res: Response) => Promise<void> | void;

/**
 * Como asyncHandler, mas responde AgendaErro com status + { error, codigo, ...dados }.
 * Demais erros (zod, inesperados) seguem para o errorHandler global.
 */
export function rotaAgenda(fn: Rota) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch((e: unknown) => {
        if (e instanceof AgendaErro) {
          res.status(e.status).json(e.paraJson());
          return;
        }
        next(e);
      });
  };
}

export function idDoParametro(req: Request, nome = "id"): number {
  const n = Number(req.params[nome]);
  if (!Number.isInteger(n) || n <= 0) throw new AgendaErro("Identificador inválido");
  return n;
}

/** "1,2,3" → [1,2,3]. Vazio → undefined. Valor inválido → 400. */
export function listaDeIds(valor: unknown, rotulo = "médicos"): number[] | undefined {
  const s = String(valor ?? "").trim();
  if (!s) return undefined;
  const ids = s.split(",").map((p) => Number(p.trim()));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new AgendaErro(`Lista de ${rotulo} inválida`);
  }
  return [...new Set(ids)];
}

export function usuarioDaRequisicao(req: Request): { id: number; perfil: string } {
  const u = req.usuario!;
  return { id: u.id, perfil: String(u.perfil) };
}
