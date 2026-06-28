//! Captures the `Date` response header from provider HTTP calls.
//!
//! The app is online by nature — every model turn is a TLS request to a
//! provider whose response carries a server `Date`. JS feeds that into a
//! trusted-time watermark for license/trial verification, so the trial clock is
//! driven by server time rather than the (tamperable) local clock. No active
//! clock sync or system-time probing — we only record what providers already
//! send. wasm is single-threaded, so a thread-local is sufficient.

use std::cell::RefCell;

thread_local! {
    static LAST_SERVER_DATE: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Record the raw `Date` header (RFC 1123) from a provider response.
pub fn set(date: &str) {
    LAST_SERVER_DATE.with(|c| *c.borrow_mut() = Some(date.to_string()));
}

/// Take (and clear) the last captured `Date`, to attach to the chat result.
pub fn take() -> Option<String> {
    LAST_SERVER_DATE.with(|c| c.borrow_mut().take())
}
