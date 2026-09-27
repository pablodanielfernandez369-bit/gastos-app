import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'
import AccessGate from './components/AccessGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AccessGate>
      <Root />
    </AccessGate>
  </StrictMode>,
)
