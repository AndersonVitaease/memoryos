import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ConfirmationProvider } from '@/lib/confirmation/ConfirmationProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
// Phase700Page replaced by Sprint 7.0 GWS Foundation dashboard (same route)
// Sprint 7.0.1 — Gmail GWS Integration (Phase711Page already imported above)

const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Home = lazy(() => import('@/pages/Home'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const Memory = lazy(() => import('@/pages/Memory'));
const Projects = lazy(() => import('@/pages/Projects'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const Connections = lazy(() => import('@/pages/Connections'));
const ConnectorAuthCenter = lazy(() => import('@/pages/ConnectorAuthCenter'));
const ArchitectureAudit = lazy(() => import('@/pages/ArchitectureAudit'));
const Foundation = lazy(() => import('@/pages/Foundation'));
const DeveloperHandbook = lazy(() => import('@/pages/DeveloperHandbook'));
const ApiReference = lazy(() => import('@/pages/ApiReference'));
const ExecutionModel = lazy(() => import('@/pages/ExecutionModel'));
const EngineeringBacklog = lazy(() => import('@/pages/EngineeringBacklog'));
const MersSystem = lazy(() => import('@/pages/MersSystem'));
const MadsSystem = lazy(() => import('@/pages/MadsSystem'));
const MeomSystem = lazy(() => import('@/pages/MeomSystem'));
const MdokSystem = lazy(() => import('@/pages/MdokSystem'));
const MipSystem = lazy(() => import('@/pages/MipSystem'));
const MeemSystem = lazy(() => import('@/pages/MeemSystem'));
const Capabilities = lazy(() => import('@/pages/Capabilities'));
const ConnectorRuntimePage = lazy(() => import('@/pages/ConnectorRuntime'));
const ConnectorRuntimeCertification = lazy(() => import('@/pages/ConnectorRuntimeCertification'));
const CognitivePipeline = lazy(() => import('@/pages/CognitivePipeline'));
const ConnectorRuntimeFoundationPage = lazy(() => import('@/pages/ConnectorRuntimePage'));
const EF31APage = lazy(() => import('@/pages/EF31APage'));
const EF31BPage = lazy(() => import('@/pages/EF31BPage'));
const EF31CPage = lazy(() => import('@/pages/EF31CPage'));
const EF32Page = lazy(() => import('@/pages/EF32Page'));
const EF32BPage = lazy(() => import('@/pages/EF32BPage'));
const EF33APage = lazy(() => import('@/pages/EF33APage'));
const EF33BPage = lazy(() => import('@/pages/EF33BPage'));
const ConnectorRuntimeValidationPage = lazy(() => import('@/pages/ConnectorRuntimeValidationPage'));
const EF36APage = lazy(() => import('@/pages/EF36APage'));
const EF36BPage = lazy(() => import('@/pages/EF36BPage'));
const EF36CPage = lazy(() => import('@/pages/EF36CPage'));
const EF36DPage = lazy(() => import('@/pages/EF36DPage'));
const EF36EPage = lazy(() => import('@/pages/EF36EPage'));
const EF36FPage = lazy(() => import('@/pages/EF36FPage'));
const EF36GPage = lazy(() => import('@/pages/EF36GPage'));
const EF36HPage = lazy(() => import('@/pages/EF36HPage'));
const Beta01Page = lazy(() => import('@/pages/Beta01Page'));
const Beta011Page = lazy(() => import('@/pages/Beta011Page'));
const Beta02Page = lazy(() => import('@/pages/Beta02Page'));
const Beta031Page = lazy(() => import('@/pages/Beta031Page'));
const Beta032Page = lazy(() => import('@/pages/Beta032Page'));
const Phase5Page = lazy(() => import('@/pages/Phase5Page'));
const Phase51Page = lazy(() => import('@/pages/Phase51Page'));
const Phase54Page = lazy(() => import('@/pages/Phase54Page'));
const Phase55Page = lazy(() => import('@/pages/Phase55Page'));
const Phase56Page = lazy(() => import('@/pages/Phase56Page'));
const Phase561Page = lazy(() => import('@/pages/Phase561Page'));
const Phase562Page = lazy(() => import('@/pages/Phase562Page'));
const Phase563Page = lazy(() => import('@/pages/Phase563Page'));
const Phase58Page = lazy(() => import('@/pages/Phase58Page'));
const Phase58ValidationPage = lazy(() => import('@/pages/Phase58ValidationPage'));
const Phase581Page = lazy(() => import('@/pages/Phase581Page'));
const Phase60Page = lazy(() => import('@/pages/Phase60Page'));
const Phase601Page = lazy(() => import('@/pages/Phase601Page'));
const Phase603Page = lazy(() => import('@/pages/Phase603Page'));
const Phase643Page = lazy(() => import('@/pages/Phase643Page'));
const Phase700Page = lazy(() => import('@/pages/Phase700Page'));
const Phase711Page = lazy(() => import('@/pages/Phase711Page'));
const GoogleDrivePage = lazy(() => import('@/pages/GoogleDrivePage'));
const GoogleCalendarPage = lazy(() => import('@/pages/GoogleCalendarPage'));
const MultiConnectorPage = lazy(() => import('@/pages/MultiConnectorPage'));
const MissionsPage = lazy(() => import('@/pages/MissionsPage'));
const Phase712Page = lazy(() => import('@/pages/Phase712Page'));
const GoogleOAuthCallback = lazy(() => import('@/pages/GoogleOAuthCallback'));
const MicrosoftOAuthCallback = lazy(() => import('@/pages/MicrosoftOAuthCallback'));
const GitHubOAuthCallback = lazy(() => import('@/pages/GitHubOAuthCallback'));
const SprintE021Page = lazy(() => import('@/pages/SprintE021Page'));
const SprintE023Page = lazy(() => import('@/pages/SprintE023Page'));
const SprintE024Page = lazy(() => import('@/pages/SprintE024Page'));
const SprintE025Page = lazy(() => import('@/pages/SprintE025Page'));
const SprintE025aPage = lazy(() => import('@/pages/SprintE025aPage'));
const SprintE026Page = lazy(() => import('@/pages/SprintE026Page'));
const SprintE026bPage = lazy(() => import('@/pages/SprintE026bPage'));
const SprintE027Page = lazy(() => import('@/pages/SprintE027Page'));
const SprintE028Page = lazy(() => import('@/pages/SprintE028Page'));
const SprintE029Page = lazy(() => import('@/pages/SprintE029Page'));
const GmailCertificationPage = lazy(() => import('@/pages/GmailCertificationPage'));
const SprintE921Page = lazy(() => import('@/pages/SprintE921Page'));
const SprintE922Page = lazy(() => import('@/pages/SprintE922Page'));
const GmailProductionCertPage = lazy(() => import('@/pages/GmailProductionCertPage'));
const Sprint811Page = lazy(() => import('@/pages/Sprint811Page'));
const Sprint812Page = lazy(() => import('@/pages/Sprint812Page'));
const SprintP012Page = lazy(() => import('@/pages/SprintP012Page'));
const SprintEF63Page = lazy(() => import('@/pages/SprintEF63Page'));
const SprintEF631Page = lazy(() => import('@/pages/SprintEF631Page'));
const SprintEF632Page = lazy(() => import('@/pages/SprintEF632Page'));
const SprintEF640Page = lazy(() => import('@/pages/SprintEF640Page'));
const SprintEF650Page = lazy(() => import('@/pages/SprintEF650Page'));
const PlatformAuditPage = lazy(() => import('@/pages/PlatformAuditPage'));
const PhaseEV4BPage = lazy(() => import('@/pages/PhaseEV4BPage'));
const DriveDebugPanel = lazy(() => import('@/pages/DriveDebugPanel'));
const TokenLifecycleTestPage = lazy(() => import('@/pages/TokenLifecycleTestPage'));
const RuntimeTracePage = lazy(() => import('@/pages/RuntimeTracePage'));
const GmailReadEmailTestPage = lazy(() => import('@/pages/GmailReadEmailTestPage'));
const SprintM15Page = lazy(() => import('@/pages/SprintM15Page'));
const SprintM19AuditPage = lazy(() => import('@/pages/SprintM19AuditPage'));
const SprintM110AuditPage = lazy(() => import('@/pages/SprintM110AuditPage'));
const DriveAuditPanel = lazy(() => import('@/pages/DriveAuditPanel'));
const GitHubDebugPanel = lazy(() => import('@/pages/GitHubDebugPanel'));
const EF399ValidationPage = lazy(() => import('@/pages/EF399ValidationPage'));
const RegressionTest271Page = lazy(() => import('@/pages/RegressionTest271Page'));
const EOACertificationPage = lazy(() => import('@/pages/EOACertificationPage'));
const SprintEF401Page = lazy(() => import('@/pages/SprintEF401Page'));
const SprintEF402Page = lazy(() => import('@/pages/SprintEF402Page'));
const OfficialLibraryFlowPage = lazy(() => import('@/pages/OfficialLibraryFlowPage'));
const ComponentOriginAuditPage = lazy(() => import('@/pages/ComponentOriginAuditPage'));
const SprintEF403Page = lazy(() => import('@/pages/SprintEF403Page'));
const SprintEF404Page = lazy(() => import('@/pages/SprintEF404Page'));
const SprintEF405Page = lazy(() => import('@/pages/SprintEF405Page'));
const UCMEShadowDiagnosticsPage = lazy(() => import('@/pages/UCMEShadowDiagnosticsPage'));
const SprintEF407Page = lazy(() => import('@/pages/SprintEF407Page'));
const SprintEF407aPage = lazy(() => import('@/pages/SprintEF407aPage'));
const SprintEF408Page = lazy(() => import('@/pages/SprintEF408Page'));
const SprintEF408BPage = lazy(() => import('@/pages/SprintEF408BPage'));
const SprintEF43Page = lazy(() => import('@/pages/SprintEF43Page'));
const SprintEF43APage = lazy(() => import('@/pages/SprintEF43APage'));
const SprintEF43BPage = lazy(() => import('@/pages/SprintEF43BPage'));
const SprintEF43CPage = lazy(() => import('@/pages/SprintEF43CPage'));
const SprintEF44Page = lazy(() => import('@/pages/SprintEF44Page'));
const SprintEF492Page = lazy(() => import('@/pages/SprintEF492Page'));
const SprintEF554RecertPage = lazy(() => import('@/pages/SprintEF554RecertPage'));
const SprintEPICDPage = lazy(() => import('@/pages/SprintEPICDPage'));
const KnowledgeRegistryDashboard = lazy(() => import('@/pages/KnowledgeRegistryDashboard'));
const SprintP5Page = lazy(() => import('@/pages/SprintP5Page'));
const SprintP6Page = lazy(() => import('@/pages/SprintP6Page'));
const SprintP7Page = lazy(() => import('@/pages/SprintP7Page'));
const SprintP8Page = lazy(() => import('@/pages/SprintP8Page'));
const SprintP9Page  = lazy(() => import('@/pages/SprintP9Page'));
const SprintP10Page = lazy(() => import('@/pages/SprintP10Page'));
const SprintWE01Page = lazy(() => import('@/pages/SprintWE01Page'));
const TravelportAuthTestPage = lazy(() => import('@/pages/TravelportAuthTestPage'));
const OIEPage = lazy(() => import('@/pages/OIEPage'));
const BugHunterConsole = lazy(() => import('@/pages/BugHunterConsole'));

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
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin"></div>
      </div>}>
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
          <Route path="/connector-auth" element={<ConnectorAuthCenter />} />
          <Route path="/audit" element={<ArchitectureAudit />} />
          <Route path="/foundation" element={<Foundation />} />
          <Route path="/developer-handbook" element={<DeveloperHandbook />} />
          <Route path="/api-reference" element={<ApiReference />} />
          <Route path="/execution-model" element={<ExecutionModel />} />
          <Route path="/engineering-backlog" element={<EngineeringBacklog />} />
          <Route path="/mers" element={<MersSystem />} />
          <Route path="/mads" element={<MadsSystem />} />
          <Route path="/meom" element={<MeomSystem />} />
          <Route path="/mdok" element={<MdokSystem />} />
          <Route path="/mip" element={<MipSystem />} />
          <Route path="/meem" element={<MeemSystem />} />
          <Route path="/capabilities" element={<Capabilities />} />
          <Route path="/connector-runtime" element={<ConnectorRuntimePage />} />
          <Route path="/certification" element={<ConnectorRuntimeCertification />} />
          <Route path="/cognitive-pipeline" element={<CognitivePipeline />} />
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
          <Route path="/beta01" element={<Beta01Page />} />
          <Route path="/beta011" element={<Beta011Page />} />
          <Route path="/beta02" element={<Beta02Page />} />
          <Route path="/beta031" element={<Beta031Page />} />
          <Route path="/beta032" element={<Beta032Page />} />
          <Route path="/phase5" element={<Phase5Page />} />
          <Route path="/phase51" element={<Phase51Page />} />
          <Route path="/phase54" element={<Phase54Page />} />
          <Route path="/phase55" element={<Phase55Page />} />
          <Route path="/phase56" element={<Phase56Page />} />
          <Route path="/phase561" element={<Phase561Page />} />
          <Route path="/phase562" element={<Phase562Page />} />
          <Route path="/phase563" element={<Phase563Page />} />
          <Route path="/phase58" element={<Phase58Page />} />
          <Route path="/phase58-validation" element={<Phase58ValidationPage />} />
          <Route path="/phase581" element={<Phase581Page />} />
          <Route path="/phase60" element={<Phase60Page />} />
          <Route path="/phase601" element={<Phase601Page />} />
          <Route path="/phase603" element={<Phase603Page />} />
          <Route path="/phase643" element={<Phase643Page />} />
          <Route path="/phase700" element={<Phase700Page />} />
          <Route path="/phase711" element={<Phase711Page />} />
          <Route path="/google-drive" element={<GoogleDrivePage />} />
          <Route path="/calendar" element={<GoogleCalendarPage />} />
          <Route path="/multi-connector" element={<MultiConnectorPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/phase712" element={<Phase712Page />} />
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
          <Route path="/sprint-e921" element={<SprintE921Page />} />
          <Route path="/sprint-e922" element={<SprintE922Page />} />
          <Route path="/sprint-811" element={<Sprint811Page />} />
          <Route path="/sprint-812" element={<Sprint812Page />} />
          <Route path="/sprint-p012" element={<SprintP012Page />} />
          <Route path="/sprint-ef63" element={<SprintEF63Page />} />
          <Route path="/sprint-ef631" element={<SprintEF631Page />} />
          <Route path="/sprint-ef632" element={<SprintEF632Page />} />
          <Route path="/sprint-ef640" element={<SprintEF640Page />} />
          <Route path="/sprint-ef650" element={<SprintEF650Page />} />
          <Route path="/platform-audit" element={<PlatformAuditPage />} />
          <Route path="/ev4b" element={<PhaseEV4BPage />} />
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
          <Route path="/sprint-ef43" element={<SprintEF43Page />} />
          <Route path="/sprint-ef43a" element={<SprintEF43APage />} />
          <Route path="/sprint-ef43b" element={<SprintEF43BPage />} />
          <Route path="/sprint-ef43c" element={<SprintEF43CPage />} />
          <Route path="/sprint-ef44" element={<SprintEF44Page />} />
          <Route path="/sprint-ef492" element={<SprintEF492Page />} />
          <Route path="/sprint-ef554" element={<SprintEF554RecertPage />} />
          <Route path="/sprint-epic-d" element={<SprintEPICDPage />} />
          <Route path="/knowledge-registry" element={<KnowledgeRegistryDashboard />} />
          <Route path="/sprint-p5" element={<SprintP5Page />} />
          <Route path="/sprint-p6" element={<SprintP6Page />} />
          <Route path="/sprint-p7" element={<SprintP7Page />} />
          <Route path="/sprint-p8" element={<SprintP8Page />} />
          <Route path="/sprint-p9"  element={<SprintP9Page />} />
          <Route path="/sprint-p10" element={<SprintP10Page />} />
          <Route path="/sprint-we01" element={<SprintWE01Page />} />
          <Route path="/travelport-auth-test" element={<TravelportAuthTestPage />} />
          <Route path="/oie" element={<OIEPage />} />
          <Route path="/bug-hunter" element={<BugHunterConsole />} />
        </Route>
      </Route>
      <Route path="/oauth/google/callback" element={<GoogleOAuthCallback />} />
      <Route path="/oauth/microsoft/callback" element={<MicrosoftOAuthCallback />} />
      <Route path="/oauth/github/callback" element={<GitHubOAuthCallback />} />
      <Route path="/ef399-validation" element={<EF399ValidationPage />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <ConfirmationProvider>
            <AuthenticatedApp />
          </ConfirmationProvider>
        </Router>
        <Toaster />
        <SonnerToaster richColors position="top-right" />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App