/**
 * AOAP handshake helpers — switch a stock Android phone into accessory mode
 * Spec: https://source.android.com/docs/core/interaction/accessories/aoa
 */

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
  REQ_START,
  STRING_DESCRIPTION,
  STRING_MANUFACTURER,
  STRING_MODEL,
  STRING_SERIAL,
  STRING_URI,
  STRING_VERSION
} from './constants.js'

type Device = USBDevice

const TRANSFER_TIMEOUT_MS = 2_000

export function isAccessoryMode(device: Device): boolean {
  return (
    device.vendorId === GOOGLE_VID &&
    (ACCESSORY_PIDS as readonly number[]).includes(device.productId)
  )
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`AOAP control transfer timeout (${label})`)),
      TRANSFER_TIMEOUT_MS
    )
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e as Error)
      }
    )
  })
}

// AOAP uses vendor/device control transfers. WebUSB models direction via the In/Out method.
async function controlIn(
  device: Device,
  request: number,
  value: number,
  index: number,
  length: number
): Promise<Buffer> {
  const r = await withTimeout(
    device.controlTransferIn(
      { requestType: 'vendor', recipient: 'device', request, value, index },
      length
    ),
    `req=${request}`
  )
  if (r.status !== 'ok' || !r.data) {
    throw new Error(`AOAP control IN req=${request} status=${r.status ?? 'no-data'}`)
  }
  return Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength)
}

async function controlOut(
  device: Device,
  request: number,
  value: number,
  index: number,
  data: Buffer
): Promise<void> {
  // Always pass a (possibly empty) buffer: the WebUSB layer's toUint8Array dereferences `.buffer`,
  // so `undefined` for a zero-length payload (e.g. AOAP START) would throw.
  const r = await withTimeout(
    device.controlTransferOut(
      { requestType: 'vendor', recipient: 'device', request, value, index },
      data
    ),
    `req=${request}`
  )
  if (r.status !== 'ok') {
    throw new Error(`AOAP control OUT req=${request} status=${r.status}`)
  }
}

async function getProtocol(device: Device): Promise<number> {
  const data = await controlIn(device, REQ_GET_PROTOCOL, 0, 0, 2)
  if (data.length < 2) {
    throw new Error('AOAP getProtocol returned no data')
  }
  return data.readUInt16LE(0)
}

async function sendString(device: Device, index: number, value: string): Promise<void> {
  const buf = Buffer.from(`${value}\0`, 'utf8')
  await controlOut(device, REQ_SEND_STRING, 0, index, buf)
}

async function startAccessory(device: Device): Promise<void> {
  await controlOut(device, REQ_START, 0, 0, Buffer.alloc(0))
}

// AOAP control transfers
export async function runAoapHandshake(device: Device): Promise<void> {
  if (isAccessoryMode(device)) {
    // Already in accessory mode
    return
  }

  if (!device.configuration && device.configurations.length > 0) {
    try {
      await device.selectConfiguration(device.configurations[0]!.configurationValue)
    } catch {
      /* ignore */
    }
  }

  const proto = await getProtocol(device)
  if (proto < 1) {
    throw new Error(`AOAP protocol version ${proto} not supported by device`)
  }

  await sendString(device, STRING_MANUFACTURER, AOAP_MANUFACTURER)
  await sendString(device, STRING_MODEL, AOAP_MODEL)
  await sendString(device, STRING_DESCRIPTION, AOAP_DESCRIPTION)
  await sendString(device, STRING_VERSION, AOAP_VERSION)
  await sendString(device, STRING_URI, AOAP_URI)
  await sendString(device, STRING_SERIAL, AOAP_SERIAL)

  await startAccessory(device)
}
