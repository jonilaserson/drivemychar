import React from 'react';

export function Tooltip({ label, children }: { label: string; children: React.ReactElement }) {
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const ref = React.useRef<HTMLSpanElement>(null);

  function updatePosition(target: HTMLElement) {
    const r = target.getBoundingClientRect();
    setPos({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top - 8) });
  }

  return (
    <span
      ref={ref}
      onMouseEnter={(e) => { setVisible(true); updatePosition(e.currentTarget as unknown as HTMLElement); }}
      onMouseLeave={() => setVisible(false)}
      onFocus={(e) => { setVisible(true); updatePosition(e.currentTarget as unknown as HTMLElement); }}
      onBlur={() => setVisible(false)}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {children}
      {visible && (
        <span className="tooltip" style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)' }}>{label}</span>
      )}
    </span>
  );
}


