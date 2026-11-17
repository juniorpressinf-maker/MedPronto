import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, X } from "lucide-react";
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

function StatusOnline({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`}
      title={online ? "Online" : "Offline"}
    />
  );
}

export function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  const { me } = useAuth();
  const meuId = me?.id ?? 0;

  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(false);

  const [contatoAberto, setContatoAberto] = useState<Contato | null>(null);
  const [conversaId, setConversaId] = useState<number | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      return;
    }
    setCarregando(true);
    void carregarContatos().finally(() => setCarregando(false));
    const id = setInterval(() => void carregarContatos(), 5000);
    return () => clearInterval(id);
  }, [open, carregarContatos]);

  useEffect(() => {
    if (!conversaId) return;
    void carregarMensagens(conversaId);
    const id = setInterval(() => void carregarMensagens(conversaId), 3000);
    return () => clearInterval(id);
  }, [conversaId, carregarMensagens]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [mensagens.length]);

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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          {contatoAtual ? (
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={voltarParaLista} className="text-slate-600 hover:text-slate-900" aria-label="Voltar">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <StatusOnline online={!!contatoAtual.online} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{contatoAtual.nome}</div>
                <div className="text-[11px] text-slate-500">{contatoAtual.online ? "Online" : "Offline"}</div>
              </div>
            </div>
          ) : (
            <div className="font-semibold">Chat interno — {me?.username}</div>
          )}
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!contatoAtual && (
          <div className="flex-1 overflow-auto p-2">
            {carregando && contatos.length === 0 && (
              <div className="p-4 text-center text-sm text-slate-500">Carregando…</div>
            )}
            {!carregando && contatos.length === 0 && (
              <div className="p-4 text-center text-sm text-slate-500">Nenhum usuário disponível.</div>
            )}
            {contatos.map((c) => {
              const previa = c.ultima_mensagem
                ? `${c.ultima_remetente_id === meuId ? "Você: " : ""}${c.ultima_mensagem}`
                : `${c.login} • ${c.perfil}`;
              return (
                <div
                  key={c.id}
                  onClick={() => void abrirContato(c)}
                  className={`mb-1 flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-slate-50 active:bg-slate-100 ${c.nao_lidas > 0 ? "border-red-200 bg-red-50/40" : ""}`}
                >
                  <StatusOnline online={!!c.online} />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm ${c.nao_lidas > 0 ? "font-semibold" : "font-medium"}`}>{c.nome}</div>
                    <div className="truncate text-xs text-slate-500">{previa}</div>
                  </div>
                  {c.nao_lidas > 0 && (
                    <div className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {c.nao_lidas}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {contatoAtual && (
          <>
            <div className="flex-1 space-y-2 overflow-auto bg-slate-50 p-3">
              {conversaId && mensagens.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">Nenhuma mensagem ainda.</div>
              )}
              {mensagens.map((m) => {
                const isMine = m.remetente_id === meuId;
                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${isMine ? "rounded-br-none bg-brand-600 text-white" : "rounded-bl-none border bg-white"}`}>
                      <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                      <div className={`mt-1 text-[10px] ${isMine ? "text-white/70" : "text-slate-400"}`}>
                        {new Date(m.criado_em.replace(" ", "T")).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2 border-t bg-white p-3">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviarMensagem();
                  }
                }}
                placeholder="Escreva uma mensagem..."
                disabled={!conversaId}
                className="flex-1 rounded-full border px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                onClick={() => void enviarMensagem()}
                disabled={!conversaId || !texto.trim() || enviando}
                className="rounded-full bg-brand-600 p-2 text-white disabled:opacity-50"
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
