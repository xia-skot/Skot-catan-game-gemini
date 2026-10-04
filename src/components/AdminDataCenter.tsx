import React, { useEffect, useState } from 'react';
import { RotateCw, Loader2, Users, User, ChevronRight, Database, Save, Search, ExternalLink } from 'lucide-react';
import { safeFetchJson } from '../fetchUtils';

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` });
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const inputClass = 'min-w-0 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm';
const displayDate = (date: string) => date && Number.isFinite(new Date(date).getTime())
  ? new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未知';

let analyticsPreview: { token: string; url: string; data: any; time: number } | null = null;

function useAdminQuery(url: string) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem('catan_auth_token') || '';
    const analytics = url.startsWith('/api/admin/analytics?');
    if (analyticsPreview?.token !== token) analyticsPreview = null;
    const preview = analytics && analyticsPreview?.url === url && Date.now() - analyticsPreview.time < 60000 ? analyticsPreview.data : null;
    setLoading(true); setError(''); setData(preview);
    (async () => {
      try {
        const response = await fetch(analytics && revision > 0 ? `${url}&refresh=1` : url, { headers: headers(), signal: controller.signal });
        const result = await safeFetchJson(response);
        if (!response.ok || !result) throw new Error(result?.error || '数据读取失败');
        if (!controller.signal.aborted) {
          setData(result);
          if (analytics) analyticsPreview = { token, url, data: result, time: Date.now() };
        }
      } catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [url, revision]);
  return { data, error, loading, reload: () => setRevision(value => value + 1) };
}

function Refresh({ loading, reload }: { loading: boolean; reload: () => void }) {
  return <button type="button" title="刷新数据" aria-label="刷新数据" disabled={loading} onClick={reload}
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-50">
    {loading ? <Loader2 size={18} className="animate-spin" /> : <RotateCw size={18} />}
  </button>;
}

export function AdminDataCenter({ onUsers, onGuests, onGateway, onStorage }: { onUsers: () => void; onGuests: () => void; onGateway: () => void; onStorage: () => void }) {
  const [period, setPeriod] = useState('day'), [date, setDate] = useState(today);
  const { data, error, loading, reload } = useAdminQuery(`/api/admin/analytics?period=${period}&date=${date}`);
  return <div className="space-y-5" data-admin-analytics>
    <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">北京时间 · 每周一开始 · 已完成对局</span><Refresh loading={loading} reload={reload} /></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <dl className="grid grid-cols-3 gap-x-3 gap-y-5 border-b border-slate-200 pb-5">
      {([['registered', '注册玩家'], ['guests', '游客账号'], ['games', '累计盘数'], ['today', '今日盘数'], ['week', '本周盘数'], ['month', '本月盘数']] as const).map(([key, label]) =>
        <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-800" data-metric={key}>{data ? data.totals[key].toLocaleString('zh-CN') : '—'}</dd></div>)}
    </dl>
    <div className="flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="analytics-period">统计周期</label>
      <select id="analytics-period" className={inputClass} value={period} onChange={event => setPeriod(event.target.value)}><option value="day">每日</option><option value="week">每周</option><option value="month">每月</option></select>
      <label className="sr-only" htmlFor="analytics-date">统计截止日期</label>
      <input id="analytics-date" type="date" min="2000-01-01" max={today()} className={`${inputClass} flex-1`} value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} />
    </div>
    <table className="w-full table-fixed text-xs" aria-label="对局统计"><thead><tr className="border-b border-slate-200 text-slate-500">
      <th className="w-[40%] py-3 text-left font-medium">{period === 'day' ? '日期' : '时间范围'}</th><th className="font-medium">盘数</th><th className="font-medium">新增注册</th><th className="font-medium">新增游客</th>
    </tr></thead><tbody>{data?.rows.map((row: any) => <tr key={row.start} className="border-b border-slate-100 tabular-nums">
      <td className="py-3 text-slate-600">{row.start}{period !== 'day' && <><br /><span className="text-slate-400">至 {row.end}</span></>}</td><td className="text-center font-semibold text-emerald-700">{row.games}</td><td className="text-center">{row.registered}</td><td className="text-center">{row.guests}</td>
    </tr>)}</tbody></table>
    {loading && <p role="status" className="text-center text-sm text-slate-500">{data ? '正在更新统计数据…' : '正在读取统计数据…'}</p>}
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {[[Users, '玩家名单', onUsers], [User, '游客名单', onGuests], [ExternalLink, '网址与流量', onGateway], [Database, '数据库空间', onStorage]].map(([Icon, label, action]: any) => <button key={label} type="button" onClick={action} className="flex w-full items-center gap-3 py-4 text-sm text-slate-700"><Icon size={18} /><span>{label}</span><ChevronRight size={18} className="ml-auto" /></button>)}
    </div>
  </div>;
}

export function AdminGuestList() {
  const { data, error, loading, reload } = useAdminQuery('/api/admin/guests');
  const [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const guests = (data?.guests || []).filter((guest: any) => `${guest.username} ${guest.id}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(guests.length / 25)), current = Math.min(page, pages);
  return <div className="space-y-4" data-admin-guests>
    <div className="flex items-center justify-between"><span className="text-sm text-slate-600">游客账号 {data ? data.guests.length : '—'}</span><Refresh loading={loading} reload={reload} /></div>
    <div className="flex items-center gap-2"><Search size={16} className="shrink-0 text-slate-400" /><input aria-label="搜索游客" placeholder="搜索昵称或账号 ID" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className={`${inputClass} w-full`} /></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <ul className="divide-y divide-slate-200">{guests.slice((current - 1) * 25, current * 25).map((guest: any) => <li key={guest.id} className="py-3" data-guest-id={guest.id}>
      <p className="break-all text-sm font-semibold text-slate-700">{guest.username}</p><p className="mt-1 break-all text-xs text-slate-400">ID: {guest.id}</p><p className="mt-1 text-xs text-slate-500">首次记录：{displayDate(guest.createdAt)}</p>
    </li>)}</ul>
    {!loading && !error && !guests.length && <p className="py-6 text-center text-sm text-slate-500">暂无匹配的游客</p>}
    {loading && <p role="status" className="text-sm text-slate-500">正在读取游客名单…</p>}
    {pages > 1 && <div className="flex items-center justify-between text-sm"><button disabled={current === 1} onClick={() => setPage(current - 1)} className="p-2 disabled:opacity-40">上一页</button><span>{current} / {pages}</span><button disabled={current === pages} onClick={() => setPage(current + 1)} className="p-2 disabled:opacity-40">下一页</button></div>}
  </div>;
}

const bytesLabel = (bytes: number | null | undefined) => typeof bytes === 'number' && Number.isFinite(bytes) ? `${(bytes / 1024 / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} MiB` : '未知';
export function DatabaseStorageSettings() {
  const { data, error, loading, reload } = useAdminQuery('/api/admin/database-storage');
  const [capacity, setCapacity] = useState(''), [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [saveError, setSaveError] = useState('');
  useEffect(() => { if (data) setCapacity(data.capacityBytes === null ? '' : String(data.capacityBytes / 1024 / 1024)); }, [data]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(''); setSaveError('');
    try {
      const response = await fetch('/api/admin/database-storage', { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ capacityMiB: capacity.trim() ? Number(capacity) : null }) });
      const result = await safeFetchJson(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || '保存失败');
      setMessage('容量上限已保存'); reload();
    } catch (error) { setSaveError((error as Error).message); }
    finally { setSaving(false); }
  }
  const percent = data?.capacityBytes && data.scope === 'cluster' ? Math.min(100, 100 * data.usedBytes / data.capacityBytes) : null;
  return <section className="space-y-3 border-b border-slate-200 pb-4" data-database-storage>
    <div className="flex items-center justify-between"><h4 className="flex items-center gap-2 text-xs font-bold text-slate-700"><Database size={14} className="text-emerald-600" />数据库空间</h4><Refresh loading={loading} reload={reload} /></div>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">{data?.scope === 'database' ? '当前数据库已用' : '集群已用（含索引）'}</dt><dd className="mt-1 font-semibold">{bytesLabel(data?.usedBytes)}</dd></div><div><dt className="text-slate-500">剩余空间（估算）</dt><dd className="mt-1 font-semibold text-emerald-700">{bytesLabel(data?.remainingBytes)}</dd></div></dl>
    {percent !== null && <progress aria-label="数据库容量使用率" value={percent} max="100" className="h-2 w-full accent-emerald-600" />}
    {data && data.capacityBytes === null && <p className="text-xs text-amber-700">套餐容量上限未知，暂无法计算剩余空间。</p>}
    {data?.scope === 'database' && <p className="text-xs text-amber-700">仅查到当前数据库用量，未获取集群总用量，暂不显示剩余空间。</p>}
    <form onSubmit={save} className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-xs text-slate-600">集群容量上限（MiB）<input aria-label="集群容量上限（MiB）" type="number" min="0.01" max="104857600" step="any" value={capacity} onChange={event => setCapacity(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
      <button type="submit" disabled={saving || loading} className="flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}保存容量</button>
    </form>
    <p className="text-xs text-slate-500">容量上限以数据库套餐为准；此设置仅用于估算，不会扩容。</p>
    {message && <p role="status" className="text-xs text-emerald-700">{message}</p>}{saveError && <p role="alert" className="text-xs text-red-600">{saveError}</p>}
  </section>;
}
