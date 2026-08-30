import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { seedV2Backend } from '../fixtures/v2-seed'

type ElectronApp = Awaited<ReturnType<typeof electron.launch>>

async function launch(userData: string): Promise<ElectronApp> {
  return electron.launch({ args: ['.'], env: {
    ...process.env as Record<string, string>, BS_USER_DATA: userData, BS_V2: '1'
  } })
}

async function invoke<T>(app: ElectronApp, key: string, request: unknown): Promise<T> {
  const window = await app.firstWindow()
  return window.evaluate(({ key, request }) => {
    const api = (globalThis as unknown as { bs: { v2: Record<string,
      (request: unknown) => Promise<unknown>> } }).bs.v2
    return api[key](request)
  }, { key, request }) as Promise<T>
}

test('V2 backend projections and lifecycle commands survive restart', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-v2-e2e-'))
  const projectPath = mkdtempSync(path.join(tmpdir(), 'bs-v2-project-'))
  let app: ElectronApp | undefined
  try {
    const ids = seedV2Backend(userData, projectPath)
    app = await launch(userData)
    await expect(invoke<{ name: string }>(app, 'project.get', { id: ids.projectId }))
      .resolves.toMatchObject({ name: 'PMS' })
    const firstWindow = await app.firstWindow()
    await firstWindow.evaluate(workflowRunId => {
      const scope = globalThis as unknown as { bs: { v2: { workflow: { subscribe(id: string,
        callback: (event: unknown) => void): () => void } } }; __v2Events?: unknown[] }
      scope.__v2Events = []
      scope.bs.v2.workflow.subscribe(workflowRunId, event => { scope.__v2Events!.push(event) })
    }, ids.workflowRunId)
    await invoke(app, 'workSession.pause', {
      projectId: ids.projectId, workSessionId: ids.workSessionId
    })
    await expect.poll(() => firstWindow.evaluate(() => {
      const events = (globalThis as unknown as { __v2Events?: Array<{
        sequence: number; payload: { status: string }
      }> }).__v2Events ?? []
      return events.at(-1)
    })).toMatchObject({ sequence: 1, payload: { status: 'PAUSED' } })
    await app.close(); app = undefined

    app = await launch(userData)
    await expect(invoke<{ status: string }>(app, 'workSession.get', { id: ids.workSessionId }))
      .resolves.toMatchObject({ status: 'PAUSED' })
    await expect(invoke<{ status: string }>(app, 'workflow.get', { id: ids.workflowRunId }))
      .resolves.toMatchObject({ status: 'PAUSED' })
    await invoke(app, 'workSession.resume', {
      projectId: ids.projectId, workSessionId: ids.workSessionId
    })
    await expect(invoke<{ status: string }>(app, 'workflow.get', { id: ids.workflowRunId }))
      .resolves.toMatchObject({ status: 'EXECUTING' })
    await invoke(app, 'workSession.switchRuntime', { projectId: ids.projectId,
      workSessionId: ids.workSessionId, target: { providerId: 'openai', accountId: 'account-new',
        modelId: 'model-new', capabilities: { structuredTools: 'VERIFIED' } }, reason: 'fallback' })
    const runtime = await invoke<{ runtimeHistory: { status: string; value?: Array<{ modelId: string }> } }>(
      app, 'workflow.runtimeHistory', { projectId: ids.projectId,
        workSessionId: ids.workSessionId, workflowRunId: ids.workflowRunId })
    expect(runtime.runtimeHistory).toMatchObject({ status: 'AVAILABLE',
      value: expect.arrayContaining([expect.objectContaining({ modelId: 'model-new' })]) })

    await invoke(app, 'workflow.createRework', { projectId: ids.projectId,
      workSessionId: ids.workSessionId, findingIds: [ids.findingId], title: 'Fix review finding' })
    const review = await invoke<{ review: { status: string; value?: { findings: Array<{
      id: string; linkedReworkTaskId?: string
    }> } } }>(app, 'workflow.review', { projectId: ids.projectId,
      workSessionId: ids.workSessionId, workflowRunId: ids.workflowRunId })
    expect(review.review.value?.findings).toContainEqual(expect.objectContaining({
      id: ids.findingId, linkedReworkTaskId: expect.any(String)
    }))
    await app.close(); app = undefined

    app = await launch(userData)
    const persistedRuntime = await invoke<{ runtimeHistory: { status: string; value?: Array<{
      modelId: string
    }> } }>(app, 'workflow.runtimeHistory', { projectId: ids.projectId,
      workSessionId: ids.workSessionId, workflowRunId: ids.workflowRunId })
    expect(persistedRuntime.runtimeHistory.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelId: 'model-new' })
    ]))
    const persistedReview = await invoke<{ review: { value?: { findings: Array<{
      id: string; linkedReworkTaskId?: string
    }> } } }>(app, 'workflow.review', { projectId: ids.projectId,
      workSessionId: ids.workSessionId, workflowRunId: ids.workflowRunId })
    expect(persistedReview.review.value?.findings).toContainEqual(expect.objectContaining({
      id: ids.findingId, linkedReworkTaskId: expect.any(String)
    }))
  } finally {
    await app?.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    rmSync(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
