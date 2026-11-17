import { useEffect, useState } from "react";
import { ApiError, api, type Paciente } from "../../../lib/api";
import { useMessageBox } from "../../../lib/messageBoxContext";

type Props = {
  pacienteId: number;
  onFechar: () => void;
  onSalvo: () => void;
};

function digitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Edição rápida do paciente pela agenda: nome, nascimento, celular. Preserva o resto do cadastro. */
export function PacienteEditarDialog({ pacienteId, onFechar, onSalvo }: Props) {
  const msg = useMessageBox();
  const [completo, setCompleto] = useState<Paciente | null>(null);
  const [nome, setNome] = useState("");
  const [nasc, setNasc] = useState("");
  const [tel, setTel] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .pacienteGet(pacienteId)
      .then((p) => {
        setCompleto(p);
        setNome(p.nome);
        setNasc(p.data_nasc?.slice(0, 10) ?? "");
        setTel(p.telefone ?? "");
      })
      .catch((e) => {
        void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar o paciente");
        onFechar();
      });
  }, [pacienteId, msg, onFechar]);

  const erro =
    nome.trim().length < 2
      ? "Informe o nome."
      : !nasc
        ? "Informe a data de nascimento."
        : digitos(tel).length < 10
          ? "Celular com DDD (mínimo 10 dígitos)."
          : null;

  const salvar = async () => {
    if (!completo || erro) return;
    setSalvando(true);
    try {
      // PUT regrava tudo: parte do cadastro completo para não apagar endereço, alergias etc.
      // O servidor não aceita null: campo vazio vai como "" (ele grava como vazio/NULL).
      const semNulos = Object.fromEntries(Object.entries(completo).map(([k, v]) => [k, v ?? ""]));
      await api.pacienteSave({ ...semNulos, nome: nome.trim().toUpperCase(), data_nasc: nasc, telefone: tel.trim() }, pacienteId);
      void msg.success("Paciente atualizado.");
      onSalvo();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onFechar}>
      <div
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agn-pac-titulo"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onFechar();
        }}
      >
        <h2 id="agn-pac-titulo" className="modal__title">
          Editar paciente
        </h2>
        {!completo ? (
          <p className="modal__text">Carregando…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="font-medium block mb-1">Nome *</span>
              <input className="legacy-input w-full" autoFocus value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} />
            </label>
            <label className="text-sm">
              <span className="font-medium block mb-1">Nascimento *</span>
              <input type="date" className="legacy-input w-full" value={nasc} onChange={(e) => setNasc(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="font-medium block mb-1">Celular (com DDD) *</span>
              <input type="tel" className="legacy-input w-full" value={tel} onChange={(e) => setTel(e.target.value)} />
            </label>
            <p className="text-xs text-[var(--muted)] sm:col-span-2 m-0">
              Os demais dados (endereço, CPF, alergias…) ficam no menu Pacientes e não são alterados aqui.
            </p>
          </div>
        )}
        <div className="modal__actions">
          {erro && completo && <span className="text-sm text-[var(--muted)] mr-auto">{erro}</span>}
          <button type="button" className="btn btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!completo || !!erro || salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
