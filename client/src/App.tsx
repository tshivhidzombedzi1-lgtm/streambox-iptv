import { useEffect } from "react";
import { Toaster } from "sonner";
import { Route, Switch, useLocation } from "wouter";
import { ResetScreen } from "./components/Account";
import ErrorBoundary from "./components/ErrorBoundary";
import Onboarding from "./components/Onboarding";
import { loadAccount } from "./lib/account";
import { trackView } from "./lib/growth";
import AdminScreen from "./pages/Admin";
import NotFound from "./pages/NotFound";
import PrivacyScreen from "./pages/Privacy";
import { BrowseScreen, HomeScreen, MyListScreen, SearchScreen, WatchScreen } from "./pages/Screens";

export default function App() {
  useEffect(() => { loadAccount(); }, []);
  const [location] = useLocation();
  useEffect(() => { trackView(location); }, [location]);
  return <ErrorBoundary>
    <Toaster theme="dark" position="bottom-center" />
    <Onboarding />
    <Switch>
      <Route path="/" component={HomeScreen} />
      <Route path="/home" component={HomeScreen} />
      <Route path="/browse/:cat">{() => <BrowseScreen />}</Route>
      <Route path="/south-africa">{() => <BrowseScreen fixedCountry="ZA" />}</Route>
      <Route path="/live">{() => <BrowseScreen />}</Route>
      <Route path="/channels">{() => <BrowseScreen />}</Route>
      <Route path="/search" component={SearchScreen} />
      <Route path="/my-list" component={MyListScreen} />
      <Route path="/favorites" component={MyListScreen} />
      <Route path="/watch/:id" component={WatchScreen} />
      <Route path="/reset" component={ResetScreen} />
      <Route path="/privacy" component={PrivacyScreen} />
      <Route path="/admin" component={AdminScreen} />
      <Route component={NotFound} />
    </Switch>
  </ErrorBoundary>;
}
