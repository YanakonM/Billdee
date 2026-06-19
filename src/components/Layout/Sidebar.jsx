import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  LayoutDashboard, Users, Package, FilePlus, FileText, Settings,
  Receipt, BarChart3, FileCheck, FileMinus
} from 'lucide-react';

export default function Sidebar() {
  const { sidebarOpen, closeSidebar, language, t } = useApp();
  const location = useLocation();

  const navItems = [
    {
      section: t.nav.mainMenu,
      items: [
        { path: '/', icon: LayoutDashboard, label: t.nav.dashboard },
        { path: '/create-invoice', icon: FilePlus, label: t.nav.createInvoice },
        { path: '/invoices', icon: FileText, label: t.nav.invoiceHistory },
      ]
    },
    {
      section: t.nav.documents,
      items: [
        { path: '/quotations', icon: FileCheck, label: t.nav.quotations },
        { path: '/credit-notes', icon: FileMinus, label: 'ใบลดหนี้/เพิ่มหนี้' },
      ]
    },
    {
      section: t.nav.dataManagement,
      items: [
        { path: '/customers', icon: Users, label: t.nav.customers },
        { path: '/products', icon: Package, label: t.nav.products },
        { path: '/reports', icon: BarChart3, label: t.nav.reports },
      ]
    },
    {
      section: t.nav.system,
      items: [
        { path: '/settings', icon: Settings, label: t.nav.settings },
      ]
    }
  ];

  return (
    <>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={closeSidebar}
      />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Receipt size={22} />
          </div>
          <div>
            <div className="sidebar-logo-text">
              Bill<span>dee</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', marginTop: '-2px' }}>
              {language === 'th' ? 'ระบบใบกำกับภาษี' : 'Tax Invoice System'}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((section) => (
            <div key={section.section}>
              <div className="sidebar-section-title">{section.section}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={closeSidebar}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer (language toggle hidden until full EN translation is wired) */}
        <div style={{
          padding: '12px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', textAlign: 'center' }}>
            Billdee — ระบบใบกำกับภาษี
          </div>
        </div>
      </aside>
    </>
  );
}
