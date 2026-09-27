const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const target = `        if (!isSpectator) {
          resolveDiceRoll();
        }`;

const replacement = `        if (!isSpectator) {
          // Fix: only the active player (or the host if the active player is a bot) should resolve the dice.
          const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myPlayerIndex;
          const isActivePlayerBot = gameState.players[gameState.currentPlayerIndex]?.isBot;
          const amIHost = roomState?.hostId === socketService.playerId || currentUser?.role === 'admin';
          
          if (isMyTurn || (isActivePlayerBot && amIHost)) {
            resolveDiceRoll();
          }
        }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/App.tsx', content);
  console.log("Fixed dice resolution duplication.");
} else {
  console.log("Could not find dice resolution target.");
}
