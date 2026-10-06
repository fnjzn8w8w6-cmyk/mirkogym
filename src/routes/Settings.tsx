import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Copy, Download, ExternalLink, ListChecks, LogOut, RotateCcw, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import type { BackupFile } from '@/types';
import { useSettings } from '@/hooks/use-settings';
import { useSessions } from '@/hooks/use-sessions';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { useMesocycle } from '@/hooks/use-mesocycle';
import { useData, useUid } from '@/hooks/data-context';
import { AccountModal, type AccountMode } from '@/components/modals/AccountModal';
import { authErrorMessage, logOut } from '@/lib/auth';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented, Toggle, Input } from '@/components/ui/Input';
import { NewBadge } from '@/components/ui/Help';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { exportAll, importAll, isBackupFile, resetAll, saveMesocycle, settle } from '@/lib/firestore';
import { clearLocalActiveSession } from '@/hooks/use-active-session';
import { exerciseKey } from '@/lib/analytics';
import { LANGUAGES } from '@/lib/exercise-i18n';
import { toISODate } from '@/lib/date-utils';

const REPO_URL = 'https://github.com/fnjzn8w8w6-cmyk/mirkogym';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <Card className="divide-y divide-line-subtle px-4">{children}</Card>
    </section>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const toast = useToast();
  const uid = useUid();
  const { settings, update } = useSettings();
  const { sessions, nameOf } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const { mesocycle, currentWeek } = useMesocycle();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [resetText, setResetText] = useState('');
  const [resetting, setResetting] = useState(false);
  const { isAnonymous, email } = useData();
  const [account, setAccount] = useState<AccountMode | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const stats = useMemo(() => {
    const trainingDays = new Set(sessions.map((s) => toISODate(s.date))).size;
    const counts = new Map<string, { name: string; n: number }>();
    for (const s of sessions)
      for (const l of s.logs) {
        const name = nameOf(l);
        const k = exerciseKey(name);
        counts.set(k, { name, n: (counts.get(k)?.n ?? 0) + 1 });
      }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    return { trainingDays, top };
  }, [sessions, nameOf]);

  const set = (patch: Parameters<typeof update>[0]) => {
    void settle(update(patch));
  };

  const changeFrequency = (weeks: number) => {
    set({ deloadFrequency: weeks });
    // Applica al mesociclo in corso se compatibile con la settimana attuale
    if (mesocycle && currentWeek <= weeks) void settle(saveMesocycle(uid, { ...mesocycle, weeks }));
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const data = await exportAll(uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vulcanlift-backup-${toISODate(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success('Backup esportato');
    } catch (e) {
      console.error(e);
      toast.error('Export non riuscito (sei online?)');
    } finally {
      setExporting(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackupFile(parsed)) throw new Error('Formato non valido');
      setPendingImport(parsed);
    } catch {
      toast.error('File di backup non valido');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(uid);
      toast.success('UID copiato');
    } catch {
      toast.info(uid);
    }
  };

  return (
    <div>
      <TopBar title="Impostazioni" large />
      <div className="page space-y-5 pt-4">
        <section>
          <h2 className="section-title">Account</h2>
          {isAnonymous ? (
            <Card className="border-warning/30 p-4">
              <div className="flex gap-3">
                <ShieldAlert className="h-6 w-6 shrink-0 text-warning" aria-hidden />
                <div>
                  <div className="text-base font-semibold text-fg">Dati salvati solo su questo dispositivo</div>
                  <p className="mt-1 text-sm text-fg-2">
                    Crea un account per non perdere mai i tuoi allenamenti e ritrovarli su qualsiasi telefono.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button onClick={() => setAccount('create')}>Crea account</Button>
                <Button variant="secondary" onClick={() => setAccount('login')}>
                  Accedi
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 p-4">
              <ShieldCheck className="h-6 w-6 shrink-0 text-success" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-fg-3">Account protetto</div>
                <div className="truncate text-base font-semibold text-fg">{email}</div>
              </div>
              <Button variant="secondary" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => setConfirmLogout(true)}>
                Esci
              </Button>
            </Card>
          )}
        </section>

        <Card interactive className="flex items-center gap-3 p-4" onClick={() => navigate('/schedule')} role="link">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-accent-glow text-accent-500">
            <ListChecks className="h-6 w-6" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-base font-semibold text-fg">Modifica scheda</span>
            <span className="block text-sm text-fg-3">Giorni, esercizi, serie, rep range</span>
          </span>
          <ChevronRight className="h-5 w-5 text-fg-3" aria-hidden />
        </Card>

        <section>
          <h2 className="section-title">Lingua delle istruzioni</h2>
          <Card className="grid grid-cols-3 gap-2 p-3">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                aria-pressed={settings.language === l.value}
                onClick={() => set({ language: l.value })}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-md border text-sm font-semibold ${
                  settings.language === l.value ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2'
                }`}
              >
                <span aria-hidden>{l.flag}</span>
                {l.label}
              </button>
            ))}
          </Card>
        </section>

        <Section title="Allenamento">
          <div className="py-2">
            <div className="mb-2 flex items-center text-base text-fg">
              Sforzo delle serie <NewBadge />
            </div>
            <Segmented
              label="Sforzo delle serie"
              value={settings.effortScale ?? 'rpe'}
              onChange={(v) => set({ effortScale: v })}
              options={[
                { value: 'rpe', label: 'RPE (6-10)' },
                { value: 'rir', label: 'RIR (in riserva)' },
              ]}
            />
            <p className="mt-1.5 text-sm text-fg-3">RPE: quanto è stata dura la serie, 10 = al limite. RIR: quante ripetizioni ti restavano.</p>
          </div>
          <Toggle
            label="Riscaldamento suggerito"
            description="Serie W già pronte sul primo esercizio multiarticolare di ogni gruppo"
            checked={settings.autoWarmup !== false}
            onChange={(v) => set({ autoWarmup: v })}
          />
        </Section>

        <Section title="Timer riposo">
          <Toggle label="Abilita timer" checked={settings.restTimerEnabled} onChange={(v) => set({ restTimerEnabled: v })} />
          <Toggle
            label="Avvio automatico"
            description="Parte quando spunti una serie"
            checked={settings.restTimerAutoStart}
            disabled={!settings.restTimerEnabled}
            onChange={(v) => set({ restTimerAutoStart: v })}
          />
          <Toggle label="Suono a fine recupero" checked={settings.soundEnabled} onChange={(v) => set({ soundEnabled: v })} />
          <Toggle
            label="Schermo sempre acceso"
            description="Durante l'allenamento lo schermo non si spegne"
            checked={settings.keepScreenOn}
            onChange={(v) => set({ keepScreenOn: v })}
          />
          <Toggle
            label="Vibrazione"
            description="Non supportata da Safari su iPhone"
            checked={settings.vibrationEnabled}
            onChange={(v) => set({ vibrationEnabled: v })}
          />
        </Section>

        <section>
          <h2 className="section-title">Programmazione e deload</h2>
          <Card className="space-y-4 p-4">
            <div>
              <div className="mb-2 text-base text-fg">Frequenza</div>
              <Segmented<number>
                label="Frequenza deload"
                value={settings.deloadFrequency}
                onChange={changeFrequency}
                options={[4, 5, 6].map((n) => ({ value: n, label: `Ogni ${n} sett.` }))}
              />
            </div>
            <div>
              <div className="mb-2 text-base text-fg">Riduzione carichi</div>
              <Segmented<number>
                label="Percentuale deload"
                value={settings.deloadPercentage}
                onChange={(v) => set({ deloadPercentage: v })}
                options={[30, 40, 50].map((n) => ({ value: n, label: `-${n}%` }))}
              />
            </div>
            <div>
              <div className="mb-1 text-base text-fg">Serie settimanali per muscolo</div>
              <p className="mb-2 text-sm text-fg-3">Fascia obiettivo mostrata in Home (volume di mantenimento → massimo recuperabile).</p>
              <Segmented<string>
                label="Obiettivo serie settimanali"
                value={`${settings.weeklySetsMin}-${settings.weeklySetsMax}`}
                onChange={(v) => {
                  const [a, b] = v.split('-').map(Number);
                  set({ weeklySetsMin: a, weeklySetsMax: b });
                }}
                options={['6-12', '10-20', '12-24'].map((v) => ({ value: v, label: v }))}
              />
            </div>
            <Toggle
              label="Deload automatico"
              description="Riduce i carichi nell'ultima settimana del mesociclo"
              checked={settings.autoDeload}
              onChange={(v) => set({ autoDeload: v })}
            />
          </Card>
        </section>

        <section>
          <h2 className="section-title">Dati</h2>
          <Card className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Sessioni" value={sessions.length} />
              <Stat label="Body log" value={bodyLogs.length} />
              <Stat label="Giorni" value={stats.trainingDays} />
            </div>
            {stats.top && (
              <p className="text-sm text-fg-3">
                Esercizio più loggato: <span className="font-semibold text-fg-2">{stats.top.name}</span> ({stats.top.n} sessioni)
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" icon={<Download className="h-5 w-5" />} loading={exporting} onClick={doExport}>
                Esporta
              </Button>
              <Button variant="secondary" icon={<Upload className="h-5 w-5" />} onClick={() => fileRef.current?.click()}>
                Importa
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="File di backup"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </Card>
        </section>

        <section>
          <h2 className="section-title">App</h2>
          <Card className="divide-y divide-line-subtle px-4">
            <Row label="Versione" value={`v${__APP_VERSION__} · ${new Date(__BUILD_TIME__).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`} />
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex min-h-[52px] items-center justify-between text-base text-fg">
              Repository GitHub
              <ExternalLink className="h-5 w-5 text-fg-3" aria-hidden />
            </a>
            <div className="flex min-h-[52px] items-center justify-between gap-2">
              <span className="text-base text-fg">UID</span>
              <span className="flex min-w-0 items-center gap-1">
                <code className="truncate text-sm text-fg-3">{uid}</code>
                <IconButton label="Copia UID" onClick={copyUid} className="-mr-2">
                  <Copy className="h-4 w-4" />
                </IconButton>
              </span>
            </div>
          </Card>
        </section>

        <Button variant="danger" fullWidth icon={<RotateCcw className="h-5 w-5" />} onClick={() => setResetStep(1)}>
          Reset app
        </Button>
      </div>

      <AccountModal open={account !== null} mode={account ?? 'create'} onClose={() => setAccount(null)} onModeChange={setAccount} />
      <ConfirmDialog
        open={confirmLogout}
        title="Uscire dall'account?"
        message="I tuoi dati restano salvati nell'account: li ritrovi accedendo di nuovo con la tua email."
        confirmLabel="Esci"
        destructive={false}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          try {
            await logOut();
          } catch (e) {
            toast.error(authErrorMessage(e));
          }
          setConfirmLogout(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingImport)}
        title="Importare il backup?"
        message={
          pendingImport
            ? `Tutti i dati attuali verranno SOSTITUITI con il backup del ${new Date(pendingImport.exportedAt).toLocaleDateString('it-IT')} (${pendingImport.sessions.length} sessioni, ${pendingImport.bodyLogs.length} body log).`
            : ''
        }
        confirmLabel="Sovrascrivi"
        onCancel={() => setPendingImport(null)}
        onConfirm={async () => {
          if (!pendingImport) return;
          try {
            clearLocalActiveSession();
            await importAll(uid, pendingImport);
            toast.success('Backup importato');
          } catch (e) {
            console.error(e);
            toast.error('Import non riuscito (serve connessione)');
          }
          setPendingImport(null);
        }}
      />

      <ConfirmDialog
        open={resetStep === 1}
        title="Reset dell'app?"
        message="Verranno cancellati TUTTI i tuoi dati: sessioni, body log, mesocicli e scheda personalizzata."
        confirmLabel="Continua"
        onCancel={() => setResetStep(0)}
        onConfirm={() => {
          setResetText('');
          setResetStep(2);
        }}
      />
      <Modal open={resetStep === 2} onClose={() => setResetStep(0)} variant="center" title="Conferma definitiva" dismissible={!resetting}>
        <p className="text-base text-fg-2">
          Questa azione è irreversibile. Consigliato: esporta prima un backup. Scrivi <strong className="text-danger">RESET</strong> per confermare.
        </p>
        <Input className="mt-4" label="Scrivi RESET" value={resetText} autoCapitalize="characters" onChange={(e) => setResetText(e.target.value)} />
        <Button
          className="mt-4"
          variant="danger"
          fullWidth
          size="lg"
          loading={resetting}
          disabled={resetText.trim().toUpperCase() !== 'RESET'}
          onClick={async () => {
            setResetting(true);
            try {
              await resetAll(uid);
              try {
                localStorage.clear();
              } catch {
                /* ignorato */
              }
              window.location.replace(import.meta.env.BASE_URL);
            } catch (e) {
              console.error(e);
              toast.error('Reset non riuscito (serve connessione)');
              setResetting(false);
            }
          }}
        >
          Cancella tutto
        </Button>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <div className="text-2xl text-fg">{value}</div>
      <div className="text-xs uppercase text-fg-3">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between">
      <span className="text-base text-fg">{label}</span>
      <span className="text-base text-fg-3">{value}</span>
    </div>
  );
}
