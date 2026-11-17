import { useState } from "react";
import { ApiError, api, type Paciente } from "../../../lib/api";
import { useMessageBox } from "../../../lib/messageBoxContext";
import { PACIENTE_CAMPOS, campoMaiusculo } from "../../../lib/pacienteCampos";

type Props = {
  onFechar: () => void;
  onSalvo: (p: Paciente) => void;
};

const COL: Record<number, string> = { 1: "", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4" };

function digitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** "+ Novo" na marcação: cadastro COMPLETO do paciente (mesmos campos da tela Pacientes). */
export function PacienteNovoDialog({ onFechar, onSalvo }: Props) {
  const msg = useMessageBox();
  const [form, setForm] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const faltando = PACIENTE_CAMPOS.find((f) => f.required && !form[f.key]?.trim());
  const erro = faltando
    ? `Informe: ${faltando.label}.`
    : digitos(form.telefone ?? "").length < 10
      ? "Telefone com DDD (mínimo 10 dígitos)."
      : null;

  const salvar = async () => {
    if (erro || salvando) return;
    setSalvando(true);
    try {
      const corpo: Record<string, string> = {};
      for (const f of PACIENTE_CAMPOS) {
        const v = (form[f.key] ?? "").trim();
        if (v) corpo[f.key] = campoMaiusculo(f) ? v.toUpperCase() : v;
      }
      const p = await api.pacienteSave(corpo as unknown as Partial<Paciente> & { nome: string });
      onSalvo(p);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao cadastrar o paciente");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal panel"
        style={{ maxWidth: 820, width: "min(820px, calc(100vw - 32px))" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agn-pac-novo-titulo"
        onKeyDown={(e) => {
          if (e.key === "Escape") onFechar();
        }}
      >
        <h2 id="agn-pac-novo-titulo" className="modal__title">
          Novo paciente
        </h2>
        <form
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 max-h-[65vh] overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          {PACIENTE_CAMPOS.map((f, i) => {
            const valor = form[f.key] ?? "";
            const mudar = (v: string) => setForm((s) => ({ ...s, [f.key]: campoMaiusculo(f) ? v.toUpperCase() : v }));
            return (
              <label key={f.key} className={`flex flex-col gap-1 text-sm ${COL[f.colSpan ?? 1]}`}>
                <span>
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
                {f.type === "textarea" ? (
                  <textarea
                    className="legacy-input"
                    rows={f.rows ?? 2}
                    maxLength={f.maxLength}
                    value={valor}
                    onChange={(e) => mudar(e.target.value)}
                  />
                ) : (
                  <input
                    className="legacy-input"
                    type={f.type ?? "text"}
                    maxLength={f.maxLength}
                    placeholder={f.placeholder}
                    autoFocus={i === 0}
                    value={valor}
                    onChange={(e) => mudar(e.target.value)}
                  />
                )}
              </label>
            );
          })}
          <button type="submit" hidden />
        </form>
        <div className="modal__actions">
          {erro && <span className="text-xs text-[var(--muted)] mr-auto">{erro}</span>}
          <button type="button" className="btn btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!!erro || salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Cadastrar e usar"}
          </button>
        </div>
      </div>
    </div>
  );
}
