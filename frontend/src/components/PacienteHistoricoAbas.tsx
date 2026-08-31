import { useEffect, useMemo, useState } from "react";
import { AtendimentoHistoricoPanel } from "./AtendimentoHistoricoPanel";
import { PacienteAdmissionalHistorico } from "./PacienteAdmissionalHistorico";
import { PacienteAtendimentoHistorico } from "./PacienteAtendimentoHistorico";
import { useAuth } from "../lib/authContext";
import { temModulo } from "../lib/permissoes";
import { ASO_TITULO_CURTO } from "../lib/tipoAtendimento";
import "../admissional-aso.css";

type AbaHistorico = "atendimentos" | "aso" | "consultas";

type Props = {
  pacienteId: number;
  pacienteNome: string;
};

export function PacienteHistoricoAbas({ pacienteId, pacienteNome }: Props) {
  const { permissoes } = useAuth();
  const podeAtendimentos = temModulo(permissoes, [
    "agenda",
    "fila_recepcao",
    "fila_medico",
    "pacientes",
    "prontuario_ler",
  ]);
  const podeAso = temModulo(permissoes, ["admissional", "admissional_agenda"]);
  const podeConsultas = temModulo(permissoes, [
    "prontuario_ler",
    "prontuario_escrever",
  ]);
  const podeRetificar = temModulo(permissoes, "prontuario_escrever");

  const abas = useMemo(() => {
    const list: { id: AbaHistorico; label: string }[] = [];
    if (podeAtendimentos) {
      list.push({ id: "atendimentos", label: "Histórico de atendimento" });
    }
    if (podeAso) list.push({ id: "aso", label: `Histórico ${ASO_TITULO_CURTO}` });
    if (podeConsultas) list.push({ id: "consultas", label: "Histórico clínico" });
    return list;
  }, [podeAtendimentos, podeAso, podeConsultas]);

  const [aba, setAba] = useState<AbaHistorico | null>(null);

  useEffect(() => {
    if (abas.length === 0) {
      setAba(null);
      return;
    }
    setAba((atual) => {
      if (atual && abas.some((a) => a.id === atual)) return atual;
      return abas[0]!.id;
    });
  }, [abas]);

  if (abas.length === 0 || !aba) return null;

  return (
    <div className="paciente-historico-abas">
      {abas.length > 1 ? (
        <nav className="cc-abas paciente-historico-abas__nav" aria-label="Históricos do paciente">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`cc-aba${aba === a.id ? " cc-aba--ativa" : ""}`}
              aria-pressed={aba === a.id}
              onClick={() => setAba(a.id)}
            >
              {a.label}
            </button>
          ))}
        </nav>
      ) : (
        <h3 className="paciente-historico-abas__titulo-unica m-0">
          {abas[0]!.label}
        </h3>
      )}

      <div className="paciente-historico-abas__corpo">
        {aba === "atendimentos" && podeAtendimentos ? (
          <PacienteAtendimentoHistorico pacienteId={pacienteId} />
        ) : null}
        {aba === "aso" && podeAso ? (
          <PacienteAdmissionalHistorico
            pacienteId={pacienteId}
            pacienteNome={pacienteNome}
            ocultarCabecalho
          />
        ) : null}
        {aba === "consultas" && podeConsultas ? (
          <AtendimentoHistoricoPanel
            pacienteId={pacienteId}
            pacienteNome={pacienteNome}
            podeRetificar={podeRetificar}
            ocultarCabecalho
          />
        ) : null}
      </div>
    </div>
  );
}
