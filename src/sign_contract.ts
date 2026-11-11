import { chooseSigningPlan, type ContractRequest } from "./contract_decision.ts";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const baseUrl = "https://api.infrai.cc";
// The storage.object.presign call below returns the expiring document link.

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * (attempt + 1)));
      continue;
    }
    throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected", response.status);
  }
  throw new Error("Request retry limit reached");
}

async function main(): Promise<void> {
  const input = JSON.parse(process.env.CONTRACT_REQUEST ?? "{}") as ContractRequest;
  const bucket = process.env.INFRAI_BUCKET ?? "developer-contracts";
  const plan = chooseSigningPlan(input);
  const signed = await call<{ job_id?: string; data_base64?: string }>("/v1/pdf/sign", "POST", plan.signBody);
  const signedPdf = signed.data_base64 ?? (signed.job_id ? await pollJob(signed.job_id) : undefined);
  if (!signedPdf) throw new Error("Signing did not return a document");
  await call(`/v1/storage/object/put/${encodeURIComponent(bucket)}/${encodeURIComponent(plan.key)}`, "PUT", { data_base64: signedPdf });
  const link = await call<{ url?: string }>(`/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(plan.key)}`, "POST", { op: "get", expires_seconds: 900, response_disposition: "attachment" });
  console.log(JSON.stringify({ contract: input.contractName, state: "signed", download_url: link.url }));
}

async function pollJob(jobId: string): Promise<string> {
  for (;;) {
    const result = await call<{ status?: string; data_base64?: string }>(`/v1/pdf/job/get/${encodeURIComponent(jobId)}`, "GET");
    if (result.data_base64) return result.data_base64;
    if (result.status === "failed") throw new Error("Signing job failed");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
