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
  useEffect(() => { void load(); }, []);
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
    {gateway && <a href={gateway} className="block text-xs text-indigo-600 break-all">{gateway}</a>}
    <fieldset disabled={!ready || !configured || saving} className="space-y-3 disabled:opacity-50">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.enabled} onChange={event => setConfig({ ...config, enabled: event.target.checked })} />按月上、中、下旬自动切换</label>
      <label className="block text-xs">默认网址<input aria-label="默认网址" type="url" required value={config.fallback} onChange={event => setConfig({ ...config, fallback: event.target.value })} className="mt-1 block w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm" /></label>
      {GATEWAY_SLOTS.map(slot => <label key={slot} className="block text-xs">{labels[slot]}<input aria-label={labels[slot]} type="url" required={config.enabled} placeholder="https://名称.onrender.com" value={config.sites[slot]}
        onChange={event => setConfig({ ...config, sites: { ...config.sites, [slot]: event.target.value } })} className="mt-1 block w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm" /></label>)}
      <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}保存入口设置</button>
    </fieldset>
    {!ready && !error && <Loader2 size={16} className="animate-spin" />}
    {error && <p role="alert" className="text-xs text-red-600">{error}<button type="button" onClick={load} title="重新读取入口设置" aria-label="重新读取入口设置" className="p-2"><RotateCw size={14} /></button></p>}
    {message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
  </form>;
}
