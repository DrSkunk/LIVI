// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use livi_core_proto::message::SpotifyCommand;
use livi_core_proto::state::SpotifyItem;
use serde::Deserialize;

use super::auth::Account;

const API: &str = "https://api.spotify.com/v1";
const PAGE_SIZE: u32 = 20;

pub struct Page {
    pub items: Vec<SpotifyItem>,
    pub next_offset: Option<u32>,
    pub append: bool,
}

#[derive(Deserialize)]
struct Paging<T> {
    items: Vec<T>,
    next: Option<String>,
}

#[derive(Deserialize)]
struct Artist {
    name: String,
}

#[derive(Deserialize)]
struct Item {
    uri: String,
    name: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    artists: Vec<Artist>,
    is_playable: Option<bool>,
    #[serde(default)]
    is_local: bool,
}

impl From<Item> for SpotifyItem {
    fn from(item: Item) -> Self {
        Self {
            uri: item.uri,
            title: item.name,
            subtitle: item
                .artists
                .into_iter()
                .map(|a| a.name)
                .collect::<Vec<_>>()
                .join(", "),
            playable: item.is_playable != Some(false) && !item.is_local,
            kind: item.kind,
        }
    }
}

#[derive(Deserialize)]
struct SavedAlbum {
    album: Item,
}

#[derive(Deserialize)]
struct PlaylistItem {
    #[serde(alias = "track")]
    item: Option<Item>,
}

#[derive(Deserialize)]
struct Search {
    tracks: Paging<Item>,
    albums: Paging<Item>,
    playlists: Paging<Option<Item>>,
}

#[derive(Deserialize)]
struct Profile {
    id: String,
    display_name: Option<String>,
    product: Option<String>,
}

pub fn uri_parts(uri: &str) -> Result<(&str, &str), String> {
    let parts: Vec<_> = uri.split(':').collect();
    if let ["spotify", kind @ ("track" | "playlist" | "album"), id] = parts.as_slice()
        && id.len() == 22
        && id.bytes().all(|c| c.is_ascii_alphanumeric())
    {
        return Ok((kind, id));
    }
    Err("Expected a Spotify track, album, or playlist URI".into())
}

impl Account {
    async fn get<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, String> {
        let token = self.access_token().await?;
        let response = self
            .http
            .get(format!("{API}/{path}"))
            .query(query)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| "Cannot reach Spotify Web API".to_string())?;
        let status = response.status();
        if !status.is_success() {
            let retry = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok());
            return Err(if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                format!(
                    "Spotify rate limit reached. Retry after {} seconds.",
                    retry.unwrap_or("60")
                )
            } else if status == reqwest::StatusCode::UNAUTHORIZED {
                "Spotify authorization expired or was revoked. Log out and log in again.".into()
            } else {
                format!(
                    "Spotify API request failed ({status}). Check app access and account permissions."
                )
            });
        }
        response
            .json()
            .await
            .map_err(|_| "Spotify returned an invalid API response".into())
    }

    pub async fn profile(&self) -> Result<String, String> {
        let profile: Profile = self.get("me", &[]).await?;
        if profile.product.as_deref().is_some_and(|p| p != "premium") {
            return Err("Direct Spotify playback requires Spotify Premium".into());
        }
        Ok(profile.display_name.unwrap_or(profile.id))
    }

    pub async fn browse(&self, command: &SpotifyCommand) -> Result<Page, String> {
        let offset = match command {
            SpotifyCommand::Playlists { offset }
            | SpotifyCommand::Albums { offset }
            | SpotifyCommand::Search { offset, .. }
            | SpotifyCommand::Open { offset, .. } => *offset,
            _ => return Err("Unsupported Spotify browsing command".into()),
        };
        let mut query = vec![
            ("limit", PAGE_SIZE.to_string()),
            ("offset", offset.to_string()),
        ];
        let (items, next) = match command {
            SpotifyCommand::Playlists { .. } => {
                let page: Paging<Option<Item>> = self.get("me/playlists", &query).await?;
                (
                    page.items.into_iter().flatten().map(Into::into).collect(),
                    page.next.is_some(),
                )
            }
            SpotifyCommand::Albums { .. } => {
                let page: Paging<SavedAlbum> = self.get("me/albums", &query).await?;
                (
                    page.items.into_iter().map(|a| a.album.into()).collect(),
                    page.next.is_some(),
                )
            }
            SpotifyCommand::Search { query: text, .. } => {
                let text = text.trim();
                if text.is_empty() || text.len() > 256 {
                    return Err("Enter a search of 1 to 256 characters".into());
                }
                // Spotify development-mode search allows at most ten results per type.
                query[0].1 = "10".into();
                query.push(("q", text.into()));
                query.push(("type", "track,album,playlist".into()));
                let search: Search = self.get("search", &query).await?;
                let next = search.tracks.next.is_some()
                    || search.albums.next.is_some()
                    || search.playlists.next.is_some();
                let items = search
                    .tracks
                    .items
                    .into_iter()
                    .chain(search.albums.items)
                    .chain(search.playlists.items.into_iter().flatten())
                    .map(Into::into)
                    .collect();
                return Ok(Page {
                    items,
                    next_offset: next.then_some(offset.saturating_add(10)),
                    append: offset > 0,
                });
            }
            SpotifyCommand::Open { uri, .. } => {
                let (kind, id) = uri_parts(uri)?;
                match kind {
                    "album" => {
                        let page: Paging<Item> =
                            self.get(&format!("albums/{id}/tracks"), &query).await?;
                        (
                            page.items.into_iter().map(Into::into).collect(),
                            page.next.is_some(),
                        )
                    }
                    "playlist" => {
                        let page: Paging<PlaylistItem> =
                            self.get(&format!("playlists/{id}/items"), &query).await?;
                        (
                            page.items
                                .into_iter()
                                .filter_map(|i| i.item)
                                .filter(|i| i.kind == "track")
                                .map(Into::into)
                                .collect(),
                            page.next.is_some(),
                        )
                    }
                    _ => return Err("Only playlists and albums can be opened".into()),
                }
            }
            _ => return Err("Unsupported Spotify browsing command".into()),
        };
        Ok(Page {
            items,
            next_offset: next.then_some(offset.saturating_add(PAGE_SIZE)),
            append: offset > 0,
        })
    }

    pub async fn tracks(&self, uri: &str) -> Result<Vec<SpotifyItem>, String> {
        let (kind, id) = uri_parts(uri)?;
        if kind == "track" {
            let track: Item = self.get(&format!("tracks/{id}"), &[]).await?;
            if track.is_playable == Some(false) || track.is_local {
                return Err("This track is not available for playback".into());
            }
            return Ok(vec![track.into()]);
        }
        let mut tracks = Vec::new();
        let mut offset = 0;
        loop {
            if offset >= 10000 {
                return Err("This collection exceeds the 10,000-track queue limit".into());
            }
            let page = self
                .browse(&SpotifyCommand::Open {
                    uri: uri.into(),
                    offset,
                })
                .await?;
            tracks.extend(page.items.into_iter().filter(|i| i.playable));
            if tracks.len() > 10000 {
                return Err("This collection exceeds the 10,000-track queue limit".into());
            }
            match page.next_offset {
                Some(next) if next > offset => offset = next,
                Some(_) => return Err("Spotify pagination did not advance".into()),
                None => break,
            }
        }
        if tracks.is_empty() {
            return Err("No playable tracks in this collection".into());
        }
        Ok(tracks)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_valid_spotify_uris_are_used_as_api_paths() {
        assert!(uri_parts("spotify:track:0123456789ABCDEFGHIJKL").is_ok());
        for uri in [
            "https://example.com",
            "spotify:album:../me",
            "spotify:artist:0123456789ABCDEFGHIJKL",
        ] {
            assert!(uri_parts(uri).is_err());
        }
    }

    #[test]
    fn playlist_items_accept_current_and_legacy_track_fields() {
        for field in ["item", "track"] {
            let value = serde_json::json!({field: {"uri": "spotify:track:0123456789ABCDEFGHIJKL", "name": "Track", "type": "track"}});
            let item: PlaylistItem = serde_json::from_value(value).unwrap();
            assert_eq!(item.item.unwrap().name, "Track");
        }
    }
}
