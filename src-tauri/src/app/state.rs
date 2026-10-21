use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use super::super::DeltaSyncPayload;
use tokio::sync::{oneshot, Mutex as AsyncMutex, MutexGuard};

pub(crate) const PERSISTENCE_WRITE_SUPPRESSED_ERROR: &str =
    "profile_clear_in_progress: User data persistence is disabled until reload.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PersistenceWriteSuppressed;

#[derive(Default)]
pub(crate) struct UserDataPersistenceGate {
    writer: AsyncMutex<()>,
    writes_suppressed: AtomicBool,
}

impl UserDataPersistenceGate {
    // Permanently disables new writes before waiting for an accepted writer to finish.
    pub(crate) async fn begin_clear(&self) -> MutexGuard<'_, ()> {
        self.writes_suppressed.store(true, Ordering::Release);
        self.writer.lock().await
    }

    // Rechecks suppression after locking so writers queued before deletion cannot run later.
    pub(crate) async fn begin_write(
        &self,
    ) -> Result<MutexGuard<'_, ()>, PersistenceWriteSuppressed> {
        let guard = self.writer.lock().await;
        if self.writes_are_suppressed() {
            return Err(PersistenceWriteSuppressed);
        }
        Ok(guard)
    }

    pub(crate) fn writes_are_suppressed(&self) -> bool {
        self.writes_suppressed.load(Ordering::Acquire)
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
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    use super::UserDataPersistenceGate;
    use tokio::sync::oneshot;

    #[tokio::test]
    async fn clear_suppresses_writes_before_waiting_for_an_accepted_writer() {
        let gate = Arc::new(UserDataPersistenceGate::default());
        let writer = gate.begin_write().await.expect("initial writer accepted");
        let (entered_sender, mut entered_receiver) = oneshot::channel();
        let clear_gate = Arc::clone(&gate);
        let clear = tokio::spawn(async move {
            let _guard = clear_gate.begin_clear().await;
            let _ = entered_sender.send(());
        });

        while !gate.writes_are_suppressed() {
            tokio::task::yield_now().await;
        }
        assert!(matches!(
            entered_receiver.try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));
        drop(writer);
        entered_receiver.await.unwrap();
        clear.await.unwrap();
    }

    #[tokio::test]
    async fn queued_writer_is_rejected_after_clear_starts() {
        let gate = Arc::new(UserDataPersistenceGate::default());
        let first_writer = gate.begin_write().await.expect("initial writer accepted");
        let wrote = Arc::new(AtomicBool::new(false));
        let (attempting_sender, attempting_receiver) = oneshot::channel();
        let queued_gate = Arc::clone(&gate);
        let queued_wrote = Arc::clone(&wrote);
        let queued_writer = tokio::spawn(async move {
            let _ = attempting_sender.send(());
            match queued_gate.begin_write().await {
                Ok(_guard) => {
                    queued_wrote.store(true, Ordering::Release);
                    false
                }
                Err(_) => true,
            }
        });

        attempting_receiver.await.unwrap();
        tokio::task::yield_now().await;
        let clear_gate = Arc::clone(&gate);
        let clear = tokio::spawn(async move {
            let _guard = clear_gate.begin_clear().await;
        });
        while !gate.writes_are_suppressed() {
            tokio::task::yield_now().await;
        }

        drop(first_writer);
        assert!(queued_writer.await.unwrap());
        assert!(!wrote.load(Ordering::Acquire));
        clear.await.unwrap();
    }

    #[tokio::test]
    async fn writer_waiting_during_clear_is_rejected_after_clear_releases() {
        let gate = Arc::new(UserDataPersistenceGate::default());
        let clear_guard = gate.begin_clear().await;
        let writer_gate = Arc::clone(&gate);
        let writer = tokio::spawn(async move { writer_gate.begin_write().await.is_err() });

        tokio::task::yield_now().await;
        assert!(!writer.is_finished());
        drop(clear_guard);
        assert!(writer.await.unwrap());
    }

    #[tokio::test]
    async fn suppression_remains_after_clear_guard_is_released() {
        let gate = UserDataPersistenceGate::default();
        let clear_guard = gate.begin_clear().await;
        drop(clear_guard);

        assert!(gate.writes_are_suppressed());
        assert!(gate.begin_write().await.is_err());
    }
}
