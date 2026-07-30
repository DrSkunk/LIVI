import { buildResponse, parseMessages, type RtspRequest } from '../rtspMessage'

function req(text: string, body: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([Buffer.from(text, 'ascii'), body])
}

describe('parseMessages', () => {
  test('parses a bodyless message', () => {
    const { messages, rest } = parseMessages(req('GET /info RTSP/1.0\r\nCSeq: 1\r\n\r\n'))
    expect(messages).toHaveLength(1)
    expect(messages[0].method).toBe('GET')
    expect(messages[0].path).toBe('/info')
    expect(messages[0].protocol).toBe('RTSP/1.0')
    expect(messages[0].headers).toEqual({ cseq: '1' })
    expect(messages[0].body.length).toBe(0)
    expect(rest.length).toBe(0)
  })

  test('parses a message with a content-length body', () => {
    const body = Buffer.from([0x62, 0x70, 0x00])
    const { messages, rest } = parseMessages(
      req('POST /pair-setup RTSP/1.0\r\nContent-Length: 3\r\n\r\n', body)
    )
    expect(messages[0].body.equals(body)).toBe(true)
    expect(rest.length).toBe(0)
  })

  test('lower-cases header names and trims values', () => {
    const { messages } = parseMessages(req('GET / RTSP/1.0\r\nX-Custom-Header:  spaced  \r\n\r\n'))
    expect(messages[0].headers['x-custom-header']).toBe('spaced')
  })

  test('skips malformed header lines without a colon', () => {
    const { messages } = parseMessages(req('GET / RTSP/1.0\r\nbogus line\r\nCSeq: 2\r\n\r\n'))
    expect(messages[0].headers).toEqual({ cseq: '2' })
  })

  test('parses two messages from one buffer', () => {
    const { messages, rest } = parseMessages(
      Buffer.concat([
        req('GET /a RTSP/1.0\r\nContent-Length: 2\r\n\r\n', Buffer.from('hi')),
        req('GET /b RTSP/1.0\r\n\r\n')
      ])
    )
    expect(messages.map((m) => m.path)).toEqual(['/a', '/b'])
    expect(messages[0].body.toString()).toBe('hi')
    expect(rest.length).toBe(0)
  })

  test('keeps an incomplete header as rest', () => {
    const partial = req('GET /info RTSP/1.0\r\nCSeq')
    const { messages, rest } = parseMessages(partial)
    expect(messages).toHaveLength(0)
    expect(rest.equals(partial)).toBe(true)
  })

  test('keeps a message with a partial body as rest', () => {
    const partial = req('POST / RTSP/1.0\r\nContent-Length: 10\r\n\r\n', Buffer.from('short'))
    const { messages, rest } = parseMessages(partial)
    expect(messages).toHaveLength(0)
    expect(rest.equals(partial)).toBe(true)
  })

  test('treats an unparsable content-length as zero', () => {
    const { messages } = parseMessages(req('GET / RTSP/1.0\r\nContent-Length: abc\r\n\r\n'))
    expect(messages[0].body.length).toBe(0)
  })

  test('defaults missing request-line parts', () => {
    const { messages } = parseMessages(req('PING\r\n\r\n'))
    expect(messages[0].method).toBe('PING')
    expect(messages[0].path).toBe('')
    expect(messages[0].protocol).toBe('RTSP/1.0')
  })
})

function baseReq(headers: Record<string, string> = {}): RtspRequest {
  return { method: 'GET', path: '/info', protocol: 'RTSP/1.0', headers, body: Buffer.alloc(0) }
}

describe('buildResponse', () => {
  test('builds a 200 OK echoing protocol and CSeq with content-length', () => {
    const buf = buildResponse(baseReq({ cseq: '7' }), {})
    expect(buf.toString('ascii')).toBe('RTSP/1.0 200 OK\r\nCSeq: 7\r\nContent-Length: 0\r\n\r\n')
  })

  test('appends the body and its length', () => {
    const body = Buffer.from('plist')
    const buf = buildResponse(baseReq(), { body })
    const text = buf.toString('ascii')
    expect(text).toContain('Content-Length: 5\r\n')
    expect(buf.subarray(buf.length - 5).equals(body)).toBe(true)
  })

  test('uses the provided status with its known text', () => {
    expect(buildResponse(baseReq(), { status: 404 }).toString('ascii')).toContain(
      'RTSP/1.0 404 Not Found\r\n'
    )
  })

  test('falls back to OK for an unknown status without text', () => {
    expect(buildResponse(baseReq(), { status: 418 }).toString('ascii')).toContain(
      'RTSP/1.0 418 OK\r\n'
    )
  })

  test('prefers an explicit statusText and protocol', () => {
    const buf = buildResponse(baseReq(), {
      protocol: 'HTTP/1.1',
      status: 500,
      statusText: 'Nope'
    })
    expect(buf.toString('ascii')).toContain('HTTP/1.1 500 Nope\r\n')
  })

  test('merges custom headers and omits CSeq when the request has none', () => {
    const text = buildResponse(baseReq(), {
      headers: { 'Content-Type': 'application/x-apple-binary-plist' }
    }).toString('ascii')
    expect(text).toContain('Content-Type: application/x-apple-binary-plist\r\n')
    expect(text).not.toContain('CSeq')
  })
})
