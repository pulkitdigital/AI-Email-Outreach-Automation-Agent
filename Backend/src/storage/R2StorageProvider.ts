import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import type { StorageProvider } from './StorageProvider.js';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Cloudflare R2 (S3-compatible) — production storage target. */
export class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET_NAME
    ) {
      throw new Error(
        'STORAGE_PROVIDER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME to be set',
      );
    }

    this.bucket = env.R2_BUCKET_NAME;
    this.client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async putObject(key: string, data: Buffer, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) {
      throw new Error(`R2 object body empty for key: ${key}`);
    }
    return streamToBuffer(result.Body as NodeJS.ReadableStream);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
