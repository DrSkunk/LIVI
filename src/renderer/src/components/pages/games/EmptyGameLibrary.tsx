import { Box, Button, CircularProgress, Typography } from '@renderer/ui'
import { LibraryAddRoundedIcon, SportsEsportsRoundedIcon } from '@renderer/ui/icons'
import { DEFAULT_ROM_DIRECTORY } from '@shared/types'

type EmptyGameLibraryProps = {
  importing: boolean
  openingRetroArch: boolean
  onImport: () => void
  onOpenRetroArch: () => void
}

export function EmptyGameLibrary({
  importing,
  openingRetroArch,
  onImport,
  onOpenRetroArch
}: EmptyGameLibraryProps) {
  return (
    <Box
      sx={{
        m: 'auto',
        width: 'min(680px, 92%)',
        p: 'clamp(20px, 4vw, 38px)',
        textAlign: 'center',
        display: 'grid',
        justifyItems: 'center',
        gap: 0.9,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        background: 'linear-gradient(145deg, rgba(245,166,35,.055), rgba(8,7,5,.72))',
        boxShadow: 'inset 0 1px rgba(255,225,177,.08), 0 16px 46px rgba(0,0,0,.34)'
      }}
    >
      <SportsEsportsRoundedIcon sx={{ fontSize: 72, mb: 0.5, opacity: 0.72 }} />
      <Typography variant="h6">Add games to LIVI</Typography>
      <Typography color="text.secondary">
        Place legally obtained ROMs in <strong>{DEFAULT_ROM_DIRECTORY}</strong>.
      </Typography>
      <Typography color="text.secondary">
        Press Import ROMs. LIVI detects systems, creates RetroArch playlists, selects installed
        cores, and downloads matching Libretro box art.
      </Typography>
      <Button
        variant="contained"
        onClick={onImport}
        disabled={importing}
        startIcon={
          importing ? <CircularProgress size={16} color="inherit" /> : <LibraryAddRoundedIcon />
        }
        sx={{ mt: 1 }}
      >
        {importing ? 'Importing ROMs…' : 'Import ROMs'}
      </Button>
      <Button
        variant="outlined"
        onClick={onOpenRetroArch}
        disabled={openingRetroArch}
        startIcon={openingRetroArch ? <CircularProgress size={16} color="inherit" /> : undefined}
      >
        {openingRetroArch ? 'Opening RetroArch…' : 'Open RetroArch manually'}
      </Button>
      <Typography color="text.secondary" sx={{ fontSize: '.78rem', mt: 0.5 }}>
        Playlists and thumbnails are read automatically from ~/.config/retroarch.
      </Typography>
    </Box>
  )
}
