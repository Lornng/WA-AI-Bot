import type { Config } from '../config.js';

/** Thin async client for the Evolution API v2 REST interface. */
export class EvolutionClient {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;

  constructor(cfg: Pick<Config, 'EVOLUTION_URL' | 'EVOLUTION_API_KEY' | 'EVOLUTION_INSTANCE'>) {
    this.baseUrl = cfg.EVOLUTION_URL.replace(/\/$/, '');
    this.apiKey = cfg.EVOLUTION_API_KEY;
    this.instance = cfg.EVOLUTION_INSTANCE;
  }

  private async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { apikey: this.apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Evolution API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Send a text message. `number` is the chat JID (61...@c.us or 12036...@g.us). */
  sendText(
    chatId: string,
    text: string,
    opts: { quotedId?: string; mentions?: string[] } = {},
  ): Promise<any> {
    return this.req(
      'POST',
      `/message/sendText/${this.instance}`,
      {
        number: chatId,
        text,
        options: {
          quoted: opts.quotedId,
          mentions: opts.mentions,
          delay: 1200,
        },
      },
    );
  }

  /**
   * Send a media file from a URL (Evolution downloads it).
   * mediatype: image | video | document | audio | sticker
   */
  sendMedia(
    chatId: string,
    media: { url: string; mediatype: 'image' | 'video' | 'document' | 'audio' | 'sticker'; mimetype?: string; filename?: string; caption?: string },
  ): Promise<any> {
    return this.req('POST', `/message/sendMedia/${this.instance}`, {
      number: chatId,
      mediatype: media.mediatype,
      media: media.url,
      mimetype: media.mimetype,
      filename: media.filename,
      caption: media.caption,
    });
  }

  /** Show typing / paused presence in the chat. */
  setPresence(chatId: string, presence: 'composing' | 'paused' | 'available'): Promise<any> {
    return this.req('POST', `/chat/sendPresence/${this.instance}`, { chatId, presence });
  }

  /** React to a message. */
  sendReaction(chatId: string, messageId: string, reaction: string): Promise<any> {
    return this.req('POST', `/chat/sendReaction/${this.instance}`, {
      chatId,
      messageId,
      reaction,
    });
  }

  /** Group metadata: id, name, description, participants (with admin flags). */
  getGroupMetadata(chatId: string): Promise<any> {
    return this.req('GET', `/chat/fetchGroupMetadata/${this.instance}/${encodeURIComponent(chatId)}`);
  }

  /** Connection state: { instance: "<bot>@s.whatsapp.net", state: "open" | "connecting" | "close" }. */
  connectionState(): Promise<{ instance?: string; state?: string }> {
    return this.req('GET', `/instance/connectionState/${this.instance}`);
  }

  /** Ensure the instance exists; create it (Baileys mode) if missing. */
  async ensureInstance(instanceToken: string): Promise<void> {
    try {
      await this.connectionState();
    } catch (err: any) {
      if (!/404/.test(String(err?.message))) throw err;
      await this.req('POST', '/instance/create', {
        instanceName: this.instance,
        token: instanceToken || undefined,
      });
    }
  }
}
