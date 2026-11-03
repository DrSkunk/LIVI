// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClockTime {
    hour: i32,
    minute: i32,
    second: i32,
}

impl ClockTime {
    pub fn text(self) -> String {
        format!("{:02}:{:02}", self.hour, self.minute)
    }

    pub fn blinking_text(self) -> String {
        let sep = if self.second % 2 == 0 { ':' } else { ' ' };
        format!("{:02}{sep}{:02}", self.hour, self.minute)
    }

    pub fn angles(self) -> (f32, f32, f32) {
        let seconds = self.second as f32;
        let minutes = self.minute as f32 + seconds / 60.0;
        let hours = (self.hour % 12) as f32 + minutes / 60.0;
        (hours * 30.0, minutes * 6.0, seconds * 6.0)
    }
}

pub fn now() -> std::io::Result<ClockTime> {
    let mut tv: libc::timeval = libc::timeval {
        tv_sec: 0,
        tv_usec: 0,
    };
    if unsafe { libc::gettimeofday(&mut tv, std::ptr::null_mut()) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    if unsafe { libc::localtime_r(&tv.tv_sec, &mut tm) }.is_null() {
        return Err(std::io::Error::last_os_error());
    }
    Ok(ClockTime {
        hour: tm.tm_hour,
        minute: tm.tm_min,
        second: tm.tm_sec,
    })
}

pub fn stamp() -> String {
    let mut tv: libc::timeval = libc::timeval {
        tv_sec: 0,
        tv_usec: 0,
    };
    unsafe { libc::gettimeofday(&mut tv, std::ptr::null_mut()) };
    let now = tv.tv_sec;
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    unsafe { libc::localtime_r(&now, &mut tm) };
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        tm.tm_hour,
        tm.tm_min,
        tm.tm_sec,
        tv.tv_usec / 1000
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_keeps_the_existing_blinking_sidebar_and_a_steady_digital_colon() {
        let even = ClockTime {
            hour: 3,
            minute: 5,
            second: 6,
        };
        let odd = ClockTime { second: 7, ..even };
        assert_eq!(even.text(), "03:05");
        assert_eq!(odd.text(), "03:05");
        assert_eq!(even.blinking_text(), "03:05");
        assert_eq!(odd.blinking_text(), "03 05");
    }

    #[test]
    fn hands_include_minutes_and_seconds_and_wrap_at_twelve() {
        let midnight = ClockTime {
            hour: 0,
            minute: 0,
            second: 0,
        };
        let noon = ClockTime {
            hour: 12,
            ..midnight
        };
        let afternoon = ClockTime {
            hour: 15,
            minute: 15,
            second: 30,
        };
        assert_eq!(midnight.angles(), (0.0, 0.0, 0.0));
        assert_eq!(noon.angles(), midnight.angles());
        assert_eq!(afternoon.angles(), (97.75, 93.0, 180.0));
        assert_eq!(
            ClockTime {
                hour: 23,
                ..midnight
            }
            .text(),
            "23:00"
        );
    }
}
