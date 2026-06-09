import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";

const cloudFrontClient = new CloudFrontClient({
  region: "us-east-1",
});

export const encodeS3KeyForUrl = (key) => {
  if (!key) return "";

  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
};

export const getCloudFrontFileUrl = (key) => {
  const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;

  if (!cloudFrontDomain) {
    throw new Error("CLOUDFRONT_DOMAIN is missing in environment variables.");
  }

  if (!key) {
    throw new Error("S3 file key is missing.");
  }

  const cleanDomain = cloudFrontDomain.endsWith("/")
    ? cloudFrontDomain.slice(0, -1)
    : cloudFrontDomain;

  const encodedKey = encodeS3KeyForUrl(key);

  return `${cleanDomain}/${encodedKey}`;
};

const getInvalidationPath = (key) => {
  if (!key) return null;

  const encodedKey = encodeS3KeyForUrl(key);

  return encodedKey.startsWith("/") ? encodedKey : `/${encodedKey}`;
};

export const invalidateCloudFrontPath = async (key) => {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;

  if (!distributionId) {
    console.warn("CLOUDFRONT_DISTRIBUTION_ID is missing. Skipping invalidation.");
    return null;
  }

  const path = getInvalidationPath(key);

  if (!path) {
    console.warn("CloudFront invalidation skipped because file key is missing.");
    return null;
  }

  const command = new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `${Date.now()}-${Math.random()}`,
      Paths: {
        Quantity: 1,
        Items: [path],
      },
    },
  });

  return cloudFrontClient.send(command);
};