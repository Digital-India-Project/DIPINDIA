import React from 'react';
import { Home, LayoutGrid, SearchCheck, Package, UserCheck, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { DynamicNavigationState, resolveDynamicNavigation } from '../../lib/navigationController';
import { trackInteraction } from '../../lib/perfMonitor';

interface MobileBottomNavProps {
  currentRoute: string;
  navState?: DynamicNavigationState;
  onNavigate: (route: string, param?: string) => void;
  onScrollTopAndRefresh: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentRoute,
  navState: controlledNavState,
  onNavigate,
  onScrollTopAndRefresh,
}) => {
  const { user, role, permissions, isAuthenticated } = useAuth();
  const { lang } = useLanguage();

  const navState =
    controlledNavState ||
    resolveDynamicNavigation({
      user,
      role,
      permissions,
      isAuthenticated,
      currentRoute,
      lang,
    });

  const ICON_FOR_ROUTE: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
    home: Home,
    services: LayoutGrid,
    products: Package,
    track: SearchCheck,
    login: LogIn,
  };

  const items = navState.mobileBottomItems.map((item) => {
    const icon = ICON_FOR_ROUTE[item.route] || UserCheck;
    const isActive =
      item.route === 'home'
        ? currentRoute === 'home'
        : item.route === 'services'
        ? currentRoute === 'services' || currentRoute === 'service-detail' || currentRoute === 'packages'
        : item.route === 'products'
        ? currentRoute === 'products'
        : item.route === 'track'
        ? currentRoute === 'track'
        : [
            'dashboard',
            'admin',
            'operator',
            'operator-enroll',
            'manager',
            'partner',
            'b2b',
            'workspace',
            'login',
            'register',
          ].includes(currentRoute);

    return {
      ...item,
      icon,
      isActive,
    };
  });

  const handleTap = (item: (typeof items)[number]) => {
    trackInteraction('navigation', 'bottom_nav_tap', item.id, currentRoute);
    if (item.isActive) {
      onScrollTopAndRefresh();
    } else {
      onNavigate(item.route, item.param);
    }
  };

  return (
    <nav
      aria-label="Mobile and Tablet App Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-6px_24px_rgba(15,23,42,0.06)] pb-safe"
    >
      <div className="max-w-2xl mx-auto grid grid-cols-5 items-center h-16 px-1 sm:px-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTap(item)}
              aria-current={item.isActive ? 'page' : undefined}
              className="min-h-[48px] min-w-0 px-0.5 flex flex-col items-center justify-center gap-1 rounded-2xl flutter-press cursor-pointer select-none group"
            >
              <span
                className={`h-7 flex items-center justify-center rounded-full transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
                  item.isActive
                    ? 'w-14 bg-[#FF671F]/16 dark:bg-[#FF671F]/24 text-[#FF671F] shadow-2xs'
                    : 'w-10 text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white group-hover:bg-slate-100/80 dark:group-hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-[19px] h-[19px]" strokeWidth={item.isActive ? 2.4 : 1.85} />
              </span>
              <span
                className={`text-[10px] sm:text-[11px] leading-none tracking-tight whitespace-nowrap truncate max-w-full px-1 ${
                  item.isActive
                    ? 'font-bold text-[#FF671F]'
                    : 'font-medium text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
