import { useEffect, useReducer, useRef, useState } from 'react';
import { Menu, Radio, Info, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { InputBar } from './InputBar';
import { ARCHIVE_KEY, archiveReducer, createConversation, createId, loadArchive } from './archive';
import type { ApiResponse } from './types';

function loadSavedChats() {
  try { return loadArchive(window.localStorage); }
  catch { return { ...loadArchive(), warning: 'Browser storage is unavailable. Chats will only last for this visit.' }; }
}

export function ChatApp() {
  const [initial] = useState(loadSavedChats);
  const [archive, dispatch] = useReducer(archiveReducer, initial.archive);
  const [input, setInput] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pending = useRef<{ id: string; controller: AbortController } | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(initial.warning ?? null);
  const storageWarning = useRef(false);
  const chat = archive.conversations.find((item) => item.id === archive.activeId)!;

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch('/api', { signal: controller.signal })
      .then((response) => { if (!disposed) setOnline(response.ok); })
      .catch(() => { if (!disposed) setOnline(false); })
      .finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, []);

  useEffect(() => {
    // Preserve an unreadable archive; do not silently replace it with an empty one.
    if (initial.warning) return;
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive)); }
    catch {
      if (!storageWarning.current) setToast('Browser storage is full or disabled. New changes cannot be saved on this device.');
      storageWarning.current = true;
    }
  }, [archive, initial.warning]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => { pending.current?.controller.abort(); }, []);

  const sendMessage = async (quickPrompt?: string) => {
    const text = (quickPrompt ?? input).trim();
    if (!text || pending.current) return;
    const id = chat.id;
    const controller = new AbortController();
    pending.current = { id, controller };
    setPendingId(id);
    dispatch({ type: 'append', id, message: { id: createId(), role: 'user', message: text, createdAt: Date.now() } });
    setInput('');
    setMobileOpen(false);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, message: text }), signal: controller.signal,
      });
      setOnline(true); // HTTP errors still mean the API is reachable.
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Server returned ${response.status}`);
      if (!payload || typeof payload.message !== 'string') throw new Error('The server returned an invalid reply. Please try again.');
      const result = payload as ApiResponse;
      dispatch({ type: 'append', id, message: { id: createId(), role: 'assistant', message: result.message,
        intent: result.intent, responseType: result.responseType, routingSource: result.routingSource,
        data: result.data, createdAt: Date.now() } });
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return;
      if (error instanceof TypeError) setOnline(false);
      setToast(timedOut ? 'The reply took too long. Please try again.' : error instanceof Error ? error.message : 'Unable to reach the assistant.');
    } finally {
      clearTimeout(timer);
      if (pending.current?.controller === controller) { pending.current = null; setPendingId(null); }
    }
  };

  const selectChat = (id: string) => {
    dispatch({ type: 'select', id }); setInput(''); setMobileOpen(false);
  };
  const newChat = () => {
    dispatch({ type: 'new', conversation: createConversation() }); setInput(''); setMobileOpen(false);
  };
  const deleteChat = (id: string) => {
    if (pending.current?.id === id) {
      pending.current.controller.abort(); pending.current = null; setPendingId(null);
    }
    dispatch({ type: 'delete', id, fallback: createConversation() });
    if (id === chat.id) setInput('');
    setToast('Conversation removed from this browser. Server history is unchanged.');
  };

  return (
    <main className="relative flex h-dvh overflow-hidden bg-[#0c0e12] text-[#edf0f4]">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} messageCount={chat.messages.length}
        conversations={archive.conversations} activeId={chat.id} pendingId={pendingId}
        onSelectChat={selectChat} onDeleteChat={deleteChat}
        onCollapse={() => setCollapsed((value) => !value)} onMobileClose={() => setMobileOpen(false)}
        onNewChat={newChat} onQuickPrompt={(prompt) => void sendMessage(prompt)} />
      <section className={`relative flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ${collapsed ? 'md:ml-[76px]' : 'md:ml-[286px]'}`}>
        <header className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[#20252d]/90 bg-[#0c0e12]/80 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Button aria-label="Open sidebar" className="md:hidden" size="icon" variant="ghost" onClick={() => setMobileOpen(true)}><Menu /></Button>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{chat.title}</p><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#5e6774]">{pendingId && pendingId !== chat.id ? 'Reply finishing in another conversation' : 'Context router · v1'}</p></div>
          </div>
          <div role="status" className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.13em] ${online === true ? 'border-[#294031] bg-[#142219] text-[#a9efbd]' : online === false ? 'border-[#472d30] bg-[#211416] text-[#ff8e88]' : 'border-[#2b313b] bg-[#15181e] text-[#747d89]'}`}>
            {online === false ? <WifiOff size={11} /> : <Radio size={11} className={online ? 'animate-pulse' : ''} />}{online === null ? 'Checking' : online ? 'API online' : 'Offline'}
          </div>
        </header>
        <ChatArea messages={chat.messages} thinking={pendingId === chat.id} />
        <InputBar value={input} disabled={pendingId !== null} onChange={setInput} onSubmit={() => void sendMessage()} />
      </section>
      {toast && <div role="status" className="fixed bottom-28 right-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-[#343b47] bg-[#191d24] px-4 py-3 text-sm text-[#d8dde4] shadow-2xl sm:right-7"><Info size={15} className="shrink-0 text-[#ff8e88]" />{toast}</div>}
    </main>
  );
}
