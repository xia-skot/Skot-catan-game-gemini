import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, Loader2, Send, Users, X } from 'lucide-react';
import { sortAdminPlayers, type PlayerSortField } from '../../shared/leaderboard';
import { useBackHandler } from '../navigation';

type Recipient = { id: string; username: string; isGuest: boolean; [key: string]: any };

export function PrivateRecipientPicker({ recipients, onSingle, onSent }: {
  recipients: Recipient[]; onSingle: (recipient: Recipient) => void; onSent: () => void;
}) {
  const [open, setOpen] = useState(false), [compose, setCompose] = useState(false);
  const [rows, setRows] = useState<Recipient[]>([]), [loading, setLoading] = useState(false);
  const [multi, setMulti] = useState(false), [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(''), [kind, setKind] = useState('all');
  const [sort, setSort] = useState<PlayerSortField>('createdAt'), [descending, setDescending] = useState(true);
  const [content, setContent] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useBackHandler(open, () => { if (!busy) { if (compose) setCompose(false); else setOpen(false); } return true; }, 110);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('名单属性加载失败，请关闭后重试'); return response.json(); })
      .then(data => {
        if (!controller.signal.aborted) setRows([...data.allUsers || [], ...data.allGuests || []]
          .filter(user => user.role !== 'admin').map(user => ({ ...user, id: String(user._id), isGuest: user.isGuest === true || user.role === 'guest' })));
      }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open]);
  const filtered = rows.filter(user => (kind === 'all' || (kind === 'guests') === user.isGuest) &&
    `${user.username} ${user.id}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visible = sortAdminPlayers(filtered.map(user => ({ ...user, _id: user.id })), sort, descending ? 'desc' : 'asc');
  const selectedRows = rows.filter(row => selected.includes(row.id));
  const toggle = (id: string) => setSelected(previous => multi
    ? previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
    : [id]);
  async function send() {
    if (busy || !content.trim() || !selectedRows.length) return;
    setBusy(true); setError('');
    let delivered = 0;
    const failed: string[] = [];
    const token = localStorage.getItem('catan_auth_token');
    for (const recipient of selectedRows) {
      if (!mounted.current) return;
      try {
        const response = await fetch('/api/admin/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: '私信', content: content.trim(), targetUserId: recipient.id }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error();
        delivered++;
      } catch { failed.push(recipient.id); }
    }
    if (!mounted.current) return;
    setBusy(false); onSent();
    setNotice(`已发送 ${delivered} 人${failed.length ? `，${failed.length} 人发送失败或结果未确认` : ''}`);
    if (failed.length) {
      setSelected(failed);
      setError('仅保留未确认的收件人。网络中断时可能已送达，请核对聊天记录后再发送，避免重复。');
    } else { setOpen(false); setCompose(false); setContent(''); setSelected([]); }
  }
  const control = 'h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm';
  return <>
    <button type="button" onClick={() => { setRows(recipients); setSelected([]); setCompose(false); setSearch(''); setNotice(''); setOpen(true); }}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-indigo-700"><Users size={17} />选择私信对象</button>
    {notice && <p role="status" className="text-xs text-slate-600">{notice}</p>}
    {open && createPortal(<div className="fixed inset-0 flex items-center justify-center bg-black/30 p-3" style={{ zIndex: 2147483600 }}>
      <section role="dialog" aria-modal="true" aria-label={compose ? '群发私信' : '选择私信对象'} className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 p-4"><h3 className="text-base font-semibold">{compose ? `群发私信 · ${selectedRows.length} 人` : '选择私信对象'}</h3>
          <button aria-label="关闭收件人选择" title="关闭" disabled={busy} onClick={() => setOpen(false)} className="p-2 disabled:opacity-40"><X size={18} /></button></header>
        {compose ? <div className="space-y-3 overflow-y-auto p-4">
          <p className="break-words text-sm text-slate-600">{selectedRows.map(row => row.username).join('、')}</p>
          <textarea aria-label="群发内容" placeholder="输入私信内容" value={content} disabled={busy} onChange={event => setContent(event.target.value)} rows={6} className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm" />
        </div> : <>
          <div className="space-y-3 border-b border-slate-200 p-4">
            <input aria-label="搜索私信对象" placeholder="搜索名称或 ID" value={search} onChange={event => setSearch(event.target.value)} className={`${control} w-full`} />
            <div className="flex gap-2"><select aria-label="收件人类别" value={kind} onChange={event => setKind(event.target.value)} className={control}><option value="all">全部</option><option value="players">玩家</option><option value="guests">游客</option></select>
              <select aria-label="收件人排序属性" value={sort} disabled={loading} onChange={event => setSort(event.target.value as PlayerSortField)} className={`${control} flex-1`}>
                <option value="createdAt">加入时间</option><option value="winRate">胜率</option><option value="totalGames">总盘数</option><option value="recent3DayGames">近三天盘数</option></select>
              <button aria-label={descending ? '降序，切换为升序' : '升序，切换为降序'} title={descending ? '降序' : '升序'} disabled={loading} onClick={() => setDescending(value => !value)} className={`${control} w-10 shrink-0 px-0 flex items-center justify-center`}>{descending ? <ArrowDown size={17} /> : <ArrowUp size={17} />}</button></div>
            <div className="flex items-center gap-3 text-sm"><div className="flex" role="group" aria-label="选择模式">{[false, true].map(value => <button key={String(value)} aria-pressed={multi === value} onClick={() => { setMulti(value); if (!value) setSelected(previous => previous.slice(0, 1)); }} className={`border px-3 py-1.5 ${multi === value ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}>{value ? '多选' : '单选'}</button>)}</div><span className="ml-auto text-xs text-slate-500">已选 {selected.length} 人</span></div>
          </div>
          <div className="min-h-24 overflow-y-auto px-4" data-recipient-list>
            {loading && <p role="status" className="py-2 text-xs text-slate-500">正在更新排序数据…</p>}
            {visible.map(user => <label key={user.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 py-3" data-recipient-id={user.id}>
              <input type={multi ? 'checkbox' : 'radio'} name="private-recipient" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} aria-label={`选择 ${user.username}`} className="h-4 w-4 shrink-0 accent-indigo-600" />
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-slate-800">{user.username}</span><span className="mt-1 block break-all text-[11px] leading-4 text-slate-500">{user.isGuest ? '游客' : '玩家'} · {user.id}</span></span>
            </label>)}
            {!loading && !visible.length && <p className="py-6 text-center text-sm text-slate-500">没有匹配的账号</p>}
          </div>
        </>}
        {error && <p role="alert" className="px-4 py-2 text-xs text-red-600">{error}</p>}
        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 p-4">
          {compose && <button disabled={busy} onClick={() => setCompose(false)} className="px-3 text-sm">重新选择</button>}
          <button disabled={busy || !selectedRows.length || (compose && !content.trim())} onClick={() => {
            if (compose) void send();
            else if (selectedRows.length === 1) { setOpen(false); onSingle(selectedRows[0]); }
            else setCompose(true);
          }} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : compose ? <Send size={16} /> : <Check size={16} />}{busy ? '发送中…' : compose ? '发送群发私信' : '确认'}</button>
        </footer>
      </section>
    </div>, document.body)}
  </>;
}
