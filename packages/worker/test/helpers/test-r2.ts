// ABOUTME: R2 prefix cleanup helper for tests.
// ABOUTME: Lists objects under a prefix and deletes them in batches via the S3 SDK.

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function createR2Client(): { client: S3Client; bucket: string } {
  const accountId = getEnvOrThrow('R2_ACCOUNT_ID');
  const accessKeyId = getEnvOrThrow('R2_ACCESS_KEY_ID');
  const secretAccessKey = getEnvOrThrow('R2_SECRET_ACCESS_KEY');
  const bucket = getEnvOrThrow('R2_BUCKET_NAME');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

export async function cleanupPrefix(prefix: string): Promise<{ deletedCount: number }> {
  const { client, bucket } = createR2Client();
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    const objects = listed.Contents ?? [];
    if (objects.length === 0) break;

    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objects
          .filter((o): o is { Key: string } => typeof o.Key === 'string')
          .map((o) => ({ Key: o.Key })),
      },
    }));
    deletedCount += objects.length;
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);

  return { deletedCount };
}
