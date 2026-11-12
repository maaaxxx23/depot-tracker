// Schlanker Client für die comdirect REST API (nur lesende Endpunkte).
// Grundlage: offizielle „comdirect REST API – Schnittstellenspezifikation“.

const HOST = 'https://api.comdirect.de';
const API = `${HOST}/api`;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Token {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Session {
  identifier: string;
  sessionTanActive: boolean;
  activated2FA: boolean;
}

export interface Challenge {
  id: string;
  /** P_TAN_PUSH (Freigabe in der photoTAN-App), P_TAN (photoTAN-Grafik) oder M_TAN (SMS) */
  typ: string;
  /** P_TAN: PNG als Base64, M_TAN: Telefonnummer, P_TAN_PUSH: leer */
  challenge?: string;
  availableTypes: string[];
  link?: { href: string; rel?: string; method?: string };
}

export class ComdirectError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ComdirectError';
  }
}

/** Session-Id für den Header x-http-request-info: bis zu 32 Hex-Zeichen, eine pro App-Start. */
export function createSessionId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

// ---------------------------------------------------------------------------
// Sperre „nur lesen“: Jeder Aufruf an comdirect wird vor dem Absenden gegen diese Liste geprüft.
// Was nicht drinsteht, verlässt das iPhone nicht, z. B. Order-, Überweisungs- oder Konto-Endpunkte.
// Schreibend sind nur die Schritte der Anmeldung (Token, TAN-Freigabe der Session) und das Abmelden.
// ---------------------------------------------------------------------------

/** Eine Kennung im Pfad (Session, Depot, Challenge): nur Buchstaben, Ziffern, - und _. */
const ID = '[A-Za-z0-9_-]+';

export const ALLOWED_REQUESTS: readonly { method: string; path: RegExp; purpose: string }[] = [
  { method: 'POST', path: /^\/oauth\/token$/, purpose: 'Anmeldung: Token holen' },
  { method: 'DELETE', path: /^\/oauth\/revoke$/, purpose: 'Abmelden: Token ungültig machen' },
  { method: 'GET', path: /^\/api\/session\/clients\/user\/v1\/sessions$/, purpose: 'Anmeldung: Session lesen' },
  { method: 'POST', path: new RegExp(`^/api/session/clients/user/v1/sessions/${ID}/validate$`), purpose: 'Anmeldung: TAN anfordern' },
  { method: 'PATCH', path: new RegExp(`^/api/session/clients/user/v1/sessions/${ID}$`), purpose: 'Anmeldung: TAN-Freigabe' },
  // Den Link zur Push-Abfrage liefert comdirect selbst (Pfad nicht dokumentiert): lesend im Session-Bereich
  { method: 'GET', path: /^\/api\/session\/[A-Za-z0-9_\/-]+$/, purpose: 'Anmeldung: Status der Push-Freigabe' },
  { method: 'GET', path: /^\/api\/brokerage\/clients\/user\/v3\/depots$/, purpose: 'Depots lesen' },
  { method: 'GET', path: new RegExp(`^/api/brokerage/v3/depots/${ID}/positions$`), purpose: 'Positionen lesen' },
  { method: 'GET', path: new RegExp(`^/api/brokerage/v3/depots/${ID}/transactions$`), purpose: 'Depotumsätze lesen' },
];

/** Bei der Token-Anfrage nur diese Arten: Anmeldung mit PIN und das Token nach der TAN-Freigabe. */
const ALLOWED_GRANTS = ['password', 'cd_secondary'];

/** Wert aus einem Formular-Body (a=1&b=2); ohne URLSearchParams, das React Native nicht überall vollständig kennt. */
function formValue(body: string, key: string): string | null {
  for (const pair of body.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (decodeURIComponent(k) === key) return decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return null;
}

/** Wirft, wenn der Aufruf nicht auf der Liste steht. Wird vor jedem Netzwerkzugriff aufgerufen. */
export function assertAllowed(url: string, init: RequestInit): void {
  const method = (init.method ?? 'GET').toUpperCase();
  const match = /^https:\/\/api\.comdirect\.de(\/[^?#]*)(\?[^#]*)?$/.exec(url);
  const path = match?.[1];
  const allowed = !!path && !path.includes('..') && !path.includes('//') && ALLOWED_REQUESTS.some((r) => r.method === method && r.path.test(path));
  if (!allowed) {
    throw new ComdirectError(`Gesperrt: Die App darf bei comdirect nur lesen. Der Aufruf ${method} ${path ?? url} wurde nicht gesendet.`);
  }
  if (path === '/oauth/token') {
    const grant = formValue(typeof init.body === 'string' ? init.body : '', 'grant_type');
    if (!grant || !ALLOWED_GRANTS.includes(grant)) {
      throw new ComdirectError(`Gesperrt: Token-Art „${grant ?? 'unbekannt'}“ ist nicht erlaubt. Der Aufruf wurde nicht gesendet.`);
    }
  }
  // Nur lesende Abrufe dürfen Daten im Pfad abfragen; Abfrageparameter sind bei schreibenden Aufrufen unnötig
  if (method !== 'GET' && match?.[2]) {
    throw new ComdirectError(`Gesperrt: ${method} mit Parametern ist nicht erlaubt. Der Aufruf wurde nicht gesendet.`);
  }
}

export class ComdirectApi {
  private lastRequestId = '';

  constructor(
    private readonly fetchImpl: Fetch = (url, init) => fetch(url, init),
    private readonly sessionId = createSessionId(),
  ) {}

  /** 9-stellige Request-Id im Format HHmmssSSS, innerhalb der Session eindeutig. */
  private nextRequestId(now = new Date()): string {
    let id = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
    if (id <= this.lastRequestId) id = String(Number(this.lastRequestId) + 1).padStart(9, '0').slice(-9);
    this.lastRequestId = id;
    return id;
  }

  private headers(accessToken: string, extra: Record<string, string> = {}): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'x-http-request-info': JSON.stringify({ clientRequestId: { sessionId: this.sessionId, requestId: this.nextRequestId() } }),
      ...extra,
    };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    // Sperre vor jedem Netzwerkzugriff: nicht erlaubte Aufrufe verlassen das iPhone nie
    assertAllowed(url, init);
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch {
      throw new ComdirectError('comdirect ist gerade nicht erreichbar. Bitte prüfe deine Internetverbindung.');
    }
    if (!response.ok) throw new ComdirectError(await errorMessage(response), response.status);
    return response;
  }

  /** OAuth-Token-Endpunkt (password, cd_secondary, refresh_token). */
  async token(form: Record<string, string>): Promise<Token> {
    const response = await this.send(`${HOST}/oauth/token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&'),
    });
    const json = await response.json();
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: Number(json.expires_in) };
  }

  async getSession(accessToken: string): Promise<Session> {
    const response = await this.send(`${API}/session/clients/user/v1/sessions`, { method: 'GET', headers: this.headers(accessToken) });
    const sessions = await response.json();
    const session = Array.isArray(sessions) ? sessions[0] : sessions;
    if (!session?.identifier) throw new ComdirectError('comdirect hat keine Session geliefert.');
    return session;
  }

  /** Fordert eine TAN-Challenge an. Achtung: fünf Challenges ohne korrekte TAN sperren den Zugang. */
  async validateSession(accessToken: string, session: Session): Promise<Challenge> {
    const response = await this.send(`${API}/session/clients/user/v1/sessions/${session.identifier}/validate`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({ identifier: session.identifier, sessionTanActive: true, activated2FA: true }),
    });
    const raw = response.headers.get('x-once-authentication-info');
    if (!raw) throw new ComdirectError('comdirect hat keine TAN-Anfrage geliefert.');
    const info = JSON.parse(raw);
    return { id: String(info.id), typ: info.typ, challenge: info.challenge, availableTypes: info.availableTypes ?? [], link: info.link };
  }

  /** Status einer Push-Freigabe, z. B. „AUTHENTICATED“ (nicht offiziell dokumentiert, wie in go-comdirect). */
  async challengeStatus(accessToken: string, href: string): Promise<string | undefined> {
    const response = await this.send(resolveLink(href), { method: 'GET', headers: this.headers(accessToken) });
    const json = await response.json();
    return json?.status;
  }

  /** Aktiviert die Session-TAN. Bei photoTAN-Push entfällt die TAN, sonst wird sie im Header übergeben. */
  async activateSession(accessToken: string, session: Session, challengeId: string, tan?: string): Promise<void> {
    const extra: Record<string, string> = { 'x-once-authentication-info': JSON.stringify({ id: challengeId }) };
    if (tan) extra['x-once-authentication'] = tan;
    await this.send(`${API}/session/clients/user/v1/sessions/${session.identifier}`, {
      method: 'PATCH',
      headers: this.headers(accessToken, extra),
      body: JSON.stringify({ identifier: session.identifier, sessionTanActive: true, activated2FA: true }),
    });
  }

  async get<T>(accessToken: string, path: string, query: Record<string, string | number> = {}): Promise<T> {
    const qs = Object.entries(query)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const response = await this.send(`${API}${path}${qs ? `?${qs}` : ''}`, { method: 'GET', headers: this.headers(accessToken) });
    return response.json();
  }

  /** Macht Access-, Refresh-Token und Session-TAN ungültig. */
  async revoke(accessToken: string): Promise<void> {
    await this.send(`${HOST}/oauth/revoke`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${accessToken}` },
    });
  }
}

function resolveLink(href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  if (href.startsWith('/api/')) return `${HOST}${href}`;
  return `${API}${href.startsWith('/') ? '' : '/'}${href}`;
}

/** Liest die deutsche Fehlermeldung aus x-http-response-info oder dem Body. */
async function errorMessage(response: Response): Promise<string> {
  const pick = (json: any): string | undefined => {
    const messages: any[] = json?.messages ?? [];
    const message = messages.find((m) => m?.severity === 'ERROR')?.message ?? messages[0]?.message;
    return message ?? json?.error_description ?? json?.message;
  };
  try {
    const header = response.headers.get('x-http-response-info');
    const fromHeader = header ? pick(JSON.parse(header)) : undefined;
    if (fromHeader) return fromHeader;
  } catch {}
  try {
    const fromBody = pick(await response.json());
    if (fromBody) return fromBody;
  } catch {}
  if (response.status === 401) return 'Anmeldung abgelehnt. Bitte prüfe Zugangsnummer, PIN, Client ID und Client Secret.';
  return `comdirect hat mit Fehler ${response.status} geantwortet.`;
}
