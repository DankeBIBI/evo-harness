import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

import App from './App';
import { initHost } from './lib/hostApi';

import './index.css';

// REFACTOR-PLAN Phase 4: 启动时初始化 host adapter(注册到 shared registry)
initHost();

ReactDOM.createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
