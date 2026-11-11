'use client';
import { useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/* PromptWise slide button: a dark pill whose accent icon capsule slides to the
   far end on hover or focus while the label shifts into its place. */
export default function SlideButton({ icon, children, className, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) {
  const rowRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  function slide() {
    const row = rowRef.current, iconNode = iconRef.current, label = labelRef.current;
    if (!row || !iconNode || !label) return;
    iconNode.style.transform = `translateX(${Math.ceil(row.clientWidth) - iconNode.clientWidth}px)`;
    label.style.transform = `translateX(-${iconNode.clientWidth}px)`;
  }
  function reset() {
    if (iconRef.current) iconRef.current.style.transform = '';
    if (labelRef.current) labelRef.current.style.transform = '';
  }
  return <button
    {...props}
    className={['slide-button', className].filter(Boolean).join(' ')}
    onMouseEnter={e => { slide(); onMouseEnter?.(e); }}
    onMouseLeave={e => { reset(); onMouseLeave?.(e); }}
    onFocus={e => { slide(); onFocus?.(e); }}
    onBlur={e => { reset(); onBlur?.(e); }}
  >
    <span ref={rowRef} className="slide-button-row">
      <span ref={iconRef} className="slide-button-icon" aria-hidden="true">{icon}</span>
      <span ref={labelRef} className="slide-button-label">{children}</span>
    </span>
  </button>;
}

/* The pixel sparkle mark PromptWise places inside the capsule. */
export function SparkleMark({ size = 24 }: { size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
    <path d="M8 5H10V7H8V5Z" fill="currentColor"/>
    <path d="M11 8H13V10H11V8Z" fill="currentColor"/>
    <path d="M14 11H16V13H14V11Z" fill="currentColor"/>
    <path d="M11 14H13V16H11V14Z" fill="currentColor"/>
    <path d="M8 17H10V19H8V17Z" fill="currentColor"/>
  </svg>;
}
