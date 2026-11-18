import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, MessageCircle, Search, Send, X } from "lucide-react";
import { useAuth } from "../lib/authContext";

interface Contato {
  id: number;
  nome: string;
  login: string;
  perfil: string;
  online: number;
  conversa_id: number | null;
  ultima_mensagem: string | null;
  ultima_remetente_id: number | null;
  ultima_em: string | null;
  nao_lidas: number;
  /** Muda quando a foto é trocada; null = sem foto (mostra as iniciais). */
  foto_versao: string | null;
}

function urlFoto(id: number, versao: string | null | undefined) {
  return versao ? `/api/chat/foto/${id}?v=${encodeURIComponent(versao)}` : null;
}

/** Recorta o centro da imagem em quadrado e reduz para 320px (JPEG), antes de enviar. */
function reduzirImagem(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - lado) / 2;
      const sy = (img.naturalHeight - lado) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 320, 320);
      ctx.drawImage(img, sx, sy, lado, lado, 0, 0, 320, 320);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Formato de imagem não suportado. Use JPG ou PNG."));
    };
    img.src = url;
  });
}

interface Mensagem {
  id: number;
  remetente_id: number;
  remetente_nome: string;
  texto: string;
  criado_em: string;
}

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

const GRADIENTE_TOPO = "linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #0ea5e9 100%)";
const GRADIENTE_MINHA = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";

/** Cores dos avatares (fundo suave + texto forte), escolhidas pelo nome. */
const CORES_AVATAR = [
  ["#dbeafe", "#1d4ed8"],
  ["#dcfce7", "#15803d"],
  ["#fce7f3", "#be185d"],
  ["#ede9fe", "#6d28d9"],
  ["#ffedd5", "#c2410c"],
  ["#cffafe", "#0e7490"],
  ["#fef9c3", "#a16207"],
  ["#fee2e2", "#b91c1c"],
];

function corDoNome(nome: string) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}

function iniciais(nome: string) {
  const partes = nome
    .replace(/^(DRA?\.?)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const PERFIL_ROTULO: Record<string, { rotulo: string; fundo: string; cor: string }> = {
  medico: { rotulo: "Médico", fundo: "#dbeafe", cor: "#1d4ed8" },
  secretaria: { rotulo: "Secretária", fundo: "#fce7f3", cor: "#be185d" },
  admin: { rotulo: "Admin", fundo: "#ede9fe", cor: "#6d28d9" },
};

function paraData(s: string) {
  return new Date(s.replace(" ", "T"));
}

function horaCurta(s: string | null) {
  if (!s) return "";
  const d = paraData(s);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function rotuloDiaMensagem(d: Date) {
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

function Avatar({
  nome,
  online,
  foto,
  tamanho = 44,
  semStatus = false,
}: {
  nome: string;
  online?: boolean;
  foto?: string | null;
  tamanho?: number;
  semStatus?: boolean;
}) {
  const [fundo, cor] = corDoNome(nome);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [foto]);
  const mostrarFoto = !!foto && !falhou;
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      {mostrarFoto ? (
        <img
          src={foto!}
          alt={nome}
          className="h-full w-full rounded-full object-cover ring-2 ring-white shadow-sm"
          onError={() => setFalhou(true)}
          draggable={false}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-bold"
          style={{ background: fundo, color: cor, fontSize: tamanho * 0.36 }}
        >
          {iniciais(nome)}
        </div>
      )}
      {semStatus ? null : <span
        className="absolute bottom-0 right-0 rounded-full ring-2 ring-white"
        style={{
          width: tamanho * 0.28,
          height: tamanho * 0.28,
          background: online ? "#22c55e" : "#cbd5e1",
        }}
        title={online ? "Online" : "Offline"}
      />}
    </div>
  );
}

export function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  const { me } = useAuth();
  const meuId = me?.id ?? 0;

  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");

  const [contatoAberto, setContatoAberto] = useState<Contato | null>(null);
  const [conversaId, setConversaId] = useState<number | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Minha foto
  const [minhaFotoVersao, setMinhaFotoVersao] = useState<string | null>(null);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const carregarEu = useCallback(async () => {
    try {
      const r = await fetch("/api/chat/eu", { credentials: "include" });
      if (r.ok) setMinhaFotoVersao(((await r.json()) as { foto_versao: string | null }).foto_versao);
    } catch {
      /* silencioso */
    }
  }, []);

  const trocarFoto = async (arquivo: File) => {
    setSalvandoFoto(true);
    try {
      const foto = await reduzirImagem(arquivo);
      const r = await fetch("/api/chat/minha-foto", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { foto_versao?: string; error?: string };
      if (!r.ok) throw new Error(corpo.error ?? "Erro ao salvar a foto");
      setMinhaFotoVersao(corpo.foto_versao ?? null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar a foto");
    } finally {
      setSalvandoFoto(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  };

  const removerFoto = async () => {
    if (!window.confirm("Remover sua foto do chat?")) return;
    const r = await fetch("/api/chat/minha-foto", { method: "DELETE", credentials: "include" });
    if (r.ok) setMinhaFotoVersao(null);
  };

  const carregarContatos = useCallback(async () => {
    try {
      const r = await fetch("/api/chat/contatos", { credentials: "include" });
      if (r.ok) setContatos(await r.json());
    } catch {
      /* silencioso */
    }
  }, []);

  const carregarMensagens = useCallback(async (cid: number) => {
    try {
      const r = await fetch(`/api/chat/conversas/${cid}/mensagens`, { credentials: "include" });
      if (r.ok) setMensagens(await r.json());
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setContatoAberto(null);
      setConversaId(null);
      setMensagens([]);
      setTexto("");
      setBusca("");
      return;
    }
    setCarregando(true);
    void carregarContatos().finally(() => setCarregando(false));
    void carregarEu();
    const id = setInterval(() => void carregarContatos(), 5000);
    return () => clearInterval(id);
  }, [open, carregarContatos, carregarEu]);

  useEffect(() => {
    if (!conversaId) return;
    void carregarMensagens(conversaId);
    const id = setInterval(() => void carregarMensagens(conversaId), 3000);
    return () => clearInterval(id);
  }, [conversaId, carregarMensagens]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [mensagens.length]);

  // Esc fecha
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  /** Não lidas primeiro, depois quem está online; filtra pela busca. */
  const contatosVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contatos
      .filter((c) => !termo || c.nome.toLowerCase().includes(termo) || c.login.toLowerCase().includes(termo))
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const naoLidas = Number(b.c.nao_lidas > 0) - Number(a.c.nao_lidas > 0);
        if (naoLidas) return naoLidas;
        const online = Number(!!b.c.online) - Number(!!a.c.online);
        if (online) return online;
        return a.i - b.i;
      })
      .map((x) => x.c);
  }, [contatos, busca]);

  const totalOnline = contatos.filter((c) => c.online).length;

  const abrirContato = async (c: Contato) => {
    setContatoAberto(c);
    setMensagens([]);
    setTexto("");
    if (c.conversa_id) {
      setConversaId(c.conversa_id);
      return;
    }
    try {
      const r = await fetch("/api/chat/conversas", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outroUsuarioId: c.id }),
      });
      if (!r.ok) throw new Error();
      const { conversa_id } = await r.json();
      setConversaId(conversa_id);
    } catch {
      alert("Erro ao abrir conversa");
      setContatoAberto(null);
    }
  };

  const voltarParaLista = () => {
    setContatoAberto(null);
    setConversaId(null);
    setMensagens([]);
    setTexto("");
    void carregarContatos();
  };

  const enviarMensagem = async () => {
    if (!conversaId || !texto.trim() || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/chat/conversas/${conversaId}/mensagens`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim() }),
      });
      if (r.ok) {
        setTexto("");
        await carregarMensagens(conversaId);
      }
    } finally {
      setEnviando(false);
    }
  };

  if (!open) return null;

  const contatoAtual = contatoAberto ? contatos.find((c) => c.id === contatoAberto.id) ?? contatoAberto : null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="chat-fundo absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]" onClick={onClose} />

      <div className="chat-painel relative m-3 flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* ---------- Cabeçalho ---------- */}
        <div className="relative px-5 pb-4 pt-4 text-white" style={{ background: GRADIENTE_TOPO }}>
          <div className="flex items-center justify-between gap-3">
            {contatoAtual ? (
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={voltarParaLista}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Avatar
                  nome={contatoAtual.nome}
                  online={!!contatoAtual.online}
                  foto={urlFoto(contatoAtual.id, contatoAtual.foto_versao)}
                  tamanho={40}
                />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{contatoAtual.nome}</div>
                  <div className="text-xs text-white/80">{contatoAtual.online ? "● Online agora" : "Offline"}</div>
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-3">
                {/* Minha foto: clique para trocar */}
                <button
                  type="button"
                  className="group relative shrink-0 rounded-full"
                  title={minhaFotoVersao ? "Trocar minha foto" : "Colocar minha foto"}
                  disabled={salvandoFoto}
                  onClick={() => arquivoRef.current?.click()}
                >
                  <Avatar
                    nome={me?.username ?? "?"}
                    foto={urlFoto(meuId, minhaFotoVersao)}
                    tamanho={46}
                    semStatus
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-blue-700 shadow ring-2 ring-blue-600/30 transition group-hover:scale-110">
                    <Camera className="h-3 w-3" />
                  </span>
                  {salvandoFoto && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[10px] font-semibold">
                      …
                    </span>
                  )}
                </button>
                <input
                  ref={arquivoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void trocarFoto(f);
                  }}
                />
                <div className="min-w-0">
                  <div className="text-base font-semibold leading-tight">Chat interno</div>
                  <div className="text-xs text-white/80">
                    Olá, {me?.username} · {totalOnline} {totalOnline === 1 ? "pessoa online" : "pessoas online"}
                  </div>
                  {minhaFotoVersao ? (
                    <button
                      type="button"
                      className="mt-0.5 text-[11px] text-white/70 underline-offset-2 hover:text-white hover:underline"
                      onClick={() => void removerFoto()}
                    >
                      remover minha foto
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mt-0.5 text-[11px] text-white/70 underline-offset-2 hover:text-white hover:underline"
                      onClick={() => arquivoRef.current?.click()}
                    >
                      colocar minha foto
                    </button>
                  )}
                </div>
              </div>
            )}
            <button
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!contatoAtual && (
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={buscaRef}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  // Esc com texto: só limpa a busca (não fecha o chat)
                  if (e.key === "Escape" && busca) {
                    e.stopPropagation();
                    setBusca("");
                  }
                }}
                placeholder="Buscar pessoa…"
                className="w-full rounded-full border-0 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/60"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => {
                    setBusca("");
                    buscaRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-slate-600 transition hover:bg-slate-300 hover:text-slate-800"
                  aria-label="Limpar busca"
                  title="Limpar busca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ---------- Lista de contatos ---------- */}
        {!contatoAtual && (
          <div className="flex-1 overflow-auto bg-slate-50 px-3 py-3">
            {carregando && contatos.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">Carregando…</div>
            )}
            {!carregando && contatosVisiveis.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">
                {busca ? "Ninguém encontrado." : "Nenhum usuário disponível."}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {contatosVisiveis.map((c) => {
                const temNova = c.nao_lidas > 0;
                const previa = c.ultima_mensagem
                  ? `${c.ultima_remetente_id === meuId ? "Você: " : ""}${c.ultima_mensagem}`
                  : "Toque para conversar";
                const perfil = PERFIL_ROTULO[c.perfil];
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => void abrirContato(c)}
                    className={`group flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 transition hover:-translate-y-px hover:shadow-md ${
                      temNova ? "ring-blue-300" : "ring-slate-200/80 hover:ring-blue-200"
                    }`}
                  >
                    <Avatar nome={c.nome} online={!!c.online} foto={urlFoto(c.id, c.foto_versao)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm text-slate-800 ${temNova ? "font-bold" : "font-semibold"}`}>
                          {c.nome}
                        </span>
                        {perfil ? (
                          <span
                            className="shrink-0 rounded-full px-2 py-px text-[10px] font-semibold"
                            style={{ background: perfil.fundo, color: perfil.cor }}
                          >
                            {perfil.rotulo}
                          </span>
                        ) : null}
                      </div>
                      <div className={`mt-0.5 truncate text-xs ${temNova ? "font-medium text-slate-700" : "text-slate-500"}`}>
                        {previa}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`text-[11px] ${temNova ? "font-semibold text-blue-600" : "text-slate-400"}`}>
                        {horaCurta(c.ultima_em)}
                      </span>
                      {temNova && (
                        <span
                          className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                          style={{ background: GRADIENTE_MINHA }}
                        >
                          {c.nao_lidas}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- Conversa ---------- */}
        {contatoAtual && (
          <>
            <div
              className="flex-1 overflow-auto px-4 py-4"
              style={{
                background:
                  "radial-gradient(circle at 20% 0%, rgba(37,99,235,0.06), transparent 40%), radial-gradient(circle at 100% 100%, rgba(14,165,233,0.07), transparent 45%), #f8fafc",
              }}
            >
              {conversaId && mensagens.length === 0 && (
                <div className="mt-10 flex flex-col items-center gap-2 text-center text-sm text-slate-400">
                  <MessageCircle className="h-8 w-8 text-slate-300" />
                  Nenhuma mensagem ainda. Diga olá!
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {mensagens.map((m, i) => {
                  const isMine = m.remetente_id === meuId;
                  const data = paraData(m.criado_em);
                  const anterior = i > 0 ? paraData(mensagens[i - 1].criado_em) : null;
                  const novoDia = !anterior || anterior.toDateString() !== data.toDateString();
                  const mesmoAutor = !novoDia && i > 0 && mensagens[i - 1].remetente_id === m.remetente_id;
                  return (
                    <div key={m.id}>
                      {novoDia && (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">
                            {rotuloDiaMensagem(data)}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isMine ? "justify-end" : "justify-start"} ${mesmoAutor ? "" : "mt-1.5"}`}>
                        <div
                          className={`max-w-[80%] px-3.5 py-2 text-sm shadow-sm ${
                            isMine
                              ? "rounded-2xl rounded-br-md text-white"
                              : "rounded-2xl rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200"
                          }`}
                          style={isMine ? { background: GRADIENTE_MINHA } : undefined}
                        >
                          <div className="whitespace-pre-wrap break-words leading-relaxed">{m.texto}</div>
                          <div className={`mt-0.5 text-right text-[10px] ${isMine ? "text-white/70" : "text-slate-400"}`}>
                            {data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={messagesEndRef} />
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 bg-white p-3">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviarMensagem();
                  }
                }}
                placeholder="Escreva uma mensagem…"
                disabled={!conversaId}
                className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <button
                onClick={() => void enviarMensagem()}
                disabled={!conversaId || !texto.trim() || enviando}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-md transition hover:scale-105 hover:shadow-lg disabled:scale-100 disabled:opacity-40 disabled:shadow-none"
                style={{ background: GRADIENTE_MINHA }}
                aria-label="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
