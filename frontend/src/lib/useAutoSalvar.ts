import { useEffect, useRef, useState } from "react";

/**
 * Salvamento automático de documento do atendimento (receita, atestado, pedido):
 * grava 1,5 s depois da última alteração e ao sair da aba/tela.
 * `salvar(true)` = silencioso: sem mensagens; devolve false se o documento ainda não é válido.
 */
export function useAutoSalvar(opts: {
  /** Muda a cada alteração do conteúdo (ex.: snapshot do formulário). */
  chave: string;
  dirty: boolean;
  desligado: boolean;
  salvar: (silencioso: boolean) => Promise<boolean>;
}): string | null {
  const salvarRef = useRef(opts.salvar);
  salvarRef.current = opts.salvar;
  const pendenteRef = useRef(false);
  pendenteRef.current = opts.dirty && !opts.desligado;
  const [hora, setHora] = useState<string | null>(null);
  const [incompleto, setIncompleto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!opts.dirty || opts.desligado) return;
    const t = window.setTimeout(async () => {
      setSalvando(true);
      const ok = await salvarRef.current(true).catch(() => false);
      setSalvando(false);
      setIncompleto(!ok);
      if (ok) setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [opts.chave, opts.dirty, opts.desligado]);

  // Saiu da aba/tela com alteração pendente: grava o que der.
  useEffect(() => {
    const aoFechar = () => {
      if (pendenteRef.current) void salvarRef.current(true);
    };
    window.addEventListener("beforeunload", aoFechar);
    return () => {
      window.removeEventListener("beforeunload", aoFechar);
      aoFechar();
    };
  }, []);

  if (opts.desligado) return null;
  if (salvando) return "Salvando…";
  if (opts.dirty) return incompleto ? "Incompleto — ainda não salvo" : "Alterações não salvas…";
  return hora ? `✓ Salvo às ${hora}` : "✓ Salvo";
}
