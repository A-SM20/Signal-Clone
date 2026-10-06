import { QueryClient } from "@tanstack/react-query";

/** One app-wide cache: the WebSocket layer writes server events straight into it. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});
