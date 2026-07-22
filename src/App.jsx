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
import Phase611Page from '@/pages/Phase611Page';
import Phase620Page from '@/pages/Phase620Page';
import Phase621Page from '@/pages/Phase621Page';
import Phase622Page from '@/pages/Phase622Page';
import Phase623Page from '@/pages/Phase623Page';
import Phase624Page from '@/pages/Phase624Page';
import Phase630Page from '@/pages/Phase630Page';
import Phase631Page from '@/pages/Phase631Page';
import Phase632Page from '@/pages/Phase632Page';
import Phase633Page from '@/pages/Phase633Page';
import Phase634Page from '@/pages/Phase634Page';
import Phase635Page from '@/pages/Phase635Page';
import Phase640Page from '@/pages/Phase640Page';
import Phase641Page from '@/pages/Phase641Page';
import Phase641aPage from '@/pages/Phase641aPage';
import Phase642Page from '@/pages/Phase642Page';
import Phase642aPage from '@/pages/Phase642aPage';
import Phase643Page from '@/pages/Phase643Page';
import Phase710Page from '@/pages/Phase710Page';
import Phase700Page from '@/pages/Phase700Page';
// Phase700Page replaced by Sprint 7.0 GWS Foundation dashboard (same route)
import Phase711Page from '@/pages/Phase711Page';
import GoogleDrivePage from '@/pages/GoogleDrivePage';
import GoogleCalendarPage from '@/pages/GoogleCalendarPage';
import MultiConnectorPage from '@/pages/MultiConnectorPage';
import MissionsPage from '@/pages/MissionsPage';
// Sprint 7.0.1 — Gmail GWS Integration (Phase711Page already imported above)
import Phase712Page from '@/pages/Phase712Page';
import Phase713Page from '@/pages/Phase713Page';
import Phase714Page from '@/pages/Phase714Page';
import GoogleOAuthCallback from '@/pages/GoogleOAuthCallback';
import SprintE021Page from '@/pages/SprintE021Page';
import SprintE023Page from '@/pages/SprintE023Page';
import SprintE024Page from '@/pages/SprintE024Page';
import SprintE025Page from '@/pages/SprintE025Page';
import SprintE025aPage from '@/pages/SprintE025aPage';
import SprintE026Page from '@/pages/SprintE026Page';
import SprintE026bPage from '@/pages/SprintE026bPage';
import SprintE027Page from '@/pages/SprintE027Page';
import SprintE028Page from '@/pages/SprintE028Page';
import SprintE029Page from '@/pages/SprintE029Page';
import GmailCertificationPage from '@/pages/GmailCertificationPage';
import SprintE921Page from '@/pages/SprintE921Page';
import SprintE922Page from '@/pages/SprintE922Page';
import GmailProductionCertPage from '@/pages/GmailProductionCertPage';
import CertificationCenterPage from '@/pages/CertificationCenterPage';
import Sprint811Page from '@/pages/Sprint811Page';
import Sprint812Page from '@/pages/Sprint812Page';
import SprintC022Page from '@/pages/SprintC022Page';
import SprintC023Page from '@/pages/SprintC023Page';
import SprintC024Page from '@/pages/SprintC024Page';
import SprintC030Page from '@/pages/SprintC030Page';
import SprintC036Page from '@/pages/SprintC036Page';
import SprintC0361Page from '@/pages/SprintC0361Page';
import SprintC0363Page from '@/pages/SprintC0363Page';
import SprintC0364Page from '@/pages/SprintC0364Page';
import SprintC040Page from '@/pages/SprintC040Page';
import SprintP011APage from '@/pages/SprintP011APage';
import SprintP011BPage from '@/pages/SprintP011BPage';
import SprintP011CPage from '@/pages/SprintP011CPage';
import AVPPage from '@/pages/AVPPage';
import SprintP012Page from '@/pages/SprintP012Page';
import SprintEF63Page from '@/pages/SprintEF63Page';
import SprintEF631Page from '@/pages/SprintEF631Page';
import SprintEF632Page from '@/pages/SprintEF632Page';
import SprintEF640Page from '@/pages/SprintEF640Page';
import SprintEF650Page from '@/pages/SprintEF650Page';
import SprintEF660Page from '@/pages/SprintEF660Page';
import SprintEF661Page from '@/pages/SprintEF661Page';
import SprintEF670Page from '@/pages/SprintEF670Page';
import Phase720Page from '@/pages/Phase720Page';
import Phase730Page from '@/pages/Phase730Page';
import SprintP020Page from '@/pages/SprintP020Page';
import SprintP021Page from '@/pages/SprintP021Page';
import BetaSprint01Page from '@/pages/BetaSprint01Page';
import SprintOL01Page from '@/pages/SprintOL01Page';
import SprintOL02Page from '@/pages/SprintOL02Page';
import PhaseKB01Page from '@/pages/PhaseKB01Page';
import PhaseKB02Page from '@/pages/PhaseKB02Page';
import PhaseKB03Page from '@/pages/PhaseKB03Page';
import PhaseKB04Page from '@/pages/PhaseKB04Page';
import PhaseKB05Page from '@/pages/PhaseKB05Page';
import PhaseIntegration01Page from '@/pages/PhaseIntegration01Page';
import PhaseIntegration02Page from '@/pages/PhaseIntegration02Page';
import PhaseIntegration03Page from '@/pages/PhaseIntegration03Page';
import PhaseIntegration04Page from '@/pages/PhaseIntegration04Page';
import PhaseIntegration05Page from '@/pages/PhaseIntegration05Page';
import PlatformAuditPage from '@/pages/PlatformAuditPage';
import PhaseEV1Page from '@/pages/PhaseEV1Page';
import PhaseEV2Page from '@/pages/PhaseEV2Page';
import PhaseEV4Page from '@/pages/PhaseEV4Page';
import PhaseEV4BPage from '@/pages/PhaseEV4BPage';
import PhaseEV5Page from '@/pages/PhaseEV5Page';
import ProductionDashboard from '@/pages/ProductionDashboard';
import PhaseEF36Page from '@/pages/PhaseEF36Page';
import KnowledgeIngestionDashboard from '@/pages/KnowledgeIngestionDashboard';
import PhaseEF38Page from '@/pages/PhaseEF38Page';
import PhaseEF381Page from '@/pages/PhaseEF381Page';
import PhaseEF39Page from '@/pages/PhaseEF39Page';
import PhaseEF393Page from '@/pages/PhaseEF393Page';
import EF398CertPage from '@/pages/EF398CertPage';
import DriveDebugPanel from '@/pages/DriveDebugPanel';
import TokenLifecycleTestPage from '@/pages/TokenLifecycleTestPage';
import RuntimeTracePage from '@/pages/RuntimeTracePage';
import GmailReadEmailTestPage from '@/pages/GmailReadEmailTestPage';
import SprintM15Page from '@/pages/SprintM15Page';
import SprintM19AuditPage from '@/pages/SprintM19AuditPage';
import SprintM110AuditPage from '@/pages/SprintM110AuditPage';
import DriveAuditPanel from '@/pages/DriveAuditPanel';
import GitHubDebugPanel from '@/pages/GitHubDebugPanel';
import EF399ValidationPage from '@/pages/EF399ValidationPage';
import RegressionTest271Page from '@/pages/RegressionTest271Page';
import EOACertificationPage from '@/pages/EOACertificationPage';
import SprintEF401Page from '@/pages/SprintEF401Page';
import SprintEF402Page from '@/pages/SprintEF402Page';
import OfficialLibraryFlowPage from '@/pages/OfficialLibraryFlowPage';
import ComponentOriginAuditPage from '@/pages/ComponentOriginAuditPage';
import SprintEF403Page from '@/pages/SprintEF403Page';
import SprintEF404Page from '@/pages/SprintEF404Page';
import SprintEF405Page from '@/pages/SprintEF405Page';
import UCMEShadowDiagnosticsPage from '@/pages/UCMEShadowDiagnosticsPage';
import SprintEF407Page from '@/pages/SprintEF407Page';
import SprintEF407aPage from '@/pages/SprintEF407aPage';
import SprintEF408Page from '@/pages/SprintEF408Page';
import SprintEF408BPage from '@/pages/SprintEF408BPage';
import SprintEF41Page from '@/pages/SprintEF41Page';
import SprintEF41APage from '@/pages/SprintEF41APage';
import SprintEF42Page from '@/pages/SprintEF42Page';
import SprintEF425Page from '@/pages/SprintEF425Page';
import SprintEF426Page from '@/pages/SprintEF426Page';
import SprintEF427Page from '@/pages/SprintEF427Page';
import SprintEF428Page from '@/pages/SprintEF428Page';
import SprintEF429Page from '@/pages/SprintEF429Page';
import SprintEF4210Page from '@/pages/SprintEF4210Page';
import SprintEF43Page from '@/pages/SprintEF43Page';
import SprintEF45Page from '@/pages/SprintEF45Page';
import SprintEF46Page from '@/pages/SprintEF46Page';
import SprintEF47Page from '@/pages/SprintEF47Page';
import SprintEF48Page from '@/pages/SprintEF48Page';
import SprintEF49Page from '@/pages/SprintEF49Page';
import SprintEF491Page from '@/pages/SprintEF491Page';
import SprintEF492Page from '@/pages/SprintEF492Page';
import SprintEF51Page from '@/pages/SprintEF51Page';
import SprintEF52Page from '@/pages/SprintEF52Page';
import SprintEF53Page from '@/pages/SprintEF53Page';
import SprintEF54Page from '@/pages/SprintEF54Page';
import SprintEF555Page from '@/pages/SprintEF555Page';
import ArchitecturalCertPage from '@/pages/ArchitecturalCertPage';
import SprintEF554RecertPage from '@/pages/SprintEF554RecertPage';
import SprintEF56OperationalCertPage from '@/pages/SprintEF56OperationalCertPage';
import SprintEF57Page from '@/pages/SprintEF57Page';
import SprintEF58ValidationPage from '@/pages/SprintEF58ValidationPage';

const AuthenticatedApp = () => {
  console.log('[RENDER] AuthenticatedApp');
  console.log('[CHAIN][1-App] AuthenticatedApp RENDER START');
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    console.log('[CHAIN][1-App] AuthenticatedApp → SPINNER (loading) — isLoadingPublicSettings:', isLoadingPublicSettings, '| isLoadingAuth:', isLoadingAuth);
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin"></div>
      </div>
    );
  }
  console.log('[CHAIN][1-App] AuthenticatedApp → PASSOU DO SPINNER → renderizando Routes. authError:', authError?.type ?? null);

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  console.log('[CHAIN][1-App] AuthenticatedApp → RETORNANDO <Routes> JSX');
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
          <Route path="/phase611" element={<Phase611Page />} />
          <Route path="/phase620" element={<Phase620Page />} />
          <Route path="/phase621" element={<Phase621Page />} />
          <Route path="/phase622" element={<Phase622Page />} />
          <Route path="/phase623" element={<Phase623Page />} />
          <Route path="/phase624" element={<Phase624Page />} />
          <Route path="/phase630" element={<Phase630Page />} />
          <Route path="/phase631" element={<Phase631Page />} />
          <Route path="/phase632" element={<Phase632Page />} />
          <Route path="/phase633" element={<Phase633Page />} />
          <Route path="/phase634" element={<Phase634Page />} />
          <Route path="/phase635" element={<Phase635Page />} />
          <Route path="/phase640" element={<Phase640Page />} />
          <Route path="/phase641" element={<Phase641Page />} />
          <Route path="/phase641a" element={<Phase641aPage />} />
          <Route path="/phase642" element={<Phase642Page />} />
          <Route path="/phase642a" element={<Phase642aPage />} />
          <Route path="/phase643" element={<Phase643Page />} />
          <Route path="/phase710" element={<Phase710Page />} />
          <Route path="/phase700" element={<Phase700Page />} />
          <Route path="/phase711" element={<Phase711Page />} />
          <Route path="/google-drive" element={<GoogleDrivePage />} />
          <Route path="/calendar" element={<GoogleCalendarPage />} />
          <Route path="/multi-connector" element={<MultiConnectorPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/phase712" element={<Phase712Page />} />
          <Route path="/phase713" element={<Phase713Page />} />
          <Route path="/phase714" element={<Phase714Page />} />
          <Route path="/sprint-e021" element={<SprintE021Page />} />
          <Route path="/sprint-e023" element={<SprintE023Page />} />
          <Route path="/sprint-e024" element={<SprintE024Page />} />
          <Route path="/sprint-e025" element={<SprintE025Page />} />
          <Route path="/sprint-e025a" element={<SprintE025aPage />} />
          <Route path="/sprint-e026" element={<SprintE026Page />} />
          <Route path="/sprint-e026b" element={<SprintE026bPage />} />
          <Route path="/sprint-e027" element={<SprintE027Page />} />
          <Route path="/sprint-e028" element={<SprintE028Page />} />
          <Route path="/sprint-e029" element={<SprintE029Page />} />
          <Route path="/gmail-certification" element={<GmailCertificationPage />} />
          <Route path="/gmail-production-certification" element={<GmailProductionCertPage />} />
          <Route path="/certification-center" element={<CertificationCenterPage />} />
          <Route path="/sprint-e921" element={<SprintE921Page />} />
          <Route path="/sprint-e922" element={<SprintE922Page />} />
          <Route path="/sprint-811" element={<Sprint811Page />} />
          <Route path="/sprint-812" element={<Sprint812Page />} />
          <Route path="/sprint-c022" element={<SprintC022Page />} />
          <Route path="/sprint-c023" element={<SprintC023Page />} />
          <Route path="/sprint-c024" element={<SprintC024Page />} />
          <Route path="/sprint-c030" element={<SprintC030Page />} />
          <Route path="/sprint-c036" element={<SprintC036Page />} />
          <Route path="/sprint-c0361" element={<SprintC0361Page />} />
          <Route path="/sprint-c0363" element={<SprintC0363Page />} />
          <Route path="/sprint-c0364" element={<SprintC0364Page />} />
          <Route path="/sprint-c040" element={<SprintC040Page />} />
          <Route path="/sprint-p011a" element={<SprintP011APage />} />
          <Route path="/sprint-p011b" element={<SprintP011BPage />} />
          <Route path="/sprint-p011c" element={<SprintP011CPage />} />
          <Route path="/avp" element={<AVPPage />} />
          <Route path="/sprint-p012" element={<SprintP012Page />} />
          <Route path="/sprint-ef63" element={<SprintEF63Page />} />
          <Route path="/sprint-ef631" element={<SprintEF631Page />} />
          <Route path="/sprint-ef632" element={<SprintEF632Page />} />
          <Route path="/sprint-ef640" element={<SprintEF640Page />} />
          <Route path="/sprint-ef650" element={<SprintEF650Page />} />
          <Route path="/sprint-ef660" element={<SprintEF660Page />} />
          <Route path="/sprint-ef661" element={<SprintEF661Page />} />
          <Route path="/sprint-ef670" element={<SprintEF670Page />} />
          <Route path="/phase720" element={<Phase720Page />} />
          <Route path="/phase730" element={<Phase730Page />} />
          <Route path="/sprint-p020" element={<SprintP020Page />} />
          <Route path="/sprint-p021" element={<SprintP021Page />} />
          <Route path="/beta-sprint-01" element={<BetaSprint01Page />} />
          <Route path="/sprint-ol01" element={<SprintOL01Page />} />
          <Route path="/sprint-ol02" element={<SprintOL02Page />} />
          <Route path="/kb01" element={<PhaseKB01Page />} />
          <Route path="/kb02" element={<PhaseKB02Page />} />
          <Route path="/kb03" element={<PhaseKB03Page />} />
          <Route path="/kb04" element={<PhaseKB04Page />} />
          <Route path="/kb05" element={<PhaseKB05Page />} />
          <Route path="/integration01" element={<PhaseIntegration01Page />} />
          <Route path="/integration02" element={<PhaseIntegration02Page />} />
          <Route path="/integration03" element={<PhaseIntegration03Page />} />
          <Route path="/integration04" element={<PhaseIntegration04Page />} />
          <Route path="/integration05" element={<PhaseIntegration05Page />} />
          <Route path="/platform-audit" element={<PlatformAuditPage />} />
          <Route path="/ev1" element={<PhaseEV1Page />} />
          <Route path="/ev2" element={<PhaseEV2Page />} />
          <Route path="/ev4" element={<PhaseEV4Page />} />
          <Route path="/ev4b" element={<PhaseEV4BPage />} />
          <Route path="/ev5" element={<PhaseEV5Page />} />
          <Route path="/production" element={<ProductionDashboard />} />
          <Route path="/ef36-kde" element={<PhaseEF36Page />} />
          <Route path="/knowledge-ingestion" element={<KnowledgeIngestionDashboard />} />
          <Route path="/ef38-uks" element={<PhaseEF38Page />} />
          <Route path="/ef381-store" element={<PhaseEF381Page />} />
          <Route path="/ef39-memory-store" element={<PhaseEF39Page />} />
          <Route path="/ef393-certification" element={<PhaseEF393Page />} />
          <Route path="/drive-debug" element={<DriveDebugPanel />} />
          <Route path="/token-lifecycle-tests" element={<TokenLifecycleTestPage />} />
          <Route path="/runtime-trace" element={<RuntimeTracePage />} />
          <Route path="/gmail-reademail-test" element={<GmailReadEmailTestPage />} />
          <Route path="/sprint-m15" element={<SprintM15Page />} />
          <Route path="/sprint-m19-audit" element={<SprintM19AuditPage />} />
          <Route path="/sprint-m110-audit" element={<SprintM110AuditPage />} />
          <Route path="/drive-audit" element={<DriveAuditPanel />} />
          <Route path="/github-debug" element={<GitHubDebugPanel />} />
          <Route path="/regression-271" element={<RegressionTest271Page />} />
          <Route path="/eoa-certification" element={<EOACertificationPage />} />
          <Route path="/sprint-ef401" element={<SprintEF401Page />} />
          <Route path="/sprint-ef402" element={<SprintEF402Page />} />
          <Route path="/ol-flow" element={<OfficialLibraryFlowPage />} />
          <Route path="/component-origin-audit" element={<ComponentOriginAuditPage />} />
          <Route path="/sprint-ef403" element={<SprintEF403Page />} />
          <Route path="/sprint-ef404" element={<SprintEF404Page />} />
          <Route path="/sprint-ef405" element={<SprintEF405Page />} />
          <Route path="/ucme-shadow" element={<UCMEShadowDiagnosticsPage />} />
          <Route path="/sprint-ef407" element={<SprintEF407Page />} />
          <Route path="/sprint-ef407a" element={<SprintEF407aPage />} />
          <Route path="/sprint-ef408" element={<SprintEF408Page />} />
          <Route path="/sprint-ef408b" element={<SprintEF408BPage />} />
          <Route path="/sprint-ef41" element={<SprintEF41Page />} />
          <Route path="/sprint-ef41a" element={<SprintEF41APage />} />
          <Route path="/sprint-ef42" element={<SprintEF42Page />} />
          <Route path="/sprint-ef425" element={<SprintEF425Page />} />
          <Route path="/sprint-ef426" element={<SprintEF426Page />} />
          <Route path="/sprint-ef427" element={<SprintEF427Page />} />
          <Route path="/sprint-ef428" element={<SprintEF428Page />} />
          <Route path="/sprint-ef429" element={<SprintEF429Page />} />
          <Route path="/sprint-ef4210" element={<SprintEF4210Page />} />
          <Route path="/sprint-ef43" element={<SprintEF43Page />} />
          <Route path="/sprint-ef45" element={<SprintEF45Page />} />
          <Route path="/sprint-ef46" element={<SprintEF46Page />} />
          <Route path="/sprint-ef47" element={<SprintEF47Page />} />
          <Route path="/sprint-ef48" element={<SprintEF48Page />} />
          <Route path="/sprint-ef49" element={<SprintEF49Page />} />
          <Route path="/sprint-ef491" element={<SprintEF491Page />} />
          <Route path="/sprint-ef492" element={<SprintEF492Page />} />
          <Route path="/sprint-ef51" element={<SprintEF51Page />} />
          <Route path="/sprint-ef52" element={<SprintEF52Page />} />
          <Route path="/sprint-ef53" element={<SprintEF53Page />} />
          <Route path="/sprint-ef54" element={<SprintEF54Page />} />
          <Route path="/sprint-ef555" element={<SprintEF555Page />} />
          <Route path="/arch-cert" element={<ArchitecturalCertPage />} />
          <Route path="/sprint-ef554" element={<SprintEF554RecertPage />} />
          <Route path="/sprint-ef56" element={<SprintEF56OperationalCertPage />} />
          <Route path="/sprint-ef57" element={<SprintEF57Page />} />
          <Route path="/sprint-ef58-validation" element={<SprintEF58ValidationPage />} />
        </Route>
      </Route>
      <Route path="/oauth/google/callback" element={<GoogleOAuthCallback />} />
      <Route path="/ef398-cert" element={<EF398CertPage />} />
      <Route path="/ef399-validation" element={<EF399ValidationPage />} />
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