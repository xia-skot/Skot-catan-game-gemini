import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RotateCw, Trophy } from 'lucide-react';
import { LEADERBOARD_SCORING_VERSION, monthBounds, shanghaiMonth, shiftMonth, type MonthlyLeaderboard } from '../../shared/leaderboard';
import { safeFetchJson } from '../fetchUtils';

export interface LeaderboardProps { onBack?: () => void }

export function Leaderboard({ onBack }: LeaderboardProps) {
  const currentMonth = shanghaiMonth();
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<MonthlyLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    const token = localStorage.getItem('catan_auth_token');
    (async () => {
      try {
        const response = await fetch(`/api/leaderboard?month=${encodeURIComponent(month)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal, cache: 'no-store',
        });
        const result = await safeFetchJson<MonthlyLeaderboard & { error?: string }>(response);
        if (!response.ok) throw new Error(result.error || '排行榜加载失败');
        if (result.scoringVersion !== LEADERBOARD_SCORING_VERSION) throw new Error('服务器计分版本尚未更新，请管理员检查 Render 部署是否完成。');
        if (!Array.isArray(result.entries) || result.month !== month) throw new Error('排行榜数据暂时不可用');
        if (!controller.signal.aborted) setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '排行榜加载失败');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [month, revision]);

  return (
    <section className="w-full min-w-0 space-y-4 text-slate-800" aria-label="月度排行榜" data-leaderboard>
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <h3 className="flex items-center gap-2 text-base font-bold"><Trophy size={19} className="text-amber-600" />月度排行榜</h3>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}
            aria-label="刷新排行榜" title="刷新排行榜" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40">
            <RotateCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
          {onBack && <button type="button" onClick={onBack} aria-label="返回" title="返回"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"><ArrowLeft size={18} /></button>}
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" aria-label="上个月" title="上个月" disabled={month <= '2000-01'}
            onClick={() => setMonth(value => shiftMonth(value, -1))} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
          <input aria-label="排行榜月份" type="month" min="2000-01" max={currentMonth} value={month}
            onChange={event => {
              const next = event.target.value;
              try { monthBounds(next); if (next <= currentMonth) setMonth(next); } catch { /* Keep the last complete calendar month input. */ }
            }} className="h-9 w-40 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm" />
          <button type="button" aria-label="下个月" title="下个月" disabled={month >= currentMonth}
            onClick={() => setMonth(value => shiftMonth(value, 1))} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
        <span className="text-xs text-slate-500">{data ? `前 ${data.topCount} 名` : ''}</span>
      </div>
      <div aria-live="polite" aria-busy={loading} className="min-h-40">
        {loading ? <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={20} className="animate-spin" />加载中</div> :
          error ? <div role="alert" className="space-y-3 py-8 text-center"><p className="break-words text-sm text-red-600">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><RotateCw size={15} />重试</button></div> :
            !data?.entries.length ? <p className="py-12 text-center text-sm text-slate-500">本月暂无可计分战绩</p> :
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup><col className="w-11" /><col /><col className="w-14" /><col className="w-12" /></colgroup>
                <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th scope="col" className="py-3 font-medium">排名</th><th scope="col" className="py-3 font-medium">玩家</th><th scope="col" className="py-3 text-right font-medium">积分</th><th scope="col" className="py-3 text-right font-medium">场次</th></tr></thead>
                <tbody>{data.entries.map(entry => <tr key={entry.userId} className="border-b border-slate-100">
                  <td className={`py-3 tabular-nums ${entry.rank <= 3 ? 'font-bold text-amber-700' : 'text-slate-500'}`}>{entry.rank}</td>
                  <th scope="row" className="break-words py-3 pr-2 text-left font-medium [overflow-wrap:anywhere]">{entry.username}</th>
                  <td className="py-3 text-right font-bold tabular-nums text-emerald-700">{entry.points}</td>
                  <td className="py-3 text-right tabular-nums text-slate-600">{entry.gameCount}</td>
                </tr>)}</tbody>
              </table>}
      </div>
      {!!data?.myGames?.length && <details className="border-t border-slate-200 pt-3 text-xs">
        <summary className="cursor-pointer font-medium py-2">我的本月积分：{data.myGames.reduce((sum, game) => sum + game.points, 0)}</summary>
        <ul className="divide-y divide-slate-100">{data.myGames.map((game, index) => <li key={index} className="flex flex-wrap justify-between gap-2 py-3">
          <span>ID: {game.roomId} · {new Date(game.completedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
          <span>{game.playerCount} 人局 · 第 {game.rank} 名 · +{game.points} 分</span>
        </li>)}</ul>
      </details>}
    </section>
  );
}

export default Leaderboard;
