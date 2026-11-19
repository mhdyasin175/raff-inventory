/**
 * In-browser stand-in for the ASP.NET Core API, used only in demo mode (`npm run dev:demo`)
 * so the portfolio can be hosted as a static site. Endpoints, payloads, validation messages
 * and permission rules mirror the real controllers.
 */
import { PERMISSIONS, seedDb, type Db, type DbProduct, type DbMovement } from './seed';
import { EN } from './en';

/** Language of the current request (from Accept-Language), like the real API's request localization. */
let lang: 'ar' | 'en' = 'ar';
/** Translate seed data and messages for English requests; user-entered text passes through. */
const L = (s: string | null | undefined) => (s == null ? s ?? null : lang === 'en' ? EN[s] ?? s : s) as string;

const STORE_KEY = 'raff.demo.db.v1';
let db: Db = load();

function load(): Db {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return seedDb();
}
function save() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* ignore */ }
}

/** When an English client sends back a translated seed value unchanged, keep the stored original. */
const keep = (orig: string | null, incoming: string | null) => (orig != null && incoming != null && L(orig) === incoming ? orig : incoming);

class HttpError extends Error {
  constructor(public status: number, message: string) { super(L(message)); }
}

const json = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const iso = (d: Date | number) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
const DAY = 864e5;

// ------------------------------------------------------------------ helpers
function currentUser(init: RequestInit) {
  const auth = (init.headers as Record<string, string> | undefined)?.Authorization ?? '';
  const id = Number(auth.replace('Bearer demo.', ''));
  const user = db.users.find((u) => u.id === id && u.isActive);
  if (!user) throw new HttpError(401, 'انتهت الجلسة، سجّل الدخول من جديد');
  const role = db.roles.find((r) => r.id === user.roleId)!;
  return { user, role, can: (p: string) => role.permissions.includes(p) };
}

function need(ok: boolean, msg = 'لا تملك صلاحية لهذا الإجراء') {
  if (!ok) throw new HttpError(403, msg);
}

const status = (p: DbProduct) => (p.quantity === 0 ? 'Out' : p.quantity <= p.reorderLevel ? 'Low' : 'Ok');
const lastMove = (pid: number) => {
  let last: string | null = null;
  for (const m of db.movements) if (m.productId === pid && (!last || m.occurredAt > last)) last = m.occurredAt;
  return last;
};
const productDto = (p: DbProduct) => ({
  ...p,
  name: L(p.name),
  unit: L(p.unit),
  categoryName: L(db.categories.find((c) => c.id === p.categoryId)?.name ?? ''),
  stockValue: p.quantity * p.costPrice,
  status: status(p),
  lastMovementAt: lastMove(p.id),
});
const movementDto = (m: DbMovement) => {
  const p = db.products.find((x) => x.id === m.productId)!;
  return {
    ...m, productName: L(p.name), sku: p.sku, unit: L(p.unit), party: L(m.party), note: L(m.note),
    total: Math.abs(m.quantityChange) * m.unitPrice,
    createdBy: L(db.users.find((u) => u.id === m.createdById)?.fullName ?? ''),
  };
};
const paged = <T,>(items: T[], page: number, size: number) => ({
  items: items.slice((page - 1) * size, page * size), total: items.length, page, pageSize: size,
});

/** UTC ms bounds of a local calendar day given the client's tz offset in minutes. */
const dayStartUtc = (d: string, tz: number) => Date.parse(`${d}T00:00:00Z`) - tz * 6e4;
const localDate = (ms: number, tz: number) => new Date(ms + tz * 6e4).toISOString().slice(0, 10);

function filterMovements(q: URLSearchParams) {
  const tz = Number(q.get('tz') ?? 0);
  let list = db.movements;
  const type = q.get('type'); if (type) list = list.filter((m) => m.type === type);
  const pid = Number(q.get('productId')); if (pid) list = list.filter((m) => m.productId === pid);
  const from = q.get('from'); if (from) list = list.filter((m) => Date.parse(m.occurredAt) >= dayStartUtc(from, tz));
  const to = q.get('to'); if (to) list = list.filter((m) => Date.parse(m.occurredAt) < dayStartUtc(to, tz) + DAY);
  const s = q.get('search')?.trim();
  if (s) list = list.filter((m) => {
    const p = db.products.find((x) => x.id === m.productId)!;
    return [p.name, L(p.name), p.sku, m.party, L(m.party), m.reference].some((v) => v?.toLowerCase().includes(s.toLowerCase()));
  });
  return [...list].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id);
}

function rangeSummary(startMs: number, endMs: number) {
  const r = { movements: 0, unitsIn: 0, unitsOut: 0, purchasesValue: 0, revenue: 0, grossProfit: 0 };
  for (const m of db.movements) {
    const t = Date.parse(m.occurredAt);
    if (t < startMs || t >= endMs) continue;
    r.movements++;
    if (m.type === 'In') { r.unitsIn += m.quantityChange; r.purchasesValue += m.quantityChange * m.unitPrice; }
    if (m.type === 'Out') {
      const cost = db.products.find((p) => p.id === m.productId)!.costPrice;
      r.unitsOut -= m.quantityChange; r.revenue -= m.quantityChange * m.unitPrice;
      r.grossProfit -= m.quantityChange * (m.unitPrice - cost);
    }
  }
  return r;
}

function trend(from: string, to: string, tz: number) {
  const days: Record<string, { unitsIn: number; unitsOut: number; valueIn: number; valueOut: number }> = {};
  const start = dayStartUtc(from, tz), end = dayStartUtc(to, tz) + DAY;
  for (const m of db.movements) {
    const t = Date.parse(m.occurredAt);
    if (t < start || t >= end || m.type === 'Adjustment') continue;
    const d = (days[localDate(t, tz)] ??= { unitsIn: 0, unitsOut: 0, valueIn: 0, valueOut: 0 });
    if (m.type === 'In') { d.unitsIn += m.quantityChange; d.valueIn += m.quantityChange * m.unitPrice; }
    else { d.unitsOut -= m.quantityChange; d.valueOut -= m.quantityChange * m.unitPrice; }
  }
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, ...(days[date] ?? { unitsIn: 0, unitsOut: 0, valueIn: 0, valueOut: 0 }) });
  }
  return out;
}

// ------------------------------------------------------------------ router
type Handler = (ctx: { q: URLSearchParams; body: any; init: RequestInit; params: string[] }) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '(\\d+)')}$`), h]);

on('POST', '/api/auth/login', ({ body }) => {
  const u = db.users.find((x) => x.username === String(body?.username ?? '').trim().toLowerCase());
  if (!u || u.password !== body?.password) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  if (!u.isActive) throw new HttpError(403, 'هذا الحساب موقوف، تواصل مع مدير النظام');
  u.lastLoginAt = iso(Date.now()); save();
  const role = db.roles.find((r) => r.id === u.roleId)!;
  return { token: `demo.${u.id}`, expiresAt: iso(Date.now() + 8 * 36e5),
    user: { id: u.id, fullName: L(u.fullName), username: u.username, role: L(role.name), permissions: role.permissions } };
});

on('GET', '/api/auth/me', ({ init }) => {
  const { user, role } = currentUser(init);
  return { id: user.id, fullName: L(user.fullName), username: user.username, role: L(role.name), permissions: role.permissions };
});

// ---- categories
on('GET', '/api/categories', ({ init }) => {
  need(currentUser(init).can('products.view'));
  return db.categories.map((c) => {
    const ps = db.products.filter((p) => p.categoryId === c.id && p.isActive);
    return { ...c, name: L(c.name), description: L(c.description), productCount: ps.length, stockValue: ps.reduce((s, p) => s + p.quantity * p.costPrice, 0) };
  }).sort((a, b) => a.name.localeCompare(b.name, lang));
});
on('POST', '/api/categories', ({ init, body }) => {
  need(currentUser(init).can('categories.manage'));
  const name = String(body.name ?? '').trim();
  if (!name) throw new HttpError(400, 'اسم التصنيف مطلوب');
  if (db.categories.some((c) => c.name === name)) throw new HttpError(409, 'يوجد تصنيف بنفس الاسم');
  const c = { id: Math.max(0, ...db.categories.map((x) => x.id)) + 1, name, description: body.description || null };
  db.categories.push(c); save();
  return { ...c, productCount: 0, stockValue: 0 };
});
on('PUT', '/api/categories/:id', ({ init, body, params }) => {
  need(currentUser(init).can('categories.manage'));
  const c = db.categories.find((x) => x.id === +params[0]);
  if (!c) throw new HttpError(404, 'التصنيف غير موجود');
  const name = String(body.name ?? '').trim();
  if (db.categories.some((x) => x.name === keep(c.name, name) && x.id !== c.id)) throw new HttpError(409, 'يوجد تصنيف بنفس الاسم');
  c.name = keep(c.name, name)!; c.description = keep(c.description, body.description || null); save();
  return null;
});
on('DELETE', '/api/categories/:id', ({ init, params }) => {
  need(currentUser(init).can('categories.manage'));
  if (db.products.some((p) => p.categoryId === +params[0]))
    throw new HttpError(409, 'لا يمكن حذف تصنيف يحتوي على منتجات. انقل المنتجات أولاً');
  db.categories = db.categories.filter((c) => c.id !== +params[0]); save();
  return null;
});

// ---- products
on('GET', '/api/products', ({ init, q }) => {
  need(currentUser(init).can('products.view'));
  let list = db.products.filter((p) => q.get('includeInactive') === 'true' || p.isActive);
  const cat = Number(q.get('categoryId')); if (cat) list = list.filter((p) => p.categoryId === cat);
  const s = q.get('search')?.trim();
  if (s) list = list.filter((p) => p.name.includes(s) || L(p.name).toLowerCase().includes(s.toLowerCase())
    || p.sku.includes(s.toUpperCase()) || p.location?.includes(s.toUpperCase()));
  const st = q.get('status');
  if (st === 'out') list = list.filter((p) => p.quantity === 0);
  if (st === 'low') list = list.filter((p) => p.quantity > 0 && p.quantity <= p.reorderLevel);
  if (st === 'attention') list = list.filter((p) => p.quantity <= p.reorderLevel);
  if (st === 'ok') list = list.filter((p) => p.quantity > p.reorderLevel);
  const sort = q.get('sort') ?? 'name';
  const desc = sort.startsWith('-') ? -1 : 1;
  const key = sort.replace('-', '');
  const val = (p: DbProduct): number | string =>
    key === 'sku' ? p.sku : key === 'quantity' ? p.quantity : key === 'value' ? p.quantity * p.costPrice : L(p.name);
  list = [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    return desc * (typeof x === 'number' ? x - (y as number) : x.localeCompare(y as string, lang));
  });
  return paged(list.map(productDto), Number(q.get('page') ?? 1), Number(q.get('pageSize') ?? 20));
});
on('GET', '/api/products/next-sku', ({ q }) => {
  const prefix = (q.get('prefix') ?? 'PRD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'PRD';
  const max = Math.max(100, ...db.products.filter((p) => p.sku.startsWith(prefix + '-')).map((p) => Number(p.sku.split('-')[1]) || 0));
  return { sku: `${prefix}-${String(max + 1).padStart(4, '0')}` };
});
on('GET', '/api/products/:id', ({ init, params }) => {
  need(currentUser(init).can('products.view'));
  const p = db.products.find((x) => x.id === +params[0]);
  if (!p) throw new HttpError(404, 'المنتج غير موجود');
  return productDto(p);
});
const upsertProduct = (p: DbProduct, body: any) => {
  const sku = String(body.sku ?? '').trim().toUpperCase();
  if (!sku) throw new HttpError(400, 'رمز المنتج مطلوب');
  if (!String(body.name ?? '').trim()) throw new HttpError(400, 'اسم المنتج مطلوب');
  if (db.products.some((x) => x.sku === sku && x.id !== p.id)) throw new HttpError(409, lang === 'en' ? `Code ${sku} is used by another product` : `الرمز ${sku} مستخدم لمنتج آخر`);
  Object.assign(p, {
    sku, name: keep(p.name ?? null, body.name.trim()), categoryId: +body.categoryId, unit: keep(p.unit ?? null, body.unit.trim()),
    location: body.location ? String(body.location).trim().toUpperCase() : null,
    costPrice: +body.costPrice, salePrice: +body.salePrice, reorderLevel: +body.reorderLevel, isActive: !!body.isActive,
  });
};
on('POST', '/api/products', ({ init, body }) => {
  const { user, can } = currentUser(init); need(can('products.manage'));
  const p: DbProduct = { id: Math.max(0, ...db.products.map((x) => x.id)) + 1, quantity: 0, createdAt: iso(Date.now()) } as DbProduct;
  upsertProduct(p, body);
  db.products.push(p);
  if (+body.openingQuantity > 0) {
    p.quantity = +body.openingQuantity;
    db.movements.push({ id: Math.max(0, ...db.movements.map((m) => m.id)) + 1, productId: p.id, type: 'In',
      quantityChange: p.quantity, balanceAfter: p.quantity, unitPrice: p.costPrice, party: null, reference: null,
      note: 'رصيد افتتاحي', occurredAt: iso(Date.now()), createdById: user.id });
  }
  save();
  return productDto(p);
});
on('PUT', '/api/products/:id', ({ init, body, params }) => {
  need(currentUser(init).can('products.manage'));
  const p = db.products.find((x) => x.id === +params[0]);
  if (!p) throw new HttpError(404, 'المنتج غير موجود');
  upsertProduct(p, body); save();
  return productDto(p);
});
on('DELETE', '/api/products/:id', ({ init, params }) => {
  need(currentUser(init).can('products.manage'));
  const p = db.products.find((x) => x.id === +params[0]);
  if (!p) throw new HttpError(404, 'المنتج غير موجود');
  const archived = db.movements.some((m) => m.productId === p.id);
  if (archived) p.isActive = false; else db.products = db.products.filter((x) => x !== p);
  save();
  return { archived };
});

// ---- movements
on('GET', '/api/movements', ({ init, q }) => {
  need(currentUser(init).can('movements.view'));
  return paged(filterMovements(q).map(movementDto), Number(q.get('page') ?? 1), Number(q.get('pageSize') ?? 25));
});
on('GET', '/api/movements/export', ({ init, q }) => {
  need(currentUser(init).can('reports.view'));
  const tz = Number(q.get('tz') ?? 0);
  const names = lang === 'en'
    ? { In: 'In', Out: 'Out', Adjustment: 'Adjustment' } as const
    : { In: 'إدخال', Out: 'إخراج', Adjustment: 'تسوية' } as const;
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = filterMovements(q).map(movementDto).map((m) => [
    new Date(Date.parse(m.occurredAt) + tz * 6e4).toISOString().slice(0, 16).replace('T', ' '),
    names[m.type], m.sku, m.productName, m.quantityChange, m.unit, m.unitPrice.toFixed(2), m.total.toFixed(2),
    m.balanceAfter, m.party, m.reference, m.note, m.createdBy,
  ].map(esc).join(','));
  const header = lang === 'en'
    ? 'Date,Type,Code,Product,Quantity,Unit,Unit price,Total,Balance after,Party,Reference,Notes,User'
    : 'التاريخ,النوع,الرمز,المنتج,الكمية,الوحدة,سعر الوحدة,الإجمالي,الرصيد بعد,الجهة,المرجع,ملاحظات,المستخدم';
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8' } });
});
on('POST', '/api/movements', ({ init, body }) => {
  const { user, can } = currentUser(init);
  const perm = body.type === 'In' ? 'movements.in' : body.type === 'Out' ? 'movements.out' : 'movements.adjust';
  need(can(perm), 'لا تملك صلاحية تسجيل هذا النوع من الحركات');
  const p = db.products.find((x) => x.id === +body.productId);
  if (!p) throw new HttpError(404, 'المنتج غير موجود');
  if (!p.isActive) throw new HttpError(400, 'المنتج مؤرشف، أعد تفعيله قبل تسجيل حركات عليه');
  const qty = Number(body.quantity);
  let change: number;
  if (body.type === 'Adjustment') {
    change = qty - p.quantity;
    if (change === 0) throw new HttpError(400, 'الكمية المعدودة مطابقة للرصيد، لا حاجة لتسوية');
    if (!body.note?.trim()) throw new HttpError(400, 'اكتب سبب التسوية في الملاحظات');
  } else {
    if (!(qty > 0)) throw new HttpError(400, 'أدخل كمية أكبر من صفر');
    if (body.type === 'Out' && qty > p.quantity) throw new HttpError(400, lang === 'en' ? `Only ${p.quantity} ${L(p.unit)} available` : `الكمية المتوفرة ${p.quantity} ${p.unit} فقط`);
    change = body.type === 'Out' ? -qty : qty;
  }
  const at = body.occurredAt ? Date.parse(body.occurredAt) : Date.now();
  if (at > Date.now() + 5 * 6e4) throw new HttpError(400, 'لا يمكن تسجيل حركة بتاريخ مستقبلي');
  p.quantity += change;
  const m: DbMovement = {
    id: Math.max(0, ...db.movements.map((x) => x.id)) + 1, productId: p.id, type: body.type,
    quantityChange: change, balanceAfter: p.quantity,
    unitPrice: body.unitPrice ?? (body.type === 'Out' ? p.salePrice : p.costPrice),
    party: body.party?.trim() || null, reference: body.reference?.trim() || null, note: body.note?.trim() || null,
    occurredAt: iso(at), createdById: user.id,
  };
  db.movements.push(m); save();
  return movementDto(m);
});

// ---- dashboard
on('GET', '/api/dashboard/summary', ({ init, q }) => {
  need(currentUser(init).can('dashboard.view'));
  const tz = Number(q.get('tz') ?? 0);
  const act = db.products.filter((p) => p.isActive);
  const now = Date.now();
  const todayStart = dayStartUtc(localDate(now, tz), tz);
  const l30 = rangeSummary(now - 30 * DAY, now), p30 = rangeSummary(now - 60 * DAY, now - 30 * DAY);
  return {
    activeProducts: act.length,
    totalUnits: act.reduce((s, p) => s + p.quantity, 0),
    stockValueCost: act.reduce((s, p) => s + p.quantity * p.costPrice, 0),
    stockValueSale: act.reduce((s, p) => s + p.quantity * p.salePrice, 0),
    lowStockCount: act.filter((p) => p.quantity > 0 && p.quantity <= p.reorderLevel).length,
    outOfStockCount: act.filter((p) => p.quantity === 0).length,
    movementsToday: db.movements.filter((m) => Date.parse(m.occurredAt) >= todayStart).length,
    salesLast30: l30.revenue, salesPrev30: p30.revenue, unitsOutLast30: l30.unitsOut, unitsInLast30: l30.unitsIn,
  };
});
on('GET', '/api/dashboard/trend', ({ init, q }) => {
  need(currentUser(init).can('dashboard.view'));
  const tz = Number(q.get('tz') ?? 0), days = Number(q.get('days') ?? 30);
  const to = localDate(Date.now(), tz);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY).toISOString().slice(0, 10);
  return trend(from, to, tz);
});
on('GET', '/api/dashboard/low-stock', ({ init, q }) => {
  need(currentUser(init).can('dashboard.view'));
  return db.products.filter((p) => p.isActive && p.quantity <= p.reorderLevel)
    .sort((a, b) => a.quantity / a.reorderLevel - b.quantity / b.reorderLevel)
    .slice(0, Number(q.get('take') ?? 8))
    .map((p) => ({ productId: p.id, sku: p.sku, name: L(p.name), unit: L(p.unit), quantity: p.quantity, reorderLevel: p.reorderLevel, location: p.location }));
});
on('GET', '/api/dashboard/recent', ({ init, q }) => {
  need(currentUser(init).can('dashboard.view'));
  return filterMovements(new URLSearchParams()).slice(0, Number(q.get('take') ?? 8)).map(movementDto);
});

// ---- reports
const bounds = (q: URLSearchParams) => {
  const tz = Number(q.get('tz') ?? 0);
  return { tz, from: q.get('from')!, to: q.get('to')!, start: dayStartUtc(q.get('from')!, tz), end: dayStartUtc(q.get('to')!, tz) + DAY };
};
on('GET', '/api/reports/summary', ({ init, q }) => {
  need(currentUser(init).can('reports.view'));
  const b = bounds(q); return rangeSummary(b.start, b.end);
});
on('GET', '/api/reports/trend', ({ init, q }) => {
  need(currentUser(init).can('reports.view'));
  const b = bounds(q); return trend(b.from, b.to, b.tz);
});
on('GET', '/api/reports/category-value', ({ init }) => {
  need(currentUser(init).can('reports.view'));
  return db.categories.map((c) => {
    const ps = db.products.filter((p) => p.categoryId === c.id && p.isActive);
    return { categoryId: c.id, category: L(c.name), stockValue: ps.reduce((s, p) => s + p.quantity * p.costPrice, 0),
      units: ps.reduce((s, p) => s + p.quantity, 0), products: ps.length };
  }).sort((a, b) => b.stockValue - a.stockValue);
});
on('GET', '/api/reports/top-products', ({ init, q }) => {
  need(currentUser(init).can('reports.view'));
  const b = bounds(q);
  const agg = new Map<number, { unitsOut: number; revenue: number }>();
  for (const m of db.movements) {
    const t = Date.parse(m.occurredAt);
    if (m.type !== 'Out' || t < b.start || t >= b.end) continue;
    const a = agg.get(m.productId) ?? { unitsOut: 0, revenue: 0 };
    a.unitsOut -= m.quantityChange; a.revenue -= m.quantityChange * m.unitPrice;
    agg.set(m.productId, a);
  }
  const by = q.get('by') === 'units' ? 'unitsOut' : 'revenue';
  return [...agg.entries()].map(([id, a]) => {
    const p = db.products.find((x) => x.id === id)!;
    return { productId: id, sku: p.sku, name: L(p.name), unit: L(p.unit), ...a };
  }).sort((x, y) => y[by] - x[by]).slice(0, Number(q.get('take') ?? 10));
});

// ---- users & roles
const userDto = (u: Db['users'][number]) => {
  const { password: _pw, ...rest } = u;
  return { ...rest, fullName: L(rest.fullName), roleName: L(db.roles.find((r) => r.id === u.roleId)?.name ?? '') };
};
on('GET', '/api/users', ({ init }) => {
  need(currentUser(init).can('users.manage'));
  return [...db.users].sort((a, b) => Number(b.isActive) - Number(a.isActive) || L(a.fullName).localeCompare(L(b.fullName), lang)).map(userDto);
});
on('POST', '/api/users', ({ init, body }) => {
  need(currentUser(init).can('users.manage'));
  const username = String(body.username ?? '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) throw new HttpError(400, 'اسم المستخدم: أحرف إنجليزية وأرقام فقط (3 أحرف على الأقل)');
  if (String(body.password ?? '').length < 8) throw new HttpError(400, 'كلمة المرور 8 أحرف على الأقل');
  if (db.users.some((u) => u.username === username)) throw new HttpError(409, 'اسم المستخدم محجوز');
  const u = { id: Math.max(0, ...db.users.map((x) => x.id)) + 1, fullName: body.fullName.trim(), username, password: body.password,
    roleId: +body.roleId, isActive: true, createdAt: iso(Date.now()), lastLoginAt: null };
  db.users.push(u); save();
  return userDto(u);
});
on('PUT', '/api/users/:id', ({ init, body, params }) => {
  const { user: me, can } = currentUser(init); need(can('users.manage'));
  const u = db.users.find((x) => x.id === +params[0]);
  if (!u) throw new HttpError(404, 'المستخدم غير موجود');
  const isSys = (roleId: number) => db.roles.find((r) => r.id === roleId)?.isSystem;
  if (isSys(u.roleId) && u.isActive && (!body.isActive || !isSys(+body.roleId))
      && !db.users.some((x) => x.id !== u.id && x.isActive && isSys(x.roleId)))
    throw new HttpError(409, 'هذا آخر مدير نظام فعّال، لا يمكن إيقافه أو تغيير دوره');
  if (u.id === me.id && !body.isActive) throw new HttpError(409, 'لا يمكنك إيقاف حسابك بنفسك');
  if (body.newPassword && body.newPassword.length < 8) throw new HttpError(400, 'كلمة المرور 8 أحرف على الأقل');
  Object.assign(u, { fullName: keep(u.fullName, body.fullName.trim()), roleId: +body.roleId, isActive: !!body.isActive });
  if (body.newPassword) u.password = body.newPassword;
  save();
  return null;
});
on('GET', '/api/roles', ({ init }) => {
  const { can } = currentUser(init); need(can('roles.manage') || can('users.manage'));
  return db.roles.map((r) => ({ ...r, name: L(r.name), description: L(r.description), userCount: db.users.filter((u) => u.roleId === r.id).length }));
});
on('GET', '/api/roles/permissions', ({ init }) => {
  need(currentUser(init).can('roles.manage'));
  return PERMISSIONS;
});
on('POST', '/api/roles', ({ init, body }) => {
  need(currentUser(init).can('roles.manage'));
  const name = String(body.name ?? '').trim();
  if (!name) throw new HttpError(400, 'اسم الدور مطلوب');
  if (db.roles.some((r) => r.name === name)) throw new HttpError(409, 'يوجد دور بنفس الاسم');
  const r = { id: Math.max(0, ...db.roles.map((x) => x.id)) + 1, name, description: body.description || null, isSystem: false, permissions: [...new Set<string>(body.permissions)] };
  db.roles.push(r); save();
  return { ...r, userCount: 0 };
});
on('PUT', '/api/roles/:id', ({ init, body, params }) => {
  need(currentUser(init).can('roles.manage'));
  const r = db.roles.find((x) => x.id === +params[0]);
  if (!r) throw new HttpError(404, 'الدور غير موجود');
  if (r.isSystem && !PERMISSIONS.every((p) => body.permissions.includes(p.key)))
    throw new HttpError(409, 'دور مدير النظام يملك كل الصلاحيات دائماً ولا يمكن تقييده');
  Object.assign(r, { name: keep(r.name, body.name.trim()), description: keep(r.description, body.description || null), permissions: [...new Set<string>(body.permissions)] });
  save();
  return null;
});
on('DELETE', '/api/roles/:id', ({ init, params }) => {
  need(currentUser(init).can('roles.manage'));
  const r = db.roles.find((x) => x.id === +params[0]);
  if (!r) throw new HttpError(404, 'الدور غير موجود');
  if (r.isSystem) throw new HttpError(409, 'لا يمكن حذف دور النظام');
  if (db.users.some((u) => u.roleId === r.id)) throw new HttpError(409, 'هذا الدور مسند لمستخدمين. انقلهم لدور آخر أولاً');
  db.roles = db.roles.filter((x) => x !== r); save();
  return null;
});

export async function demoFetch(url: string, init: RequestInit): Promise<Response> {
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180)); // feel like a network
  const u = new URL(url, 'http://demo.local');
  const method = (init.method ?? 'GET').toUpperCase();
  lang = (init.headers as Record<string, string> | undefined)?.['Accept-Language'] === 'en' ? 'en' : 'ar';
  const body = init.body ? JSON.parse(String(init.body)) : undefined;

  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = u.pathname.match(re);
    if (!match) continue;
    try {
      const result = handler({ q: u.searchParams, body, init, params: match.slice(1) });
      if (result instanceof Response) return result;
      return result === null ? json(null, 204) : json(result);
    } catch (e) {
      if (e instanceof HttpError) return json({ status: e.status, title: e.message }, e.status);
      console.error(e);
      return json({ status: 500, title: 'حدث خطأ غير متوقع' }, 500);
    }
  }
  return json({ status: 404, title: 'المسار غير موجود' }, 404);
}
