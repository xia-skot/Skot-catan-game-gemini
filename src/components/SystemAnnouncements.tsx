import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Bell, BrushCleaning, Edit3, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { useBackHandler } from '../navigation';

interface Announcement {
  id: string; title: string; content: string; date?: string; read?: boolean; revision?: number;
}

interface Props {
  messages: Announcement[];
  loading: boolean;
  isAdmin: boolean;
  isActive: boolean;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onDelete: (event: React.MouseEvent, id: string) => void;
  onPublish: (draft: { id?: string; title: string; content: string; revision?: number }) => Promise<void>;
}

export function SystemAnnouncements({ messages, loading, isAdmin, isActive, onRead, onReadAll, onDelete, onPublish }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id?: string; title: string; content: string; revision?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = messages.find(message => message.id === selectedId);
  useBackHandler(isActive && !!draft, () => { if (!saving) setDraft(null); return true; }, 105);
  useBackHandler(isActive && !!selected && !draft, () => { setSelectedId(null); return true; }, 95);
  const edit = (message?: Announcement) => {
    setError('');
    setDraft(message ? { id: message.id, title: message.title, content: message.content, revision: message.revision || 1 }
      : { title: '', content: '' });
  };
  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving || !draft.title.trim() || !draft.content.trim()) return;
    setSaving(true);
    setError('');
    try { await onPublish(draft); setDraft(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '发布失败，请检查网络'); }
    finally { setSaving(false); }
  };
  const tools = (message: Announcement) => isAdmin && <>
    <button type="button" onClick={event => { event.stopPropagation(); edit(message); }} title="编辑公告" aria-label={`编辑公告：${message.title}`}
      className="p-2 text-slate-500 hover:text-indigo-600"><Edit3 size={16} /></button>
    <button type="button" onClick={event => onDelete(event, message.id)} title="删除公告" aria-label={`删除公告：${message.title}`}
      className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
  </>;
  return <section className="w-full min-w-0 text-slate-800" data-system-announcements>
    {selected ? <article data-announcement-detail>
      <h2 className="text-lg font-bold break-words">{selected.title}</h2>
      <p className="text-xs text-slate-400 mt-2 mb-6">{selected.date?.split(/[ T]/)[0]}</p>
      <div className="text-sm leading-7 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{selected.content}</div>
    </article> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <h3 className="text-sm font-bold flex items-center gap-2"><Bell size={18} className="text-indigo-500" />系统公告与通知
          <span className="text-xs font-normal text-slate-400">{messages.length} 条</span></h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onReadAll} title="一键已读" aria-label="一键已读"
            disabled={loading || !messages.some(message => !message.read)}
            className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:text-slate-300 disabled:hover:bg-transparent">
            <BrushCleaning size={20} strokeWidth={1.8} />
          </button>
          {isAdmin && <button type="button" onClick={() => edit()} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg">
            <Plus size={16} />发布系统公告</button>}
        </div>
      </div>
      {loading && (!messages.length || !messages.every(message => typeof message.content === 'string')) ? <div className="py-12 flex justify-center"><Loader2 size={22} className="animate-spin text-slate-400" /></div>
        : messages.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">暂无系统公告或系统通知</p>
        : messages.map(message => <div key={message.id} className="flex items-center gap-2 border-b border-slate-200/70 py-3">
          <button type="button" onClick={() => { setSelectedId(message.id); if (!message.read) onRead(message.id); }}
            className="flex-1 min-w-0 text-left py-2 flex items-start justify-between gap-3">
            <span className="flex items-start gap-2 min-w-0">
              {!message.read && <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0 mt-1.5" aria-label="未读" />}
              <span className="text-sm font-bold break-words">{message.title}</span>
            </span>
            <span className="shrink-0 text-[10px] text-slate-400 whitespace-nowrap">{message.date?.split(/[ T]/)[0]}</span>
          </button>
          <div className="flex shrink-0">{tools(message)}</div>
        </div>)}
    </>}
    {draft && isActive && createPortal(<form onSubmit={publish} data-announcement-editor aria-label={draft.id ? '编辑系统公告' : '发布系统公告'}
      className="fixed inset-0 z-[250] bg-white flex flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
        <button type="button" onClick={() => setDraft(null)} disabled={saving} title="返回公告" aria-label="返回公告" className="p-2 -ml-2 text-slate-500 disabled:opacity-40"><ArrowLeft size={20} /></button>
        <h2 className="text-sm font-bold text-slate-800">{draft.id ? '编辑系统公告' : '发布系统公告'}</h2>
        <button type="submit" disabled={saving || !draft.title.trim() || !draft.content.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{draft.id ? '重新发布' : '发布'}</button>
      </div>
      <input aria-label="公告标题" placeholder="标题" required value={draft.title} disabled={saving}
        onChange={event => setDraft({ ...draft, title: event.target.value })}
        className="w-full px-5 py-4 text-lg font-bold text-slate-800 outline-none border-b border-slate-100 shrink-0" />
      <textarea aria-label="公告内容" placeholder="内容" required value={draft.content} disabled={saving}
        onChange={event => setDraft({ ...draft, content: event.target.value })}
        className="w-full flex-1 min-h-0 resize-none px-5 py-4 text-sm leading-7 text-slate-700 outline-none overflow-y-auto" />
      {error && <p role="alert" className="px-5 py-3 text-sm text-red-600 shrink-0">{error}</p>}
    </form>, document.body)}
  </section>;
}
