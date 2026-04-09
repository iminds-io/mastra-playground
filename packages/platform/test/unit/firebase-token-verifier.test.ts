import { generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { createFirebaseTokenVerifier, type FirebaseSigningKeyStore } from '../../src/auth/firebase-token-verifier';
import { validateFirebaseClaims } from '../../src/auth/claims';

describe('validateFirebaseClaims', () => {
  it('accepts the expected issuer and audience', () => {
    const claims = validateFirebaseClaims(
      {
        aud: 'demo-project',
        iss: 'https://securetoken.google.com/demo-project',
        sub: 'uid-123',
        exp: Math.floor(Date.now() / 1000) + 60,
        iat: Math.floor(Date.now() / 1000) - 60,
        auth_time: Math.floor(Date.now() / 1000) - 120,
        email: 'user@example.com',
        email_verified: true,
        name: 'Demo User',
        picture: 'https://example.com/user.png',
      },
      'demo-project',
    );

    expect(claims.uid).toBe('uid-123');
    expect(claims.email).toBe('user@example.com');
    expect(claims.emailVerified).toBe(true);
  });
});

describe('createFirebaseTokenVerifier', () => {
  it('verifies a signed Firebase token with the expected claims', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');

    const keyStore: FirebaseSigningKeyStore = {
      async getKey(kid: string) {
        expect(kid).toBe('demo-key');
        return publicKey;
      },
    };

    const token = await new SignJWT({
      aud: 'demo-project',
      iss: 'https://securetoken.google.com/demo-project',
      sub: 'uid-123',
      auth_time: Math.floor(Date.now() / 1000) - 120,
      email: 'user@example.com',
      email_verified: true,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'demo-key' })
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(privateKey);

    const verifier = createFirebaseTokenVerifier({
      projectId: 'demo-project',
      keyStore,
    });

    const principal = await verifier.verifyIdToken(token);

    expect(principal.uid).toBe('uid-123');
    expect(principal.email).toBe('user@example.com');
    expect(principal.emailVerified).toBe(true);
  });
});
