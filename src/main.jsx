import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { OfficialLibraryManager } from '@/lib/officialLibraryManager'
import '@/lib/DebugRuntime.js'
import '@/lib/mcp-client/GoogleWorkspaceMCPClient.js'

// Inicializa a Biblioteca Oficial antes de renderizar o app.
console.log('[DIAG][main] OfficialLibraryManager.load() iniciado');
OfficialLibraryManager.load().finally(() => {
  console.log('[DIAG][main] OfficialLibraryManager.load() finalizado — montando React');
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
  // Pré-carrega os módulos de raciocínio em background para que o bundle
  // já esteja parseado quando a primeira mensagem do usuário chegar.
  // Sem await — não bloqueia a renderização.
  Promise.all([
    import('@/lib/memoryPipeline.js'),
    import('@/lib/reasoning/memoryReasoningPlanner.js'),
  ]).catch(() => {/* silencioso — só pré-aquecimento */});
})