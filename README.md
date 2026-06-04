# Google Drive Clone Backend

Express and MongoDB backend for a Google Drive clone. The current backend includes local authentication, Google sign-in, database-backed sessions, CORS, and centralized error handling.

## Tech Stack

- Node.js
- Express
- MongoDB with Mongoose
- bcrypt
- google-auth-library
- cors
- dotenv

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```env
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/google-drive-clone
FRONTEND_URL=http://localhost:3001
GOOGLE_CLIENT_ID=your_google_web_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=postmessage
```

Start the server:

```bash
npm run dev
```

The API runs on:

```text
http://localhost:4000
```

## Project Structure

```text
backend/
  app.js                 Express app, CORS, routes, error middleware
  index.js               DB connection and server startup
  config/db.js           MongoDB connection
  controller/auth.js     Auth controllers
  middleware/auth.js     Session authentication middleware
  middleware/error.js    AppError, asyncHandler, error handler
  models/auth.js         User/auth model
  models/session.js      Session model
  routes/auth.js         Auth routes
  utils/session.js       Session cookie helpers
```

## Auth Routes

Base path:

```text
/api/v1/auth
```

### Register

```http
POST /api/v1/auth/register
```

Body:

```json
{
  "name": "Atta",
  "email": "atta@example.com",
  "password": "password123"
}
```

Creates a local user. Passwords are hashed with bcrypt.

### Login

```http
POST /api/v1/auth/login
```

Body:

```json
{
  "email": "atta@example.com",
  "password": "password123"
}
```

Creates or reuses an active session and sets an HTTP-only `sessionId` cookie.

### Continue With Google

```http
POST /api/v1/auth/google
```

Body:

```json
{
  "credential": "google_id_token_here"
}
```

Also accepts:

```json
{
  "idToken": "google_id_token_here"
}
```

or:

```json
{
  "token": "google_id_token_here"
}
```

The backend verifies the token with Google using `GOOGLE_CLIENT_ID`, checks that the Google email is verified, creates or updates the user, then creates or reuses a session.

If the frontend sends a Google auth code that starts with `4/`, the backend exchanges it for an ID token first. In that case `GOOGLE_CLIENT_SECRET` is required. If the frontend sends a Google ID token, it will usually look like a JWT with three dot-separated parts.

### Current User

```http
GET /api/v1/auth/me
```

Requires a valid session. Returns the logged-in user.

### Logout

```http
POST /api/v1/auth/logout
```

Requires a valid session. Deletes the session from MongoDB and clears the cookie.

## Session Behavior

- Sessions are stored in MongoDB.
- Each session references a user id.
- Active sessions are reused instead of creating duplicates.
- Expired sessions are cleaned up during login.
- The session cookie is HTTP-only.
- Session expiry is controlled in `utils/session.js`.
- MongoDB TTL index removes expired sessions automatically.

## Frontend Requests

Because auth uses cookies, frontend requests must include credentials.

Example:

```js
await fetch('http://localhost:4000/api/v1/auth/me', {
  method: 'GET',
  credentials: 'include',
});
```

For JSON requests:

```js
await fetch('http://localhost:4000/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'atta@example.com',
    password: 'password123',
  }),
});
```

## Notes

- `FRONTEND_URL` must match your frontend origin exactly.
- For local development, `secure` cookies are disabled unless `NODE_ENV=production`.
- For production, use HTTPS and set the correct production frontend URL.
