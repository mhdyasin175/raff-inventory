import { getLang, t } from '../i18n';

export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';
const BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'raff.token';

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string[]>;
  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable: session-only */ }
  },
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

/** Minutes ahead of UTC, so the server groups days in the user's local time. */
export const tzOffset = () => -new Date().getTimezoneOffset();

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: any = null;
  try { body = await res.json(); } catch { /* not json */ }

  if (body?.errors && typeof body.errors === 'object') {
    // ASP.NET Core validation problem: { errors: { Field: ["msg"] } }
    const fieldErrors: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(body.errors)) {
      const key = k.replace(/^\$\./, '');
      fieldErrors[key.charAt(0).toLowerCase() + key.slice(1)] = v as string[];
    }
    const first = Object.values(fieldErrors)[0]?.[0];
    // Server validation texts are Arabic constants; in English show a generic line instead.
    const msg = getLang() === 'ar' && first ? first : t('common.invalidFields');
    return new ApiError(res.status, msg, getLang() === 'ar' ? fieldErrors : {});
  }
  const fallback =
    res.status === 403 ? t('err.forbidden')
    : res.status === 404 ? t('err.notFound')
    : res.status >= 500 ? t('err.server')
    : t('err.generic');
  return new ApiError(res.status, body?.title ?? fallback);
}

export async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const token = tokenStore.get();
  const init: RequestInit = {
    method,
    headers: {
      'Accept-Language': getLang(),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  let res: Response;
  try {
    res = IS_DEMO
      ? await (await import('./demo/server')).demoFetch(url, init) // demo code is only bundled-in lazily
      : await fetch(url, init);
  } catch {
    throw new ApiError(0, t('err.network'));
  }

  if (res.status === 401 && !path.endsWith('/auth/login')) {
    tokenStore.set(null);
    onUnauthorized();
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;

  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}

export async function download(path: string, query: Query, fallbackName: string) {
  const blob = await request<Blob>('GET', path, { query });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fallbackName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path),
};
