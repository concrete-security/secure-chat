/* tslint:disable */
/* eslint-disable */

export class AttestedStream {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get the attestation result from the RA-TLS handshake.
   */
  attestation(): any;
  /**
   * Close the write side of the stream.
   */
  closeWrite(): Promise<void>;
  /**
   * Send data to the TEE over the attested TLS connection.
   */
  send(data: Uint8Array): Promise<void>;
  /**
   * Connect to a TEE server via WebSocket proxy and perform RA-TLS handshake.
   *
   * Returns an AttestedStream with:
   * - `readable`: Native ReadableStream for response data
   * - `send(data)`: Method to write request data
   * - `attestation()`: Attestation verification result
   *
   * # Arguments
   * * `ws_url` - WebSocket URL (e.g., "ws://proxy:9000?target=host:443")
   * * `server_name` - TLS server name for SNI
   * * `policy` - Verification policy
   */
  static connect(ws_url: string, server_name: string, policy_js: any): Promise<AttestedStream>;
  /**
   * Get the native ReadableStream for response data.
   *
   * This stream can be passed directly to `new Response(readable)`.
   */
  readonly readable: ReadableStream;
}

export class RatlsHttp {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get attestation result.
   */
  attestation(): any;
  /**
   * Close the connection explicitly.
   */
  close(): void;
  /**
   * Perform an HTTP request and return response with streaming body.
   *
   * Returns a JS object: { status, statusText, headers, body }
   * where body is a native ReadableStream.
   *
   * This method uses hyper's HTTP/1.1 client which properly validates
   * headers (preventing CRLF injection) and handles transfer encodings.
   *
   * The connection can be reused for subsequent requests after the response
   * body is fully consumed. Use `isReady()` to check availability.
   */
  fetch(method: string, path: string, host: string, headers_js: any, body?: Uint8Array | null): Promise<any>;
  /**
   * Connect to a TEE server and perform RA-TLS handshake.
   *
   * This establishes an HTTP/1.1 connection that can be reused for multiple requests.
   * The connection uses HTTP keep-alive by default.
   *
   * # Arguments
   * * `ws_url` - WebSocket URL (e.g., "ws://proxy:9000?target=host:443")
   * * `server_name` - TLS server name for SNI
   * * `policy` - Verification policy
   */
  static connect(ws_url: string, server_name: string, policy_js: any): Promise<RatlsHttp>;
  /**
   * Check if the connection is ready for another request.
   *
   * Returns true if the connection can accept a new request, false if closed or busy.
   */
  isReady(): boolean;
}

export function js_get_collateral(pccs_url: any, raw_quote: any): Promise<any>;

export function js_verify(raw_quote: any, quote_collateral: any, now: bigint): any;

/**
 * Merge user-provided app_compose with default values.
 *
 * This allows users to provide only the fields they care about
 * (typically docker_compose_file and allowed_envs) and get a complete
 * app_compose configuration with all required default fields filled in.
 *
 * User-provided values override defaults.
 */
export function mergeWithDefaultAppCompose(user_compose: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_attestedstream_free: (a: number, b: number) => void;
  readonly __wbg_ratlshttp_free: (a: number, b: number) => void;
  readonly attestedstream_attestation: (a: number) => [number, number, number];
  readonly attestedstream_closeWrite: (a: number) => any;
  readonly attestedstream_connect: (a: number, b: number, c: number, d: number, e: any) => any;
  readonly attestedstream_readable: (a: number) => any;
  readonly attestedstream_send: (a: number, b: number, c: number) => any;
  readonly mergeWithDefaultAppCompose: (a: any) => [number, number, number];
  readonly ratlshttp_attestation: (a: number) => [number, number, number];
  readonly ratlshttp_close: (a: number) => void;
  readonly ratlshttp_connect: (a: number, b: number, c: number, d: number, e: any) => any;
  readonly ratlshttp_fetch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: any, i: number, j: number) => any;
  readonly ratlshttp_isReady: (a: number) => number;
  readonly js_get_collateral: (a: any, b: any) => any;
  readonly js_verify: (a: any, b: any, c: bigint) => [number, number, number];
  readonly ring_core_0_17_14__bn_mul_mont: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h1edcd8e466887c60: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__h8305e36bc6ab8e87: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h97902348b896d545: (a: number, b: number, c: any) => any;
  readonly wasm_bindgen__convert__closures_____invoke__h856817fbb35ed73f: (a: number, b: number) => void;
  readonly wasm_bindgen__closure__destroy__hbafa2d432ab2eff4: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h8292ee2c618d9391: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__h451fb53ae0a6ee3b: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h4f9595e0e4940b3f: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__h66754e8be2e33a44: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h4de3c12abbdf6cad: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
