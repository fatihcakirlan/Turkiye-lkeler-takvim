# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Admin Isolation**: Only verified administrators (`request.auth.token.email_verified == true` and either bootstrapped superadmin email or an existing `/adminler/{uid}` record) may read `/adminler`, or create/update/delete any document in `/adminler`, `/ulkeler`, `/savaslar`, `/ayarlar`, `/instagram`, or `/battle_history`.
2. **Public Spectator Read-Only**: Public visitors can read non-PII live battle state (`/savaslar`), countries (`/ulkeler`), site settings (`/ayarlar`), Instagram follower sync state (`/instagram`), and battle history (`/battle_history`), but have zero write access anywhere.
3. **Strict Schema & Bounds**: Every string field enforces explicit `.size()` bounds; numeric counts enforce finite non-negative bounds; colors enforce hex `#RRGGBB` regex; document IDs enforce `^[a-zA-Z0-9_\-]+$` and `<= 128` chars.
4. **No Shadow Fields**: Every `create` checks `keys().hasAll(...) && keys().hasOnly(...)`; every `update` uses `affectedKeys().hasOnly(...)` combined with `isValid[Entity](incoming())`.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated write to `/savaslar/active` (`{ homeSoldiers: 999999 }`)
2. Unauthenticated read of `/adminler/owner`
3. Authenticated non-admin user attempting to create `/adminler/{selfUid}` with `{ role: 'superadmin' }` (self-escalation)
4. Spoofed email token with `email_verified: false` attempting admin write
5. Shadow field injection (`isVerified: true`) on `/ulkeler/TR`
6. Oversized 1MB string injected into `/ulkeler/TR.name`
7. Invalid hex color (`"red; DROP TABLE"`) on `/ulkeler/TR.color`
8. Negative soldier count (`-500`) on `/savaslar/active.opponentSoldiers`
9. Invalid battle status (`"hacked"`) on `/savaslar/active.status`
10. Document ID poisoning (`/ulkeler/../../adminler/x` or 500-char ID)
11. Unauthenticated deletion of `/battle_history/rec1`
12. Invalid `soldiersPerFollower` (`0` or `999999`) on `/ayarlar/global`
