import { useCallback, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

interface ChatFloatingButtonProps {
  unreadCount?: number;
  onClick: () => void;
}

/**
 * Botão flutuante do chat interno (arrastável).
 * Posição inicial: canto inferior direito.
 * O usuário pode arrastar o botão pela tela.
 * A posição NÃO é persistida (volta ao padrão ao recarregar).
 */
export function ChatFloatingButton({
  unreadCount = 0,
  onClick,
}: ChatFloatingButtonProps) {
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // only left click
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;

    const newX = Math.max(8, Math.min(window.innerWidth - 64, e.clientX - dragStart.current.x));
    const newY = Math.max(8, Math.min(window.innerHeight - 64, e.clientY - dragStart.current.y));

    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const handleClick = () => {
    // Só abre se não foi um drag
    if (!isDragging) {
      onClick();
    }
  };

  return (
    <button
      ref={buttonRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: "none",
        background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #0ea5e9 100%)",
        boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.55), 0 4px 10px -4px rgba(15, 23, 42, 0.3)",
      }}
      className={`fixed z-[60] flex h-14 w-14 cursor-grab items-center justify-center rounded-full text-white ring-4 ring-white/70 transition-all active:cursor-grabbing active:scale-95 ${isDragging ? "scale-105" : "hover:scale-110"}`}
      aria-label="Abrir chat interno (arraste para mover)"
    >
      <MessageCircle className="h-6 w-6" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-6 min-w-[1.5rem] items-center justify-center animate-pulse rounded-full bg-red-500 px-1.5 text-xs font-bold shadow-md ring-2 ring-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
