export function spectatorGameState(state: any, revealHands: boolean) {
  if (!state) return state;
  const view = { ...state, publicBankDevCardCount: state.bankDevCards?.length || 0, bankDevCards: [] };
  if (revealHands) return view;
  return { ...view, handsHidden: true, players: (state.players || []).map((player: any) => ({ ...player,
    publicResourceCount: Object.values(player.resources || {}).reduce((sum: number, value) => sum + Number(value || 0), 0),
    publicDevCardCount: (player.devCards?.length || 0) + (player.devCardsBoughtThisTurn?.length || 0) + (player.playedDevCards?.length || 0),
    resources: Object.fromEntries(Object.keys(player.resources || {}).map(key => [key, 0])),
    devCards: [], devCardsBoughtThisTurn: [], vpCardsCount: 0,
  })) };
}
