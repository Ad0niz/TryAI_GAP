import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Briefcase,
  Calculator,
  FileText,
  Gauge,
  Home,
  LayoutGrid,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { canAccessConsultant } from '@/lib/roles';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    labelKey: 'nav.group_main',
    items: [
      { to: '/dashboard', labelKey: 'nav.home', icon: Home },
      { to: '/estimator', labelKey: 'nav.estimator', icon: Calculator },
      { to: '/maturity', labelKey: 'nav.maturity', icon: Gauge },
      { to: '/areas', labelKey: 'nav.areas', icon: LayoutGrid },
    ],
  },
  {
    labelKey: 'nav.group_collab',
    items: [
      { to: '/documents', labelKey: 'nav.documents', icon: FileText },
      { to: '/team', labelKey: 'nav.team', icon: Users },
    ],
  },
  {
    labelKey: 'nav.group_outputs',
    items: [
      { to: '/results', labelKey: 'nav.results', icon: BarChart3 },
      { to: '/review', labelKey: 'nav.review', icon: ShieldCheck },
    ],
  },
];

function NavSection({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const groups = [...NAV];
  if (canAccessConsultant(user?.role)) {
    groups.push({
      labelKey: 'nav.group_consultant',
      items: [{ to: '/consultant', labelKey: 'nav.consultant', icon: Briefcase }],
    });
  }
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label={t('common.appTagline')}>
      {groups.map((group, gi) => (
        <div key={`${group.labelKey}-${gi}`}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t(group.labelKey)}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-auto">
        <Separator className="mb-3" />
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-primary'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {t('nav.settings')}
        </NavLink>
      </div>
    </nav>
  );
}

/** Protected application shell: sidebar nav + header (theme, language, user). */
export function AppShell() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-4 py-4">
          <BrandLogo compact />
        </div>
        <NavSection />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-sidebar shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <BrandLogo compact />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label={t('common.toggleMenu')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NavSection onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t('common.toggleMenu')}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="lg:hidden">
            <BrandLogo compact />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
