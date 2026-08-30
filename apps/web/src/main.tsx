import { Toast } from '@heroui/react';
import { MantineProvider } from '@mantine/core';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { useEffectiveTheme, useThemeStore } from './store/theme-store.js';
import '@mantine/core/styles.css';
import './styles/index.css';
import '@xyflow/react/dist/style.css';

function Root(): React.JSX.Element {
  const { mode } = useThemeStore();
  const effectiveTheme = useEffectiveTheme(mode);
  return (
    <MantineProvider forceColorScheme={effectiveTheme}>
      <Toast.Provider />
      <App />
    </MantineProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('root not found');
createRoot(root).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
