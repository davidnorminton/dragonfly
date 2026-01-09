import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MusicPlayerProvider } from './contexts/MusicPlayerContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MusicPlayerProvider>
      <App />
    </MusicPlayerProvider>
  </StrictMode>,
)
