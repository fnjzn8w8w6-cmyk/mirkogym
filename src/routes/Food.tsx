import { useNavigate, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { FoodDiary } from '@/components/food/FoodDiary';
import { NutritionPlanner, RecipesTab } from '@/components/food/NutritionPlanner';
import { WeeklyCheckIn } from '@/components/coach/WeeklyCheckIn';
import { useEffectiveProfile } from '@/hooks/use-effective-profile';

type Tab = 'diary' | 'plan' | 'recipes';

export default function Food() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'diary';
  const profile = useEffectiveProfile();

  return (
    <div>
      <TopBar title="Dieta" subtitle="Diario, piano settimanale e ricette" large />
      <div className="page pt-3">
        <Segmented<Tab>
          label="Sezione dieta"
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'diary', label: 'Diario' },
            { value: 'plan', label: 'Piano' },
            { value: 'recipes', label: 'Ricette' },
          ]}
        />
        <div className="mt-4">
          {!profile ? (
            <EmptyState
              title="Completa il tuo profilo"
              description="Servono i tuoi dati per calcolare calorie e macro."
              action={<Button onClick={() => navigate('/profile')}>Vai al profilo</Button>}
            />
          ) : tab === 'diary' ? (
            <FoodDiary profile={profile} />
          ) : tab === 'plan' ? (
            <NutritionPlanner profile={profile} header={<WeeklyCheckIn profile={profile} autoOpen={params.get('checkin') === '1'} />} />
          ) : (
            <RecipesTab profile={profile} />
          )}
        </div>
      </div>
    </div>
  );
}
