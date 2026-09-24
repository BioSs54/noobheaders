import net from 'node:net';

/**
 * Minimal Firefox Remote Debugging Protocol client, used to install the extension
 * as a temporary add-on (Playwright cannot load Firefox extensions by itself).
 * Packets are framed as `<byte length>:<json>`.
 */
class RdpClient {
  private buffer = Buffer.alloc(0);
  private waiters: Array<{
    match: (packet: any) => boolean;
    resolve: (packet: any) => void;
    reject: (error: Error) => void;
  }> = [];
  private received: any[] = [];

  constructor(private readonly socket: net.Socket) {
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (error) => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const separator = this.buffer.indexOf(':');
      if (separator === -1) return;
      const length = Number.parseInt(this.buffer.subarray(0, separator).toString(), 10);
      if (Number.isNaN(length)) throw new Error('Invalid RDP packet header');
      if (this.buffer.length < separator + 1 + length) return;
      const body = this.buffer.subarray(separator + 1, separator + 1 + length).toString('utf8');
      this.buffer = this.buffer.subarray(separator + 1 + length);
      this.dispatch(JSON.parse(body));
    }
  }

  private dispatch(packet: any): void {
    if (process.env.E2E_DEBUG === '1') {
      console.log('[rdp] <-', JSON.stringify(packet).slice(0, 300));
    }
    const index = this.waiters.findIndex((waiter) => waiter.match(packet));
    if (index === -1) {
      this.received.push(packet);
      return;
    }
    const [waiter] = this.waiters.splice(index, 1);
    waiter.resolve(packet);
  }

  waitFor(match: (packet: any) => boolean, timeoutMs = 15000): Promise<any> {
    const queued = this.received.findIndex(match);
    if (queued !== -1) {
      return Promise.resolve(this.received.splice(queued, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for RDP packet')),
        timeoutMs
      );
      this.waiters.push({
        match,
        resolve: (packet) => {
          clearTimeout(timer);
          resolve(packet);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  async request(to: string, type: string, extra: Record<string, unknown> = {}): Promise<any> {
    const body = Buffer.from(JSON.stringify({ to, type, ...extra }), 'utf8');
    this.socket.write(`${body.length}:`);
    this.socket.write(body);
    const reply = await this.waitFor((packet) => packet.from === to);
    if (reply.error) {
      throw new Error(`RDP ${type} failed: ${reply.error} ${reply.message ?? ''}`);
    }
    return reply;
  }

  close(): void {
    this.socket.end();
  }
}

/**
 * Evaluates code in the background page of a temporary add-on through the debugger
 * server (the page is not reachable with Playwright in Firefox).
 */
export class FirefoxAddonBackground {
  private counter = 0;

  private constructor(
    private readonly client: RdpClient,
    private readonly consoleActor: string
  ) {}

  static async connect(port: number, addonId: string): Promise<FirefoxAddonBackground> {
    const client = new RdpClient(await connect(port));
    await client.waitFor((packet) => packet.from === 'root');

    const deadline = Date.now() + 15000;
    let lastReply: unknown = null;
    while (Date.now() < deadline) {
      const { addons = [] } = await client.request('root', 'listAddons');
      const descriptor = addons.find((addon: any) => addon.id === addonId);
      if (descriptor) {
        const reply = await client.request(descriptor.actor, 'getTarget');
        lastReply = reply;
        const form = reply.form ?? reply;
        if (form.consoleActor) {
          return new FirefoxAddonBackground(client, form.consoleActor);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    client.close();
    throw new Error(`Could not reach the add-on background page: ${JSON.stringify(lastReply)}`);
  }

  private async rawEvaluate(text: string): Promise<unknown> {
    const reply = await this.client.request(this.consoleActor, 'evaluateJSAsync', { text });
    const result = await this.client.waitFor(
      (packet) => packet.type === 'evaluationResult' && packet.resultID === reply.resultID
    );
    if (result.exceptionMessage) {
      throw new Error(`Background evaluation failed: ${JSON.stringify(result.exceptionMessage)}`);
    }
    const value = result.result;
    if (value && typeof value === 'object') {
      if (value.type === 'undefined' || value.type === 'null') return null;
      if (value.type === 'longString') {
        const full = await this.client.request(value.actor, 'substring', {
          start: 0,
          end: value.length,
        });
        return full.substring;
      }
    }
    return value;
  }

  /** Run `fn(arg)` in the background page and return its (JSON-serializable) result */
  async evaluate<T>(fnSource: string, arg: unknown): Promise<T> {
    const key = `__noobheadersE2E${this.counter++}`;
    await this.rawEvaluate(
      `(async () => (${fnSource})(${JSON.stringify(arg ?? null)}))().then(
        (v) => { globalThis.${key} = JSON.stringify({ ok: true, v: v === undefined ? null : v }); },
        (e) => { globalThis.${key} = JSON.stringify({ ok: false, e: String((e && e.stack) || e) }); }
      ); undefined`
    );
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const raw = await this.rawEvaluate(`globalThis.${key} ?? ''`);
      if (typeof raw === 'string' && raw !== '') {
        const parsed = JSON.parse(raw);
        if (!parsed.ok) throw new Error(`Background evaluation failed: ${parsed.e}`);
        return parsed.v as T;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for the background evaluation');
  }

  close(): void {
    this.client.close();
  }
}

async function connect(port: number, timeoutMs = 20000): Promise<net.Socket> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await new Promise<net.Socket>((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => resolve(socket));
        socket.once('error', reject);
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Could not connect to the Firefox debugger server: ${String(lastError)}`);
}

export async function installTemporaryAddon(port: number, addonPath: string): Promise<string> {
  const socket = await connect(port);
  const client = new RdpClient(socket);
  try {
    // The server greets every new connection
    await client.waitFor((packet) => packet.from === 'root');
    const root = await client.request('root', 'getRoot');
    if (!root.addonsActor) {
      throw new Error('The Firefox debugger server does not expose an addons actor');
    }
    const result = await client.request(root.addonsActor, 'installTemporaryAddon', {
      addonPath,
      openDevTools: false,
    });
    return result.addon?.id as string;
  } finally {
    client.close();
  }
}

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}
