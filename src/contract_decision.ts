export type ContractRequest = {
  contractName: string;
  pdf: string;
  cert_pem: string;
  key_pem: string;
  reason?: string;
  location?: string;
};

export type SigningPlan = {
  key: string;
  signBody: Record<string, string | number>;
};

export function chooseSigningPlan(input: ContractRequest): SigningPlan {
  if (!input.contractName.trim()) throw new Error("contractName is required");
  if (!input.pdf || !input.cert_pem || !input.key_pem) {
    throw new Error("pdf, cert_pem, and key_pem are required");
  }
  const key = `contracts/${input.contractName.trim()}.pdf`;
  return {
    key,
    signBody: {
      pdf: input.pdf,
      cert_pem: input.cert_pem,
      key_pem: input.key_pem,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.location ? { location: input.location } : {}),
      retention_days: 30
    }
  };
}
