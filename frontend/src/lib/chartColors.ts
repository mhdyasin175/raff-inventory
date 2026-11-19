import { usePrefs } from '../i18n';

/** Chart colours per theme (Recharts needs real colour values, not CSS variables). */
const COLORS = {
  raff: { in: '#1c7a55', out: '#b42318', bar: '#3a433f', highlight: '#d9ad00', grid: '#eceee9', axis: '#66706b', label: '#18201d', tipBg: '#18201d', tipMuted: '#b8c0bb', zero: '#18201d', font: 'IBM Plex Sans Arabic' },
  shadcn: { in: '#0d9488', out: '#e11d48', bar: '#a1a1aa', highlight: '#18181b', grid: '#f4f4f5', axis: '#71717a', label: '#09090b', tipBg: '#ffffff', tipMuted: '#71717a', zero: '#d4d4d8', font: 'Geist' },
  adminlte: { in: '#28a745', out: '#dc3545', bar: '#6c757d', highlight: '#007bff', grid: '#e9ecef', axis: '#6c757d', label: '#212529', tipBg: '#343a40', tipMuted: '#adb5bd', zero: '#adb5bd', font: 'Source Sans 3' },
} as const;

export function useChartColors() {
  const { theme, dir } = usePrefs();
  return { ...COLORS[theme], rtl: dir === 'rtl', theme };
}
