import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, api, type ExameAnexo } from "../lib/api";
import { formatDataHoraExame } from "../lib/exameVinculo";
import { useMessageBox } from "../lib/messageBoxContext";

type Props = {
  pacienteId: number;
  pacienteNome: string;
  onClose: () => void;
  onEnviado?: (exame: ExameAnexo) => void;
};

function rotuloCurto(ex: ExameAnexo): string {
  const desc = ex.descricao?.trim();
  if (desc) return desc;
  const nome = (ex.nome_arquivo ?? "arquivo").trim();
  return nome.length > 40 ? `${nome.slice(0, 37)}…` : nome;
}

export function AnexarExameDialog({
  pacienteId,
  pacienteNome,
  onClose,
  onEnviado,
}: Props) {
  const msg = useMessageBox();
  const fileRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [existentes, setExistentes] = useState<ExameAnexo[]>([]);

  useEffect(() => {
    let vivo = true;
    void api
      .examesListar(pacienteId)
      .then(({ exames }) => {
        if (vivo) setExistentes(exames);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [pacienteId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const enviar = async () => {
    if (!arquivo) {
      void msg.warning("Escolha um PDF ou imagem.");
      return;
    }
    setEnviando(true);
    try {
      const { exame } = await api.exameUpload(pacienteId, arquivo, { descricao });
      onEnviado?.(exame);
      onClose();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao enviar exame");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal panel exame-anexar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anexar-exame-titulo"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="anexar-exame-titulo" className="modal__title">
          Anexar exame
        </h2>
        <p className="exame-anexar-modal__paciente">{pacienteNome}</p>

        {existentes.length > 0 ? (
          <ul className="exame-anexar-modal__lista">
            {existentes.map((ex) => (
              <li key={ex.id}>
                <button
                  type="button"
                  className="exame-anexar-modal__link"
                  title="Abrir"
                  onClick={() =>
                    void api.exameArquivo(ex.id).catch((e) =>
                      msg.error(
                        e instanceof ApiError ? e.message : "Erro ao abrir exame",
                      ),
                    )
                  }
                >
                  <span className="exame-anexar-modal__link-nome">
                    {rotuloCurto(ex)}
                  </span>
                  <span className="exame-anexar-modal__link-data">
                    {formatDataHoraExame(ex.data_upload)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
          className="backup-file-input-hidden"
          onChange={() => {
            setArquivo(fileRef.current?.files?.[0] ?? null);
          }}
        />

        <div className="exame-anexar-modal__campo">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={enviando}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="h-4 w-4" aria-hidden />
            Arquivo
          </button>
          <span
            className="exame-anexar-modal__arquivo"
            title={arquivo?.name}
          >
            {arquivo ? arquivo.name : "PDF ou imagem"}
          </span>
        </div>

        <input
          id="exame-descricao-input"
          type="text"
          className="legacy-input exame-anexar-modal__desc"
          maxLength={500}
          value={descricao}
          onChange={(ev) => setDescricao(ev.target.value)}
          placeholder="Descrição (opcional)"
          autoComplete="off"
        />

        <div className="exame-anexar-modal__acoes">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={enviando || !arquivo}
            onClick={() => void enviar()}
          >
            {enviando ? "Enviando…" : "Anexar"}
          </button>
        </div>
      </div>
    </div>
  );
}
