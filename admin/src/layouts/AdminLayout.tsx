import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from '@/layouts/Sidebar';
import { Topbar } from '@/layouts/Topbar';
import { GlobalSearch } from '@/components/GlobalSearch';

export function AdminLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--admin-bg)] text-white">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-navy-950">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <GlobalSearch />
    </div>
  );
}
