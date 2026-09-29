import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { registerMessageDeletionRoutes } from './server/messageRoutes';
import assetManifest from './src/assetManifest.json';
import { applySettingsPatch, getRoomController, getSetupSlots } from './shared/roomSetup';
import { normalizeBotDifficulty } from './shared/botDifficulty';
import { computeLeaderboardUserStats } from './server/leaderboard';
import { mongoLeaderboardStore, registerLeaderboardRoutes } from './server/leaderboardRoutes';
import { createDemoLeaderboardStore } from './server/leaderboardDemo';
import { beginLeaderboardGame, hasUnsavedLeaderboardResult, persistLeaderboardResult } from './server/leaderboardRecording';
const DEMO_MODE = process.argv.includes('--demo');

dotenv.config();
if (DEMO_MODE && process.env.NODE_ENV === 'production') throw new Error('Demo is disabled in production');

// Remove empty string env vars so they don't block platform process.env variables
for (const [key, value] of Object.entries(process.env)) {
  if (value === '') {
    delete process.env[key];
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'secret-catan-key-12345';

const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未授权访问' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token 无效' });
  }
};

const adminMiddleware = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '无权访问' });
  }
  next();
};

async function startServer() {
  const app = express();
  const PORT = DEMO_MODE ? Number(process.env.DEMO_PORT || 5174) : Number(process.env.PORT || 3000);
  
  app.use(express.json());

  const httpServer = createHttpServer(app);

  // Active game rooms map
  const rooms = new Map<string, any>();

  // MongoDB Connection setup
  const MONGODB_URI = DEMO_MODE ? undefined : process.env.MONGODB_URI?.trim();
  let dbClient: MongoClient | null = null;
  let usersCollection: any = null;
  let verificationCodesCollection: any = null;
  let gamesCollection: any = null;
  let mapsCollection: any = null;
  let debugSavesCollection: any = null;
  let messagesCollection: any = null;
  let feedbackCollection: any = null;
  let aboutCollection: any = null;
  const demoLeaderboard = DEMO_MODE ? createDemoLeaderboardStore() : null;
  
  if (DEMO_MODE) {
    const { attachDemoApi } = await import('./demo/server');
    messagesCollection = attachDemoApi(app, JWT_SECRET, () => { rooms.clear(); demoLeaderboard?.reset(); });
  }

  if (MONGODB_URI) {
    dbClient = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });

    try {
      await dbClient.connect();
      const db = dbClient.db("catan_db");
      usersCollection = db.collection('users');
      verificationCodesCollection = db.collection('verification_codes');
      gamesCollection = db.collection('games');
      mapsCollection = db.collection('maps');
      debugSavesCollection = db.collection('debug_saves');
      messagesCollection = db.collection('system_messages');
      feedbackCollection = db.collection('feedback');
      aboutCollection = db.collection('about_info');
      
      await usersCollection.createIndex({ email: 1 }, { unique: true });
      await verificationCodesCollection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 }); // 10 minutes expiry
      console.log("[Server] Pinged your deployment. You successfully connected to MongoDB!");

      // Seed Admin Account if environment variables are provided
      if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPass = process.env.ADMIN_PASSWORD;
        const existingAdmin = await usersCollection.findOne({ email: adminEmail });
        if (!existingAdmin) {
          const hashedPassword = await bcrypt.hash(adminPass, 10);
          await usersCollection.insertOne({
            email: adminEmail,
            password: hashedPassword,
            username: '超级管理员',
            isGuest: false,
            role: 'admin',
            createdAt: new Date()
          });
          console.log(`[Server] Admin account seeded for ${adminEmail}`);
        } else if (existingAdmin.role !== 'admin') {
          // Upgrade existing account to admin if emails match
          await usersCollection.updateOne({ email: adminEmail }, { $set: { role: 'admin' } });
          console.log(`[Server] User ${adminEmail} upgraded to admin role.`);
        }
      }
    } catch (error) {
       console.error("[Server] MongoDB connection error:", error);
    }
  } else {
    console.warn("[Server] MONGODB_URI environment variable is not set. Skipping MongoDB connection.");
  }

  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    allowEIO3: true,
    // Detect silent mobile disconnects without leaving AI ownership stale for 85s.
    pingTimeout: 12000,
    pingInterval: 8000,
    connectTimeout: 45000,
    transports: ['polling', 'websocket']
  });

  // Log socket errors - but handle 'Session ID unknown' as a warning instead of error log
  io.engine.on("connection_error", (err) => {
    if (err.code === 1 && err.message === 'Session ID unknown') {
      return;
    }
    console.log("Connection error context:", err.req ? "Request available" : "No request");
    console.log("Connection error message:", err.message);
    console.log("Connection error code:", err.code);
    console.log("Connection error context:", err.context);
  });

  // API routes FIRST
  registerLeaderboardRoutes(app, authMiddleware, adminMiddleware, demoLeaderboard?.store || mongoLeaderboardStore(() => ({
    games: gamesCollection, users: usersCollection, settings: aboutCollection,
  })));
  if (demoLeaderboard) app.get('/api/admin/stats', authMiddleware, adminMiddleware, (_req, res) => res.json(demoLeaderboard.stats()));
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/db-status', (req, res) => {
    res.json({ connected: !!usersCollection });
  });

  // ========== EMAIL TRANSPORTER (BREVO API) ==========
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM || 'xiaskot1224@gmail.com';
  
  if (brevoApiKey) {
    console.log('[Server] Initialized Brevo API Transporter');
  } else {
    console.warn('[Server] Missing API credentials! Email sending will be disabled (fallback to 123456).');
  }

  // ========== AUTH ROUTES ==========
  
  // Send Verification Code
  app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: '请提供邮箱' });
    if (!verificationCodesCollection) return res.status(500).json({ error: '数据库未连接' });

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });

    console.log(`[Server] Attempting to send code to: ${email}`);

    try {
      // Check if user already exists
      if (usersCollection) {
        const existing = await usersCollection.findOne({ email });
        if (existing) return res.status(400).json({ error: '该邮箱已被注册' });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();

      await verificationCodesCollection.updateOne(
        { email },
        { $set: { code, createdAt: new Date() } },
        { upsert: true }
      );

      if (!brevoApiKey) {
        console.log('[Server] No API configured, using fallback code 123456');
        return res.json({ message: '测试环境：发件服务未完全配置，请暂时使用随意六位验证码' });
      }

      console.log(`[Server] Making API req to Brevo for ${email}`);
      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            name: 'CATAN 卡坦岛',
            email: fromEmail
          },
          to: [{ email }],
          subject: 'CATAN - 账号注册验证码',
          htmlContent: `<p>您的注册验证码是：<strong style="font-size: 24px;">${code}</strong></p><p>验证码在 10 分钟内有效。如果不是您本人的操作，请忽略此邮件。</p>`
        })
      });

      if (!brevoResponse.ok) {
        const errText = await brevoResponse.text();
        console.error('[Server] Brevo API Error:', brevoResponse.status, errText);
        throw new Error(`Brevo API Error: ${brevoResponse.status}`);
      }

      const brevoData = await brevoResponse.json() as { messageId?: string };
      console.log(`[Server] Email sent successfully to ${email}. MessageId: ${brevoData.messageId}`);
      res.json({ message: '验证码已发送至您的邮箱' });
    } catch (error: any) {
      console.error('[Server] Email sending failed:', error);
      res.status(500).json({ error: '无法发送邮件 服务器内部错误' });
    }
  });

  // Register Account
  app.post('/api/register', async (req, res) => {
    if (!usersCollection) return res.status(500).json({ error: '数据库未连接' });
    const { email, password, username, code } = req.body;
    if (!email || !password || !username || !code) {
      return res.status(400).json({ error: '请填写所有必需的字段。' });
    }

    if (process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: '不允许注册该专属管理员邮箱。' });
    }
    
    try {
      const record = await verificationCodesCollection.findOne({ email });
      if (!record || record.code !== code) {
        return res.status(400).json({ error: '验证码错误或已失效。' });
      }

      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: '该邮箱已被注册。' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        email,
        password: hashedPassword,
        username,
        isGuest: false,
        createdAt: new Date()
      };
      
      const result = await usersCollection.insertOne(newUser);
      
      // Delete the consumed code
      await verificationCodesCollection.deleteOne({ email });

      const token = jwt.sign({ userId: result.insertedId, username, isGuest: false }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: result.insertedId, username, email, isGuest: false } });
    } catch (err) {
      console.error('Register error', err);
      res.status(500).json({ error: '注册时发生错误' });
    }
  });

  // Reset Password (Forgot Password)
  app.post('/api/reset-password', async (req, res) => {
    if (!usersCollection) return res.status(500).json({ error: '数据库未连接' });
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: '请提供邮箱、验证码和新密码' });
    }
    try {
      const record = await verificationCodesCollection.findOne({ email });
      if (!record || record.code !== code) {
        return res.status(400).json({ error: '验证码错误或已失效' });
      }
      
      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(404).json({ error: '该邮箱尚未注册' });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await usersCollection.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
      await verificationCodesCollection.deleteOne({ email });
      
      res.json({ message: '密码重置成功，请使用新密码登录' });
    } catch (err) {
      console.error('Reset password error', err);
      res.status(500).json({ error: '重置密码失败' });
    }
  });

  // Login Account
  app.post('/api/login', async (req, res) => {
    if (!usersCollection) return res.status(500).json({ error: '数据库未连接' });
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '请提供邮箱和密码。' });
    }
    try {
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(400).json({ error: '邮箱或密码错误。' });
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ error: '邮箱或密码错误。' });
      
      const token = jwt.sign({ userId: user._id, username: user.username, role: user.role, isGuest: false }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user._id, username: user.username, email: user.email, role: user.role, isGuest: false } });
    } catch (err) {
      console.error('Login error', err);
      res.status(500).json({ error: '登录时发生错误' });
    }
  });

  // Guest Login
  app.post('/api/guest', async (req, res) => {
    const { username, guestId } = req.body;
    let finalUsername = username;
    let finalGuestId;

    try {
      if (guestId && ObjectId.isValid(guestId)) {
        finalGuestId = new ObjectId(guestId);
        if (usersCollection) {
          const existingGuest = await usersCollection.findOne({ _id: finalGuestId, isGuest: true });
          if (existingGuest) {
            // Found existing guest
            if (!username) {
              finalUsername = existingGuest.username;
            } else {
              // Update username if requested
              await usersCollection.updateOne({ _id: finalGuestId }, { $set: { username: finalUsername } });
            }
          } else {
            // Valid ID but not in DB, create new with this ID
            if (!finalUsername) finalUsername = `游客-${Math.floor(Math.random()*10000)}`;
            const dummyEmail = `guest-${finalGuestId.toString()}@guest.local`;
            await usersCollection.insertOne({ _id: finalGuestId, email: dummyEmail, username: finalUsername, role: 'guest', isGuest: true, createdAt: new Date() });
          }
        } else {
          if (!finalUsername) finalUsername = `游客-${Math.floor(Math.random()*10000)}`;
        }
      } else {
        finalGuestId = new ObjectId();
        if (!finalUsername) finalUsername = `游客-${Math.floor(Math.random()*10000)}`;
        if (usersCollection) {
           const dummyEmail = `guest-${finalGuestId.toString()}@guest.local`;
           await usersCollection.insertOne({ _id: finalGuestId, email: dummyEmail, username: finalUsername, role: 'guest', isGuest: true, createdAt: new Date() });
        }
      }

      const token = jwt.sign({ userId: finalGuestId.toString(), username: finalUsername, role: 'guest', isGuest: true }, JWT_SECRET, { expiresIn: '1d' });
      res.json({ token, user: { id: finalGuestId.toString(), username: finalUsername, role: 'guest', isGuest: true } });
    } catch (err) {
      console.error('Guest login error', err);
      res.status(500).json({ error: '游客登录失败' });
    }
  });

  // Verify Token
  app.get('/api/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未提供Token' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (decoded.isGuest) {
        return res.json({ user: { id: decoded.userId, username: decoded.username, role: 'guest', isGuest: true } });
      } else {
        if (!usersCollection) return res.json({ user: { id: decoded.userId, username: decoded.username, role: decoded.role, isGuest: false } });
        const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
        if (!user) return res.status(404).json({ error: '找不到用户' });
        res.json({ user: { id: user._id, username: user.username, email: user.email, role: user.role, isGuest: false } });
      }
    } catch (err) {
      res.status(401).json({ error: 'Token无效' });
    }
  });

  // ========== ADMIN ROUTES ==========
  let globalSoundSettings: Record<string, number> = {
    dice: 100,
    resource: 100,
    pirate: 100,
    click: 100,
    build: 100,
    bgm: 100,
  };

  app.get('/api/sound-settings', (req, res) => {
    res.json({ soundSettings: globalSoundSettings });
  });

  app.get('/api/messages', async (req, res) => {
    try {
      if (!messagesCollection) return res.json({ messages: [] });

      let currentUserId: string | null = null;
      let currentUsername: string | null = null;
      let isAdmin = false;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const decoded: any = jwt.verify(token, JWT_SECRET);
          if (decoded) {
            currentUserId = decoded.userId ? decoded.userId.toString() : null;
            currentUsername = decoded.username || null;
            if (decoded.role === 'admin') isAdmin = true;
          }
        } catch (e) {}
      }

      const messages = await messagesCollection.find().sort({ createdAt: -1 }).toArray();

      const filtered = messages.filter((m: any) => {
        const isPrivate = m.type === 'private' || Boolean(m.targetUserId);
        if (!isPrivate) {
          return true; // System messages visible to everyone
        }
        if (isAdmin) {
          return true; // Admin can see all messages
        }
        if (currentUserId && (m.targetUserId === currentUserId || m.senderId === currentUserId)) {
          return true;
        }
        if (currentUsername && (m.targetUserId === currentUsername || m.targetUserName === currentUsername || m.senderName === currentUsername)) {
          return true;
        }
        return false;
      });

      let adminUsername = '肖隐弦';
      if (usersCollection) {
        try {
          const adminUser = await usersCollection.findOne({ role: 'admin' });
          if (adminUser?.username) {
            adminUsername = adminUser.username;
          }
        } catch (e) {}
      }

      let allPlayerNames: string[] = [];
      if (isAdmin && usersCollection) {
        try {
          const players = await usersCollection.find({ isGuest: false }).project({ username: 1, role: 1 }).toArray();
          allPlayerNames = players
            .filter((p: any) => p.username && p.role !== 'admin' && p.username !== currentUsername)
            .map((p: any) => p.username);
        } catch (e) {}
      }

      res.json({ 
        adminUsername,
        allPlayers: allPlayerNames,
        messages: filtered.map((m: any) => {
        const d = m.createdAt ? new Date(m.createdAt) : new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        const timeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        return {
          id: m._id.toString(),
          title: m.title,
          content: m.content,
          type: m.type || (m.targetUserId ? 'private' : 'system'),
          targetUserId: m.targetUserId || null,
          targetUserName: m.targetUserName || null,
          senderName: m.senderName || (m.targetUserId ? adminUsername : '系统'),
          senderId: m.senderId || null,
          date: timeStr,
          createdAt: m.createdAt || Date.now()
        };
      })});
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post('/api/messages/private', authMiddleware, async (req: any, res: any) => {
    try {
      const { content, title, targetUserId } = req.body;
      if (!content || !content.trim()) return res.status(400).json({ error: '私信内容不能为空' });
      if (!messagesCollection) return res.status(500).json({ error: 'DB未连接' });

      let adminUsername = '肖隐弦';
      if (usersCollection) {
        try {
          const adminUser = await usersCollection.findOne({ role: 'admin' });
          if (adminUser?.username) {
            adminUsername = adminUser.username;
          }
        } catch (e) {}
      }

      const senderName = req.user?.username || '玩家';
      const senderId = req.user?.userId ? req.user.userId.toString() : 'user';

      const doc = { 
        title: (title && title.trim()) ? title.trim() : '私信', 
        content: content.trim(), 
        type: 'private',
        targetUserId: targetUserId ? targetUserId.toString() : 'admin',
        targetUserName: adminUsername,
        senderName: senderName,
        senderId: senderId,
        createdAt: Date.now() 
      };
      const result = await messagesCollection.insertOne(doc);

      const d = new Date(doc.createdAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      const timeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      res.json({ success: true, message: {
        id: result.insertedId.toString(),
        title: doc.title,
        content: doc.content,
        type: doc.type,
        targetUserId: doc.targetUserId,
        targetUserName: doc.targetUserName,
        senderName: doc.senderName,
        senderId: doc.senderId,
        date: timeStr,
        createdAt: doc.createdAt
      }});
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '发送私信失败' });
    }
  });

  app.post('/api/admin/messages', authMiddleware, adminMiddleware, async (req: any, res: any) => {
    try {
      const { title, content, targetUserId } = req.body;
      if (!content || !content.trim()) return res.status(400).json({ error: '消息内容不能为空' });
      if (!messagesCollection) return res.status(500).json({ error: 'DB未连接' });

      const isPrivate = Boolean(targetUserId);
      const msgTitle = (title && title.trim()) ? title.trim() : (isPrivate ? '私信' : '系统通知');

      let targetUserName = null;
      if (targetUserId && usersCollection) {
        try {
          const targetUser = await usersCollection.findOne({ _id: new ObjectId(targetUserId) });
          if (targetUser) {
            targetUserName = targetUser.username;
          } else {
            const targetUserByUsername = await usersCollection.findOne({ username: targetUserId });
            if (targetUserByUsername) targetUserName = targetUserByUsername.username;
          }
        } catch (e) {
          const targetUserByUsername = await usersCollection.findOne({ username: targetUserId });
          if (targetUserByUsername) targetUserName = targetUserByUsername.username;
        }
      }

      const doc = { 
        title: msgTitle, 
        content: content.trim(), 
        type: isPrivate ? 'private' : 'system',
        targetUserId: targetUserId ? targetUserId.toString() : null,
        targetUserName: targetUserName || (targetUserId ? targetUserId.toString() : null),
        senderName: req.user?.username || '管理员',
        senderId: req.user?.userId ? req.user.userId.toString() : 'admin',
        createdAt: Date.now() 
      };
      const result = await messagesCollection.insertOne(doc);

      const d = new Date(doc.createdAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      const timeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      res.json({ success: true, message: {
        id: result.insertedId.toString(),
        title: doc.title,
        content: doc.content,
        type: doc.type,
        targetUserId: doc.targetUserId,
        targetUserName: doc.targetUserName,
        senderName: doc.senderName,
        senderId: doc.senderId,
        date: timeStr,
        createdAt: doc.createdAt
      }});
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '发送消息失败' });
    }
  });

  registerMessageDeletionRoutes(app, authMiddleware, () => messagesCollection);

  app.delete('/api/admin/messages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: '无效的消息编号' });
      if (!messagesCollection) return res.status(500).json({ error: 'DB未连接' });
      const message = await messagesCollection.findOne({ _id: new ObjectId(id) });
      if (!message) return res.status(404).json({ error: '消息不存在' });
      if (message.type === 'private' || message.targetUserId) return res.status(409).json({ error: '聊天记录不再删除，请使用清屏或隐藏会话' });
      await messagesCollection.deleteOne({ _id: new ObjectId(id) });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '删除消息失败' });
    }
  });

  app.get('/api/feedback/prompt', async (req, res) => {
    try {
      const defaultPrompt = '您的意见对我们非常重要。请详细描述您遇到的问题或建议，反馈内容将提交给管理员查看。';
      if (!aboutCollection) return res.json({ prompt: defaultPrompt });
      const doc = await aboutCollection.findOne({ type: 'feedback_prompt' });
      res.json({ prompt: doc?.prompt || defaultPrompt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '获取反馈提示词失败' });
    }
  });

  app.post('/api/admin/feedback/prompt', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { prompt } = req.body;
      if (prompt === undefined) return res.status(400).json({ error: '提示词不能为空' });
      if (!aboutCollection) return res.status(500).json({ error: 'DB未连接' });

      await aboutCollection.updateOne(
        { type: 'feedback_prompt' },
        { $set: { type: 'feedback_prompt', prompt, updatedAt: Date.now() } },
        { upsert: true }
      );
      res.json({ success: true, prompt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '保存反馈提示词失败' });
    }
  });

  app.get('/api/about', async (req, res) => {
    try {
      if (!aboutCollection) {
        return res.json({ content: '欢迎体验卡坦岛线上全功能版！', updatedAt: new Date().toISOString().split('T')[0] });
      }
      const doc = await aboutCollection.findOne({ type: 'about' });
      if (!doc) {
        return res.json({ content: '欢迎体验卡坦岛线上全功能版！包含单人人机、多人对局、扩展地图与海域探险。', updatedAt: new Date().toISOString().split('T')[0] });
      }
      res.json({
        content: doc.content || '',
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '获取关于信息失败' });
    }
  });

  app.post('/api/admin/about', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { content } = req.body;
      if (content === undefined) return res.status(400).json({ error: '内容不能为空' });
      if (!aboutCollection) return res.status(500).json({ error: 'DB未连接' });

      const updatedAt = Date.now();
      await aboutCollection.updateOne(
        { type: 'about' },
        { $set: { type: 'about', content, updatedAt } },
        { upsert: true }
      );
      res.json({ success: true, content, updatedAt: new Date(updatedAt).toISOString().split('T')[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '保存关于信息失败' });
    }
  });

  app.get('/api/admin/feedbacks', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!feedbackCollection) return res.json({ feedbacks: [] });
      const feedbacks = await feedbackCollection.find().sort({ createdAt: -1 }).toArray();
      res.json({
        feedbacks: feedbacks.map((f: any) => ({
          id: f._id.toString(),
          userId: f.userId,
          username: f.username,
          text: f.text,
          date: new Date(f.createdAt).toLocaleString('zh-CN')
        }))
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '获取反馈失败' });
    }
  });

  app.delete('/api/admin/feedbacks/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      if (!feedbackCollection) return res.status(500).json({ error: 'DB未连接' });
      await feedbackCollection.deleteOne({ _id: new ObjectId(id) });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '删除反馈失败' });
    }
  });

  app.post('/api/feedback', authMiddleware, async (req: any, res: any) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: '反馈内容必填' });
      if (!feedbackCollection) return res.status(500).json({ error: 'DB未连接' });
      
      const feedback = {
        userId: req.user.userId,
        username: req.user.username,
        text,
        createdAt: Date.now()
      };
      
      await feedbackCollection.insertOne(feedback);
      
      // Attempt to send email if configured
      if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.ADMIN_EMAIL) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT),
          secure: process.env.SMTP_PORT === '465',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: process.env.ADMIN_EMAIL,
          subject: `Catan Feedback from ${req.user.username}`,
          text: `User: ${req.user.username} (ID: ${req.user.userId})\n\nFeedback:\n${text}`
        });
        console.log(`[Server] Feedback email sent for user ${req.user.username}`);
      } else {
        console.warn(`[Server] Feedback saved to DB, but email not sent because SMTP environment variables are not fully configured.`);
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '提交反馈失败' });
    }
  });

  app.post('/api/admin/sound-settings', authMiddleware, adminMiddleware, (req, res) => {
    const { soundSettings } = req.body;
    if (soundSettings && typeof soundSettings === 'object') {
      globalSoundSettings = { ...globalSoundSettings, ...soundSettings };
      io.emit('sound_settings_updated', globalSoundSettings);
    }
    res.json({ success: true, soundSettings: globalSoundSettings });
  });

  app.post('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
    const { maxVisibleRooms } = req.body;
    if (typeof maxVisibleRooms === 'number') {
      globalSettings.maxVisibleRooms = maxVisibleRooms;
    }
    res.json({ success: true, settings: globalSettings });
  });

  function isGameWinForUser(game: any, username: string): boolean {
    if (!game || !username || !game.players) return false;
    const cleanUser = username.trim().toLowerCase();
    if (game.winnerId !== undefined && game.winnerId !== null) {
      const p = game.players.find((pl: any) => pl.name && pl.name.trim().toLowerCase() === cleanUser);
      if (p && String(p.id) === String(game.winnerId)) return true;
    }
    // Fallback if winnerId was not explicitly set or mismatched
    const player = game.players.find((pl: any) => pl.name && pl.name.trim().toLowerCase() === cleanUser);
    if (player) {
      const myScore = player.score || 0;
      const targetScore = game.mapType === 'standard' ? 10 : 14;
      const maxScore = Math.max(...game.players.map((pl: any) => pl.score || 0));
      if (myScore >= targetScore && myScore === maxScore) {
        const topCount = game.players.filter((pl: any) => (pl.score || 0) === maxScore).length;
        if (topCount === 1) return true;
      }
    }
    return false;
  }

  function computeUserGameStats(games: any[], username: string) {
    const cleanUser = username.trim().toLowerCase();
    const userGames = games.filter(g => g.players?.some((p: any) => p.name && p.name.trim().toLowerCase() === cleanUser));
    const totalGames = userGames.length;
    const wins = userGames.filter(g => isGameWinForUser(g, username)).length;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    return { totalGames, wins, winRate };
  }

  app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const userCount = usersCollection ? await usersCollection.countDocuments({ isGuest: false }) : 0;
      const guestCount = usersCollection ? await usersCollection.countDocuments({ isGuest: true }) : 0;
      const gameCount = gamesCollection ? await gamesCollection.countDocuments() : 0;
      
      let allUsers = usersCollection ? await usersCollection.find({ isGuest: false }).sort({ createdAt: -1 }).project({ password: 0 }).toArray() : [];
      const allGames = gamesCollection ? await gamesCollection.find().toArray() : [];
      const identityUsers = usersCollection ? await usersCollection.find({}).project({ _id: 1, username: 1, isGuest: 1, role: 1, createdAt: 1 }).toArray() : [];
      const rankedStats = computeLeaderboardUserStats(allGames, identityUsers);
      
      allUsers = allUsers.map(u => {
        const stats = computeUserGameStats(allGames, u.username);
        return { ...u, ...stats, recent3DayGames: rankedStats.get(String(u._id))?.recent3DayGames || 0 };
      });
      
      const latestUsers = allUsers.slice(0, 10);
      const latestGames = gamesCollection ? await gamesCollection.find().sort({ completedAt: -1 }).limit(10).toArray() : [];

      res.json({
        stats: { users: userCount, guests: guestCount, games: gameCount },
        settings: globalSettings,
        latestUsers,
        allUsers,
        latestGames
      });
    } catch (error) {
      console.error('Admin API error', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  });

  app.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!usersCollection) return res.status(500).json({ error: '数据库未连接' });
      
      const { userId } = req.params;
      const userToDelete = await usersCollection.findOne({ _id: new ObjectId(userId) });
      
      if (!userToDelete) return res.status(404).json({ error: '找不到该用户' });
      
      if (userToDelete.role === 'admin') {
         return res.status(403).json({ error: '不能删除其他管理员账号' });
      }

      await usersCollection.deleteOne({ _id: new ObjectId(userId) });
      res.json({ message: '用户已成功注销' });
    } catch (error) {
      console.error('Admin delete user error', error);
      res.status(500).json({ error: '删除用户失败' });
    }
  });

  app.delete('/api/admin/games/:gameId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!gamesCollection) return res.status(500).json({ error: '数据库未连接' });
      
      const { gameId } = req.params;
      const result = await gamesCollection.deleteOne({ _id: new ObjectId(gameId) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: '找不到该游戏记录' });
      }

      res.json({ message: '游戏记录已成功删除' });
    } catch (error) {
      console.error('Admin delete game error', error);
      res.status(500).json({ error: '删除游戏记录失败' });
    }
  });

  app.get('/api/admin/user/:username/games', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!gamesCollection) return res.status(500).json({ error: '数据库未连接' });
      const { username } = req.params;
      
      const games = await gamesCollection.find({ 
        "players.name": { $regex: new RegExp(`^${username.trim()}$`, 'i') } 
      })
        .sort({ completedAt: -1 })
        .limit(200)
        .toArray();
      
      const stats = computeUserGameStats(games, username);
      res.json({ games, stats });
    } catch (err) {
      console.error('Fetch admin user games error', err);
      res.status(500).json({ error: '获取战绩失败' });
    }
  });

  app.get('/api/admin/user/:username/info', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!usersCollection) return res.status(500).json({ error: '数据库未连接' });
      const { username } = req.params;
      
      const user = await usersCollection.findOne({ username }, { projection: { password: 0 } });
      if (!user) {
        return res.json({ user: { username, isGuest: true, email: '临时游客/AI玩家' } });
      }
      
      res.json({ user: { id: user._id, username: user.username, email: user.email, role: user.role, isGuest: false } });
    } catch (err) {
      console.error('Fetch admin user info error', err);
      res.status(500).json({ error: '获取玩家信息失败' });
    }
  });

  app.put('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!usersCollection) return res.status(500).json({ error: '数据库未连接' });
      const { userId } = req.params;
      const { username } = req.body;
      
      if (!username || username.trim() === '') {
        return res.status(400).json({ error: '昵称不能为空' });
      }

      const userToUpdate = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!userToUpdate) return res.status(404).json({ error: '找不到该用户' });

      await usersCollection.updateOne({ _id: new ObjectId(userId) }, { $set: { username: username.trim() } });
      res.json({ message: '昵称修改成功' });
    } catch (error) {
      console.error('Admin update user error', error);
      res.status(500).json({ error: '修改昵称失败' });
    }
  });

  app.put('/api/user/profile', authMiddleware, async (req, res) => {
    try {
      if (!usersCollection) return res.status(500).json({ error: '数据库未连接' });
      const userId = (req as any).user.userId;
      
      if ((req as any).user.isGuest) {
        return res.status(400).json({ error: '游客无法修改资料' });
      }

      const { username, password, oldPassword } = req.body;
      const updateData: any = {};
      
      if (username && username.trim() !== '') {
        updateData.username = username.trim();
      }
      
      if (password && password.trim() !== '') {
        if (!oldPassword || oldPassword.trim() === '') {
          return res.status(400).json({ error: '修改密码必须提供当前密码' });
        }
        const userToUpdate = await usersCollection.findOne({ _id: new ObjectId(userId) });
        const isMatch = await bcrypt.compare(oldPassword, userToUpdate.password);
        if (!isMatch) {
          return res.status(400).json({ error: '当前密码不正确' });
        }
        updateData.password = await bcrypt.hash(password, 10);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: '未提供修改内容' });
      }

      await usersCollection.updateOne({ _id: new ObjectId(userId) }, { $set: updateData });
      
      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
      const newToken = jwt.sign({ userId: user._id, username: user.username, role: user.role, isGuest: false }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token: newToken, user: { id: user._id, username: user.username, email: user.email, role: user.role, isGuest: false } });
    } catch (error) {
      console.error('Update profile error', error);
      res.status(500).json({ error: '修改资料失败' });
    }
  });

  // Legacy image URLs resolve to bundled assets, with no arbitrary outbound fetch.
  app.get('/api/proxy-image', (req, res) => {
    try {
      const url = new URL(String(req.query.url || ''));
      const hosts = ['fastly.jsdelivr.net', 'cdn.jsdelivr.net', 'gcore.jsdelivr.net', 'testingcf.jsdelivr.net', 'jsd.cdn.zzko.cn', 'raw.githubusercontent.com'];
      if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) return res.status(400).send('Unsupported asset');
      const match = url.pathname.match(/(?:\/gh\/xia-skot\/Catan_Pics|\/xia-skot\/Catan_Pics\/main)\/(img|audio)\/([^/]+)$/);
      if (!match) return res.status(404).send('Asset not found');
      const files = match[1] === 'img' ? assetManifest.images : assetManifest.audio;
      const filename = encodeURIComponent(decodeURIComponent(match[2]));
      const local = files[filename as keyof typeof files];
      if (!local) return res.status(404).send('Asset not found');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(path.join(__dirname, 'public', local));
    } catch { res.status(400).send('Invalid asset URL'); }
  });

  app.get('/api/user/games', authMiddleware, async (req, res) => {
    try {
      if (!gamesCollection) return res.status(500).json({ error: '数据库未连接' });
      const username = (req as any).user.username;
      
      const games = await gamesCollection.find({ 
        "players.name": { $regex: new RegExp(`^${username.trim()}$`, 'i') } 
      })
        .sort({ completedAt: -1 })
        .limit(200)
        .toArray();
        
      const stats = computeUserGameStats(games, username);
      res.json({ games, stats });
    } catch (err) {
      console.error('Fetch user games error', err);
      res.status(500).json({ error: '获取战绩失败' });
    }
  });

  // ========== MAPS ARCHIVE ROUTES ==========
  app.get('/api/maps', async (req, res) => {
    try {
      if (!mapsCollection) return res.json({ maps: [] });
      const maps = await mapsCollection.find().sort({ createdAt: -1 }).toArray();
      res.json({ maps });
    } catch (err) {
      console.error('Fetch maps error', err);
      res.status(500).json({ error: '获取图册失败' });
    }
  });

  app.post('/api/maps', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!mapsCollection) return res.status(500).json({ error: '数据库未连接' });
      const { name, mapData } = req.body;
      if (!name || !mapData) return res.status(400).json({ error: '地图名称和数据不能为空' });
      
      await mapsCollection.insertOne({
         name: name.trim(),
         mapData,
         createdAt: new Date()
      });
      res.json({ message: '上传成功' });
    } catch (err) {
      console.error('Upload map error', err);
      res.status(500).json({ error: '上传失败' });
    }
  });

  app.delete('/api/maps/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!mapsCollection) return res.status(500).json({ error: '数据库未连接' });
      await mapsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.json({ message: '删除成功' });
    } catch (err) {
      console.error('Delete map error', err);
      res.status(500).json({ error: '删除失败' });
    }
  });

  app.put('/api/maps/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!mapsCollection) return res.status(500).json({ error: '数据库未连接' });
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: '新名称不能为空' });
      
      await mapsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { name: name.trim() } }
      );
      res.json({ message: '重命名成功' });
    } catch (err) {
      console.error('Rename map error', err);
      res.status(500).json({ error: '重命名失败' });
    }
  });

  // ================= DEBUG SAVE/LOAD ENDPOINTS =================

  // Save Game Progress
  app.post('/api/admin/save-game', authMiddleware, adminMiddleware, async (req: any, res: any) => {
    try {
      const { roomId, saveName } = req.body;
      if (!roomId || !saveName) {
        return res.status(400).json({ error: '房间ID和存档名称不能为空' });
      }

      // Check if room exists in active map
      const room = rooms.get(roomId);
      if (!room) {
        return res.status(404).json({ error: '该房间在服务器中未找到，可能已失效或被清理。' });
      }

      // Update the room's current save name to match
      room.loadedFromSaveName = saveName.trim();

      const saveDoc = {
        name: saveName.trim(),
        roomId,
        roomData: JSON.parse(JSON.stringify(room)), // Deep clone to serialize safely
        savedBy: req.user.username,
        savedAt: new Date()
      };

      if (debugSavesCollection) {
        // Check if an archive with the same name already exists
        const existingSave = await debugSavesCollection.findOne({ name: saveName.trim() });
        if (existingSave) {
          // Overwrite the existing document
          await debugSavesCollection.updateOne(
            { _id: existingSave._id },
            { 
              $set: {
                roomId,
                roomData: saveDoc.roomData,
                savedBy: req.user.username,
                savedAt: new Date()
              }
            }
          );
          console.log(`[Server] Overwrote debug save "${saveName.trim()}" for room ${roomId}`);
        } else {
          // Insert a new document
          await debugSavesCollection.insertOne(saveDoc);
          console.log(`[Server] Created new debug save "${saveName.trim()}" for room ${roomId}`);
        }
      } else {
        console.warn('MongoDB not connected. Saving game state temporarily is not persistent across restarts.');
      }

      res.json({ message: '存档成功！' });
    } catch (err) {
      console.error('Save game progress error', err);
      res.status(500).json({ error: '保存游戏进度失败' });
    }
  });

  // Get Saved Games List
  app.get('/api/admin/saved-games', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!debugSavesCollection) {
        return res.json({ saves: [] });
      }
      const saves = await debugSavesCollection.find().sort({ savedAt: -1 }).toArray();
      res.json({ saves });
    } catch (err) {
      console.error('Fetch saved games error', err);
      res.status(500).json({ error: '获取存档列表失败' });
    }
  });

  // Restore Saved Game Progress
  app.post('/api/admin/restore-game', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { saveId } = req.body;
      if (!saveId) {
        return res.status(400).json({ error: '未指定存档ID' });
      }

      if (!debugSavesCollection) {
        return res.status(500).json({ error: '数据库未连接，无法读取存档' });
      }

      const save = await debugSavesCollection.findOne({ _id: new ObjectId(saveId) });
      if (!save) {
        return res.status(404).json({ error: '存档未找到' });
      }

      const roomData = save.roomData;
      // To ensure we can resume cleanly, make sure lastActiveAt is updated
      roomData.lastActiveAt = Date.now();
      roomData.loadedFromSaveName = save.name;
      roomData.loadedFromSaveId = save._id.toString();
      
      // Overwrite/insert the room in-memory Map
      rooms.set(roomData.roomId, roomData);

      console.log(`[Server] Restored debug game state for room ${roomData.roomId} from save: ${save.name}`);

      res.json({ message: '游戏进度已恢复！', roomId: roomData.roomId });
    } catch (err) {
      console.error('Restore game progress error', err);
      res.status(500).json({ error: '恢复游戏进度失败' });
    }
  });

  // Delete Saved Game
  app.delete('/api/admin/saved-games/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (!debugSavesCollection) {
        return res.status(500).json({ error: '数据库未连接' });
      }
      await debugSavesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.json({ message: '删除存档成功' });
    } catch (err) {
      console.error('Delete saved game error', err);
      res.status(500).json({ error: '删除存档失败' });
    }
  });

  // =============================================================

  for (const kind of ['images', 'audio']) {
    app.use(`/assets/${kind}`, express.static(path.join(__dirname, 'public/assets', kind), { maxAge: '1y', immutable: true }));
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      mode: DEMO_MODE ? 'demo' : 'development',
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Socket.io logic
  const globalSettings = {
    maxVisibleRooms: 10
  };

  const touchRoom = (roomId: string) => {
    const room = rooms.get(roomId);
    if (room) {
      room.lastActiveAt = Date.now();
    }
  };

  // Perform room cleanup every minute
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      if (room.reservedUntil && now < room.reservedUntil) {
        continue;
      }
      
      const timeSinceLastActive = room.lastActiveAt ? now - room.lastActiveAt : 0;
      if (timeSinceLastActive > 10 * 60 * 1000) { // 10 minutes inactive
        console.log(`[Server] Automatically cleaned up room ${roomId} due to inactivity.`);
        io.to(roomId).emit('game_reset');
        setTimeout(() => {
          io.in(roomId).socketsLeave(roomId);
        }, 100);
        rooms.delete(roomId);
      }
    }
  }, 60000);

  // Self-ping to prevent Render sleep on free tier when rooms are reserved
  setInterval(() => {
    const pingUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
    if (!pingUrl) return;

    let hasReservedRooms = false;
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.reservedUntil && now < room.reservedUntil) {
        hasReservedRooms = true;
        break;
      }
    }

    if (hasReservedRooms) {
      const targetUrl = pingUrl.endsWith('/') ? pingUrl + 'api/health' : pingUrl + '/api/health';
      console.log(`[Keep-Alive] Room is reserved. Pinging ${targetUrl} to prevent Render sleep...`);
      fetch(targetUrl).catch(err => console.log('[Keep-Alive] Ping failed:', err instanceof Error ? err.message : String(err)));
    }
  }, 10 * 60 * 1000); // 10 minutes

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.onAny((eventName, ...args) => {
      if (args && args.length > 0 && typeof args[0] === 'string') {
        const roomId = args[0];
        if (rooms.has(roomId)) {
          touchRoom(roomId);
        }
      }
    });

    socket.on('join_room', (roomId: string, playerId: string, playerName: string, asSpectator?: boolean, authToken?: string) => {
      let verifiedUserId: string | undefined;
      try {
        const identity = jwt.verify(authToken || '', JWT_SECRET) as any;
        if (identity.userId === playerId && !identity.isGuest && identity.role !== 'guest') verifiedUserId = identity.userId;
      } catch { /* Legacy clients can play, but cannot claim a ranked account. */ }
      touchRoom(roomId);
      if (!playerId) playerId = socket.id;
      if (!playerName) playerName = '玩家';
      console.log('User joining room:', roomId, playerId, 'asSpectator:', asSpectator);
      socket.join(roomId);
      
      let room = rooms.get(roomId);
      console.log('Room found:', !!room);
      if (!room) {
        room = {
          roomId,
          hostId: playerId,
          players: [],
          spectators: [],
          settings: {
            playerCount: 4,
            mapType: 'archipelago',
            botConfig: DEMO_MODE ? [false, true, true, true] : [false, false, false, false]
          }
        };
        rooms.set(roomId, room);
        console.log('Created room:', roomId, JSON.stringify(room));
      }
      touchRoom(roomId);
      
      const existingPlayer = room.players.find((p: any) => p.id === playerId);
      const returningParticipant = !!existingPlayer || !!room.spectators?.some((s: any) => s.id === playerId);
      if (!existingPlayer) {
        // If they explicitly want to spectate, are already a spectator, game has started, or room is full
        const botCount = room.settings?.botConfig?.filter((b: boolean) => b).length || 0;
        const alreadySpectator = room.spectators && room.spectators.some((s: any) => s.id === playerId);
        
        if (room.gameState || asSpectator || alreadySpectator || (room.players.length + botCount >= (room.settings?.playerCount || 4))) {
          if (!room.spectators) room.spectators = [];
          const existingSpectator = room.spectators.find((s: any) => s.id === playerId);
          if (!existingSpectator) {
            room.spectators.push({ id: playerId, name: playerName, socketId: socket.id });
          } else {
            existingSpectator.socketId = socket.id;
          }
        } else {
          room.players.push({ id: playerId, name: playerName, isReady: false, socketId: socket.id, disconnected: false });
        }
      } else {
        existingPlayer.socketId = socket.id;
        existingPlayer.name = playerName;
        existingPlayer.disconnected = false;
        // Don't reset ready status if game is already started, so they don't block the UI
        if (!room.gameState) {
          existingPlayer.isReady = false; 
        }
      }
      
      const joinedPlayer = room.players.find((p: any) => p.id === playerId);
      if (joinedPlayer) joinedPlayer.userId = verifiedUserId;

      // Fallback: if server thinks current host is a bot or missing
      const currentHost = room.players.find((p: any) => p.id === room.hostId);
      if (!currentHost || currentHost.isBot) {
        const firstHumanPlayer = room.players.find((p: any) => !p.isBot && !p.disconnected);
        if (firstHumanPlayer) {
          room.hostId = firstHumanPlayer.id;
        }
      }
      
      socket.emit('room_state', room);
      io.to(roomId).emit('room_state', room);
      
      if (room.gameState) {
        socket.emit('game_init', room.gameState, { entry: returningParticipant ? 'resume' : 'start' });
      }
    });

    socket.on('leave_room', (roomId: string, playerId: string) => {
      console.log('User leaving room:', roomId, playerId);
      socket.leave(roomId);
      touchRoom(roomId);
      
      const room = rooms.get(roomId);
      if (room) {
        // Handle spectator leaving
        const spectatorIndex = room.spectators?.findIndex((s: any) => s.id === playerId);
        if (spectatorIndex !== undefined && spectatorIndex !== -1) {
          room.spectators.splice(spectatorIndex, 1);
          io.to(roomId).emit('room_state', room);
          return;
        }

        if (!room.gameState) {
          room.players = room.players.filter((p: any) => p.id !== playerId);
          if (room.hostId === playerId && room.players.length > 0) {
            room.hostId = room.players[0].id;
          }
        } else {
          const player = room.players.find((p: any) => p.id === playerId);
          if (player) {
            player.disconnected = true;
            console.log('Player marked disconnected:', playerId);
            if (room.hostId === playerId) {
              room.hostId = getRoomController(room, false) || room.hostId;
            }
          }
        }
        
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`[Server] Room ${roomId} deleted as it became empty.`);
        } else {
          io.to(roomId).emit('room_state', room);
        }
      }
    });

    socket.on('kick_player', (roomId: string, hostId: string, playerToKickId: string) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === hostId) {
        let updateUI = false;
        
        // Check players
        const playerIndex = room.players.findIndex((p: any) => p.id === playerToKickId);
        if (playerIndex !== -1 && !room.gameState) { // Only allow kicking from lobby
          room.players.splice(playerIndex, 1);
          updateUI = true;
        }

        // Check spectators
        if (room.spectators) {
          const specIndex = room.spectators.findIndex((s: any) => s.id === playerToKickId);
          if (specIndex !== -1) {
            room.spectators.splice(specIndex, 1);
            updateUI = true;
          }
        }

        if (updateUI) {
          io.to(roomId).emit('room_state', room);
          io.to(roomId).emit('player_kicked', playerToKickId);
        }
      }
    });

    socket.on('demote_to_spectator', (roomId: string, hostId: string, targetPlayerId: string) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === hostId && !room.gameState) {
        const playerIndex = room.players.findIndex((p: any) => p.id === targetPlayerId);
        if (playerIndex !== -1) {
          const p = room.players.splice(playerIndex, 1)[0];
          if (!room.spectators) room.spectators = [];
          room.spectators.push(p);
          io.to(roomId).emit('room_state', room);
        }
      }
    });

    socket.on('promote_to_player', (roomId: string, hostId: string, targetPlayerId: string) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === hostId && !room.gameState) {
        const botCount = room.settings?.botConfig?.filter((b: boolean) => b).length || 0;
        if (room.players.length + botCount >= (room.settings?.playerCount || 4)) return;
        
        const specIndex = room.spectators?.findIndex((s: any) => s.id === targetPlayerId);
        if (specIndex !== undefined && specIndex !== -1) {
          const s = room.spectators.splice(specIndex, 1)[0];
          s.isReady = false;
          s.disconnected = false;
          room.players.push(s);
          io.to(roomId).emit('room_state', room);
        }
      }
    });

    socket.on('toggle_ready', (roomId: string, playerId: string) => {
      const room = rooms.get(roomId);
      if (room) {
        const player = room.players.find((p: any) => p.id === playerId);
        if (player) {
          player.isReady = !player.isReady;
          io.to(roomId).emit('room_state', room);
        }
      }
    });

    socket.on('update_settings', (roomId: string, playerId: string, settings: any, mutation?: { clientId: string; sequence: number }) => {
      const room = rooms.get(roomId);
      if (room && !room.gameState && room.hostId === playerId && settings && typeof settings === 'object') {
        Object.assign(room, applySettingsPatch(room, settings));
        if (typeof mutation?.clientId === 'string' && mutation.clientId.length < 80 && Number.isSafeInteger(mutation.sequence)) {
          room.settingsMutation = mutation;
        }
        touchRoom(roomId);
        io.to(roomId).emit('room_state', room);
      }
    });

    socket.on('update_game_state', async (roomId: string, gameState: any) => {
      const room = rooms.get(roomId);
      if (!room || !socket.rooms.has(roomId) || !room.players.some((p: any) => p.socketId === socket.id && !p.disconnected) ||
          !gameState || !Array.isArray(gameState.players)) return;
      const isSpectatorSocket = room.spectators?.some((s: any) => s.socketId === socket.id || s.id === socket.id);
      if (isSpectatorSocket) return;
      const previousState = room.gameState;
      // Commit the in-memory transition before awaiting persistence, so two winner updates cannot insert twice.
      room.gameState = gameState;
      socket.broadcast.to(roomId).emit('game_state_updated', gameState);
      if (room) {
        touchRoom(roomId);

        // If a winner is just declared, save game using gamesCollection
        if (gameState && gameState.winnerId !== undefined && gameState.winnerId !== null && 
            (!previousState || previousState.winnerId === undefined || previousState.winnerId === null || hasUnsavedLeaderboardResult(room))) {
            
            if (gamesCollection) {
              const gameRecord = {
                 roomId,
                 players: gameState.players.map((p: any) => {
                   const unplayedVPCards = (p.devCards?.filter((c: any) => c === 'victoryPoint').length) || 
                                           (p.developmentCards?.filter((c: any) => c === 'victoryPoint').length) || 0;
                   const vpBoughtThisTurn = (p.devCardsBoughtThisTurn?.filter((c: any) => c === 'victoryPoint').length) || 0;
                   const playedVPCards = (p.playedDevCards?.filter((c: any) => c === 'victoryPoint').length) || 0;
                   const totalVpCards = unplayedVPCards + vpBoughtThisTurn + playedVPCards;

                   const settlementsPts = (p.settlements || 0) * 1;
                   const citiesPts = (p.cities || 0) * 2;
                   const longestRoadPts = (gameState.longestRoadPlayerId === p.id) ? 2 : 0;
                   const largestArmyPts = (gameState.largestArmyPlayerId === p.id) ? 2 : 0;
                   const isStandard = room.settings?.mapType === 'standard' || gameState.mapType === 'standard';
                   const islandBonusPts = isStandard ? 0 : (p.islandBonusPoints || 0);
                   const totalScore = settlementsPts + citiesPts + longestRoadPts + largestArmyPts + totalVpCards + islandBonusPts;

                   return {
                     id: p.id,
                     name: p.name,
                     isBot: p.isBot,
                     score: totalScore,
                     breakdown: {
                       settlements: p.settlements || 0,
                       cities: p.cities || 0,
                       longestRoad: gameState.longestRoadPlayerId === p.id,
                       largestArmy: gameState.largestArmyPlayerId === p.id,
                       vpCards: totalVpCards,
                       islandBonus: islandBonusPts
                     }
                   };
                 }),
                 winnerId: gameState.winnerId,
                 turnCount: gameState.turn,
                 mapType: room.settings?.mapType || gameState.mapType || 'standard',
                 completedAt: new Date()
              };
              try {
                await persistLeaderboardResult(room, gameRecord, gamesCollection);
                console.log(`[Server] Game ${roomId} result saved.`);
              } catch(e) {
                console.error('Failed to save game result:', e);
              }
            }
        }
      }
    });

    socket.on('react_to_trade', (roomId: string, tradeId: string, playerId: number, reaction: 'accept' | 'reject') => {
      const room = rooms.get(roomId);
      const actor = [...(room?.players || []), ...(room?.spectators || [])].find((p: any) => p.socketId === socket.id && !p.disconnected);
      const reactingPlayer = room?.gameState?.players?.find((p: any) => p.id === playerId);
      if (!actor || !reactingPlayer || (reactingPlayer.isBot ? actor.id !== getRoomController(room) : actor.id !== reactingPlayer.sessionId) ||
          !['accept', 'reject'].includes(reaction)) return;
      if (room && room.gameState && room.gameState.tradeOffers) {
        const offers = room.gameState.tradeOffers;
        const index = offers.findIndex((o: any) => o.id === tradeId);
        if (index !== -1) {
          const offer = offers[index];
          if (offer.status !== 'pending' || offer.initiatorId !== room.gameState.currentPlayerIndex || playerId === offer.initiatorId ||
              (offer.targetPlayerId !== null && offer.targetPlayerId !== playerId)) return;
          if (reaction === 'accept') {
            if (!offer.acceptedBy.includes(playerId)) offer.acceptedBy.push(playerId);
            offer.rejectedBy = offer.rejectedBy.filter((id: number) => id !== playerId);
          } else {
            if (!offer.rejectedBy.includes(playerId)) offer.rejectedBy.push(playerId);
            offer.acceptedBy = offer.acceptedBy.filter((id: number) => id !== playerId);
          }
          io.to(roomId).emit('game_state_updated', room.gameState);
        }
      }
    });

    socket.on('finalize_trade', (roomId: string, tradeId: string, partnerId: number) => {
      const room = rooms.get(roomId);
      if (room && room.gameState) {
        const prev = room.gameState;
        const offer = (prev.tradeOffers || []).find((o: any) => o.id === tradeId);
        if (!offer || offer.status !== 'pending' || !offer.acceptedBy.includes(partnerId) || offer.initiatorId !== prev.currentPlayerIndex ||
            prev.phase !== 'main' || !prev.hasRolled || partnerId === offer.initiatorId) return;
        const initiator = prev.players.find((p: any) => p.id === offer.initiatorId);
        const partner = prev.players.find((p: any) => p.id === partnerId);
        if (!initiator || !partner) return;
        const actor = [...room.players, ...(room.spectators || [])].find((p: any) => p.socketId === socket.id && !p.disconnected);
        if (!actor || (initiator.isBot ? actor.id !== getRoomController(room) : actor.id !== initiator.sessionId)) return;
        const resourceKeys = ['lumber', 'brick', 'wool', 'grain', 'ore'];
        const validPayment = (amounts: any, player: any) => amounts && Object.keys(amounts).every(key => resourceKeys.includes(key)) &&
          resourceKeys.every(key => Number.isSafeInteger(amounts[key] || 0) && (amounts[key] || 0) >= 0 && player.resources[key] >= (amounts[key] || 0)) &&
          resourceKeys.some(key => amounts[key] > 0);
        if (!validPayment(offer.offer, initiator) || !validPayment(offer.request, partner)) return;

        // Perform trade
        for (const [res, amount] of Object.entries(offer.request)) {
          initiator.resources[res as string] = (initiator.resources[res as string] || 0) + (amount as number);
          partner.resources[res as string] -= (amount as number);
        }
        for (const [res, amount] of Object.entries(offer.offer)) {
          initiator.resources[res as string] -= (amount as number);
          partner.resources[res as string] = (partner.resources[res as string] || 0) + (amount as number);
        }

        offer.status = 'completed';
        offer.completedWith = partnerId;
        io.to(roomId).emit('game_state_updated', room.gameState);
      }
    });

    socket.on('request_sync', (roomId: string) => {
      const room = rooms.get(roomId);
      if (room && room.gameState) {
        // Send the cached game state only to the player who requested it
        socket.emit('game_state_updated', room.gameState);
        socket.emit('room_state', room);
      }
    });

    socket.on('reclaim_slot', (roomId: string, newPlayerId: string, oldPlayerId: string) => {
      const room = rooms.get(roomId);
      if (room && room.gameState) {
        // Find the old player in the room list
        const oldPlayerIndex = room.players.findIndex((p: any) => p.id === oldPlayerId);
        if (oldPlayerIndex !== -1 && room.players[oldPlayerIndex].disconnected) {
          // Update the room player list
          room.players[oldPlayerIndex].id = newPlayerId;
          room.players[oldPlayerIndex].socketId = socket.id;
          room.players[oldPlayerIndex].disconnected = false;
          
          // If the old player was the host, transfer host
          if (room.hostId === oldPlayerId) {
            room.hostId = newPlayerId;
          }
          
          // Update the gameState internal player list
          const gamePlayer = room.gameState.players.find((p: any) => p.sessionId === oldPlayerId);
          if (gamePlayer) {
            gamePlayer.sessionId = newPlayerId;
          }
          
          // Fallback: If current host is a bot, or if the old player was host
          const currentHost = room.players.find((p: any) => p.id === room.hostId);
          if (room.hostId === oldPlayerId || !currentHost || currentHost.isBot) {
            room.hostId = newPlayerId;
          }
          
          io.to(roomId).emit('room_state', room);
          io.to(roomId).emit('game_state_updated', room.gameState);
        }
      }
    });

    socket.on('start_game', (roomId: string, initialGameState: any) => {
      const room = rooms.get(roomId);
      if (!room || room.gameState || !room.players.some((p: any) => p.id === room.hostId && p.socketId === socket.id) ||
          !beginLeaderboardGame(room, initialGameState)) return;
      room.gameState = initialGameState;
      const configured = getSetupSlots(room).filter(slot => slot.isBot || slot.player);
      room.gameState.players = initialGameState.players.map((player: any, index: number) => ({
        ...player,
        botDifficulty: configured[index]?.isBot ? normalizeBotDifficulty(room.settings.botDifficulties?.[configured[index].index]) : 'expert',
      }));
      io.to(roomId).emit('game_init', initialGameState, { entry: 'start' });
    });

    socket.on('return_to_lobby', (roomId: string, playerId: string) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === playerId) {
        room.gameState = null;
        room.players.forEach((p: any) => {
          p.isReady = false;
        });
        io.to(roomId).emit('room_state', room);
        io.to(roomId).emit('returned_to_lobby');
      }
    });

    socket.on('reset_game', (roomId: string, playerId: string) => {
      const room = rooms.get(roomId);
      // Allow host to reset anytime, or any player to reset if the game is already finished
      if (room && (room.hostId === playerId || (room.gameState && room.gameState.winnerId !== null))) {
        rooms.delete(roomId);
        io.to(roomId).emit('game_reset');
        // Let the clients process the reset event before severing their room connection
        setTimeout(() => {
          io.in(roomId).socketsLeave(roomId);
        }, 100);
      }
    });

    socket.on('reserve_room', (roomId: string, durationMs: number | null, playerId: string) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === playerId) {
        if (durationMs === null) {
          room.reservedUntil = null;
        } else {
          room.reservedUntil = Date.now() + durationMs;
        }
        touchRoom(roomId);
        io.to(roomId).emit('room_state', room);
      }
    });

    socket.on('get_active_rooms', (isAdmin?: boolean, callback?: (rooms: any[]) => void) => {
      let activeRooms = Array.from(rooms.values())
        .map(r => ({
          ...r,
          status: r.gameState ? 'playing' : 'waiting'
        }))
        .filter(r => {
          if (r.settings?.isPrivate) return false;
          return r.status === 'waiting' || r.status === 'playing';
        });
      if (!isAdmin) {
        activeRooms = activeRooms.slice(0, globalSettings.maxVisibleRooms);
      }
      if (typeof callback === 'function') {
        callback(activeRooms);
      } else {
        socket.emit('active_rooms_list', activeRooms);
      }
    });

    socket.on('get_my_active_room', (playerId: string, playerName: string, callback: (room: any) => void) => {
      if (typeof callback !== 'function') return;
      const userRoom = Array.from(rooms.values()).find(r => 
        r.players?.some((p: any) => (playerId && p.id === playerId) || (playerName && p.name === playerName))
      );
      callback(userRoom || null);
    });

    socket.on('admin_delete_room', (roomId: string) => {
      if (rooms.has(roomId)) {
        rooms.delete(roomId);
        io.to(roomId).emit('room_deleted');
      }
    });

    socket.emit('sound_settings_updated', globalSoundSettings);

    socket.on('admin_update_sound_settings', (soundSettings: any) => {
      if (soundSettings && typeof soundSettings === 'object') {
        globalSoundSettings = { ...globalSoundSettings, ...soundSettings };
        io.emit('sound_settings_updated', globalSoundSettings);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      for (const [roomId, room] of rooms.entries()) {
        const spectatorIndex = room.spectators?.findIndex((s: any) => s.socketId === socket.id);
        if (spectatorIndex !== undefined && spectatorIndex !== -1) {
          room.spectators.splice(spectatorIndex, 1);
          touchRoom(roomId);
          io.to(roomId).emit('room_state', room);
          break;
        }

        const playerIndex = room.players.findIndex((p: any) => p.socketId === socket.id);
        if (playerIndex !== -1) {
          const disconnectedPlayer = room.players[playerIndex];
          if (!room.gameState) {
            // If the game hasn't started yet, remove the player completely
            room.players.splice(playerIndex, 1);
            if (room.hostId === disconnectedPlayer.id && room.players.length > 0) {
              room.hostId = room.players[0].id;
            }
          } else {
            // If the game is in progress, mark them as disconnected
            disconnectedPlayer.disconnected = true;
            console.log('Player marked disconnected:', disconnectedPlayer.id);
            if (room.hostId === disconnectedPlayer.id) {
              room.hostId = getRoomController(room, false) || room.hostId;
            }
          }
          touchRoom(roomId);
          
          if (room.players.length === 0) {
            rooms.delete(roomId);
            console.log(`[Server] Room ${roomId} deleted as it became empty on disconnect.`);
          } else {
            io.to(roomId).emit('room_state', room);
          }
          break;
        }
      }
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Listening on 0.0.0.0:${PORT}`);
    console.log(`[Server] Socket.io path: /socket.io`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
