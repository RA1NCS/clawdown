// R2 storage — upload and retrieve PDFs
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

const bucket = process.env.R2_BUCKET!;

export type StoredPdf = {
    data: Uint8Array;
    filename?: string;
};

// upload PDF to R2
export async function uploadPdf(
    key: string,
    pdf: Uint8Array,
    filename?: string,
): Promise<void> {
    await s3.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: pdf,
            ContentType: 'application/pdf',
            ContentDisposition: filename ? `inline; filename="${filename}"` : undefined,
        }),
    );
}

// fetch PDF from R2 by key
export async function getPdf(key: string): Promise<StoredPdf | null> {
    const res = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
    ).catch(() => null);

    if (!res?.Body) return null;
    return {
        data: new Uint8Array(await res.Body.transformToByteArray()),
        filename: res.ContentDisposition?.match(/filename="([^"]+)"/)?.[1],
    };
}
