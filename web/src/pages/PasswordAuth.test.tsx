import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { passwordLogin, requestMagicLink, requestPasswordReset, requestRegistration, resetPassword, previewRegistration, createLead, fetchMe, fetchCurrentAssessment } from '@/api';
import { ApiError } from '@/api/client';
import i18n from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import Login from './Login';
import { ThemeProvider } from '@/theme/ThemeProvider';
import LeadGate from './LeadGate';
import PasswordReset from './PasswordReset';
import { accountDestination, accountErrorKey } from '@/lib/accountAuth';

vi.mock('@/api', async () => ({ ...await vi.importActual<typeof import('@/api')>('@/api'),
  passwordLogin: vi.fn(), requestMagicLink: vi.fn(), requestPasswordReset: vi.fn(), requestRegistration: vi.fn(), resetPassword: vi.fn(), previewRegistration: vi.fn(),
  fetchMe: vi.fn(), fetchCurrentAssessment: vi.fn(), createLead: vi.fn(), fetchMetadata: vi.fn().mockResolvedValue({ sizes:[],industries:[],countries:[] }),
}));
const password = 'Synthetic passphrase 2026!';
function Location() { return <span data-testid="location">{useLocation().pathname}{useLocation().search}</span>; }
function mount(page: React.ReactNode, path='/login') {
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ThemeProvider><MemoryRouter initialEntries={[path]}>{page}<Location /></MemoryRouter></ThemeProvider></QueryClientProvider>);
}
beforeEach(async () => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  useAuthStore.getState().clearSession();
  await i18n.changeLanguage('es');
  vi.mocked(requestMagicLink).mockResolvedValue({status:'sent'});
  vi.mocked(requestPasswordReset).mockResolvedValue({status:'sent'});
  vi.mocked(requestRegistration).mockResolvedValue({status:'sent'});
  vi.mocked(resetPassword).mockResolvedValue(undefined);
  vi.mocked(previewRegistration).mockResolvedValue({email:'verified@synthetic.test'});
  vi.mocked(fetchMe).mockResolvedValue({id:'new-user',email:'verified@synthetic.test',role:'client',locale:'es',organization_id:'new-org'});
  vi.mocked(fetchCurrentAssessment).mockRejectedValue(new ApiError(404,{code:'ASSESSMENT_NOT_FOUND',message:'Synthetic'}));
  vi.mocked(createLead).mockResolvedValue({lead_id:'lead',organization_id:'new-org',assessment_id:'assessment',plan:'free',access_token:'new-access',refresh_token:'new-refresh',token_type:'bearer',expires_in:900});
});
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(i18n.t(label)),{target:{value}}); }

describe('Password authentication', () => {
  it.each(['es','en','de','pt'])('renders password, magic and recovery choices in %s',async lang => {
    await i18n.changeLanguage(lang); mount(<Login />);
    expect(screen.getByLabelText(i18n.t('accountAuth.password'))).toHaveAttribute('type','password');
    expect(screen.getByRole('link',{name:i18n.t('accountAuth.forgot')})).toHaveAttribute('href','/password/reset');
    expect(screen.getByRole('button',{name:i18n.t('accountAuth.useMagic')})).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/accountAuth\.|\{\{/);
  });
  it('logs in and stores only session data, never the password',async () => {
    vi.mocked(passwordLogin).mockResolvedValue({ access_token:'synthetic-access',refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:900,
      user:{id:'user',email:'person@synthetic.test',role:'client',locale:'es',organization_id:null} });
    mount(<Login />);fill('login.email','person@synthetic.test');fill('accountAuth.password',password);
    fireEvent.click(screen.getByRole('button',{name:i18n.t('accountAuth.signIn')}));
    await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('/start'));
    expect(passwordLogin).toHaveBeenCalledWith('person@synthetic.test',password);
    expect(localStorage.getItem('tryaigap.access_token')).toBe('synthetic-access');
    expect(JSON.stringify(localStorage)).not.toContain(password);expect(JSON.stringify(sessionStorage)).not.toContain(password);
  });
  it.each(['es','en','de','pt'])('translates login errors and hides server details in %s',async lang => {
    await i18n.changeLanguage(lang);vi.mocked(passwordLogin).mockRejectedValue(new ApiError(401,{code:'AUTH_LOGIN_FAILED',message:'PRIVATE SERVER DATA'}));
    mount(<Login />);fill('login.email','person@synthetic.test');fill('accountAuth.password',password);
    fireEvent.click(screen.getByRole('button',{name:i18n.t('accountAuth.signIn')}));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('accountAuth.loginFailed'));
    expect(document.body.textContent).not.toContain('PRIVATE SERVER DATA');
    expect(screen.getByLabelText(i18n.t('accountAuth.password'))).toHaveValue('');
  });
  it('preserves magic sign-in without sending a password',async () => {
    mount(<Login />);fireEvent.click(screen.getByRole('button',{name:i18n.t('accountAuth.useMagic')}));fill('login.email','person@synthetic.test');
    expect(screen.queryByLabelText(i18n.t('accountAuth.password'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:i18n.t('login.send')}));
    expect(await screen.findByRole('status')).toHaveTextContent(i18n.t('accountAuth.emailSent'));
    expect(requestMagicLink).toHaveBeenCalledWith('person@synthetic.test','es');expect(passwordLogin).not.toHaveBeenCalled();
  });
  it('requests email verification before showing the signup form',async () => {
    mount(<LeadGate />,'/start');fill('leadgate.email','new@synthetic.test');
    expect(screen.queryByLabelText(i18n.t('accountAuth.password'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:i18n.t('accountAuth.sendLink')}));
    expect(await screen.findByRole('status')).toHaveTextContent(i18n.t('accountAuth.emailSent'));
    expect(requestRegistration).toHaveBeenCalledWith('new@synthetic.test','es');expect(createLead).not.toHaveBeenCalled();
  });
  it('binds signup to the verified email and strips the token from the address',async () => {
    mount(<LeadGate />,'/start?token=synthetic-token');
    const email=await screen.findByDisplayValue('verified@synthetic.test');expect(email).toBeDisabled();
    expect(previewRegistration).toHaveBeenCalledWith('synthetic-token');
    expect(screen.getByTestId('location')).toHaveTextContent('/start');expect(screen.getByTestId('location')).not.toHaveTextContent('token=');
    expect(screen.getByLabelText(i18n.t('accountAuth.password'))).toHaveAttribute('autoComplete','new-password');
  });
  it('submits a verified signup, validates confirmation and replaces a previous session',async () => {
    useAuthStore.setState({user:{id:'previous-user',email:'previous@synthetic.test',role:'client',locale:'es',organization_id:'previous-org'},status:'authenticated'});
    mount(<LeadGate />,'/start?token=synthetic-token');
    await screen.findByDisplayValue('verified@synthetic.test');
    for (const [id,value] of [['lg-name','Synthetic Name'],['lg-role','Director'],['lg-company','Synthetic Org'],['lg-password',password],['lg-confirm','Different synthetic passphrase']]) {
      fireEvent.change(document.getElementById(id)!,{target:{value}});
    }
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:i18n.t('leadgate.cta')}));
    expect(await screen.findByText(i18n.t('accountAuth.mismatch'))).toBeInTheDocument();expect(createLead).not.toHaveBeenCalled();
    fill('accountAuth.confirmPassword',password);
    fireEvent.click(screen.getByRole('button',{name:i18n.t('leadgate.cta')}));
    await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('/onboarding'));
    expect(createLead).toHaveBeenCalledWith(expect.objectContaining({company_email:'verified@synthetic.test',verification_token:'synthetic-token',password,password_confirmation:password}));
    expect(useAuthStore.getState().user?.id).toBe('new-user');expect(localStorage.getItem('tryaigap.access_token')).toBe('new-access');
    expect(JSON.stringify(localStorage)).not.toContain(password);expect(JSON.stringify(localStorage)).not.toContain('synthetic-token');
  });
  it.each(['es','en','de','pt'])('renders invalid signup links safely in %s',async lang => {
    await i18n.changeLanguage(lang);vi.mocked(previewRegistration).mockRejectedValue(new ApiError(400,{code:'AUTH_LINK_INVALID',message:'PRIVATE'}));
    mount(<LeadGate />,'/start?token=synthetic-token');expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('accountAuth.linkInvalid'));
    expect(createLead).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('PRIVATE');
  });
  it.each(['es','en','de','pt'])('shows generic recovery request confirmation in %s',async lang => {
    await i18n.changeLanguage(lang);mount(<PasswordReset />,'/password/reset');fill('login.email','person@synthetic.test');
    fireEvent.click(screen.getByRole('button',{name:i18n.t('accountAuth.sendLink')}));
    expect(await screen.findByRole('status')).toHaveTextContent(i18n.t('accountAuth.emailSent'));
    expect(requestPasswordReset).toHaveBeenCalledWith('person@synthetic.test',lang);
  });
  it('validates confirmation without consuming the reset token, then clears the session',async () => {
    localStorage.setItem('tryaigap.access_token','old-access');
    mount(<PasswordReset />,'/password/reset?token=synthetic-token');fill('accountAuth.password',password);fill('accountAuth.confirmPassword','Another synthetic phrase');
    fireEvent.click(screen.getByRole('button',{name:i18n.t('accountAuth.savePassword')}));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('accountAuth.mismatch'));expect(resetPassword).not.toHaveBeenCalled();
    fill('accountAuth.confirmPassword',password);fireEvent.click(screen.getByRole('button',{name:i18n.t('accountAuth.savePassword')}));
    expect(await screen.findByRole('status')).toHaveTextContent(i18n.t('accountAuth.resetDone'));
    expect(resetPassword).toHaveBeenCalledWith('synthetic-token',password,password);expect(localStorage.getItem('tryaigap.access_token')).toBeNull();
    expect(screen.getByTestId('location')).not.toHaveTextContent('token=');
    expect(JSON.stringify(localStorage)).not.toContain(password);
  });
  it.each(['es','en','de','pt'])('translates expired recovery links in %s',async lang => {
    await i18n.changeLanguage(lang);vi.mocked(resetPassword).mockRejectedValue(new ApiError(410,{code:'AUTH_LINK_EXPIRED',message:'PRIVATE SERVER DATA'}));
    mount(<PasswordReset />,'/password/reset?token=synthetic-token');fill('accountAuth.password',password);fill('accountAuth.confirmPassword',password);
    fireEvent.click(screen.getByRole('button',{name:i18n.t('accountAuth.savePassword')}));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('accountAuth.linkExpired'));expect(document.body.textContent).not.toContain('PRIVATE SERVER DATA');
  });
  it('maps sensitive errors safely and preserves role destinations',() => {
    expect(accountErrorKey(new Error('private'))).toBe('common.errorGeneric');
    expect(accountErrorKey(new ApiError(429,{code:'RATE_LIMITED',message:'private'}))).toBe('accountAuth.rateLimited');
    expect(accountDestination({role:'client',organization_id:'org'})).toBe('/dashboard');
    expect(accountDestination({role:'consultant'})).toBe('/consultant');
  });
});
