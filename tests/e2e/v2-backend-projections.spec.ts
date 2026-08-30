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
    const homeWindow = await app.firstWindow()
    await expect(homeWindow.getByRole('heading', { name: 'Good morning' })).toBeVisible()
    await expect(homeWindow.locator('.v2-provider-health')).toHaveAttribute('title', 'All providers healthy')
    await homeWindow.getByRole('button', { name: 'Agents', exact: true }).click()
    await expect(homeWindow.getByRole('heading', { name: 'Project Agents' })).toBeVisible()
    await expect(homeWindow.getByText('Worker', { exact: true })).toBeVisible()
    await homeWindow.getByRole('button', { name: 'Add Agent' }).click()
    await homeWindow.getByLabel('Name').fill('Reviewer')
    await homeWindow.getByLabel('Role').fill('REVIEWER')
    await homeWindow.getByRole('button', { name: 'Save Agent' }).click()
    await expect(homeWindow.getByText('Reviewer', { exact: true })).toBeVisible()
    await homeWindow.getByRole('button', { name: /Reviewer/ }).click()
    await homeWindow.getByRole('button', { name: 'Remove Agent' }).click()
    await expect(homeWindow.getByRole('button', { name: 'Confirm Remove' })).toBeVisible()
    await homeWindow.getByRole('button', { name: 'Keep Agent' }).click()
    await homeWindow.getByRole('button', { name: 'Close Agent inspector' }).click()

    await homeWindow.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(homeWindow.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(homeWindow.getByRole('navigation', { name: 'Global settings sections' })
      .getByRole('button')).toHaveCount(7)
    await expect(homeWindow.getByRole('button', { name: 'Agents', exact: true })).toHaveCount(1)
    await homeWindow.getByRole('button', { name: 'Providers', exact: true }).click()
    await expect(homeWindow.getByText('account-ui', { exact: true })).toBeVisible()
    await homeWindow.getByRole('button', { name: 'Disable' }).click()
    await expect(homeWindow.getByText('Disabled', { exact: true })).toBeVisible()
    await homeWindow.getByRole('button', { name: 'Enable' }).click()
    await expect(homeWindow.getByText('Enabled', { exact: true })).toBeVisible()

    await homeWindow.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(homeWindow.getByRole('heading', { name: 'Good morning' })).toBeVisible()
    await expect(homeWindow.getByText('P15 backend', { exact: true })).toBeVisible()
    await homeWindow.getByRole('button', { name: /PMS/ }).click()
    await expect(homeWindow.getByRole('heading', { name: 'PMS' })).toBeVisible()
    await expect(homeWindow.getByRole('navigation', { name: 'Project sections' })
      .getByRole('button')).toHaveCount(8)
    await homeWindow.getByRole('button', { name: 'Work Sessions' }).click()
    await expect(homeWindow.getByText('P15 backend', { exact: true })).toBeVisible()
    await homeWindow.getByRole('button', { name: /P15 backend/ }).click()
    await expect(homeWindow.getByRole('heading', { name: 'P15 backend' })).toBeVisible()
    await expect(homeWindow.getByRole('navigation', { name: 'Work Session sections' })
      .getByRole('button')).toHaveCount(6)
    await expect(homeWindow.getByText('Implement backend', { exact: true })).toBeVisible()
    await expect(invoke<{ name: string }>(app, 'project.get', { id: ids.projectId }))
      .resolves.toMatchObject({ name: 'PMS' })
    await expect(invoke<Array<{ target: { modelId: string } }>>(app, 'workSession.runtimeTargets', {
      projectId: ids.projectId, workSessionId: ids.workSessionId
    })).resolves.toMatchObject([{ target: { modelId: 'model-ui' } }])
    const firstWindow = await app.firstWindow()
    await firstWindow.evaluate(workflowRunId => {
      const scope = globalThis as unknown as { bs: { v2: { workflow: { subscribe(id: string,
        callback: (event: unknown) => void): () => void } } }; __v2Events?: unknown[] }
      scope.__v2Events = []
      scope.bs.v2.workflow.subscribe(workflowRunId, event => { scope.__v2Events!.push(event) })
    }, ids.workflowRunId)
    await firstWindow.getByLabel('Runtime target').selectOption('openai/account-ui/model-ui')
    await firstWindow.getByRole('button', { name: 'Switch runtime' }).click()
    await expect(firstWindow.getByText(/Runtime tool capability is unknown/)).toBeVisible()
    await firstWindow.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect.poll(() => firstWindow.evaluate(() => {
      const events = (globalThis as unknown as { __v2Events?: Array<{
        sequence: number; payload: { status: string }
      }> }).__v2Events ?? []
      return events.at(-1)
    })).toMatchObject({ sequence: 2, payload: { status: 'PAUSED' } })
    await app.close(); app = undefined

    app = await launch(userData)
    await expect(invoke<{ status: string }>(app, 'workSession.get', { id: ids.workSessionId }))
      .resolves.toMatchObject({ status: 'PAUSED' })
    await expect(invoke<{ status: string }>(app, 'workflow.get', { id: ids.workflowRunId }))
      .resolves.toMatchObject({ status: 'PAUSED' })
    const restartedWindow = await app.firstWindow()
    await restartedWindow.getByRole('button', { name: /P15 backend/ }).click()
    await expect(restartedWindow.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
    await restartedWindow.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(invoke<{ status: string }>(app, 'workflow.get', { id: ids.workflowRunId }))
      .resolves.toMatchObject({ status: 'EXECUTING' })
    const runtime = await invoke<{ runtimeHistory: { status: string; value?: Array<{ modelId: string }> } }>(
      app, 'workflow.runtimeHistory', { projectId: ids.projectId,
        workSessionId: ids.workSessionId, workflowRunId: ids.workflowRunId })
    expect(runtime.runtimeHistory).toMatchObject({ status: 'AVAILABLE',
      value: expect.arrayContaining([expect.objectContaining({ modelId: 'model-ui' })]) })

    await restartedWindow.getByRole('button', { name: 'Review', exact: true }).click()
    await expect(restartedWindow.getByText('Needs rework', { exact: true })).toBeVisible()
    await restartedWindow.getByRole('button', { name: 'Create rework task' }).click()
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
      expect.objectContaining({ modelId: 'model-ui' })
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
