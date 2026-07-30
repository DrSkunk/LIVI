import type { Mock } from 'vitest'
import {
  ACCESSORY_PIDS,
  AOAP_DESCRIPTION,
  AOAP_MANUFACTURER,
  AOAP_MODEL,
  AOAP_SERIAL,
  AOAP_URI,
  AOAP_VERSION,
  GOOGLE_VID,
  REQ_GET_PROTOCOL,
  REQ_SEND_STRING,
  REQ_START
} from '../constants'
import { isAccessoryMode, runAoapHandshake } from '../handshake'

type Device = USBDevice

type CtrlCall = {
  request: number
  value: number
  index: number
  data: Buffer | number
}

type FakeDevice = {
  vendorId: number
  productId: number
  configuration: USBConfiguration | undefined
  configurations: USBConfiguration[]
  open: Mock
  close: Mock
  reset: Mock
  selectConfiguration: Mock
  claimInterface: Mock
  releaseInterface: Mock
  controlTransferIn: Mock
  controlTransferOut: Mock
  calls: CtrlCall[]
}

function makeConfiguration(): USBConfiguration {
  return {
    configurationValue: 1,
    configurationName: undefined,
    interfaces: [
      {
        interfaceNumber: 0,
        claimed: false,
        alternate: { endpoints: [] },
        alternates: []
      }
    ]
  } as unknown as USBConfiguration
}

function makeDevice(
  opts: {
    vid?: number
    pid?: number
    protocol?: number
    ctrlError?: Error
    openThrows?: boolean
    claimError?: Error
    stuck?: boolean
    inStatus?: string
    inNoData?: boolean
    protocolBytes?: number
    outStatus?: string
    noConfiguration?: boolean
    emptyConfigurations?: boolean
    selectThrows?: boolean
  } = {}
): FakeDevice {
  const { vid = GOOGLE_VID, pid = 0x4ee1, protocol = 2, ctrlError, openThrows, claimError } = opts
  const calls: CtrlCall[] = []
  const config = makeConfiguration()

  // Resolves never (used by the timeout test).
  const stuckPromise = <T>(): Promise<T> => new Promise<T>(() => {})

  const controlTransferIn = vi.fn(async (setup: USBControlTransferParameters, length: number) => {
    calls.push({ request: setup.request, value: setup.value, index: setup.index, data: length })
    if (opts.stuck) return stuckPromise<USBInTransferResult>()
    if (ctrlError) throw ctrlError
    if (opts.inStatus || opts.inNoData) {
      return {
        status: opts.inStatus,
        data: opts.inNoData ? undefined : new DataView(new ArrayBuffer(2))
      } as unknown as USBInTransferResult
    }
    if (setup.request === REQ_GET_PROTOCOL) {
      const n = opts.protocolBytes ?? 2
      const buf = Buffer.alloc(Math.max(n, 2))
      buf.writeUInt16LE(protocol, 0)
      return {
        status: 'ok',
        data: new DataView(buf.buffer, buf.byteOffset, n)
      } as USBInTransferResult
    }
    return { status: 'ok', data: new DataView(new ArrayBuffer(0)) } as USBInTransferResult
  })

  const controlTransferOut = vi.fn(
    async (setup: USBControlTransferParameters, data?: BufferSource) => {
      const payload = data
        ? Buffer.from(
            (data as ArrayBufferView).buffer,
            (data as ArrayBufferView).byteOffset,
            (data as ArrayBufferView).byteLength
          )
        : Buffer.alloc(0)
      calls.push({
        request: setup.request,
        value: setup.value,
        index: setup.index,
        data: payload
      })
      if (opts.stuck) return stuckPromise<USBOutTransferResult>()
      if (ctrlError) throw ctrlError
      if (opts.outStatus) return { status: opts.outStatus } as unknown as USBOutTransferResult
      return { status: 'ok', bytesWritten: payload.length } as USBOutTransferResult
    }
  )

  return {
    vendorId: vid,
    productId: pid,
    configuration: opts.noConfiguration ? undefined : config,
    configurations: opts.emptyConfigurations ? [] : [config],
    open: vi.fn(async () => {
      if (openThrows) throw new Error('open failed')
    }),
    close: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    selectConfiguration: vi.fn(async () => {
      if (opts.selectThrows) throw new Error('select failed')
    }),
    claimInterface: vi.fn(async () => {
      if (claimError) throw claimError
    }),
    releaseInterface: vi.fn(async () => undefined),
    controlTransferIn,
    controlTransferOut,
    calls
  }
}

describe('isAccessoryMode', () => {
  test.each(ACCESSORY_PIDS as readonly number[])('Google VID + PID %s → true', (pid) => {
    const d = makeDevice({ vid: GOOGLE_VID, pid })
    expect(isAccessoryMode(d as unknown as Device)).toBe(true)
  })

  test('non-Google VID → false', async () => {
    const d = makeDevice({ vid: 0x1234, pid: 0x4ee1 })
    expect(isAccessoryMode(d as unknown as Device)).toBe(false)
  })

  test('Google VID + non-accessory PID → false', async () => {
    const d = makeDevice({ vid: GOOGLE_VID, pid: 0xabcd })
    expect(isAccessoryMode(d as unknown as Device)).toBe(false)
  })
})

describe('runAoapHandshake', () => {
  test('returns immediately when the device is already in accessory mode', async () => {
    const d = makeDevice({ vid: GOOGLE_VID, pid: 0x2d00 })
    await runAoapHandshake(d as unknown as Device)
    expect(d.controlTransferIn).not.toHaveBeenCalled()
    expect(d.controlTransferOut).not.toHaveBeenCalled()
  })

  test('walks the full sequence: getProtocol → 6× sendString → start', async () => {
    const d = makeDevice({ pid: 0x4ee1, protocol: 2 })
    await runAoapHandshake(d as unknown as Device)

    const sendStrings = d.calls.filter((c) => c.request === REQ_SEND_STRING)
    expect(sendStrings).toHaveLength(6)
    expect(d.calls.find((c) => c.request === REQ_GET_PROTOCOL)).toBeDefined()
    expect(d.calls.find((c) => c.request === REQ_START)).toBeDefined()
  })

  test('claims no interface', async () => {
    const d = makeDevice({ pid: 0x4ee1, protocol: 2 })
    await runAoapHandshake(d as unknown as Device)
    expect(d.claimInterface).not.toHaveBeenCalled()
    expect(d.releaseInterface).not.toHaveBeenCalled()
  })

  test('completes while the only interface is held by another process', async () => {
    const d = makeDevice({
      pid: 0x4ee1,
      protocol: 2,
      claimError: new Error('kIOReturnExclusiveAccess (0xe00002c5)')
    })
    await runAoapHandshake(d as unknown as Device)
    expect(d.calls.find((c) => c.request === REQ_START)).toBeDefined()
  })

  test('AOAP START sends an empty buffer (never undefined)', async () => {
    const d = makeDevice({ pid: 0x4ee1, protocol: 2 })
    await runAoapHandshake(d as unknown as Device)
    const start = d.calls.find((c) => c.request === REQ_START)
    expect(start).toBeDefined()
    const buf = start!.data as Buffer
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBe(0)
  })

  test('sendString passes wIndex = string-id and a NUL-terminated UTF-8 buffer', async () => {
    const d = makeDevice({ pid: 0x4ee1, protocol: 2 })
    await runAoapHandshake(d as unknown as Device)
    const expectedStrings = [
      AOAP_MANUFACTURER,
      AOAP_MODEL,
      AOAP_DESCRIPTION,
      AOAP_VERSION,
      AOAP_URI,
      AOAP_SERIAL
    ]
    const sends = d.calls.filter((c) => c.request === REQ_SEND_STRING)
    sends.forEach((s, i) => {
      const buf = s.data as Buffer
      expect(buf[buf.length - 1]).toBe(0) // NUL terminator
      expect(buf.subarray(0, buf.length - 1).toString('utf8')).toBe(expectedStrings[i])
      expect(s.index).toBe(i)
    })
  })

  test('rejects when protocol < 1', async () => {
    const d = makeDevice({ pid: 0x4ee1, protocol: 0 })
    await expect(runAoapHandshake(d as unknown as Device)).rejects.toThrow('not supported')
  })

  test('propagates a control-transfer error', async () => {
    const d = makeDevice({ pid: 0x4ee1, ctrlError: new Error('boom') })
    await expect(runAoapHandshake(d as unknown as Device)).rejects.toThrow('boom')
  })

  test('rejects when a control IN transfer reports a non-ok status', async () => {
    const d = makeDevice({ pid: 0x4ee1, inStatus: 'stall' })
    await expect(runAoapHandshake(d as unknown as Device)).rejects.toThrow('status=stall')
  })

  test('rejects with no-data when a control IN transfer omits its payload', async () => {
    const d = makeDevice({ pid: 0x4ee1, inNoData: true })
    await expect(runAoapHandshake(d as unknown as Device)).rejects.toThrow('no-data')
  })

  test('rejects when getProtocol returns fewer than 2 bytes', async () => {
    const d = makeDevice({ pid: 0x4ee1, protocolBytes: 1 })
    await expect(runAoapHandshake(d as unknown as Device)).rejects.toThrow('returned no data')
  })

  test('rejects when a control OUT transfer reports a non-ok status', async () => {
    const d = makeDevice({ pid: 0x4ee1, outStatus: 'stall' })
    await expect(runAoapHandshake(d as unknown as Device)).rejects.toThrow('OUT req')
  })

  test('selects the first configuration when the device has none active', async () => {
    const d = makeDevice({ pid: 0x4ee1, protocol: 2, noConfiguration: true })
    await runAoapHandshake(d as unknown as Device)
    expect(d.selectConfiguration).toHaveBeenCalledWith(1)
  })

  test('a failed selectConfiguration is swallowed and the handshake continues', async () => {
    const d = makeDevice({ pid: 0x4ee1, protocol: 2, noConfiguration: true, selectThrows: true })
    await runAoapHandshake(d as unknown as Device)
    expect(d.calls.find((c) => c.request === REQ_START)).toBeDefined()
  })

  test('skips selectConfiguration when the device lists no configurations', async () => {
    const d = makeDevice({
      pid: 0x4ee1,
      protocol: 2,
      noConfiguration: true,
      emptyConfigurations: true
    })
    await runAoapHandshake(d as unknown as Device)
    expect(d.selectConfiguration).not.toHaveBeenCalled()
  })

  test('times out when the control transfer never completes', async () => {
    vi.useFakeTimers()
    const d = makeDevice({ pid: 0x4ee1, stuck: true })
    const p = runAoapHandshake(d as unknown as Device)
    // Surface the rejection so an unhandled-rejection warning isn't logged.
    const assertion = expect(p).rejects.toThrow(/timeout/)
    await vi.advanceTimersByTimeAsync(2_500)
    await assertion
    vi.useRealTimers()
  })
})
