import type { ExameAnexo } from "../lib/api";
import {
  classificarExamesParaVinculo,
  hintEscolhaExame,
  rotuloExameOpcao,
  rotuloVinculosInformativos,
  type ContextoExameVinculo,
} from "../lib/exameVinculo";

type Props = {
  exames: ExameAnexo[];
  contexto: ContextoExameVinculo;
  exameAtualId: number | null;
  salvando: boolean;
  compact?: boolean;
  onEscolher: (exameId: number) => void;
};

export function ExameVinculoPicker({
  exames,
  contexto,
  exameAtualId,
  salvando,
  compact = false,
  onEscolher,
}: Props) {
  const { elegiveis, indisponiveis } = classificarExamesParaVinculo(
    exames,
    contexto,
    exameAtualId,
  );
  const hint = hintEscolhaExame(elegiveis);
  const textClass = compact ? "text-xs" : "text-sm";

  if (exames.length === 0) {
    return (
      <p className={`${textClass} text-[var(--muted)] m-0`}>
        Nenhum exame anexado a este paciente.
      </p>
    );
  }

  return (
    <div className="exame-vinculo-picker space-y-2">
      <p className={`${textClass} text-[var(--muted)] m-0`}>{hint}</p>

      {elegiveis.length > 0 ? (
        <ul className="exame-vinculo-picker__lista m-0 p-0 list-none space-y-1">
          {elegiveis.map(({ exame }) => {
            const info = rotuloVinculosInformativos(exame);
            return (
              <li key={exame.id}>
                <button
                  type="button"
                  className={`btn btn-secondary ${compact ? "btn-sm" : ""} w-full justify-start text-left`}
                  disabled={salvando}
                  onClick={() => onEscolher(exame.id)}
                >
                  <span className="block">{rotuloExameOpcao(exame)}</span>
                  {info ? (
                    <span className="block text-xs font-normal opacity-80 mt-0.5">
                      Também em: {info}
                    </span>
                  ) : (
                    <span className="block text-xs font-normal opacity-80 mt-0.5">
                      Sem vínculo neste registro
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {indisponiveis.length > 0 ? (
        <div className="exame-vinculo-picker__indisponiveis">
          <p className={`${textClass} text-[var(--muted)] m-0 mb-1`}>
            Já usados em outro lugar:
          </p>
          <ul className="m-0 p-0 list-none space-y-1">
            {indisponiveis.map(({ exame, motivoIndisponivel }) => (
              <li
                key={exame.id}
                className={`${textClass} rounded border border-[var(--border)] px-2 py-1.5 text-[var(--muted)] bg-[var(--surface-2)]`}
              >
                <span className="block">{rotuloExameOpcao(exame)}</span>
                {motivoIndisponivel ? (
                  <span className="block text-xs mt-0.5">{motivoIndisponivel}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
