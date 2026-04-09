export type VerifiedFirebasePrincipal = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  authTime: number | null;
  rawClaims: Record<string, unknown>;
};

export function validateFirebaseClaims(
  claims: Record<string, unknown>,
  projectId: string,
): VerifiedFirebasePrincipal {
  if (claims.aud !== projectId) {
    throw new Error('Invalid Firebase audience');
  }

  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Invalid Firebase issuer');
  }

  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new Error('Invalid Firebase subject');
  }

  return {
    uid: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === 'string' ? claims.name : null,
    picture: typeof claims.picture === 'string' ? claims.picture : null,
    authTime: typeof claims.auth_time === 'number' ? claims.auth_time : null,
    rawClaims: claims,
  };
}
