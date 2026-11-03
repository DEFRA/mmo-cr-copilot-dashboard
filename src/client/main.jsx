import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { markGovukFrontendSupported } from './lib/govuk-support.js'
import './styles/application.scss'

markGovukFrontendSupported(document.body)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
