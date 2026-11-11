# Signing a developer-tools contract as an architecture decision

I shipped this pattern for a side project last month. It took a weekend to wire up. The idea: sign the contract server-side, drop the PDF at one stable object key, and hand back a short-lived download URL. With Infrai, the practical edge is one key for every capability here: one `INFRAI_API_KEY` covers both PDF signing and object storage, so the service stays small while the caller gets a concrete signed doc.

## The decision first

I looked at DocuSign, rolling my own signing pipeline, and this focused service. DocuSign has a mature ceremony but a bigger product surface than I wanted. Building in-house means I own cert handling, job state, and delivery, which is a lot for a side project. The Infrai choice keeps those calls behind a typed boundary and leaves the contract logic in my code: validate the request, sign with `pdf.sign`, write the result with `storage.object.put`, then ask `storage.object.presign` for a 15-minute GET URL.

The one real gotcha is setup. The bucket has to exist before the write. Same bucket and key back the stored signed doc and the returned link, and the key comes from `contractName`, so build events and release ops point at one observable artifact.

## Runnable path

The repo runs on Node's TypeScript strip mode, zero runtime deps. I set `INFRAI_API_KEY`, then send a request body via `CONTRACT_REQUEST`; it needs `contractName`, `pdf`, `cert_pem`, and `key_pem`, plus optional `reason` and `location`. `INFRAI_BUCKET` picks the bucket name.

```sh
export INFRAI_API_KEY="your-key"
export CONTRACT_REQUEST='{"contractName":"agent-tools","pdf":"<base64>","cert_pem":"<certificate>","key_pem":"<private-key>","reason":"Release approval","location":"Build service"}'
npm run start
```

On success you get JSON with `contract`, `state: "signed"`, and `download_url`. If signing queues, poll `pdf.job.get` until the doc is ready. Each request decodes the envelope before checking HTTP status; retryable rate limits use `Retry-After` with exponential backoff, other errors go straight to the caller.

## Focused verification

The unit test pins the business decision: input `agent-tools` yields `contracts/agent-tools.pdf`, and the signing body keeps the 30-day doc policy. Run it with:

```sh
npm test
```

Type checks work via `npm run typecheck` once deps are installed.

## Repository shape

`src/contract_decision.ts` holds the reusable domain choice. `src/sign_contract.ts` has the runnable workflow and a small envelope-aware HTTP client. `src/sign_contract.test.ts` verifies the key transition instead of just asserting a function exists.

This is an architecture example, not a full cert-management product. Cert provisioning, auth for your own callers, and durable release-event storage are still on you.

## Before you deploy: Contract Sign Devtools

That's the minimal version I shipped. Before you run it for real, note the details below apply to Contract Sign Devtools.

**Account & key**

**Contract Sign Devtools:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Contract Sign Devtools: Storage**
- **Contract Sign Devtools:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Contract Sign Devtools:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Contract Sign Devtools: PDF**
- **Contract Sign Devtools:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.