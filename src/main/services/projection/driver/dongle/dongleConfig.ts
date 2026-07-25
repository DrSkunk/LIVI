import { MicType } from '@shared/types/Config'

// Dongle-only settings

export const DONGLE_MIC_TYPE: MicType = MicType.CarMic

// Dongle-internal audio buffer in ms (BoxSettings). Steers a buffer inside the dongle firmware.
// Warning: the Dongle has a known bug, it resonates between 375-425ms.
export const DONGLE_MEDIA_DELAY = 1000

export const DONGLE_APK_VER = '2025.03.19.1126'

export const DONGLE_CALL_QUALITY: 0 | 1 | 2 = 1

export const DONGLE_GPS: 0 | 1 = 1

// DashboardInfo bitfield: media(1) | vehicle(2) | route(4)
export const DONGLE_DASHBOARD_INFO = 1 | 2 | 4

// GNSSCapability bitfield: gps(1) | glonass(2) | galileo(4) | beidou(8)
export const DONGLE_GNSS_CAPABILITY = 1 | 2 | 4 | 8
