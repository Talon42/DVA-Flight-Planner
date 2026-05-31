use std::sync::Mutex;

use super::super::DeltaSyncPayload;
use tokio::sync::oneshot;

#[derive(Default)]
pub(crate) struct DeltaSyncManager {
    active: Mutex<Option<ActiveDeltaSync>>,
}

struct ActiveDeltaSync {
    label: String,
    sender: oneshot::Sender<Result<DeltaSyncPayload, String>>,
}

impl DeltaSyncManager {
    pub(crate) fn begin(
        &self,
        label: String,
        sender: oneshot::Sender<Result<DeltaSyncPayload, String>>,
    ) -> Result<(), String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "download_failed: Unable to lock sync state.".to_string())?;

        if active.is_some() {
            return Err("download_failed: A Delta Virtual sync is already in progress.".into());
        }

        *active = Some(ActiveDeltaSync { label, sender });
        Ok(())
    }

    pub(crate) fn finish(&self, label: &str, result: Result<DeltaSyncPayload, String>) {
        let sender = self
            .active
            .lock()
            .ok()
            .and_then(|mut active| match active.take() {
                Some(session) if session.label == label => Some(session.sender),
                Some(session) => {
                    *active = Some(session);
                    None
                }
                None => None,
            });

        if let Some(sender) = sender {
            let _ = sender.send(result);
        }
    }
}
