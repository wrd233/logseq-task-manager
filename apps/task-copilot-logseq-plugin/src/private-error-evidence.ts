export interface PrivateErrorEvidence {
  errorName: string;
  errorCode: string;
}

const MACHINE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;

export function boundedMachineToken(value: unknown): string | undefined {
  return typeof value === "string" && MACHINE_TOKEN.test(value) ? value : undefined;
}

export function privateErrorEvidence(error: unknown): PrivateErrorEvidence {
  if (!(error instanceof Error)) {
    return {
      errorName: "UnknownError",
      errorCode: "UNCLASSIFIED_ERROR",
    };
  }
  const errorName = boundedMachineToken(error.name) ?? "Error";
  const code = boundedMachineToken((error as Error & { code?: unknown }).code);
  return {
    errorName,
    errorCode: code ?? "UNCLASSIFIED_ERROR",
  };
}
