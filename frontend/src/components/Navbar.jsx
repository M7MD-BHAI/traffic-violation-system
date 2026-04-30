import { NavLink, useNavigate } from "react-router-dom";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/violations", label: "Violations" },
  { to: "/live-feed", label: "Live Feed" },
  { to: "/accidents", label: "Accidents" },
  { to: "/optimization", label: "Optimization" },
  { to: "/anpr", label: "ANPR" },
  { to: "/settings", label: "Settings" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username") || "User";

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    navigate("/login");
  }

  return (
    <nav className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-8">
        <span className="text-lg font-bold tracking-wide text-white">
          🚦 TrafficIQ
        </span>
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">
          👤 <span className="text-white font-medium">{username}</span>
        </span>
        <button
          onClick={handleLogout}
          className="text-sm px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
