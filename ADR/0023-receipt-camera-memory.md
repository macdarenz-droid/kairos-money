# ADR 0023 — Receipt camera frames remain in memory

Use the installed Capacitor WebView camera-permission bridge and `getUserMedia`
with video only. The rear camera is preferred. The bundled page previews the
stream, captures a bounded JPEG in memory, and requires explicit photo review.
No gallery file, external camera activity or plaintext temporary receipt is
created by this path. Camera frames never create transaction rows or coverage.

After confirmation, reuse on-device OCR and the encrypted attachment repository.
The stream stops on retake review, cancellation or component removal. A late
permission result is stopped immediately. Lock/background removes the camera;
an abort signal is checked after OCR and inside the serialized repository call
so an abandoned capture cannot save after a later unlock. Captures have the
existing 10 MB attachment limit and a maximum 2560-pixel long edge.

Alternatives: a separate Camera2 activity would duplicate permission/lifecycle
and preview handling; external camera intents would require managing plaintext
output files. The existing native bridge already handles WebView video capture
permission requests. Android manifest permission is explicit; no microphone or
network permission is introduced. CSP permits local media blobs only.

Source tests cover confirmation, retake, denied permission/retry, late permission
completion, lock during saving, and both-theme encrypted attachment/backup
round trips without duplicate spending. Actual Android permission, optical
readability, camera release, orientation, and both-theme device review remain
required in the combined Session 4 gate. Source mocks are not device evidence.
