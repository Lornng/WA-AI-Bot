import type { WaMessage } from './types.js';

/**
 * Normalize an Evolution API MESSAGES_UPSERT webhook payload into a WaMessage.
 * Returns null when the event should be ignored (fromMe, stale, no usable content).
 *
 * Payload shape (Evolution v2, Baileys adapter):
 * {
 *   event: "messages.upsert", instance: "default",
 *   data: {
 *     key: { remoteJid, fromMe, id, participant? },
 *     pushName, messageType, messageTimestamp (seconds), messageId,
 *     message: { conversation | extendedTextMessage | imageMessage | ... }
 *   }
 * }
 */
export interface NormalizeOpts {
  botJid?: string;
  /** Ignore messages older than this many ms. */
  staleAfterMs?: number;
  now?: number;
}

interface EvolutionPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
      participant?: string;
    };
    pushName?: string;
    messageType?: string;
    messageTimestamp?: number;
    messageId?: string;
    message?: Record<string, any>;
  };
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function extractText(message: Record<string, any> | undefined): string {
  if (!message) return '';
  return (
    firstString(
      message.conversation,
      message.extendedTextMessage?.text,
      message.imageMessage?.caption,
      message.videoMessage?.caption,
      message.documentMessage?.caption,
    ) ?? ''
  ).trim();
}

function extractMedia(message: Record<string, any> | undefined): WaMessage['media'] {
  if (!message) return undefined;
  if (message.imageMessage)
    return {
      type: 'image',
      mimetype: message.imageMessage.mimetype,
      caption: message.imageMessage.caption,
      url: message.imageMessage.url,
    };
  if (message.videoMessage)
    return {
      type: 'video',
      mimetype: message.videoMessage.mimetype,
      caption: message.videoMessage.caption,
      url: message.videoMessage.url,
    };
  if (message.documentMessage)
    return {
      type: 'document',
      mimetype: message.documentMessage.mimetype,
      filename: message.documentMessage.fileName,
      caption: message.documentMessage.caption,
      url: message.documentMessage.url,
    };
  if (message.audioMessage)
    return { type: 'audio', mimetype: message.audioMessage.mimetype, url: message.audioMessage.url };
  if (message.stickerMessage)
    return { type: 'sticker', mimetype: message.stickerMessage.mimetype };
  return undefined;
}

export function normalize(raw: unknown, opts: NormalizeOpts = {}): WaMessage | null {
  const payload = raw as EvolutionPayload;
  if (payload?.event !== 'messages.upsert' || !payload.data) return null;
  const data = payload.data;
  const key = data.key;
  const message = data.message;
  const chatId = key?.remoteJid;
  const id = data.messageId ?? key?.id;
  if (!chatId || !id) return null;

  const now = opts.now ?? Date.now();
  const tsMs = (data.messageTimestamp ?? Math.floor(now / 1000)) * 1000;
  if (opts.staleAfterMs !== undefined && now - tsMs > opts.staleAfterMs) return null;

  const fromMe = Boolean(key?.fromMe);
  const contextInfo = message?.extendedTextMessage?.contextInfo;
  const botJid = opts.botJid;

  const mentions = (contextInfo?.mentionedJid ?? []) as string[];
  const mentionsBot = botJid ? mentions.includes(botJid) : false;
  const replyToBot =
    botJid !== undefined ? contextInfo?.participant === botJid : false;

  // For groups Baileys puts the sender in key.participant; for DMs it is the
  // other party's JID (or the bot's own JID when fromMe).
  const senderId = key?.participant ?? (fromMe ? botJid ?? chatId : chatId);

  const text = extractText(message);
  const media = extractMedia(message);
  if (!text && !media) return null;

  return {
    id,
    chatId,
    isGroup: chatId.endsWith('@g.us'),
    senderId,
    senderName: data.pushName,
    text,
    messageType: data.messageType ?? 'unknown',
    mentionsBot,
    replyToBot,
    fromMe,
    timestamp: tsMs,
    media,
  };
}
