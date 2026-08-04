import * as Lucide from 'lucide-react'
import { type ForwardRefExoticComponent, forwardRef, type RefAttributes } from 'react'

type IconSx = Record<string, unknown> & {
  color?: string
  fontSize?: number | string
}
type IconProps = Lucide.LucideProps & {
  titleAccess?: string
  sx?: IconSx
}
type GlyphComponent = ForwardRefExoticComponent<
  Omit<Lucide.LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>

const fallback = Lucide.Circle
const glyphs = Lucide as unknown as Record<string, GlyphComponent>
const icon = (lucideName: string, testId: string) =>
  forwardRef<SVGSVGElement, IconProps>(({ fontSize, titleAccess, sx, ...props }, ref) => {
    const Glyph = glyphs[lucideName] ?? fallback
    const sxSize = typeof sx?.fontSize === 'number' ? `${sx.fontSize}px` : sx?.fontSize
    const size =
      sxSize ?? (fontSize === 'small' ? '1.25em' : fontSize === 'large' ? '2.2em' : undefined)
    return (
      <Glyph
        ref={ref}
        data-testid={testId}
        aria-label={titleAccess}
        {...props}
        className={`MuiSvgIcon-root ${props.className ?? ''}`}
        style={{ width: size, height: size, color: sx?.color, ...props.style }}
      />
    )
  })

export const AccessTimeIcon = icon('Clock3', 'AccessTimeIcon')
export const AddIcon = icon('Plus', 'AddIcon')
export const AddRoundedIcon = icon('CirclePlus', 'AddRoundedIcon')
export const AndroidIcon = icon('Smartphone', 'AndroidIcon')
export const AppsIcon = icon('Grid3X3', 'AppsIcon')
export const ArrowBackIosOutlinedIcon = icon('ChevronLeft', 'ArrowBackIosOutlinedIcon')
export const ArrowForwardIosOutlinedIcon = icon('ChevronRight', 'ArrowForwardIosOutlinedIcon')
export const BluetoothSearchingRoundedIcon = icon(
  'BluetoothSearching',
  'BluetoothSearchingRoundedIcon'
)
export const BoltIcon = icon('Zap', 'BoltIcon')
export const CableOutlinedIcon = icon('Cable', 'CableOutlinedIcon')
export const CameraOutlinedIcon = icon('Camera', 'CameraOutlinedIcon')
export const ChevronRightIcon = icon('ChevronRight', 'ChevronRightIcon')
export const CloseIcon = icon('X', 'CloseIcon')
export const CloseOutlinedIcon = icon('X', 'CloseOutlinedIcon')
export const ContrastRounded = icon('CircleDot', 'ContrastRounded')
export const CropPortraitOutlinedIcon = icon('RectangleVertical', 'CropPortraitOutlinedIcon')
export const DeviceHubIcon = icon('Network', 'DeviceHubIcon')
export const DeviceThermostatIcon = icon('Thermometer', 'DeviceThermostatIcon')
export const DirectionsBoatIcon = icon('ShipWheel', 'DirectionsBoatIcon')
export const DirectionsCarIcon = icon('CarFront', 'DirectionsCarIcon')
export const ExitToAppIcon = icon('LogOut', 'ExitToAppIcon')
export const ExpandLessIcon = icon('ChevronUp', 'ExpandLessIcon')
export const ExpandMoreIcon = icon('ChevronDown', 'ExpandMoreIcon')
export const FlagIcon = icon('Flag', 'FlagIcon')
export const ForkLeftIcon = icon('GitFork', 'ForkLeftIcon')
export const ForkRightIcon = icon('GitFork', 'ForkRightIcon')
export const GraphicEqOutlinedIcon = icon('AudioWaveform', 'GraphicEqOutlinedIcon')
export const LibraryAddRoundedIcon = icon('ListPlus', 'LibraryAddRoundedIcon')
export const LocalGasStationIcon = icon('Fuel', 'LocalGasStationIcon')
export const MapOutlinedIcon = icon('Map', 'MapOutlinedIcon')
export const MergeIcon = icon('GitMerge', 'MergeIcon')
export const NavigationOutlinedIcon = icon('Navigation', 'NavigationOutlinedIcon')
export const OpenInFullIcon = icon('Expand', 'OpenInFullIcon')
export const PauseIcon = icon('Pause', 'PauseIcon')
export const PhoneIphoneIcon = icon('Smartphone', 'PhoneIphoneIcon')
export const PlaceIcon = icon('MapPin', 'PlaceIcon')
export const PlayArrowIcon = icon('Play', 'PlayArrowIcon')
export const PlayCircleOutlinedIcon = icon('CirclePlay', 'PlayCircleOutlinedIcon')
export const RefreshOutlinedIcon = icon('RefreshCw', 'RefreshOutlinedIcon')
export const RefreshRoundedIcon = icon('RefreshCw', 'RefreshRoundedIcon')
export const RemoveIcon = icon('Minus', 'RemoveIcon')
export const RemoveRoundedIcon = icon('CircleMinus', 'RemoveRoundedIcon')
export const RestartAltOutlinedIcon = icon('RotateCcw', 'RestartAltOutlinedIcon')
export const RoundaboutRightIcon = icon('CircleArrowRight', 'RoundaboutRightIcon')
export const RouteIcon = icon('Route', 'RouteIcon')
export const SettingsOutlinedIcon = icon('Settings', 'SettingsOutlinedIcon')
export const SignpostIcon = icon('Signpost', 'SignpostIcon')
export const SkipNextIcon = icon('SkipForward', 'SkipNextIcon')
export const SkipPreviousIcon = icon('SkipBack', 'SkipPreviousIcon')
export const SpeakerOutlinedIcon = icon('Speaker', 'SpeakerOutlinedIcon')
export const SpeedOutlinedIcon = icon('Gauge', 'SpeedOutlinedIcon')
export const SportsEsportsOutlinedIcon = icon('Gamepad2', 'SportsEsportsOutlinedIcon')
export const SportsEsportsRoundedIcon = icon('Gamepad2', 'SportsEsportsRoundedIcon')
export const StraightIcon = icon('ArrowUp', 'StraightIcon')
export const SubdirectoryArrowLeftIcon = icon('CornerDownLeft', 'SubdirectoryArrowLeftIcon')
export const SubdirectoryArrowRightIcon = icon('CornerDownRight', 'SubdirectoryArrowRightIcon')
export const SwapHorizIcon = icon('ArrowLeftRight', 'SwapHorizIcon')
export const SyncIcon = icon('RefreshCw', 'SyncIcon')
export const TonalityRounded = icon('SunMedium', 'TonalityRounded')
export const TurnLeftIcon = icon('CornerUpLeft', 'TurnLeftIcon')
export const TurnRightIcon = icon('CornerUpRight', 'TurnRightIcon')
export const TurnSharpLeftIcon = icon('Undo2', 'TurnSharpLeftIcon')
export const TurnSharpRightIcon = icon('Redo2', 'TurnSharpRightIcon')
export const TurnSlightLeftIcon = icon('MoveUpLeft', 'TurnSlightLeftIcon')
export const TurnSlightRightIcon = icon('MoveUpRight', 'TurnSlightRightIcon')
export const UTurnLeftIcon = icon('Undo2', 'UTurnLeftIcon')
export const UTurnRightIcon = icon('Redo2', 'UTurnRightIcon')
export const VolumeOffRounded = icon('VolumeX', 'VolumeOffRounded')
export const VolumeUpOutlinedIcon = icon('Volume2', 'VolumeUpOutlinedIcon')
export const WifiIcon = icon('Wifi', 'WifiIcon')
export const WifiOffIcon = icon('WifiOff', 'WifiOffIcon')
export const WifiOutlinedIcon = icon('Wifi', 'WifiOutlinedIcon')
