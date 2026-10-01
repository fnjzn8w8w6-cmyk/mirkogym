import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { isFirebaseConfigured } from '@/lib/firebase';
import { DataProvider, useData } from '@/hooks/data-context';
import { RestTimerProvider } from '@/hooks/use-rest-timer';
import { useMesocycleSync } from '@/hooks/use-mesocycle';
import { ToastProvider } from '@/components/ui/Toast';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomNav } from '@/components/layout/BottomNav';
import { RestTimer } from '@/components/session/RestTimer';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { StartingLoads } from '@/components/onboarding/StartingLoads';
import { SetupRequired, Splash, FatalError } from '@/components/onboarding/Screens';
import { AuthScreen } from '@/components/onboarding/AuthScreen';
import { ProfileSetup } from '@/components/onboarding/ProfileSetup';
import Home from '@/routes/Home';
import Session from '@/routes/Session';

// Le schermate secondarie (grafici inclusi) vengono caricate on-demand
const HistorySession = lazy(() => import('@/routes/HistorySession'));
const HistoryExercise = lazy(() => import('@/routes/HistoryExercise'));
const Body = lazy(() => import('@/routes/Body'));
const Mesocycle = lazy(() => import('@/routes/Mesocycle'));
const Settings = lazy(() => import('@/routes/Settings'));
const ScheduleEditor = lazy(() => import('@/routes/ScheduleEditor'));
const Exercises = lazy(() => import('@/routes/Exercises'));
const Profile = lazy(() => import('@/routes/Profile'));
const Coach = lazy(() => import('@/routes/Coach'));
const Food = lazy(() => import('@/routes/Food'));
const Training = lazy(() => import('@/routes/Training'));

function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </ErrorBoundary>
    </motion.div>
  );
}

function AppShell() {
  useMesocycleSync();
  const location = useLocation();
  const inSession = location.pathname.startsWith('/session');
  const section = '/' + (location.pathname.split('/')[1] ?? '');

  useEffect(() => window.scrollTo(0, 0), [location.pathname]);

  return (
    <>
      {/* Solo transizione d'ingresso: niente exit, così la navigazione non può mai restare bloccata */}
      <Routes location={location} key={section === '/history' ? location.pathname : section}>
        <Route path="/" element={<Page><Home /></Page>} />
        <Route path="/session/:dayId" element={<Page><Session /></Page>} />
        <Route path="/history" element={<Navigate to="/training?tab=sessions" replace />} />
        <Route path="/history/session/:id" element={<Page><HistorySession /></Page>} />
        <Route path="/history/exercise/:key" element={<Page><HistoryExercise /></Page>} />
        <Route path="/body" element={<Page><Body /></Page>} />
        <Route path="/mesocycle" element={<Page><Mesocycle /></Page>} />
        <Route path="/settings" element={<Page><Settings /></Page>} />
        <Route path="/schedule" element={<Page><ScheduleEditor /></Page>} />
        <Route path="/exercises" element={<Page><Exercises /></Page>} />
        <Route path="/profile" element={<Page><Profile /></Page>} />
        <Route path="/coach" element={<Page><Coach /></Page>} />
        <Route path="/food" element={<Page><Food /></Page>} />
        <Route path="/training" element={<Page><Training /></Page>} />
        <Route path="*" element={<Page><Home /></Page>} />
      </Routes>
      <RestTimer inSession={inSession} />
      {!inSession && <BottomNav />}
    </>
  );
}

function Gate() {
  const { error, ready, settings, sessions, signedOut, isAnonymous, uid } = useData();
  // Login obbligatorio: senza account (o con il vecchio utente anonimo) si passa dalla registrazione
  if (signedOut || (uid && isAnonymous)) return <AuthScreen />;
  if (error && !ready) return <FatalError error={error} />;
  if (!ready) return <Splash />;
  if (!settings.onboardingCompleted) return <Onboarding />;
  if (!settings.profileCompleted) return <ProfileSetup />;
  if (!settings.startingLoadsPrompted && sessions.length === 0) return <StartingLoads />;
  return <AppShell />;
}

export default function App() {
  if (!isFirebaseConfigured) return <SetupRequired />;
  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DataProvider>
          <ToastProvider>
            <RestTimerProvider>
              <Gate />
            </RestTimerProvider>
          </ToastProvider>
        </DataProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
