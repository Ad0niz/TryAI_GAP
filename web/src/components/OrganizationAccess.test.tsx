import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { fetchOrganizationPermissions, fetchAreas, fetchTeam, deactivateArea } from '@/api';
import { ApiError } from '@/api/client';
import { OrganizationAccess } from './OrganizationAccess';
import { useAuthStore } from '@/store/authStore';
import { useAssessmentStore } from '@/store/assessmentStore';
import i18n from '@/i18n';
import Team from '@/pages/Team';
import Areas from '@/pages/Areas';

vi.mock('@/api',async()=>({...await vi.importActual<typeof import('@/api')>('@/api'),
  fetchOrganizationPermissions:vi.fn(),fetchAreas:vi.fn(),fetchTeam:vi.fn(),deactivateArea:vi.fn(),
}));
const user={id:'leader',email:'synthetic@example.test',organization_id:'org-a',role:'client' as const,locale:'es'};
function mount(children:React.ReactNode,client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})){
  return render(<QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>);
}
beforeEach(async()=>{
  vi.clearAllMocks();await i18n.changeLanguage('es');
  useAuthStore.setState({user,status:'authenticated'});
  useAssessmentStore.setState({assessment:{id:'assessment',organization_id:'org-a',plan:'pro',status:'in_progress',progress:{maturity:0,areas_overall:0},free_preview_reached:false},status:'ready'});
  vi.mocked(fetchOrganizationPermissions).mockResolvedValue({organization_admin:false,area_keys:['ventas']});
  vi.mocked(fetchAreas).mockResolvedValue({items:[
    {area_key:'ventas',name:'Sales',active:true,progress:0,leader:null,locked:false},
    {area_key:'marketing',name:'Marketing',active:true,progress:0,leader:null,locked:false},
  ]});
  vi.mocked(fetchTeam).mockResolvedValue({items:[],invitations:[]});
});
it.each(['es','en','de','pt'])('blocks global actions for a leader with translated feedback in %s',async lang=>{
  await i18n.changeLanguage(lang);mount(<Team/>);
  expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('orgPermissions.denied'));
  expect(fetchTeam).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:i18n.t('team.invite')})).not.toBeInTheDocument();
});
it('allows a client with organizational admin membership',async()=>{
  vi.mocked(fetchOrganizationPermissions).mockResolvedValue({organization_admin:true,area_keys:[]});
  mount(<OrganizationAccess><span>Authorized admin</span></OrganizationAccess>);
  expect(await screen.findByText('Authorized admin')).toBeInTheDocument();
});
it('does not substitute the global admin role for organizational permissions',async()=>{
  useAuthStore.setState({user:{...user,role:'admin'}});
  mount(<OrganizationAccess><span>Secret configuration</span></OrganizationAccess>);
  expect(await screen.findByRole('alert')).toBeInTheDocument();expect(screen.queryByText('Secret configuration')).not.toBeInTheDocument();
});
it('allows each assigned area and rejects foreign areas',async()=>{
  vi.mocked(fetchOrganizationPermissions).mockResolvedValue({organization_admin:false,area_keys:['ventas','marketing']});
  mount(<><OrganizationAccess areaKey="ventas"><span>Sales answers</span></OrganizationAccess><OrganizationAccess areaKey="marketing"><span>Marketing answers</span></OrganizationAccess><OrganizationAccess areaKey="legal"><span>Other answers</span></OrganizationAccess></>);
  expect(await screen.findByText('Sales answers')).toBeInTheDocument();expect(await screen.findByText('Marketing answers')).toBeInTheDocument();expect(screen.queryByText('Other answers')).not.toBeInTheDocument();
});
it('does not mount protected content while permissions load',async()=>{
  let resolve!:(value:{organization_admin:boolean;area_keys:string[]})=>void;
  vi.mocked(fetchOrganizationPermissions).mockReturnValue(new Promise(r=>{resolve=r;}));
  mount(<OrganizationAccess><span>Protected</span></OrganizationAccess>);
  expect(screen.getByRole('status')).toHaveTextContent(i18n.t('common.loading'));expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  await act(async()=>resolve({organization_admin:false,area_keys:[]}));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
it('fails closed when the permissions endpoint returns 403',async()=>{
  vi.mocked(fetchOrganizationPermissions).mockRejectedValue(new ApiError(403,{code:'FORBIDDEN',message:'PRIVATE'}));
  mount(<OrganizationAccess><span>Protected</span></OrganizationAccess>);
  expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('orgPermissions.denied'));expect(document.body.textContent).not.toContain('PRIVATE');
});
it('never reuses permissions from the previous account',async()=>{
  vi.mocked(fetchOrganizationPermissions).mockResolvedValueOnce({organization_admin:true,area_keys:[]}).mockResolvedValue({organization_admin:false,area_keys:['ventas']});
  mount(<OrganizationAccess><span>Admin only</span></OrganizationAccess>);
  expect(await screen.findByText('Admin only')).toBeInTheDocument();
  act(()=>useAuthStore.setState({user:{...user,id:'new-leader'}}));
  await waitFor(()=>expect(screen.queryByText('Admin only')).not.toBeInTheDocument());
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
it('hides activation controls and unassigned areas from leaders',async()=>{
  mount(<Areas/>);expect(await screen.findByText(i18n.t('areaList.ventas.name'))).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:i18n.t('areas.deactivate')})).not.toBeInTheDocument();
  expect(screen.queryByText(i18n.t('areaList.marketing.name'))).not.toBeInTheDocument();
});
it('handles a 403 after permissions change during an admin action',async()=>{
  vi.mocked(fetchOrganizationPermissions).mockResolvedValue({organization_admin:true,area_keys:[]});
  vi.mocked(deactivateArea).mockRejectedValue(new ApiError(403,{code:'FORBIDDEN',message:'PRIVATE'}));
  mount(<Areas/>);const buttons=await screen.findAllByRole('button',{name:i18n.t('areas.deactivate')});fireEvent.click(buttons[0]);
  expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('orgPermissions.denied'));expect(document.body.textContent).not.toContain('PRIVATE');
});
