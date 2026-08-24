export const OPENAI_TOOL_CALL_400 = {
  error: {
    message: "Invalid value: 'tool-call'. Supported values are: 'input_text', 'input_image', 'input_audio', 'output_text', 'refusal', 'input_file', 'computer_screenshot', 'summary_text', and 'encrypted_content'."
  }
}

export const ANTIGRAVITY_ENTITY_404 = {
  error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' }
}

export const MISLABELED_SSE = [
  'event: response.created',
  'data: {"type":"response.created","response":{"id":"r1"}}',
  '',
  'event: response.output_text.delta',
  'data: {"type":"response.output_text.delta","delta":"recovered"}',
  '',
  'event: response.completed',
  'data: {"type":"response.completed","response":{"id":"r1"}}',
  '',
  ''
].join('\n')

export const SPLIT_SSE_CHUNKS = [
  ': keep-alive\r\nevent: response.output_text.delta\r\nda',
  'ta: {"type":"response.output_text.delta","delta":"split"}\r\n\r\n',
  'data: [DONE]\r\n\r\n'
]

export const MALFORMED_THEN_VALID_SSE = [
  'event: response.output_text.delta\n',
  'data: {broken\n\n',
  'event: response.output_text.delta\n',
  'data: {"type":"response.output_text.delta","delta":"valid-after-error"}\n\n',
  'event: response.completed\n',
  'data: {"type":"response.completed","response":{"id":"r2"}}\n\n'
].join('')

export const OPENAI_COMPLETED = {
  id: 'response-fixture',
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'openai text' }] }],
  usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 }
}

export const CLOUD_CODE_TEXT_SSE = `data: ${JSON.stringify({
  response: {
    candidates: [{
      content: { parts: [{ text: 'cloud code text' }] },
      finishReason: 'STOP',
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2, totalTokenCount: 10 }
    }]
  }
})}\n\n`

export const OPENAI_COMPATIBLE_TEXT_SSE = [
  'data: {"id":"chat-fixture","object":"chat.completion.chunk","created":1,"model":"fixture-code","choices":[{"index":0,"delta":{"role":"assistant","content":"compatible text"},"finish_reason":null}]}',
  '',
  'data: {"id":"chat-fixture","object":"chat.completion.chunk","created":1,"model":"fixture-code","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}',
  '',
  'data: [DONE]',
  '',
  ''
].join('\n')

export function chunkedResponse(chunks: string[], contentType = 'text/event-stream'): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  }), { status: 200, headers: { 'content-type': contentType } })
}
