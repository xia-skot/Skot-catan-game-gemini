import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Lock, Loader2, Trophy, Clock, Swords, LogOut, Settings, Edit3, ArrowLeft, Mail, Volume2, Bug, Trash2, Play, Database, MessageSquare, Send, Bell, Info, RotateCw, ChevronDown } from 'lucide-react';
import { SoundSettingsModal } from './SoundSettingsModal';
import { AdminDashboard } from './AdminDashboard';
import { safeFetchJson } from '../fetchUtils';
import { requestAppBack, useBackHandler } from '../navigation';
import { markMessagesRead, readMessageIds } from '../messageReadState';

interface UserProfileModalProps {
  currentUser: any;
  onClose: () => void;
  onUpdateSuccess: (user: any) => void;
  onLogout?: () => void;
  inline?: boolean;
  fullScreen?: boolean;
  onPlayerClick?: (username: string) => void;
  onRestoreGame?: (roomId: string) => void;
  activeView?: string;
  onActiveViewChange?: (view: any) => void;
  disableHistory?: boolean;
  isActive?: boolean;
}

export function UserProfileModal({ currentUser, onClose, onUpdateSuccess, onLogout, inline = false, fullScreen = false, onPlayerClick, onRestoreGame, activeView: propActiveView, onActiveViewChange, disableHistory = false, isActive = true }: UserProfileModalProps) {
  const [internalActiveView, setInternalActiveView] = useState<'menu' | 'edit' | 'history' | 'sound' | 'admin' | 'debug' | 'feedback' | 'messages' | 'about'>('menu');
  const activeView = propActiveView !== undefined ? propActiveView : internalActiveView;
  const setActiveView = (v: any) => {
    setInternalActiveView(v);
    if (onActiveViewChange) onActiveViewChange(v);
  };
  const [username, setUsername] = useState(currentUser?.username || '');
  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [inPrivateChatDetail, setInPrivateChatDetail] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');

  const [games, setGames] = useState<any[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [serverStats, setServerStats] = useState<{ totalGames: number; wins: number; winRate: number } | null>(null);

  const [saves, setSaves] = useState<any[]>([]);
  const [savesLoading, setSavesLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackPrompt, setFeedbackPrompt] = useState('');

  const [adminFeedbacks, setAdminFeedbacks] = useState<any[]>([]);
  const [adminFeedbacksLoading, setAdminFeedbacksLoading] = useState(false);
  const [deletingAdminFeedbackId, setDeletingAdminFeedbackId] = useState<string | null>(null);

  const fetchAdminFeedbacks = async () => {
    setAdminFeedbacksLoading(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/admin/feedbacks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await safeFetchJson(res);
        if (json?.feedbacks) setAdminFeedbacks(json.feedbacks);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAdminFeedbacksLoading(false);
    }
  };

  const handleDeleteAdminFeedback = async (id: string) => {
    setDeletingAdminFeedbackId(id);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch(`/api/admin/feedbacks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setAdminFeedbacks(prev => prev.filter(f => (f.id || f._id) !== id));
      }
    } catch (err) {
      alert('删除失败');
    } finally {
      setDeletingAdminFeedbackId(null);
    }
  };

  useEffect(() => {
    if (activeView === 'feedback' && currentUser?.role === 'admin') {
      fetchAdminFeedbacks();
    }
  }, [activeView, currentUser?.role]);

  useEffect(() => {
    fetch('/api/feedback/prompt')
      .then(safeFetchJson)
      .then(data => {
        if (data?.prompt) setFeedbackPrompt(data.prompt);
      })
      .catch(console.error);
  }, [activeView]);

  useBackHandler(isActive && (inPrivateChatDetail || activeView !== 'menu' || !inline), () => {
    if (inPrivateChatDetail) setInPrivateChatDetail(false);
    else if (activeView !== 'menu') setActiveView('menu');
    else onClose();
    return true;
  }, inline ? 20 : 80);

  useEffect(() => {
    if (!inPrivateChatDetail || !isActive) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--chat-height', `${viewport?.height ?? window.innerHeight}px`);
        document.documentElement.style.setProperty('--chat-top', `${viewport?.offsetTop ?? 0}px`);
      });
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--chat-height');
      document.documentElement.style.removeProperty('--chat-top');
    };
  }, [inPrivateChatDetail, isActive]);

  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const systemMsgs = React.useMemo(() => {
    return messages.filter(m => m.type !== 'private' && !m.targetUserId);
  }, [messages]);

  const isAdmin = currentUser?.role === 'admin';

  // 所有属于私信的消息
  const allRawPrivateMsgs = React.useMemo(() => {
    return messages.filter(m => m.type === 'private' || Boolean(m.targetUserId));
  }, [messages]);

  // 普通玩家私信列表 (包含发送与接收的私信，过滤自己与自己对话)
  const playerPrivateMsgs = React.useMemo(() => {
    if (isAdmin) return [];
    return allRawPrivateMsgs.filter(m => {
      // 过滤自己与自己的对话
      if (m.senderName && m.targetUserName && m.senderName === m.targetUserName) return false;
      if (m.senderId && m.targetUserId && m.senderId === m.targetUserId) return false;
      
      const isBelong = 
        m.senderId === currentUser?.id || 
        m.senderName === currentUser?.username || 
        m.targetUserId === currentUser?.id || 
        m.targetUserName === currentUser?.username;

      return isBelong;
    }).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [allRawPrivateMsgs, isAdmin, currentUser]);

  const [selectedChatPlayer, setSelectedChatPlayer] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState<string>('肖隐弦');
  const [allPlayerNames, setAllPlayerNames] = useState<string[]>([]);

  // 管理员账号按不同玩家划分的私信会话列表 (竖向QQ列表，完美过滤自己与自己)
  const adminConversations = React.useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, { username: string; msgs: any[]; lastMsg: any }>();

    // 预先填入所有已注册玩家，不论对方有没有发消息，统一显示对方昵称
    allPlayerNames.forEach(pName => {
      const clean = pName.trim();
      if (clean && clean !== currentUser?.username && clean !== '管理员' && clean !== 'admin') {
        map.set(clean, { username: clean, msgs: [], lastMsg: null });
      }
    });

    allRawPrivateMsgs.forEach(msg => {
      // 1. 判断是否是发给/发自自己的“自己与自己对话”
      const isSelf = 
        (msg.senderName && msg.targetUserName && msg.senderName === msg.targetUserName) ||
        (msg.senderId && msg.targetUserId && msg.senderId === msg.targetUserId) ||
        (currentUser?.username && msg.senderName === currentUser.username && msg.targetUserName === currentUser.username);

      if (isSelf) {
        return; // 跳过自己与自己的对话框
      }

      // 2. 识别发送方是否为管理员
      const isSenderAdmin = 
        msg.senderName === '管理员' || 
        msg.senderId === 'admin' || 
        (currentUser?.username && msg.senderName === currentUser.username) || 
        (currentUser?.id && msg.senderId === currentUser.id);

      // 3. 确定 Partner (玩家用户名/ID)
      let partner = '';
      if (isSenderAdmin) {
        // 管理员发出的消息，partner 为接收方玩家
        partner = msg.targetUserName || msg.targetUserId || '';
      } else {
        // 玩家发出的消息，partner 为发送方玩家
        partner = msg.senderName || msg.senderId || '';
      }

      // 如果 partner 仍是管理员自己或是空，过滤掉
      if (!partner || partner === '管理员' || partner === 'admin' || (currentUser?.username && partner === currentUser.username)) {
        return;
      }

      if (!map.has(partner)) {
        map.set(partner, { username: partner, msgs: [], lastMsg: null });
      }

      const conv = map.get(partner)!;
      conv.msgs.push(msg);
    });

    const result: { username: string; msgs: any[]; lastMsg: any }[] = [];
    map.forEach((conv) => {
      conv.msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      conv.lastMsg = conv.msgs.length > 0 ? conv.msgs[conv.msgs.length - 1] : null;
      result.push(conv);
    });

    result.sort((a, b) => {
      const timeA = a.lastMsg?.createdAt || 0;
      const timeB = b.lastMsg?.createdAt || 0;
      if (timeA && timeB) return timeB - timeA;
      if (timeA) return -1;
      if (timeB) return 1;
      return a.username.localeCompare(b.username);
    });
    return result;
  }, [allRawPrivateMsgs, isAdmin, currentUser, allPlayerNames]);

  const adminDisplayName = React.useMemo(() => {
    if (currentUser?.role === 'admin' && currentUser?.username) return currentUser.username;
    if (adminUsername && adminUsername !== '管理员') return adminUsername;
    const adminMsg = messages.find(m => m.type === 'private' && m.senderName && m.senderName !== '管理员' && m.senderName !== currentUser?.username);
    if (adminMsg?.senderName) return adminMsg.senderName;
    return '肖隐弦';
  }, [adminUsername, messages, currentUser]);

  const chatPartnerName = isAdmin ? (selectedChatPlayer || '玩家') : adminDisplayName;

  const activeChatMsgs = React.useMemo(() => {
    if (!isAdmin) {
      return playerPrivateMsgs;
    }
    if (!selectedChatPlayer) return [];
    const conv = adminConversations.find(c => c.username === selectedChatPlayer);
    return conv ? conv.msgs : [];
  }, [isAdmin, playerPrivateMsgs, selectedChatPlayer, adminConversations]);

  const formatChatTime = (rawTime: any): string => {
    let d: Date;
    if (typeof rawTime === 'number') d = new Date(rawTime);
    else if (typeof rawTime === 'string') {
      const parsed = new Date(rawTime);
      d = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      return '';
    }
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    if (isToday) {
      return `${hours}:${mins}`;
    }
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}-${day} ${hours}:${mins}`;
  };

  const processedChatMsgs = React.useMemo(() => {
    let lastShownTimeMs = 0;
    return activeChatMsgs.map((msg, index) => {
      const rawTime = msg.createdAt || (msg.date ? new Date(msg.date).getTime() : 0);
      const timeMs = typeof rawTime === 'number' ? rawTime : (rawTime ? new Date(rawTime).getTime() : 0);
      let showTime = false;
      if (index === 0 || !lastShownTimeMs || (timeMs && Math.abs(timeMs - lastShownTimeMs) >= 60 * 1000)) {
        showTime = true;
        if (timeMs) lastShownTimeMs = timeMs;
      }
      return {
        ...msg,
        showTime,
        timeLabel: formatChatTime(rawTime || msg.date)
      };
    });
  }, [activeChatMsgs]);

  const [deletingConv, setDeletingConv] = useState(false);

  const handleDeleteConversation = async (partnerName?: string) => {
    const targetName = partnerName || selectedChatPlayer || adminDisplayName;
    if (!window.confirm(`确定要删除与“${targetName}”的对话框及所有聊天记录吗？`)) return;

    setDeletingConv(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/messages/conversation', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ partner: targetName })
      });
      const data = await safeFetchJson(res);
      if (res.ok && data?.success) {
        setMessages(prev => prev.filter(m => {
          if (m.type !== 'private' && !m.targetUserId) return true;
          if (isAdmin) {
            const isMatch = m.senderName === targetName || m.senderId === targetName || m.targetUserName === targetName || m.targetUserId === targetName;
            return !isMatch;
          } else {
            return false;
          }
        }));
        if (selectedChatPlayer === targetName) {
          setSelectedChatPlayer(null);
        }
        setInPrivateChatDetail(false);
      } else {
        alert(data?.error || '删除对话框失败');
      }
    } catch (err) {
      console.error(err);
      alert('删除对话框失败');
    } finally {
      setDeletingConv(false);
    }
  };

  const handleDeleteSingleMessage = async (msgId: string) => {
    if (!window.confirm('确定要删除这条私信记录吗？')) return;
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch(`/api/messages/${msgId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await safeFetchJson(res);
      if (res.ok && data?.success) {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      } else {
        alert(data?.error || '删除失败');
      }
    } catch (e) {
      console.error(e);
      alert('删除失败');
    }
  };

  const systemUnreadCount = systemMsgs.filter(m => !m.read).length;
  const privateUnreadCount = isAdmin 
    ? adminConversations.reduce((acc, c) => acc + c.msgs.filter(m => !m.read && m.senderName === c.username).length, 0)
    : playerPrivateMsgs.filter(m => !m.read && m.senderName !== currentUser?.username && m.senderId !== currentUser?.id).length;

  const scrollToChatBottom = () => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const markMessagesAsRead = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    markMessagesRead(currentUser?.username || 'user', ids);
    setMessages(prev => prev.map(m => idSet.has(m.id) ? { ...m, read: true } : m));
  }, [currentUser?.username]);

  const markMessageAsRead = (id: string) => {
    markMessagesAsRead([id]);
  };

  const markAllMessagesAsRead = () => {
    const unreadIds = messages.filter(m => !m.read).map(m => m.id);
    markMessagesAsRead(unreadIds);
  };

  const fetchMessagesData = useCallback(async (silent = false) => {
    if (!silent) setMessagesLoading(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/messages', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) return;
      const data = await safeFetchJson(res);
      if (data?.messages) {
        const readMsgs = readMessageIds(currentUser?.username || 'user');
        setMessages(data.messages.map((m: any) => ({ ...m, read: readMsgs.has(m.id) })));
      }
      if (data?.adminUsername) {
        setAdminUsername(data.adminUsername);
      }
      if (data?.allPlayers && Array.isArray(data.allPlayers)) {
        setAllPlayerNames(data.allPlayers);
      }
    } catch (err) {
      console.error('Fetch messages error:', err);
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, [currentUser?.username]);

  // 定时自动同步消息 (每3秒)，保证私信及时显示
  useEffect(() => {
    fetchMessagesData(false);
    const interval = setInterval(() => {
      fetchMessagesData(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchMessagesData]);

  // 仅当用户真正进入某个人的私信详情时，才将该对话中的新私信标记为已读
  useEffect(() => {
    if (isActive && activeView === 'private_chat' && inPrivateChatDetail && !document.hidden) {
      scrollToChatBottom();
      const unreadIds = activeChatMsgs
        .filter(m => !m.read && m.senderName !== currentUser?.username && m.senderId !== currentUser?.id)
        .map(m => m.id);
      if (unreadIds.length > 0) {
        markMessagesAsRead(unreadIds);
      }
    }
  }, [isActive, activeView, inPrivateChatDetail, activeChatMsgs, markMessagesAsRead, currentUser?.username, currentUser?.id]);

  const handleSendPrivateMessage = async () => {
    if (!replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      if (isAdmin) {
        if (!selectedChatPlayer) {
          alert('请先选择要沟通的玩家');
          return;
        }
        const res = await fetch('/api/admin/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: '私信回复',
            content: replyText.trim(),
            targetUserId: selectedChatPlayer
          })
        });
        const data = await safeFetchJson(res);
        if (res.ok && data?.success && data?.message) {
          setReplyText('');
          await fetchMessagesData(true);
          scrollToChatBottom();
        } else {
          alert(data?.error || '发送私信失败');
        }
      } else {
        const res = await fetch('/api/messages/private', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            content: replyText.trim(),
            title: '玩家私信'
          })
        });
        const data = await safeFetchJson(res);
        if (res.ok && data?.success && data?.message) {
          setReplyText('');
          await fetchMessagesData(true);
          scrollToChatBottom();
        } else {
          alert(data?.error || '发送私信失败');
        }
      }
    } catch (err) {
      console.error(err);
      alert('发送私信失败，请检查网络');
    } finally {
      setSendingReply(false);
    }
  };

  const [adminMsgTitle, setAdminMsgTitle] = useState('');
  const [adminMsgContent, setAdminMsgContent] = useState('');
  const [adminMsgLoading, setAdminMsgLoading] = useState(false);

  const [aboutInfo, setAboutInfo] = useState<{ content: string; updatedAt: string }>({ content: '', updatedAt: '' });
  const [aboutLoading, setAboutLoading] = useState(false);

  useEffect(() => {
    if (activeView === 'about' || !aboutInfo.content) {
      setAboutLoading(true);
      fetch('/api/about')
        .then(safeFetchJson)
        .then(data => {
          if (data) setAboutInfo({ content: data.content || '', updatedAt: data.updatedAt || '' });
        })
        .catch(console.error)
        .finally(() => setAboutLoading(false));
    }
  }, [activeView]);

  const unreadCount = messages.filter(m => !m.read).length;

  const handleDeleteMessage = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('确定要删除这条消息吗？')) return;
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch(`/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== id));
      } else {
        alert('删除失败');
      }
    } catch (err) {
      alert('删除失败，请检查网络');
    }
  };

  useEffect(() => {
    setGames([]);
    setServerStats(null);
    if (!currentUser?.username) return;
    
    setGamesLoading(true);
    const token = localStorage.getItem('catan_auth_token');
    const fetchUrl = currentUser.isViewingAsAdmin
      ? `/api/admin/user/${encodeURIComponent(currentUser.username)}/games`
      : '/api/user/games';
      
    fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null)
    .then(data => {
      if (data?.games) setGames(data.games);
      if (data?.stats) setServerStats(data.stats);
    })
    .catch(() => {})
    .finally(() => setGamesLoading(false));
  }, [currentUser?.username]);

  const fetchSaves = async () => {
    if (currentUser?.role !== 'admin') return;
    setSavesLoading(true);
    setErrorText('');
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/admin/saved-games', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('获取存档列表失败');
      const data = await safeFetchJson(res);
      setSaves(data?.saves || []);
    } catch (err: any) {
      setErrorText(err.message || '获取存档列表出错');
    } finally {
      setSavesLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === 'debug') {
      fetchSaves();
    }
  }, [activeView, currentUser?.role]);

  const handleRestoreSave = async (saveId: string) => {
    setErrorText('');
    setSuccessText('');
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/admin/restore-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ saveId })
      });
      const data = await safeFetchJson(res);
      if (!res.ok) {
        throw new Error(data?.error || '恢复进度失败');
      }
      setSuccessText('进度已恢复！正在加载游戏...');
      setTimeout(() => {
        if (onRestoreGame) {
          onRestoreGame(data?.roomId);
        }
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorText(err.message || '恢复进度出错');
    }
  };

  const handleDeleteSave = async (saveId: string) => {
    setErrorText('');
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch(`/api/admin/saved-games/${saveId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await safeFetchJson(res);
        throw new Error(data?.error || '删除失败');
      }
      setSaves(prev => prev.filter(s => s._id !== saveId));
      setConfirmDeleteId(null);
    } catch (err: any) {
      setErrorText(err.message || '删除存档出错');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setSuccessText('');

    if (currentUser?.isGuest) {
      setErrorText('游客无法修改资料，请注册正式账号。');
      return;
    }

    if (!username.trim() && !password.trim()) {
      setErrorText('尚未修改任何内容。');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('catan_auth_token');
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ username, oldPassword, password })
      });
      const ct = res.headers.get('content-type');
      if (!ct || !ct.includes('application/json')) {
        throw new Error(`服务器响应异常 (${res.status})`);
      }
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '修改失败');
      }

      setSuccessText('修改成功！');
      localStorage.setItem('catan_auth_token', data.token);
      localStorage.setItem('catan_player_name', data.user.username);
      setOldPassword('');
      setPassword('');
      
      setTimeout(() => {
        onUpdateSuccess(data.user);
        setActiveView('menu');
        setSuccessText('');
      }, 1000);
    } catch (err: any) {
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isGameWin = (g: any, username?: string) => {
    if (!g || !username || !g.players) return false;
    const cleanUser = username.trim().toLowerCase();
    if (g.winnerId !== undefined && g.winnerId !== null) {
      const p = g.players.find((pl: any) => pl.name && pl.name.trim().toLowerCase() === cleanUser);
      if (p && String(p.id) === String(g.winnerId)) return true;
    }
    // Fallback if winnerId was not explicitly set or mismatched
    const player = g.players.find((pl: any) => pl.name && pl.name.trim().toLowerCase() === cleanUser);
    if (player) {
      const myScore = player.score || 0;
      const targetScore = g.mapType === 'standard' ? 10 : 14;
      const maxScore = Math.max(...g.players.map((pl: any) => pl.score || 0));
      if (myScore >= targetScore && myScore === maxScore) {
        const topCount = g.players.filter((pl: any) => (pl.score || 0) === maxScore).length;
        if (topCount === 1) return true;
      }
    }
    return false;
  };

  const localWins = games.filter(g => isGameWin(g, currentUser?.username)).length;
  const totalGames = serverStats?.totalGames ?? games.length;
  const wins = serverStats?.wins ?? localWins;
  const winRate = serverStats?.winRate ?? (totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0);

  const isMobileDevice = typeof window !== 'undefined' && 
    (window.innerWidth < 1024 || window.innerHeight < 1024);
  const isActuallyFullScreen = fullScreen || isMobileDevice;
  const headerPaddingClass = inline
    ? 'py-2.5 sm:py-3'
    : 'py-2.5 sm:py-3 pt-[calc(0.625rem+env(safe-area-inset-top,0px))]';

  const content = (
    <motion.div 
      initial={inline ? false : { opacity: 0, scale: 0.95, y: 20 }}
      animate={inline ? false : { opacity: 1, scale: 1, y: 0 }}
      className={`relative z-10 flex flex-col overflow-hidden ${
        inline 
          ? 'w-full h-full bg-transparent' 
          : isActuallyFullScreen 
            ? 'bg-slate-50 w-full h-full max-w-none rounded-none shadow-none' 
            : 'bg-slate-50 rounded-3xl w-full shadow-2xl max-h-[90%] md:max-w-md'
      }`}
    >
      {/* Full-screen Private Chat View using createPortal to escape transformed parent container and cover entire screen */}
      {isActive && activeView === 'private_chat' && inPrivateChatDetail && typeof document !== 'undefined' && createPortal(
        <div className="chat-screen z-[99999] flex flex-col bg-slate-50" data-no-swipe>
      {/* Top Chat Header */}
          <div className="bg-white px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] border-b border-slate-200/80 text-slate-800 shadow-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button 
                onClick={requestAppBack}
                className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-600 hover:text-slate-900 shrink-0"
                title="返回"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200/60 flex items-center justify-center font-black text-sm shrink-0">
                {chatPartnerName.slice(0, 1).toUpperCase()}
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-black text-slate-800 truncate leading-tight">
                  {chatPartnerName}
                </span>
                {!isAdmin && (
                  <span className="bg-amber-500/10 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">
                    官方
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => handleDeleteConversation(isAdmin ? (selectedChatPlayer || undefined) : adminDisplayName)}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0"
              title="删除对话框"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-3.5 bg-slate-50 overflow-y-auto space-y-3 no-scrollbar">
            {processedChatMsgs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs font-medium space-y-2 py-12">
                <div className="w-12 h-12 rounded-full bg-indigo-50/50 flex items-center justify-center text-indigo-400 mb-1">
                  <MessageSquare size={22} />
                </div>
                <p className="font-bold text-slate-400 text-xs">暂无消息</p>
              </div>
            ) : (
              processedChatMsgs.map((msg) => {
                const isMe = isAdmin 
                  ? (msg.senderName === '管理员' || msg.senderId === 'admin' || (currentUser?.username && msg.senderName === currentUser.username) || (currentUser?.id && msg.senderId === currentUser.id))
                  : (msg.senderId === currentUser?.id || (currentUser?.username && msg.senderName === currentUser.username));

                return (
                  <React.Fragment key={msg.id}>
                    {/* Centered Timestamp (仅超过1分钟才显示，1分钟以内不重复显示) */}
                    {msg.showTime && (
                      <div className="flex justify-center my-2 select-none">
                        <span className="text-[10px] text-slate-400 bg-slate-200/60 px-2.5 py-0.5 rounded-full font-medium shadow-2xs">
                          {msg.timeLabel || msg.date}
                        </span>
                      </div>
                    )}

                    {/* Message Bubble Row - 双方头像上方均不显示昵称 */}
                    <div className={`flex items-start gap-2 max-w-[85%] group ${isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 shadow-2xs mt-0.5 ${
                        isMe 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-indigo-100 text-indigo-700 border border-indigo-200/60'
                      }`}>
                        {(isMe ? (currentUser?.username || '我') : (chatPartnerName || 'Ta')).slice(0, 1).toUpperCase()}
                      </div>

                      {/* Bubble and Delete Button on Hover */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isMe && (
                          <button
                            onClick={() => handleDeleteSingleMessage(msg.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-500 rounded shrink-0"
                            title="删除此条消息"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}

                        <div 
                          className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words shadow-2xs font-medium ${
                            isMe 
                              ? 'bg-indigo-600 text-white rounded-tr-xs shadow-indigo-600/10' 
                              : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                          }`}
                        >
                          {msg.title && msg.title !== '玩家私信' && msg.title !== '私信回复' && msg.title !== '私信' && (
                            <div className={`font-black text-[11px] mb-1 pb-1 border-b ${isMe ? 'border-white/20 text-indigo-100' : 'border-slate-100 text-slate-700'}`}>
                              {msg.title}
                            </div>
                          )}
                          {msg.content}
                        </div>

                        {!isMe && (
                          <button
                            onClick={() => handleDeleteSingleMessage(msg.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-500 rounded shrink-0"
                            title="删除此条消息"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom Chat Input */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 focus-within:border-indigo-500 focus-within:bg-white rounded-2xl p-2 transition-all">
              <textarea 
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendPrivateMessage();
                  }
                }}
                placeholder=""
                rows={2}
                className="flex-1 bg-transparent border-0 text-xs text-slate-800 font-medium outline-none resize-none p-1 placeholder:text-slate-400"
              />
              <button
                disabled={!replyText.trim() || sendingReply}
                onClick={handleSendPrivateMessage}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 disabled:opacity-40 disabled:active:scale-100 transition-all flex items-center gap-1.5 shrink-0"
              >
                {sendingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                发送
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Header Profile Section */}
      <div className={`bg-white px-4 sm:px-5 ${headerPaddingClass} shadow-2xs z-10 shrink-0 relative flex justify-between items-center w-full rounded-none border-b border-slate-200/80 shadow-sm`}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center border-2 border-indigo-200/50 relative overflow-hidden shrink-0">
            <User size={22} />
            {currentUser?.role === 'admin' && (
              <div className="absolute bottom-0 left-0 w-full bg-indigo-500 text-white text-[8px] font-black text-center py-0.5 uppercase tracking-widest">Admin</div>
            )}
          </div>
          <div>
            <div className="text-base font-black text-slate-800 leading-tight flex items-center gap-1.5">
              {currentUser?.username}
              {currentUser.isGuest && (
                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                  游客
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">{currentUser.isGuest ? '未绑定邮箱' : currentUser?.email}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
            {activeView !== 'menu' && (
              <button 
                onClick={requestAppBack}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                title="返回"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            {!inline && (
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors ml-2"
              >
                <X size={20} />
              </button>
            )}
        </div>
      </div>

      <div 
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar relative p-4 space-y-4 max-w-2xl w-full mx-auto touch-pan-y"
        style={{ overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        {activeView === 'edit' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="edit"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100"
            >
              <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                 <Edit3 size={16} className="text-indigo-500" /> 编辑资料
              </h3>

              {errorText && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100 font-medium text-center">
                  {errorText}
                </div>
              )}
              {successText && (
                <div className="mb-4 p-3 bg-green-50 text-green-600 text-xs rounded-xl border border-green-100 font-medium text-center">
                  {successText}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="group">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-1 block group-focus-within:text-indigo-500 transition-colors">
                    游戏昵称
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="修改昵称"
                      disabled={currentUser.isGuest}
                      className="w-full bg-slate-50 border border-slate-100 pl-10 pr-3 py-3 rounded-xl outline-none font-medium transition-all focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 disabled:opacity-50 text-sm"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-1 flex justify-between items-center group-focus-within:text-indigo-500 transition-colors">
                    <span>原密码 (修改必填)</span>
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.preventDefault();
                        alert('重置密码验证邮件已发送至：' + currentUser.email + '\n请注意查收邮件。');
                      }} 
                      className="text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
                    >
                       <Mail size={12} /> 忘记密码?
                    </button>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="password" 
                      value={oldPassword}
                      onChange={e => setOldPassword(e.target.value)}
                      placeholder="输入当前密码"
                      disabled={currentUser.isGuest}
                      className="w-full bg-slate-50 border border-slate-100 pl-10 pr-3 py-3 rounded-xl outline-none font-medium transition-all focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 disabled:opacity-50 text-sm"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-1 block group-focus-within:text-indigo-500 transition-colors">
                    新密码 (留空则不修改)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="password" 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={currentUser.isGuest}
                      className="w-full bg-slate-50 border border-slate-100 pl-10 pr-3 py-3 rounded-xl outline-none font-medium transition-all focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 disabled:opacity-50 text-sm"
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={loading || currentUser.isGuest}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '保存修改'}
                </button>
              </form>
            </motion.div>
          </AnimatePresence>
        )}
        {activeView === 'sound' && (
          <AnimatePresence>
            <motion.div
              initial={inline ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <SoundSettingsModal 
                isOpen={isActive}
                onClose={() => {}}
                isAdmin={currentUser?.role === 'admin'}
                inline={true}
              />
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'admin' && (
          <AnimatePresence>
            <motion.div
              initial={inline ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <AdminDashboard 
                onClose={() => {}} 
                onLogout={onLogout || (() => {})}
                inline={true}
              />
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'debug' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="debug"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-black text-slate-800 mb-1 flex items-center gap-2">
                   <Bug size={16} className="text-indigo-500 animate-pulse" /> 游戏调试存档
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mb-4 leading-relaxed">
                  在这里可以查看、删除和一键加载已保存的游戏进度，方便您调试游戏和页面布局。
                </p>

                {errorText && (
                  <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100 font-medium text-center font-sans">
                    {errorText}
                  </div>
                )}
                {successText && (
                  <div className="mb-4 p-3 bg-green-50 text-green-600 text-xs rounded-xl border border-green-100 font-medium text-center font-sans">
                    {successText}
                  </div>
                )}

                <div className="space-y-3 font-sans">
                  {savesLoading ? (
                    <div className="py-12 flex justify-center text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : saves.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center gap-2">
                      <Database className="w-8 h-8 opacity-30 text-slate-400 mb-1" />
                      暂无已保存的调试进度数据。
                      <span className="text-[10px] text-slate-400 max-w-[200px] leading-normal block">
                        在游戏中点击【调试控制台】中的【保存游戏进度】可以添加存档。
                      </span>
                    </div>
                  ) : (
                    saves.map((save) => {
                      const hostPlayer = save.roomData?.players?.find((p: any) => p.id === save.roomData?.hostId);
                      const hostName = hostPlayer ? hostPlayer.name : '未知';
                      const playerNames = save.roomData?.players?.map((p: any) => p.name).join(', ') || '无';
                      const botCount = save.roomData?.settings?.botConfig?.filter((b: boolean) => b).length || 0;
                      return (
                        <div key={save._id} className="p-3.5 border border-slate-100 hover:border-indigo-100 rounded-2xl bg-slate-50/50 hover:bg-white transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 relative group">
                          <div className="space-y-1 text-left min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-800 text-sm truncate">{save.name}</span>
                              <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-bold font-mono">
                                ID: {save.roomId}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              <span className="text-slate-400 font-bold">玩家数：</span>
                              {save.roomData?.players?.length || 0}人 ({botCount}机器人)
                            </div>
                            <div className="text-[11px] text-slate-505 font-medium truncate text-slate-500">
                              <span className="text-slate-400 font-bold">玩家名单：</span>
                              {playerNames}
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono mt-1">
                              保存人: {save.savedBy} | {new Date(save.savedAt).toLocaleString()}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                            {confirmDeleteId === save._id ? (
                              <div className="flex items-center gap-1.5 animate-in fade-in zoom-in duration-150">
                                <button
                                  onClick={() => handleDeleteSave(save._id)}
                                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-sm animate-pulse"
                                >
                                  确认删除
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleRestoreSave(save._id)}
                                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md hover:shadow-indigo-500/10 active:scale-95 transition-all cursor-pointer"
                                >
                                  <Play size={12} className="fill-white text-white" /> 继续游戏
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(save._id)}
                                  className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-600 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                                  title="删除存档"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'history' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="stats"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              
              {/* Stats Box (moved to top) */}
              <div className="flex gap-4 p-4 bg-white rounded-3xl shadow-sm border border-slate-100">
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">场次</span>
                    <span className="text-xl font-black text-slate-800 mt-1">{totalGames}</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center border-l border-r border-slate-100">
                    <span className="text-[10px] uppercase font-black tracking-widest text-yellow-600/70">胜场</span>
                    <span className="text-xl font-black text-yellow-600 mt-1">{wins}</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[10px] uppercase font-black tracking-widest text-emerald-600/70">胜率</span>
                    <span className="text-xl font-black text-emerald-600 mt-1">{winRate}%</span>
                  </div>
              </div>

              {/* Match History (moved below) */}
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                   <Clock size={16} /> 历史战绩明细
                </h3>
                  
                <div className="flex flex-col">
                  {currentUser.isGuest ? (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium">
                      游客无法查阅战绩，请注册正式账号。
                    </div>
                  ) : gamesLoading ? (
                    <div className="py-8 flex justify-center text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : games.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-100 rounded-2xl">
                      暂无历史战绩
                    </div>
                  ) : (
                    games.map((g, i) => {
                      const calcTotalScore = (p: any) => {
                        const setPts = (p.breakdown?.settlements || 0) * 1;
                        const cityPts = p.breakdown?.cities ? p.breakdown.cities * 2 : 0;
                        const roadPts = p.breakdown?.longestRoad ? 2 : 0;
                        const armyPts = p.breakdown?.largestArmy ? 2 : 0;
                        const vpCardsPts = p.breakdown?.vpCards || 0;
                        const islandPts = p.breakdown?.islandBonus || 0;
                        const breakdownSum = setPts + cityPts + roadPts + armyPts + vpCardsPts + islandPts;
                        return Math.max(p.score || 0, breakdownSum);
                      };
                      const sortedPlayers = [...(g.players || [])].sort((a, b) => calcTotalScore(b) - calcTotalScore(a));
                      const isWin = isGameWin(g, currentUser?.username);
                      return (
                        <div key={i} className="py-4 border-b border-slate-100 last:border-b-0 flex flex-col gap-2 relative group">
                          {isWin && (
                            <div className="absolute top-0 right-0 w-12 h-12 bg-yellow-400/10 rounded-bl-full flex items-start justify-end p-2 pointer-events-none">
                              <Trophy size={14} className="text-yellow-500" />
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                            <span className="font-bold text-slate-600">ID: {g.roomId}</span>
                            <span className="font-mono">{new Date(g.completedAt).toLocaleDateString()}</span>
                          </div>
                          
                          {/* Scrolling Table */}
                          <div className="overflow-x-auto pb-2 -mx-2 px-2">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                  <th className="py-2 px-2 text-center w-8">排名</th>
                                  <th className="py-2 px-2 min-w-[80px]">玩家</th>
                                  <th className="py-2 px-2 text-center">总分</th>
                                  <th className="py-2 px-2 text-center">村</th>
                                  <th className="py-2 px-2 text-center">城</th>
                                  <th className="py-2 px-2 text-center">路</th>
                                  <th className="py-2 px-2 text-center">骑</th>
                                  <th className="py-2 px-2 text-center">卡</th>
                                  <th className="py-2 px-2 text-center">岛</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {sortedPlayers.map((p, idx) => {
                                  const isWinner = (g.winnerId !== undefined && g.winnerId !== null)
                                    ? String(p.id) === String(g.winnerId)
                                    : (isWin && p.name && currentUser?.username && p.name.trim().toLowerCase() === currentUser.username.trim().toLowerCase());
                                  return (
                                    <tr key={idx} className={`${isWinner ? 'bg-yellow-50/30' : ''}`}>
                                      <td className="py-2 px-2 text-center font-black text-slate-400">
                                        {idx + 1}
                                      </td>
                                      <td className="py-2 px-2 font-bold text-slate-700 whitespace-nowrap">
                                        {p.name} {isWinner && '👑'}
                                      </td>
                                      <td className="py-2 px-2 text-center font-black text-indigo-600">{calcTotalScore(p)}</td>
                                      <td className="py-2 px-2 text-center">{p.breakdown?.settlements || 0}</td>
                                      <td className="py-2 px-2 text-center">{p.breakdown?.cities ? p.breakdown.cities * 2 : 0}</td>
                                      <td className="py-2 px-2 text-center">{p.breakdown?.longestRoad ? 2 : 0}</td>
                                      <td className="py-2 px-2 text-center">{p.breakdown?.largestArmy ? 2 : 0}</td>
                                      <td className="py-2 px-2 text-center">{p.breakdown?.vpCards || 0}</td>
                                      <td className="py-2 px-2 text-center">{p.breakdown?.islandBonus || 0}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
        
        {activeView === 'messages' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="messages"
              initial={inline ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 font-sans"
            >
              {/* System Messages Card */}
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col min-h-[320px]">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <Bell size={16} className="text-indigo-500" /> 系统公告与通知
                  </h3>
                  <div className="flex items-center gap-2">
                    {systemUnreadCount > 0 && (
                      <button 
                        onClick={() => {
                          const newMessages = messages.map(m => (m.type !== 'private' && !m.targetUserId) ? { ...m, read: true } : m);
                          setMessages(newMessages);
                          const readMsgs = newMessages.filter(m => m.read).map(m => m.id);
                          localStorage.setItem('catan_read_messages', JSON.stringify(readMsgs));
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all flex items-center gap-1 text-xs font-bold"
                        title="标记系统消息为已读"
                      >
                        <span className="text-[11px]">一键已读</span>
                      </button>
                    )}
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      {systemMsgs.length} 条
                    </span>
                  </div>
                </div>
                
                {systemMsgs.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs font-medium border border-dashed border-slate-100 rounded-2xl bg-slate-50/50 py-12">
                    <Bell className="w-8 h-8 opacity-30 text-indigo-400 mb-2" />
                    <p>暂无系统公告或系统通知</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {systemMsgs.map((msg) => {
                      const isExpanded = expandedMessageId === msg.id;
                      return (
                        <div 
                          key={msg.id} 
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${msg.read ? 'bg-slate-50/80 border-slate-100' : 'bg-white border-indigo-100 shadow-xs'}`}
                          onClick={() => {
                            setExpandedMessageId(isExpanded ? null : msg.id);
                            if (!msg.read) markMessageAsRead(msg.id);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                                系统公告
                              </span>
                              <div className={`w-2 h-2 rounded-full shrink-0 ${msg.read ? 'bg-transparent' : 'bg-red-500'}`} />
                              <h4 className={`text-xs truncate ${msg.read ? 'text-slate-500 font-medium' : 'text-slate-800 font-bold'}`}>
                                {msg.title}
                              </h4>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-400 font-mono">{msg.date}</span>
                              {currentUser?.role === 'admin' && (
                                <button
                                  onClick={(e) => handleDeleteMessage(e, msg.id)}
                                  className="p-1 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                                  title="删除此条消息"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
                                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                className="overflow-hidden"
                              >
                                <p className="text-xs leading-relaxed text-slate-600 pl-3 border-l-2 border-indigo-200 bg-slate-50/50 p-2.5 rounded-r-xl whitespace-pre-wrap">
                                  {msg.content}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}

                {currentUser?.role === 'admin' && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                    <h4 className="text-xs font-bold text-slate-800">发布全服系统消息</h4>
                    <input 
                      type="text"
                      placeholder="标题"
                      value={adminMsgTitle}
                      onChange={(e) => setAdminMsgTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500 transition-all"
                    />
                    <textarea 
                      placeholder="内容"
                      value={adminMsgContent}
                      onChange={(e) => setAdminMsgContent(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500 transition-all resize-none min-h-[70px]"
                    />
                    <button 
                      disabled={!adminMsgTitle.trim() || !adminMsgContent.trim() || adminMsgLoading}
                      onClick={() => {
                        setAdminMsgLoading(true);
                        fetch('/api/admin/messages', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('catan_auth_token')}`
                          },
                          body: JSON.stringify({ 
                            title: adminMsgTitle, 
                            content: adminMsgContent,
                            targetUserId: null
                          })
                      })
                      .then(safeFetchJson)
                      .then(data => {
                        if (data?.success) {
                          setMessages([data.message, ...messages]);
                          setAdminMsgTitle('');
                          setAdminMsgContent('');
                        } else {
                          alert(data?.error || '发布失败');
                        }
                      })
                        .catch(() => alert('发布失败，请检查网络'))
                        .finally(() => setAdminMsgLoading(false));
                      }}
                      className="w-full bg-indigo-600 text-white font-bold text-xs py-2 rounded-xl shadow-xs hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {adminMsgLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      发布全服消息
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Dedicated QQ-Style Private Chat View */}
        {activeView === 'private_chat' && (
          <AnimatePresence mode="wait">
            {!inPrivateChatDetail && (
              /* Messages List View (不同的玩家显示独立的条形框) */
              <motion.div
                key="private_chat_list"
                initial={inline ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="space-y-3 font-sans py-2"
              >
                {!isAdmin ? (
                  /* 普通玩家：与管理员私信条形框 */
                  <div 
                    onClick={() => {
                      setSelectedChatPlayer(null);
                      setInPrivateChatDetail(true);
                    }}
                    className="p-3.5 bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200/60 flex items-center justify-center font-black text-sm shadow-xs">
                          {adminDisplayName.slice(0, 1).toUpperCase()}
                        </div>
                        {playerPrivateMsgs.some(m => !m.read && m.senderName !== currentUser?.username && m.senderId !== currentUser?.id) ? (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white shadow-xs"></span>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                              {adminDisplayName}
                            </span>
                            <span className="bg-amber-500/10 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500/20">
                              官方
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            {playerPrivateMsgs.length > 0 ? playerPrivateMsgs[playerPrivateMsgs.length - 1].date : '在线'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-1 font-medium">
                          {playerPrivateMsgs.length > 0 ? playerPrivateMsgs[playerPrivateMsgs.length - 1].content : '暂无消息'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(adminDisplayName);
                      }}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shrink-0 ml-2"
                      title="删除对话框及聊天记录"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  /* 管理员视角：不同玩家显示独立的条形框列表 */
                  <div className="space-y-2.5">
                    <div className="text-xs font-bold text-slate-500 px-1 mb-2 flex items-center justify-between">
                      <span>玩家私信列表 ({adminConversations.length})</span>
                    </div>

                    {adminConversations.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                        <MessageSquare className="w-8 h-8 opacity-40 text-indigo-500" />
                        <p className="font-bold text-slate-600">暂无玩家私信记录</p>
                      </div>
                    ) : (
                      adminConversations.map((conv) => (
                        <div 
                          key={conv.username}
                          onClick={() => {
                            setSelectedChatPlayer(conv.username);
                            setInPrivateChatDetail(true);
                          }}
                          className="p-3.5 bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <div className="relative shrink-0">
                              <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200/60 flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                                {conv.username.slice(0, 1).toUpperCase()}
                              </div>
                              {conv.msgs.some((m: any) => !m.read && m.senderName === conv.username) && (
                                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white shadow-xs"></span>
                              )}
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

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteConversation(conv.username);
                            }}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shrink-0 ml-2"
                            title="删除该玩家的对话框"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {activeView === 'feedback' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="feedback"
              initial={inline ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 font-sans"
            >
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 min-h-[300px] flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <MessageSquare size={16} className="text-indigo-500" /> 
                    {currentUser?.role === 'admin' ? '玩家反馈意见' : '意见反馈'}
                  </h3>
                  {currentUser?.role === 'admin' && (
                    <button 
                      onClick={fetchAdminFeedbacks} 
                      className="text-indigo-500 hover:bg-indigo-50 px-2 py-1 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold"
                    >
                      <RotateCw size={13} className={adminFeedbacksLoading ? 'animate-spin' : ''} /> 刷新
                    </button>
                  )}
                </div>

                {currentUser?.role === 'admin' ? (
                  <div className="space-y-3">
                    {adminFeedbacksLoading ? (
                      <div className="flex justify-center py-12 text-indigo-500">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : adminFeedbacks.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                        暂无玩家反馈意见
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                        {adminFeedbacks.map((f: any) => {
                          const fbId = f.id || f._id;
                          return (
                            <div key={fbId} className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                <span className="text-indigo-600 font-black">{f.username || '匿名玩家'}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400 font-normal">{f.date || (f.createdAt ? new Date(f.createdAt).toLocaleString() : '')}</span>
                                  <button 
                                    onClick={() => handleDeleteAdminFeedback(fbId)} 
                                    disabled={deletingAdminFeedbackId === fbId}
                                    className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                                    title="删除反馈"
                                  >
                                    {deletingAdminFeedbackId === fbId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
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
                ) : (
                  <>
                    <p className="text-xs text-slate-500 font-medium mb-4 leading-relaxed whitespace-pre-wrap">
                      {feedbackPrompt || '您的意见对我们非常重要。请详细描述您遇到的问题或建议，反馈内容将提交给管理员查看。'}
                    </p>

                    {feedbackSuccess ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-emerald-600 space-y-3 mt-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <p className="text-sm font-bold">感谢您的反馈！</p>
                        <button 
                          onClick={() => { setFeedbackSuccess(false); setFeedbackText(''); }}
                          className="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors"
                        >
                          继续反馈
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col">
                        <div className="relative flex-1 flex flex-col">
                          <textarea 
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value.slice(0, 1000))}
                            maxLength={1000}
                            placeholder="请输入您的反馈意见（最多1000字）..."
                            className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 pb-8 text-sm text-slate-700 font-medium outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none min-h-[160px]"
                          />
                          <div className="absolute bottom-2.5 right-4 text-[11px] font-bold text-slate-400 pointer-events-none select-none">
                            {feedbackText.length} / 1000
                          </div>
                        </div>
                        <button 
                          disabled={!feedbackText.trim() || feedbackLoading}
                          onClick={() => {
                            setFeedbackLoading(true);
                            fetch('/api/feedback', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('catan_auth_token')}`
                              },
                              body: JSON.stringify({ text: feedbackText })
                          })
                          .then(safeFetchJson)
                          .then(data => {
                            if (data?.success) {
                              setFeedbackSuccess(true);
                            } else {
                              alert(data?.error || '提交失败');
                            }
                          })
                            .catch(() => alert('提交失败，请检查网络'))
                            .finally(() => setFeedbackLoading(false));
                          }}
                          className="mt-4 w-full bg-indigo-600 text-white font-bold text-sm py-3 rounded-2xl shadow-md shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                        >
                          {feedbackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          提交反馈
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'about' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="about"
              initial={inline ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 font-sans"
            >
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 min-h-[300px] flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Info size={18} className="text-indigo-500" /> 关于游戏
                  </h3>
                  {aboutLoading ? (
                    <div className="flex items-center justify-center py-12 text-indigo-500">
                      <Loader2 size={24} className="animate-spin" />
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600 font-medium leading-relaxed whitespace-pre-wrap py-2">
                      {aboutInfo.content || '暂无详细介绍信息。'}
                    </div>
                  )}
                </div>
                <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-bold">
                  <span>卡坦岛 Catan Online</span>
                  <span>更新日期：{aboutInfo.updatedAt || '2026-08-10'}</span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'menu' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="menu"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <button 
                onClick={() => setActiveView('history')} 
                className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Clock size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <h3 className="font-bold text-slate-700 text-sm">历史战绩</h3>
                </div>
                <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </button>
              
              <button 
                onClick={() => setActiveView('edit')} 
                disabled={currentUser.isGuest}
                className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors disabled:opacity-50 disabled:hover:border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <Edit3 size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <h3 className="font-bold text-slate-700 text-sm">修改资料</h3>
                </div>
                <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </button>

              <button 
                onClick={() => setActiveView('sound')} 
                className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Volume2 size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <h3 className="font-bold text-slate-700 text-sm">声音设置</h3>
                </div>
                <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </button>

              <button 
                onClick={() => setActiveView('messages')} 
                className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Bell size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    {systemUnreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-700 text-sm">系统消息</h3>
                </div>
                <div className="flex items-center gap-2">
                  {systemUnreadCount > 0 && (
                    <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{systemUnreadCount}</span>
                  )}
                  <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </div>
              </button>

              <button 
                onClick={() => setActiveView('private_chat')} 
                className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Mail size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    {privateUnreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-700 text-sm">私信</h3>
                </div>
                <div className="flex items-center gap-2">
                  {privateUnreadCount > 0 && (
                    <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">{privateUnreadCount}</span>
                  )}
                  <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </div>
              </button>

              <button 
                onClick={() => setActiveView('feedback')} 
                className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <MessageSquare size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <h3 className="font-bold text-slate-700 text-sm">反馈</h3>
                </div>
                <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </button>

              <button 
                onClick={() => setActiveView('about')} 
                className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Info size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <h3 className="font-bold text-slate-700 text-sm">关于</h3>
                </div>
                <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </button>

              {currentUser?.role === 'admin' && (
                <button 
                  onClick={() => setActiveView('admin')} 
                  className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Settings size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    <h3 className="font-bold text-slate-700 text-sm">管理中心</h3>
                  </div>
                  <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </button>
              )}

              {currentUser?.role === 'admin' && (
                <button 
                  onClick={() => setActiveView('debug')} 
                  className="w-full bg-white py-3 px-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Bug size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    <h3 className="font-bold text-slate-700 text-sm">调试 (游戏存档)</h3>
                  </div>
                  <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </button>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      
      {/* Logout Button */}
      {activeView === 'menu' && onLogout && !currentUser?.isViewingAsAdmin && (
         <div className="shrink-0 z-10 mt-auto pt-8 pb-3 px-4 flex justify-center">
           <button
             onClick={onLogout}
             className="w-full max-w-[220px] flex items-center justify-center gap-2 text-xs font-black text-red-500 bg-red-50 hover:bg-red-100 py-2.5 px-4 rounded-xl transition-all border border-red-100/80 shadow-2xs hover:shadow-xs active:scale-95"
           >
             <LogOut size={15} /> 退出登录
           </button>
         </div>
      )}
    </motion.div>
  );

  if (inline) {
    return (
      <>
        {content}
      </>
    );
  }

  const modalOverlay = (
    <div className={`fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex ${isActuallyFullScreen ? 'items-stretch p-0' : 'items-center justify-center p-4'}`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}>
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {content}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalOverlay, document.body) : modalOverlay;
}
