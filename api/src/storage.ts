// R2 storage — upload PDFs, return presigned download URLs
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const EXPIRY_SECONDS = 900; // 15 minutes

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

const bucket = process.env.R2_BUCKET!;

// upload PDF to R2 and return a presigned download URL
export async function uploadPdf(
    key: string,
    pdf: Uint8Array,
): Promise<string> {
    await s3.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: pdf,
            ContentType: 'application/pdf',
        }),
    );

    const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: EXPIRY_SECONDS },
    );

    return url;
}

export { EXPIRY_SECONDS };
