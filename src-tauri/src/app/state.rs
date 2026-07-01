use std::sync::Mutex;

use super::super::DeltaSyncPayload;
use tokio::sync::oneshot;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DeltaSyncFinishOutcome {
    Completed,
    NoActiveSession,
    SessionMismatch,
    LockFailed,
    ReceiverDropped,
}

#[derive(Default)]
pub(crate) struct DeltaSyncManager {
    active: Mutex<Option<ActiveDeltaSync>>,
}

struct ActiveDeltaSync {
    label: String,
    session_id: String,
    sender: oneshot::Sender<Result<DeltaSyncPayload, String>>,
}

impl DeltaSyncManager {
    pub(crate) fn begin(
        &self,
        label: String,
        session_id: String,
        sender: oneshot::Sender<Result<DeltaSyncPayload, String>>,
    ) -> Result<(), String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "download_failed: Unable to lock sync state.".to_string())?;

        if active.is_some() {
            return Err("download_failed: A Delta Virtual sync is already in progress.".into());
        }

        *active = Some(ActiveDeltaSync {
            label,
            session_id,
            sender,
        });
        Ok(())
    }

    // Resolves the active sync session only when the label and session id still match.
    pub(crate) fn finish(
        &self,
        label: &str,
        session_id: &str,
        result: Result<DeltaSyncPayload, String>,
    ) -> DeltaSyncFinishOutcome {
        let sender = match self.active.lock() {
            Ok(mut active) => match active.take() {
                Some(session) if session.label == label && session.session_id == session_id => {
                    session.sender
                }
                Some(session) => {
                    *active = Some(session);
                    return DeltaSyncFinishOutcome::SessionMismatch;
                }
                None => return DeltaSyncFinishOutcome::NoActiveSession,
            },
            Err(_) => return DeltaSyncFinishOutcome::LockFailed,
        };

        match sender.send(result) {
            Ok(()) => DeltaSyncFinishOutcome::Completed,
            Err(_) => DeltaSyncFinishOutcome::ReceiverDropped,
        }
    }

    // Explicit user resets can clear the active session without matching its session id.
    pub(crate) fn finish_any(
        &self,
        label: &str,
        result: Result<DeltaSyncPayload, String>,
    ) -> DeltaSyncFinishOutcome {
        let sender = match self.active.lock() {
            Ok(mut active) => match active.take() {
                Some(session) if session.label == label => session.sender,
                Some(session) => {
                    *active = Some(session);
                    return DeltaSyncFinishOutcome::SessionMismatch;
                }
                None => return DeltaSyncFinishOutcome::NoActiveSession,
            },
            Err(_) => return DeltaSyncFinishOutcome::LockFailed,
        };

        match sender.send(result) {
            Ok(()) => DeltaSyncFinishOutcome::Completed,
            Err(_) => DeltaSyncFinishOutcome::ReceiverDropped,
        }
    }
}
