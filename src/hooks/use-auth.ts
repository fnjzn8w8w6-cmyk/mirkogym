import { useData } from './data-context';

export function useAuth() {
  const { user, uid, error } = useData();
  return { user, uid, error, loading: !uid && !error };
}
