import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../middleware/error.js';

const getS3Env = () => {
  const { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET } =
    process.env;

  if (
    !AWS_REGION ||
    !AWS_ACCESS_KEY_ID ||
    !AWS_SECRET_ACCESS_KEY ||
    !AWS_S3_BUCKET
  ) {
    throw new AppError('AWS S3 environment variables are not configured', 500);
  }

  return {
    bucket: AWS_S3_BUCKET,
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  };
};

const createS3Client = () => {
  const { region, credentials } = getS3Env();

  return new S3Client({
    region,
    credentials,
  });
};

export const getS3Bucket = () => getS3Env().bucket;

export const createUploadUrl = async ({ storageKey, fileType }) => {
  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: storageKey,
    ContentType: fileType,
  });

  return getSignedUrl(createS3Client(), command, {
    expiresIn: 300,
  });
};

export const getS3ObjectMetadata = async (storageKey) => {
  const command = new HeadObjectCommand({
    Bucket: getS3Bucket(),
    Key: storageKey,
  });

  return createS3Client().send(command);
};

export const deleteS3Object = async (storageKey) => {
  const command = new DeleteObjectCommand({
    Bucket: getS3Bucket(),
    Key: storageKey,
  });

  return createS3Client().send(command);
};

export const getCloudFrontUrl = (storageKey) => {
  if (!process.env.AWS_CLOUDFRONT_URL) {
    return null;
  }

  return `${process.env.AWS_CLOUDFRONT_URL}/${storageKey}`;
};
