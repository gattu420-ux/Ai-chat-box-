'use client';

import { Bot, ChevronLeft, Database, MessageSquarePlus, PanelLeftOpen, Sparkles, X, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';
import type { Conversation } from './types';
import { useState } from 'react';

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  messageCount: number;
  conversations: Conversation[];
  activeId: string;
  pendingId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onCollapse: () => void;
  onMobileClose: () => void;
  onNewChat: () => void;
  onQuickPrompt: (prompt: string) => void;
};

const QUICK_PROMPTS = ['Show recent orders', 'Revenue by region', 'List active accounts'];

export function Sidebar({ collapsed, mobileOpen, messageCount, conversations, activeId, pendingId, onSelectChat, onDeleteChat, onCollapse, onMobileClose, onNewChat, onQuickPrompt }: SidebarProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  return (
    <>
      {mobileOpen && <button aria-label="Close sidebar" className="fixed inset-0 z-30 bg-black/65 backdrop-blur-sm md:hidden" onClick={onMobileClose} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[286px] border-r border-[#232833] bg-[#101319] transition-[width,transform] duration-300 md:visible md:translate-x-0 ${mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'} ${collapsed ? 'md:w-[76px]' : 'md:w-[286px]'}`}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
          <div className="flex h-12 items-center justify-between px-2">
            <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? 'md:w-9' : ''}`}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#313846] bg-[#171b22] text-[#b8ffcd]"><Bot size={18} strokeWidth={1.8} /></span>
              <div className="min-w-0 whitespace-nowrap">
                <p className="text-sm font-semibold tracking-tight">Relay</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#697383]">universal interface</p>
              </div>
            </div>
            <Button aria-label="Close sidebar" className="md:hidden" size="icon" variant="ghost" onClick={onMobileClose}><X /></Button>
          </div>

          <Button className={`mt-5 h-10 justify-start border-[#303743] bg-[#171b22] text-[#dfe4ea] hover:bg-[#1d222b] ${collapsed ? 'md:justify-center md:px-0' : ''}`} variant="outline" onClick={onNewChat}>
            <MessageSquarePlus /> <span className={collapsed ? 'md:hidden' : ''}>New Chat</span>
          </Button>

          <div className={`mt-7 ${collapsed ? 'md:hidden' : ''}`}>
            <p className="px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#616a78]">Quick access</p>
            <div className="mt-2 space-y-1">
              {QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} disabled={pendingId !== null} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#9da5b1] transition hover:bg-[#181c23] hover:text-white disabled:opacity-40" onClick={() => onQuickPrompt(prompt)}>
                  <Sparkles size={14} strokeWidth={1.6} /> {prompt}
                </button>
              ))}
            </div>
          </div>

          <nav aria-label="Conversation history" className={`my-5 min-h-0 flex-1 overflow-y-auto ${collapsed ? 'md:hidden' : ''}`}>
            <p className="px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#616a78]">Conversations</p>
            <p className="mb-3 mt-1 px-2 text-[10px] text-[#616a78]">Saved on this browser</p>
            <ul className="space-y-1">
              {conversations.map((chat) => (
                <li key={chat.id} className={`rounded-lg border ${activeId === chat.id ? 'border-[#303b37] bg-[#19211d]' : 'border-transparent hover:bg-[#181c23]'}`}>
                  <div className="flex items-center gap-1 p-1">
                    <button aria-label={`Open conversation: ${chat.title}`} aria-current={activeId === chat.id ? 'page' : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-2 text-left focus-visible:outline focus-visible:outline-[#b8ffcd]"
                      onClick={() => { setDeletingId(null); onSelectChat(chat.id); }}>
                      <MessageSquare size={13} className={`shrink-0 ${pendingId === chat.id ? 'animate-pulse text-[#b8ffcd]' : 'text-[#727e8b]'}`} />
                      <span className="min-w-0"><span className="block truncate text-xs text-[#c8d0da]">{chat.title}</span><span className="mt-1 block text-[10px] text-[#6b7584]">{chat.messages.length} messages</span></span>
                    </button>
                    <Button aria-label={`Delete conversation: ${chat.title}`} title="Delete conversation" size="icon" variant="ghost" className="shrink-0 text-[#87909d] hover:text-[#ff9c96]" onClick={() => setDeletingId(chat.id)}><Trash2 size={13} /></Button>
                  </div>
                  {deletingId === chat.id && <div className="px-2 pb-3" role="group" aria-label="Confirm conversation deletion">
                    <p className="mb-2 text-[11px] text-[#a8b0bd]">Delete from this browser? This cannot be undone. Server history is not deleted.</p>
                    <div className="flex gap-2"><Button variant="outline" className="text-xs text-[#ffaaa4]" onClick={() => { onDeleteChat(chat.id); setDeletingId(null); }}>Delete chat</Button><Button variant="ghost" className="text-xs" onClick={() => setDeletingId(null)}>Cancel</Button></div>
                  </div>}
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-auto shrink-0 space-y-3">
            <div className={`rounded-xl border border-[#232833] bg-[#14171d] p-3 ${collapsed ? 'md:grid md:place-items-center md:p-2.5' : ''}`}>
              <div className="flex items-center gap-2.5">
                <Database size={15} className="text-[#b8ffcd]" />
                <span className={`font-mono text-[10px] uppercase tracking-[0.12em] text-[#7c8593] ${collapsed ? 'md:hidden' : ''}`}>Gemini + MongoDB</span>
              </div>
              <p className={`mt-2 text-xs text-[#5f6875] ${collapsed ? 'md:hidden' : ''}`}>{messageCount ? `${messageCount} messages in this session` : 'Context-aware routing is ready'}</p>
            </div>
            <Button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden w-full justify-center text-[#697383] hover:text-white md:flex" variant="ghost" onClick={onCollapse}>
              {collapsed ? <PanelLeftOpen /> : <><ChevronLeft /><span>Collapse</span></>}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
