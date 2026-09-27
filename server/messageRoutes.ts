import type { Express, RequestHandler } from 'express';
import { ObjectId } from 'mongodb';

export function registerMessageDeletionRoutes(app: Express, authenticate: RequestHandler, getCollection: () => any) {
  // Register the literal path first: "conversation" is not a message ObjectId.
  app.delete('/api/messages/conversation', authenticate, async (req: any, res) => {
    try {
      const collection = getCollection();
      if (!collection) return res.status(503).json({ error: '数据库未连接' });
      const userId = String(req.user.userId || '');
      const username = req.user.username;
      const partner = typeof req.body.partner === 'string' ? req.body.partner.trim() : '';
      const identity = req.user.role === 'admin' ? partner : userId;
      if (!identity) return res.status(400).json({ error: '缺少对话用户' });
      const names = req.user.role === 'admin' ? [partner] : [userId, username].filter(Boolean);
      const ownership = req.user.role === 'admin'
        ? ['senderId', 'senderName', 'targetUserId', 'targetUserName'].map(field => ({ [field]: { $in: names } }))
        : [
            { senderId: userId }, { targetUserId: userId },
            ...(username ? [
              { senderId: username }, { targetUserId: username },
              { senderId: { $in: [null, ''] }, senderName: username },
              { targetUserId: { $in: [null, ''] }, targetUserName: username },
            ] : []),
          ];
      await collection.deleteMany({
        type: 'private',
        $or: ownership,
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete conversation failed', error);
      res.status(500).json({ error: '删除对话框失败' });
    }
  });

  app.delete('/api/messages/:id', authenticate, async (req: any, res) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: '无效的消息编号' });
      const collection = getCollection();
      if (!collection) return res.status(503).json({ error: '数据库未连接' });
      const id = new ObjectId(req.params.id);
      const message = await collection.findOne({ _id: id });
      if (!message) return res.status(404).json({ error: '消息不存在' });
      const userId = String(req.user.userId || '');
      const username = req.user.username;
      const isPrivate = message.type === 'private' || !!message.targetUserId;
      const belongsToUser = [['senderId', 'senderName'], ['targetUserId', 'targetUserName']].some(([idField, nameField]) => {
        const id = String(message[idField] || '');
        // Stable IDs win over display names; keep compatibility with older name-addressed messages.
        return id ? id === userId || (!ObjectId.isValid(id) && id === username) : !!username && message[nameField] === username;
      });
      if (req.user.role !== 'admin' && (!isPrivate || !belongsToUser)) return res.status(403).json({ error: '无权删除此消息' });
      await collection.deleteOne({ _id: id });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete message failed', error);
      res.status(500).json({ error: '删除消息失败' });
    }
  });
}
