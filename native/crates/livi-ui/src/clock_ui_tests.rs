// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::cell::Cell;
use std::collections::BTreeSet;
use std::io::Read;
use std::os::unix::net::UnixStream;
use std::rc::Rc;
use std::time::Duration;

use livi_core_client::Client;
use livi_core_proto::message::{Action, ToCore};
use livi_ui_model::keys::Zone;
use serde_json::json;
use slint::platform::software_renderer::{
    MinimalSoftwareWindow, PremultipliedRgbaColor, RepaintBufferType,
};
use slint::platform::{Platform, PlatformError, PointerEventButton, WindowAdapter, WindowEvent};
use slint::{
    Color, ComponentHandle, LogicalPosition, LogicalSize, ModelRc, PhysicalSize, VecModel,
};

use super::{Target, activate, context, open_tab, targets};
use crate::follow::{Follow, Update};
use crate::{AppWindow, ClockFace, Focus, FocusZone, Page, SidebarClock, TabData, Theme};

struct TestPlatform(Rc<MinimalSoftwareWindow>, Rc<Cell<Duration>>);

impl Platform for TestPlatform {
    fn create_window_adapter(&self) -> Result<Rc<dyn WindowAdapter>, PlatformError> {
        Ok(self.0.clone())
    }

    fn duration_since_start(&self) -> Duration {
        self.1.get()
    }
}

fn render(window: &MinimalSoftwareWindow) -> Vec<PremultipliedRgbaColor> {
    let size = window.size();
    let mut pixels = vec![PremultipliedRgbaColor::default(); (size.width * size.height) as usize];
    window.request_redraw();
    assert!(window.draw_if_needed(|renderer| {
        renderer.render(&mut pixels, size.width as usize);
    }));
    pixels
}

fn count_pixels(
    pixels: &[PremultipliedRgbaColor],
    width: usize,
    x: std::ops::Range<usize>,
    y: std::ops::Range<usize>,
    test: impl Fn(&PremultipliedRgbaColor) -> bool,
) -> usize {
    y.flat_map(|row| x.clone().map(move |col| &pixels[row * width + col]))
        .filter(|pixel| test(pixel))
        .count()
}

fn orange(pixel: &PremultipliedRgbaColor) -> bool {
    pixel.red > 170
        && pixel.green > 70
        && pixel.red > pixel.green.saturating_add(35)
        && pixel.green > pixel.blue.saturating_add(15)
}

fn pixel_changed(a: &PremultipliedRgbaColor, b: &PremultipliedRgbaColor) -> bool {
    (a.red, a.green, a.blue, a.alpha) != (b.red, b.green, b.blue, b.alpha)
}

fn click(window: &MinimalSoftwareWindow, x: f32, y: f32) {
    let position = LogicalPosition::new(x, y);
    window.dispatch_event(WindowEvent::PointerMoved { position });
    window.dispatch_event(WindowEvent::PointerPressed {
        position,
        button: PointerEventButton::Left,
    });
    window.dispatch_event(WindowEvent::PointerReleased {
        position,
        button: PointerEventButton::Left,
    });
}

fn drag(window: &MinimalSoftwareWindow, from: (f32, f32), to: (f32, f32)) {
    let position = LogicalPosition::new(from.0, from.1);
    window.dispatch_event(WindowEvent::PointerMoved { position });
    window.dispatch_event(WindowEvent::PointerPressed {
        position,
        button: PointerEventButton::Left,
    });
    let position = LogicalPosition::new(to.0, to.1);
    window.dispatch_event(WindowEvent::PointerMoved { position });
    window.dispatch_event(WindowEvent::PointerReleased {
        position,
        button: PointerEventButton::Left,
    });
}

fn message(stream: &mut UnixStream) -> ToCore {
    let mut length = [0; 4];
    stream.read_exact(&mut length).unwrap();
    let mut body = vec![0; u32::from_le_bytes(length) as usize];
    stream.read_exact(&mut body).unwrap();
    serde_json::from_slice(&body).unwrap()
}

fn sidebar_clock(hour: &str, minute: &str, colon_visible: bool) -> SidebarClock {
    SidebarClock {
        hour: hour.into(),
        minute: minute.into(),
        colon_visible,
    }
}

#[test]
fn sidebar_clock_blink_does_not_move_the_digits_or_layout() {
    let window = MinimalSoftwareWindow::new(RepaintBufferType::NewBuffer);
    slint::platform::set_platform(Box::new(TestPlatform(window.clone(), Default::default())))
        .unwrap();
    let ui = AppWindow::new().unwrap();
    ui.set_page(Page::Camera);
    ui.set_tabs(ModelRc::from(Rc::new(VecModel::from(vec![
        TabData {
            page: Page::Camera,
            icon: crate::icons::icon("CameraOutlined").unwrap(),
        },
        TabData {
            page: Page::Media,
            icon: crate::icons::icon("PlayCircleOutlined").unwrap(),
        },
    ]))));
    ui.window().set_size(PhysicalSize::new(1280, 400));
    ui.show().unwrap();

    crate::update_clock(&ui);
    let current = ui.get_sidebar_clock();
    assert_eq!(
        ui.get_clock_time().to_string(),
        format!("{}:{}", current.hour, current.minute)
    );
    assert_eq!(
        ui.get_clock().to_string(),
        format!(
            "{}{}{}",
            current.hour,
            if current.colon_visible { ":" } else { " " },
            current.minute
        )
    );
    assert_eq!(ui.global::<crate::DashState>().get_clock(), ui.get_clock());

    for (width, height, scale) in [(1280, 400, 1.0_f32), (800, 240, 1.0), (960, 600, 1.5)] {
        window.dispatch_event(WindowEvent::ScaleFactorChanged {
            scale_factor: scale,
        });
        ui.window().set_size(PhysicalSize::new(width, height));
        window.dispatch_event(WindowEvent::Resized {
            size: LogicalSize::new(width as f32 / scale, height as f32 / scale),
        });
        assert_eq!(window.size(), PhysicalSize::new(width, height));
        let edge = (100.0 * scale).ceil() as usize;
        let top = (16.0 * scale).floor() as usize;
        let bottom = (48.0 * scale).ceil() as usize;
        for right_hand in [false, true] {
            ui.set_right_hand(right_hand);
            let sidebar = if right_hand {
                width as usize - edge..width as usize
            } else {
                0..edge
            };
            for (comand, dark) in [(false, true), (true, true), (false, false), (true, false)] {
                let theme = ui.global::<Theme>();
                theme.set_comand(comand);
                theme.set_dark(dark);
                ui.set_sidebar_clock(sidebar_clock("11", "11", true));
                let baseline = render(&window);
                for (hour, minute) in [
                    ("00", "00"),
                    ("08", "08"),
                    ("12", "34"),
                    ("23", "59"),
                    ("11", "00"),
                    ("00", "11"),
                    ("--", "--"),
                ] {
                    ui.set_sidebar_clock(sidebar_clock(hour, minute, true));
                    let on = render(&window);
                    assert!(
                        baseline.iter().zip(&on).enumerate().all(|(index, (a, b))| {
                            !pixel_changed(a, b)
                                || ((top..bottom).contains(&(index / width as usize))
                                    && sidebar.contains(&(index % width as usize)))
                        }),
                        "changing the time must not move the sidebar or page at {width}x{height}, scale={scale}, right_hand={right_hand}, comand={comand}, dark={dark}, time={hour}:{minute}"
                    );
                    ui.set_sidebar_clock(sidebar_clock(hour, minute, false));
                    let off = render(&window);
                    let changed: Vec<_> = on
                        .iter()
                        .zip(&off)
                        .enumerate()
                        .filter(|(_, (a, b))| pixel_changed(a, b))
                        .map(|(index, _)| (index % width as usize, index / width as usize))
                        .collect();
                    assert!(
                        !changed.is_empty(),
                        "the colon should blink at {width}x{height}, scale={scale}, right_hand={right_hand}, comand={comand}, dark={dark}"
                    );
                    let min_x = changed.iter().map(|(x, _)| *x).min().unwrap();
                    let max_x = changed.iter().map(|(x, _)| *x).max().unwrap();
                    assert!(
                        max_x - min_x < (8.0 * scale).ceil() as usize
                            && changed.iter().all(|&(x, y)| {
                                (top..bottom).contains(&y) && sidebar.contains(&x)
                            }),
                        "only the colon should change at {width}x{height}, scale={scale}, right_hand={right_hand}, comand={comand}, dark={dark}, time={hour}:{minute}; changed x={min_x}..={max_x}"
                    );
                    let text_pixel = |p: &PremultipliedRgbaColor| {
                        if dark {
                            p.red > 160 && p.green > 160 && p.blue > 160
                        } else {
                            p.red < 80 && p.green < 80 && p.blue < 80
                        }
                    };
                    assert!(
                        count_pixels(
                            &off,
                            width as usize,
                            sidebar.start..min_x,
                            top..bottom,
                            text_pixel
                        ) > 5
                            && count_pixels(
                                &off,
                                width as usize,
                                max_x + 1..sidebar.end,
                                top..bottom,
                                text_pixel
                            ) > 5,
                        "both parts of the time should remain visible around the hidden colon"
                    );
                }
            }
        }
    }

    window.dispatch_event(WindowEvent::ScaleFactorChanged { scale_factor: 1.0 });
    ui.window().set_size(PhysicalSize::new(320, 220));
    window.dispatch_event(WindowEvent::Resized {
        size: LogicalSize::new(320.0, 220.0),
    });
    for right_hand in [false, true] {
        ui.set_right_hand(right_hand);
        ui.set_sidebar_clock(sidebar_clock("12", "34", true));
        let on = render(&window);
        ui.set_sidebar_clock(sidebar_clock("12", "34", false));
        let off = render(&window);
        assert!(
            on.iter().zip(&off).all(|(a, b)| !pixel_changed(a, b)),
            "the clock should stay hidden on short displays"
        );
    }

    ui.hide().unwrap();
}

#[test]
fn clock_shows_one_centered_face_with_swipe_and_dot_selection() {
    let window = MinimalSoftwareWindow::new(RepaintBufferType::NewBuffer);
    let time = Rc::new(Cell::new(Duration::ZERO));
    slint::platform::set_platform(Box::new(TestPlatform(window.clone(), time.clone()))).unwrap();
    let ui = AppWindow::new().unwrap();
    assert!(!ui.get_clock_auto_hide());
    ui.set_tabs(ModelRc::from(Rc::new(VecModel::from(vec![TabData {
        page: Page::Clock,
        icon: Default::default(),
    }]))));
    ui.set_page(Page::Clock);
    ui.set_clock("12:34".into());
    ui.set_sidebar_clock(sidebar_clock("12", "34", true));
    ui.set_clock_time("12:34".into());
    ui.set_clock_valid(true);
    ui.set_clock_hour_angle(100.0);
    ui.set_clock_minute_angle(210.0);
    ui.set_clock_second_angle(270.0);
    ui.window().set_size(PhysicalSize::new(1280, 400));
    ui.show().unwrap();

    let picked = Rc::new(Cell::new(None));
    let picks = Rc::new(Cell::new(0));
    ui.on_clock_style_picked({
        let picked = picked.clone();
        let picks = picks.clone();
        let weak = ui.as_weak();
        move |face| {
            picked.set(Some(face));
            picks.set(picks.get() + 1);
            weak.upgrade().unwrap().set_clock_face(face);
        }
    });

    let pixels = render(&window);
    assert_eq!(window.size(), PhysicalSize::new(1280, 400));
    let markings = |p: &PremultipliedRgbaColor| p.red > 160 && p.green > 160 && p.blue > 140;
    assert!(count_pixels(&pixels, 1280, 510..870, 0..350, orange) > 300);
    assert_eq!(
        count_pixels(&pixels, 1280, 100..510, 0..350, markings)
            + count_pixels(&pixels, 1280, 870..1280, 0..350, markings),
        0,
        "only one centered dial should be visible, with no companion time panel"
    );

    let theme = ui.global::<Theme>();
    theme.set_dark(false);
    let light = render(&window);
    let panel = &light[100 * 1280 + 690];
    assert!(panel.red < 60 && panel.green < 60 && panel.blue < 60);
    assert!(count_pixels(&light, 1280, 510..870, 0..350, markings) > 500);
    theme.set_dark(true);
    theme.set_background_override(Color::from_rgb_u8(255, 255, 255));
    let custom = render(&window);
    let panel = &custom[100 * 1280 + 690];
    assert!(panel.red < 60 && panel.green < 60 && panel.blue < 60);
    theme.set_background_override(Color::from_argb_u8(0, 0, 0, 0));

    assert_eq!(
        targets(&ui),
        vec![
            Target::ClockStyle(ClockFace::Classic),
            Target::ClockStyle(ClockFace::Amber),
            Target::ClockStyle(ClockFace::Digital)
        ]
    );
    ui.global::<Focus>().set_zone(FocusZone::Nav);
    open_tab(&ui, true);
    assert_eq!(ui.global::<Focus>().get_zone(), FocusZone::Main);
    activate(&ui, Target::ClockStyle(ClockFace::Amber));
    assert_eq!(picked.get(), Some(ClockFace::Amber));
    picked.set(None);
    click(&window, 734.0, 374.0);
    assert_eq!(picked.get(), Some(ClockFace::Digital));

    let digital = render(&window);
    assert!(count_pixels(&digital, 1280, 200..1100, 0..320, orange) > 500);
    picked.set(None);
    click(&window, 690.0, 374.0);
    assert_eq!(picked.get(), Some(ClockFace::Amber));

    ui.set_clock_face(ClockFace::Classic);
    for (from, to, expected) in [
        ((600.0, 180.0), (560.0, 180.0), Some(ClockFace::Amber)),
        ((600.0, 180.0), (400.0, 180.0), Some(ClockFace::Digital)),
        ((600.0, 180.0), (400.0, 180.0), None),
        ((400.0, 180.0), (600.0, 180.0), Some(ClockFace::Amber)),
        ((400.0, 180.0), (600.0, 180.0), Some(ClockFace::Classic)),
        ((400.0, 180.0), (600.0, 180.0), None),
        ((600.0, 180.0), (561.0, 180.0), None),
        ((600.0, 180.0), (550.0, 250.0), None),
        ((600.0, 180.0), (550.0, 230.0), None),
        ((600.0, 180.0), (600.0, 260.0), None),
        ((600.0, 180.0), (600.0, 180.0), None),
    ] {
        picked.set(None);
        let before = picks.get();
        drag(&window, from, to);
        assert_eq!(picked.get(), expected, "drag {from:?} -> {to:?}");
        assert_eq!(picks.get() - before, usize::from(expected.is_some()));
    }
    picked.set(None);
    click(&window, 646.0, 374.0);
    assert_eq!(picked.get(), None, "tapping the selected dot is a no-op");

    window.dispatch_event(WindowEvent::PointerPressed {
        position: LogicalPosition::new(600.0, 180.0),
        button: PointerEventButton::Left,
    });
    window.dispatch_event(WindowEvent::PointerExited);
    window.dispatch_event(WindowEvent::PointerReleased {
        position: LogicalPosition::new(400.0, 180.0),
        button: PointerEventButton::Left,
    });
    assert_eq!(picked.get(), None, "cancelled drags must not pick a face");

    ui.set_clock_face(ClockFace::Classic);
    ui.set_right_hand(true);
    let mirrored = render(&window);
    assert!(count_pixels(&mirrored, 1280, 410..770, 0..350, orange) > 300);
    assert_eq!(
        count_pixels(&mirrored, 1280, 0..410, 0..350, markings)
            + count_pixels(&mirrored, 1280, 770..1180, 0..350, markings),
        0
    );
    picked.set(None);
    click(&window, 590.0, 374.0);
    assert_eq!(picked.get(), Some(ClockFace::Amber));

    ui.window().set_size(PhysicalSize::new(320, 200));
    let compact = render(&window);
    assert_eq!(window.size(), PhysicalSize::new(320, 200));
    assert_eq!(targets(&ui).len(), 3);
    ui.global::<Focus>().set_zone(FocusZone::Main);
    let compact_context = context(&ui, false);
    assert_eq!(compact_context.zone, Zone::Main);
    assert!(!compact_context.nav_only);
    ui.global::<Focus>().set_zone(FocusZone::Nav);
    open_tab(&ui, true);
    assert_eq!(ui.global::<Focus>().get_zone(), FocusZone::Main);
    assert!(count_pixels(&compact, 320, 0..320, 0..200, orange) > 30);

    for right_hand in [false, true] {
        ui.set_right_hand(right_hand);
        for face in [ClockFace::Classic, ClockFace::Amber, ClockFace::Digital] {
            ui.set_clock_face(face);
            let compact = render(&window);
            assert!(count_pixels(&compact, 320, 0..320, 0..150, orange) > 30);
        }
        ui.set_clock_face(ClockFace::Classic);
        picked.set(None);
        drag(&window, (190.0, 75.0), (130.0, 75.0));
        assert_eq!(picked.get(), Some(ClockFace::Amber));
        picked.set(None);
        let center = if right_hand { 132.0 } else { 188.0 };
        click(&window, center + 44.0, 174.0);
        assert_eq!(picked.get(), Some(ClockFace::Digital));
    }

    ui.set_clock_face(ClockFace::Classic);
    ui.set_clock_valid(false);
    ui.set_clock_time("--:--".into());
    let unavailable = render(&window);
    assert!(
        count_pixels(&unavailable, 320, 90..175, 50..100, |p| {
            p.red > 160 && p.green > 160 && p.blue > 140
        }) > 20,
        "an unavailable time should be readable in the middle of the dial"
    );

    ui.set_clock_valid(true);
    ui.set_clock_time("12:34".into());
    ui.window().set_size(PhysicalSize::new(1280, 400));
    render(&window);
    assert_eq!(targets(&ui).len(), 3);

    window.dispatch_event(WindowEvent::ScaleFactorChanged { scale_factor: 2.0 });
    window.dispatch_event(WindowEvent::Resized {
        size: LogicalSize::new(640.0, 200.0),
    });
    render(&window);
    assert_eq!(window.size(), PhysicalSize::new(1280, 400));
    assert_eq!(targets(&ui).len(), 3);
    picked.set(None);
    click(&window, 292.0, 174.0);
    assert_eq!(picked.get(), Some(ClockFace::Amber));

    window.dispatch_event(WindowEvent::ScaleFactorChanged { scale_factor: 1.0 });
    window.dispatch_event(WindowEvent::Resized {
        size: LogicalSize::new(1280.0, 400.0),
    });
    render(&window);

    for right_hand in [false, true] {
        ui.set_right_hand(right_hand);
        for distance in [39.0, 40.0] {
            ui.set_clock_face(ClockFace::Classic);
            ui.set_clock_auto_hide(true);
            ui.invoke_wake_nav();
            time.set(time.get() + Duration::from_secs(4));
            slint::platform::update_timers_and_animations();
            render(&window);
            let position = LogicalPosition::new(600.0, 180.0);
            window.dispatch_event(WindowEvent::PointerPressed {
                position,
                button: PointerEventButton::Left,
            });
            super::touched(&ui);
            slint::platform::update_timers_and_animations();
            render(&window);
            window.dispatch_event(WindowEvent::PointerReleased {
                position: LogicalPosition::new(600.0 - distance, 180.0),
                button: PointerEventButton::Left,
            });
            assert_eq!(
                ui.get_clock_face(),
                if distance < 40.0 {
                    ClockFace::Classic
                } else {
                    ClockFace::Amber
                },
                "waking navigation must preserve swipe distance, right_hand={right_hand}"
            );
        }
    }
    ui.set_clock_auto_hide(false);
    ui.set_right_hand(false);
    ui.set_clock_face(ClockFace::Classic);
    render(&window);

    let (ours, mut peer) = UnixStream::pair().unwrap();
    peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    let client = Client::start(ours, "clock-ui-test", |_, _| {}).unwrap();
    crate::wire(&ui, &client);
    assert!(matches!(message(&mut peer), ToCore::Hello { .. }));
    let mut follow = Follow::default();
    let changed = BTreeSet::from(["config".to_string()]);
    for (id, face, expected) in [
        (1, ClockFace::Amber, "amber"),
        (2, ClockFace::Digital, "digital"),
        (3, ClockFace::Amber, "amber"),
        (4, ClockFace::Classic, "classic"),
        (5, ClockFace::Digital, "digital"),
        (6, ClockFace::Amber, "amber"),
    ] {
        if id == 6 {
            ui.window().set_size(PhysicalSize::new(320, 200));
            ui.global::<Focus>().set_zone(FocusZone::None);
            let unfocused = render(&window);
            assert!(super::key(&ui, &client, "ArrowRight", true, false));
            assert!(super::key(&ui, &client, "ArrowRight", true, false));
            assert_eq!(ui.global::<Focus>().get_main_index(), 1);
            let focused = render(&window);
            assert!(
                count_pixels(&focused, 320, 166..210, 152..196, orange)
                    > count_pixels(&unfocused, 320, 166..210, 152..196, orange),
                "the focused dot should have a visible D-pad focus ring"
            );
            assert!(super::key(&ui, &client, "Enter", true, false));
        } else if id == 5 {
            click(&window, 734.0, 374.0);
        } else if id <= 2 {
            drag(&window, (600.0, 180.0), (400.0, 180.0));
        } else {
            drag(&window, (400.0, 180.0), (600.0, 180.0));
        }
        assert_eq!(
            message(&mut peer),
            ToCore::Action {
                id,
                action: Action::SetConfig {
                    patch: json!({ "clockStyle": expected }),
                },
            }
        );
        let state = json!({
            "config": {
                "clockStyle": expected,
                "clockAutoHide": true,
                "hand": 0
            }
        });
        let update = follow
            .changed(Some(&changed), &state)
            .into_iter()
            .find(|update| matches!(update, Update::Look(_)))
            .unwrap();
        crate::apply(&ui, update);
        assert_eq!(ui.get_clock_face(), face);
        assert!(ui.get_clock_auto_hide());
    }
    peer.set_nonblocking(true).unwrap();
    assert_eq!(
        peer.read(&mut [0]).unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock,
        "each selection should send exactly one settings action"
    );
    ui.hide().unwrap();
}
