import { isDevLoginAvailable } from "@/const";
import { trpc } from "@/lib/trpc";

export function useAuthProviders() {
  const { data, isLoading } = trpc.auth.providers.useQuery(undefined, {
    staleTime: Infinity,
  });

  const google = data?.google ?? false;
  const microsoft = data?.microsoft ?? false;

  return {
    loading: isLoading,
    google,
    microsoft,
    oauthConfigured: google || microsoft,
    devLoginAvailable: isDevLoginAvailable(),
  };
}
