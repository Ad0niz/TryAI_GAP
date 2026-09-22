import { Route, Routes } from 'react-router';
import { RequireAuth } from '@/components/RequireAuth';
import { RequireRole } from '@/components/RequireRole';
import { RouteError } from '@/components/RouteError';
import { AppShell } from '@/layouts/AppShell';
import AreaDetail from '@/pages/AreaDetail';
import Areas from '@/pages/Areas';
import AuthVerify from '@/pages/AuthVerify';
import Catalog from '@/pages/Catalog';
import Consultant from '@/pages/Consultant';
import ConsultantClient from '@/pages/ConsultantClient';
import Dashboard from '@/pages/Dashboard';
import DelegateAnswer from '@/pages/DelegateAnswer';
import Documents from '@/pages/Documents';
import Estimator from '@/pages/Estimator';
import Landing from '@/pages/Landing';
import LeadGate from '@/pages/LeadGate';
import Login from '@/pages/Login';
import Maturity from '@/pages/Maturity';
import NotFound from '@/pages/NotFound';
import Onboarding from '@/pages/Onboarding';
import PaymentCheckout from '@/pages/PaymentCheckout';
import PaymentResult from '@/pages/PaymentResult';
import Results from '@/pages/Results';
import Review from '@/pages/Review';
import Settings from '@/pages/Settings';
import Team from '@/pages/Team';
import Terms from '@/pages/Terms';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} errorElement={<RouteError />} />
      <Route path="/start" element={<LeadGate />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/verify" element={<AuthVerify />} />
      <Route path="/delegate/:token" element={<DelegateAnswer />} />
      <Route path="/catalog" element={<Catalog />} />

      {/* Protected */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/maturity" element={<Maturity />} />
        <Route path="/areas" element={<Areas />} />
        <Route path="/areas/:areaKey" element={<AreaDetail />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/team" element={<Team />} />
        <Route path="/estimator" element={<Estimator />} />
        <Route path="/payment/checkout" element={<PaymentCheckout />} />
        <Route path="/payment/:status" element={<PaymentResult />} />
        <Route path="/results" element={<Results />} />
        <Route path="/review" element={<Review />} />
        <Route
          path="/consultant"
          element={
            <RequireRole roles={['consultant']}>
              <Consultant />
            </RequireRole>
          }
        />
        <Route
          path="/consultant/clients/:clientId"
          element={
            <RequireRole roles={['consultant']}>
              <ConsultantClient />
            </RequireRole>
          }
        />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
