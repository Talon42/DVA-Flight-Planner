use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use super::super::DeltaSyncPayload;
use tokio::sync::{oneshot, Mutex as AsyncMutex, MutexGuard};

#[derive(Default)]
pub(crate) struct UserDataPersistenceGate {
    writer: AsyncMutex<()>,
    suppress_window_state: AtomicBool,
}

impl UserDataPersistenceGate {
    pub(crate) async fn lock(&self) -> MutexGuard<'_, ()> {
        self.writer.lock().await
    }

    pub(crate) fn suppress_window_state(&self) {
        self.suppress_window_state.store(true, Ordering::Release);
    }

    pub(crate) fn should_suppress_window_state(&self) -> bool {
        self.suppress_window_state.load(Ordering::Acquire)
    }
}

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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::UserDataPersistenceGate;
    use tokio::sync::oneshot;

    async fn assert_waiter_enters_only_after_release() {
        let gate = Arc::new(UserDataPersistenceGate::default());
        let guard = gate.lock().await;
        let (attempting_sender, attempting_receiver) = oneshot::channel();
        let (entered_sender, mut entered_receiver) = oneshot::channel();
        let waiter_gate = Arc::clone(&gate);
        let waiter = tokio::spawn(async move {
            let _ = attempting_sender.send(());
            let _guard = waiter_gate.lock().await;
            let _ = entered_sender.send(());
        });

        attempting_receiver.await.unwrap();
        assert!(matches!(
            entered_receiver.try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));
        drop(guard);
        entered_receiver.await.unwrap();
        waiter.await.unwrap();
    }

    #[tokio::test]
    async fn delete_waits_for_an_accepted_writer() {
        assert_waiter_enters_only_after_release().await;
    }

    #[tokio::test]
    async fn writer_waits_for_active_deletion() {
        assert_waiter_enters_only_after_release().await;
    }

    #[tokio::test]
    async fn successful_deletion_suppresses_window_state_writes() {
        let gate = UserDataPersistenceGate::default();
        assert!(!gate.should_suppress_window_state());
        gate.suppress_window_state();
        assert!(gate.should_suppress_window_state());
    }
}
