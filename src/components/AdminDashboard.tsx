import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Users, X, RotateCw, Trash2, Edit2, Save, Settings, Loader2, MessageSquare, Info, Check, User, Sliders, Send, ArrowLeft, Mail, ArrowUp, ArrowDown, Trophy } from 'lucide-react';
import { UserProfileModal } from './UserProfileModal';
import { safeFetchJson } from '../fetchUtils';
import { requestAppBack, useBackHandler } from '../navigation';
import { DEFAULT_LEADERBOARD_TOP_COUNT, isLeaderboardTopCount, sortAdminPlayers, type PlayerSortField, type SortDirection } from '../../shared/leaderboard';

export function AdminDashboard({ onLogout, onClose, inline = false, initialSection = 'menu' }: { onLogout: () => void, onClose: () => void, inline?: boolean, initialSection?: 'menu' | 'system' | 'users' | 'feedbacks' | 'messages' }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingUsers, setEditingUsers] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [playerSort, setPlayerSort] = useState<PlayerSortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [leaderboardTopCount, setLeaderboardTopCount] = useState(String(DEFAULT_LEADERBOARD_TOP_COUNT));
  const [leaderboardSettingsReady, setLeaderboardSettingsReady] = useState(false);
  const [leaderboardSettingsSaving, setLeaderboardSettingsSaving] = useState(false);
  const [leaderboardSettingsMessage, setLeaderboardSettingsMessage] = useState('');
  const [leaderboardSettingsError, setLeaderboardSettingsError] = useState('');
  const sortedPlayers = React.useMemo(() => sortAdminPlayers<any>(data?.allUsers || data?.latestUsers || [], playerSort, sortDirection), [data, playerSort, sortDirection]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // Section state: 'menu' | 'system' | 'users' | 'feedbacks' | 'messages'
  const [activeSection, setActiveSection] = useState<'menu' | 'system' | 'users' | 'feedbacks' | 'messages'>(initialSection);

  const [inspectingUser, setInspectingUser] = useState<any | null>(null);
  const [inspectingLoading, setInspectingLoading] = useState(false);

  // Admin Private Messages State
  const [allAdminMessages, setAllAdminMessages] = useState<any[]>([]);
  const [adminMessagesLoading, setAdminMessagesLoading] = useState(false);
  const [selectedChatPlayer, setSelectedChatPlayer] = useState<{ id: string; username: string } | null>(null);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [sendingAdminReply, setSendingAdminReply] = useState(false);
  const adminChatEndRef = React.useRef<HTMLDivElement>(null);

  useBackHandler(!!confirmDeleteId || !!inspectingUser || !!selectedChatPlayer || activeSection !== 'menu' || !inline, () => {
    if (confirmDeleteId) setConfirmDeleteId(null);
    else if (inspectingUser) setInspectingUser(null);
    else if (selectedChatPlayer) setSelectedChatPlayer(null);
    else if (activeSection !== 'menu') setActiveSection('menu');
    else onClose();
    return true;
  }, 40);

  const fetchAdminMessages = async () => {
    setAdminMessagesLoading(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/messages', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await safeFetchJson(res);
        if (json?.messages) {
          setAllAdminMessages(json.messages);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAdminMessagesLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminMessages();
  }, []);

  useEffect(() => {
    let timer: any;
    if (activeSection === 'messages') {
      fetchAdminMessages();
      timer = setInterval(fetchAdminMessages, 5000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeSection]);

  const adminPlayerConversations = React.useMemo(() => {
    const privateList = allAdminMessages.filter(m => m.type === 'private' || Boolean(m.targetUserId));
    const map: { [key: string]: { id: string; username: string; messages: any[]; lastMsg: any } } = {};

    // 预先填入所有已注册玩家，不论对方有没有发消息，统一显示对方昵称
    const usersList = data?.allUsers || data?.latestUsers || [];
    usersList.forEach((u: any) => {
      const uName = (u.username || '').trim();
      if (uName && u.role !== 'admin' && !u.isGuest) {
        map[uName] = {
          id: u._id || uName,
          username: uName,
          messages: [],
          lastMsg: null
        };
      }
    });

    privateList.forEach(msg => {
      let playerId = '';
      let playerUsername = '';

      const isFromAdmin = msg.senderName === '管理员' || msg.senderId === 'admin';
      if (isFromAdmin) {
        playerId = msg.targetUserId || msg.targetUserName || 'unknown';
        playerUsername = msg.targetUserName || msg.targetUserId || '未知玩家';
      } else {
        playerId = msg.senderId || msg.senderName || 'unknown';
        playerUsername = msg.senderName || '未知玩家';
      }

      const key = playerUsername;
      if (!map[key]) {
        map[key] = {
          id: playerId,
          username: playerUsername,
          messages: [],
          lastMsg: null
        };
      }
      map[key].messages.push(msg);
    });

    Object.values(map).forEach(conv => {
      conv.messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      conv.lastMsg = conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;
    });

    return Object.values(map).sort((a, b) => {
      const timeA = a.lastMsg?.createdAt || 0;
      const timeB = b.lastMsg?.createdAt || 0;
      if (timeA && timeB) return timeB - timeA;
      if (timeA) return -1;
      if (timeB) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [allAdminMessages, data?.allUsers, data?.latestUsers]);

  const activePlayerChatMessages = React.useMemo(() => {
    if (!selectedChatPlayer) return [];
    return allAdminMessages.filter(m => {
      const isPrivate = m.type === 'private' || Boolean(m.targetUserId);
      if (!isPrivate) return false;

      const isFromTargetPlayer = (m.senderId === selectedChatPlayer.id || m.senderName === selectedChatPlayer.username);
      const isToTargetPlayer = (m.targetUserId === selectedChatPlayer.id || m.targetUserName === selectedChatPlayer.username);

      return isFromTargetPlayer || isToTargetPlayer;
    }).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [allAdminMessages, selectedChatPlayer]);

  useEffect(() => {
    if (selectedChatPlayer) {
      setTimeout(() => {
        adminChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [selectedChatPlayer, activePlayerChatMessages.length]);

  const handleSendAdminPrivateMsg = async () => {
    if (!selectedChatPlayer || !adminReplyText.trim() || sendingAdminReply) return;
    setSendingAdminReply(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          content: adminReplyText.trim(),
          targetUserId: selectedChatPlayer.id || selectedChatPlayer.username
        })
      });
      const resJson = await safeFetchJson(res);
      if (res.ok && resJson?.success && resJson?.message) {
        setAllAdminMessages(prev => [...prev, resJson.message]);
        setAdminReplyText('');
        setTimeout(() => {
          adminChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        alert(resJson?.error || '发送私信失败');
      }
    } catch (err) {
      console.error(err);
      alert('发送私信失败，请检查网络');
    } finally {
      setSendingAdminReply(false);
    }
  };

  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<string | null>(null);

  const [feedbackPrompt, setFeedbackPrompt] = useState('');
  const [feedbackPromptSaving, setFeedbackPromptSaving] = useState(false);
  const [feedbackPromptSuccess, setFeedbackPromptSuccess] = useState(false);

  const [aboutContent, setAboutContent] = useState('');
  const [aboutUpdatedAt, setAboutUpdatedAt] = useState('');
  const [aboutSaving, setAboutSaving] = useState(false);
  const [aboutSuccess, setAboutSuccess] = useState(false);

  const fetchFeedbackPrompt = async () => {
    try {
      const res = await fetch('/api/feedback/prompt');
      if (res.ok) {
        const json = await safeFetchJson(res);
        if (json?.prompt !== undefined) setFeedbackPrompt(json.prompt);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveFeedbackPrompt = async () => {
    setFeedbackPromptSaving(true);
    setFeedbackPromptSuccess(false);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/admin/feedback/prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: feedbackPrompt })
      });
      const json = await safeFetchJson(res);
      if (json?.success) {
        setFeedbackPromptSuccess(true);
        setTimeout(() => setFeedbackPromptSuccess(false), 2000);
      } else {
        alert(json?.error || '保存失败');
      }
    } catch (err) {
      alert('保存失败，请重试');
    } finally {
      setFeedbackPromptSaving(false);
    }
  };

  const fetchFeedbacks = async () => {
    setFeedbacksLoading(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/admin/feedbacks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await safeFetchJson(res);
        if (json?.feedbacks) setFeedbacks(json.feedbacks);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFeedbacksLoading(false);
    }
  };

  const fetchAbout = async () => {
    try {
      const res = await fetch('/api/about');
      if (res.ok) {
        const json = await safeFetchJson(res);
        if (json?.content !== undefined) setAboutContent(json.content);
        if (json?.updatedAt) setAboutUpdatedAt(json.updatedAt);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    setDeletingFeedbackId(id);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch(`/api/admin/feedbacks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setFeedbacks(prev => prev.filter(f => (f.id || f._id) !== id));
      }
    } catch (err) {
      alert('删除失败');
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  const handleSaveAbout = async () => {
    setAboutSaving(true);
    setAboutSuccess(false);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/admin/about', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: aboutContent })
      });
      const json = await safeFetchJson(res);
      if (json?.success) {
        setAboutSuccess(true);
        if (json?.updatedAt) setAboutUpdatedAt(json.updatedAt);
        setTimeout(() => setAboutSuccess(false), 2000);
      } else {
        alert(json?.error || '保存失败');
      }
    } catch (err) {
      alert('保存失败，请重试');
    } finally {
      setAboutSaving(false);
    }
  };

  const handleOpenUserProfile = async (username: string) => {
    setInspectingLoading(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch(`/api/admin/user/${encodeURIComponent(username)}/info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('获取玩家信息失败');
      const json = await safeFetchJson(res);
      if (json?.user) {
        setInspectingUser({
          ...json.user,
          isViewingAsAdmin: true
        });
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setInspectingLoading(false);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('无权限访问');
      }
      const json = await safeFetchJson(res);
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaderboardSettings = async () => {
    setLeaderboardSettingsReady(false);
    setLeaderboardSettingsError('');
    try {
      const token = localStorage.getItem('catan_auth_token');
      const response = await fetch('/api/admin/leaderboard/settings', { headers: { Authorization: `Bearer ${token}` } });
      const result = await safeFetchJson(response);
      if (!response.ok || !isLeaderboardTopCount(result?.topCount)) throw new Error(result?.error || '排行榜设置加载失败');
      setLeaderboardTopCount(String(result.topCount));
      setLeaderboardSettingsReady(true);
    } catch (failure) {
      setLeaderboardSettingsError(failure instanceof Error ? failure.message : '排行榜设置加载失败');
    }
  };

  useEffect(() => {
    if (activeSection === 'system') fetchLeaderboardSettings();
  }, [activeSection]);

  const saveLeaderboardSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    const count = Number(leaderboardTopCount);
    setLeaderboardSettingsMessage('');
    setLeaderboardSettingsError('');
    if (!isLeaderboardTopCount(count)) {
      setLeaderboardSettingsError('显示人数须为 1 至 100 的整数');
      return;
    }
    setLeaderboardSettingsSaving(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const response = await fetch('/api/admin/leaderboard/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topCount: count }),
      });
      const result = await safeFetchJson(response);
      if (!response.ok || !result?.success || !isLeaderboardTopCount(result?.topCount)) throw new Error(result?.error || '排行榜设置保存失败');
      setLeaderboardTopCount(String(result.topCount));
      setLeaderboardSettingsMessage('已保存');
    } catch (failure) {
      setLeaderboardSettingsError(failure instanceof Error ? failure.message : '排行榜设置保存失败');
    } finally {
      setLeaderboardSettingsSaving(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchFeedbacks();
    fetchAbout();
    fetchFeedbackPrompt();
  }, []);

  const handleDeleteUser = async (userId: string) => {
    setConfirmDeleteId(null);
    setDeletingId(userId);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const json = await safeFetchJson(res);
        throw new Error(json?.error || '删除失败');
      }
      setTimeout(fetchStats, 500);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditChange = (userId: string, val: string) => {
    setEditingUsers(prev => ({ ...prev, [userId]: val }));
  };

  const cancelEdit = (userId: string) => {
    setEditingUsers(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const saveEdit = async (userId: string) => {
    const newName = editingUsers[userId];
    if (!newName || newName.trim() === '') return cancelEdit(userId);
    setSavingId(userId);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: newName.trim() })
      });
      if (!res.ok) {
        const json = await safeFetchJson(res);
        throw new Error(json?.error || '修改失败');
      }
      cancelEdit(userId);
      fetchStats();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingId(null);
    }
  };



  if (error) {
    return (
      <div className={inline ? "p-4 bg-red-50 text-red-600 rounded-3xl text-sm border border-red-100" : "absolute inset-0 z-50 flex items-center justify-center bg-slate-50/90 backdrop-blur-sm"}>
        <div className="flex flex-col items-center justify-center p-6 text-red-600">
          <h2 className="text-base font-bold mb-2">连接失败或权限不足</h2>
          <p className="mb-4 text-xs">{error}</p>
          {!inline && (
            <button className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-colors" onClick={onClose}>返回大厅</button>
          )}
        </div>
      </div>
    );
  }

  // Sub-View 1: 系统设置
  const renderSystemContent = () => (
    <div className="space-y-4 font-sans">
      <form onSubmit={saveLeaderboardSettings} className="space-y-3 border-b border-slate-200 pb-4">
        <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700"><Trophy size={14} className="text-amber-600" />月度排行榜</h4>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="leaderboard-top-count" className="text-xs text-slate-600">显示人数</label>
          <input id="leaderboard-top-count" type="number" min="1" max="100" step="1" required
            value={leaderboardTopCount} disabled={!leaderboardSettingsReady || leaderboardSettingsSaving}
            onChange={event => { setLeaderboardTopCount(event.target.value); setLeaderboardSettingsMessage(''); }}
            className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm disabled:opacity-50" />
          <button type="submit" disabled={!leaderboardSettingsReady || leaderboardSettingsSaving}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-50">
            {leaderboardSettingsSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}保存
          </button>
          {!leaderboardSettingsReady && leaderboardSettingsError && <button type="button" onClick={fetchLeaderboardSettings} title="重试加载排行榜设置" aria-label="重试加载排行榜设置" className="p-2 text-slate-500"><RotateCw size={16} /></button>}
        </div>
        {leaderboardSettingsMessage && <p role="status" className="text-xs text-emerald-700">{leaderboardSettingsMessage}</p>}
        {leaderboardSettingsError && <p role="alert" className="text-xs text-red-600">{leaderboardSettingsError}</p>}
      </form>
      {/* 大厅显示房间上限 */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
          <Settings size={14} className="text-indigo-500" /> 大厅显示房间上限
        </h4>
        <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200/80">
          <span className="text-xs text-slate-600 font-medium">可显示最多房间数量</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="100"
              className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:border-indigo-500 bg-slate-50"
              defaultValue={data?.settings?.maxVisibleRooms || 10}
              onBlur={async (e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                  try {
                    const token = localStorage.getItem('catan_auth_token');
                    await fetch('/api/admin/settings', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({ maxVisibleRooms: val })
                    });
                  } catch (err) {
                    console.warn('Failed to update setting', err);
                  }
                }
              }}
            />
            <span className="text-xs text-slate-400 font-medium">间</span>
          </div>
        </div>
      </div>

      {/* 反馈页面提示语编辑 */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <h4 className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-2">
          <MessageSquare size={14} className="text-indigo-500" /> 反馈页面提示语编辑
        </h4>
        <p className="text-[11px] text-slate-400 font-medium mb-2.5">
          设置玩家点击“意见反馈”时看到的提示文本。
        </p>
        <textarea 
          value={feedbackPrompt}
          onChange={(e) => setFeedbackPrompt(e.target.value)}
          placeholder="设置玩家点击“意见反馈”时看到的提示语..."
          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500 transition-all resize-none min-h-[60px]"
        />
        <div className="mt-2.5 flex justify-end">
          <button 
            onClick={handleSaveFeedbackPrompt}
            disabled={feedbackPromptSaving}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {feedbackPromptSaving ? <Loader2 size={13} className="animate-spin" /> : feedbackPromptSuccess ? <Check size={13} className="text-emerald-300" /> : <Save size={13} />}
            {feedbackPromptSuccess ? '已保存' : '保存提示语'}
          </button>
        </div>
      </div>

      {/* 关于页面内容编辑 */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <h4 className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-2">
          <Info size={14} className="text-indigo-500" /> “关于”页面内容编辑
        </h4>
        <p className="text-[11px] text-slate-400 font-medium mb-2.5">
          编辑在“我的”-&gt;“关于”中面向玩家展示的内容。
        </p>
        <textarea 
          value={aboutContent}
          onChange={(e) => setAboutContent(e.target.value)}
          placeholder="请输入“关于”展示内容..."
          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500 transition-all resize-none min-h-[80px]"
        />
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-bold">更新日期：{aboutUpdatedAt || '未保存'}</span>
          <button 
            onClick={handleSaveAbout}
            disabled={aboutSaving}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {aboutSaving ? <Loader2 size={13} className="animate-spin" /> : aboutSuccess ? <Check size={13} className="text-emerald-300" /> : <Save size={13} />}
            {aboutSuccess ? '已保存' : '保存内容'}
          </button>
        </div>
      </div>

      {/* 发送全服消息 */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <h4 className="text-xs font-bold text-slate-700 mb-2.5 flex items-center gap-2">
          <Send size={14} className="text-indigo-500" /> 发送全服系统消息
        </h4>
        <div className="space-y-2.5">
          <input 
            type="text" 
            id="global-msg-title"
            placeholder="消息标题..." 
            className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500 transition-all"
          />
          <textarea 
            id="global-msg-content"
            placeholder="消息内容..." 
            className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500 transition-all resize-none min-h-[60px]"
          />
          <div className="flex justify-end">
            <button 
              onClick={() => {
                const t = (document.getElementById('global-msg-title') as HTMLInputElement)?.value;
                const c = (document.getElementById('global-msg-content') as HTMLTextAreaElement)?.value;
                if (t && c) {
                  const token = localStorage.getItem('catan_auth_token');
                  fetch('/api/admin/messages', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ title: t, content: c })
                  }).then(safeFetchJson).then(d => {
                    if (d?.success) {
                      alert('发送成功！');
                      if (document.getElementById('global-msg-title')) (document.getElementById('global-msg-title') as HTMLInputElement).value = '';
                      if (document.getElementById('global-msg-content')) (document.getElementById('global-msg-content') as HTMLTextAreaElement).value = '';
                    } else alert(d?.error || '发送失败');
                  }).catch(() => alert('发送失败'));
                } else {
                  alert('请输入标题和内容');
                }
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
            >
              <Send size={13} /> 发送全服消息
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Sub-View 2: 玩家名单
  const renderUsersContent = () => (
    <div className="space-y-3 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
        <span className="text-xs font-bold text-slate-500">共计 {(data?.allUsers || data?.latestUsers)?.length || 0} 位玩家</span>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="admin-player-sort">玩家排序字段</label>
          <select id="admin-player-sort" value={playerSort} onChange={event => setPlayerSort(event.target.value as PlayerSortField)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs">
            <option value="createdAt">注册时间</option><option value="winRate">胜率</option><option value="totalGames">游戏场次</option><option value="recent3DayGames">近3天活跃度</option>
          </select>
          <button type="button" onClick={() => setSortDirection(value => value === 'asc' ? 'desc' : 'asc')}
            title={sortDirection === 'asc' ? '升序，切换为降序' : '降序，切换为升序'} aria-label={sortDirection === 'asc' ? '升序，切换为降序' : '降序，切换为升序'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
            {sortDirection === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>
        </div>
      </div>

      <div className="flex flex-col space-y-2 pr-1">
        {sortedPlayers.map((u: any) => {
          const isEditing = editingUsers[u._id] !== undefined;
          return (
            <div key={u._id} className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 flex flex-wrap gap-y-2 items-center justify-between group transition-all" data-admin-player={u._id}>
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <div 
                  onClick={() => handleOpenUserProfile(u.username)}
                  className="w-9 h-9 rounded-xl bg-indigo-100 hover:bg-indigo-200 flex items-center justify-center shrink-0 border border-indigo-200/60 cursor-pointer transition-colors"
                  title="点击查看玩家信息"
                >
                  <span className="text-xs font-black text-indigo-700">{u.username.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex flex-col justify-center">
                  <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                    {isEditing ? (
                      <input 
                        type="text"
                        value={editingUsers[u._id]}
                        onChange={(e) => handleEditChange(u._id, e.target.value)}
                        className="border border-indigo-300 rounded-lg px-2 py-0.5 text-xs outline-none w-28 focus:border-indigo-500 bg-white"
                        autoFocus
                      />
                    ) : (
                      <span 
                        className="truncate cursor-pointer hover:text-indigo-600 transition-colors"
                        onClick={() => handleOpenUserProfile(u.username)}
                        title="点击查看玩家战绩"
                      >
                        {u.username}
                      </span>
                    )}
                    {u.role === 'admin' && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.2 rounded-full font-bold">管理员</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-medium">
                    <span>场次: <span className="font-bold text-slate-700">{u.totalGames || 0}</span></span>
                    <span>胜率: <span className="font-bold text-emerald-600">{u.winRate || 0}%</span></span>
                    <span title="近三天完成对局数：过去72小时内可计分的已完成游戏">近3天对局: <span className="font-bold text-slate-700">{Number.isFinite(u.recent3DayGames) ? `${u.recent3DayGames} 场` : '未提供'}</span></span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">注册: {u.createdAt && Number.isFinite(new Date(u.createdAt).getTime()) ? new Date(u.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '未知'}</div>
                </div>
              </div>
              
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {isEditing ? (
                  <button onClick={() => saveEdit(u._id)} disabled={savingId === u._id} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors bg-white shadow-xs border border-emerald-100">
                    {savingId === u._id ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => setEditingUsers(prev => ({ ...prev, [u._id]: u.username }))} 
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                      title="编辑用户名"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedChatPlayer({ id: u._id || u.username, username: u.username });
                        setActiveSection('messages');
                      }}
                      className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                      title="与该玩家发私信"
                    >
                      <Mail size={15} />
                    </button>
                  </>
                )}
                
                {confirmDeleteId === u._id ? (
                  <div className="flex gap-1 bg-red-50 p-1 rounded-xl border border-red-200">
                    <button onClick={() => handleDeleteUser(u._id)} className="px-2 py-0.5 text-[10px] font-bold text-white bg-red-500 rounded-lg hover:bg-red-600">确认</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-0.5 text-[10px] font-bold text-slate-500 bg-white rounded-lg hover:bg-slate-100">取消</button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setConfirmDeleteId(u._id)} 
                    disabled={deletingId === u._id} 
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                    title="删除玩家"
                  >
                    {deletingId === u._id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {(!data?.allUsers && !data?.latestUsers || (data?.allUsers || data?.latestUsers)?.length === 0) && (
          <p className="text-xs text-slate-400 font-medium py-6 text-center">暂无玩家数据</p>
        )}
      </div>
    </div>
  );

  // Sub-View 4: 玩家私信
  const renderMessagesContent = () => (
    <div className="space-y-4 font-sans">
      {!selectedChatPlayer ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
            <div>
              <h4 className="text-xs font-black text-slate-800">玩家私信会话列表</h4>
              <p className="text-[10px] text-slate-400">列出已互通私信的玩家，也可直接选择任一玩家发私信</p>
            </div>
            
            <div className="flex items-center gap-2">
              <select 
                onChange={(e) => {
                  if (e.target.value) {
                    const chosen = (data?.allUsers || data?.latestUsers)?.find((u: any) => u.username === e.target.value || u._id === e.target.value);
                    if (chosen) {
                      setSelectedChatPlayer({ id: chosen._id || chosen.username, username: chosen.username });
                    }
                    e.target.value = '';
                  }
                }}
                className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-xl px-2.5 py-1 outline-none cursor-pointer hover:bg-indigo-100 transition-colors"
              >
                <option value="">+ 选择玩家发起私信</option>
                {(data?.allUsers || data?.latestUsers)?.map((u: any) => (
                  <option key={u._id || u.username} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {adminMessagesLoading ? (
            <div className="py-12 flex justify-center text-indigo-500">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : adminPlayerConversations.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
              <Mail className="w-8 h-8 opacity-40 text-indigo-500" />
              <p className="font-bold text-slate-600">暂无任何玩家私信记录</p>
              <p className="text-[11px] text-slate-400">您可以在【玩家名单】中点击某位玩家右侧的私信按钮发起对话。</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {adminPlayerConversations.map((conv) => (
                <div 
                  key={conv.username}
                  onClick={() => setSelectedChatPlayer({ id: conv.id, username: conv.username })}
                  className="p-3.5 bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200/60 flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                      {conv.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                          {conv.username}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {conv.lastMsg?.date || ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-1 font-medium">
                        {conv.lastMsg?.content || '暂无消息'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* QQ Style Inline Chat View with Selected Player (在卡片容器内显示，界面不丢失) */
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[520px] font-sans"
        >
          {/* Header */}
          <div className="bg-white border-b border-slate-200/80 px-4 py-3 text-slate-800 flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200/60 flex items-center justify-center font-black text-xs shrink-0">
                {selectedChatPlayer.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="text-sm font-black text-slate-800 truncate leading-tight block">
                  {selectedChatPlayer.username}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1"><button
              onClick={() => fetchAdminMessages()}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="刷新私信记录"
            >
              <RotateCw size={14} className={adminMessagesLoading ? 'animate-spin' : ''} />
            </button>
            <button onClick={requestAppBack} title="返回私信列表" className="p-2 text-slate-600 hover:bg-slate-100 rounded-full"><ArrowLeft size={18} /></button></div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-3.5 bg-slate-50 overflow-y-auto space-y-3.5 no-scrollbar">
            {activePlayerChatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs font-medium space-y-1 py-12">
                <div className="w-12 h-12 rounded-full bg-indigo-50/50 flex items-center justify-center text-indigo-400 mb-1">
                  <MessageSquare size={22} />
                </div>
                <p className="font-bold text-slate-400 text-xs">暂无消息</p>
              </div>
            ) : (
              activePlayerChatMessages.map((msg) => {
                const isFromAdmin = msg.senderName === '管理员' || msg.senderId === 'admin';
                return (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col ${isFromAdmin ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1 font-mono">
                      {!isFromAdmin && <span className="font-bold text-slate-600">{msg.senderName}</span>}
                      <span>{msg.date}</span>
                      {isFromAdmin && <span className="font-bold text-indigo-600">我(管理员)</span>}
                    </div>

                    <div className="flex items-start gap-2 max-w-[85%]">
                      {!isFromAdmin && (
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200/60 flex items-center justify-center font-black text-[11px] shrink-0 shadow-2xs mt-0.5">
                          {selectedChatPlayer.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      <div 
                        className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words shadow-2xs font-medium ${
                          isFromAdmin 
                            ? 'bg-indigo-600 text-white rounded-tr-xs shadow-indigo-600/10' 
                            : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                        }`}
                      >
                        {msg.content}
                      </div>

                      {isFromAdmin && (
                        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-2xs mt-0.5">
                          管
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={adminChatEndRef} />
          </div>

          {/* Bottom Chat Input */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0">
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/10 rounded-2xl p-2 transition-all">
              <textarea 
                value={adminReplyText}
                onChange={(e) => setAdminReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendAdminPrivateMsg();
                  }
                }}
                placeholder=""
                rows={2}
                className="flex-1 bg-transparent border-0 text-xs text-slate-800 font-medium outline-none resize-none p-1 placeholder:text-slate-400"
              />
              <button
                disabled={!adminReplyText.trim() || sendingAdminReply}
                onClick={handleSendAdminPrivateMsg}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 disabled:opacity-40 disabled:active:scale-100 transition-all flex items-center gap-1.5 shrink-0"
              >
                {sendingAdminReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                发送
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );

  // Sub-View 3: 玩家反馈意见 (只显示玩家反馈列表)
  const renderFeedbacksContent = () => (
    <div className="space-y-3 font-sans">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-bold text-slate-500">共收到 {feedbacks.length} 条意见反馈</span>
      </div>

      {feedbacks.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          暂无玩家反馈意见
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {feedbacks.map((f: any) => {
            const fbId = f.id || f._id;
            return (
              <div key={fbId} className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="text-indigo-600 font-black">{f.username || '匿名玩家'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-normal">{f.date || (f.createdAt ? new Date(f.createdAt).toLocaleString() : '')}</span>
                    <button 
                      onClick={() => handleDeleteFeedback(fbId)} 
                      disabled={deletingFeedbackId === fbId}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                      title="删除反馈"
                    >
                      {deletingFeedbackId === fbId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                  {f.text || f.content}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Menu List: Secondary Level Menu items styled identically to First Level Menu
  const renderSecondaryMenuList = () => (
    <div className="space-y-3 font-sans">
      {/* 1. 系统设置 */}
      <button 
        onClick={() => setActiveSection('system')} 
        className="w-full bg-white py-3.5 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Sliders size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
          <div>
            <h3 className="font-bold text-slate-700 text-sm">系统设置</h3>
            <p className="text-[11px] text-slate-400 font-medium">房间上限、提示语、关于文本、全服广播</p>
          </div>
        </div>
        <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </button>

      {/* 2. 玩家名单 */}
      <button 
        onClick={() => setActiveSection('users')} 
        className="w-full bg-white py-3.5 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Users size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-700 text-sm">玩家名单</h3>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.2 rounded-full">
                {(data?.allUsers || data?.latestUsers)?.length || 0} 人
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">修改用户名、个人消息、删除账号</p>
          </div>
        </div>
        <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </button>

      {/* 3. 玩家私信 */}
      <button 
        onClick={() => setActiveSection('messages')} 
        className="w-full bg-white py-3.5 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-sky-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Mail size={18} className="text-slate-400 group-hover:text-sky-500 transition-colors" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-700 text-sm">玩家私信</h3>
              {adminPlayerConversations.length > 0 && (
                <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.2 rounded-full border border-sky-100">
                  {adminPlayerConversations.length} 个会话
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">管理员与不同玩家的一对一私信沟通</p>
          </div>
        </div>
        <div className="text-slate-300 group-hover:text-sky-400 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </button>

      {/* 4. 玩家反馈意见 */}
      <button 
        onClick={() => setActiveSection('feedbacks')} 
        className="w-full bg-white py-3.5 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <MessageSquare size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-700 text-sm">玩家反馈意见</h3>
              {feedbacks.length > 0 && (
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.2 rounded-full">
                  {feedbacks.length} 条
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">来自玩家的意见和建议列表</p>
          </div>
        </div>
        <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </button>
    </div>
  );

  const dashboard = (
    <div className={inline ? "space-y-4" : "absolute inset-0 bg-slate-50 z-50 overflow-y-auto"}>
      <div className={inline ? "" : "min-h-full max-w-4xl mx-auto flex flex-col font-sans relative pb-12"}>
        {loading && !data ? (
          <div className="flex items-center justify-center py-20 text-indigo-500">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <>
            {!inline && (
              <div className="sticky top-0 bg-slate-50/90 backdrop-blur-md z-10 p-4 sm:p-6 border-b border-slate-200/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                    <User size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800 leading-none">管理中心</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">Catan Admin Dashboard</p>
                  </div>
                </div>
                <button 
                  onClick={requestAppBack}
                  title="返回"
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
              </div>
            )}

            <div className={inline ? "" : "p-4 sm:p-6"}>
              <AnimatePresence mode="wait">
                {activeSection === 'menu' ? (
                  <motion.div
                    key="menu"
                    initial={inline ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {renderSecondaryMenuList()}
                  </motion.div>
                ) : (
                  <motion.div
                    key={activeSection}
                    initial={inline ? false : { opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-4 sm:p-6 flex flex-col space-y-4 min-h-full"
                  >
                    <div className="sticky top-0 z-10 bg-slate-50 flex items-center justify-between border-b border-slate-100 py-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                          {activeSection === 'system' && <><Sliders size={18} className="text-indigo-500" /> 系统设置</>}
                          {activeSection === 'users' && <><Users size={18} className="text-indigo-500" /> 玩家名单</>}
                          {activeSection === 'messages' && <><Mail size={18} className="text-sky-500" /> 玩家私信管理</>}
                          {activeSection === 'feedbacks' && <><MessageSquare size={18} className="text-indigo-500" /> 玩家反馈意见</>}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1">{activeSection === 'users' && (
                        <button onClick={fetchStats} className="text-indigo-500 hover:bg-indigo-50 px-2.5 py-1 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold">
                          <RotateCw size={13} className={loading ? 'animate-spin' : ''} /> 刷新
                        </button>
                      )}
                      {activeSection === 'messages' && (
                        <button onClick={fetchAdminMessages} className="text-indigo-500 hover:bg-indigo-50 px-2.5 py-1 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold">
                          <RotateCw size={13} className={adminMessagesLoading ? 'animate-spin' : ''} /> 刷新
                        </button>
                      )}
                      {activeSection === 'feedbacks' && (
                        <button onClick={fetchFeedbacks} className="text-indigo-500 hover:bg-indigo-50 px-2.5 py-1 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold">
                          <RotateCw size={13} className={feedbacksLoading ? 'animate-spin' : ''} /> 刷新
                        </button>
                      )}
                      <button onClick={requestAppBack} title="返回二级菜单" className="p-2 text-slate-600 hover:bg-slate-100 rounded-full"><ArrowLeft size={18} /></button></div>
                    </div>

                    {activeSection === 'system' && renderSystemContent()}
                    {activeSection === 'users' && renderUsersContent()}
                    {activeSection === 'messages' && renderMessagesContent()}
                    {activeSection === 'feedbacks' && renderFeedbacksContent()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>



      {inspectingUser && (
        <UserProfileModal 
          currentUser={inspectingUser} 
          onClose={() => setInspectingUser(null)}
          fullScreen={true}
          disableHistory={true}
          onUpdateSuccess={(updatedUser) => {
            setInspectingUser({ ...updatedUser, isViewingAsAdmin: true });
            fetchStats();
          }}
          onPlayerClick={(name) => handleOpenUserProfile(name)}
        />
      )}
      
      {inspectingLoading && (
        <div className="absolute inset-0 bg-slate-900/30 z-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      )}
    </div>
  );
  return inline && activeSection !== 'menu'
    ? createPortal(<div className="app-screen app-safe-top bg-slate-50 z-[90000]" data-admin-section={activeSection} data-no-swipe><div className="h-full overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">{dashboard}</div></div>, document.body)
    : dashboard;
}
