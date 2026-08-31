import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";

type Props = {
  fichaId: number;
};

export function FichaPdfReferenciaPanel({ fichaId }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let objectUrl: string | null = null;
    setErro(null);
    void api
      .fichasTemplatePdfBlob(fichaId)
      .then((blob) => {
        if (!ativo) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (!ativo) return;
        setErro(e instanceof ApiError ? e.message : "Erro ao carregar PDF");
      });
    return () => {
      ativo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fichaId]);

  if (erro) {
    return (
      <p className="ficha-pdf-ref__erro text-sm text-[var(--muted)]">{erro}</p>
    );
  }
  if (!url) {
    return (
      <p className="ficha-pdf-ref__carregando text-sm text-[var(--muted)]">
        Carregando PDF…
      </p>
    );
  }

  return (
    <iframe
      title="PDF de referência"
      className="ficha-pdf-ref__iframe"
      src={url}
    />
  );
}
