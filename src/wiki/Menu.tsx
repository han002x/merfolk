import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

/** A button that opens a menu. Choosing a menu item closes it. */
export default function Menu({ label, className = 'wk-btn', align = 'start', button, children }: {
  /** names the button and its menu */
  label: string;
  className?: string;
  align?: 'start' | 'end';
  button: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const from = anchor.current;
    const menu = host.current;
    if (!open || !from || !menu) return;
    const stop = autoUpdate(from, menu, () => {
      void computePosition(from, menu, {
        placement: `bottom-${align}`,
        strategy: 'fixed',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
      });
    });
    menu.querySelector('button')?.focus();
    return stop;
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (host.current?.contains(target) || anchor.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return <>
    <button ref={anchor} type="button" className={className} aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {button}
    </button>
    {open && createPortal(
      <div ref={host} className="wk-menu" role="menu" aria-label={label}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('[role^="menuitem"]')) setOpen(false);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            anchor.current?.focus();
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = Array.from(host.current?.querySelectorAll('button') ?? []);
          const at = buttons.findIndex((button) => button === document.activeElement);
          const next = event.key === 'Home' ? 0
            : event.key === 'End' ? buttons.length - 1
            : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}>
        {children}
      </div>,
      document.body,
    )}
  </>;
}
