import { getLang, t } from '../i18n';

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

// ar-SY gives Levantine month names (تشرين الثاني، كانون الأول…); "nu-latn" keeps 0-9 digits.
const LOCALES = { ar: 'ar-SY-u-nu-latn', en: 'en-GB' } as const;
const cache = new Map<string, Intl.DateTimeFormat>();
function df(opts: Intl.DateTimeFormatOptions) {
  const lang = getLang();
  const key = lang + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(LOCALES[lang], opts); cache.set(key, f); }
  return f;
}

export const fmt = {
  int: (n: number) => num.format(n),
  money: (n: number) => `$${money2.format(n)}`,
  moneyRound: (n: number) => `$${num.format(Math.round(n))}`,
  compactMoney: (n: number) => `$${compact.format(n)}`,
  date: (iso: string) => df({ day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)),
  shortDate: (d: string | Date) => df({ day: 'numeric', month: 'short' }).format(typeof d === 'string' ? parseDay(d) : d),
  time: (iso: string) => df({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso)),
  today: () => df({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
  dateTime: (iso: string) => `${fmt.shortDate(new Date(iso))}${getLang() === 'ar' ? '،' : ','} ${fmt.time(iso)}`,
  signed: (n: number) => (n > 0 ? `+${num.format(n)}` : n < 0 ? `−${num.format(-n)}` : '0'),
  percentChange: (now: number, before: number) => (before ? ((now - before) / before) * 100 : null),
};

/** "2026-11-19" → local Date at midnight (avoids the UTC shift of new Date("2026-11-19")). */
export function parseDay(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function toDayString(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDayString(d);
}

function arCount(n: number, one: string, two: string, few: string, many: string) {
  return n === 1 ? `قبل ${one}` : n === 2 ? `قبل ${two}` : n <= 10 ? `قبل ${n} ${few}` : `قبل ${n} ${many}`;
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const ar = getLang() === 'ar';
  if (diff < 60) return t('time.now');
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return ar ? arCount(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة') : `${m} min ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return ar ? arCount(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة') : `${h} h ago`;
  }
  const d = Math.floor(diff / 86400);
  if (d === 1) return t('time.yesterday');
  if (d < 7) return ar ? (d === 2 ? 'قبل يومين' : `قبل ${d} أيام`) : `${d} days ago`;
  return fmt.shortDate(new Date(iso));
}

export function greeting(name: string) {
  return t(new Date().getHours() < 12 ? 'dash.morning' : 'dash.evening', { name });
}
