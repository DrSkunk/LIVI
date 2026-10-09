import LibraryAddRoundedIcon from '@mui/icons-material/LibraryAddRounded'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
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
        maxWidth: 620,
        px: 2,
        textAlign: 'center',
        display: 'grid',
        justifyItems: 'center',
        gap: 0.75
      }}
    >
      <SportsEsportsRoundedIcon sx={{ fontSize: 48, mb: 0.5, color: 'text.secondary' }} />
      <Typography variant="h6">No games yet</Typography>
      <Typography color="text.secondary">
        Place legally obtained ROMs in <strong>{DEFAULT_ROM_DIRECTORY}</strong>.
      </Typography>
      <Typography color="text.secondary">
        Import ROMs to create playlists and download cover art.
      </Typography>
      <Button
        variant="outlined"
        color="inherit"
        onClick={onImport}
        disabled={importing}
        startIcon={
          importing ? <CircularProgress size={16} color="inherit" /> : <LibraryAddRoundedIcon />
        }
        sx={{ mt: 1, minHeight: 44, textTransform: 'none', borderColor: 'divider' }}
      >
        {importing ? 'Importing ROMs…' : 'Import ROMs'}
      </Button>
      <Button
        variant="outlined"
        color="inherit"
        onClick={onOpenRetroArch}
        disabled={openingRetroArch}
        startIcon={openingRetroArch ? <CircularProgress size={16} color="inherit" /> : undefined}
        sx={{ minHeight: 44, textTransform: 'none', borderColor: 'divider' }}
      >
        {openingRetroArch ? 'Opening RetroArch…' : 'Open RetroArch'}
      </Button>
      <Typography color="text.secondary" sx={{ fontSize: '.78rem', mt: 0.5 }}>
        Playlists and thumbnails are read automatically from ~/.config/retroarch.
      </Typography>
    </Box>
  )
}
