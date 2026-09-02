'use client';

import { useEffect, useRef } from 'react';
import { ArrowDown, Orbit } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import type { Message } from './types';

export function ChatArea({ messages, thinking }: { messages: Message[]; thinking: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, thinking]);

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-44 pt-24 sm:px-7 md:pt-20">
      <div className="mx-auto w-full max-w-4xl">
        {messages.length === 0 ? (
          <section className="flex min-h-[58vh] flex-col justify-center py-12">
            <div className="mb-7 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#67717f]"><Orbit size={15} className="text-[#b8ffcd]" /> Routed intelligence</div>
            <h1 className="max-w-2xl text-balance text-[clamp(2.35rem,6vw,5rem)] font-medium leading-[.95] tracking-[-0.055em] text-[#e9ecef]">Ask the system.<br /><span className="text-[#68717d]">Follow the evidence.</span></h1>
            <p className="mt-7 max-w-lg text-sm leading-6 text-[#7f8895]">One conversation across your data and AI tools. Queries are routed to the right source automatically.</p>
            <div className="mt-10 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#515a68]"><ArrowDown size={12} /> Start with a question below</div>
          </section>
        ) : (
          <div className="space-y-9 py-6">{messages.map((message) => <MessageBubble key={message.id} item={message} />)}</div>
        )}
        {thinking && (
          <div className="mt-8 flex items-center gap-3.5" aria-label="Assistant is thinking">
            <div className="grid size-8 place-items-center rounded-lg border border-[#2b323d] bg-[#171b22] text-[#b8ffcd]"><Orbit size={15} className="animate-spin [animation-duration:2.5s]" /></div>
            <div className="flex gap-1.5 rounded-full border border-[#242a33] bg-[#13161b] px-4 py-3">{[0, 1, 2].map((dot) => <span key={dot} className="size-1 rounded-full bg-[#9aa3af]" style={{ animation: `thinking 1.15s ${dot * 140}ms infinite` }} />)}</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
