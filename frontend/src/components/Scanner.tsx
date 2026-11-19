import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CameraOff, ScanLine } from 'lucide-react';
import { loadDetector, signalRead } from '../lib/scanner';
import { t } from '../i18n';
import { Modal } from './ui';

type CamState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'failed';

/**
 * Full-screen camera scanner. Reads EAN/UPC, Code 128/39 and QR codes; also accepts a typed code
 * for when there's no camera. Rendered in a portal so it can open from inside another form.
 */
export function CameraScanner({ onDetected, onClose, title }: {
  onDetected: (code: string) => void; onClose: () => void; title?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CamState>('starting');
  const [typed, setTyped] = useState('');
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setState('unavailable'); return; }
      try {
        const [s, detector] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
          loadDetector(),
        ]);
        stream = s;
        if (cancelled) return;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        setState('scanning');

        const tick = async () => {
          if (cancelled || done.current) return;
          try {
            if (v.readyState >= 2) {
              const found = (await detector.detect(v)).find((b) => b.rawValue.trim());
              if (found && !done.current) {
                done.current = true;
                signalRead();
                onDetected(found.rawValue.trim());
                return;
              }
            }
          } catch { /* a frame that couldn't be read: try the next one */ }
          timer = window.setTimeout(tick, 120);
        };
        tick();
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
          : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unavailable' : 'failed');
      }
    }
    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitTyped = () => {
    const code = typed.trim();
    if (code && !done.current) { done.current = true; onDetected(code); }
  };

  const problem: Record<Exclude<CamState, 'starting' | 'scanning'>, string> = {
    denied: t('scan.denied'),
    unavailable: t('scan.unavailable'),
    failed: t('scan.failed'),
  };

  return createPortal(
    <Modal title={title ?? t('scan.title')} onClose={onClose} size="sm">
      <div className={`scanner ${state}`}>
        <video ref={video} muted playsInline aria-label={t('scan.preview')} />
        {state === 'scanning' && <div className="scanner-frame" aria-hidden="true"><span /></div>}
        {state === 'starting' && <div className="scanner-msg"><Camera size={26} strokeWidth={1.6} />{t('scan.starting')}</div>}
        {state !== 'starting' && state !== 'scanning' && (
          <div className="scanner-msg" role="alert"><CameraOff size={26} strokeWidth={1.6} />{problem[state]}</div>
        )}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>{state === 'scanning' ? t('scan.hint') : t('scan.typeInstead')}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input code-input" value={typed} onChange={(e) => setTyped(e.target.value)}
          placeholder={t('scan.typePlaceholder')} aria-label={t('scan.typeLabel')}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitTyped(); } }}
        />
        <button type="button" className="btn" onClick={submitTyped} disabled={!typed.trim()}>{t('scan.use')}</button>
      </div>
    </Modal>,
    document.body,
  );
}

/**
 * A code box for USB/Bluetooth scanners (they type the code and press Enter) with a camera button
 * beside it. Calls onCode with the scanned or typed code.
 */
export function ScanInput({ onCode, busy, label, placeholder, autoFocus }: {
  onCode: (code: string) => void; busy?: boolean; label: string; placeholder?: string; autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);

  const send = (code: string) => {
    const c = code.trim();
    if (!c) return;
    onCode(c);
    setValue('');
  };

  return (
    <div className="scan-input">
      <ScanLine size={16} aria-hidden="true" />
      <input
        className="input code-input" value={value} onChange={(e) => setValue(e.target.value)}
        aria-label={label} placeholder={placeholder ?? t('scan.inputPlaceholder')} autoFocus={autoFocus}
        autoComplete="off" spellCheck={false} disabled={busy}
        // Enter would otherwise submit the surrounding form.
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(value); } }}
      />
      <button type="button" className="btn btn-icon" onClick={() => setCamera(true)} disabled={busy}
        title={t('scan.open')} aria-label={t('scan.open')}>
        <Camera size={17} />
      </button>
      {camera && (
        <CameraScanner onClose={() => setCamera(false)} onDetected={(c) => { setCamera(false); send(c); }} />
      )}
    </div>
  );
}
