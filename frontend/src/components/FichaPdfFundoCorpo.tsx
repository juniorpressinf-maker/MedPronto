import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { FichaCampoDef, FichaCampoPosicao } from "../lib/fichaTipos";
import { FichaCamposCorpo, type FichaPreviewDados } from "./FichaCamposCorpo";
import "../ficha-pdf-fundo.css";

type Props = {
  fichaId: number;
  campos: FichaCampoDef[];
  posicoes: FichaCampoPosicao[];
  dados: FichaPreviewDados;
  readOnly?: boolean;
  onDadosChange?: (dados: FichaPreviewDados) => void;
};

export function FichaPdfFundoCorpo({
  fichaId,
  campos,
  posicoes,
  dados,
  readOnly = true,
  onDadosChange,
}: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let objectUrl: string | null = null;
    void api
      .fichasTemplatePdfBlob(fichaId)
      .then((blob) => {
        if (!ativo) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(() => {
        if (!ativo) return;
        setPdfUrl(null);
      });
    return () => {
      ativo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fichaId]);

  const mapaPos = new Map(posicoes.map((p) => [p.campo_id, p]));

  return (
    <div className="ficha-pdf-fundo">
      {pdfUrl ? (
        <object
          className="ficha-pdf-fundo__pdf"
          data={pdfUrl}
          type="application/pdf"
          aria-hidden
        />
      ) : null}
      <div className="ficha-pdf-fundo__campos">
        {campos.map((c) => {
          const p = mapaPos.get(c.id);
          const style = p
            ? {
                left: `${p.x_pct}%`,
                top: `${p.y_pct}%`,
                width: `${p.largura_pct}%`,
                minHeight: `${p.altura_pct}%`,
              }
            : undefined;
          return (
            <div key={c.id} className="ficha-pdf-fundo__campo" style={style}>
              <FichaCamposCorpo
                campos={[c]}
                dados={dados}
                readOnly={readOnly}
                onDadosChange={onDadosChange}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
