/**
 * Test double for XMLHttpRequest, records every request and lets tests
 * script responses. Used by cds-client unit tests and the legacy smoke run.
 */

export interface IRecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  withCredentials: boolean;
}

export interface IScriptedResponse {
  status: number;
  responseText?: string;
  headers?: Record<string, string>;
  /** Fire ontimeout instead of onload (a hung connection hitting xhr.timeout). */
  timedOut?: boolean;
}

type Responder = (request: IRecordedRequest) => IScriptedResponse | undefined;

export class FakeXhrServer {
  readonly requests: IRecordedRequest[] = [];
  private readonly responders: Responder[] = [];
  private originalXhr?: typeof XMLHttpRequest;

  /** Registers a responder; the first one returning a response wins. */
  respondWith(responder: Responder): void {
    this.responders.push(responder);
  }

  /** Convenience: respond to every request with one scripted response. */
  respondAlways(response: IScriptedResponse): void {
    this.respondWith(() => response);
  }

  resolve(request: IRecordedRequest): IScriptedResponse {
    for (const responder of this.responders) {
      const response = responder(request);
      if (response) {
        return response;
      }
    }
    return { status: 404, responseText: `No fake response for ${request.method} ${request.url}` };
  }

  install(): void {
    this.originalXhr = globalThis.XMLHttpRequest;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the fake XHR class below closes over the server instance
    const server = this;

    class FakeXMLHttpRequest {
      withCredentials = false;
      status = 0;
      responseText = "";
      timeout = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      private method = "";
      private url = "";
      private headers: Record<string, string> = {};
      private responseHeaders: Record<string, string> = {};

      open(method: string, url: string): void {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(name: string, value: string): void {
        this.headers[name] = value;
      }

      getResponseHeader(name: string): string | null {
        return this.responseHeaders[name] ?? null;
      }

      send(body?: string): void {
        const recorded: IRecordedRequest = {
          method: this.method,
          url: this.url,
          headers: this.headers,
          body: body ?? undefined,
          withCredentials: this.withCredentials,
        };
        server.requests.push(recorded);
        const response = server.resolve(recorded);
        // Async like the real thing, so promise plumbing is exercised.
        queueMicrotask(() => {
          if (response.timedOut) {
            this.ontimeout?.();
            return;
          }
          this.status = response.status;
          this.responseText = response.responseText ?? "";
          this.responseHeaders = response.headers ?? {};
          this.onload?.();
        });
      }
    }

    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  }

  uninstall(): void {
    if (this.originalXhr) {
      globalThis.XMLHttpRequest = this.originalXhr;
    }
  }

  get lastRequest(): IRecordedRequest {
    if (this.requests.length === 0) {
      throw new Error("No requests recorded");
    }
    return this.requests[this.requests.length - 1];
  }
}
