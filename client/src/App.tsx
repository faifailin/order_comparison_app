import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import NewComparison from "./pages/NewComparison";
import History from "./pages/History";
import ComparisonDetail from "./pages/ComparisonDetail";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={NewComparison} />
        <Route path={"/new"} component={NewComparison} />
        <Route path={"/history"} component={History} />
        <Route path={"/history/:id"} component={ComparisonDetail} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.16 0.012 260)",
                border: "1px solid oklch(0.26 0.015 260)",
                color: "oklch(0.92 0.01 260)",
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
