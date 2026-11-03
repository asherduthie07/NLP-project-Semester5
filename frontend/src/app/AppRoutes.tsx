import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { Skeleton } from '../components/ui';
import { destinations } from './nav';

const Shell = lazy(() => import('./shell/Shell').then(module => ({ default: module.Shell })));
const NotFoundPage = lazy(() => import('./shell/Shell').then(module => ({ default: module.NotFoundPage })));
const PendingPage = lazy(() => import('./pages/pages').then(module => ({ default: module.PendingPage })));
const SettingsPage = lazy(() => import('./pages/pages').then(module => ({ default: module.SettingsPage })));
const HelpPage = lazy(() => import('./pages/pages').then(module => ({ default: module.HelpPage })));
const OverviewPage = lazy(() => import('./pages/overview/OverviewPage').then(module => ({ default: module.OverviewPage })));
const ExplorerPage = lazy(() => import('./pages/explorer/ExplorerPage').then(module => ({ default: module.ExplorerPage })));
const VerificationPage = lazy(() => import('./pages/verification/VerificationPage').then(module => ({ default: module.VerificationPage })));
const DocumentationPage = lazy(() => import('./pages/DocumentationPage').then(module => ({ default: module.DocumentationPage })));
const IntelligencePage = lazy(() => import('./pages/DocumentationPage').then(module => ({ default: module.IntelligencePage })));
const ExportsPage = lazy(() => import('./pages/DocumentationPage').then(module => ({ default: module.ExportsPage })));
const WorkflowPage = lazy(() => import('./pages/WorkflowPage').then(module => ({ default: module.WorkflowPage })));
const GraphPage = lazy(() => import('./pages/graph/GraphPage').then(module => ({ default: module.GraphPage })));

function PageFallback() {
  return <div className="page-pad" role="status" aria-label="Loading page"><Skeleton width="38%" label="Loading page" /><Skeleton width="72%" label="Loading page" /></div>;
}
const page = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>;

export function appRoutes() {
  return <Route path="/app" element={<Shell />}>
    <Route index element={<Navigate to="/app/overview" replace />} />
    {destinations.map(item => {
      const Page = item.id === 'import' ? WorkflowPage : item.id === 'settings' ? SettingsPage : item.id === 'help' ? HelpPage : item.id === 'overview' ? OverviewPage : item.id === 'graph' ? GraphPage : item.id === 'explorer' ? ExplorerPage : item.id === 'verification' ? VerificationPage : item.id === 'docs' ? DocumentationPage : item.id === 'intelligence' ? IntelligencePage : item.id === 'exports' ? ExportsPage : PendingPage;
      return <Route key={item.id} path={item.path.replace('/app/', '')} element={page(<Page item={item} />)} />;
    })}
    <Route path="*" element={page(<NotFoundPage />)} />
  </Route>;
}
