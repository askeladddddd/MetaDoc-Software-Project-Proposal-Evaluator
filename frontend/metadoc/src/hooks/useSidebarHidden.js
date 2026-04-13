import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Custom hook for managing sidebar hidden state across all pages
 * Supports: Overview, Deliverables, Submissions, Class List, and Reports
 * 
 * @returns {Object} { sidebarHidden, setSidebarHidden, isSpecialPage, toggleSidebar }
 */
export const useSidebarHidden = () => {
  const location = useLocation();
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    const saved = localStorage.getItem('sidebar-hidden-all-pages');
    return saved ? JSON.parse(saved) : false;
  });

  const isSpecialPage = location.pathname.includes('/reports') || 
                        location.pathname.includes('/dashboard/class-list') || 
                        location.pathname.includes('/dashboard/deliverables') ||
                        location.pathname.includes('/dashboard/submissions') ||
                        location.pathname === '/dashboard';

  useEffect(() => {
    localStorage.setItem('sidebar-hidden-all-pages', JSON.stringify(sidebarHidden));
    const layoutElement = document.querySelector('.dashboard-layout');
    if (layoutElement) {
      if (sidebarHidden && isSpecialPage) {
        layoutElement.classList.add('sidebar-hidden-reports');
      } else {
        layoutElement.classList.remove('sidebar-hidden-reports');
      }
    }
  }, [sidebarHidden, isSpecialPage]);

  const toggleSidebar = () => {
    if (isSpecialPage) {
      setSidebarHidden(!sidebarHidden);
    }
  };

  return {
    sidebarHidden,
    setSidebarHidden,
    isSpecialPage,
    toggleSidebar,
  };
};
