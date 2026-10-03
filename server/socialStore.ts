export class SocialStore {
  private sessions = new Map<string, any>();
  private invitations = new Map<string, any>();
  constructor(private presence?: any, private invites?: any) {}
  resetMemory() { this.sessions.clear(); this.invitations.clear(); }
  async putSession(record: any) {
    if (this.presence) await this.presence.updateOne({ _id: record._id }, { $set: record }, { upsert: true });
    else this.sessions.set(record._id, record);
  }
  async removeSession(id: string) {
    if (this.presence) await this.presence.deleteOne({ _id: id }); else this.sessions.delete(id);
  }
  async online() {
    const now = new Date();
    if (this.presence) return this.presence.find({ expiresAt: { $gt: now } }).project({ _id: 0 }).toArray();
    for (const [id, item] of this.sessions) if (item.expiresAt <= now) this.sessions.delete(id);
    return [...this.sessions.values()];
  }
  async claim(invitation: any) {
    const now = Date.now();
    const record = { ...invitation, _id: invitation.recipientId, status: 'pending', availableAt: now + 30000, deleteAt: new Date(now + 120000) };
    if (this.invites) {
      try {
        await this.invites.updateOne({ _id: record._id, availableAt: { $lte: now } }, { $set: record }, { upsert: true });
        return true;
      } catch (error: any) { if (error.code === 11000) return false; throw error; }
    }
    const current = this.invitations.get(record._id);
    if (current && current.availableAt > now) return false;
    this.invitations.set(record._id, record); return true;
  }
  async forUsers(ids: string[]) {
    if (!ids.length) return [];
    if (this.invites) return this.invites.find({ _id: { $in: ids }, deleteAt: { $gt: new Date() } }).toArray();
    const now = new Date();
    for (const [id, item] of this.invitations) if (item.deleteAt <= now) this.invitations.delete(id);
    return ids.flatMap(id => this.invitations.has(id) ? [this.invitations.get(id)] : []);
  }
  async respond(accountId: string, id: string, status: string) {
    const filter = { _id: accountId, id, status: 'pending', expiresAt: { $gt: Date.now() } };
    const update = { status, ...(status === 'accepted' ? { expiresAt: Date.now() + 60000, availableAt: Date.now() + 65000 } : {}) };
    if (this.invites) return !!(await this.invites.updateOne(filter, { $set: update })).modifiedCount;
    const current = this.invitations.get(accountId);
    if (!current || current.id !== id || current.status !== 'pending' || current.expiresAt <= Date.now()) return false;
    Object.assign(current, update); return true;
  }
}
