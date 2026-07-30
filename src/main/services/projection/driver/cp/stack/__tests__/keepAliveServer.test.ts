import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import { KeepAliveServer } from '../keepAliveServer'

describe('KeepAliveServer', () => {
  test('listen binds an udp socket and resolves the port', async () => {
    const server = new KeepAliveServer()
    const port = await server.listen()
    expect(port).toBeGreaterThan(0)
    server.stop()
  })

  test('discards incoming datagrams', async () => {
    const server = new KeepAliveServer()
    await server.listen()
    const sock = (server as unknown as { _sock: dgram.Socket })._sock
    expect(() => sock.emit('message', Buffer.from('ping'), {})).not.toThrow()
    server.stop()
  })

  test('stop is a no-op when never listening', () => {
    expect(() => new KeepAliveServer().stop()).not.toThrow()
  })

  test('stop closes the socket and clears it', async () => {
    const server = new KeepAliveServer()
    await server.listen()
    const sock = (server as unknown as { _sock: dgram.Socket | null })._sock
    server.stop()
    expect((server as unknown as { _sock: dgram.Socket | null })._sock).toBeNull()
    expect(() => (sock as dgram.Socket).address()).toThrow()
  })

  test('listen rejects when the socket errors before binding', async () => {
    const fake = new EventEmitter() as EventEmitter & { bind: (...args: unknown[]) => void }
    fake.bind = () => fake.emit('error', new Error('EADDRINUSE'))
    const spy = vi.spyOn(dgram, 'createSocket').mockReturnValue(fake as unknown as dgram.Socket)
    await expect(new KeepAliveServer().listen()).rejects.toThrow('EADDRINUSE')
    spy.mockRestore()
  })
})
