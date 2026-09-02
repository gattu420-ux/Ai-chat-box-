'use client';

import { useEffect, useRef } from 'react';
import { ArrowUp, Command } from 'lucide-react';
import { Button } from '../ui/button';

type InputBarProps = { value: string; disabled: boolean; onChange: (value: string) => void; onSubmit: () => void };

export function InputBar({ value, disabled, onChange, onSubmit }: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0c0e12] via-[#0c0e12] to-transparent px-4 pb-5 pt-14 sm:px-7 sm:pb-7">
      <div className="pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-[#303744] bg-[#161a21]/95 p-2 shadow-[0_18px_70px_rgb(0_0_0/45%)] backdrop-blur-xl focus-within:border-[#48515f]">
        <textarea ref={textareaRef} value={value} rows={1} disabled={disabled} aria-label="Message" placeholder="Ask about orders, accounts, or anything else…" className="scrollbar-thin block max-h-40 min-h-12 w-full resize-none bg-transparent px-3 py-3 text-[15px] leading-6 text-[#eef1f5] placeholder:text-[#626b78] focus:outline-none disabled:opacity-60" onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSubmit(); } }} />
        <div className="flex items-center justify-between px-2 pb-1">
          <div className="hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#555f6c] sm:flex"><Command size={11} /> Enter to send · Shift + Enter for line break</div>
          <Button aria-label="Send message" className="ml-auto size-9 rounded-xl bg-[#e7e2d8] text-[#111318] hover:bg-white" size="icon" disabled={disabled || !value.trim()} onClick={onSubmit}><ArrowUp size={17} strokeWidth={2.2} /></Button>
        </div>
      </div>
    </div>
  );
}
