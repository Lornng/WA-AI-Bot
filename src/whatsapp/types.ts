/** Normalized message produced by normalize.ts from an Evolution MESSAGES_UPSERT payload. */
export interface WaMessage {
  /** WhatsApp message ID (dedupe key). */
  id: string;
  /** Remote JID: `61...@c.us` for DMs, `12036...@g.us` for groups. */
  chatId: string;
  isGroup: boolean;
  /** Sender JID. In groups this is the member's JID; in DMs the other party's JID. */
  senderId: string;
  /** Display name of the sender when known (pushName / contact name). */
  senderName?: string;
  /** Plain text body (conversation, extendedText, or media caption). */
  text: string;
  /** Message type, e.g. "conversation", "extendedTextMessage", "imageMessage". */
  messageType: string;
  /** True if the bot is @mentioned in the message. */
  mentionsBot: boolean;
  /** True if the message quotes a message sent by the bot. */
  replyToBot: boolean;
  /** True if the message was sent by the bot itself (fromMe). Always skipped. */
  fromMe: boolean;
  /** Message timestamp in milliseconds. */
  timestamp: number;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
    mimetype?: string;
    filename?: string;
    caption?: string;
    /** Media URL as provided by Evolution (for downloading). */
    url?: string;
  };
}

export type Permission = 'any' | 'groupAdmin' | 'owner';
