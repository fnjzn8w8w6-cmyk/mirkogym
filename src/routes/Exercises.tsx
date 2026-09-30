import { TopBar } from '@/components/layout/TopBar';
import { ExerciseBrowser } from '@/components/library/ExerciseBrowser';

export default function Exercises() {
  return (
    <div>
      <TopBar title="Esercizi" subtitle="876 esercizi con demo e istruzioni" large />
      <div className="page pt-4">
        <ExerciseBrowser />
      </div>
    </div>
  );
}
