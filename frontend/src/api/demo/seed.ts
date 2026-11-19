/**
 * Demo-mode data. Mirrors backend/Raff.Api/Data/DbSeeder.cs so the static demo
 * (no server) looks like a real installation.
 */
import type { MovementType } from '../types';
import { withCheckDigit } from '../../lib/barcode';

export interface DbCategory { id: number; name: string; description: string | null }
export interface DbProduct {
  id: number; sku: string; barcode: string | null; name: string; categoryId: number; unit: string; location: string | null;
  costPrice: number; salePrice: number; reorderLevel: number; isActive: boolean; createdAt: string;
}
export interface DbWarehouse { id: number; code: string; name: string; address: string | null; isActive: boolean }
/** On-hand quantity of one product in one warehouse. */
export interface DbLevel { productId: number; warehouseId: number; quantity: number }
export interface DbMovement {
  id: number; productId: number; warehouseId: number; type: MovementType; quantityChange: number; balanceAfter: number;
  unitPrice: number; party: string | null; reference: string | null; note: string | null;
  occurredAt: string; createdById: number;
  counterpartWarehouseId: number | null; transferId: string | null;
}
export interface DbRole { id: number; name: string; description: string | null; isSystem: boolean; permissions: string[] }
export interface DbUser {
  id: number; fullName: string; username: string; password: string; roleId: number;
  isActive: boolean; createdAt: string; lastLoginAt: string | null; warehouseId: number | null;
}
export interface Db {
  categories: DbCategory[]; products: DbProduct[]; movements: DbMovement[]; roles: DbRole[]; users: DbUser[];
  warehouses: DbWarehouse[]; levels: DbLevel[];
}

export const PERMISSIONS = [
  { key: 'dashboard.view', group: 'لوحة التحكم', label: 'عرض لوحة التحكم' },
  { key: 'products.view', group: 'المنتجات', label: 'عرض المنتجات' },
  { key: 'products.manage', group: 'المنتجات', label: 'إضافة وتعديل المنتجات' },
  { key: 'categories.manage', group: 'المنتجات', label: 'إدارة التصنيفات' },
  { key: 'movements.view', group: 'الحركات', label: 'عرض سجل الحركات' },
  { key: 'movements.in', group: 'الحركات', label: 'تسجيل إدخال' },
  { key: 'movements.out', group: 'الحركات', label: 'تسجيل إخراج' },
  { key: 'movements.adjust', group: 'الحركات', label: 'تسوية الجرد' },
  { key: 'movements.transfer', group: 'الحركات', label: 'نقل بين المستودعات' },
  { key: 'reports.view', group: 'التقارير', label: 'عرض التقارير والتصدير' },
  { key: 'warehouses.manage', group: 'الإدارة', label: 'إدارة المستودعات' },
  { key: 'users.manage', group: 'الإدارة', label: 'إدارة المستخدمين' },
  { key: 'roles.manage', group: 'الإدارة', label: 'إدارة الأدوار والصلاحيات' },
];

/** Small deterministic PRNG (mulberry32) so every demo visitor sees the same history. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Item = [cat: string, prefix: string, name: string, unit: string, cost: number, margin: number, reorder: number, demand: number];

const ITEMS: Item[] = [
  ['كهربائيات', 'ELC', 'كابل نحاس 2.5 مم - لفة 100 م', 'لفة', 38, 0.22, 15, 3],
  ['كهربائيات', 'ELC', 'كابل نحاس 1.5 مم - لفة 100 م', 'لفة', 24, 0.22, 15, 3],
  ['كهربائيات', 'ELC', 'قاطع كهربائي 16 أمبير', 'قطعة', 3.2, 0.35, 40, 9],
  ['كهربائيات', 'ELC', 'قاطع كهربائي 32 أمبير', 'قطعة', 4.1, 0.35, 30, 5],
  ['كهربائيات', 'ELC', 'مفتاح إنارة مزدوج أبيض', 'قطعة', 1.1, 0.45, 80, 14],
  ['كهربائيات', 'ELC', 'فيش جداري ثلاثي', 'قطعة', 1.4, 0.45, 80, 12],
  ['كهربائيات', 'ELC', 'علبة توزيع 12 خط', 'قطعة', 9.5, 0.3, 10, 2],
  ['إنارة', 'LGT', 'لمبة LED 12 واط أبيض', 'قطعة', 0.9, 0.6, 120, 25],
  ['إنارة', 'LGT', 'لمبة LED 18 واط أصفر', 'قطعة', 1.3, 0.55, 80, 14],
  ['إنارة', 'LGT', 'كشاف خارجي 50 واط', 'قطعة', 7.8, 0.4, 15, 3],
  ['إنارة', 'LGT', 'شريط LED 5 م مع محول', 'علبة', 5.5, 0.5, 20, 4],
  ['إنارة', 'LGT', 'سبوت سقفي دائري', 'قطعة', 2.2, 0.5, 60, 10],
  ['عدد يدوية', 'HND', 'طقم مفكات 6 قطع', 'طقم', 4.5, 0.45, 12, 2],
  ['عدد يدوية', 'HND', 'زرادية عازلة 8 إنش', 'قطعة', 3.9, 0.45, 12, 2],
  ['عدد يدوية', 'HND', 'شريط قياس 5 م', 'قطعة', 1.6, 0.55, 25, 4],
  ['عدد يدوية', 'HND', 'مطرقة 500 غ', 'قطعة', 3.1, 0.45, 10, 1],
  ['عدد كهربائية', 'PWR', 'دريل شحن 18 فولت', 'قطعة', 42, 0.28, 5, 1],
  ['عدد كهربائية', 'PWR', 'صاروخ جلخ 115 مم', 'قطعة', 28, 0.28, 5, 1],
  ['عدد كهربائية', 'PWR', 'قرص قص معادن 115 مم', 'قطعة', 0.6, 0.7, 100, 18],
  ['عدد كهربائية', 'PWR', 'طقم ريش دريل 13 قطعة', 'طقم', 3.8, 0.5, 15, 3],
  ['سباكة', 'PLB', 'قسطل PPR قطر 20 - 4 م', 'قطعة', 2.4, 0.35, 50, 10],
  ['سباكة', 'PLB', 'كوع PPR قطر 20', 'قطعة', 0.15, 0.9, 300, 45],
  ['سباكة', 'PLB', 'حنفية مطبخ خلاط', 'قطعة', 14, 0.4, 8, 1],
  ['سباكة', 'PLB', 'شريط تفلون', 'قطعة', 0.12, 1, 200, 30],
  ['دهانات', 'PNT', 'دهان بلاستيك أبيض 18 ل', 'سطل', 21, 0.25, 12, 2],
  ['دهانات', 'PNT', 'معجون جدران 20 كغ', 'كيس', 6.5, 0.3, 20, 3],
  ['دهانات', 'PNT', 'فرشاة دهان 3 إنش', 'قطعة', 0.8, 0.6, 40, 6],
  ['دهانات', 'PNT', 'رولة دهان 9 إنش', 'قطعة', 1.7, 0.55, 30, 4],
  ['تثبيت ولواصق', 'FIX', 'براغي خشب 4×40 - علبة 200', 'علبة', 1.9, 0.5, 40, 6],
  ['تثبيت ولواصق', 'FIX', 'فيشر بلاستيك 8 مم - علبة 100', 'علبة', 0.9, 0.6, 50, 8],
  ['تثبيت ولواصق', 'FIX', 'سيليكون شفاف 280 مل', 'قطعة', 1.2, 0.55, 60, 9],
  ['تثبيت ولواصق', 'FIX', 'شريط لاصق عازل كهرباء', 'قطعة', 0.25, 0.8, 150, 20],
];

const CATEGORIES: [string, string][] = [
  ['كهربائيات', 'كابلات، قواطع، مفاتيح وأفياش'],
  ['إنارة', 'لمبات وكشافات وملحقاتها'],
  ['عدد يدوية', 'مفكات، زراديات، مفاتيح ربط'],
  ['عدد كهربائية', 'دريلات، صواريخ، منشار'],
  ['سباكة', 'قساطل، وصلات، حنفيات'],
  ['دهانات', 'دهان، معجون، فراشي'],
  ['تثبيت ولواصق', 'براغي، فيشر، سيليكون'],
];

const SUPPLIERS = ['شركة الضياء للتجهيزات الكهربائية', 'مؤسسة المتين للعدد', 'مستودعات الريّان للسباكة', 'شركة ألوان للدهانات', 'مؤسسة الإتقان التجارية'];
const CUSTOMERS = ['ورشة الأمل للصيانة', 'مقاولات البيت الحديث', 'محل النجمة للأدوات', 'ورشة صيانة المدرسة', 'زبون نقدي', 'شركة البنيان للمقاولات', 'مكتب الهندسة المتحدة'];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function seedDb(): Db {
  const r = rng(2026);
  const int = (min: number, max: number) => Math.floor(r() * (max - min)) + min; // [min, max)
  const pick = <T,>(a: T[]) => a[int(0, a.length)];

  const all = PERMISSIONS.map((p) => p.key);
  const roles: DbRole[] = [
    { id: 1, name: 'مدير النظام', description: 'صلاحيات كاملة على النظام', isSystem: true, permissions: all },
    { id: 2, name: 'مدير المخزن', description: 'يدير المنتجات والمستودعات والحركات والتقارير', isSystem: false,
      permissions: all.filter((p) => !p.startsWith('users') && !p.startsWith('roles')) },
    { id: 3, name: 'أمين المخزن', description: 'يسجل الإدخال والإخراج والنقل في مستودعه', isSystem: false,
      permissions: ['dashboard.view', 'products.view', 'movements.view', 'movements.in', 'movements.out', 'movements.transfer'] },
    { id: 4, name: 'مراجع', description: 'اطلاع فقط على البيانات والتقارير', isSystem: false,
      permissions: ['dashboard.view', 'products.view', 'movements.view', 'reports.view'] },
  ];

  const warehouses: DbWarehouse[] = [
    { id: 1, code: 'MAIN', name: 'المستودع الرئيسي', address: 'دمشق، المنطقة الصناعية', isActive: true },
    { id: 2, code: 'ALP', name: 'فرع حلب', address: 'حلب، الشيخ نجار', isActive: true },
    { id: 3, code: 'HMS', name: 'فرع حمص', address: 'حمص، طريق طرابلس', isActive: true },
  ];
  const [MAIN, ALP, HMS] = [1, 2, 3];

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const users: DbUser[] = [
    { id: 1, fullName: 'محمد العلي', username: 'admin', password: 'Admin@123', roleId: 1, isActive: true, createdAt: iso(now - 130 * 864e5), lastLoginAt: iso(now - 2 * 36e5), warehouseId: null },
    { id: 2, fullName: 'سامر الحلبي', username: 'manager', password: 'Manager@123', roleId: 2, isActive: true, createdAt: iso(now - 128 * 864e5), lastLoginAt: iso(now - 26 * 36e5), warehouseId: null },
    { id: 3, fullName: 'ريم خليل', username: 'keeper', password: 'Keeper@123', roleId: 3, isActive: true, createdAt: iso(now - 128 * 864e5), lastLoginAt: iso(now - 5 * 36e5), warehouseId: MAIN },
    { id: 4, fullName: 'وسيم داود', username: 'viewer', password: 'Viewer@123', roleId: 4, isActive: true, createdAt: iso(now - 90 * 864e5), lastLoginAt: null, warehouseId: null },
    { id: 5, fullName: 'ليلى حداد', username: 'aleppo', password: 'Aleppo@123', roleId: 3, isActive: true, createdAt: iso(now - 120 * 864e5), lastLoginAt: iso(now - 8 * 36e5), warehouseId: ALP },
  ];

  const categories: DbCategory[] = CATEGORIES.map(([name, description], i) => ({ id: i + 1, name, description }));
  const catId = (name: string) => categories.find((c) => c.name === name)!.id;

  const counters: Record<string, number> = {};
  const aisles = ['A', 'B', 'C', 'D', 'E'];
  const products: DbProduct[] = ITEMS.map(([cat, prefix, name, unit, cost, margin, reorder], i) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return {
      id: i + 1,
      sku: `${prefix}-${String(counters[prefix] * 7 + 100).padStart(4, '0')}`,
      // Most items carry the supplier's EAN-13 (621 = Syria); every fourth one only has Raff's own SKU label.
      barcode: (i + 1) % 4 === 0 ? null : withCheckDigit(`6214503${String((i + 1) * 37).padStart(5, '0')}`),
      name, categoryId: catId(cat), unit,
      location: `${pick(aisles)}-${String(int(1, 13)).padStart(2, '0')}-${int(1, 5)}`,
      costPrice: cost, salePrice: round2(cost * (1 + margin)),
      reorderLevel: reorder, isActive: true, createdAt: iso(now - 125 * 864e5),
    };
  });

  // Simulated on-hand quantity per product and warehouse while generating history.
  const stock = new Map<string, number>();
  const key = (pid: number, wid: number) => `${pid}:${wid}`;
  const qtyOf = (pid: number, wid: number) => stock.get(key(pid, wid)) ?? 0;

  type Draft = Omit<DbMovement, 'id' | 'balanceAfter' | 'counterpartWarehouseId' | 'transferId'> &
    Partial<Pick<DbMovement, 'counterpartWarehouseId' | 'transferId'>>;
  const drafts: Draft[] = [];
  let invoice = 1040, receipt = 310, transferNo = 50, tid = 1;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 120 * 864e5;

  const add = (d: Draft) => { stock.set(key(d.productId, d.warehouseId), qtyOf(d.productId, d.warehouseId) + d.quantityChange); drafts.push(d); };
  const transfer = (p: DbProduct, from: number, to: number, qty: number, at: number, by: number) => {
    const ref = `TR-${transferNo++}`, transferId = `demo-${tid++}`;
    add({ productId: p.id, warehouseId: from, type: 'TransferOut', quantityChange: -qty, unitPrice: p.costPrice,
      party: null, reference: ref, note: null, occurredAt: iso(at), createdById: by, counterpartWarehouseId: to, transferId });
    add({ productId: p.id, warehouseId: to, type: 'TransferIn', quantityChange: qty, unitPrice: p.costPrice,
      party: null, reference: ref, note: null, occurredAt: iso(at + 6e4), createdById: by, counterpartWarehouseId: from, transferId });
  };

  products.forEach((p, i) => {
    const [, , , , , , reorder, demand] = ITEMS[i];
    const qty = reorder * 3 + int(demand * 6, demand * 14 + 5);
    add({ productId: p.id, warehouseId: MAIN, type: 'In', quantityChange: qty, unitPrice: p.costPrice,
      party: pick(SUPPLIERS), reference: `RC-${receipt++}`, note: 'رصيد افتتاحي', occurredAt: iso(start + 9 * 36e5), createdById: 2 });
    transfer(p, MAIN, ALP, Math.max(1, Math.floor(qty / 4)), start + 864e5 + 10 * 36e5, 2);
    transfer(p, MAIN, HMS, Math.max(1, Math.floor(qty / 6)), start + 864e5 + 11 * 36e5, 2);
  });

  const neglected = new Set(
    ITEMS.map((it, i) => ({ i, d: it[7] })).sort((a, b) => b.d - a.d).slice(0, 4).map((x) => products[x.i].id),
  );
  const outlets = [{ w: MAIN, share: 0.5, by: 3 }, { w: ALP, share: 0.3, by: 5 }, { w: HMS, share: 0.2, by: 2 }];

  for (let day = 2; day <= 120; day++) {
    const dayStart = start + day * 864e5;
    const isFriday = new Date(dayStart).getDay() === 5;
    const busy = 1 + day / 240;
    const outCount = isFriday ? int(0, 3) : Math.floor(int(5, 12) * busy);

    // Deliveries and transfers arrive in the morning, sales happen after 10:00.
    products.forEach((p, idx) => {
      if (neglected.has(p.id) && day > 60) return;
      const [, , , , , , reorder, demand] = ITEMS[idx];
      for (const branch of [ALP, HMS]) {
        if (qtyOf(p.id, branch) > reorder / 2 || r() > 0.5) continue;
        const qty = Math.min(Math.floor(qtyOf(p.id, MAIN) / 3), reorder + demand * int(3, 7));
        if (qty > 0) transfer(p, MAIN, branch, qty, dayStart + 9 * 36e5 + int(0, 50) * 6e4, 2);
      }
      if (qtyOf(p.id, MAIN) > p.reorderLevel || r() > 0.55) return;
      const qty = reorder * 2 + demand * int(8, 16);
      add({ productId: p.id, warehouseId: MAIN, type: 'In', quantityChange: qty, unitPrice: p.costPrice,
        party: pick(SUPPLIERS), reference: `RC-${receipt++}`, note: null,
        occurredAt: iso(dayStart + 8 * 36e5 + int(0, 50) * 6e4), createdById: 2 });
    });
    for (let k = 0; k < outCount; k++) {
      const idx = int(0, products.length);
      const p = products[idx];
      const demand = ITEMS[idx][7];
      const roll = r();
      const o = roll < 0.5 ? outlets[0] : roll < 0.8 ? outlets[1] : outlets[2];
      const qty = Math.max(1, Math.floor(int(1, demand * 2 + 2) * busy * (o.share + 0.3)));
      if (qtyOf(p.id, o.w) < qty) continue;
      add({ productId: p.id, warehouseId: o.w, type: 'Out', quantityChange: -qty, unitPrice: p.salePrice,
        party: pick(CUSTOMERS), reference: `INV-${invoice++}`, note: null,
        occurredAt: iso(dayStart + int(10, 18) * 36e5 + int(0, 60) * 6e4), createdById: o.by });
    }
    if (day % 30 === 0) {
      const p = products[int(0, products.length)];
      const diff = -Math.min(qtyOf(p.id, MAIN), int(1, 4));
      if (diff !== 0)
        add({ productId: p.id, warehouseId: MAIN, type: 'Adjustment', quantityChange: diff, unitPrice: p.costPrice,
          party: null, reference: null, note: 'تسوية جرد شهري - تالف', occurredAt: iso(dayStart + 17 * 36e5), createdById: 2 });
    }
  }

  // Replay in time order to compute each warehouse's balance after every movement.
  drafts.forEach((d) => { if (Date.parse(d.occurredAt) > now) d.occurredAt = iso(now - int(5, 240) * 6e4); });
  const running = new Map<string, number>();
  const movements: DbMovement[] = drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.occurredAt.localeCompare(b.d.occurredAt) || a.i - b.i)
    .map(({ d }, i) => {
      const k = key(d.productId, d.warehouseId);
      const balance = (running.get(k) ?? 0) + d.quantityChange;
      running.set(k, balance);
      return { counterpartWarehouseId: null, transferId: null, ...d, id: i + 1, balanceAfter: balance };
    });

  const levels: DbLevel[] = [...stock.entries()].map(([k, quantity]) => {
    const [productId, warehouseId] = k.split(':').map(Number);
    return { productId, warehouseId, quantity };
  });

  return { categories, products, movements, roles, users, warehouses, levels };
}
