import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "@/lib/query";
import { router } from "@/router";
import { ToastProvider } from "@/components/ui/toast";
import { PreviewProvider } from "@/preview/preview-context";

export default function App() {
  // Refresh all cached data when the main process signals a change
  // (e.g. cards created via the MCP server). Guarded so the UI also runs
  // standalone during design review, before the backend is connected.
  useEffect(() => {
    return window.armin?.onDataChanged?.(() => {
      queryClient.invalidateQueries();
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PreviewProvider>
          <RouterProvider router={router} />
        </PreviewProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
