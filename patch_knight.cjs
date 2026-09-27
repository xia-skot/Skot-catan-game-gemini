const fs = require('fs');
const content = fs.readFileSync('src/useCatanGame.ts', 'utf8');

const target = "  const currentPlayer = updatedPlayers[prev.currentPlayerIndex];\n  currentPlayer.knightsPlayed += 1;";
const replacement = "  const currentPlayer = { ...updatedPlayers[prev.currentPlayerIndex], knightsPlayed: updatedPlayers[prev.currentPlayerIndex].knightsPlayed + 1 };\n  updatedPlayers[prev.currentPlayerIndex] = currentPlayer;";

if (content.includes(target)) {
  const updatedContent = content.replace(target, replacement);
  fs.writeFileSync('src/useCatanGame.ts', updatedContent);
  console.log("Patched successfully");
} else {
  console.log("Target not found");
}
