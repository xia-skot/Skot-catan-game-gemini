import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RotateCw, Save } from 'lucide-react';
import { DEFAULT_GATEWAY_CONFIG, GATEWAY_SLOTS, type GatewayConfig } from '../../shared/gateway';
import { safeFetchJson } from '../fetchUtils';

const labels = { early: '上旬（1—10 日）', middle: '中旬（11—20 日）', late: '下旬（21 日—月底）' };
export function GatewaySettings() {
  const [config, setConfig] = useState<GatewayConfig>(DEFAULT_GATEWAY_CONFIG);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [gateway, setGateway] = useState('');
  const [demo, setDemo] = useState(false);
  const [bandwidth, setBandwidth] = useState<any>(null);
  const [bandwidthError, setBandwidthError] = useState('');
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const loadBandwidth = async () => {
    setBandwidthError('');
    try {
      const response = await fetch('/api/admin/gateway/bandwidth', { headers: headers(), cache: 'no-store' });
      const data = await safeFetchJson(response);
      if (!response.ok) throw new Error(data.error || '带宽读取失败');
      setBandwidth(data);
    } catch (error) { setBandwidthError(error instanceof Error ? error.message : '读取失败'); }
  };
  const calibrate = async (id: string) => {
    if (busy || !totals[id]?.trim()) return;
    setBusy(true); setBandwidthError('');
    try {
      const response = await fetch('/api/admin/gateway/bandwidth', { method: 'PUT', headers: headers(), body: JSON.stringify({ id, usedGB: Number(totals[id]) }) });
      const data = await safeFetchJson(response);
      if (!response.ok) throw new Error(data.error || '补录失败');
      await loadBandwidth();
    } catch (error) { setBandwidthError(error instanceof Error ? error.message : '补录失败'); }
    finally { setBusy(false); }
  };
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}`, 'Content-Type': 'application/json' });
  const load = async () => {
    setReady(false); setError('');
    try {
      const response = await fetch('/api/admin/gateway', { headers: headers(), cache: 'no-store' });
      const data = await safeFetchJson(response);
      if (!response.ok) throw new Error(data.error || '读取失败');
      setConfig(data.config); setConfigured(data.configured); setGateway(data.gatewayUrl); setDemo(data.demo); setReady(true);
    } catch (error) { setError(error instanceof Error ? error.message : '读取失败'); }
  };
  useEffect(() => { void load(); void loadBandwidth(); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !ready || !configured) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/gateway', { method: 'PUT', headers: headers(), body: JSON.stringify(config) });
      const data = await safeFetchJson(response);
      if (!response.ok) throw new Error(data.error || '保存失败');
      setConfig(data.config); setMessage(demo ? '演示配置已保存，仅用于本地预览' : '已保存，全球入口同步可能需要约一分钟');
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  };
  return <form onSubmit={save} className="space-y-3 border-b border-slate-200 pb-4" aria-label="入口跳转设置">
    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2"><ExternalLink size={14} />入口跳转</h4>
    {ready && !configured && <p className="text-xs text-slate-500">尚未连接独立入口。请按部署说明配置服务器的 GATEWAY_URL 和 GATEWAY_ADMIN_TOKEN。</p>}
    {gateway && <a href="https://skot-game.onrender.com" className="block text-xs text-indigo-600 break-all">https://skot-game.onrender.com</a>}
    <fieldset disabled={!ready || !configured || saving} className="space-y-3 disabled:opacity-50">
      <label className="block text-xs">切换方式<select aria-label="切换方式" value={config.bandwidth?.enabled ? 'bandwidth' : config.enabled ? 'calendar' : 'fixed'}
        onChange={event => setConfig({ ...config, enabled: event.target.value === 'calendar', bandwidth: { quotaGB: config.bandwidth?.quotaGB ?? 5, reserveGB: config.bandwidth?.reserveGB ?? 0.7, enabled: event.target.value === 'bandwidth' } })}
        className="mt-1 block w-full border rounded-lg p-2"><option value="fixed">固定默认网址</option><option value="calendar">按月上、中、下旬</option><option value="bandwidth">按剩余带宽</option></select></label>
      {config.bandwidth && <div className="flex flex-wrap gap-3 text-xs">
        <label>每工作区月额度（GB）<input aria-label="月额度" type="number" min="0.2" max="1000" step="0.1" value={config.bandwidth.quotaGB} onChange={event => setConfig({ ...config, bandwidth: { ...config.bandwidth!, quotaGB: Number(event.target.value) } })} className="block w-28 border rounded p-2" /></label>
        <label>预留流量（GB）<input aria-label="预留流量" type="number" min="0.1" step="0.1" value={config.bandwidth.reserveGB} onChange={event => setConfig({ ...config, bandwidth: { ...config.bandwidth!, reserveGB: Number(event.target.value) } })} className="block w-28 border rounded p-2" /></label>
      </div>}
      <label className="block text-xs">默认网址<input aria-label="默认网址" type="url" required value={config.fallback} onChange={event => setConfig({ ...config, fallback: event.target.value })} className="mt-1 block w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm" /></label>
      {GATEWAY_SLOTS.map((slot, index) => {
        const row = bandwidth?.snapshot?.rows?.find((r: any) => r.origin === config.sites[slot]);
        const quota = config.bandwidth?.quotaGB ?? 5;
        return <div key={slot} className="text-xs space-y-2">
          <label className="block">{config.bandwidth?.enabled ? `游戏站 ${index + 1}` : labels[slot]}<input aria-label={labels[slot]} type="url" required={config.enabled || config.bandwidth?.enabled} placeholder="https://名称.onrender.com" value={config.sites[slot]}
            onChange={event => setConfig({ ...config, sites: { ...config.sites, [slot]: event.target.value } })} className="mt-1 block w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm" /></label>
          {row ? <>
            <p>工作区服务累计估算：{row.usedGB.toFixed(3)} / {quota} GB{row.complete && !row.error ? `，剩余约 ${Math.max(0, quota - row.usedGB).toFixed(3)} GB` : '（数据未齐，不显示剩余额度）'}</p>
            <p>{bandwidth?.target?.origin === row.origin ? '当前选中 · ' : ''}{row.healthy ? '游戏站可用' : '游戏站尚未通过健康检查'}{row.checkedAt ? ` · 查询于 ${new Date(row.checkedAt).toLocaleString('zh-CN')}` : ''}</p>
            {row.error && <p className="text-red-600">{row.error}</p>}
            {(!row.checkedAt || Date.now() - row.checkedAt > 3600000 || bandwidth.snapshot.month !== new Date().toISOString().slice(0, 7)) && <p className="text-amber-700">采集状态已过期，暂不参与自动切换。</p>}
            {row.complete && row.usedGB >= quota - (config.bandwidth?.reserveGB ?? 0.7) && <p className="text-amber-700">已达到预留流量阈值，暂不参与自动切换。</p>}
            {(!row.measuredAt || Date.now() - row.measuredAt > 10800000) && <p className="text-amber-700">平台尚未提供近期带宽数据，暂不参与自动切换。</p>}
            {!row.complete && <p className="text-amber-700">缺少月初或中断期间记录，请从 Render Billing 补录本月总用量。</p>}
            <div className="flex flex-wrap gap-2 items-center"><label>账单本月总用量（GB）<input aria-label={`游戏站${index + 1}账单用量`} type="number" min={row.observedGB} step="any" value={totals[row.id] ?? ''} onChange={event => setTotals({ ...totals, [row.id]: event.target.value })} className="ml-2 w-24 border rounded p-1" /></label><button type="button" disabled={busy || !totals[row.id]?.trim()} onClick={() => calibrate(row.id)} className="border rounded px-2 py-1 disabled:opacity-50">补录</button></div>
          </> : <p className="text-slate-500">等待定时采集，或网址未匹配已配置的服务编号</p>}
        </div>;
      })}
      <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}保存入口设置</button>
    </fieldset>
    <div className="text-xs space-y-2"><button type="button" onClick={loadBandwidth} className="inline-flex items-center gap-1"><RotateCw size={14} />刷新带宽状态</button>
      <p>每 15 分钟采集；平台数据存在延迟。显示为工作区服务估算，以 Render 账单为准。月底接入、删除服务或存在其他数据存储服务时，请核对并补录。</p>
      {config.bandwidth?.enabled && !bandwidth?.target && <p className="text-amber-700">尚无可自动分配的游戏站，请先检查用量完整性和站点状态。</p>}
      {bandwidthError && <p role="alert" className="text-red-600">{bandwidthError}</p>}
    </div>
    {!ready && !error && <Loader2 size={16} className="animate-spin" />}
    {error && <p role="alert" className="text-xs text-red-600">{error}<button type="button" onClick={load} title="重新读取入口设置" aria-label="重新读取入口设置" className="p-2"><RotateCw size={14} /></button></p>}
    {message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
  </form>;
}
