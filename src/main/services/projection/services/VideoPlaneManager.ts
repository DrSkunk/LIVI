import { getSecondaryWindow } from '@main/window/secondaryWindows'
import type { Config } from '@shared/types'
import type { ClusterScreen } from '@shared/utils'
import { aaContentArea, clusterTargetScreens } from '@shared/utils'
import { WebContents } from 'electron'
import { GstVideo, type GstVideoCodec } from '../../video/GstVideo'
import { clusterPlaneId, VIDEO_PLANE_MAIN } from '../../video/gstHost'
import { classifyNal } from '../../video/keyframe'
import type { ProjectionEvent } from './types'

type Region = {
  cropL: number
  cropT: number
  visW: number
  visH: number
  tierW: number
  tierH: number
}

export type VideoPlaneManagerDeps = {
  getWebContents: () => WebContents | null
  getConfig: () => Config
  emit: (payload: ProjectionEvent) => void
  // Seam A stays in ProjectionService; the manager reads the negotiated sizes for crop math.
  getMainVideoSize: () => { width: number; height: number }
  getClusterVideoSize: () => { width: number; height: number }
}

/**
 * Owns the GstVideo decode/render planes (main + one per cluster screen) and their
 * codec / keyframe-gate / crop / visibility state. Frame bytes pass through untouched
 * (zero-copy): pushMain/pushCluster hand the same Buffer reference to GstVideo.push.
 */
export class VideoPlaneManager {
  private gstVideo: GstVideo | null = null
  private gstVideoCodec: GstVideoCodec = 'h264'
  private gstVideoCodecData: Buffer | null = null
  private gstVideoClusterCodecData: Buffer | null = null
  private mainAwaitingKeyframe = true
  private clusterAwaitingKeyframe = true
  private gstVideoVisible = true
  private videoCrop: Region | null = null
  private gstVideoClusters = new Map<ClusterScreen, GstVideo>()
  private gstVideoClusterCodec: GstVideoCodec = 'h264'
  private clusterVisible = false
  private clusterStreamActive: boolean | null = null

  constructor(private readonly deps: VideoPlaneManagerDeps) {}

  dispose(): void {
    this.gstVideo?.dispose()
    this.gstVideo = null
    this.gstVideoCodec = 'h264'
    this.gstVideoCodecData = null
    this.mainAwaitingKeyframe = true
    for (const plane of this.gstVideoClusters.values()) plane.dispose()
    this.gstVideoClusters.clear()
    this.gstVideoClusterCodec = 'h264'
    this.gstVideoClusterCodecData = null
    this.clusterAwaitingKeyframe = true
  }

  setMainCodec(codec: GstVideoCodec): void {
    this.gstVideoCodec = codec
  }

  setClusterCodec(codec: GstVideoCodec): void {
    this.gstVideoClusterCodec = codec
  }

  // CarPlay's codec_data record, in before the first frame; applied live if the plane exists.
  setMainCodecData(codecData: Buffer): void {
    if (!this.gstVideoCodecData || !this.gstVideoCodecData.equals(codecData)) {
      this.mainAwaitingKeyframe = true
    }
    this.gstVideoCodecData = codecData
    this.gstVideo?.setCodecData(codecData)
  }

  setClusterCodecData(codecData: Buffer): void {
    if (!this.gstVideoClusterCodecData || !this.gstVideoClusterCodecData.equals(codecData)) {
      this.clusterAwaitingKeyframe = true
    }
    this.gstVideoClusterCodecData = codecData
    for (const plane of this.gstVideoClusters.values()) plane.setCodecData(codecData)
  }

  getMainCodec(): GstVideoCodec {
    return this.gstVideoCodec
  }

  // Seed codec state from a restored session (raw, no keyframe reset / no live apply).
  restoreCodecs(
    mainCodec: GstVideoCodec | undefined,
    clusterCodec: GstVideoCodec | undefined,
    mainCodecData: Buffer | null,
    clusterCodecData: Buffer | null
  ): void {
    if (mainCodec) this.gstVideoCodec = mainCodec
    if (clusterCodec) this.gstVideoClusterCodec = clusterCodec
    this.gstVideoCodecData = mainCodecData
    this.gstVideoClusterCodecData = clusterCodecData
  }

  // native-config path: create/prepare the main plane. Returns whether it was newly created.
  prepareMain(codec: GstVideoCodec, atom: Buffer): boolean {
    const wc = this.deps.getWebContents()
    if (!wc || wc.isDestroyed?.()) return false
    this.gstVideoCodec = codec
    this.gstVideoCodecData = atom
    const created = !this.gstVideo
    if (!this.gstVideo) {
      this.gstVideo = new GstVideo(wc, 'main', 'main', VIDEO_PLANE_MAIN)
      this.gstVideo.setVisible(this.gstVideoVisible)
    }
    this.gstVideo.prepare(codec, atom)
    this.applyVideoCrop()
    return created
  }

  // native-config path: create/prepare cluster planes. Returns whether any was newly created.
  prepareClusters(codec: GstVideoCodec, atom: Buffer): boolean {
    this.gstVideoClusterCodec = codec
    this.gstVideoClusterCodecData = atom
    let created = false
    for (const screen of clusterTargetScreens(this.deps.getConfig())) {
      let plane = this.gstVideoClusters.get(screen)
      if (!plane) {
        const wc = this.clusterScreenWebContents(screen)
        if (!wc || wc.isDestroyed?.()) continue
        plane = new GstVideo(wc, `cluster-${screen}`, screen, clusterPlaneId(screen))
        plane.setVisible(this.clusterPlaneVisible(screen))
        this.applyClusterCrop(plane)
        this.gstVideoClusters.set(screen, plane)
        created = true
      }
      plane.prepare(codec, atom)
    }
    return created
  }

  pushMain(nal: Buffer): void {
    const wc = this.deps.getWebContents()
    if (!wc || wc.isDestroyed?.()) return
    if (this.mainAwaitingKeyframe) {
      const kind = classifyNal(nal, this.gstVideoCodec, this.gstVideoCodecData !== null)
      if (kind === 'delta') return
      if (kind === 'keyframe') this.mainAwaitingKeyframe = false
    }
    if (!this.gstVideo) {
      this.gstVideo = new GstVideo(wc)
      this.gstVideo.setVisible(this.gstVideoVisible)
      if (this.gstVideoCodecData) this.gstVideo.setCodecData(this.gstVideoCodecData)
      this.applyVideoCrop()
      this.deps.emit({ type: 'projection', shown: true })
    }
    this.gstVideo.push(this.gstVideoCodec, nal)
  }

  pushCluster(nal: Buffer): void {
    // Focus-stopped: ignore in-flight tail frames. Safe for the decoder because the
    // resume (PROJECTED indication) always restarts the stream at a fresh keyframe.
    if (this.clusterStreamActive === false) return
    if (this.clusterAwaitingKeyframe) {
      const kind = classifyNal(
        nal,
        this.gstVideoClusterCodec,
        this.gstVideoClusterCodecData !== null
      )
      if (kind === 'delta') return
      if (kind === 'keyframe') this.clusterAwaitingKeyframe = false
    }
    // one plane per configured screen, all fed the same cluster stream
    for (const screen of clusterTargetScreens(this.deps.getConfig())) {
      let plane = this.gstVideoClusters.get(screen)
      if (!plane) {
        const wc = this.clusterScreenWebContents(screen)
        if (!wc || wc.isDestroyed?.()) continue
        plane = new GstVideo(wc, `cluster-${screen}`, screen)
        plane.setVisible(this.clusterPlaneVisible(screen))
        if (this.gstVideoClusterCodecData) plane.setCodecData(this.gstVideoClusterCodecData)
        this.applyClusterCrop(plane) // fit to the configured cluster-stream AR
        this.gstVideoClusters.set(screen, plane)
      }
      plane.push(this.gstVideoClusterCodec, nal)
    }
  }

  updateMainCrop(): void {
    const { width: tw, height: th } = this.deps.getMainVideoSize()
    const cfg = this.deps.getConfig()
    const dw = cfg.projectionWidth ?? 0
    const dh = cfg.projectionHeight ?? 0
    if (tw > 0 && th > 0 && dw > 0 && dh > 0) {
      const { contentWidth, contentHeight } = aaContentArea(
        { width: tw, height: th },
        { width: dw, height: dh }
      )
      this.videoCrop = {
        cropL: Math.max(0, (tw - contentWidth) / 2),
        cropT: Math.max(0, (th - contentHeight) / 2),
        visW: contentWidth,
        visH: contentHeight,
        tierW: tw,
        tierH: th
      }
    } else {
      this.videoCrop = null
    }
    this.applyVideoCrop()
  }

  recropAllClusters(): void {
    for (const plane of this.gstVideoClusters.values()) this.applyClusterCrop(plane)
  }

  setVideoVisible(visible: boolean): void {
    this.gstVideoVisible = visible
    this.gstVideo?.setVisible(visible)
  }

  // Cluster plane visibility (cluster:request) drives the main-screen plane only.
  setClusterVisible(visible: boolean): void {
    this.clusterVisible = visible
    this.gstVideoClusters.get('main')?.setVisible(visible)
  }

  // Returns whether the active flag changed (caller drives the driver focus).
  updateClusterStreamActive(want: boolean): boolean {
    if (want === this.clusterStreamActive) return false
    this.clusterStreamActive = want
    return true
  }

  resetClusterStreamActive(): void {
    this.clusterStreamActive = null
  }

  // Drop cluster planes for screens no longer targeted (re-spawn on demand).
  retainScreens(): void {
    const nextScreens = new Set(clusterTargetScreens(this.deps.getConfig()))
    for (const [screen, plane] of this.gstVideoClusters) {
      if (!nextScreens.has(screen)) {
        plane.dispose()
        this.gstVideoClusters.delete(screen)
      }
    }
  }

  private applyVideoCrop(): void {
    const r = this.videoCrop
    this.gstVideo?.setContentRegion(
      r?.cropL ?? 0,
      r?.cropT ?? 0,
      r?.visW ?? 0,
      r?.visH ?? 0,
      r?.tierW ?? 0,
      r?.tierH ?? 0
    )
  }

  private applyClusterCrop(plane: GstVideo): void {
    const { width: tw, height: th } = this.deps.getClusterVideoSize()
    const cfg = this.deps.getConfig()
    const dw = cfg.clusterWidth ?? 0
    const dh = cfg.clusterHeight ?? 0
    if (tw > 0 && th > 0 && dw > 0 && dh > 0) {
      const { contentWidth, contentHeight } = aaContentArea(
        { width: tw, height: th },
        { width: dw, height: dh }
      )
      plane.setContentRegion(
        Math.max(0, (tw - contentWidth) / 2),
        Math.max(0, (th - contentHeight) / 2),
        contentWidth,
        contentHeight,
        tw,
        th
      )
    } else {
      plane.setContentRegion(0, 0, 0, 0, 0, 0)
    }
  }

  private clusterPlaneVisible(screen: ClusterScreen): boolean {
    return screen === 'main' ? this.clusterVisible : true
  }

  // main → main window; dash/aux → their secondary window. mac embeds the plane into that
  // window's native view; Linux ignores the handle and places it on the target screen.
  private clusterScreenWebContents(screen: ClusterScreen): WebContents | null {
    if (screen === 'main') return this.deps.getWebContents() ?? null
    const w = getSecondaryWindow(screen)
    return w && !w.isDestroyed() ? w.webContents : null
  }
}
