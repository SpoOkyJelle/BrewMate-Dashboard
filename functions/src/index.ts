import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot, type DocumentReference } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_RECIPIENTS = 2000;
const TITLE_MAX = 65;
const BODY_MAX = 240;

interface SendPushRequest {
  uids: string[];
  title: string;
  body: string;
  /** Korte omschrijving voor het logboek, bijv. "Actief (30 dagen)". */
  audienceLabel?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

const isExpoToken = (t: unknown): t is string =>
  typeof t === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(t);

/** Gooit een fout als de aanroeper geen beheerder is; geeft anders de uid terug. */
async function requireAdmin(req: CallableRequest, what: string): Promise<string> {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Log eerst in.');
  const adminDoc = await db.doc(`admins/${uid}`).get();
  if (!adminDoc.exists) throw new HttpsError('permission-denied', `Alleen beheerders kunnen ${what}.`);
  return uid;
}

/** Controleert titel, tekst en ontvangers. Gebruikt bij direct versturen én bij inplannen. */
function validateMessage(data: Partial<SendPushRequest>) {
  const title = String(data.title ?? '').trim();
  const body = String(data.body ?? '').trim();
  const uids = Array.isArray(data.uids) ? [...new Set(data.uids.filter((x): x is string => typeof x === 'string' && !!x))] : [];
  if (!title || title.length > TITLE_MAX) throw new HttpsError('invalid-argument', `De titel moet 1 tot ${TITLE_MAX} tekens zijn.`);
  if (!body || body.length > BODY_MAX) throw new HttpsError('invalid-argument', `Het bericht moet 1 tot ${BODY_MAX} tekens zijn.`);
  if (!uids.length) throw new HttpsError('invalid-argument', 'Kies minstens één ontvanger.');
  if (uids.length > MAX_RECIPIENTS) throw new HttpsError('invalid-argument', `Maximaal ${MAX_RECIPIENTS} ontvangers per bericht.`);
  return { title, body, uids, audienceLabel: String(data.audienceLabel ?? '').slice(0, 80) };
}

/**
 * Stuurt een pushbericht naar BrewMate-gebruikers. Alleen voor beheerders (admins/{uid}).
 * Gebruikers met pushmeldingen uit (notifyPushEnabled === false) worden overgeslagen.
 */
export const sendPush = onCall({ region: REGION, maxInstances: 2, timeoutSeconds: 120 }, async (req) => {
  const uid = await requireAdmin(req, 'berichten sturen');
  const msg = validateMessage((req.data ?? {}) as Partial<SendPushRequest>);
  return deliver({ ...msg, sentByUid: uid, sentByEmail: req.auth?.token.email ?? '' });
});

interface DeliverInput {
  uids: string[];
  title: string;
  body: string;
  audienceLabel: string;
  sentByUid: string;
  sentByEmail: string;
  scheduledId?: string;
}

/** Verstuurt via Expo, ruimt verlopen tokens op en schrijft het resultaat naar pushLog. */
async function deliver({ uids, title, body, audienceLabel, sentByUid, sentByEmail, scheduledId }: DeliverInput) {

  // Gebruikers ophalen (in delen, getAll heeft een limiet).
  const snaps: DocumentSnapshot[] = [];
  for (let i = 0; i < uids.length; i += 300) {
    snaps.push(...(await db.getAll(...uids.slice(i, i + 300).map((id) => db.doc(`users/${id}`)))));
  }

  let skippedOptOut = 0;
  let skippedNoToken = 0;
  const targets: { uid: string; token: string }[] = [];
  for (const s of snaps) {
    const u = s.data();
    if (!u) { skippedNoToken++; continue; }
    if (u.notifyPushEnabled === false) { skippedOptOut++; continue; }
    if (!isExpoToken(u.expoPushToken)) { skippedNoToken++; continue; }
    targets.push({ uid: s.id, token: u.expoPushToken });
  }

  // Versturen in groepjes van 100 (limiet van Expo).
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  let delivered = 0;
  let failed = 0;
  const expired: string[] = [];
  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk.map((t) => ({ to: t.token, title, body, sound: 'default', data: { type: 'admin_message' } }))),
      });
      const json = (await res.json()) as { data?: ExpoTicket[]; errors?: unknown[] };
      if (!res.ok || !Array.isArray(json.data)) {
        logger.error('Expo push failed', { status: res.status, errors: json.errors });
        failed += chunk.length;
        continue;
      }
      json.data.forEach((ticket, j) => {
        if (ticket.status === 'ok') delivered++;
        else {
          failed++;
          if (ticket.details?.error === 'DeviceNotRegistered') expired.push(chunk[j].uid);
        }
      });
    } catch (err) {
      logger.error('Expo push request error', err);
      failed += chunk.length;
    }
  }

  // Tokens van apparaten die de app niet meer hebben opruimen.
  await Promise.all(expired.map((id) => db.doc(`users/${id}`).update({ expoPushToken: FieldValue.delete() }).catch(() => {})));

  const summary = {
    requested: uids.length,
    eligible: targets.length,
    delivered,
    failed,
    skippedOptOut,
    skippedNoToken,
    expiredTokensRemoved: expired.length,
  };

  await db.collection('pushLog').add({
    title,
    body,
    audienceLabel,
    sentByUid,
    sentByEmail,
    sentAt: FieldValue.serverTimestamp(),
    ...(scheduledId ? { scheduledId } : {}),
    ...summary,
  });

  return summary;
}

/* ---------------- Ingeplande berichten ---------------- */

/**
 * Plant een bericht in. De ontvangers worden nu vastgelegd; het versturen gebeurt door
 * sendScheduledPush, die elke 5 minuten kijkt of er iets klaarstaat.
 */
export const schedulePush = onCall({ region: REGION, maxInstances: 2 }, async (req) => {
  const uid = await requireAdmin(req, 'berichten inplannen');
  const msg = validateMessage((req.data ?? {}) as Partial<SendPushRequest>);
  const sendAtMs = Number((req.data as { sendAt?: unknown })?.sendAt);
  const now = Date.now();
  if (!Number.isFinite(sendAtMs) || sendAtMs < now + 60_000) {
    throw new HttpsError('invalid-argument', 'Kies een moment minstens een minuut in de toekomst.');
  }
  if (sendAtMs > now + 60 * 86_400_000) throw new HttpsError('invalid-argument', 'Je kunt maximaal 60 dagen vooruit plannen.');
  const ref = await db.collection('scheduledPush').add({
    ...msg,
    sendAt: Timestamp.fromMillis(sendAtMs),
    status: 'pending',
    createdByUid: uid,
    createdByEmail: req.auth?.token.email ?? '',
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

/** Annuleert een ingepland bericht dat nog niet verstuurd is. */
export const cancelScheduledPush = onCall({ region: REGION, maxInstances: 2 }, async (req) => {
  const uid = await requireAdmin(req, 'berichten annuleren');
  const id = String((req.data as { id?: unknown })?.id ?? '');
  if (!id) throw new HttpsError('invalid-argument', 'Geen bericht gekozen.');
  const ref = db.doc(`scheduledPush/${id}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Dit bericht bestaat niet meer.');
    if (snap.get('status') !== 'pending') throw new HttpsError('failed-precondition', 'Dit bericht is al verstuurd.');
    tx.update(ref, { status: 'cancelled', cancelledByUid: uid, cancelledAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

/** Verstuurt ingeplande berichten waarvan het moment voorbij is. */
export const sendScheduledPush = onSchedule(
  { region: REGION, schedule: 'every 5 minutes', timeZone: 'Europe/Amsterdam', timeoutSeconds: 300 },
  async () => {
    // Alleen op status filteren: dan is er geen samengestelde index nodig. Er staan er altijd maar weinig klaar.
    const pending = await db.collection('scheduledPush').where('status', '==', 'pending').get();
    const now = Date.now();
    for (const doc of pending.docs) {
      const sendAt = doc.get('sendAt') as Timestamp | undefined;
      if (!sendAt || sendAt.toMillis() > now) continue;
      // Eerst claimen, zodat een overlappende run hetzelfde bericht niet nog eens verstuurt.
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (fresh.get('status') !== 'pending') return false;
        tx.update(doc.ref, { status: 'sending' });
        return true;
      });
      if (!claimed) continue;
      try {
        const d = doc.data();
        const summary = await deliver({
          uids: Array.isArray(d.uids) ? d.uids : [],
          title: String(d.title ?? ''),
          body: String(d.body ?? ''),
          audienceLabel: String(d.audienceLabel ?? ''),
          sentByUid: String(d.createdByUid ?? ''),
          sentByEmail: String(d.createdByEmail ?? ''),
          scheduledId: doc.id,
        });
        await doc.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp(), result: summary });
      } catch (err) {
        logger.error('Scheduled push failed', { id: doc.id, err });
        await doc.ref.update({ status: 'failed', error: String((err as Error)?.message ?? err) });
      }
    }
  },
);

/* ---------------- Moderatie ---------------- */

/** Logboek van moderatie-acties, zodat altijd te zien is wie wat deed. */
async function logModeration(byUid: string, byEmail: string, action: string, details: Record<string, unknown>) {
  await db.collection('moderationLog').add({ action, ...details, byUid, byEmail, at: FieldValue.serverTimestamp() });
}

/** Verwijdert een biertje (bijv. nep of dubbel gelogd). */
export const deleteBeer = onCall({ region: REGION, maxInstances: 2 }, async (req) => {
  const uid = await requireAdmin(req, 'biertjes verwijderen');
  const beerId = String((req.data as { beerId?: unknown })?.beerId ?? '');
  if (!beerId) throw new HttpsError('invalid-argument', 'Geen biertje gekozen.');
  const ref = db.doc(`beers/${beerId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Dit biertje bestaat niet meer.');
  const beer = snap.data()!;
  await ref.delete();
  // Een kopie in het logboek, zodat een verwijdering zo nodig met de hand terug te zetten is.
  await logModeration(uid, req.auth?.token.email ?? '', 'deleteBeer', { beerId, userId: beer.userId ?? null, beer });
  return { ok: true };
});

/**
 * Blokkeert of deblokkeert een gebruiker. Blokkeren zet het Firebase-account uit, zodat de
 * persoon niet meer kan inloggen (een open sessie stopt uiterlijk binnen een uur).
 */
export const setUserBlocked = onCall({ region: REGION, maxInstances: 2 }, async (req) => {
  const uid = await requireAdmin(req, 'gebruikers blokkeren');
  const input = (req.data ?? {}) as { uid?: unknown; blocked?: unknown; reason?: unknown };
  const target = String(input.uid ?? '');
  const blocked = input.blocked === true;
  const reason = String(input.reason ?? '').slice(0, 200);
  if (!target) throw new HttpsError('invalid-argument', 'Geen gebruiker gekozen.');
  if (target === uid) throw new HttpsError('failed-precondition', 'Je kunt jezelf niet blokkeren.');
  if (blocked && (await db.doc(`admins/${target}`).get()).exists) {
    throw new HttpsError('failed-precondition', 'Haal deze persoon eerst weg als beheerder.');
  }

  await getAuth().updateUser(target, { disabled: blocked });
  if (blocked) await getAuth().revokeRefreshTokens(target);

  const email = req.auth?.token.email ?? '';
  const ref = db.doc(`blockedUsers/${target}`);
  if (blocked) await ref.set({ blockedAt: FieldValue.serverTimestamp(), byUid: uid, byEmail: email, reason });
  else await ref.delete();
  await logModeration(uid, email, blocked ? 'block' : 'unblock', { userId: target, reason });
  return { ok: true };
});

/* ---------------- Guild leagues ---------------- */

const LEAGUE_MIN_TIER = 1;
const LEAGUE_MAX_TIER = 6;
const PROMOTE_PCT = 0.25;
const RELEGATE_PCT = 0.25;
// A division needs enough guilds before a top/bottom zone makes sense.
const MIN_TIER_SIZE_FOR_MOVEMENT = 4;

/** "YYYY-MM" for a date in the app's timezone (matches the app's season ids). */
function seasonIdFor(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return `${y}-${m}`;
}

/** The season id of the month before the given one. */
function previousSeason(seasonId: string): string {
  const [y, m] = seasonId.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}`;
}

interface Standing {
  ref: DocumentReference;
  tier: number;
  points: number;
}
type Outcome = 'promoted' | 'relegated' | 'stayed';

/**
 * Resolve one month of promotion/relegation.
 *
 * Reads each guild's final score for `endingSeason` from its per-season score docs,
 * moves the top/bottom 25% of each division (League 1 never relegates, League 6
 * never promotes; a guild on 0 points never promotes), archives the result under
 * guilds/{id}/history/{season}, and rolls every guild into `newSeason` with a clean
 * slate. Claims a lock at leagueRollovers/{endingSeason} so it runs at most once.
 */
async function rolloverLeagues(endingSeason: string, newSeason: string) {
  const lockRef = db.doc(`leagueRollovers/${endingSeason}`);
  if ((await lockRef.get()).exists) {
    logger.info('League rollover already handled', { endingSeason });
    return { skipped: true as const, endingSeason };
  }
  // Claim first so an overlapping/retried run can't apply the moves twice.
  await lockRef.set({ endingSeason, newSeason, status: 'running', startedAt: FieldValue.serverTimestamp() });

  const guildsSnap = await db.collection('guilds').get();

  const standings: Standing[] = [];
  for (const g of guildsSnap.docs) {
    const scoreSnap = await g.ref.collection('seasonScores').where('seasonId', '==', endingSeason).get();
    const points = scoreSnap.docs.reduce((sum, d) => sum + (Number(d.get('score')) || 0), 0);
    const rawTier = Number(g.get('leagueTier')) || LEAGUE_MIN_TIER;
    const tier = Math.min(LEAGUE_MAX_TIER, Math.max(LEAGUE_MIN_TIER, rawTier));
    standings.push({ ref: g.ref, tier, points });
  }

  const byTier = new Map<number, Standing[]>();
  for (const s of standings) {
    const arr = byTier.get(s.tier);
    if (arr) arr.push(s);
    else byTier.set(s.tier, [s]);
  }

  interface Move { s: Standing; newTier: number; rank: number; tierSize: number; outcome: Outcome; }
  const moves: Move[] = [];

  for (const [tier, group] of byTier) {
    group.sort((a, b) => b.points - a.points);
    const n = group.length;
    let promoteCount = 0;
    let relegateCount = 0;
    if (n >= MIN_TIER_SIZE_FOR_MOVEMENT) {
      promoteCount = tier < LEAGUE_MAX_TIER ? Math.max(1, Math.round(n * PROMOTE_PCT)) : 0;
      relegateCount = tier > LEAGUE_MIN_TIER ? Math.max(1, Math.round(n * RELEGATE_PCT)) : 0;
      // Never let the promote and relegate zones overlap.
      while (promoteCount + relegateCount >= n && (promoteCount > 0 || relegateCount > 0)) {
        if (relegateCount >= promoteCount) relegateCount--;
        else promoteCount--;
      }
    }
    group.forEach((s, i) => {
      const rank = i + 1;
      let newTier = tier;
      let outcome: Outcome = 'stayed';
      if (promoteCount > 0 && rank <= promoteCount && s.points > 0) {
        newTier = Math.min(LEAGUE_MAX_TIER, tier + 1);
        outcome = newTier === tier ? 'stayed' : 'promoted';
      } else if (relegateCount > 0 && rank > n - relegateCount) {
        newTier = Math.max(LEAGUE_MIN_TIER, tier - 1);
        outcome = newTier === tier ? 'stayed' : 'relegated';
      }
      moves.push({ s, newTier, rank, tierSize: n, outcome });
    });
  }

  // Archive + reset each guild, batched (Firestore caps a batch at 500 writes).
  let batch = db.batch();
  let ops = 0;
  const flush = async () => { if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; } };
  for (const m of moves) {
    batch.set(m.s.ref.collection('history').doc(endingSeason), {
      season: endingSeason, tier: m.s.tier, newTier: m.newTier,
      finalPoints: m.s.points, rankInTier: m.rank, tierSize: m.tierSize,
      outcome: m.outcome, ranAt: FieldValue.serverTimestamp(),
    });
    ops++; await flush();
    batch.update(m.s.ref, { leagueTier: m.newTier, seasonId: newSeason, seasonPoints: 0 });
    ops++; await flush();
  }
  await batch.commit();

  const promoted = moves.filter((m) => m.outcome === 'promoted').length;
  const relegated = moves.filter((m) => m.outcome === 'relegated').length;
  await lockRef.set(
    { status: 'done', guildsProcessed: moves.length, promoted, relegated, finishedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  logger.info('League rollover complete', { endingSeason, newSeason, guilds: moves.length, promoted, relegated });
  return { skipped: false as const, endingSeason, newSeason, guildsProcessed: moves.length, promoted, relegated };
}

/** Monthly promotion/relegation for the month that just ended (00:10 on the 1st). */
export const monthlyLeagueRollover = onSchedule(
  { region: REGION, schedule: '10 0 1 * *', timeZone: 'Europe/Amsterdam', timeoutSeconds: 540 },
  async () => {
    const newSeason = seasonIdFor(new Date());
    await rolloverLeagues(previousSeason(newSeason), newSeason);
  },
);

/** Admin: run a rollover by hand (testing, or to catch up a missed month). */
export const runLeagueRollover = onCall({ region: REGION, maxInstances: 1, timeoutSeconds: 540 }, async (req) => {
  await requireAdmin(req, 'de league-afrekening draaien');
  const data = (req.data ?? {}) as { endingSeason?: unknown };
  const newSeason = seasonIdFor(new Date());
  const endingSeason = typeof data.endingSeason === 'string' && /^\d{4}-\d{2}$/.test(data.endingSeason)
    ? data.endingSeason
    : previousSeason(newSeason);
  return rolloverLeagues(endingSeason, newSeason);
});
