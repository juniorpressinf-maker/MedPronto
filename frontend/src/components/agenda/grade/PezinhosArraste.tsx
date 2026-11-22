import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Dois pezinhos que "andam" embaixo do card enquanto ele é arrastado na agenda
 * (igual ao Clinicar). O card fica "em pé" sobre eles, logo acima do mouse.
 * Sobre um lugar que aceita soltar e com o mouse se mexendo → andam;
 * lugar proibido (ou mouse parado) → param em pé.
 * Versão para o arraste próprio do MedPronto (eventos de ponteiro).
 */
export function PezinhosArraste({ ativo, cor, podeSoltar }: { ativo: boolean; cor: string; podeSoltar: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [mexendo, setMexendo] = useState(false);
  const [paraEsquerda, setParaEsquerda] = useState(false);
  const ultimo = useRef({ x: 0, y: 0, iniciado: false });

  useEffect(() => {
    if (!ativo) {
      setPos(null);
      setMexendo(false);
      ultimo.current.iniciado = false;
      return;
    }
    let parar = 0;
    const onMove = (e: PointerEvent) => {
      const u = ultimo.current;
      const dx = e.clientX - u.x;
      const mexeu = !u.iniciado || Math.abs(dx) + Math.abs(e.clientY - u.y) > 1;
      if (u.iniciado && Math.abs(dx) > 2) setParaEsquerda(dx < 0);
      u.x = e.clientX;
      u.y = e.clientY;
      u.iniciado = true;
      setPos({ x: e.clientX, y: e.clientY });
      if (mexeu) {
        setMexendo(true);
        window.clearTimeout(parar);
        parar = window.setTimeout(() => setMexendo(false), 260);
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.clearTimeout(parar);
    };
  }, [ativo]);

  if (!ativo || !pos) return null;
  const andando = mexendo && podeSoltar;
  return createPortal(
    <div
      className={`agn-pezinhos ${andando ? "agn-pezinhos--andando" : ""} ${paraEsquerda ? "agn-pezinhos--esquerda" : ""}`}
      style={{ left: pos.x, top: pos.y - 2, ["--agn-sapato" as string]: cor }}
      aria-hidden
    >
      <svg viewBox="0 0 64 52" width="64" height="52">
        <Perna classe="agn-pezinhos__perna agn-pezinhos__perna--tras" x={27} />
        <Perna classe="agn-pezinhos__perna agn-pezinhos__perna--frente" x={36} />
      </svg>
    </div>,
    document.body,
  );
}

/** Perninha com joelho (coxa + canela, traço branco com contorno) + sapatinho na cor do card (molde CliniCar). */
function Perna({ classe, x }: { classe: string; x: number }) {
  return (
    // Coxa gira no quadril; a canela gira no joelho (perna levemente dobrada, molde de passada).
    <g className={classe} style={{ transformOrigin: `${x}px 2px` }}>
      {/* coxa: contorno escuro + traço branco */}
      <line x1={x} y1={2} x2={x} y2={18} stroke="#334155" strokeWidth={6} strokeLinecap="round" />
      <line x1={x} y1={2} x2={x} y2={18} stroke="#fff" strokeWidth={3.4} strokeLinecap="round" />
      <g className="agn-pezinhos__canela" style={{ transformOrigin: `${x}px 18px` }}>
      {/* canela */}
      <line x1={x} y1={18} x2={x} y2={33} stroke="#334155" strokeWidth={6} strokeLinecap="round" />
      <line x1={x} y1={18} x2={x} y2={33} stroke="#fff" strokeWidth={3.4} strokeLinecap="round" />
      {/* joelho (tampa a emenda) */}
      <circle cx={x} cy={18} r={1.7} fill="#fff" />
      {/* meinha */}
      <line x1={x - 2.6} y1={31} x2={x + 2.6} y2={31} stroke="#334155" strokeWidth={1} strokeLinecap="round" opacity={0.55} />
      <g transform={`translate(${x} 36)`}>
        <g className="agn-pezinhos__sapato">
        {/* cabedal */}
        <path
          d="M-6.5 7 L-6.5 -0.5 Q-6.5 -4.5 -2.5 -4.5 L1.8 -4.5 Q4 -4.5 5 -1.4 Q9.5 -0.2 13.6 1.8 Q17 3.6 16.6 7 Z"
          fill="var(--agn-sapato)"
          stroke="rgba(15,23,42,.55)"
          strokeWidth={1}
          strokeLinejoin="round"
        />
        {/* brilho do bico */}
        <ellipse cx={11.4} cy={3.2} rx={3.2} ry={1.3} fill="#fff" opacity={0.35} />
        {/* cadarço */}
        <path d="M2.6 -1.6 L5.4 0.6 M5 -0.6 L7.6 1.6" stroke="#fff" strokeWidth={1.1} strokeLinecap="round" />
        {/* boca do sapato */}
        <path d="M-5.4 -2.6 Q-2 -1.2 1.6 -3.4" stroke="rgba(15,23,42,.45)" strokeWidth={0.9} fill="none" />
        {/* solado */}
        <path
          d="M-7.5 6.4 L17.2 6.4 Q18 9.6 15 9.6 L-6.4 9.6 Q-8.4 9.6 -7.5 6.4 Z"
          fill="#fff"
          stroke="rgba(15,23,42,.6)"
          strokeWidth={1}
          strokeLinejoin="round"
        />
        </g>
      </g>
      </g>
    </g>
  );
}
