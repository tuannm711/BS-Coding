import type { ProjectSummary } from '../../../../../shared/v2/contracts/ui-projections'

export default function ProjectSettingsView({ project }: { project: ProjectSummary }) {
  return <div className="v2-detail-panel"><p className="v2-kicker">Project scope</p><h2>Project Settings</h2>
    <dl><div><dt>Repository</dt><dd>{project.repoPath}</dd></div><div><dt>Default branch</dt><dd>{project.defaultBranch}</dd></div><div><dt>Projection revision</dt><dd>{project.revision}</dd></div></dl>
    <p>Project-owned configuration is edited through validated V2 commands as those contracts become available.</p></div>
}
