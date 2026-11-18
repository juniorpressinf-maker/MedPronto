import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Eraser, Mic, MicOff, Send } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

/**
 * PILOTO — Atendimento com transcrição de voz.
 * Tela isolada para teste: não lê nem grava nada no banco.
 * Usa o reconhecimento de voz do navegador (Web Speech API — Chrome/Edge).
 * O texto transcrito fica num campo ao lado; o médico copia/cola ou envia
 * para um campo do prontuário de teste, se quiser.
 */

// Tipos mínimos da Web Speech API (não fazem parte do lib.dom do TypeScript).
type ResultadoAlternativa = { transcript: string; confidence: number };
type ResultadoFala = { isFinal: boolean; length: number; [i: number]: ResultadoAlternativa };
type EventoResultado = { resultIndex: number; results: { length: number; [i: number]: ResultadoFala } };
type EventoErro = { error: string; message?: string };
type Reconhecedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: EventoResultado) => void) | null;
  onerror: ((e: EventoErro) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};
type ConstrutorReconhecedor = new () => Reconhecedor;

function obterReconhecedor(): ConstrutorReconhecedor | null {
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecedor;
    webkitSpeechRecognition?: ConstrutorReconhecedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MENSAGENS_ERRO: Record<string, string> = {
  "not-allowed": "Acesso ao microfone negado. Libere o microfone no cadeado da barra de endereço do navegador.",
  "service-not-allowed":
    "O navegador bloqueou o serviço de voz. Use Chrome ou Edge; se estiver em outro computador da rede, use o botão \"Liberar microfone neste computador\".",
  "audio-capture": "Nenhum microfone encontrado. Verifique se está conectado.",
  network: "Sem conexão com o serviço de transcrição do navegador (precisa de internet).",
  "language-not-supported": "Idioma português (Brasil) não suportado neste navegador.",
};

type CampoProntuario = "queixa" | "hda" | "exame" | "conduta";

const CAMPOS: { id: CampoProntuario; label: string; linhas: number }[] = [
  { id: "queixa", label: "Queixa principal", linhas: 2 },
  { id: "hda", label: "História da doença atual (HDA)", linhas: 6 },
  { id: "exame", label: "Exame físico", linhas: 4 },
  { id: "conduta", label: "Hipótese diagnóstica / Conduta", linhas: 4 },
];

const PRONTUARIO_VAZIO: Record<CampoProntuario, string> = { queixa: "", hda: "", exame: "", conduta: "" };

function horaAgora() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatarDuracao(seg: number) {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TranscricaoPilotoPage() {
  const Construtor = obterReconhecedor();
  const suportado = Construtor != null;
  /**
   * Aberto por http://IP-da-rede: o navegador bloqueia o microfone (só libera em
   * https ou localhost). Mostra o botão que baixa o liberador para este computador.
   */
  const enderecoBloqueado = !window.isSecureContext;
  const urlLiberador = `/api/transcricao/liberar-microfone.bat?origem=${encodeURIComponent(window.location.origin)}`;

  // Prontuário fictício
  const [paciente, setPaciente] = useState("PACIENTE TESTE DA SILVA");
  const [idade, setIdade] = useState("45");
  const [prontuario, setProntuario] = useState(PRONTUARIO_VAZIO);

  // Transcrição
  const [ligado, setLigado] = useState(false);
  const [transcricao, setTranscricao] = useState("");
  const [parcial, setParcial] = useState("");
  const [comHorario, setComHorario] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [destino, setDestino] = useState<CampoProntuario>("hda");

  const reconhecedorRef = useRef<Reconhecedor | null>(null);
  const querLigadoRef = useRef(false);
  const comHorarioRef = useRef(comHorario);
  const transcricaoRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    comHorarioRef.current = comHorario;
  }, [comHorario]);

  // Cronômetro enquanto grava
  useEffect(() => {
    if (!ligado) return;
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [ligado]);

  // Mantém o fim do texto visível enquanto chega fala nova
  useEffect(() => {
    const el = transcricaoRef.current;
    if (el && ligado && document.activeElement !== el) el.scrollTop = el.scrollHeight;
  }, [transcricao, parcial, ligado]);

  const mostrarAviso = useCallback((texto: string) => {
    setAviso(texto);
    window.setTimeout(() => setAviso(null), 2500);
  }, []);

  const iniciarSessao = useCallback(() => {
    if (!Construtor) return;
    const rec = new Construtor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let finais = "";
      let provisorio = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const texto = r[0]?.transcript ?? "";
        if (r.isFinal) finais += texto;
        else provisorio += texto;
      }
      if (finais.trim()) {
        let frase = finais.trim();
        frase = frase.charAt(0).toUpperCase() + frase.slice(1);
        if (!/[.!?…]$/.test(frase)) frase += ".";
        const linha = comHorarioRef.current ? `[${horaAgora()}] ${frase}` : frase;
        setTranscricao((atual) => (atual ? `${atual}\n${linha}` : linha));
      }
      setParcial(provisorio);
    };

    rec.onerror = (e) => {
      // "no-speech" e "aborted" acontecem normalmente (silêncio / parada) — o onend reinicia.
      if (e.error === "no-speech" || e.error === "aborted") return;
      setErro(MENSAGENS_ERRO[e.error] ?? `Erro no reconhecimento de voz: ${e.error}`);
      querLigadoRef.current = false;
    };

    rec.onend = () => {
      setParcial("");
      // O navegador encerra a sessão sozinho após silêncio/tempo; se o médico não desligou, reabre.
      if (querLigadoRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* cai para desligar */
        }
      }
      reconhecedorRef.current = null;
      setLigado(false);
    };

    reconhecedorRef.current = rec;
    try {
      rec.start();
      setLigado(true);
    } catch {
      setErro("Não foi possível iniciar o microfone.");
      querLigadoRef.current = false;
    }
  }, [Construtor]);

  const ligar = useCallback(() => {
    setErro(null);
    setSegundos(0);
    querLigadoRef.current = true;
    iniciarSessao();
  }, [iniciarSessao]);

  const desligar = useCallback(() => {
    querLigadoRef.current = false;
    reconhecedorRef.current?.stop();
  }, []);

  // Ao sair da tela, desliga o microfone
  useEffect(() => {
    return () => {
      querLigadoRef.current = false;
      reconhecedorRef.current?.abort();
    };
  }, []);

  /** Texto selecionado no campo de transcrição, ou tudo se nada estiver selecionado. */
  const textoEscolhido = useCallback(() => {
    const el = transcricaoRef.current;
    if (el && el.selectionStart !== el.selectionEnd) {
      return el.value.slice(el.selectionStart, el.selectionEnd).trim();
    }
    return transcricao.trim();
  }, [transcricao]);

  const copiar = useCallback(async () => {
    const texto = textoEscolhido();
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      mostrarAviso("Copiado. Cole com Ctrl+V onde quiser.");
    } catch {
      transcricaoRef.current?.select();
      document.execCommand("copy");
      mostrarAviso("Copiado.");
    }
  }, [textoEscolhido, mostrarAviso]);

  const enviarParaCampo = useCallback(() => {
    const texto = textoEscolhido();
    if (!texto) return;
    setProntuario((p) => ({ ...p, [destino]: p[destino] ? `${p[destino]}\n${texto}` : texto }));
    const label = CAMPOS.find((c) => c.id === destino)?.label ?? destino;
    mostrarAviso(`Texto inserido em "${label}".`);
  }, [textoEscolhido, destino, mostrarAviso]);

  const limpar = useCallback(() => {
    if (!transcricao || window.confirm("Apagar toda a transcrição?")) {
      setTranscricao("");
      setParcial("");
    }
  }, [transcricao]);

  const totalPalavras = transcricao.trim() ? transcricao.trim().split(/\s+/).length : 0;

  return (
    <div className="page-stack">
      <PageHeader
        title="Atendimento com transcrição (piloto)"
        subtitle="Tela de teste — nada aqui é salvo no prontuário real nem no banco de dados"
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (window.confirm("Limpar o prontuário de teste?")) setProntuario(PRONTUARIO_VAZIO);
            }}
          >
            Novo prontuário de teste
          </button>
        }
      />

      <div className="page-body scroll-interno--pagina">
        {!suportado ? (
          <div className="mb-4 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            Este navegador não tem reconhecimento de voz. Abra o MedPronto no <b>Google Chrome</b> ou no{" "}
            <b>Microsoft Edge</b>.
          </div>
        ) : null}

        {suportado && enderecoBloqueado ? (
          <div className="mb-4 flex flex-wrap items-start gap-4 rounded-[var(--radius)] border-2 border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3">
            <div className="min-w-0 flex-1 text-sm text-[var(--text-2)]">
              <p className="font-semibold text-[var(--warn)]">Microfone bloqueado neste computador</p>
              <p className="mt-1">
                O MedPronto está aberto pelo endereço da rede (<b>{window.location.origin}</b>) e o navegador só libera o
                microfone em endereço seguro. Para liberar <b>uma única vez</b> neste computador:
              </p>
              <ol className="mt-1 list-decimal pl-5">
                <li>Clique em <b>Liberar microfone neste computador</b> e abra o arquivo baixado.</li>
                <li>
                  Confirme o pedido de administrador do Windows. Se aparecer "O Windows protegeu o computador", clique em{" "}
                  <b>Mais informações → Executar assim mesmo</b>.
                </li>
                <li>
                  Feche <b>todas</b> as janelas do Chrome e do Edge e abra o MedPronto de novo.
                </li>
              </ol>
            </div>
            <a className="btn btn-primary btn-sm shrink-0" href={urlLiberador} download>
              <Mic size={16} /> Liberar microfone neste computador
            </a>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          {/* ---------- Prontuário de teste ---------- */}
          <section className="flex min-h-0 flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-sm)]">
            <h3 className="text-base font-semibold text-[var(--text)]">Prontuário de teste</h3>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-[var(--text-2)]">Paciente</span>
                <input
                  className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                  value={paciente}
                  onChange={(e) => setPaciente(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-[var(--text-2)]">Idade</span>
                <input
                  className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                  value={idade}
                  onChange={(e) => setIdade(e.target.value)}
                />
              </label>
            </div>
            {CAMPOS.map((c) => (
              <label key={c.id} className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-[var(--text-2)]">{c.label}</span>
                <textarea
                  rows={c.linhas}
                  className="w-full resize-y rounded-md border border-[var(--border)] px-3 py-2 text-sm leading-relaxed focus:border-[var(--accent)] focus:outline-none"
                  value={prontuario[c.id]}
                  onChange={(e) => setProntuario((p) => ({ ...p, [c.id]: e.target.value }))}
                />
              </label>
            ))}
          </section>

          {/* ---------- Transcrição ---------- */}
          <section className="flex min-h-0 flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-[var(--text)]">Transcrição da conversa</h3>
              <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                {ligado ? (
                  <span className="flex items-center gap-1.5 font-semibold text-[var(--danger)]">
                    <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--danger)]" />
                    Gravando {formatarDuracao(segundos)}
                  </span>
                ) : null}
                <span>{totalPalavras} palavras</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ligado ? (
                <button type="button" className="btn btn-sm" style={{ background: "var(--danger)", color: "#fff" }} onClick={desligar}>
                  <MicOff size={16} /> Desligar transcrição
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!suportado || enderecoBloqueado}
                  title={enderecoBloqueado ? "Libere o microfone neste computador (aviso acima)" : undefined}
                  onClick={ligar}
                >
                  <Mic size={16} /> Ligar transcrição
                </button>
              )}
              <label className="ml-1 flex items-center gap-1.5 text-xs text-[var(--text-2)]">
                <input type="checkbox" checked={comHorario} onChange={(e) => setComHorario(e.target.checked)} />
                Marcar horário em cada fala
              </label>
            </div>

            {erro ? (
              <div className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                {erro}
              </div>
            ) : null}

            <textarea
              ref={transcricaoRef}
              className="min-h-[18rem] w-full flex-1 resize-y rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm leading-relaxed focus:border-[var(--accent)] focus:outline-none"
              placeholder={
                suportado
                  ? "Clique em \"Ligar transcrição\" e converse normalmente com o paciente. O texto aparece aqui e pode ser editado."
                  : ""
              }
              value={transcricao}
              onChange={(e) => setTranscricao(e.target.value)}
            />
            {parcial ? (
              <p className="-mt-1 text-sm italic text-[var(--muted)]">… {parcial}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
              <button type="button" className="btn btn-secondary btn-sm" disabled={!transcricao.trim()} onClick={copiar}>
                <Copy size={16} /> Copiar
              </button>
              <span className="text-xs text-[var(--muted)]">ou</span>
              <select
                className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                value={destino}
                onChange={(e) => setDestino(e.target.value as CampoProntuario)}
              >
                {CAMPOS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!transcricao.trim()} onClick={enviarParaCampo}>
                <Send size={16} /> Inserir no prontuário
              </button>
              <button type="button" className="btn btn-sm ml-auto" disabled={!transcricao} onClick={limpar}>
                <Eraser size={16} /> Limpar
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Dica: selecione só um trecho da transcrição antes de copiar/inserir para levar apenas aquela parte.
              {aviso ? <span className="ml-2 font-semibold text-[var(--accent)]">{aviso}</span> : null}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
