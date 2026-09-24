# Workroom Planner

Vite + React workspace planner with department-specific Kanban workflows:

- Artwork: บรีฟ, ออกแบบ/ดีไซน์, คอมเมนต์/แก้ไข, รูปภาพเสร็จแล้ว
- Creative: Kick off, Concept, Script, Approve, Finish, Pre-Shooting
- Production: Shooting Day, Post-Production, On Draft, Post-Revise, Work Done

## Run locally

```bash
pnpm install
pnpm dev
```

The app runs in Demo mode when Firebase variables are empty. Add a `.env` file based on `.env.example` to connect Firebase.

## Firebase setup

1. Create a Firebase web app and copy its config to `.env`.
2. Enable Authentication > Sign-in method > Google.
3. Create Firestore collections: `tasks`, `notifications`.
4. Enable Storage for task image uploads.

The client already includes Google Auth, realtime task subscriptions, task creation, workflow-move notifications, in-app notifications, and Storage upload helpers in `src/services.js`.
## Firebase Cloud Functions

The `functions/pushNotification` function sends a web push notification whenever a document is created in `notifications`. It reads FCM tokens from `users/{uid}.messagingTokens`, sends the task id in the payload, and removes invalid tokens.

From the project root, install the Functions dependencies and deploy:

```bash
cd functions
npm install
npm run check
cd ..
firebase deploy --only functions
```

The Firebase CLI must be authenticated with access to the `dlg-boad` project. The web app must be served from HTTPS in production (localhost is allowed during development), and each user must allow browser notifications once so the token can be saved.
