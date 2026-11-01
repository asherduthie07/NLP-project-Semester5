import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionPreferences } from './lib/MotionPreferences';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './design/tokens.css';
import './design/showcase.css';

const DesignSystem = lazy(() => import('./DesignSystem'));
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><MotionPreferences><Suspense fallback={<p className="muted" role="status">Loading design system…</p>}><Routes><Route path="/design-system" element={<DesignSystem />} /><Route path="/" element={<Navigate to="/design-system" replace />} /><Route path="*" element={<main><h1>Route not available in M1</h1><a href="/design-system">Return to the design system</a></main>} /></Routes></Suspense></MotionPreferences></BrowserRouter></React.StrictMode>,
);
