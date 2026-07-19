import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { getOperationalStatus } from "../api";
import { templateConfig } from "../template";
import type { OperationalControls } from "../types";
import { Navbar } from "./Navbar";

export function Layout() {
  const [controls, setControls] = useState<OperationalControls | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadStatus() {
      try {
        const response = await getOperationalStatus();

        if (isActive) {
          setControls(response.operationalControls);
        }
      } catch {
        if (isActive) {
          setControls(null);
        }
      }
    }

    void loadStatus();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-cloud text-ink">
      <Navbar />
      {controls?.maintenanceBannerEnabled && controls.maintenanceBannerMessage && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-sm font-semibold text-amber-800">
          {controls.maintenanceBannerMessage}
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white px-5 py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>{templateConfig.business.name}</span>
          <nav className="flex gap-4">
            <Link className="hover:text-ink" to="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-ink" to="/cookies">
              Cookies
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
