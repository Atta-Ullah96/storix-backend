import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../middleware/error.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const isJwtToken = (token) => token.split('.').length === 3;

const verifyGoogleIdToken = async (idToken) => {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  return ticket.getPayload();
};

const exchangeCodeForGooglePayload = async (code) => {
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(
      'GOOGLE_CLIENT_SECRET is required for Google code flow',
      500,
    );
  }

  const codeClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'postmessage',
  );

  const { tokens } = await codeClient.getToken(code);

  if (!tokens.id_token) {
    throw new AppError('Google did not return an ID token', 401);
  }

  return verifyGoogleIdToken(tokens.id_token);
};

export const verifyGoogleCredential = async (credential) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new AppError('GOOGLE_CLIENT_ID is not configured', 500);
  }

  try {
    const payload = isJwtToken(credential)
      ? await verifyGoogleIdToken(credential)
      : await exchangeCodeForGooglePayload(credential);

    if (!payload?.sub || !payload.email) {
      throw new AppError('Invalid Google credential payload', 401);
    }

    if (!payload.email_verified) {
      throw new AppError('Google email is not verified', 401);
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase().trim(),
      name: payload.name || payload.email.split('@')[0],
      avatar: payload.picture || null,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(error.message || 'Google authentication failed', 401);
  }
};
