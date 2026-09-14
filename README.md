# riskyc-chat mobile

React Native app (Expo SDK 57, CNG/prebuild workflow — not Expo Go, not EAS
Build) implementing the phase-1 MVP: OTP auth, local-first 1:1 messaging over
STOMP/WebSocket, presence, and pre-signed media upload/download. See the
backend's README and the architecture proposal in the project conversation
history for the full picture.

## Structure

```
src/
├── app/                 # expo-router routes (file-based); root is ./src/app per app.json
│   ├── _layout.tsx       # SQLiteProvider + AuthProvider + Stack.Protected auth gate
│   ├── (auth)/           # login → verify (OTP)
│   └── (tabs)/           # Chats / Calls / Settings, shown once signed in
├── features/             # one folder per backend service this app talks to
│   ├── auth/              # api.ts + AuthContext (session, sign in/out)
│   ├── messaging/         # api.ts (history), ws.ts (STOMP client), useConversation.ts (local-first hook)
│   ├── presence/          # heartbeat / online status
│   └── media/             # pre-signed MinIO upload/download
├── data/                 # local-first SQLite: schema.ts (migrations), db.ts (queries)
└── lib/                  # config.ts (service URLs), httpClient.ts, secureStore.ts (JWT storage)
```

## Local-first messaging

The UI (`useConversation`) always reads from SQLite, never directly from the
network: on mount it shows whatever's cached, then reconciles with
`GET /api/messages/{conversationId}` and opens a live WebSocket subscription —
all three paths write through the same `upsertMessage`, keyed by `messageId`,
so they converge without the UI needing to know which source a message came
from.

## Running

```bash
cd mobile
npm install
npx expo start
```

Requires the backend running (`cd ../backend && docker compose up`). Copy
`.env.example` to `.env.local` and point `EXPO_PUBLIC_*_SERVICE_URL` at your
machine's LAN IP (not `localhost`) when testing on a physical device.

Because this project is on the CNG/prebuild workflow, `npx expo prebuild`
regenerates `ios/`/`android/` from `app.json` + config plugins rather than
committing them — your own CI build pipeline (see `/backend/build-pipeline`,
not yet scaffolded) runs prebuild fresh each build rather than relying on EAS
Build.

## Known gaps (by design, matching the backend's phase-1 scope)

- **No end-to-end encryption yet** — `ciphertext` fields carry plaintext for now (see `useConversation.ts`).
- **No contacts/groups sync** — the chat list reads a local `conversations` table that nothing populates yet; the "Recipient user ID" field on the Chats tab is a dev shortcut for testing the thread screen, not the real "start a chat" flow.
- **No push notifications** — only live while the WebSocket is connected.
- **No calls** — the Calls tab is a placeholder pending WebRTC signaling + an SFU.
