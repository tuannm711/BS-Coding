export interface ArtifactRef {
  readonly id: string
  readonly projectId: string
  readonly kind: string
  readonly path: string
  readonly size: number
  readonly sha256?: string
}

export interface ArtifactStore {
  get(id: string): Promise<ArtifactRef | null>
  save(artifact: ArtifactRef): Promise<void>
  listByProject(projectId: string): Promise<ArtifactRef[]>
}
