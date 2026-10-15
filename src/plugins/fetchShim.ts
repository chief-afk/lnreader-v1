import { parse as parseProto } from 'protobufjs';

import {
  cloudflareCheck,
  defaultUserAgentString,
  fetchApi as fetchApiV1,
} from '../utils/fetch/fetch';

/**
 * Positional-signature fetch shims for plugin dists. They delegate to
 * the v1 fetch wrapper (UA injection + cloudflare check + the shared
 * Android cookie jar) and decide success the way v1 does: a response
 * body that passes cloudflareCheck is success.
 */

interface FetchShimInit {
  headers?: Record<string, string> | Headers;
  method?: string;
  body?: FormData | string | Uint8Array;
  [key: string]: unknown;
}

// Mirrors upstream's default header helper, with v1's UA string.
const DEFAULT_HEADERS: Record<string, string> = {
  'Connection': 'keep-alive',
  'Accept': '*/*',
  'Accept-Language': '*',
  'Sec-Fetch-Mode': 'cors',
  'Accept-Encoding': 'gzip, deflate',
  'Cache-Control': 'max-age=0',
  'User-Agent': defaultUserAgentString,
};

const makeInit = (init?: FetchShimInit): RequestInit => {
  const merged: FetchShimInit = { ...init };
  if (merged.headers instanceof Headers) {
    if (!merged.headers.get('User-Agent')) {
      merged.headers.set('User-Agent', DEFAULT_HEADERS['User-Agent']);
    }
  } else {
    merged.headers = {
      ...DEFAULT_HEADERS,
      ...merged.headers,
    };
  }
  return merged as RequestInit;
};

export const fetchApi = async (
  url: string,
  init?: FetchShimInit,
): Promise<Response> => fetchApiV1({ url, init: makeInit(init) });

export const fetchText = async (
  url: string,
  init?: FetchShimInit,
  // RN's fetch decodes text as UTF-8; v1 has no other decoder either.
  _encoding?: string,
): Promise<string> => {
  const res = await fetchApi(url, init);
  const text = await res.text();
  // Never silently return an empty string on a cloudflare interstitial.
  cloudflareCheck(text);
  return text;
};

interface ProtoRequestInit {
  /** merged .proto file */
  proto: string;
  requestType: string;
  requestData?: unknown;
  responseType: string;
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const base64ToBytes = (base64: string): Uint8Array => {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    let value = 0;
    let chars = 0;
    for (const char of clean.slice(i, i + 4)) {
      if (char === '=') {
        break;
      }
      value = (value << 6) | BASE64_ALPHABET.indexOf(char);
      chars++;
    }
    if (chars === 4) {
      bytes.push((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
    } else if (chars === 3) {
      bytes.push((value >> 10) & 0xff, (value >> 2) & 0xff);
    } else if (chars === 2) {
      bytes.push((value >> 4) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
};

const readBlobAsBytes = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(base64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1)));
    };
    reader.onerror = () => reject(new Error('Failed to read proto response'));
    reader.onabort = () => reject(new Error('Failed to read proto response'));
    reader.readAsDataURL(blob);
  });

/**
 * gRPC-web style protobuf request/response, re-implemented from
 * upstream's plugin fetch helper on top of the v1 fetch wrapper.
 */
export const fetchProto = async (
  protoInit: ProtoRequestInit,
  url: string,
  init?: FetchShimInit,
): Promise<unknown> => {
  const protoRoot = parseProto(protoInit.proto).root;
  const requestMessage = protoRoot.lookupType(protoInit.requestType);
  const requestData = protoInit.requestData as Record<string, unknown>;
  if (requestMessage.verify(requestData)) {
    throw new Error('Invalid Proto');
  }
  const encodedRequest = requestMessage.encode(requestData).finish();
  const requestLength = encodedRequest.length;
  const header = new Uint8Array(5);
  header[0] = 0;
  header[1] = (requestLength >>> 24) & 0xff;
  header[2] = (requestLength >>> 16) & 0xff;
  header[3] = (requestLength >>> 8) & 0xff;
  header[4] = requestLength & 0xff;

  const body = new Uint8Array(header.length + encodedRequest.length);
  body.set(header, 0);
  body.set(encodedRequest, header.length);

  const res = await fetchApi(url, {
    ...init,
    method: 'POST',
    body,
  });
  const payload = await readBlobAsBytes(await res.blob());
  const responseLength =
    ((payload[1] << 24) |
      (payload[2] << 16) |
      (payload[3] << 8) |
      payload[4]) >>>
    0;
  const responseMessage = protoRoot.lookupType(protoInit.responseType);
  return responseMessage.decode(payload.slice(5, 5 + responseLength));
};
