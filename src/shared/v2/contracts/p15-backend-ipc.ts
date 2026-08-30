const names = [
  'project.list','project.get','workSession.listByProject','workSession.get','workSession.create',
  'workSession.pause','workSession.resume','workSession.cancel','workSession.switchRuntime',
  'workflow.get','workflow.conversation','workflow.plan','workflow.tasks','workflow.execution',
  'workflow.changes','workflow.review','workflow.runtimeHistory','workflow.bottomPanel',
  'workflow.approvePlan','workflow.createRework','workflow.projection','agent.list',
  'agent.listByProject','agent.get','agent.create','agent.update','agent.remove',
  'provider.listAccounts','provider.connect','provider.refresh','provider.setEnabled','provider.probe',
  'workspace.get','git.status','skill.list','mcp.listServers','settings.get','settings.update',
  'diagnostics.list','remote.status'
] as const
export type P15PublicApiKey = typeof names[number]
export const P15_IPC: Readonly<Record<P15PublicApiKey, string>> = Object.freeze(
  Object.fromEntries(names.map(name => [name, `bs.v2.${name}`])) as Record<P15PublicApiKey, string>)
