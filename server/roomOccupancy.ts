export function conflictingRoom(rooms: Iterable<any>, playerId: string, targetId: string) {
  return [...rooms].find(room => room.roomId !== targetId &&
    (room.gameState?.winnerId == null) &&
    room.players.some((player: any) => !player.isBot &&
      (player.id === playerId || player.userId === playerId)));
}
