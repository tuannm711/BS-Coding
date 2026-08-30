import type {
  BottomPanelProjection, LogSummary, OutputSummary, ProblemSummary, TerminalSummary,
  TestRunSummary
} from '../../../../shared/v2/contracts/ui-projections'
import { sectionFromList } from './optional-section'

export function createBottomPanelProjectionService(deps: {
  revision(workflowRunId: string): Promise<number>
  terminals(projectId: string, workflowRunId: string, limit: number): Promise<readonly TerminalSummary[]>
  tests(projectId: string, workflowRunId: string, limit: number): Promise<readonly TestRunSummary[]>
  problems(projectId: string, workflowRunId: string, limit: number): Promise<readonly ProblemSummary[]>
  logs(projectId: string, workflowRunId: string, limit: number): Promise<readonly LogSummary[]>
  output(projectId: string, workflowRunId: string, limit: number): Promise<readonly OutputSummary[]>
}) {
  return {
    async get(projectId: string, workflowRunId: string, requestedLimit = 100): Promise<BottomPanelProjection> {
      const limit = Math.max(1, Math.min(200, Math.floor(requestedLimit)))
      const [revision, terminals, tests, problems, logs, output] = await Promise.all([
        deps.revision(workflowRunId), deps.terminals(projectId, workflowRunId, limit),
        deps.tests(projectId, workflowRunId, limit), deps.problems(projectId, workflowRunId, limit),
        deps.logs(projectId, workflowRunId, limit), deps.output(projectId, workflowRunId, limit)
      ])
      const bounded = <T>(items: readonly T[]) => Object.freeze([...items].slice(0, limit))
      return Object.freeze({ projectId, workflowRunId, revision,
        terminals: sectionFromList(bounded(terminals)), tests: sectionFromList(bounded(tests)),
        problems: sectionFromList(bounded(problems)), logs: sectionFromList(bounded(logs)),
        output: sectionFromList(bounded(output)) })
    }
  }
}
