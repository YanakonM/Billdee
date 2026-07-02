import { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { db } from '../db/database';
import translations from '../utils/i18n';

const AppContext = createContext(null);

const initialState = {
  sidebarOpen: false,
  toasts: [],
  currentInvoice: null,
  language: 'th',
};

function appReducer(state, action) {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'CLOSE_SIDEBAR':
      return { ...state, sidebarOpen: false };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, { id: action.payload.id ?? Date.now(), ...action.payload }] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case 'SET_CURRENT_INVOICE':
      return { ...state, currentInvoice: action.payload };
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // In-app confirm dialog (replaces the native window.confirm, which shows an
  // ugly "tauri.localhost says" popup in the desktop app).
  const [confirmDialog, setConfirmDialog] = useState(null);
  const appConfirm = useCallback((message, opts = {}) => new Promise((resolve) => {
    setConfirmDialog({
      message,
      title: opts.title || 'ยืนยันการทำงาน',
      okLabel: opts.okLabel || 'ตกลง',
      cancelLabel: opts.cancelLabel || 'ยกเลิก',
      danger: !!opts.danger,
      resolve,
    });
  }), []);
  const resolveConfirm = useCallback((result) => {
    setConfirmDialog(prev => { prev?.resolve(result); return null; });
  }, []);

  // Load language on mount
  useEffect(() => {
    (async () => {
      const langSetting = await db.settings.get('language');
      if (langSetting) {
        dispatch({ type: 'SET_LANGUAGE', payload: langSetting.value });
      }
    })();
  }, []);

  const toggleSidebar = useCallback(() => dispatch({ type: 'TOGGLE_SIDEBAR' }), []);
  const closeSidebar = useCallback(() => dispatch({ type: 'CLOSE_SIDEBAR' }), []);

  const showToast = useCallback((message, type = 'success') => {
    // Unique id shared between add + remove so the toast actually clears.
    // Suffix guards against two toasts firing within the same millisecond.
    const id = `${Date.now()}-${Math.round(performance.now() * 1000)}`;
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 4000);
  }, []);

  const setLanguage = useCallback(async (lang) => {
    dispatch({ type: 'SET_LANGUAGE', payload: lang });
    await db.settings.put({ key: 'language', value: lang });
  }, []);

  // Get translation helper
  const t = translations[state.language] || translations.th;

  const value = {
    ...state,
    toggleSidebar,
    closeSidebar,
    showToast,
    appConfirm,
    confirmDialog,
    resolveConfirm,
    setLanguage,
    t,
    dispatch,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
