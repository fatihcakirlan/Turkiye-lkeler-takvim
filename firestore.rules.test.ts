/**
 * Phase 0 Dirty Dozen Security Rule Verification Cases
 * Covers unauthenticated writes, privilege escalation, unverified email spoofing,
 * shadow fields, string size poisoning, invalid hex colors, negative counts, and ID poisoning.
 */
export const DIRTY_DOZEN_TEST_CASES = [
  { name: 'Unauthenticated write to savaslar', collection: 'savaslar/active', auth: null, payload: { homeSoldiers: 999999 } },
  { name: 'Unauthenticated read of adminler', collection: 'adminler/owner', auth: null, op: 'get' },
  { name: 'Self-escalation on adminler', collection: 'adminler/attacker', auth: { uid: 'attacker', email: 'x@example.com', email_verified: true }, payload: { uid: 'attacker', email: 'x@example.com', role: 'superadmin' } },
  { name: 'Unverified email admin spoof', collection: 'ulkeler/TR', auth: { uid: 'spoof', email: 'fatihckr210@gmail.com', email_verified: false }, payload: { code: 'TR' } },
  { name: 'Shadow field injection on ulkeler', collection: 'ulkeler/TR', auth: 'admin', payload: { code: 'TR', name: 'Türkiye', flag: '🇹🇷', soldierCount: 100, color: '#2563EB', modelType: 'infantry', updatedAt: '2026-01-01', isVerified: true } },
  { name: 'Oversized string on ulkeler.name', collection: 'ulkeler/TR', auth: 'admin', payload: { code: 'TR', name: 'A'.repeat(200), flag: '🇹🇷', soldierCount: 100, color: '#2563EB', modelType: 'infantry', updatedAt: '2026-01-01' } },
  { name: 'Invalid hex color on ulkeler.color', collection: 'ulkeler/TR', auth: 'admin', payload: { code: 'TR', name: 'Türkiye', flag: '🇹🇷', soldierCount: 100, color: 'blue', modelType: 'infantry', updatedAt: '2026-01-01' } },
  { name: 'Negative soldier count on savaslar', collection: 'savaslar/active', auth: 'admin', payload: { opponentSoldiers: -500 } },
  { name: 'Invalid battle status enum', collection: 'savaslar/active', auth: 'admin', payload: { status: 'hacked' } },
  { name: 'Document ID poisoning', collection: 'ulkeler/invalid id with spaces', auth: 'admin', payload: {} },
  { name: 'Unauthenticated battle_history deletion', collection: 'battle_history/rec1', auth: null, op: 'delete' },
  { name: 'Out-of-range soldiersPerFollower', collection: 'ayarlar/global', auth: 'admin', payload: { soldiersPerFollower: 0 } }
];
