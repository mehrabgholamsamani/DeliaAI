import { CalendarCheck, Menu, Sparkles } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { templateConfig } from "../template";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/booking", label: "Book" }
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <NavLink to="/" className="flex items-center gap-3 font-semibold">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white shadow-soft">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <span className="leading-tight">
            {templateConfig.business.shortName}
            <span className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {templateConfig.business.category}
            </span>
          </span>
        </NavLink>

        <button
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="Toggle navigation"
          type="button"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <div
          className={`absolute left-5 right-5 top-[72px] rounded-lg border border-slate-200 bg-white p-3 shadow-soft md:static md:flex md:items-center md:gap-2 md:border-0 md:bg-transparent md:p-0 md:shadow-none ${
            open ? "block" : "hidden md:flex"
          }`}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block rounded-lg px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-aqua text-ink"
                    : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/booking"
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 md:mt-0 md:w-auto"
            onClick={() => setOpen(false)}
          >
            <CalendarCheck size={17} aria-hidden="true" />
            New booking
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
