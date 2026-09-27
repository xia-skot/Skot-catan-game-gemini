const fs = require('fs');
let content = fs.readFileSync('src/useCatanGame.ts', 'utf8');

const target = `        if (pendingGold.length > 0) {
          next.phase = 'gold_selection';
          next.pendingGoldRewards = pendingGold;
        }`;

const replacement = `        if (pendingGold.length > 0) {
          next.phase = 'gold_selection';
          next.pendingGoldRewards = Object.values(pendingGold.reduce((acc, curr) => {
            if (!acc[curr.playerId]) acc[curr.playerId] = { playerId: curr.playerId, amount: 0 };
            acc[curr.playerId].amount += curr.amount;
            return acc;
          }, {} as Record<number, { playerId: number, amount: number }>));
        }`;

content = content.replaceAll(target, replacement);
fs.writeFileSync('src/useCatanGame.ts', content);
