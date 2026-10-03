export interface StateSnapshot { revision: number; fields: Record<string, string> }
export interface StatePatch { base: number; revision: number; changed: Record<string, unknown>; removed: string[] }

// Snapshot serialized fields rather than object references: game logic may mutate nested arrays.
export function snapshotState(state: Record<string, unknown>, revision: number): StateSnapshot {
  return { revision, fields: Object.fromEntries(Object.entries(state).filter(([, value]) => value !== undefined).map(([key, value]) => [key, JSON.stringify(value)])) };
}
export function diffState(previous: StateSnapshot, next: StateSnapshot): StatePatch {
  return { base: previous.revision, revision: next.revision,
    changed: Object.fromEntries(Object.entries(next.fields).filter(([key, value]) => previous.fields[key] !== value).map(([key, value]) => [key, JSON.parse(value)])),
    removed: Object.keys(previous.fields).filter(key => !(key in next.fields)) };
}
export function applyStatePatch(state: Record<string, unknown>, revision: number, patch: StatePatch) {
  if (patch.base !== revision || patch.revision !== revision + 1) return null;
  const next = { ...state, ...patch.changed };
  for (const key of patch.removed) delete next[key];
  return next;
}
