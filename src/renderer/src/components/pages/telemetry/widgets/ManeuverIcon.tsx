import { Box, Chip } from '@renderer/ui'
import {
  DirectionsBoatIcon,
  ExitToAppIcon,
  FlagIcon,
  ForkLeftIcon,
  ForkRightIcon,
  MergeIcon,
  NavigationOutlinedIcon,
  RoundaboutRightIcon,
  StraightIcon,
  SubdirectoryArrowLeftIcon,
  SubdirectoryArrowRightIcon,
  SwapHorizIcon,
  TurnLeftIcon,
  TurnRightIcon,
  TurnSharpLeftIcon,
  TurnSharpRightIcon,
  TurnSlightLeftIcon,
  TurnSlightRightIcon,
  UTurnLeftIcon,
  UTurnRightIcon
} from '@renderer/ui/icons'

/**
 * LIVI NaviManeuverType (0–53) → MUI icon
 */

function RoundaboutWithExit({ exitNumber, size }: { exitNumber: number; size: number }) {
  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center'
      }}
    >
      <RoundaboutRightIcon sx={{ fontSize: size }} />
      <Box sx={{ position: 'absolute', right: -6, bottom: -6 }}>
        <Chip
          size="small"
          label={exitNumber}
          sx={{ height: 20, fontSize: 12, '& .MuiChip-label': { px: 0.8 } }}
        />
      </Box>
    </Box>
  )
}

export function ManeuverIcon({
  type,
  turnSide,
  size
}: {
  type: number | undefined
  turnSide: number | undefined
  size: number
}) {
  const fs = { fontSize: size }
  const isRight = turnSide === 0 // Carlinkit: 0 = right, 1 = left

  // No maneuver yet → a neutral heading arrow (never a "?").
  if (type == null) return <NavigationOutlinedIcon sx={fs} />

  // Roundabout with exit number (codes 28..46 = exit 1..19).
  if (type >= 28 && type <= 46) return <RoundaboutWithExit exitNumber={type - 27} size={size} />

  switch (type) {
    case 0:
    case 3:
    case 5:
      return <StraightIcon sx={fs} />
    case 1:
      return <TurnLeftIcon sx={fs} />
    case 2:
      return <TurnRightIcon sx={fs} />
    case 4:
    case 18:
    case 26:
      return isRight ? <UTurnRightIcon sx={fs} /> : <UTurnLeftIcon sx={fs} />
    case 6:
    case 7:
    case 19:
      return <RoundaboutRightIcon sx={fs} />
    case 8:
    case 22:
    case 23:
      return <ExitToAppIcon sx={fs} />
    case 9:
      return <MergeIcon sx={fs} />
    case 10:
    case 12:
    case 24:
    case 25:
    case 27:
      return <FlagIcon sx={fs} />
    case 11:
      // DEPART / proceed-to-route → straight-ahead arrow (matches Apple/Android Auto).
      return <StraightIcon sx={fs} />
    case 13:
      return <ForkLeftIcon sx={fs} />
    case 14:
      return <ForkRightIcon sx={fs} />
    case 15:
    case 16:
    case 17:
      return <DirectionsBoatIcon sx={fs} />
    case 20:
      return <SubdirectoryArrowLeftIcon sx={fs} />
    case 21:
      return <SubdirectoryArrowRightIcon sx={fs} />
    case 47:
      return <TurnSharpLeftIcon sx={fs} />
    case 48:
      return <TurnSharpRightIcon sx={fs} />
    case 49:
      return <TurnSlightLeftIcon sx={fs} />
    case 50:
      return <TurnSlightRightIcon sx={fs} />
    case 51:
      return <SwapHorizIcon sx={fs} />
    case 52:
      return <ForkLeftIcon sx={fs} />
    case 53:
      return <ForkRightIcon sx={fs} />
    default:
      return <NavigationOutlinedIcon sx={fs} />
  }
}

/** Maneuver visual: the phone's PNG when present, otherwise the shared icon model. */
export function ManeuverGraphic({
  imageBase64,
  type,
  turnSide,
  size
}: {
  imageBase64?: string
  type: number | undefined
  turnSide: number | undefined
  size: number
}) {
  if (imageBase64) {
    return (
      <Box
        component="img"
        src={`data:image/png;base64,${imageBase64}`}
        alt="Navigation maneuver"
        sx={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      />
    )
  }
  return <ManeuverIcon type={type} turnSide={turnSide} size={size} />
}
