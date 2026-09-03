# Relay - unified AI chat

React/Vite/TypeScript/Tailwind frontend and Express/Mongoose/Gemini backend in one Vercel project.

## Local development (Node 24)

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and provide your own MongoDB URI and Gemini key. Never commit real credentials.
3. Run `npm run dev:api` in one terminal (port 5000).
4. Run `npm run dev` in another terminal. Vite proxies `/api` to the local backend.

`npm test` runs offline unit and API-contract tests with isolated provider/database mocks. `npm run build` checks TypeScript and generates `dist`. For fixture-only browser tests, build then run `node tests/fixture-server.mjs` and open http://127.0.0.1:5000. Fixture responses are explicitly labelled; they do not verify Gemini or MongoDB.

## Production

The existing Vercel project is `fos7/ai-chat-box`, at https://ai-chat-box-rouge.vercel.app.

Vercel builds Vite assets. `/api` and `/api/*` rewrite to `api/index.js`; other paths serve `index.html`. The API stays CommonJS through `api/package.json`; shared backend helpers use `.cjs`.

Set `MONGO_URI` and `GEMINI_API_KEY` in Vercel. Optional `GEMINI_MODEL` overrides the default `gemini-3.5-flash-lite` for both model calls. Use a supported model; Gemini 1.5 is not a working downgrade. The owner approved substituting a supported stable Flash model. No preview or experimental model is configured.

Production deployment: link to the existing project with `vercel link --project ai-chat-box --scope fos7`, then `vercel --prod`. Do not create a second project. Push the same source to the linked repository's main branch. Keep Vercel credentials, `.env*` secret files, `.vercel`, `node_modules`, and build output out of Git.

## API contract

- `GET /api`: process health (`{"status":"ok"}`), not a check of MongoDB or Gemini availability.
- `POST /api/chat/message`: body `{ "sessionId": "unique-conversation-id", "message": "your prompt" }`.
- Success fields: `intent`, `responseType`, `routingSource`, `message`, `data`.
- General responses usually need one model request: classification also returns the answer. The second model call remains as a fallback. Only transient model failures retry once; the whole POST and database mutations are never automatically replayed.
- MongoDB uses Mongoose's warm connection pool and a shared in-flight promise. Every cold serverless instance still needs its own initial connection.
- A provider outage still returns an honest error. Neither the model choice nor retries can guarantee zero 503 responses or a fixed two-second latency.

## Conversations and data

Every page load opens a fresh, empty New Chat with a new session ID. The sidebar retains sessions in `relay-conversations-v2` localStorage, with titles from the first prompt; only an explicit sidebar selection loads previous messages. Unsent drafts and selection are not persisted. The first submitted prompt adds the draft to the archive. It supports new sessions, reload persistence of history, and individual deletion with confirmation. Old single-session storage is migrated into history without auto-selecting it. Replies are appended to their original session even if another chat is selected.

Deletion removes a conversation from this browser only; it does not erase MongoDB history. This is not an authenticated cross-device archive. Invalid/blocked storage shows a warning rather than crashing or silently wiping the archive.

Single objects render as key-value cards, including nested values, null, false, and zero. Arrays of objects retain tabular rendering without the old silent row/column truncation. React renders data as escaped text.

## Existing backend behavior and scope

The account/order query and write workflows and mocked payment-gateway response are retained from the original backend. Do not mistake the mocked gateway status for a real payment-system health check. The existing public API has no user authentication/authorization or rate limiting; those are separate production-hardening tasks, and a browser session ID is not authentication.

The optional seed script replaces existing account/order demo records. Do not run it against a database whose contents you need to preserve.
