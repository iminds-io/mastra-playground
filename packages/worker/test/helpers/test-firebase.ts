// ABOUTME: Firebase test user lifecycle — create user, mint ID token, delete.
// ABOUTME: Uses firebase-admin for user mgmt and the identitytoolkit REST API for token exchange.

import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

let initialized = false;

function initFirebaseAdmin(): admin.app.App {
  if (initialized) return admin.app();
  const credentialPath = getEnvOrThrow('GOOGLE_APPLICATION_CREDENTIALS');
  const app = admin.initializeApp({
    credential: admin.credential.cert(credentialPath),
  });
  initialized = true;
  return app;
}

async function exchangeCustomTokenForIdToken(customToken: string): Promise<string> {
  const apiKey = getEnvOrThrow('FIREBASE_TOKEN');
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase signInWithCustomToken failed: ${response.status} ${text}`);
  }
  const body = await response.json() as { idToken?: string };
  if (!body.idToken) {
    throw new Error('Firebase signInWithCustomToken: no idToken in response');
  }
  return body.idToken;
}

export type TestFirebaseUser = {
  uid: string;
  idToken: string;
  delete(): Promise<void>;
};

export async function createTestUser(options?: {
  uid?: string;
  email?: string;
  displayName?: string;
}): Promise<TestFirebaseUser> {
  initFirebaseAdmin();
  const uid = options?.uid ?? `test-${randomUUID()}`;
  const email = options?.email ?? `${uid}@test.mastra-mindspace.local`;
  const displayName = options?.displayName ?? uid;

  await admin.auth().createUser({ uid, email, displayName });
  const customToken = await admin.auth().createCustomToken(uid);
  const idToken = await exchangeCustomTokenForIdToken(customToken);

  return {
    uid,
    idToken,
    async delete() {
      await admin.auth().deleteUser(uid);
    },
  };
}

export async function deleteTestUserById(uid: string): Promise<void> {
  initFirebaseAdmin();
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('no user record')) return;
    throw err;
  }
}
