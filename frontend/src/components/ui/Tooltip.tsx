// UI Tooltip component: shows a small tooltip on hover/focus around its children
import React, { useState } from 'react';

interface TooltipProps {
  text?: string | null;
  className?: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, className = '', children }) => {
  const [open, setOpen] = useState(false);
  const safeText = typeof text === 'string' && text.trim().length > 0 ? text : null;

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-label={safeText || undefined}
    >
      {children}
      {safeText && (
        <span
          className={`pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-50 whitespace-nowrap rounded-md bg-gray-900 text-gray-100 text-xs px-2 py-1 border border-white/10 shadow-lg transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-0'}`}
          role="tooltip"
        >
          {safeText}
        </span>
      )}
    </span>
  );
};

export default Tooltip;
