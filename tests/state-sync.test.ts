import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotState, diffState, applyStatePatch } from '../shared/stateSync';

test('patch preserves unchanged map, handles removed fields and nested changes', () => {
  const before = { board: [{ id: 'a', q: 1 }], players: [{ resources: { wood: 2 } }], activeBuildMode: 'road' };
  const after = { board: before.board, players: [{ resources: { wood: 3 } }] };
  const patch = diffState(snapshotState(before, 1), snapshotState(after, 2));
  assert.equal('board' in patch.changed, false);
  assert.deepEqual(patch.removed, ['activeBuildMode']);
  assert.deepEqual(applyStatePatch(before, 1, patch), after);
  assert.equal(applyStatePatch(before, 0, patch), null);
  assert.equal(applyStatePatch(before, 2, patch), null);
});
test('serialized baseline detects in-place mutations and JSON omission', () => {
  const state = { players: [{ n: 1 }], optional: 'x' as string | undefined };
  const first = snapshotState(state, 8);
  state.players[0].n = 2; state.optional = undefined;
  const patch = diffState(first, snapshotState(state, 9));
  assert.deepEqual(patch.changed, { players: [{ n: 2 }] });
  assert.deepEqual(patch.removed, ['optional']);
});
test('map-heavy representative state reduces bytes without losing final state', () => {
  let state: any = { board: Array.from({ length: 80 }, (_, id) => ({ id: String(id), q: id % 9, r: Math.floor(id / 9), type: 'forest', number: 6, islandId: 1 })), players: [{ id: 0, resources: { wood: 3 } }], activeBuildMode: null };
  let baseline = snapshotState(state, 1), reconstructed = state, fullBytes = 0, patchBytes = 0;
  for (let i = 2; i <= 100; i++) {
    state = { ...state, activeBuildMode: i % 2 ? 'road' : null };
    const next = snapshotState(state, i), patch = diffState(baseline, next);
    fullBytes += Buffer.byteLength(JSON.stringify(state)); patchBytes += Buffer.byteLength(JSON.stringify(patch));
    reconstructed = applyStatePatch(reconstructed, i - 1, patch); baseline = next;
  }
  assert.deepEqual(reconstructed, state);
  assert.ok(patchBytes < fullBytes / 10);
  console.log(JSON.stringify({ representativeFullBytes: fullBytes, representativePatchBytes: patchBytes }));
});
