// SPDX-FileCopyrightText: 2026 LIVI contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use std::os::fd::OwnedFd;
use std::os::unix::fs::MetadataExt;
use std::path::Path;

use anyhow::{Context, Result, bail, ensure};
use rustix::fs::{self, AtFlags, Dir, FileType, Mode, OFlags};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

pub const CHUNK_SIZE: usize = 12 * 1024;
pub const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024 * 1024;
const MIN_FREE_SPACE: u64 = 128 * 1024 * 1024;
const PAGE_SIZE: usize = 16;
const MAX_DIRECTORY_ENTRIES: usize = 10_000;
const STAGING: &str = ".livi-music-transfer";

#[derive(Debug, Serialize)]
pub struct Entry {
    pub name: String,
    pub directory: bool,
}

#[derive(Debug, Serialize)]
pub struct Listing {
    pub entries: Vec<Entry>,
    pub next: Option<usize>,
}

pub struct Storage {
    root: OwnedFd,
    staging: OwnedFd,
}

pub struct Transfer {
    file: tokio::fs::File,
    part_name: String,
    path: String,
    size: u64,
    offset: u64,
    digest: [u8; 32],
}

fn directory_flags() -> OFlags {
    OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC
}

fn parts(path: &str, allow_empty: bool) -> Result<Vec<&str>> {
    if path.is_empty() && allow_empty {
        return Ok(Vec::new());
    }
    ensure!(path.len() <= 4096, "Music path is too long");
    let segments: Vec<_> = path.split('/').collect();
    ensure!(segments.len() <= 32, "Music path is too deep");
    for segment in &segments {
        ensure!(
            !segment.is_empty()
                && !segment.starts_with('.')
                && segment.len() <= 255
                && !segment.contains('\\')
                && !segment.chars().any(char::is_control),
            "Invalid music path"
        );
    }
    Ok(segments)
}

fn supported(name: &str) -> bool {
    let Some((_, ext)) = name.rsplit_once('.') else {
        return false;
    };
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "mp3" | "flac" | "wav" | "wave" | "aac" | "m4a" | "ogg" | "opus" | "m3u" | "m3u8"
    )
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut output, "{byte:02x}").expect("writing to a string cannot fail");
    }
    output
}

fn advance_digest(previous: &[u8; 32], data: &[u8]) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(previous);
    hash.update(data);
    hash.finalize().into()
}

impl Storage {
    pub fn open(root: &Path) -> Result<Self> {
        let parent = root.parent().context("Music root has no parent")?;
        let parent = fs::open(parent, directory_flags(), Mode::empty())
            .context("Cannot open the music storage directory")?;
        let name = root.file_name().context("Music root has no name")?;
        let root = fs::openat(&parent, name, directory_flags(), Mode::empty())
            .context("Cannot open the internal music library")?;
        match fs::mkdirat(&parent, STAGING, Mode::RWXU) {
            Ok(()) | Err(rustix::io::Errno::EXIST) => {}
            Err(error) => {
                return Err(error).context("Cannot create the transfer staging directory");
            }
        }
        let staging = fs::openat(&parent, STAGING, directory_flags(), Mode::empty())
            .context("Cannot open the transfer staging directory")?;
        let info = fs::fstat(&staging).context("Cannot inspect the transfer staging directory")?;
        ensure!(
            info.st_mode & 0o077 == 0,
            "Transfer staging directory must not be accessible to other users"
        );
        Ok(Self { root, staging })
    }

    fn open_directory(&self, segments: &[&str], create: bool) -> Result<OwnedFd> {
        let mut current = fs::openat(&self.root, ".", directory_flags(), Mode::empty())?;
        for segment in segments {
            if create {
                match fs::mkdirat(&current, *segment, Mode::from_bits_truncate(0o755)) {
                    Ok(()) | Err(rustix::io::Errno::EXIST) => {}
                    Err(error) => return Err(error).context("Cannot create music folder"),
                }
            }
            current = fs::openat(&current, *segment, directory_flags(), Mode::empty())
                .context("Cannot open music folder")?;
        }
        Ok(current)
    }

    pub fn list(&self, path: &str, offset: usize) -> Result<Listing> {
        let directory = self.open_directory(&parts(path, true)?, false)?;
        let mut dir = Dir::new(directory).context("Cannot read music folder")?;
        let mut entries = Vec::new();
        while let Some(entry) = dir.read() {
            let entry = entry.context("Cannot read a music folder entry")?;
            let Some(name) = entry.file_name().to_str().ok() else {
                continue;
            };
            if parts(name, false).is_err() {
                continue;
            }
            let info = fs::statat(dir.fd()?, name, AtFlags::SYMLINK_NOFOLLOW)
                .context("Cannot inspect music folder entry")?;
            let kind = FileType::from_raw_mode(info.st_mode);
            let directory = kind == FileType::Directory;
            if directory || (kind == FileType::RegularFile && supported(name)) {
                entries.push(Entry {
                    name: name.to_string(),
                    directory,
                });
            }
            ensure!(
                entries.len() <= MAX_DIRECTORY_ENTRIES,
                "Music folder contains too many entries"
            );
        }
        entries.sort_by(|a, b| {
            b.directory
                .cmp(&a.directory)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        ensure!(offset <= entries.len(), "Invalid music folder page");
        let end = offset.saturating_add(PAGE_SIZE).min(entries.len());
        let next = (end < entries.len()).then_some(end);
        let entries = entries.drain(offset..end).collect();
        Ok(Listing { entries, next })
    }

    pub async fn begin(&self, path: &str, size: u64, modified: u64) -> Result<Transfer> {
        let segments = parts(path, false)?;
        let (name, folders) = segments.split_last().context("Missing music filename")?;
        ensure!(supported(name), "Unsupported music or playlist format");
        ensure!(
            size <= MAX_FILE_SIZE,
            "File exceeds the 2 GiB transfer limit"
        );

        let destination = self.open_directory(folders, true)?;
        match fs::statat(&destination, *name, AtFlags::SYMLINK_NOFOLLOW) {
            Err(rustix::io::Errno::NOENT) => {}
            Ok(_) => bail!("A file with this name already exists"),
            Err(error) => return Err(error).context("Cannot check the destination file"),
        }

        let id = Sha256::digest(format!("{path}\0{size}\0{modified}").as_bytes());
        let part_name = format!("{}.part", hex(&id));
        let fd = fs::openat(
            &self.staging,
            part_name.as_str(),
            OFlags::RDWR | OFlags::CREATE | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::RUSR | Mode::WUSR,
        )
        .context("Cannot open the partial transfer")?;
        let file = std::fs::File::from(fd);
        let metadata = file
            .metadata()
            .context("Cannot inspect the partial transfer")?;
        ensure!(
            metadata.is_file() && metadata.nlink() == 1,
            "Invalid partial transfer"
        );
        let mut offset = metadata.len();
        ensure!(
            offset <= size,
            "The partial transfer is larger than the source file"
        );
        let mut file = tokio::fs::File::from_std(file);
        if offset < size && offset % CHUNK_SIZE as u64 != 0 {
            offset -= offset % CHUNK_SIZE as u64;
            file.set_len(offset)
                .await
                .context("Cannot repair the partial transfer")?;
        }
        let space = fs::fstatvfs(&self.staging).context("Cannot check free music storage")?;
        let available = (space.f_bavail as u64).saturating_mul(space.f_frsize as u64);
        ensure!(
            size.saturating_sub(offset).saturating_add(MIN_FREE_SPACE) <= available,
            "Not enough free storage for this file"
        );
        let mut remaining = offset;
        let mut digest = [0; 32];
        let mut buffer = vec![0; CHUNK_SIZE];
        while remaining != 0 {
            let count = (remaining as usize).min(CHUNK_SIZE);
            file.read_exact(&mut buffer[..count])
                .await
                .context("Cannot read the partial transfer")?;
            digest = advance_digest(&digest, &buffer[..count]);
            remaining -= count as u64;
        }
        file.seek(std::io::SeekFrom::Start(offset)).await?;
        Ok(Transfer {
            file,
            part_name,
            path: path.to_string(),
            size,
            offset,
            digest,
        })
    }

    pub async fn discard(&self, transfer: Transfer) -> Result<()> {
        drop(transfer.file);
        fs::unlinkat(&self.staging, transfer.part_name.as_str(), AtFlags::empty())
            .context("Cannot discard the partial transfer")?;
        Ok(())
    }

    pub async fn finish(&self, transfer: Transfer, digest: &str) -> Result<()> {
        ensure!(
            transfer.offset == transfer.size,
            "File transfer is incomplete"
        );
        ensure!(transfer.digest() == digest, "File integrity check failed");
        transfer
            .file
            .sync_all()
            .await
            .context("Cannot save the transferred file")?;
        let segments = parts(&transfer.path, false)?;
        let (name, folders) = segments.split_last().context("Missing music filename")?;
        let destination = self.open_directory(folders, false)?;
        fs::linkat(
            &self.staging,
            transfer.part_name.as_str(),
            &destination,
            *name,
            AtFlags::empty(),
        )
        .context("Cannot publish the music file without overwriting an existing file")?;
        fs::unlinkat(&self.staging, transfer.part_name.as_str(), AtFlags::empty())
            .context("Music was saved, but its partial transfer could not be removed")?;
        Ok(())
    }
}

impl Transfer {
    pub fn path(&self) -> &str {
        &self.path
    }

    pub fn offset(&self) -> u64 {
        self.offset
    }

    pub fn digest(&self) -> String {
        hex(&self.digest)
    }

    pub async fn append(&mut self, data: &[u8]) -> Result<()> {
        let expected = (self.size - self.offset).min(CHUNK_SIZE as u64) as usize;
        ensure!(
            expected != 0 && data.len() == expected,
            "Invalid file chunk"
        );
        let written = async {
            self.file.write_all(data).await?;
            self.file.flush().await
        }
        .await;
        if let Err(error) = written {
            self.file
                .set_len(self.offset)
                .await
                .context("Cannot repair a failed partial transfer")?;
            return Err(error).context("Cannot write the music file");
        }
        self.offset += data.len() as u64;
        self.digest = advance_digest(&self.digest, data);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::os::unix::fs::symlink;

    fn library() -> (tempfile::TempDir, Storage) {
        let temp = tempfile::tempdir().unwrap();
        std::fs::create_dir(temp.path().join("music")).unwrap();
        let storage = Storage::open(&temp.path().join("music")).unwrap();
        (temp, storage)
    }

    #[tokio::test]
    async fn resumes_verified_chunks_and_publishes_without_overwriting() {
        let (temp, storage) = library();
        let first = vec![7; CHUNK_SIZE];
        let mut upload = storage
            .begin("Album/song.flac", CHUNK_SIZE as u64 + 3, 42)
            .await
            .unwrap();
        upload.append(&first).await.unwrap();
        let previous = upload.digest();
        let partial = temp.path().join(STAGING).join(&upload.part_name);
        assert_eq!(std::fs::read(&partial).unwrap(), first);
        drop(upload);
        std::fs::OpenOptions::new()
            .append(true)
            .open(&partial)
            .unwrap()
            .write_all(b"en")
            .unwrap();

        let mut resumed = storage
            .begin("Album/song.flac", CHUNK_SIZE as u64 + 3, 42)
            .await
            .unwrap();
        assert_eq!(resumed.offset(), CHUNK_SIZE as u64);
        assert_eq!(resumed.digest(), previous);
        resumed.append(b"end").await.unwrap();
        let digest = resumed.digest();
        assert!(storage.finish(resumed, &digest).await.is_ok());
        let saved = std::fs::read(temp.path().join("music/Album/song.flac")).unwrap();
        assert_eq!(saved, [first.as_slice(), b"end"].concat());
        assert!(storage.begin("Album/song.flac", 1, 42).await.is_err());
    }

    #[tokio::test]
    async fn rejects_traversal_symlinks_invalid_chunks_and_bad_digests() {
        let (temp, storage) = library();
        let outside = temp.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        symlink(&outside, temp.path().join("music/link")).unwrap();
        for path in [
            "../escape.mp3",
            "/absolute.mp3",
            ".hidden.mp3",
            "link/escape.mp3",
            "x.txt",
        ] {
            assert!(storage.begin(path, 1, 0).await.is_err(), "{path}");
        }
        let mut upload = storage.begin("album/song.mp3", 3, 0).await.unwrap();
        assert!(upload.append(b"ab").await.is_err());
        upload.append(b"abc").await.unwrap();
        assert!(storage.finish(upload, "wrong").await.is_err());
        assert!(!temp.path().join("music/album/song.mp3").exists());
        assert!(!outside.join("escape.mp3").exists());
    }

    #[tokio::test]
    async fn listing_omits_symlinks_and_hidden_or_unsupported_files() {
        let (temp, storage) = library();
        let root = temp.path().join("music");
        std::fs::create_dir(root.join("Album")).unwrap();
        std::fs::write(root.join("track.MP3"), []).unwrap();
        std::fs::write(root.join("notes.txt"), []).unwrap();
        std::fs::write(root.join(".private.flac"), []).unwrap();
        symlink(root.join("track.MP3"), root.join("link.mp3")).unwrap();
        let list = storage.list("", 0).unwrap();
        assert_eq!(list.entries.len(), 2);
        assert!(list.entries[0].directory);
        assert_eq!(list.entries[1].name, "track.MP3");
    }
}
