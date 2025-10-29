import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { CourseColorProvider } from './context/CourseColorContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <AuthProvider>
    <CourseColorProvider>
      <App />
    </CourseColorProvider>
  </AuthProvider>
);