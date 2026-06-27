import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { useEffect, lazy, Suspense } from 'react';
import { initializeSettings } from './db/database';

// Lazy-load pages so the app opens fast (heavy libs like pdf/qr/scanner load on demand).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const Products = lazy(() => import('./pages/Products'));
const CreateInvoice = lazy(() => import('./pages/CreateInvoice'));
const InvoiceHistory = lazy(() => import('./pages/InvoiceHistory'));
const Reports = lazy(() => import('./pages/Reports'));
const Quotations = lazy(() => import('./pages/Quotations'));
const CreditNotes = lazy(() => import('./pages/CreditNotes'));
const Settings = lazy(() => import('./pages/Settings'));

function PageLoader() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
      กำลังโหลด...
    </div>
  );
}

function AppInitializer({ children }) {
  useEffect(() => {
    initializeSettings();
    // Ask the browser to mark our storage as persistent so IndexedDB is never
    // auto-evicted under disk pressure — critical for a production machine.
    if (navigator.storage?.persist) {
      navigator.storage.persisted().then(persisted => {
        if (!persisted) navigator.storage.persist();
      }).catch(() => {});
    }
  }, []);
  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppInitializer>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/create-invoice" element={<CreateInvoice />} />
                  <Route path="/invoices" element={<InvoiceHistory />} />
                  <Route path="/invoices/:id" element={<InvoiceHistory />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/quotations" element={<Quotations />} />
                  <Route path="/credit-notes" element={<CreditNotes />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AppInitializer>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
