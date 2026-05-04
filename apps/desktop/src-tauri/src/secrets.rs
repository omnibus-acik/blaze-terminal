//! OS-keychain backed secret storage for runbook `{{secret:NAME}}` values.
//!
//! Uses the `keyring` crate which abstracts macOS Keychain (Security
//! framework), Linux Secret Service (libsecret), and Windows Credential
//! Manager. Service name is fixed at `BLAZE_SERVICE`; the secret's `NAME`
//! becomes the keychain account/username.
//!
//! Per spec §5.6.3: secrets are never written to disk or scrollback.

use keyring::Entry;

const BLAZE_SERVICE: &str = "dev.blaze.app";

fn entry(name: &str) -> Result<Entry, String> {
    Entry::new(BLAZE_SERVICE, name).map_err(|e| e.to_string())
}

/// Returns Some(value) when the secret exists, None when it doesn't.
/// Distinguishes "no entry" from real errors so the UI can decide whether
/// to prompt vs. surface an error.
#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    if name.trim().is_empty() {
        return Err("secret name is empty".into());
    }
    let e = entry(&name)?;
    match e.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("secret name is empty".into());
    }
    let e = entry(&name)?;
    e.set_password(&value).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("secret name is empty".into());
    }
    let e = entry(&name)?;
    match e.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}
