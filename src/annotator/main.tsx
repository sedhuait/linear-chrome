import React from 'react';
import ReactDOM from 'react-dom/client';
import { AnnotatorApp } from './AnnotatorApp';
import './annotator.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AnnotatorApp />
    </React.StrictMode>
  );
}
