export const SESSION_COOKIE_NAME = 'sessionId';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const getSessionExpiryDate = () =>
  new Date(Date.now() + SESSION_MAX_AGE_MS);

const getSessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
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
