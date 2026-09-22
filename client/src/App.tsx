import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import NotFound from "./pages/NotFound";
import { BrowseScreen, ChannelDetail, documentaryChannels, FavoritesScreen, musicChannels, newsChannels, PlaceholderScreen, ProfileSelector, StreamingHome, WatchScreen } from "./pages/StreamingScreens";

function Router() {
  return <Switch>
    <Route path="/" component={ProfileSelector} />
    <Route path="/profiles" component={ProfileSelector} />
    <Route path="/home" component={StreamingHome} />
    <Route path="/live" component={() => <BrowseScreen title="Live TV" kicker="Now playing around the world" />} />
    <Route path="/channels" component={() => <BrowseScreen title="Channel directory" kicker="Search every connected live source" />} />
    <Route path="/channels/:channelId" component={ChannelDetail} />
    <Route path="/watch/:contentId" component={WatchScreen} />
    <Route path="/news" component={() => <BrowseScreen title="World news" kicker="Live headlines and rolling coverage" channels={newsChannels} />} />
    <Route path="/sports" component={() => <BrowseScreen title="Sports" kicker="Live sports channels" />} />
    <Route path="/movies" component={() => <PlaceholderScreen title="Movies" kicker="Cinema on demand" />} />
    <Route path="/movies/:movieId" component={() => <PlaceholderScreen title="Movie details" kicker="Now viewing" />} />
    <Route path="/series" component={() => <PlaceholderScreen title="Series" kicker="Your shows" />} />
    <Route path="/series/:seriesId" component={() => <PlaceholderScreen title="Series details" kicker="Your show" />} />
    <Route path="/favorites" component={FavoritesScreen} />
    <Route path="/search" component={() => <BrowseScreen title="Search" kicker="Find channels, programmes, and more" />} />
    <Route path="/guide" component={() => <PlaceholderScreen title="TV Guide" kicker="Now, next, and tonight" />} />
    <Route path="/profile" component={() => <PlaceholderScreen title="Profile" kicker="Your viewing identity" />} />
    <Route path="/settings" component={() => <PlaceholderScreen title="Settings" kicker="Playback and account preferences" />} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster theme="dark" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
