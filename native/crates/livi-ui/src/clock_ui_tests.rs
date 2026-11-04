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
use livi_ui_model::keys::{Outcome, Zone, decide};
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

struct TestPlatform(Rc<MinimalSoftwareWindow>);

impl Platform for TestPlatform {
    fn create_window_adapter(&self) -> Result<Rc<dyn WindowAdapter>, PlatformError> {
        Ok(self.0.clone())
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
    slint::platform::set_platform(Box::new(TestPlatform(window.clone()))).unwrap();
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
fn clock_resizes_and_style_controls_work_on_the_waveshare_layout() {
    let window = MinimalSoftwareWindow::new(RepaintBufferType::NewBuffer);
    slint::platform::set_platform(Box::new(TestPlatform(window.clone()))).unwrap();
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
    ui.on_clock_style_picked({
        let picked = picked.clone();
        move |face| picked.set(Some(face))
    });

    let pixels = render(&window);
    assert_eq!(window.size(), PhysicalSize::new(1280, 400));
    assert!(ui.get_clock_wide());
    let left_hand = count_pixels(&pixels, 1280, 80..640, 0..300, orange);
    let right_hand = count_pixels(&pixels, 1280, 640..1200, 0..300, orange);
    assert!(left_hand > 300 && left_hand > right_hand * 3);
    let readout = count_pixels(&pixels, 1280, 640..1200, 0..300, |p| {
        p.red > 160 && p.green > 160 && p.blue > 140
    });
    assert!(readout > 500, "wide layout should include a readable time");

    let theme = ui.global::<Theme>();
    theme.set_dark(false);
    let light = render(&window);
    let panel = &light[40 * 1280 + 700];
    assert!(panel.red < 60 && panel.green < 60 && panel.blue < 60);
    assert!(
        count_pixels(&light, 1280, 700..1180, 40..250, |p| {
            p.red > 160 && p.green > 160 && p.blue > 140
        }) > 500
    );
    theme.set_dark(true);
    theme.set_background_override(Color::from_rgb_u8(255, 255, 255));
    let custom = render(&window);
    let panel = &custom[40 * 1280 + 700];
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
    click(&window, 1140.0, 362.0);
    assert_eq!(picked.get(), Some(ClockFace::Digital));

    ui.set_clock_face(ClockFace::Digital);
    let digital = render(&window);
    assert!(count_pixels(&digital, 1280, 200..1100, 0..320, orange) > 500);
    picked.set(None);
    click(&window, 650.0, 362.0);
    assert_eq!(picked.get(), Some(ClockFace::Amber));

    ui.set_clock_face(ClockFace::Classic);
    ui.set_right_hand(true);
    let mirrored = render(&window);
    let left_hand = count_pixels(&mirrored, 1280, 80..640, 0..300, orange);
    let right_hand = count_pixels(&mirrored, 1280, 640..1200, 0..300, orange);
    assert!(right_hand > 300 && right_hand > left_hand * 3);
    picked.set(None);
    click(&window, 300.0, 362.0);
    assert_eq!(picked.get(), Some(ClockFace::Amber));

    ui.window().set_size(PhysicalSize::new(320, 200));
    let compact = render(&window);
    assert_eq!(window.size(), PhysicalSize::new(320, 200));
    assert!(!ui.get_clock_wide());
    assert!(targets(&ui).is_empty());
    ui.global::<Focus>().set_zone(FocusZone::Main);
    let compact_context = context(&ui, false);
    assert_eq!(compact_context.zone, Zone::None);
    assert!(compact_context.nav_only);
    assert_eq!(
        decide("ArrowDown", compact_context, &json!({})),
        Outcome::ToNav
    );
    ui.global::<Focus>().set_zone(FocusZone::Nav);
    open_tab(&ui, true);
    assert_eq!(ui.global::<Focus>().get_zone(), FocusZone::Nav);
    assert!(count_pixels(&compact, 320, 0..320, 0..200, orange) > 30);

    ui.set_clock_valid(false);
    ui.set_clock_time("--:--".into());
    let unavailable = render(&window);
    assert!(
        count_pixels(&unavailable, 320, 90..175, 80..120, |p| {
            p.red > 160 && p.green > 160 && p.blue > 140
        }) > 20,
        "an unavailable time should be readable in the middle of the dial"
    );

    ui.set_clock_valid(true);
    ui.set_clock_time("12:34".into());
    ui.window().set_size(PhysicalSize::new(1280, 400));
    render(&window);
    assert!(ui.get_clock_wide());
    assert_eq!(targets(&ui).len(), 3);

    window.dispatch_event(WindowEvent::ScaleFactorChanged { scale_factor: 2.0 });
    window.dispatch_event(WindowEvent::Resized {
        size: LogicalSize::new(640.0, 200.0),
    });
    render(&window);
    assert_eq!(window.size(), PhysicalSize::new(1280, 400));
    assert!(ui.get_clock_wide());
    assert_eq!(targets(&ui).len(), 3);
    picked.set(None);
    click(&window, 146.0, 162.0);
    assert_eq!(picked.get(), Some(ClockFace::Amber));

    window.dispatch_event(WindowEvent::ScaleFactorChanged { scale_factor: 1.0 });
    window.dispatch_event(WindowEvent::Resized {
        size: LogicalSize::new(1280.0, 400.0),
    });
    render(&window);

    let (ours, mut peer) = UnixStream::pair().unwrap();
    peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    let client = Client::start(ours, "clock-ui-test", |_, _| {}).unwrap();
    crate::wire(&ui, &client);
    assert!(matches!(message(&mut peer), ToCore::Hello { .. }));
    let mut follow = Follow::default();
    let changed = BTreeSet::from(["config".to_string()]);
    for (id, face, expected) in [
        (1, ClockFace::Classic, "classic"),
        (2, ClockFace::Amber, "amber"),
        (3, ClockFace::Digital, "digital"),
    ] {
        if face == ClockFace::Classic {
            activate(&ui, Target::ClockStyle(face));
        } else {
            click(
                &window,
                if face == ClockFace::Amber {
                    300.0
                } else {
                    480.0
                },
                362.0,
            );
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
                "hand": 1
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
    ui.hide().unwrap();
}
