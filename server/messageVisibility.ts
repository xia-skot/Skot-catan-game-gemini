export function canReadMessage(message: Record<string, any>, account: {
  id: string | null; name: string | null; admin: boolean; guest: boolean;
}): boolean {
  if (message.type !== 'private' && !message.targetUserId) return true;
  if (account.admin) return true;
  if (account.id && (String(message.targetUserId || '') === account.id || String(message.senderId || '') === account.id)) return true;
  // Guest names are editable and nonunique. Account-bound messages never fall back to names.
  if (account.guest || !account.name || !account.id) return false;
  const hasTargetId = /^[a-f0-9]{24}$/i.test(String(message.targetUserId || ''));
  const hasSenderId = /^[a-f0-9]{24}$/i.test(String(message.senderId || ''));
  return (!hasTargetId && (message.targetUserId === account.name || message.targetUserName === account.name)) ||
    (!hasSenderId && message.senderName === account.name);
}
