import { MongoClient } from 'mongodb';

const size = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export async function queryDatabaseStorage(uri: string) {
  // Diagnostic commands are outside the strict Stable API used by the main application client.
  const client = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db('catan_db');
    try {
      const result = await db.command({ atlasSize: 1, maxTimeMS: 5000 });
      const usedBytes = size(result.atlasSize);
      if (usedBytes !== null) return { usedBytes, scope: 'cluster' as const,
        dataBytes: size(result.totals?.dataSize), indexBytes: size(result.totals?.indexSize) };
    } catch { /* Other MongoDB deployments can still report this database's usage. */ }
    const stats = await db.command({ dbStats: 1, scale: 1, maxTimeMS: 5000 });
    const dataBytes = size(stats.dataSize), indexBytes = size(stats.indexSize);
    if (dataBytes === null || indexBytes === null) throw new Error('Storage metrics unavailable');
    return { usedBytes: dataBytes + indexBytes, scope: 'database' as const, dataBytes, indexBytes };
  } finally { await client.close(); }
}
