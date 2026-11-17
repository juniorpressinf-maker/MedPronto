import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "dompurify";
import { Bold, Heading3, Italic, List, ListOrdered, Redo2, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import { useEffect } from "react";
import "../texto-formatado.css";

/** Mesmas tags que o servidor aceita (backend/src/services/textoFormatado.ts). */
const TAGS_PERMITIDAS = ["p", "br", "strong", "em", "u", "ul", "ol", "li", "h3"];

export function limparHtml(html: string): string {
  return DOMPurify.sanitize(html ?? "", { ALLOWED_TAGS: TAGS_PERMITIDAS, ALLOWED_ATTR: [] });
}

/** Mostra texto formatado já gravado (histórico, consulta finalizada). */
export function TextoFormatadoLeitura({ html, className }: { html: string; className?: string }) {
  const limpo = limparHtml(html);
  if (!limpo.replace(/<[^>]*>/g, "").trim()) {
    return <p className="text-sm text-[var(--muted)] m-0">—</p>;
  }
  return <div className={`tf-conteudo ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: limpo }} />;
}

type Props = {
  valor: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
};

function Botao({
  ativo,
  titulo,
  onClick,
  children,
}: {
  editor: Editor;
  ativo?: boolean;
  titulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tf-botao${ativo ? " tf-botao--ativo" : ""}`}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      // mousedown: não tira o foco/seleção do texto
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Editor do campo "Texto formatado": negrito, itálico, sublinhado, título, listas.
 * Gera HTML restrito (o servidor limpa de novo ao salvar). Folha grande que cresce com o texto.
 */
export function EditorTextoFormatado({ valor, onChange, readOnly, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        code: false,
        codeBlock: false,
        blockquote: false,
        strike: false,
        horizontalRule: false,
      }),
      Underline,
    ],
    content: limparHtml(valor),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "tf-conteudo tf-editavel",
        "aria-label": placeholder ?? "Texto do prontuário",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : ed.getHTML();
      onChange(html);
    },
  });

  // Valor trocado por fora (outro prontuário carregado): atualiza sem mexer enquanto digita.
  useEffect(() => {
    if (!editor) return;
    const atual = editor.isEmpty ? "" : editor.getHTML();
    if (limparHtml(valor) !== limparHtml(atual)) {
      editor.commands.setContent(limparHtml(valor), false);
    }
  }, [valor, editor]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [readOnly, editor]);

  if (!editor) return null;

  return (
    <div className={`tf-editor${readOnly ? " tf-editor--leitura" : ""}`}>
      {!readOnly && (
        <div className="tf-barra" role="toolbar" aria-label="Formatação">
          <Botao editor={editor} titulo="Negrito (Ctrl+B)" ativo={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </Botao>
          <Botao editor={editor} titulo="Itálico (Ctrl+I)" ativo={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </Botao>
          <Botao editor={editor} titulo="Sublinhado (Ctrl+U)" ativo={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-4 w-4" />
          </Botao>
          <span className="tf-separador" />
          <Botao editor={editor} titulo="Título" ativo={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="h-4 w-4" />
          </Botao>
          <Botao editor={editor} titulo="Lista" ativo={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </Botao>
          <Botao editor={editor} titulo="Lista numerada" ativo={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </Botao>
          <span className="tf-separador" />
          <Botao editor={editor} titulo="Desfazer (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-4 w-4" />
          </Botao>
          <Botao editor={editor} titulo="Refazer (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-4 w-4" />
          </Botao>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
