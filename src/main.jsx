import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { OfficialLibraryManager } from '@/lib/officialLibraryManager'

// Inicializa a Biblioteca Oficial antes de renderizar o app.
// Garante que Core e Specialists tenham acesso imediato aos documentos.
console.log('[DIAG][main] OfficialLibraryManager.load() iniciado');
OfficialLibraryManager.load().finally(() => {
  console.log('[DIAG][main] OfficialLibraryManager.load() finalizado — montando React');
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
})