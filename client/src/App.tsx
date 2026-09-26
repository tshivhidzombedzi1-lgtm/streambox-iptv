import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "sonner";
import { Route, Switch, useLocation } from "wouter";
import { ResetScreen } from "./components/Account";
import ErrorBoundary from "./components/ErrorBoundary";
import Onboarding from "./components/Onboarding";
import { account, loadAccount } from "./lib/account";
import { settings, useStore } from "./lib/catalog";
import { googleOneTap } from "./lib/google";
import { trackView } from "./lib/growth";
import NotFound from "./pages/NotFound";
import { BrowseScreen, HomeScreen, MyListScreen, SearchScreen, WatchScreen } from "./pages/Screens";
const AdminScreen = lazy(() => import("./pages/Admin"));
const AccountScreen = lazy(() => import("./pages/Account"));
const PrivacyScreen = lazy(() => import("./pages/Privacy"));
const TermsScreen = lazy(() => import("./pages/Terms"));
const TvGuideScreen = lazy(() => import("./pages/TvGuide"));
const AboutScreen = lazy(() => import("./pages/About"));
const AdvertiseScreen = lazy(() => import("./pages/Advertise"));
const PremiumScreen = lazy(() => import("./pages/Premium"));

let oneTapShown = false;

export default function App() {
  useEffect(() => { loadAccount(); }, []);
  const [location] = useLocation();
  useEffect(() => { trackView(location); }, [location]);
  // Google One Tap for signed-out visitors (auto sign-in for returning ones), once per
  // visit, after onboarding and never on the player.
  const { user, ready } = useStore(account);
  const { onboarded } = useStore(settings);
  useEffect(() => {
    if (ready && !user && onboarded && !location.startsWith("/watch") && !oneTapShown) { oneTapShown = true; googleOneTap(); }
  }, [ready, user, onboarded, location]);
  return <ErrorBoundary>
    <Toaster theme="dark" position="bottom-center" />
    <Onboarding />
    <Suspense fallback={<div className="app"><div className="state"><div className="loader" /></div></div>}>
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
      <Route path="/terms" component={TermsScreen} />
      <Route path="/tv-guide" component={TvGuideScreen} />
      <Route path="/about" component={AboutScreen} />
      <Route path="/advertise" component={AdvertiseScreen} />
      <Route path="/premium" component={PremiumScreen} />
      <Route path="/account" component={AccountScreen} />
      <Route path="/admin" component={AdminScreen} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  </ErrorBoundary>;
}
