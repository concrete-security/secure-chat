export interface AttestationResult {
  trusted: boolean;
  teeType: string;
  tcbStatus: string;
}

/** Bootchain measurements for TDX verification */
export interface ExpectedBootchain {
  mrtd?: string;
  rtmr0?: string;
  rtmr1?: string;
  rtmr2?: string;
}

/** App compose configuration */
export interface AppCompose {
  docker_compose_file?: string;
  allowed_envs?: string[];
}

/** Verification policy for RA-TLS connections */
export interface RatlsPolicy {
  type: "dstack_tdx";
  /** Expected bootchain measurements (optional if disable_runtime_verification is true) */
  expected_bootchain?: ExpectedBootchain;
  /** Expected OS image hash (optional if disable_runtime_verification is true) */
  os_image_hash?: string;
  /** App compose configuration (optional if disable_runtime_verification is true) */
  app_compose?: AppCompose;
  /** Allowed TCB status values */
  allowed_tcb_status?: string[];
  /** DEVELOPMENT ONLY: Skip bootchain/app_compose/os_image verification */
  disable_runtime_verification?: boolean;
}

export interface RatlsFetchOptions {
  proxyUrl: string;
  targetHost: string;
  /** Verification policy (required) */
  policy: RatlsPolicy;
  serverName?: string;
  defaultHeaders?: Record<string, string>;
  onAttestation?: (attestation: AttestationResult) => void;
}

export interface RatlsResponse extends Response {
  readonly attestation: AttestationResult;
}

export type RatlsFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<RatlsResponse>;

export function createRatlsFetch(options: RatlsFetchOptions): RatlsFetch;

/** Close all cached connections */
export function closeAllConnections(): void;

/** Get connection pool statistics */
export function getConnectionPoolStats(): { total: number };

export { AttestedStream, mergeWithDefaultAppCompose } from "./ratls_wasm.js";

