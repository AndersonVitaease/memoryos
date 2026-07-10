import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import ChatPage from '@/pages/ChatPage';
import Memory from '@/pages/Memory';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import SearchPage from '@/pages/SearchPage';
import Connections from '@/pages/Connections';
import ArchitectureAudit from '@/pages/ArchitectureAudit';
import MemoryEngine from '@/pages/MemoryEngine';
import CognitiveEngine from '@/pages/CognitiveEngine';
import MriValidation from '@/pages/MriValidation';
import MqccsValidation from '@/pages/MqccsValidation';
import MpegsGovernance from '@/pages/MpegsGovernance';
import Foundation from '@/pages/Foundation';
import DeveloperHandbook from '@/pages/DeveloperHandbook';
import ApiReference from '@/pages/ApiReference';
import ExecutionModel from '@/pages/ExecutionModel';
import EngineeringBacklog from '@/pages/EngineeringBacklog';
import Sprint1Validation from '@/pages/Sprint1Validation';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/audit" element={<ArchitectureAudit />} />
          <Route path="/memory-engine" element={<MemoryEngine />} />
          <Route path="/cognitive-engine" element={<CognitiveEngine />} />
          <Route path="/mri" element={<MriValidation />} />
          <Route path="/mqccs" element={<MqccsValidation />} />
          <Route path="/mpegs" element={<MpegsGovernance />} />
          <Route path="/foundation" element={<Foundation />} />
          <Route path="/developer-handbook" element={<DeveloperHandbook />} />
          <Route path="/api-reference" element={<ApiReference />} />
          <Route path="/execution-model" element={<ExecutionModel />} />
          <Route path="/engineering-backlog" element={<EngineeringBacklog />} />
          <Route path="/sprint1" element={<Sprint1Validation />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App