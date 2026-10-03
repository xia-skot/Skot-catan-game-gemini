import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Send, Users, X, RefreshCw, Search, LogOut, Loader2 } from 'lucide-react';
import { socketService } from '../socketService';
import { navigateInvitation } from '../entrySessionBridge';
import type { RoomInvitation } from '../../shared/social';

export function InvitationBanner({ enabled, inRoom, onJoin }: { enabled: boolean; inRoom: boolean; onJoin: (invitation: RoomInvitation) => void }) {
  const [invitation, setInvitation] = useState<RoomInvitation | null>(null);
  const [remaining, setRemaining] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled || inRoom) { setInvitation(null); return; }
    const off = socketService.onSocial('room_invitation', (item: RoomInvitation) => {
      if (item.recipientId !== socketService.playerId || item.expiresAt <= Date.now()) return;
      setError(''); setBusy(false); setRemaining(Math.ceil((item.expiresAt - Date.now()) / 1000)); setInvitation(item);
    });
    const close = socketService.onSocial('invitation_closed', (id: string) => setInvitation(current => current?.id === id ? null : current));
    return () => { off(); close(); };
  }, [enabled, inRoom]);
  useEffect(() => {
    if (!invitation) return;
    const timer = window.setInterval(() => {
      const left = Math.ceil((invitation.expiresAt - Date.now()) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) setInvitation(null);
    }, 150);
    return () => clearInterval(timer);
  }, [invitation]);
  async function reply(accept: boolean) {
    if (!invitation || busy) return;
    const item = invitation;
    setBusy(true);
    if (!accept) setInvitation(null);
    const result = await socketService.socialRequest('invitation_reply', item.id, accept);
    setBusy(false);
    if (result?.error) { if (accept) setError(result.error); setInvitation(null); return; }
    if (accept) {
      setInvitation(null);
      if (socketService.hasRoomIntent()) return;
      if (item.origin === window.location.origin) onJoin(item);
      else try { navigateInvitation(item.origin, item.roomId, item.id); } catch (err: any) { setError(err.message); }
    }
  }
  if ((!invitation && !error) || !enabled || inRoom) return null;
  return createPortal(<aside aria-label="房间邀请" role="dialog" style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', width: 'min(420px, calc(100vw - 24px))', zIndex: 2147483600 }} className="overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-xl">
    <div className="flex items-start gap-3 p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Users size={20} /></span>
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-slate-800">{invitation ? `收到 ${invitation.hostName} 的邀请` : error}</p>
        {invitation && <><p className="mt-1 text-xs text-slate-500">房间 {invitation.roomId} · {remaining} 秒</p><div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => reply(true)} className="flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Check size={16} />加入</button><button disabled={busy} onClick={() => reply(false)} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600">拒绝</button></div></>}
      </div><button title="关闭邀请" aria-label="关闭邀请" onClick={() => invitation ? reply(false) : setError('')} className="p-1 text-slate-400"><X size={18} /></button></div>
    {invitation && <div className="h-1 origin-left bg-emerald-500 transition-transform duration-150" style={{ transform: `scaleX(${remaining / 10})` }} />}
  </aside>, document.body);
}

export function InviteOnlineButton({ roomId, disabled }: { roomId: string; disabled: boolean }) {
  const [until, setUntil] = useState(0);
  const [sent, setSent] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => socketService.onSocial('invitation_progress', info => { if (info.roomId === roomId) setSent(info.sent); }), [roomId]);
  useEffect(() => { if (!until) return; const t = setTimeout(() => setUntil(0), Math.max(0, until - Date.now())); return () => clearTimeout(t); }, [until]);
  return <div className="mt-2"><button disabled={disabled || busy || !!until} onClick={async () => {
    setBusy(true); setMessage('');
    try {
      const result = await socketService.socialRequest('invite_online', roomId);
      if (result?.error) setMessage(result.error);
      else { setSent(result.sent || 0); setUntil(Date.now() + 60000); }
    } catch {
      setMessage('邀请发送失败，请重试');
    } finally { setBusy(false); }
  }} aria-busy={busy} className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}<span aria-live="polite">{busy ? '正在邀请中…' : until ? `本轮已邀请 ${sent} 人` : '邀请在线玩家'}</span></button>{message && <p role="status" className="mt-1 text-xs text-amber-700">{message}</p>}</div>;
}

export function SpectatorExit({ onExit, anchor, rotated }: { onExit: () => void; anchor: HTMLElement | null; rotated: boolean }) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) { setRect(null); return; }
    const update = () => {
      const { left, top, width, height } = anchor.getBoundingClientRect();
      setRect(previous => previous && previous.left === left && previous.top === top && previous.width === width && previous.height === height ? previous : { left, top, width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    if (anchor.parentElement) observer.observe(anchor.parentElement);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [anchor, rotated]);
  // Keep the original toolbar position, outside every game/modal stacking context.
  return createPortal(<button onClick={onExit} aria-label="离开观战房间" title="离开观战房间" style={{ position: 'fixed', ...(rect || { top: 'max(8px, env(safe-area-inset-top))', left: 'max(8px, env(safe-area-inset-left))', width: 28, height: 28 }), zIndex: 2147483647, pointerEvents: 'auto' }} className="text-red-500 hover:text-red-600 flex items-center justify-center p-0.5"><LogOut size={13} strokeWidth={2.2} style={{ transform: `${rotated ? 'rotate(90deg) ' : ''}scaleX(-1)` }} /></button>, document.body);
}

const STATUS: Record<string, string> = { idle: '大厅空闲', waiting: '等待开局', playing: '游戏中', spectating: '观战中' };
export function AdminOnlinePlayers() {
  const [users, setUsers] = useState<any[]>([]), [error, setError] = useState(''), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  async function refresh(signal?: AbortSignal) {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/online', { signal, headers: { Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` }, cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '读取失败');
      setUsers(data.users || []); setError('');
    } catch (err: any) { if (err.name !== 'AbortError') setError(err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); refresh(controller.signal); const t = setInterval(() => refresh(controller.signal), 10000); return () => { controller.abort(); clearInterval(t); }; }, []);
  const visible = users.filter(u => `${u.username} ${u.accountId} ${u.roomId || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-4 text-sm"><b className="text-emerald-700">在线 {users.length}</b><span>注册玩家 {users.filter(u => !u.isGuest).length}</span><span>游客 {users.filter(u => u.isGuest).length}</span><button aria-label="刷新在线名单" title="刷新在线名单" disabled={loading} onClick={() => refresh()} className="ml-auto p-2"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button></div>
    <label className="flex items-center gap-2 border-b border-slate-200 pb-2"><Search size={16} className="text-slate-400" /><input aria-label="搜索在线玩家" value={search} onChange={e => setSearch(e.target.value)} placeholder="昵称、ID 或房间号" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <ul className="divide-y divide-slate-100">{visible.map(user => <li key={user.accountId} className="flex items-center gap-3 py-3"><span className={`h-2 w-2 shrink-0 rounded-full ${user.status === 'idle' ? 'bg-emerald-500' : 'bg-amber-500'}`} /><div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-slate-800"><span>{user.username}</span><span className="ml-2 text-xs font-normal text-slate-400">{user.isGuest ? '游客' : '玩家'}</span></p><p className="break-all text-[11px] text-slate-400">{user.accountId}</p></div><div className="shrink-0 text-right text-xs text-slate-500"><p>{STATUS[user.status] || user.status}</p>{user.roomId && <p className="mt-1 font-mono">{user.roomId}</p>}</div></li>)}</ul>
    {!loading && !error && !visible.length && <p className="py-8 text-center text-sm text-slate-400">暂无符合条件的在线玩家</p>}
  </section>;
}
