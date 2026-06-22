# Storix Backend

Storix is a Google Drive-style storage backend built with Node.js and Express. It provides session authentication, Google sign-in, nested folders, direct-to-S3 uploads, file preview/download, per-user storage quotas, Stripe subscriptions, and an administrator API.

## What The Backend Does

- Registers and authenticates local users with hashed passwords.
- Verifies Google ID tokens or exchanges Google authorization codes.
- Stores login sessions in Redis and sends the session ID in an HTTP-only cookie.
- Creates nested folder records in MongoDB.
- Generates presigned S3 URLs so files upload directly from the frontend to AWS.
- Verifies completed uploads against S3 before recording used storage.
- Provides signed S3 download URLs and CloudFront preview URLs.
- Enforces each user's storage quota before and after an upload.
- Supports Free, Pro, and Business subscriptions through Stripe Checkout.
- Synchronizes subscription status, invoices, payments, and storage limits from Stripe webhooks.
- Provides admin APIs for users, files, storage, activity, settings, subscriptions, and payments.

## Technology

- Node.js 20+ and Express 5
- MongoDB and Mongoose
- Redis
- AWS S3 and CloudFront
- Stripe
- bcrypt
- Google Auth Library
- Zod
- Helmet, CORS, cookie-parser, and express-rate-limit

## Project Structure

```text
backend/
  app.js                    Express configuration and route mounting
  index.js                  MongoDB connection and HTTP server startup
  config/
    db.js                   MongoDB connection
    redis.js                Redis client
    stripe.js               Lazy Stripe client
  controller/
    auth.js                 Registration, login, Google auth, logout, current user
    file.js                 Upload, listing, preview, download, rename, delete
    folder.js               Folder creation, listing, rename, recursive deletion
    user.js                 User storage summary
    billing.js              Customer billing endpoints and Stripe webhook
    billingAdmin.js         Admin subscription and payment reporting
    admin.js                Main admin dashboard operations
  middleware/
    auth.js                 Session authentication and blocked-user checks
    admin.js                Admin role authorization
    error.js                AppError and centralized error responses
    rateLimitter.js         Global, login, and upload rate limits
  models/                   MongoDB schemas
  routes/                   Express routers
  services/                 AWS, Stripe, session, folder, settings, and admin logic
  utils/                    Cookies, plans, file/folder helpers, and ID validation
  validator/                Zod request schemas
```

## Prerequisites

Install and run:

- Node.js 20 or newer
- MongoDB
- Redis Stack (or Redis with the JSON module) on the default local address, `redis://127.0.0.1:6379`
- An AWS account with an S3 bucket
- A Stripe account for paid plans
- Google OAuth credentials when Google sign-in is enabled

The session service uses RedisJSON commands. The Redis client currently uses the package's default local connection and does not read a Redis URL from the environment.

## Installation

```bash
npm install
npm run dev
```

The default API port is `5000`. Set `PORT=4000` if the frontend expects the backend at `http://localhost:4000`.

The project currently has no automated test suite. Use the lint command below because the existing `npm run lint` script still references Next.js:

```powershell
.\node_modules\.bin\eslint.cmd .
```

## Environment Variables

Create `.env` in the backend directory:

```env
NODE_ENV=development
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/storix
FRONTEND_URL=http://localhost:3001

COOKIE_SAME_SITE=lax
COOKIE_SECURE=false

GOOGLE_CLIENT_ID=your_google_web_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=postmessage

AWS_REGION=your_aws_region
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=your_bucket_name
AWS_CLOUDFRONT_URL=https://your-distribution.cloudfront.net
CLOUDFRONT_DOMAIN=https://your-distribution.cloudfront.net
CLOUDFRONT_DISTRIBUTION_ID=your_distribution_id

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_BUSINESS_PRICE_ID=price_...
CLIENT_URL=http://localhost:3001
```

Environment notes:

- `FRONTEND_URL` is the only allowed CORS origin.
- `CLIENT_URL` controls Stripe redirect URLs and falls back to `FRONTEND_URL`.
- `AWS_CLOUDFRONT_URL` is stored on completed file records.
- `CLOUDFRONT_DOMAIN` is used to build preview URLs.
- `CLOUDFRONT_DISTRIBUTION_ID` is optional; without it, deletion skips cache invalidation.
- Never send Stripe or AWS secret keys to the frontend.

## Server And Middleware Flow

The application applies middleware in this order:

1. CORS with credentials enabled.
2. Helmet security headers.
3. Stripe webhook with an endpoint-specific raw body parser.
4. JSON and URL-encoded request parsers.
5. Cookie parsing.
6. Global rate limiting.
7. API routes.
8. Not-found and centralized error middleware.

The Stripe webhook is intentionally mounted before `express.json()`; signature verification fails if Stripe's raw request body is modified.

## Authentication And Sessions

The session cookie is named `sessionId`, is HTTP-only, and expires after seven days. In production it defaults to `SameSite=None` and `Secure=true`. The frontend must include credentials:

```js
const response = await fetch('http://localhost:4000/api/v1/auth/me', {
  credentials: 'include',
});
```

The auth middleware:

- Reads `sessionId` from the cookie.
- Also accepts `x-session-id` or `sessionId` in the body as fallbacks.
- Loads the session from Redis.
- Loads the current user from MongoDB.
- Deletes invalid sessions and clears invalid cookies.
- Rejects blocked users.
- Updates `lastActiveAt).
- Exposes the user as `req.user` and session as `req.session`.

### Auth Endpoints

| Method | Endpoint                | Authentication | Purpose                                 |
| ------ | ----------------------- | -------------- | --------------------------------------- |
| POST   | `/api/v1/auth/register` | Public         | Create a local account                  |
| POST   | `/api/v1/auth/login`    | Public         | Login and set the session cookie        |
| POST   | `/api/v1/auth/google`   | Public         | Continue with Google                    |
| GET    | `/api/v1/auth/me`       | Required       | Return the current user                 |
| POST   | `/api/v1/auth/logout`   | Required       | Delete the session and clear the cookie |

Register:

```json
{
  "name": "Atta Ullah",
  "email": "atta@example.com",
  "password": "password123"
}
```

Login:

```json
{
  "email": "atta@example.com",
  "password": "password123"
}
```

Google authentication accepts any one of `credential`, `idToken`, `token`, or `code`. JWT ID tokens are verified directly. Authorization codes require `GOOGLE_CLIENT_SECRET` and are exchanged before verification.

## Storage Plans And Quotas

| Plan     |     Price | Storage limit |
| -------- | --------: | ------------: |
| Free     |  $0/month |          8 GB |
| Pro      |  $9/month |        100 GB |
| Business | $29/month |          1 TB |

Storage values are stored as bytes. Upload requests are rejected when their declared size exceeds the remaining quota. Upload completion checks the real S3 object size and checks the quota again before increasing `storageUsed`.

Deleting a completed file decreases `storageUsed`. A subscription downgrade never deletes existing files. Users above the new limit keep their files but cannot upload more until usage falls below the limit.

Storage summary:

| Method | Endpoint               | Authentication |
| ------ | ---------------------- | -------------- |
| GET    | `/api/v1/user/storage` | Required       |

## Folder API

Base path: `/api/v1/folder`

| Method | Endpoint            | Purpose                                                |
| ------ | ------------------- | ------------------------------------------------------ |
| GET    | `/`                 | List root folders or children using `?parentFolder=id` |
| POST   | `/create`           | Create a root or nested folder                         |
| PATCH  | `/:folderId/rename` | Rename an owned folder                                 |
| DELETE | `/:folderId`        | Delete the owned folder tree                           |

All folder routes require authentication.

Create a root folder:

```json
{ "name": "Documents" }
```

Create a nested folder:

```json
{
  "name": "Projects",
  "parentFolder": "mongodb_folder_id"
}
```

Folders must have unique names within the same parent for the same user.

Current deletion behavior: recursive folder deletion removes the selected folder and descendant folder records. It does not currently delete file records or S3 objects inside those folders. That cleanup should be implemented before relying on folder deletion in production.

## File API

Base path: `/api/v1/file`

| Method | Endpoint           | Purpose                                             |
| ------ | ------------------ | --------------------------------------------------- |
| GET    | `/?folderId=id`    | List completed files in a root or nested folder     |
| POST   | `/request-upload`  | Validate quota and create a presigned S3 upload URL |
| POST   | `/complete-upload` | Verify S3 upload and finalize file metadata         |
| GET    | `/:id/preview`     | Return or redirect to a CloudFront preview          |
| GET    | `/:id/download`    | Return or redirect to a signed S3 download          |
| PATCH  | `/:id/rename`      | Rename file metadata                                |
| DELETE | `/:id`             | Delete S3 object and metadata                       |

All file routes require authentication.

### Direct Upload Flow

1. Request an upload URL:

```http
POST /api/v1/file/request-upload
Content-Type: application/json
```

```json
{
  "fileName": "report.pdf",
  "fileType": "application/pdf",
  "fileSize": 204800,
  "folderId": null
}
```

2. Upload the raw file to the returned `uploadUrl` using HTTP `PUT` and the same content type.
3. Confirm completion:

```json
{
  "fileId": "mongodb_file_id"
}
```

The upload URL expires after five minutes. File type and maximum upload size come from system settings.

Append `?redirect=true` to preview or download endpoints to receive an HTTP redirect instead of JSON containing the URL.

## Stripe Billing

Paid plans use Stripe-hosted Checkout and Billing Portal pages. Storix does not store card numbers or payment-method details.

### Customer Billing Endpoints

| Method | Endpoint                               | Purpose                                      |
| ------ | -------------------------------------- | -------------------------------------------- |
| POST   | `/api/billing/create-checkout-session` | Create Pro or Business Checkout session      |
| POST   | `/api/billing/create-portal-session`   | Open Stripe Billing Portal                   |
| GET    | `/api/billing/my-subscription`         | Get plan, status, quota, and payment history |
| POST   | `/api/billing/cancel-subscription`     | Cancel at the current period end             |
| POST   | `/api/billing/resume-subscription`     | Remove scheduled cancellation                |

These endpoints require authentication.

Checkout body:

```json
{ "planKey": "pro" }
```

Valid paid plan keys are `pro` and `business`.

### Stripe Webhook

```text
POST /api/billing/webhook
```

The webhook is public but protected by Stripe signature verification. It handles:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Webhook events synchronize user billing fields, subscription records, invoice/payment history, and storage quotas. Stripe events are the final source of truth for subscription activation and cancellation.

Local webhook forwarding:

```bash
stripe listen --forward-to localhost:4000/api/billing/webhook
```

Put the CLI-provided `whsec_...` value in `STRIPE_WEBHOOK_SECRET`, restart the backend, create a Checkout session, and complete it with Stripe test card `4242 4242 4242 4242`.

## Admin API

Every `/api/admin` route requires both `requireAuth` and `requireAdmin`. Normal users receive `403`.

Promote the first admin directly in MongoDB:

```javascript
db.auths.updateOne(
  { email: 'admin@example.com' },
  { $set: { role: 'admin', status: 'active' } }
);
```

### Admin Endpoints

| Method | Endpoint                             | Purpose                                |
| ------ | ------------------------------------ | -------------------------------------- |
| GET    | `/api/admin/overview`                | Dashboard overview                     |
| GET    | `/api/admin/users`                   | Paginated users                        |
| GET    | `/api/admin/users/:id`               | User details and usage                 |
| PATCH  | `/api/admin/users/:id/status`        | Block or activate a user               |
| PATCH  | `/api/admin/users/:id/role`          | Change user/admin role                 |
| PATCH  | `/api/admin/users/:id/storage-limit` | Change quota in bytes                  |
| DELETE | `/api/admin/users/:id`               | Delete user and owned resources        |
| GET    | `/api/admin/storage`                 | Storage analytics                      |
| GET    | `/api/admin/files`                   | Paginated files                        |
| GET    | `/api/admin/files/:id`               | File details                           |
| DELETE | `/api/admin/files/:id`               | Delete an S3 object and file record    |
| GET    | `/api/admin/activity`                | Admin activity history                 |
| GET    | `/api/admin/health`                  | MongoDB, Redis, S3, and backend status |
| GET    | `/api/admin/settings`                | Global settings                        |
| PATCH  | `/api/admin/settings`                | Update global settings                 |
| GET    | `/api/admin/subscriptions`           | Paginated subscriptions                |
| GET    | `/api/admin/subscriptions/:id`       | Subscription, payments, and storage    |
| GET    | `/api/admin/payments`                | Paginated invoice/payment history      |
| GET    | `/api/admin/subscription-stats`      | Plan, revenue, and status statistics   |

List endpoints support pagination and applicable search, filter, sort, and order query parameters. The maximum page size is 100.

Settings can include:

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

Admin safeguards prevent self-deletion and removal or blocking of the final active administrator.

## Rate Limits

- Global: 300 requests per IP every 15 minutes.
- Login: 5 attempts per IP and email every 15 minutes.
- Upload URL requests: 50 per user every hour.

## Data Models

- `Auth`: identity, role/status, quota usage, and Stripe customer/subscription state.
- `Session`: legacy MongoDB session schema; active runtime sessions are managed by Redis.
- `Folder`: nested folder ownership and parent relationship.
- `File`: S3 metadata, ownership, folder, size, state, and storage key.
- `Subscription`: synchronized Stripe subscription details.
- `Payment`: Stripe invoice and payment history.
- `ActivityLog`: administrator action audit history.
- `SystemSettings`: singleton global registration, upload, and quota settings.

## Error Responses

Centralized errors use:

```json
{
  "success": false,
  "message": "Readable error message"
}
```

Common statuses are `400` for invalid input, `401` for missing authentication, `403` for blocked or unauthorized access, `404` for missing resources, and `409` for conflicts.

## Postman Checklist

1. Start MongoDB and Redis.
2. Start the backend with `npm run dev`.
3. Register or log in and keep Postman's cookie jar enabled.
4. Verify `sessionId` exists for the same hostname used by later requests.
5. Test folder creation and the two-step S3 upload flow.
6. Configure Stripe test prices and forward webhook events with Stripe CLI.
7. Complete Checkout and verify `/api/billing/my-subscription`.
8. Promote a test account to admin and verify the admin overview, subscription, and payment endpoints.
9. Confirm a normal account receives `403` from admin routes.

## Current Limitations

- There is no automated test suite.
- The `npm run lint` script is currently misconfigured as `next lint`; run ESLint directly.
- The Dockerfile runs `npm start`, but `package.json` currently has no `start` script.
- Redis is fixed to its default local connection because no Redis URL is configured in code.
- Recursive folder deletion does not remove files or S3 objects inside the deleted tree.
- File preview configuration currently uses both `AWS_CLOUDFRONT_URL` and `CLOUDFRONT_DOMAIN`.
- Existing users with an older stored quota are not automatically migrated when defaults change.

## Security Notes

- Keep `.env` out of source control.
- Use HTTPS in production.
- Use `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true` for a cross-site HTTPS frontend.
- Keep the S3 bucket private and use signed URLs or CloudFront access controls.
- Restrict AWS credentials to the required bucket and invalidation actions.
- Never trust frontend redirects to activate paid access; rely on verified Stripe webhooks.
