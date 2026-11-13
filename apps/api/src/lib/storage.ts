import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config';
import { decryptBuffer, encryptBuffer } from './crypto';

export interface Storage {
  put(key: string, data: Buffer, opts?: { encrypt?: boolean; contentType?: string }): Promise<{ encrypted: boolean }>;
  get(key: string, encrypted: boolean): Promise<Buffer>;
  remove(key: string): Promise<void>;
  ping(): Promise<boolean>;
}

class DiskStorage implements Storage {
  private root = resolve(config.STORAGE_DIR);

  private path(key: string) {
    const p = resolve(join(this.root, key));
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error('Ruta de almacenamiento inválida');
    return p;
  }

  async put(key: string, data: Buffer, opts: { encrypt?: boolean } = {}) {
    const encrypt = opts.encrypt ?? config.ENCRYPT_EVIDENCES;
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, encrypt ? encryptBuffer(data) : data);
    return { encrypted: encrypt };
  }

  async get(key: string, encrypted: boolean) {
    const buf = await readFile(this.path(key));
    return encrypted ? decryptBuffer(buf) : buf;
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }

  async ping() {
    await mkdir(this.root, { recursive: true });
    return true;
  }
}

class S3Storage implements Storage {
  private client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: Boolean(config.S3_ENDPOINT),
    credentials:
      config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  private bucket = config.S3_BUCKET ?? '';

  async put(key: string, data: Buffer, opts: { encrypt?: boolean; contentType?: string } = {}) {
    const encrypt = opts.encrypt ?? config.ENCRYPT_EVIDENCES;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: encrypt ? encryptBuffer(data) : data,
        ContentType: encrypt ? 'application/octet-stream' : opts.contentType,
        ServerSideEncryption: config.S3_ENDPOINT ? undefined : 'AES256',
      }),
    );
    return { encrypted: encrypt };
  }

  async get(key: string, encrypted: boolean) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = Buffer.from(await res.Body!.transformToByteArray());
    return encrypted ? decryptBuffer(bytes) : bytes;
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async ping() {
    return Boolean(this.bucket);
  }
}

export const storage: Storage = config.STORAGE_DRIVER === 's3' ? new S3Storage() : new DiskStorage();
