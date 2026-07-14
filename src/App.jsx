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
import Sprint1Review from '@/pages/Sprint1Review';
import MersSystem from '@/pages/MersSystem';
import MadsSystem from '@/pages/MadsSystem';
import MeomSystem from '@/pages/MeomSystem';
import MdokSystem from '@/pages/MdokSystem';
import MipSystem from '@/pages/MipSystem';
import MeemSystem from '@/pages/MeemSystem';
import Sprint1WME from '@/pages/Sprint1WME';
import ReviewEngineRegistryPage from '@/pages/ReviewEngineRegistry';
import Capabilities from '@/pages/Capabilities';
import Journeys from '@/pages/Journeys';
import Goals from '@/pages/Goals';
import Planner from '@/pages/Planner';
import PlanningIntelligence from '@/pages/PlanningIntelligence';
import SpecialistRouterPage from '@/pages/SpecialistRouter';
import StrategyFusion from '@/pages/StrategyFusion';
import ConnectorRuntimePage from '@/pages/ConnectorRuntime';
import ConnectorRuntimeCertification from '@/pages/ConnectorRuntimeCertification';
import CapabilityRuntimePage from '@/pages/CapabilityRuntime';
import ABVPage from '@/pages/ABVPage';
import ABVSprintPage from '@/pages/ABVSprintPage';
import FCESprintPage from '@/pages/FCESprintPage';
import GoalRuntimePage from '@/pages/GoalRuntimePage';
import GoalRegistryServicePage from '@/pages/GoalRegistryServicePage';
import GoalSchedulerPage from '@/pages/GoalSchedulerPage';
import GoalExecutionQueuePage from '@/pages/GoalExecutionQueuePage';
import ExecutionDispatcherPage from '@/pages/ExecutionDispatcherPage';
import DecisionEnginePage from '@/pages/DecisionEnginePage';
import PlanningEnginePage from '@/pages/PlanningEnginePage';
import ReflectionEnginePage from '@/pages/ReflectionEnginePage';
import SelfEvaluationEnginePage from '@/pages/SelfEvaluationEnginePage';
import KnowledgeEnginePage from '@/pages/KnowledgeEnginePage';
import LearningEnginePage from '@/pages/LearningEnginePage';
import MemoryEnginePage from '@/pages/MemoryEnginePage';
import RetrievalEnginePage from '@/pages/RetrievalEnginePage';
import CognitivePipeline from '@/pages/CognitivePipeline';
import CapabilityRegistryPage from '@/pages/CapabilityRegistryPage';
import CognitivePipelineAdapterPage from '@/pages/CognitivePipelineAdapterPage';
import ConnectorRuntimeFoundationPage from '@/pages/ConnectorRuntimePage';
import EF31APage from '@/pages/EF31APage';
import EF31BPage from '@/pages/EF31BPage';
import EF31CPage from '@/pages/EF31CPage';
import EF32Page from '@/pages/EF32Page';
import EF32BPage from '@/pages/EF32BPage';
import EF33APage from '@/pages/EF33APage';
import EF33BPage from '@/pages/EF33BPage';
import ConnectorRuntimeValidationPage from '@/pages/ConnectorRuntimeValidationPage';
import EF36APage from '@/pages/EF36APage';
import EF36BPage from '@/pages/EF36BPage';
import EF36CPage from '@/pages/EF36CPage';
import EF36DPage from '@/pages/EF36DPage';
import EF36EPage from '@/pages/EF36EPage';
import EF36FPage from '@/pages/EF36FPage';
import EF36GPage from '@/pages/EF36GPage';
import EF36HPage from '@/pages/EF36HPage';
import EF36IPage from '@/pages/EF36IPage';
import Beta01Page from '@/pages/Beta01Page';
import Beta011Page from '@/pages/Beta011Page';
import Beta02Page from '@/pages/Beta02Page';
import Beta03Page from '@/pages/Beta03Page';
import Beta031Page from '@/pages/Beta031Page';
import Beta032Page from '@/pages/Beta032Page';
import Beta033Page from '@/pages/Beta033Page';
import Phase5Page from '@/pages/Phase5Page';
import Phase51Page from '@/pages/Phase51Page';
import Phase52Page from '@/pages/Phase52Page';
import OperationalAuditPage from '@/pages/OperationalAuditPage';
import Phase53Page from '@/pages/Phase53Page';
import CoreValidationReportPage from '@/pages/CoreValidationReportPage';
import Phase54Page from '@/pages/Phase54Page';
import Phase55Page from '@/pages/Phase55Page';
import Phase56Page from '@/pages/Phase56Page';
import Phase561Page from '@/pages/Phase561Page';
import Phase562Page from '@/pages/Phase562Page';
import Phase563Page from '@/pages/Phase563Page';
import Phase570Page from '@/pages/Phase570Page';
import Phase58Page from '@/pages/Phase58Page';
import Phase58ValidationPage from '@/pages/Phase58ValidationPage';
import Phase581Page from '@/pages/Phase581Page';
import Phase59Page from '@/pages/Phase59Page';
import Phase60Page from '@/pages/Phase60Page';
import Phase601Page from '@/pages/Phase601Page';
import Phase602Page from '@/pages/Phase602Page';
import Phase603Page from '@/pages/Phase603Page';
import Phase604Page from '@/pages/Phase604Page';
import Phase610Page from '@/pages/Phase610Page';
import Phase620Page from '@/pages/Phase620Page';

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
          <Route path="/sprint1-review" element={<Sprint1Review />} />
          <Route path="/mers" element={<MersSystem />} />
          <Route path="/mads" element={<MadsSystem />} />
          <Route path="/meom" element={<MeomSystem />} />
          <Route path="/mdok" element={<MdokSystem />} />
          <Route path="/mip" element={<MipSystem />} />
          <Route path="/meem" element={<MeemSystem />} />
          <Route path="/sprint1-wme" element={<Sprint1WME />} />
          <Route path="/review-registry" element={<ReviewEngineRegistryPage />} />
          <Route path="/capabilities" element={<Capabilities />} />
          <Route path="/journeys" element={<Journeys />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/planning-intelligence" element={<PlanningIntelligence />} />
          <Route path="/specialist-router" element={<SpecialistRouterPage />} />
          <Route path="/strategy-fusion" element={<StrategyFusion />} />
          <Route path="/connector-runtime" element={<ConnectorRuntimePage />} />
          <Route path="/certification" element={<ConnectorRuntimeCertification />} />
          <Route path="/capability-runtime" element={<CapabilityRuntimePage />} />
          <Route path="/abv" element={<ABVPage />} />
          <Route path="/abv-sprint" element={<ABVSprintPage />} />
          <Route path="/fce" element={<FCESprintPage />} />
          <Route path="/goal-runtime" element={<GoalRuntimePage />} />
          <Route path="/goal-registry-service" element={<GoalRegistryServicePage />} />
          <Route path="/goal-scheduler" element={<GoalSchedulerPage />} />
          <Route path="/goal-execution-queue" element={<GoalExecutionQueuePage />} />
          <Route path="/execution-dispatcher" element={<ExecutionDispatcherPage />} />
          <Route path="/decision-engine" element={<DecisionEnginePage />} />
          <Route path="/planning-engine" element={<PlanningEnginePage />} />
          <Route path="/reflection-engine" element={<ReflectionEnginePage />} />
          <Route path="/self-evaluation-engine" element={<SelfEvaluationEnginePage />} />
          <Route path="/knowledge-engine" element={<KnowledgeEnginePage />} />
          <Route path="/learning-engine" element={<LearningEnginePage />} />
          <Route path="/memory-engine-v1" element={<MemoryEnginePage />} />
          <Route path="/retrieval-engine" element={<RetrievalEnginePage />} />
          <Route path="/cognitive-pipeline" element={<CognitivePipeline />} />
          <Route path="/capability-registry" element={<CapabilityRegistryPage />} />
          <Route path="/cognitive-pipeline-adapter" element={<CognitivePipelineAdapterPage />} />
          <Route path="/connector-runtime-ef31" element={<ConnectorRuntimeFoundationPage />} />
          <Route path="/ef31a" element={<EF31APage />} />
          <Route path="/ef31b" element={<EF31BPage />} />
          <Route path="/ef31c" element={<EF31CPage />} />
          <Route path="/ef32" element={<EF32Page />} />
          <Route path="/ef32b" element={<EF32BPage />} />
          <Route path="/ef33a" element={<EF33APage />} />
          <Route path="/ef33b" element={<EF33BPage />} />
          <Route path="/connector-validation" element={<ConnectorRuntimeValidationPage />} />
          <Route path="/ef36a" element={<EF36APage />} />
          <Route path="/ef36b" element={<EF36BPage />} />
          <Route path="/ef36c" element={<EF36CPage />} />
          <Route path="/ef36d" element={<EF36DPage />} />
          <Route path="/ef36e" element={<EF36EPage />} />
          <Route path="/ef36f" element={<EF36FPage />} />
          <Route path="/ef36g" element={<EF36GPage />} />
          <Route path="/ef36h" element={<EF36HPage />} />
          <Route path="/ef36i" element={<EF36IPage />} />
          <Route path="/beta01" element={<Beta01Page />} />
          <Route path="/beta011" element={<Beta011Page />} />
          <Route path="/beta02" element={<Beta02Page />} />
          <Route path="/beta03" element={<Beta03Page />} />
          <Route path="/beta031" element={<Beta031Page />} />
          <Route path="/beta032" element={<Beta032Page />} />
          <Route path="/beta033" element={<Beta033Page />} />
          <Route path="/phase5" element={<Phase5Page />} />
          <Route path="/phase51" element={<Phase51Page />} />
          <Route path="/phase52" element={<Phase52Page />} />
          <Route path="/op-audit" element={<OperationalAuditPage />} />
          <Route path="/phase53" element={<Phase53Page />} />
          <Route path="/core-validation" element={<CoreValidationReportPage />} />
          <Route path="/phase54" element={<Phase54Page />} />
          <Route path="/phase55" element={<Phase55Page />} />
          <Route path="/phase56" element={<Phase56Page />} />
          <Route path="/phase561" element={<Phase561Page />} />
          <Route path="/phase562" element={<Phase562Page />} />
          <Route path="/phase563" element={<Phase563Page />} />
          <Route path="/phase570" element={<Phase570Page />} />
          <Route path="/phase58" element={<Phase58Page />} />
          <Route path="/phase58-validation" element={<Phase58ValidationPage />} />
          <Route path="/phase581" element={<Phase581Page />} />
          <Route path="/phase59" element={<Phase59Page />} />
          <Route path="/phase60" element={<Phase60Page />} />
          <Route path="/phase601" element={<Phase601Page />} />
          <Route path="/phase602" element={<Phase602Page />} />
          <Route path="/phase603" element={<Phase603Page />} />
          <Route path="/phase604" element={<Phase604Page />} />
          <Route path="/phase610" element={<Phase610Page />} />
          <Route path="/phase620" element={<Phase620Page />} />
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