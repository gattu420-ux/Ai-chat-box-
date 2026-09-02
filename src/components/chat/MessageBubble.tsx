'use client';

import ReactMarkdown from 'react-markdown';
import { Bot, UserRound } from 'lucide-react';
import type { Message } from './types';

function DataValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-[#697383]">Not provided</span>;
  if (Array.isArray(value)) return value.length
    ? <ul className="space-y-1">{value.map((item, index) => <li key={index}><DataValue value={item} /></li>)}</ul>
    : <span className="text-[#697383]">No items</span>;
  if (typeof value === 'object') return <DataCard data={value as Record<string, unknown>} />;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  return <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{String(value)}</span>;
}

function DataCard({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (!entries.length) return <p className="text-xs text-[#697383]">No fields returned</p>;
  return <dl className="divide-y divide-[#242b35] rounded-xl border border-[#2a303a] bg-[#0e1116] text-xs">
    {entries.map(([key, value]) => <div key={key} className="grid grid-cols-1 gap-1.5 px-3 py-2.5 sm:grid-cols-[minmax(80px,1fr)_minmax(0,2fr)] sm:gap-4">
      <dt className="break-words font-mono text-[10px] uppercase tracking-wide text-[#788494]">{key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')}</dt>
      <dd className="min-w-0 text-[#c9d4df]"><DataValue value={value} /></dd>
    </div>)}
  </dl>;
}

export function DataView({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data) && data.length > 0 && data.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
    const columns = Array.from(new Set(data.flatMap((item) => Object.keys(item as Record<string, unknown>))));
    return (
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#2a303a] bg-[#0e1116]">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead className="border-b border-[#2a303a] font-mono uppercase tracking-[0.1em] text-[#697383]"><tr>{columns.map((column) => <th key={column} className="px-3 py-2.5 font-medium">{column}</th>)}</tr></thead>
          <tbody>{data.map((item, index) => <tr key={index} className="border-b border-[#20252d] last:border-0">{columns.map((column) => <td key={column} className="min-w-24 max-w-80 px-3 py-2.5 align-top text-[#b7bec8]"><DataValue value={(item as Record<string, unknown>)[column]} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return <section aria-label="Response data" className="mt-4 min-w-0 text-xs text-[#aab3bf]"><DataValue value={data} /></section>;
}

export function MessageBubble({ item }: { item: Message }) {
  const isUser = item.role === 'user';
  return (
    <article className={`group flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg border border-[#2b323d] bg-[#171b22] text-[#b8ffcd]"><Bot size={16} /></div>}
      <div className={`min-w-0 ${isUser ? 'max-w-[min(78%,680px)] rounded-[18px_18px_4px_18px] bg-[#222833] px-4 py-3 text-[#eef1f5]' : 'max-w-[min(88%,760px)] border-l border-[#303743] pl-4 text-[#cbd1da]'}`}>
        <div className="prose prose-invert max-w-none text-[14px] leading-7 prose-p:my-0 prose-pre:border prose-pre:border-[#2a303a] prose-pre:bg-[#0e1116] prose-code:font-mono prose-code:text-[#b8ffcd]">
          <ReactMarkdown>{item.message}</ReactMarkdown>
        </div>
        {!isUser && <DataView data={item.data} />}
        {!isUser && item.routingSource && (
          <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#626c7a]">
            <span className="rounded border border-[#272d37] bg-[#11141a] px-2 py-1">{item.routingSource}</span>
            {item.intent && <span>{item.intent.replaceAll('_', ' ')}</span>}
          </div>
        )}
      </div>
      {isUser && <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-[#343b47] bg-[#1b2028] text-[#9ea7b4]"><UserRound size={15} /></div>}
    </article>
  );
}
