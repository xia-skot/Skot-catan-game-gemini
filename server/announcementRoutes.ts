import type { Express, RequestHandler } from 'express';
import { ObjectId } from 'mongodb';

export function registerAnnouncementEditingRoutes(app: Express, authenticate: RequestHandler,
  requireAdmin: RequestHandler, getCollection: () => any) {
  app.put('/api/admin/messages/:id', authenticate, requireAdmin, async (req: any, res) => {
    const { id } = req.params;
    const { title, content, revision } = req.body || {};
    if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: '无效的公告编号' });
    if (typeof title !== 'string' || !title.trim() || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: '请填写公告标题和内容' });
    }
    try {
      const collection = getCollection();
      if (!collection) return res.status(503).json({ error: '数据库未连接' });
      const original = await collection.findOne({ _id: new ObjectId(id) });
      if (!original) return res.status(404).json({ error: '公告不存在' });
      if (original.type === 'private' || original.targetUserId) return res.status(409).json({ error: '私信不支持公告编辑' });
      const previousRevision = original.revision || 1;
      if (revision !== previousRevision) return res.status(409).json({ error: '公告已更新，请返回列表后重新编辑' });
      const createdAt = Math.max(Date.now(), Number(original.createdAt || 0) + 1);
      const changes = { title: title.trim(), content: content.trim(), createdAt, updatedAt: createdAt,
        revision: previousRevision + 1, senderName: req.user?.username || '管理员', senderId: String(req.user?.userId || 'admin') };
      const result = await collection.updateOne({ _id: original._id, createdAt: original.createdAt }, { $set: changes });
      if (!result.matchedCount) return res.status(409).json({ error: '公告已更新，请重新编辑' });
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(createdAt);
      res.json({ success: true, message: { ...changes, id, date, type: 'system', targetUserId: null, targetUserName: null } });
    } catch (error) {
      console.error('Update announcement failed', error);
      res.status(500).json({ error: '公告更新失败，请稍后重试' });
    }
  });
}
