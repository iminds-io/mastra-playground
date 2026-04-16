export type RawEnv = Record<string, string | undefined>;

export type ParsedEnv = {
  databaseUrl: string;
  workspaceRoot: string;
  firebaseProjectId: string;
  firebaseApiKey: string;
  port: number;
};

export function parseEnv(env: RawEnv): ParsedEnv {
  const required = ['DATABASE_URL', 'FIREBASE_PROJECT_ID', 'FIREBASE_TOKEN'] as const;

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    databaseUrl: env.DATABASE_URL!,
    workspaceRoot: env.WORKSPACE_ROOT ?? '',
    firebaseProjectId: env.FIREBASE_PROJECT_ID!,
    firebaseApiKey: env.FIREBASE_TOKEN!,
    port: Number(env.PORT ?? 3000),
  };
}
