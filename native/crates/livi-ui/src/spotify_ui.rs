// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::cell::RefCell;
use std::rc::Rc;

use livi_core_client::Client;
use livi_core_proto::message::{Action, SpotifyCommand};
use livi_core_proto::state::Spotify;
use slint::{ComponentHandle, Model, ModelRc, VecModel};

use crate::{AppWindow, SpotifyRow, SpotifyState, SpotifyText};

#[derive(Default)]
struct Browser {
    state: Spotify,
    request: Option<SpotifyCommand>,
    opened_url: Option<String>,
}

thread_local! {
    static BROWSER: RefCell<Browser> = RefCell::new(Browser::default());
}

fn render(ui: &AppWindow) {
    let s = ui.global::<SpotifyState>();
    BROWSER.with_borrow(|b| {
        let queue = s.get_queue_view();
        let items = if queue {
            &b.state.queue
        } else {
            &b.state.items
        };
        let rows: Vec<SpotifyRow> = items
            .iter()
            .enumerate()
            .map(|(i, item)| SpotifyRow {
                uri: item.uri.clone().into(),
                title: if queue && b.state.queue_index == Some(i) {
                    format!("> {}", item.title)
                } else {
                    item.title.clone()
                }
                .into(),
                subtitle: item.subtitle.clone().into(),
                collection: item.kind != "track",
                playable: item.playable,
            })
            .collect();
        s.set_items(ModelRc::from(Rc::new(VecModel::from(rows))));
        s.set_more(b.state.next_offset.is_some() && !queue);
    });
}

fn open_login(ui: &AppWindow, url: String) {
    if !url.starts_with("https://accounts.spotify.com/authorize?") {
        ui.global::<SpotifyState>()
            .set_error("Invalid Spotify login URL".into());
        return;
    }
    let weak = ui.as_weak();
    std::thread::spawn(move || {
        let program = if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        };
        let result = std::process::Command::new(program)
            .arg(url)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        if !matches!(result, Ok(status) if status.success()) {
            let _ = weak.upgrade_in_event_loop(|ui| {
                ui.global::<SpotifyState>().set_error(
                    crate::settings_ui::tr(
                        "spotify.browserError",
                        "Cannot open a browser. Copy the login URL into a browser on this device.",
                    )
                    .into(),
                );
            });
        }
    });
}

pub fn apply(ui: &AppWindow, state: Spotify) {
    let s = ui.global::<SpotifyState>();
    s.set_logged_in(state.logged_in);
    s.set_connecting(state.connecting);
    s.set_busy(state.busy);
    s.set_account(state.account.clone().into());
    s.set_error(state.error.clone().unwrap_or_default().into());
    s.set_auth_url(state.auth_url.clone().unwrap_or_default().into());
    let open = BROWSER.with_borrow_mut(|b| {
        let open = state
            .auth_url
            .clone()
            .filter(|url| b.opened_url.as_ref() != Some(url));
        b.opened_url = state.auth_url.clone();
        b.state = state;
        if !b.state.logged_in {
            s.set_queue_view(false);
        }
        open
    });
    render(ui);
    if let Some(url) = open {
        open_login(ui, url);
    }
}

fn browse(ui: &AppWindow, client: &Client, command: SpotifyCommand) {
    ui.global::<SpotifyState>().set_queue_view(false);
    BROWSER.with_borrow_mut(|b| b.request = Some(command.clone()));
    render(ui);
    client.act(Action::Spotify { command });
}

fn more(command: &SpotifyCommand, offset: u32) -> Option<SpotifyCommand> {
    Some(match command {
        SpotifyCommand::Playlists { .. } => SpotifyCommand::Playlists { offset },
        SpotifyCommand::Albums { .. } => SpotifyCommand::Albums { offset },
        SpotifyCommand::Search { query, .. } => SpotifyCommand::Search {
            query: query.clone(),
            offset,
        },
        SpotifyCommand::Open { uri, .. } => SpotifyCommand::Open {
            uri: uri.clone(),
            offset,
        },
        _ => return None,
    })
}

pub fn wire(ui: &AppWindow, client: &Client) {
    let s = ui.global::<SpotifyState>();
    s.on_command({
        let (weak, client) = (ui.as_weak(), client.clone());
        move |which| {
            let Some(ui) = weak.upgrade() else { return };
            let s = ui.global::<SpotifyState>();
            let command = match which {
                0 if s.get_connecting() => SpotifyCommand::Cancel,
                0 => SpotifyCommand::Login,
                1 => SpotifyCommand::Logout,
                2 => {
                    browse(&ui, &client, SpotifyCommand::Playlists { offset: 0 });
                    return;
                }
                3 => {
                    browse(&ui, &client, SpotifyCommand::Albums { offset: 0 });
                    return;
                }
                4 => {
                    s.set_queue_view(true);
                    render(&ui);
                    return;
                }
                5 => {
                    open_login(&ui, s.get_auth_url().to_string());
                    return;
                }
                7 => {
                    browse(
                        &ui,
                        &client,
                        SpotifyCommand::Search {
                            query: s.get_query().to_string(),
                            offset: 0,
                        },
                    );
                    return;
                }
                8 => {
                    let next =
                        BROWSER.with_borrow(|b| more(b.request.as_ref()?, b.state.next_offset?));
                    if let Some(command) = next {
                        browse(&ui, &client, command);
                    }
                    return;
                }
                9 => SpotifyCommand::ClearQueue,
                _ => return,
            };
            client.act(Action::Spotify { command });
        }
    });
    s.on_row({
        let (weak, client) = (ui.as_weak(), client.clone());
        move |index, action| {
            let Some(ui) = weak.upgrade() else { return };
            let s = ui.global::<SpotifyState>();
            let Ok(index) = usize::try_from(index) else {
                return;
            };
            let Some(item) = s.get_items().row_data(index) else {
                return;
            };
            let command = if s.get_queue_view() {
                match action {
                    0 => SpotifyCommand::PlayQueue { index },
                    1 => SpotifyCommand::RemoveQueue { index },
                    _ => return,
                }
            } else if action == 0 && item.collection {
                browse(
                    &ui,
                    &client,
                    SpotifyCommand::Open {
                        uri: item.uri.to_string(),
                        offset: 0,
                    },
                );
                return;
            } else if action == 0 || (action == 1 && item.collection) {
                SpotifyCommand::Play {
                    uri: item.uri.to_string(),
                }
            } else {
                SpotifyCommand::Enqueue {
                    uri: item.uri.to_string(),
                }
            };
            client.act(Action::Spotify { command });
        }
    });
}

pub fn set_texts(ui: &AppWindow, tr: impl Fn(&str, &str) -> String) {
    let t = ui.global::<SpotifyText>();
    t.set_login(tr("spotify.login", "Log in").into());
    t.set_logout(tr("spotify.logout", "Log out").into());
    t.set_cancel(tr("spotify.cancel", "Cancel").into());
    t.set_browser(tr("spotify.browser", "Open login").into());
    t.set_playlists(tr("spotify.playlists", "Playlists").into());
    t.set_albums(tr("spotify.albums", "Saved albums").into());
    t.set_queue(tr("spotify.queue", "LIVI queue").into());
    t.set_search(tr("spotify.search", "Search").into());
    t.set_more(tr("spotify.more", "Load more").into());
    t.set_clear(tr("spotify.clear", "Clear queue").into());
    t.set_play(tr("spotify.play", "Play").into());
    t.set_pause(tr("spotify.pause", "Pause").into());
    t.set_previous(tr("spotify.previous", "Previous").into());
    t.set_next(tr("spotify.next", "Next").into());
    t.set_open(tr("spotify.open", "Open").into());
    t.set_add(tr("spotify.add", "Add to queue").into());
    t.set_remove(tr("spotify.remove", "Remove").into());
    t.set_loading(tr("spotify.loading", "Loading...").into());
    t.set_hint(
        tr(
            "spotify.hint",
            "Set your Spotify developer client ID in Settings > Connections, then log in.",
        )
        .into(),
    );
    t.set_waiting(
        tr(
            "spotify.waiting",
            "Authorize in the browser on this device. You can copy the login URL below.",
        )
        .into(),
    );
    t.set_empty(tr("spotify.empty", "No items. Choose a library or search.").into());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_keeps_the_query_and_collection() {
        assert_eq!(
            more(
                &SpotifyCommand::Search {
                    query: "test".into(),
                    offset: 0
                },
                10
            ),
            Some(SpotifyCommand::Search {
                query: "test".into(),
                offset: 10
            })
        );
        assert_eq!(
            more(
                &SpotifyCommand::Open {
                    uri: "collection".into(),
                    offset: 0
                },
                20
            ),
            Some(SpotifyCommand::Open {
                uri: "collection".into(),
                offset: 20
            })
        );
        assert!(more(&SpotifyCommand::Login, 20).is_none());
    }
}
