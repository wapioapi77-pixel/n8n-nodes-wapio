import type {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  IHttpRequestMethods,
  IHttpRequestOptions,
  ILoadOptionsFunctions,
  IWebhookFunctions,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';
import { randomUUID } from 'node:crypto';

type WapioContext =
  | IExecuteFunctions
  | IHookFunctions
  | ILoadOptionsFunctions
  | IWebhookFunctions;

export type WapioCredentialType = 'wapioApi' | 'none';

interface WapioRequestOptions {
  body?: IDataObject;
  qs?: IDataObject;
  headers?: IDataObject;
  sessionId?: string;
}

interface WapioRetrySettings {
  retryOnFail: boolean;
  maxRetries: number;
}

const retryableStatusCodes = new Set([408, 429, 500, 502, 503, 504]);
const maxRetryAfterSeconds = 60;
const defaultRetrySettings: WapioRetrySettings = {
  retryOnFail: true,
  maxRetries: 5,
};

function normalizeBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl ?? 'https://api.wapio.io').trim().replace(/\/+$/, '');
  return trimmed;
}

export async function wapioApiRequest(
  this: WapioContext,
  credentialType: WapioCredentialType,
  method: IHttpRequestMethods,
  endpoint: string,
  options: WapioRequestOptions = {},
) {
  const requestOptions = await createRequestOptions.call(this, method, endpoint, options);

  if (credentialType === 'none') {
    return await executeRequestWithRetry.call(this, method, endpoint, async () => {
      return await this.helpers.httpRequest.call(this, requestOptions);
    });
  }

  return await executeRequestWithRetry.call(this, method, endpoint, async () => {
    return await this.helpers.httpRequestWithAuthentication.call(
      this,
      'wapioApi',
      requestOptions,
    );
  });
}

async function createRequestOptions(
  this: WapioContext,
  method: IHttpRequestMethods,
  endpoint: string,
  options: WapioRequestOptions = {},
): Promise<IHttpRequestOptions> {
  const credentials = (await this.getCredentials('wapioApi')) as {
    apiKey?: string;
    baseUrl?: string;
  };

  const baseUrl = normalizeBaseUrl(credentials.baseUrl);
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const requestOptions: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${cleanEndpoint}`,
    headers: {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
    json: true,
  };

  if (requiresIdempotencyKey(method, endpoint)) {
    requestOptions.headers = {
      ...requestOptions.headers,
      'Idempotency-Key': randomUUID(),
    };
  }

  if (options.body && Object.keys(options.body).length > 0) {
    requestOptions.body = options.body;
  }

  if (options.qs && Object.keys(options.qs).length > 0) {
    requestOptions.qs = options.qs;
  }

  return requestOptions;
}

async function executeRequestWithRetry<T>(
  this: WapioContext,
  method: IHttpRequestMethods,
  endpoint: string,
  requestExecutor: () => Promise<T>,
): Promise<T> {
  const retrySettings = getRetrySettings.call(this);
  let attempt = 0;

  while (true) {
    try {
      return await requestExecutor();
    } catch (error) {
      const requestError = getRequestError(error);
      if (!retrySettings.retryOnFail || !canRetryRequest(method, endpoint) || attempt >= retrySettings.maxRetries) {
        throw new NodeApiError(this.getNode(), error as JsonObject);
      }

      const statusCode = requestError.statusCode ?? requestError.response?.status;
      if (!retryableStatusCodes.has(Number(statusCode))) {
        throw new NodeApiError(this.getNode(), error as JsonObject);
      }

      attempt++;
      const retryAfterHeader = requestError.response?.headers?.['retry-after'];
      let delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);

      if (retryAfterHeader) {
        const seconds = parseInt(String(retryAfterHeader), 10);
        if (!isNaN(seconds) && seconds > 0 && seconds <= maxRetryAfterSeconds) {
          delayMs = seconds * 1000;
        }
      }

      await sleep(delayMs);
    }
  }
}

type RequestError = {
  statusCode?: unknown;
  response?: {
    status?: unknown;
    headers?: Record<string, unknown>;
  };
};

function getRequestError(error: unknown): RequestError {
  return typeof error === 'object' && error !== null ? (error as RequestError) : {};
}

function canRetryRequest(method: IHttpRequestMethods, endpoint: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    return true;
  }

  return method === 'POST' && (endpoint === '/api/send-message' || endpoint === '/v1/whatsapp-sessions');
}

function requiresIdempotencyKey(method: IHttpRequestMethods, endpoint: string): boolean {
  return method === 'POST' && (endpoint === '/api/send-message' || endpoint === '/v1/whatsapp-sessions');
}

function getRetrySettings(this: WapioContext): WapioRetrySettings {
  const retryOnFail = this.getNodeParameter('retryOnFail', 0) as boolean;
  return { retryOnFail: Boolean(retryOnFail), maxRetries: defaultRetrySettings.maxRetries };
}
