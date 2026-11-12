import { Challenge, ComdirectApi, ComdirectError, Session, Token } from './api';

export interface Credentials {
  clientId: string;
  clientSecret: string;
  /** Achtstellige Zugangsnummer */
  username: string;
  /** Sechsstellige PIN */
  pin: string;
}

export const PUSH_POLL_MS = 3000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Anmeldung mit Session-TAN in fünf Schritten (Kapitel 2 der comdirect-Doku).
 * Pro Anmeldung wird höchstens eine TAN-Challenge angefordert, denn fünf
 * Challenges ohne korrekte TAN sperren den Onlinebanking-Zugang.
 */
export class ComdirectLogin {
  private primary?: Token;
  private session?: Session;
  private challenge?: Challenge;

  constructor(
    private readonly api: ComdirectApi,
    private readonly credentials: Credentials,
  ) {}

  /** Schritte 1–3: Token holen, Session abrufen, TAN-Challenge anfordern. */
  async start(): Promise<Challenge> {
    if (this.challenge) throw new ComdirectError('Für diese Anmeldung wurde bereits eine TAN angefordert.');
    const { clientId, clientSecret, username, pin } = this.credentials;
    this.primary = await this.api.token({ client_id: clientId, client_secret: clientSecret, grant_type: 'password', username, password: pin });
    this.session = await this.api.getSession(this.primary.accessToken);
    this.challenge = await this.api.validateSession(this.primary.accessToken, this.session);
    return this.challenge;
  }

  /**
   * Wartet, bis die Push-Freigabe in der photoTAN-App erfolgt ist. Gibt false zurück,
   * wenn comdirect keinen Status-Link liefert oder abgebrochen wurde; dann bestätigt der Nutzer selbst.
   */
  async waitForPush(signal: AbortSignal, intervalMs = PUSH_POLL_MS): Promise<boolean> {
    const href = this.challenge?.link?.href;
    if (!href || !this.primary) return false;
    while (!signal.aborted) {
      try {
        if ((await this.api.challengeStatus(this.primary.accessToken, href)) === 'AUTHENTICATED') return true;
      } catch {
        // Status-Abfrage ist nur eine Komfortfunktion; Fehler beenden die Anmeldung nicht
      }
      await sleep(intervalMs, signal);
    }
    return false;
  }

  /** Schritte 4–5: Session-TAN aktivieren und den Banking/Brokerage-Token holen. */
  async complete(tan?: string): Promise<Token> {
    if (!this.primary || !this.session || !this.challenge) throw new ComdirectError('Die Anmeldung wurde noch nicht gestartet.');
    const needsTan = this.challenge.typ !== 'P_TAN_PUSH';
    if (needsTan && !tan) throw new ComdirectError('Bitte gib die TAN ein.');
    await this.api.activateSession(this.primary.accessToken, this.session, this.challenge.id, needsTan ? tan : undefined);
    const { clientId, clientSecret } = this.credentials;
    return this.api.token({ client_id: clientId, client_secret: clientSecret, grant_type: 'cd_secondary', token: this.primary.accessToken });
  }

  /** Ersten Token ungültig machen, falls die Anmeldung abgebrochen wird. */
  async cancel(): Promise<void> {
    if (this.primary) await this.api.revoke(this.primary.accessToken).catch(() => {});
  }
}
