import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { socketService } from '../socketService';
import { CAPTAIN_EMOTES, EMOTES, GIFTS, type ReactionKind, type RoomReaction } from '../../shared/social';
import { REACTION_IMAGES } from '../reactionImages';
import './AvatarInteractions.css';

const LABELS: Record<ReactionKind, string> = { flower: '鲜花', coffee: '咖啡', egg: '鸡蛋', pan: '平底锅', giggle: '捂嘴笑', handshake: '握手', cry: '哭泣', angry: '生气', bored: '无语', please: '拜托', laugh: '大笑', smug: '得意', tongue: '吐舌头' };

export function ReactionArt({ kind, impact = false }: { kind: ReactionKind; impact?: boolean }) {
  const id = useId().replace(/:/g, '');
  const paint = (name: string) => `url(#${id}-${name})`;
  const emote = kind === 'handshake' ? 'please' : kind;
  if (emote in REACTION_IMAGES) return <img className="captain-emote" src={REACTION_IMAGES[emote as keyof typeof REACTION_IMAGES]} alt="" draggable={false} width={64} height={64} />;
  return <svg viewBox="0 0 64 64" fill="none" stroke="#45565b" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-face`} cx="32%" cy="22%" r="80%"><stop stopColor="#fff3be"/><stop offset=".55" stopColor="#f8d77a"/><stop offset="1" stopColor="#e8ae49"/></radialGradient>
      <linearGradient id={`${id}-shell`} x2="1" y2="1"><stop stopColor="#fffef9"/><stop offset=".6" stopColor="#f6ead1"/><stop offset="1" stopColor="#d9c5a4"/></linearGradient>
      <linearGradient id={`${id}-steel`} x2="1" y2="1"><stop stopColor="#e6edef"/><stop offset=".35" stopColor="#839ba2"/><stop offset=".55" stopColor="#d4e0e3"/><stop offset="1" stopColor="#526b73"/></linearGradient>
      <radialGradient id={`${id}-pan`} cx="38%" cy="30%"><stop stopColor="#597279"/><stop offset="1" stopColor="#263d45"/></radialGradient>
      <linearGradient id={`${id}-petal`} x2=".7" y2="1"><stop stopColor="#ffd4de"/><stop offset="1" stopColor="#d76086"/></linearGradient>
    </defs>
    {kind === 'flower' && <><path d="M20 27 30 53 43 27" stroke="#518668" strokeWidth="3" /><path d="M30 44q-18-1-16-13 11 0 16 13M31 40q17-7 17-16-14 2-17 16" fill="#7ea87a" /><path d="m17 37 13 20 15-20-14 5z" fill="#f4eee0" /><path d="m25 48 10-2 1 5-10 2z" fill="#dc778c" />{[[20,23],[43,21],[31,13]].map(([x,y],i) => <g key={i} transform={`translate(${x} ${y})`} fill={i === 1 ? '#efcf75' : '#ec91a5'}><path d="M0-5c-10-10-14 2-8 5-8 8 4 14 8 7 7 8 14-3 7-7 8-7-3-15-7-5Z" /><circle r="3" fill="#fff4b0" /></g>)}</>}
    {kind === 'coffee' && <><ellipse cx="31" cy="51" rx="24" ry="6" fill="#a5cfbf" /><path d="M45 28h7c9 0 7 14-7 14" strokeWidth="4" stroke="#508e80" /><path d="M12 24h34l-3 19q-2 8-14 8t-14-8z" fill="#f9f5e9" /><ellipse cx="29" cy="25" rx="17" ry="5" fill="#855e46" /><path d="M21 25q8-7 16 0-8 5-16 0" stroke="#f8dfb6" /><g className="reaction-steam" stroke="#8baaa5"><path d="M22 17q-5-4 0-9M32 15q5-4 0-10M40 17q-4-3 0-7" /></g></>}
    {kind === 'egg' && (impact ? <g className="reaction-splat"><path d="M7 38q-7-12 8-13-1-16 13-9 12-15 18-1 19-3 14 10 14 10-2 15 1 19-17 9-13 16-20 1-17 4-14-12Z" fill="#fffaf0" stroke="#d6cdb8" /><ellipse cx="33" cy="32" rx="12" ry="10" fill={paint('face')} /><path d="M26 29q4-5 9-3" stroke="white" strokeWidth="3"/><path d="m12 51 4 5m35-43 4-6M5 19l-3-3" stroke="#e3ba58" strokeWidth="3" /></g> : <><path d="M49 38c0 24-34 24-34 0 0-12 9-29 17-29s17 17 17 29Z" fill={paint('shell')} /><path d="M23 34q0-10 7-16" stroke="white" strokeWidth="4" /></>)}
    {kind === 'pan' && <g className="reaction-pan" transform={impact ? 'rotate(-30 32 32)' : 'rotate(30 32 32)'}><path d="M28 40h8l-1 19q-3 4-6 0z" fill="#38515a"/><path d="M31 47v9" stroke="#8ca6ae"/><circle cx="32" cy="24" r="20" fill={paint('steel')} /><circle cx="32" cy="24" r="16" fill={paint('pan')} /><path d="M21 20q4-10 15-8" stroke="#a6bdc4" strokeWidth="2" /><circle cx="32" cy="39" r="1" fill="#d9e5e9"/>{impact && <g stroke="#e5b944" strokeWidth="2.5"><path d="m6 6 5 7M49 5l-3 8M57 25l-6 1" /></g>}</g>}
    {kind === 'flower' && <g strokeWidth="1"><path d="m20 40 10 14 11-14" stroke="#cbbb9a"/><path d="M30 48q-12-10-11-1 1 7 11 1 10-9 12-2 1 6-12 2" fill={paint('petal')} stroke="#b94f77"/>{[[20,23],[43,21],[31,13]].map(([x,y],i) => <g key={i} transform={`translate(${x} ${y})`}><path d="M-6-3q0-7 6-2 6-5 6 2 5 5-2 7-4 5-7-1-7 1-3-6Z" fill={i === 1 ? '#ffe5a3' : paint('petal')} stroke={i === 1 ? '#c99b46' : '#bc6685'}/><path d="M-2-1q6-3 5 2-2 3-5 0" stroke="#fff1d2"/></g>)}</g>}
    {kind === 'coffee' && <><path d="M18 32l2 10q1 4 5 4" stroke="white" strokeWidth="3"/><path d="M30 48q9 0 11-7" stroke="#d7cdb9"/><path d="M26 23q-4-4-6-1-2 4 9 6 11-4 7-7-4-2-7 4" stroke="#fce5bf" strokeWidth="1.2"/><path d="M16 53q16 4 29-1" stroke="#e1f0e9" strokeWidth="2"/></>}
  </svg>;
}

function anchor(id: string) {
  return [...document.querySelectorAll<HTMLElement>('[data-social-avatar]')].find(el => el.dataset.socialAvatar === id);
}
function point(id: string, rotated: boolean, fallback = false) {
  const rect = anchor(id)?.getBoundingClientRect();
  if (rect && rect.width) return rotated ? { x: rect.top + rect.height / 2, y: innerWidth - rect.left - rect.width / 2 } : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  return fallback ? { x: (rotated ? innerHeight : innerWidth) / 2, y: (rotated ? innerWidth : innerHeight) - 50 } : null;
}
function AnimatedReaction({ event, done, rotated }: { event: RoomReaction; done: () => void; rotated: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const [impact, setImpact] = useState(false);
  const own = EMOTES.includes(event.kind as any);
  useEffect(() => {
    const target = point(event.targetId, rotated, own), source = point(event.actorId, rotated, true);
    if (!target || !source || !element.current) { done(); return; }
    const el = element.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const width = rotated ? innerHeight : innerWidth, height = rotated ? innerWidth : innerHeight;
    const tx = Math.max(32, Math.min(width - 32, target.x)), ty = Math.max(32, Math.min(height - 42, target.y + (own ? 38 : 0)));
    const halfSize = own ? 24 : 28;
    el.style.left = `${tx - halfSize}px`; el.style.top = `${ty - halfSize}px`;
    const dx = source.x - tx, dy = source.y - ty;
    const flight = el.animate(own || reduced ? [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)' }] : [
      { transform: `translate(${dx}px, ${dy}px) scale(.5) rotate(-25deg)`, opacity: 0 },
      { transform: `translate(${dx * .5}px, ${dy * .5 + 55}px) scale(1.1) rotate(${event.kind === 'egg' ? 160 : event.kind === 'pan' ? -65 : 12}deg)`, opacity: 1, offset: .55 },
      { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
    ], { duration: own || reduced ? 180 : 850, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'forwards' });
    let linger: Animation | undefined;
    let shake: Animation | undefined;
    flight.onfinish = () => {
      setImpact(true);
      if (!reduced && event.kind === 'pan') shake = anchor(event.targetId)?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(0)' }], { duration: 350 });
      linger = el.animate(reduced ? [{ opacity: 1 }, { opacity: 1, offset: .8 }, { opacity: 0 }] : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 1, transform: `scale(${own ? 1.05 : 1.2})`, offset: .7 }, { opacity: 0, transform: 'translateY(-8px) scale(.9)' }], { duration: own ? 2600 : 1500, fill: 'forwards' });
      linger.onfinish = done;
    };
    return () => { flight.onfinish = null; flight.cancel(); shake?.cancel(); if (linger) { linger.onfinish = null; linger.cancel(); } };
  }, [event, rotated]);
  return <div ref={element} className={`catan-reaction-flight ${own ? 'is-emote' : ''} ${impact ? 'has-landed' : ''}`} data-reaction-kind={event.kind}><ReactionArt kind={event.kind} impact={impact} />{own && !anchor(event.targetId) && <span className="reaction-sender-name">{event.actorName}</span>}{impact && ['flower', 'coffee'].includes(event.kind) && <span className="reaction-sparkles" />}</div>;
}

export function AvatarInteractions({ roomId, selfId, rotated = false }: { roomId: string; selfId: string; rotated?: boolean }) {
  const [menu, setMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const [events, setEvents] = useState<RoomReaction[]>([]);
  const lastSent = useRef(0);
  const [cooldown, setCooldown] = useState(false);
  useEffect(() => { Object.values(REACTION_IMAGES).forEach(src => { const image = new Image(); image.src = src; }); }, []);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const el = (event.target as Element)?.closest<HTMLElement>('[data-social-avatar]');
      if (!el) return;
      const center = point(el.dataset.socialAvatar!, rotated)!;
      const width = rotated ? innerHeight : innerWidth, height = rotated ? innerWidth : innerHeight;
      const menuHeight = el.dataset.socialAvatar === selfId ? 218 : 146;
      setMenu({ id: el.dataset.socialAvatar!, name: el.dataset.socialName || '我', x: Math.min(width - 174, Math.max(174, center.x)), y: Math.max(8, Math.min(height - menuHeight, center.y + 26)) });
    };
    const dismiss = (event: Event) => { if (!(event.target as Element)?.closest('[data-social-avatar], [data-social-menu]')) setMenu(null); };
    const close = () => { setMenu(null); setEvents([]); };
    document.addEventListener('click', click, true); document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('resize', close);
    const off = socketService.onSocial('room_reaction', (event: RoomReaction) => {
      if (event.roomId === roomId && [...GIFTS, ...EMOTES].includes(event.kind)) setEvents(list => list.some(item => item.id === event.id) ? list : [...list.slice(-5), event]);
    });
    return () => { off(); document.removeEventListener('click', click, true); document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('resize', close); };
  }, [roomId, rotated, selfId]);
  useEffect(() => { if (!cooldown) return; const t = setTimeout(() => setCooldown(false), 1800); return () => clearTimeout(t); }, [cooldown]);
  return createPortal(<div className="catan-social-surface" data-social-rotated={rotated} style={rotated ? { width: '100dvh', height: '100vw', transform: 'translateX(100vw) rotate(90deg)' } : { width: '100vw', height: '100dvh' }}>
    {menu && <div data-social-menu role="dialog" aria-label="头像互动" className="catan-reaction-menu" style={{ left: menu.x, top: menu.y }}><div className="reaction-menu-heading"><span>{menu.id === selfId ? '我的表情' : menu.name}</span><button onClick={() => setMenu(null)} aria-label="关闭互动" title="关闭互动"><X size={15} /></button></div><div className={`reaction-menu-options ${menu.id === selfId ? 'captain-emote-grid' : ''}`}>{(menu.id === selfId ? CAPTAIN_EMOTES : GIFTS).map(kind => <button key={kind} title={LABELS[kind]} aria-label={LABELS[kind]} disabled={cooldown} onClick={() => {
      if (Date.now() - lastSent.current < 1800) return;
      lastSent.current = Date.now(); setCooldown(true); socketService.sendReaction(roomId, menu.id, kind); setMenu(null);
    }}><ReactionArt kind={kind} /><span>{LABELS[kind]}</span></button>)}</div></div>}
    <div className="catan-reaction-layer" aria-hidden="true">{events.map(event => <AnimatedReaction key={event.id} event={event} rotated={rotated} done={() => setEvents(list => list.filter(item => item.id !== event.id))} />)}</div>
  </div>, document.body);
}
