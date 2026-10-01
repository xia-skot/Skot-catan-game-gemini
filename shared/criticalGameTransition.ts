type State = {
  turn?: number;
  currentPlayerIndex?: number;
  phase?: string;
  hasRolled?: boolean;
  dice?: number[];
  robberHexId?: string;
  pirateHexId?: string | null;
  players?: Array<{ isBot?: boolean; sessionId?: string }>;
};

export function canAcceptCriticalGameTransition(previous: State | null | undefined, next: State,
  actorId: string, controllerId: string | null): boolean {
  if (!previous) return true;
  const rolled = next.hasRolled === true && !!next.dice?.[0] && !!next.dice?.[1] &&
    (next.dice[0] !== previous.dice?.[0] || next.dice[1] !== previous.dice?.[1]);
  const blockadeMoved = next.robberHexId !== previous.robberHexId || next.pirateHexId !== previous.pirateHexId;
  if (!rolled && !blockadeMoved) return true;
  const active = previous.players?.[previous.currentPlayerIndex ?? -1];
  const owner = active?.isBot ? controllerId : active?.sessionId;
  if (!owner || owner !== actorId) return false;
  const sameTurn = next.turn === previous.turn && next.currentPlayerIndex === previous.currentPlayerIndex;
  if (rolled && sameTurn && previous.hasRolled && !!previous.dice?.[0] && !!previous.dice?.[1]) return false;
  if (blockadeMoved && !['robber', 'robber_move'].includes(previous.phase || '')) return false;
  return true;
}
