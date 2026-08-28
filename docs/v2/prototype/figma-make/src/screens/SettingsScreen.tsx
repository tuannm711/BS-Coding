import { useState } from "react"
import {
  ApplicationPanel,
  AppearancePanel,
  SecurityPanel,
  PermissionsPanel,
  UpdatesPanel,
  RemoteControlPanel,
} from "./settings/panels"
import { ProvidersPanel } from "./settings/providers"

const SETTINGS_TABS = [
  "Application",
  "Appearance",
  "Providers",
  "Security",
  "Default Permissions",
  "Updates",
  "Remote Control",
]

export default function SettingsScreen() {
  const [tab, setTab] = useState("Providers")

  return (
    <div className="h-full flex bg-base">
      {/* Settings sidebar */}
      <div className="w-48 shrink-0 bg-surface border-r border-line flex flex-col">
        <div className="px-4 py-5 border-b border-line">
          <h1 className="text-sm font-semibold text-fore">Settings</h1>
          <p className="text-[10px] text-faint mt-0.5 uppercase tracking-widest">Global</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                tab === t
                  ? "bg-hover text-fore font-medium"
                  : "text-faint hover:text-dim hover:bg-hover"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="text-[10px] text-faint">BS Coding v0.9.2</div>
        </div>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-8">
        {tab === "Providers" && <ProvidersPanel />}
        {tab === "Application" && <ApplicationPanel />}
        {tab === "Appearance" && <AppearancePanel />}
        {tab === "Security" && <SecurityPanel />}
        {tab === "Default Permissions" && <PermissionsPanel />}
        {tab === "Updates" && <UpdatesPanel />}
        {tab === "Remote Control" && <RemoteControlPanel />}
      </div>
    </div>
  )
}
