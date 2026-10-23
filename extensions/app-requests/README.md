# App Requests attachments

The App Requests composer accepts multiple files from **Attach files** or a native Finder drop anywhere in its window. Remove individual files before starting; selections survive reopening. Files are limited to 10 per request, 20 MB each, and 50 MB total. Folders and application packages are rejected.

Starting a request snapshots the selected files under `~/.betterbar/app-request-attachments/` with private directory/file permissions. The existing request prompt carries a JSON manifest of these copies, so the worker can read text, images, and other reference files even if originals move. Failed starts remove the unused snapshot and retain the draft. Successful snapshots remain available for task history; they are not automatically deleted or published.

## Host requirement

This extension enhances the existing **local App Requests service** (`list_app_requests`, `get_app_request`, `start_app_request`, `cancel_app_request`, `open_app_request_terminal`). That service and its detached worker are local-only prerequisites and are intentionally not published by this attachment change. Installing the extension on a host without that service will not enable task execution.

The host changes in this request add only `inspect_request_attachments`, `snapshot_request_attachments`, `discard_request_attachments`, and the attachment picker mode. Snapshot commands accept calls only from the App Requests window. The extension is a single self-contained `main.tsx`, including its styles, and should be installed under `~/.betterbar/extensions/app-requests/main.tsx` with normal BetterBar extension approval.

Files are sent as local references to the same worker that handles the request. Attach only files the worker should read. The manifest instructs the worker to keep reference files out of commits and publication unless explicitly requested. Attachment contents and personal preferences are never part of this reusable source.
