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
  controller/folder.js   Folder controllers
  middleware/auth.js     Session authentication middleware
  middleware/error.js    AppError, asyncHandler, error handler
  models/auth.js         User/auth model
  models/folder.js       Folder model
  models/session.js      Session model
  routes/auth.js         Auth routes
  routes/folder.js       Folder routes
  services/googleAuth.js Google credential verification
  services/session.js    Session create/reuse/delete logic
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

## Folder Routes

Base path:

```text
/api/v1/folder
```

### Create Folder

```http
POST /api/v1/folder/create
```

Requires a valid session.

Body for a root folder:

```json
{
  "name": "Documents"
}
```

Body for a nested folder:

```json
{
  "name": "Projects",
  "parentFolder": "parent_folder_id_here"
}
```

If `parentFolder` is missing, the folder is created at the root level.

### Get Folders

```http
GET /api/v1/folder
```

Requires a valid session. Returns root folders for the current user.

To get folders inside another folder:

```http
GET /api/v1/folder?parentFolder=parent_folder_id_here
```

### Rename Folder

```http
PATCH /api/v1/folder/:folderId/rename
```

Requires a valid session.

Body:

```json
{
  "name": "New Folder Name"
}
```

### Delete Folder

```http
DELETE /api/v1/folder/:folderId
```

Requires a valid session. This deletes the selected folder and all nested child folders owned by the current user.

When file support is added, file cleanup should be handled from `services/folder.js` so deleting a folder also deletes or moves the files inside it according to the app policy.

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

## Admin API

All admin endpoints use the `/api/admin` base path and require a valid `sessionId` cookie for a user whose `role` is `admin`. Unauthenticated requests return `401`; non-admin requests return `403`.

### Bootstrap the first admin

Promote one existing account directly in MongoDB once:

```javascript
db.auths.updateOne(
  { email: 'admin@example.com' },
  { $set: { role: 'admin', status: 'active' } }
)
```

Log out and log in again after promotion so the session loads the updated user fields.

### Endpoints

```text
GET    /api/admin/overview
GET    /api/admin/users
GET    /api/admin/users/:id
PATCH  /api/admin/users/:id/status
PATCH  /api/admin/users/:id/role
PATCH  /api/admin/users/:id/storage-limit
DELETE /api/admin/users/:id
GET    /api/admin/storage
GET    /api/admin/files
GET    /api/admin/files/:id
DELETE /api/admin/files/:id
GET    /api/admin/activity
GET    /api/admin/health
GET    /api/admin/settings
PATCH  /api/admin/settings
```

Users list query parameters:

```text
page, limit, search, status, role, sort, order
```

Allowed user sort fields: `createdAt`, `lastActiveAt`, `storageUsed`, `storageLimit`.

Files list query parameters:

```text
page, limit, search, type, user, sort, order
```

Allowed file sort fields: `size`, `createdAt`, `uploadedAt`.

Activity query parameters:

```text
page, limit, search, action, user, status, from, to
```

Admin action bodies:

```json
{ "status": "blocked" }
```

```json
{ "role": "admin" }
```

```json
{ "storageLimit": 17179869184 }
```

Settings body can contain any of:

```json
{
  "defaultStorageLimit": 8589934592,
  "maxFileUploadSize": 52428800,
  "allowedFileTypes": ["image/png", "application/pdf"],
  "storageWarningThreshold": 80,
  "maintenanceMode": false,
  "allowRegistration": true
}
```

`defaultStorageLimit`, `maxFileUploadSize`, and file type settings are applied to new registrations and uploads. `allowRegistration` applies to local and Google account creation.

### Postman testing

1. Start MongoDB, Redis, and the backend.
2. Call `POST /api/v1/auth/login` with the admin email/password.
3. Keep Postman's cookie jar enabled; verify `sessionId` exists for the backend host.
4. Call `GET /api/admin/overview` using the same host (`localhost` or `127.0.0.1`) used for login.
5. Test a normal user session against `/api/admin/overview`; it should return `403`.
6. Test list filters and pagination, then test status/role/quota changes on a non-admin test user.
7. Use disposable files/users when testing delete endpoints because they delete S3 objects and MongoDB records.

### Admin frontend fields

User tables can consume `avatar`, `role`, `status`, `storageUsed`, `storageLimit`, `usagePercentage`, `filesCount`, `foldersCount`, `createdAt`, and `lastActiveAt`. Admin file rows include populated `owner` and `folder` objects. List APIs return pagination under `data.pagination`.

### Deletion behavior

Admin file deletion removes the S3 object, file metadata, and decrements the owner's recorded storage usage. Admin user deletion is guarded against self-deletion and last-admin deletion; it removes owned S3 objects, file/folder metadata, Redis sessions, and the user record. If any S3 object cannot be deleted, user deletion stops before metadata is removed.
