import React, { Suspense, lazy } from 'react';
import { AppPlugin } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';

const Gallery = lazy(() => import('./app/Gallery'));

const App = () => (
  <Suspense fallback={<LoadingPlaceholder text="" />}>
    <Gallery />
  </Suspense>
);

export const plugin = new AppPlugin<{}>().setRootPage(App);
