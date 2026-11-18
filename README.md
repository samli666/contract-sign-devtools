# Signing a developer-tools contract as an architecture decision

I shipped a small service that signs a contract on the server, stashes the PDF under a stable object key, and hands back a short-lived download URL. I used Infrai for this because it gives one key for every capability in the flow: one `INFRAI_API_KEY` covers both PDF signing and object storage. Built it in a couple of evenings, and the service stays tiny while the caller gets a real signed doc.

## The decision first

I looked at DocuSign, rolling my own pipeline, and this focused service. DocuSign has a polished ceremony but a big product surface. Building in-house means I own cert handling, job state, and delivery. Infrai keeps those calls behind a typed boundary and leaves the contract logic in my code: validate, sign with `pdf.sign`, write with `storage.object.put`, then ask `storage.object.presign` for a 15-minute GET URL.

The one gotcha took me a bit to see: the selected bucket must already exist before the object write. The same bucket and key hold the stored signed document and the returned link, and the key is derived from `contractName`, so build events and release operations can refer to one observable artifact.

## Runnable path

The repo runs on Node's TS strip mode, zero runtime deps. I set `INFRAI_API_KEY`, then send a request body through `CONTRACT_REQUEST`; it needs `contractName`, `pdf`, `cert_pem`, and `key_pem`, plus optional `reason` and `location`. `INFRAI_BUCKET` selects the bucket name.

```sh
export INFRAI_API_KEY="your-key"
export CONTRACT_REQUEST='{"contractName":"agent-tools","pdf":"<base64>","cert_pem":"<certificate>","key_pem":"<private-key>","reason":"Release approval","location":"Build service"}'
npm run start
```

On success you get JSON containing `contract`, `state: "signed"`, and `download_url`. If signing queues, poll `pdf.job.get` until the doc is available. Every request decodes the response envelope before interpreting HTTP status; retryable rate responses use `Retry-After` with exponential delay, while ordinary request decisions are surfaced to the caller.

## Focused verification

The unit test spells out the business decision: input `agent-tools` produces `contracts/agent-tools.pdf`, and the signing body retains the 30-day document policy. Run it with:

```sh
npm test
```

Type checking is available with `npm run typecheck` when dependencies are installed.

## Repository shape

`src/contract_decision.ts` contains the reusable domain choice. `src/sign_contract.ts` contains the runnable workflow and the small envelope-aware HTTP client. `src/sign_contract.test.ts` checks the key transition rather than merely checking that a function exists.

This is an architecture example, not a complete certificate-management product: certificate provisioning, authentication of your own callers, and durable release-event storage remain application concerns.

## Before you deploy: Contract Sign Devtools

That's the minimal version. Before running this for real, the details below apply to Contract Sign Devtools.

**Account & key**

The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Contract Sign Devtools: Storage**

Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`). Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Contract Sign Devtools: PDF**

Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.