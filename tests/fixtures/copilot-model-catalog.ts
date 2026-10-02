export const copilotModelCatalog = {
  data: ['gpt-4.1', 'claude-sonnet-4'].map(id => ({ id, name: id, model_picker_enabled: true, policy: { state: 'enabled' }, capabilities: { type: 'chat', supports: { streaming: true, tool_calls: true } } }))
}
