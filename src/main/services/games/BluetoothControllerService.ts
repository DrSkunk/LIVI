import { execFile } from 'node:child_process'
import type { BluetoothControllerDevice } from '@shared/types'

const MAC_RE = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/i
const CONTROLLER_HINT =
  /controller|gamepad|dualshock|dualsense|xbox|8bitdo|joy-?con|pro controller|wireless controller/i

function runBluetoothctl(args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'bluetoothctl',
      args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || stdout || error.message).trim()))
          return
        }
        resolve(stdout)
      }
    )
  })
}

function field(output: string, name: string): string {
  const match = output.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, 'im'))
  return match?.[1]?.trim() ?? ''
}

function isController(name: string, info: string): boolean {
  const icon = field(info, 'Icon')
  return (
    icon === 'input-gaming' ||
    /Human Interface Device|00001124|00001812/i.test(info) ||
    CONTROLLER_HINT.test(name)
  )
}

export class BluetoothControllerService {
  private requireLinux(): void {
    if (process.platform !== 'linux') throw new Error('Bluetooth controller pairing requires Linux')
  }

  private validateMac(mac: string): string {
    const value = mac.trim().toUpperCase()
    if (!MAC_RE.test(value)) throw new Error('Invalid Bluetooth address')
    return value
  }

  async list(): Promise<BluetoothControllerDevice[]> {
    this.requireLinux()
    const output = await runBluetoothctl(['devices'])
    const devices = [...output.matchAll(/^Device\s+([0-9A-F:]{17})\s+(.+)$/gim)]
    const result: BluetoothControllerDevice[] = []

    for (const match of devices) {
      const mac = match[1].toUpperCase()
      const fallbackName = match[2].trim()
      let info = ''
      try {
        info = await runBluetoothctl(['info', mac], 5000)
      } catch {
        continue
      }
      const paired = /^\s*Paired:\s*yes$/im.test(info)
      const name = field(info, 'Name') || field(info, 'Alias') || fallbackName
      if (!paired && !isController(name, info)) continue
      result.push({
        mac,
        name,
        paired,
        connected: /^\s*Connected:\s*yes$/im.test(info)
      })
    }

    return result.sort(
      (a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name)
    )
  }

  async scan(): Promise<BluetoothControllerDevice[]> {
    this.requireLinux()
    // bluetoothctl exits itself after timeout while BlueZ keeps every discovered
    // device in its object tree for the list call below.
    await runBluetoothctl(['--timeout', '8', 'scan', 'on'], 12000).catch((error) => {
      if (!/timeout/i.test(String(error))) throw error
    })
    return this.list()
  }

  async pair(mac: string): Promise<{ ok: true }> {
    this.requireLinux()
    const address = this.validateMac(mac)
    await runBluetoothctl(['--agent', 'NoInputNoOutput', '--timeout', '45', 'pair', address], 50000)
    await runBluetoothctl(['trust', address], 10000)
    // Pairing is complete even when a sleeping controller refuses immediate connect.
    await runBluetoothctl(['--timeout', '15', 'connect', address], 20000).catch(() => '')
    return { ok: true }
  }
}
