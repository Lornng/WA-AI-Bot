import { describe, it, expect } from 'vitest';
import { normalize } from '../src/whatsapp/normalize.js';

const BOT_JID = '61400000000@s.whatsapp.net';

function upsert(data: Record<string, any>) {
  return { event: 'messages.upsert', instance: 'default', data };
}

describe('normalize', () => {
  it('normalizes a plain DM conversation message', () => {
    const msg = normalize(
      upsert({
        key: { remoteJid: '61412345678@c.us', fromMe: false, id: 'MSG1' },
        pushName: 'Jensen',
        messageType: 'conversation',
        messageTimestamp: 1_750_000_000,
        messageId: 'MSG1',
        message: { conversation: 'hello bot' },
      }),
      { botJid: BOT_JID },
    );
    expect(msg).not.toBeNull();
    expect(msg!.chatId).toBe('61412345678@c.us');
    expect(msg!.isGroup).toBe(false);
    expect(msg!.senderId).toBe('61412345678@c.us');
    expect(msg!.text).toBe('hello bot');
    expect(msg!.fromMe).toBe(false);
    expect(msg!.mentionsBot).toBe(false);
    expect(msg!.timestamp).toBe(1_750_000_000_000);
  });

  it('detects groups, sender participant, and @mention of the bot', () => {
    const msg = normalize(
      upsert({
        key: { remoteJid: '120363999999999@g.us', fromMe: false, id: 'MSG2', participant: '61412345678@s.whatsapp.net' },
        pushName: 'Jensen',
        messageType: 'extendedTextMessage',
        messageTimestamp: 1_750_000_000,
        messageId: 'MSG2',
        message: {
          extendedTextMessage: {
            text: '@Wally what is up?',
            contextInfo: {
              mentionedJid: ['61400000000@s.whatsapp.net'],
              participant: '61412345678@s.whatsapp.net',
            },
          },
        },
      }),
      { botJid: BOT_JID },
    );
    expect(msg!.isGroup).toBe(true);
    expect(msg!.senderId).toBe('61412345678@s.whatsapp.net');
    expect(msg!.mentionsBot).toBe(true);
    expect(msg!.text).toBe('@Wally what is up?');
  });

  it('detects reply-to-bot via quoted message participant', () => {
    const msg = normalize(
      upsert({
        key: { remoteJid: '61412345678@c.us', fromMe: false, id: 'MSG3' },
        pushName: 'Jensen',
        messageType: 'extendedTextMessage',
        messageTimestamp: 1_750_000_000,
        messageId: 'MSG3',
        message: {
          extendedTextMessage: {
            text: 'and the follow-up?',
            contextInfo: {
              participant: BOT_JID,
              quotedMessage: { conversation: 'earlier bot reply' },
            },
          },
        },
      }),
      { botJid: BOT_JID },
    );
    expect(msg!.replyToBot).toBe(true);
    expect(msg!.mentionsBot).toBe(false);
  });

  it('ignores the bot\'s own messages (fromMe)', () => {
    const msg = normalize(
      upsert({
        key: { remoteJid: '61412345678@c.us', fromMe: true, id: 'MSG4' },
        messageType: 'conversation',
        messageTimestamp: 1_750_000_000,
        messageId: 'MSG4',
        message: { conversation: 'my own reply' },
      }),
      { botJid: BOT_JID },
    );
    expect(msg).not.toBeNull(); // normalized, but flagged for the router
    expect(msg!.fromMe).toBe(true);
  });

  it('drops stale messages (reconnect replays)', () => {
    const msg = normalize(
      upsert({
        key: { remoteJid: '61412345678@c.us', fromMe: false, id: 'MSG5' },
        messageType: 'conversation',
        messageTimestamp: 1_750_000_000,
        messageId: 'MSG5',
        message: { conversation: 'old message' },
      }),
      { botJid: BOT_JID, now: 1_750_000_000_000 + 10 * 60_000, staleAfterMs: 2 * 60_000 },
    );
    expect(msg).toBeNull();
  });

  it('keeps fresh messages within the stale window', () => {
    const msg = normalize(
      upsert({
        key: { remoteJid: '61412345678@c.us', fromMe: false, id: 'MSG6' },
        messageType: 'conversation',
        messageTimestamp: 1_750_000_000,
        messageId: 'MSG6',
        message: { conversation: 'fresh' },
      }),
      { botJid: BOT_JID, now: 1_750_000_000_000 + 60_000, staleAfterMs: 2 * 60_000 },
    );
    expect(msg).not.toBeNull();
  });

  it('extracts image caption as text and media metadata', () => {
    const msg = normalize(
      upsert({
        key: { remoteJid: '61412345678@c.us', fromMe: false, id: 'MSG7' },
        messageType: 'imageMessage',
        messageTimestamp: 1_750_000_000,
        messageId: 'MSG7',
        message: {
          imageMessage: {
            caption: 'what is this?',
            mimetype: 'image/jpeg',
            url: 'https://example.com/img.jpg',
          },
        },
      }),
      { botJid: BOT_JID },
    );
    expect(msg!.text).toBe('what is this?');
    expect(msg!.media).toMatchObject({ type: 'image', mimetype: 'image/jpeg' });
  });

  it('ignores non-message events', () => {
    expect(normalize({ event: 'messages.update', data: {} }, { botJid: BOT_JID })).toBeNull();
    expect(normalize(null, { botJid: BOT_JID })).toBeNull();
  });
});
