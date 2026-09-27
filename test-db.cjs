const { MongoClient } = require('mongodb');

async function test() {
  const uri = "mongodb+srv://skot:skotskot@cluster0.aem3y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('catan');
  const games = db.collection('games');
  
  await games.insertOne({
    roomId: "TEST",
    players: [
      { id: 0, name: "Player1", isBot: false, score: 10, breakdown: { settlements: 5, cities: 2, longestRoad: true, largestArmy: false, vpCards: 1, islandBonus: 0 } },
      { id: 1, name: "Player2", isBot: true, score: 6, breakdown: { settlements: 4, cities: 0, longestRoad: false, largestArmy: true, vpCards: 0, islandBonus: 2 } }
    ],
    winnerId: 0,
    turnCount: 42,
    mapType: 'standard',
    completedAt: new Date()
  });
  console.log("Inserted test record!");
  process.exit(0);
}
test();
