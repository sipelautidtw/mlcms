import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

export default function App() {
  const [status, setStatus] = useState({ state: "loading" });

  useEffect(() => {
    axios
      .get(`${API_URL}/health`)
      .then((res) => setStatus({ state: "ok", data: res.data }))
      .catch((err) =>
        setStatus({ state: "error", message: err.message || "Unknown error" })
      );
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-maritime-50 to-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-maritime-500 flex items-center justify-center text-white font-bold">
            ML
          </div>
          <h1 className="text-xl font-bold text-maritime-900">Maritime Lentera</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          AI Content Management System &middot; v2.0
        </p>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            System Status
          </p>

          {status.state === "loading" && (
            <div className="flex items-center gap-2 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-sm">Connecting to API...</span>
            </div>
          )}

          {status.state === "ok" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-sm font-medium">API Online</span>
              </div>
              <div className="text-xs text-slate-500 pl-4">
                Database: <span className="font-mono">{status.data.database}</span>
              </div>
              <div className="text-xs text-slate-500 pl-4">
                {new Date(status.data.timestamp).toLocaleString("id-ID")}
              </div>
            </div>
          )}

          {status.state === "error" && (
            <div className="flex items-start gap-2 text-rose-600">
              <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5"></span>
              <div>
                <p className="text-sm font-medium">API Unreachable</p>
                <p className="text-xs text-rose-500 mt-1">{status.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
