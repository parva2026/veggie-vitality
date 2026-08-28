import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { VeggieTracker } from './components/VeggieTracker.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <VeggieTracker />
    </ErrorBoundary>
  );
}
