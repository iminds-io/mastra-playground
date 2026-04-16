import { importX509, type JWTVerifyGetKey } from 'jose';

const GOOGLE_SECURE_TOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

type CachedCertificates = {
  expiresAt: number;
  certificates: Record<string, string>;
};

export interface FirebaseSigningKeyStore {
  getKey(kid: string): Promise<CryptoKey>;
}

export class GoogleSecureTokenKeyStore implements FirebaseSigningKeyStore {
  private cached: CachedCertificates | null = null;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getKey(kid: string): Promise<CryptoKey> {
    const certificates = await this.getCertificates();
    const certificate = certificates[kid];

    if (!certificate) {
      throw new Error(`Unknown Firebase signing key: ${kid}`);
    }

    return importX509(certificate, 'RS256');
  }

  asJoseKeyResolver(): JWTVerifyGetKey {
    return async (protectedHeader) => {
      if (typeof protectedHeader.kid !== 'string') {
        throw new Error('Firebase token is missing a key id');
      }

      return this.getKey(protectedHeader.kid);
    };
  }

  private async getCertificates(): Promise<Record<string, string>> {
    if (this.cached && this.cached.expiresAt > this.now()) {
      return this.cached.certificates;
    }

    // Call via (0, ...) to detach `this` — CF Workers' fetch requires
    // an undefined or globalThis `this` reference.
    const doFetch = this.fetchImpl;
    const response = await doFetch(GOOGLE_SECURE_TOKEN_CERTS_URL);

    if (!response.ok) {
      throw new Error(`Failed to load Firebase signing certificates: ${response.status}`);
    }

    const cacheControl = response.headers.get('cache-control');
    const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
    const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 300;
    const certificates = (await response.json()) as Record<string, string>;

    this.cached = {
      expiresAt: this.now() + maxAgeSeconds * 1000,
      certificates,
    };

    return certificates;
  }
}
