export const SESSION_COOKIE_NAME = 'sessionId';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const isProduction = () => process.env.NODE_ENV === 'production';

const getBooleanEnv = (value, fallback) => {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
};

const getSessionCookieOptions = () => ({
  httpOnly: true,
  path: '/',
  sameSite: process.env.COOKIE_SAME_SITE || (isProduction() ? 'none' : 'lax'),
  secure: getBooleanEnv(process.env.COOKIE_SECURE, isProduction()),
});

export const setSessionCookie = (res, sessionId) => {
  res.cookie(SESSION_COOKIE_NAME, sessionId.toString(), {
    ...getSessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_MS,
  });
};

export const clearSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions());
};

export const getSessionIdFromRequest = (req) => {
  if (req.cookies?.[SESSION_COOKIE_NAME]) {
    return req.cookies[SESSION_COOKIE_NAME];
  }

  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return req.headers['x-session-id'] || req.body?.sessionId || null;
  }

  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith(`${SESSION_COOKIE_NAME}=`),
  );

  if (!sessionCookie) {
    return req.headers['x-session-id'] || req.body?.sessionId || null;
  }

  return decodeURIComponent(sessionCookie.split('=')[1]);
};
