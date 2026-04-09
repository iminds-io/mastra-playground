import { decodeProtectedHeader, jwtVerify } from 'jose';

import { validateFirebaseClaims, type VerifiedFirebasePrincipal } from './claims';
import { type FirebaseSigningKeyStore, GoogleSecureTokenKeyStore } from './jwks-cache';

export { type FirebaseSigningKeyStore } from './jwks-cache';
export { type VerifiedFirebasePrincipal } from './claims';

export interface FirebaseTokenVerifier {
  verifyIdToken(idToken: string): Promise<VerifiedFirebasePrincipal>;
}

export function createFirebaseTokenVerifier(params: {
  projectId: string;
  keyStore?: FirebaseSigningKeyStore;
}): FirebaseTokenVerifier {
  const keyStore = params.keyStore ?? new GoogleSecureTokenKeyStore();

  return {
    async verifyIdToken(idToken: string): Promise<VerifiedFirebasePrincipal> {
      const protectedHeader = decodeProtectedHeader(idToken);

      if (typeof protectedHeader.kid !== 'string') {
        throw new Error('Firebase token is missing a key id');
      }

      const key = await keyStore.getKey(protectedHeader.kid);
      const { payload } = await jwtVerify(idToken, key, {
        algorithms: ['RS256'],
        audience: params.projectId,
        issuer: `https://securetoken.google.com/${params.projectId}`,
      });

      return validateFirebaseClaims(payload as Record<string, unknown>, params.projectId);
    },
  };
}
