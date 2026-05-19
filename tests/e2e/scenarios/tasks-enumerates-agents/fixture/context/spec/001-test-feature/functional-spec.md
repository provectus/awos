# Functional Specification — User Profile Picture Upload

## Overview

Allow authenticated users to upload, view, and replace a profile picture from their account settings page. The avatar is displayed wherever the user appears in the application (header bar, profile page, comment threads).

## Goals

- Users can pick an image file from their device and set it as their profile picture.
- The current avatar is shown on the profile page; a placeholder is shown for users who haven't uploaded one.
- Avatars round-trip safely: upload → store → retrieve → display.

## User Stories

1. **As a signed-in user**, I can open my profile page and see my current avatar (or a placeholder if I haven't uploaded one) so I know what other users see.
2. **As a signed-in user**, I can choose a PNG or JPEG file from my device and upload it as my new avatar so I can personalize my account.
3. **As a signed-in user**, I can replace my existing avatar with a new image so I can keep my profile current.
4. **As any user viewing the app**, I see other users' avatars rendered next to their names in the header and on the profile page so the UI feels personal.

## Acceptance Criteria

- The profile page renders the current avatar at 96×96 px; the placeholder is a generic silhouette.
- Upload accepts PNG and JPEG up to 2 MB. Other formats / oversized files surface a clear error.
- After a successful upload, the new avatar appears immediately on the profile page without a manual refresh.
- The avatar URL is persisted on the user record and survives a logout/login cycle.

## Out of Scope

- Image cropping / editing UI (use the file as uploaded).
- Animated GIFs or HEIC support.
- CDN / image-resizing pipeline (store and serve as-is for now).

## Notes

This is a small but genuinely cross-stack feature: backend persistence + API + frontend UI all need to land together for any vertical slice to be testable end-to-end.
