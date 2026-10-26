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
// A division needs at least this many guilds before promotion/relegation kicks in.
// With 2, the "zones can't overlap" guard still ensures only one guild moves (the
// clear winner promotes / the clear loser relegates) rather than the whole division.
const MIN_TIER_SIZE_FOR_MOVEMENT = 2;

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
  guildId: string;
  name: string;
  tag: string;
  tier: number;
  points: number;
}
type Outcome = 'promoted' | 'relegated' | 'stayed';
interface Move { s: Standing; newTier: number; rank: number; tierSize: number; outcome: Outcome; }

/**
 * Reads every guild's final score for `endingSeason` and works out who promotes,
 * relegates or stays — the top/bottom 25% of each division (League 1 never
 * relegates, League 6 never promotes; a guild on 0 points never promotes). Pure:
 * it only reads, so it's shared by the real rollover and the dry-run simulation.
 */
async function buildRolloverMoves(endingSeason: string): Promise<Move[]> {
  const guildsSnap = await db.collection('guilds').get();

  const standings: Standing[] = [];
  for (const g of guildsSnap.docs) {
    const scoreSnap = await g.ref.collection('seasonScores').where('seasonId', '==', endingSeason).get();
    const points = scoreSnap.docs.reduce((sum, d) => sum + (Number(d.get('score')) || 0), 0);
    const rawTier = Number(g.get('leagueTier')) || LEAGUE_MIN_TIER;
    const tier = Math.min(LEAGUE_MAX_TIER, Math.max(LEAGUE_MIN_TIER, rawTier));
    standings.push({
      ref: g.ref, guildId: g.id, name: String(g.get('name') ?? ''), tag: String(g.get('tag') ?? ''), tier, points,
    });
  }

  const byTier = new Map<number, Standing[]>();
  for (const s of standings) {
    const arr = byTier.get(s.tier);
    if (arr) arr.push(s);
    else byTier.set(s.tier, [s]);
  }

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
  return moves;
}

/** Serialisable view of a move, for returning a rollover plan to the dashboard. */
function planView(m: Move) {
  return {
    guildId: m.s.guildId, name: m.s.name, tag: m.s.tag,
    tier: m.s.tier, newTier: m.newTier, outcome: m.outcome,
    points: m.s.points, rank: m.rank, tierSize: m.tierSize,
  };
}

/** The season id of the month after the given one. */
function nextSeason(seasonId: string): string {
  const [y, m] = seasonId.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * Resolve one month of promotion/relegation.
 *
 * Reads each guild's final score for `endingSeason` from its per-season score docs,
 * moves the top/bottom 25% of each division (League 1 never relegates, League 6
 * never promotes; a guild on 0 points never promotes), archives the result under
 * guilds/{id}/history/{season}, and rolls every guild into `newSeason` with a clean
 * slate. Claims a lock at leagueRollovers/{endingSeason} so it runs at most once.
 */
async function rolloverLeagues(endingSeason: string, newSeason: string, opts?: { force?: boolean }) {
  const lockRef = db.doc(`leagueRollovers/${endingSeason}`);
  if ((await lockRef.get()).exists && !opts?.force) {
    logger.info('League rollover already handled', { endingSeason });
    return { skipped: true as const, endingSeason };
  }
  // Claim first so an overlapping/retried run can't apply the moves twice.
  await lockRef.set({
    endingSeason, newSeason, status: 'running',
    startedAt: FieldValue.serverTimestamp(), ...(opts?.force ? { forced: true } : {}),
  });

  const moves = await buildRolloverMoves(endingSeason);

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

/**
 * Admin: simulate ending the *current* season to see the division split.
 *
 * Default (`dryRun: true`) changes nothing — it returns the projected moves
 * (who promotes/relegates/stays) from the live standings, so you can preview the
 * split. With `dryRun: false` it actually runs the rollover on the current season
 * into the next one (forced past the monthly lock), moving tiers and resetting
 * points — the same thing the monthly cron does, just early.
 *
 * Note: a division needs at least ${MIN_TIER_SIZE_FOR_MOVEMENT} guilds before any
 * promotion/relegation happens, so with only a few test guilds nothing may move.
 */
export const simulateLeagueRollover = onCall({ region: REGION, maxInstances: 1, timeoutSeconds: 540 }, async (req) => {
  await requireAdmin(req, 'de league-afrekening simuleren');
  const dryRun = (req.data as { dryRun?: unknown })?.dryRun !== false; // safe default: preview only
  const season = seasonIdFor(new Date());

  const moves = await buildRolloverMoves(season);
  const plan = moves.map(planView).sort((a, b) => a.tier - b.tier || a.rank - b.rank);
  const promoted = plan.filter((p) => p.outcome === 'promoted').length;
  const relegated = plan.filter((p) => p.outcome === 'relegated').length;
  const minTierSize = MIN_TIER_SIZE_FOR_MOVEMENT;

  if (dryRun) {
    return { dryRun: true, season, minTierSize, promoted, relegated, moves: plan };
  }

  const newSeason = nextSeason(season);
  const summary = await rolloverLeagues(season, newSeason, { force: true });
  return { dryRun: false, season, newSeason, minTierSize, promoted, relegated, moves: plan, summary };
});

/**
 * Admin: completely reset the divisions. Puts every guild back in the lowest
 * league with 0 season points, and (by default) wipes each guild's per-member
 * score docs and season history plus the rollover locks — a clean slate.
 *
 * Params (all optional): `clearScores` (default true) deletes the seasonScores
 * subcollections; `clearHistory` (default true) deletes the history subcollections
 * and the leagueRollovers lock docs so rollovers can run again from scratch.
 *
 * Note: this does not touch the `beers` collection, so the next time a member logs
 * their contribution is recomputed from their real history.
 */
export const resetLeagues = onCall({ region: REGION, maxInstances: 1, timeoutSeconds: 540 }, async (req) => {
  await requireAdmin(req, 'de divisies resetten');
  const data = (req.data ?? {}) as { clearScores?: unknown; clearHistory?: unknown };
  const clearScores = data.clearScores !== false;
  const clearHistory = data.clearHistory !== false;
  const season = seasonIdFor(new Date());

  const guildsSnap = await db.collection('guilds').get();
  let batch = db.batch();
  let ops = 0;
  const flush = async (force = false) => {
    if (ops >= 400 || (force && ops > 0)) { await batch.commit(); batch = db.batch(); ops = 0; }
  };

  let scoresDeleted = 0;
  let historyDeleted = 0;
  for (const g of guildsSnap.docs) {
    batch.update(g.ref, { leagueTier: LEAGUE_MIN_TIER, seasonId: season, seasonPoints: 0 });
    ops++; await flush();

    if (clearScores) {
      const scores = await g.ref.collection('seasonScores').get();
      for (const d of scores.docs) { batch.delete(d.ref); ops++; scoresDeleted++; await flush(); }
    }
    if (clearHistory) {
      const hist = await g.ref.collection('history').get();
      for (const d of hist.docs) { batch.delete(d.ref); ops++; historyDeleted++; await flush(); }
    }
  }
  await flush(true);

  let locksDeleted = 0;
  if (clearHistory) {
    const locks = await db.collection('leagueRollovers').get();
    let lb = db.batch();
    let lops = 0;
    for (const d of locks.docs) {
      lb.delete(d.ref); lops++; locksDeleted++;
      if (lops >= 400) { await lb.commit(); lb = db.batch(); lops = 0; }
    }
    if (lops > 0) await lb.commit();
  }

  logger.info('Leagues reset', { guilds: guildsSnap.size, scoresDeleted, historyDeleted, locksDeleted, clearScores, clearHistory });
  return { guilds: guildsSnap.size, scoresDeleted, historyDeleted, locksDeleted, season };
});

/**
 * Admin one-off: remove legacy per-member score docs (keyed by uid, from before
 * we switched to `${seasonId}__${uid}`) and recompute each guild's denormalised
 * seasonPoints counting every member once. Safe to run repeatedly.
 */
export const cleanupGuildScores = onCall({ region: REGION, maxInstances: 1, timeoutSeconds: 540 }, async (req) => {
  await requireAdmin(req, 'guildscores opschonen');
  const season = seasonIdFor(new Date());
  const guildsSnap = await db.collection('guilds').get();
  let legacyDeleted = 0;
  for (const g of guildsSnap.docs) {
    const scores = await g.ref.collection('seasonScores').get();
    for (const d of scores.docs) {
      if (!d.id.includes('__')) { await d.ref.delete(); legacyDeleted++; }
    }
    // Recompute the current-season total from the remaining per-season docs,
    // one entry per member.
    const byUid = new Map<string, number>();
    for (const d of scores.docs) {
      if (!d.id.includes('__') || d.get('seasonId') !== season) continue;
      byUid.set(String(d.get('uid') ?? d.id), Number(d.get('score')) || 0);
    }
    const total = [...byUid.values()].reduce((sum, v) => sum + v, 0);
    await g.ref.update({ seasonPoints: total, seasonId: season });
  }
  logger.info('Guild score cleanup done', { guilds: guildsSnap.size, legacyDeleted, season });
  return { guilds: guildsSnap.size, legacyDeleted, season };
});

/* ---------------- Guild events ---------------- */

const EVENT_TITLE_MAX = 60;
const EVENT_DESC_MAX = 240;
const EVENT_MAX_DAYS = 60;
const EVENT_STANDINGS_MAX = 50; // keep the event doc small

type EventMetric = 'volume' | 'count';
type EventScope = 'guild' | 'solo';
type EventStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

interface GuildStanding {
  guildId: string; name: string; tag: string; color: string;
  value: number; contributors: number; topContributor: string;
}
interface SoloStanding {
  uid: string; username: string; guildId: string; guildName: string; value: number;
}

/** Human label for an event metric total, e.g. "1.250 cl" or "42 biertjes". */
function metricPhrase(metric: EventMetric, value: number): string {
  return metric === 'volume'
    ? `${Math.round(value)} cl`
    : `${value} ${value === 1 ? 'biertje' : 'biertjes'}`;
}

/**
 * Builds the member index (uid -> guild) from the guilds' member subcollections,
 * tallies every beer logged inside [start, end] per member, then rolls those up
 * into both solo and per-guild standings. Only beers from guild members count.
 */
async function computeEventStandings(
  metric: EventMetric,
  start: Timestamp,
  end: Timestamp,
): Promise<{ guilds: GuildStanding[]; solo: SoloStanding[]; memberUids: string[] }> {
  const guildsSnap = await db.collection('guilds').get();
  const guildMeta = new Map<string, { name: string; tag: string; color: string }>();
  const memberToGuild = new Map<string, string>();
  const usernameByUid = new Map<string, string>();

  for (const g of guildsSnap.docs) {
    guildMeta.set(g.id, {
      name: String(g.get('name') ?? ''),
      tag: String(g.get('tag') ?? ''),
      color: String(g.get('color') ?? '#9CA3AF'),
    });
    const members = await g.ref.collection('members').get();
    for (const m of members.docs) {
      const uid = String(m.get('uid') ?? m.id);
      memberToGuild.set(uid, g.id);
      usernameByUid.set(uid, String(m.get('username') ?? ''));
    }
  }

  // Tally beers in the window. Single-field range → no composite index needed.
  const beersSnap = await db.collection('beers')
    .where('timestamp', '>=', start)
    .where('timestamp', '<=', end)
    .get();

  const soloVal = new Map<string, number>();
  for (const b of beersSnap.docs) {
    const uid = String(b.get('userId') ?? '');
    if (!uid || !memberToGuild.has(uid)) continue; // only guild members compete
    const inc = metric === 'volume' ? (Number(b.get('volume')) || 0) : 1;
    soloVal.set(uid, (soloVal.get(uid) ?? 0) + inc);
  }

  const solo: SoloStanding[] = [...soloVal.entries()]
    .map(([uid, value]) => {
      const gid = memberToGuild.get(uid) ?? '';
      return {
        uid, value,
        username: usernameByUid.get(uid) ?? '',
        guildId: gid,
        guildName: guildMeta.get(gid)?.name ?? '',
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, EVENT_STANDINGS_MAX);

  const perGuild = new Map<string, { value: number; contributors: number; topUid: string; topVal: number }>();
  for (const [uid, value] of soloVal) {
    const gid = memberToGuild.get(uid) ?? '';
    const cur = perGuild.get(gid) ?? { value: 0, contributors: 0, topUid: '', topVal: 0 };
    cur.value += value;
    cur.contributors += 1;
    if (value > cur.topVal) { cur.topVal = value; cur.topUid = uid; }
    perGuild.set(gid, cur);
  }

  const guilds: GuildStanding[] = [...perGuild.entries()]
    .map(([gid, v]) => {
      const meta = guildMeta.get(gid);
      return {
        guildId: gid,
        name: meta?.name ?? '',
        tag: meta?.tag ?? '',
        color: meta?.color ?? '#9CA3AF',
        value: v.value,
        contributors: v.contributors,
        topContributor: usernameByUid.get(v.topUid) ?? '',
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, EVENT_STANDINGS_MAX);

  return { guilds, solo, memberUids: [...memberToGuild.keys()] };
}

/** Sends an event announcement to the given guild members via the shared sender. */
async function announceToMembers(
  memberUids: string[],
  title: string,
  body: string,
  ev: { id: string; createdByUid?: string; createdByEmail?: string },
) {
  if (!memberUids.length) return;
  await deliver({
    uids: memberUids,
    title: title.slice(0, 120),
    body: body.slice(0, 300),
    audienceLabel: 'Guild event',
    sentByUid: String(ev.createdByUid ?? ''),
    sentByEmail: String(ev.createdByEmail ?? ''),
  });
}

function validateEvent(data: Record<string, unknown>) {
  const title = String(data.title ?? '').trim();
  const description = String(data.description ?? '').trim();
  const metric: EventMetric = data.metric === 'count' ? 'count' : 'volume';
  const scope: EventScope = data.scope === 'solo' ? 'solo' : 'guild';
  const startMs = Number(data.startAt);
  const endMs = Number(data.endAt);
  const notifyOnStart = data.notifyOnStart !== false;
  const notifyOnEnd = data.notifyOnEnd !== false;

  if (!title || title.length > EVENT_TITLE_MAX) {
    throw new HttpsError('invalid-argument', `De titel moet 1 tot ${EVENT_TITLE_MAX} tekens zijn.`);
  }
  if (description.length > EVENT_DESC_MAX) {
    throw new HttpsError('invalid-argument', `De omschrijving mag maximaal ${EVENT_DESC_MAX} tekens zijn.`);
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new HttpsError('invalid-argument', 'Kies een geldige start- en einddatum.');
  }
  if (endMs <= startMs) {
    throw new HttpsError('invalid-argument', 'Het einde moet na de start liggen.');
  }
  if (endMs - startMs > EVENT_MAX_DAYS * 86_400_000) {
    throw new HttpsError('invalid-argument', `Een event mag maximaal ${EVENT_MAX_DAYS} dagen duren.`);
  }
  if (endMs < Date.now()) {
    throw new HttpsError('invalid-argument', 'Het einde ligt al in het verleden.');
  }
  return { title, description, metric, scope, startMs, endMs, notifyOnStart, notifyOnEnd };
}

/** Admin: create a guild event. */
export const createGuildEvent = onCall({ region: REGION, maxInstances: 2 }, async (req) => {
  const uid = await requireAdmin(req, 'events aanmaken');
  const v = validateEvent((req.data ?? {}) as Record<string, unknown>);
  const ref = await db.collection('events').add({
    title: v.title,
    description: v.description,
    metric: v.metric,
    scope: v.scope,
    startAt: Timestamp.fromMillis(v.startMs),
    endAt: Timestamp.fromMillis(v.endMs),
    status: 'scheduled' as EventStatus,
    notifyOnStart: v.notifyOnStart,
    notifyOnEnd: v.notifyOnEnd,
    guildStandings: [],
    soloStandings: [],
    createdByUid: uid,
    createdByEmail: req.auth?.token.email ?? '',
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

/** Admin: cancel an event (stops any further activation/notifications). */
export const cancelGuildEvent = onCall({ region: REGION, maxInstances: 2 }, async (req) => {
  const uid = await requireAdmin(req, 'events annuleren');
  const id = String((req.data as { id?: unknown })?.id ?? '');
  if (!id) throw new HttpsError('invalid-argument', 'Geen event gekozen.');
  await db.doc(`events/${id}`).update({
    status: 'cancelled' as EventStatus,
    cancelledByUid: uid,
    cancelledAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/** Admin: delete an event entirely. */
export const deleteGuildEvent = onCall({ region: REGION, maxInstances: 2 }, async (req) => {
  await requireAdmin(req, 'events verwijderen');
  const id = String((req.data as { id?: unknown })?.id ?? '');
  if (!id) throw new HttpsError('invalid-argument', 'Geen event gekozen.');
  await db.doc(`events/${id}`).delete();
  return { ok: true };
});

/** Admin: recompute an event's standings right now (handy while testing). */
export const recomputeGuildEvent = onCall({ region: REGION, maxInstances: 1, timeoutSeconds: 300 }, async (req) => {
  await requireAdmin(req, 'eventstanden herberekenen');
  const id = String((req.data as { id?: unknown })?.id ?? '');
  if (!id) throw new HttpsError('invalid-argument', 'Geen event gekozen.');
  const snap = await db.doc(`events/${id}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Dit event bestaat niet meer.');
  const ev = snap.data()!;
  const st = await computeEventStandings(ev.metric as EventMetric, ev.startAt as Timestamp, ev.endAt as Timestamp);
  await snap.ref.update({ guildStandings: st.guilds, soloStandings: st.solo, lastComputedAt: FieldValue.serverTimestamp() });
  return { guilds: st.guilds.length, solo: st.solo.length };
});

/** Admin: send the start announcement by hand, regardless of schedule. */
export const announceGuildEvent = onCall({ region: REGION, maxInstances: 2, timeoutSeconds: 120 }, async (req) => {
  await requireAdmin(req, 'events aankondigen');
  const id = String((req.data as { id?: unknown })?.id ?? '');
  if (!id) throw new HttpsError('invalid-argument', 'Geen event gekozen.');
  const snap = await db.doc(`events/${id}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Dit event bestaat niet meer.');
  const ev = snap.data()!;
  const st = await computeEventStandings(ev.metric as EventMetric, ev.startAt as Timestamp, ev.endAt as Timestamp);
  const what = ev.metric === 'volume' ? 'meeste volume' : 'meeste biertjes';
  await announceToMembers(
    st.memberUids,
    `🏆 ${ev.title}`,
    `${ev.description || `Strijd om het ${what}!`} Doe mee met je guild.`,
    { id, createdByUid: ev.createdByUid, createdByEmail: ev.createdByEmail },
  );
  await snap.ref.update({ startNotifiedAt: FieldValue.serverTimestamp() });
  return { notified: st.memberUids.length };
});

/**
 * Drives every event forward: activates scheduled events whose start has passed
 * (sending the start push to guild members), refreshes standings while an event
 * is running, and ends events whose window has closed (sending the results push).
 * Runs every 15 minutes.
 */
export const runGuildEvents = onSchedule(
  { region: REGION, schedule: 'every 15 minutes', timeZone: 'Europe/Amsterdam', timeoutSeconds: 540 },
  async () => {
    const snap = await db.collection('events').where('status', 'in', ['scheduled', 'active']).get();
    const nowMs = Date.now();

    for (const doc of snap.docs) {
      const ev = doc.data();
      const startAt = ev.startAt as Timestamp | undefined;
      const endAt = ev.endAt as Timestamp | undefined;
      if (!startAt || !endAt) continue;

      const started = startAt.toMillis() <= nowMs;
      const finished = endAt.toMillis() <= nowMs;
      const update: Record<string, unknown> = {};
      let status = ev.status as EventStatus;

      try {
        if (status === 'scheduled' && started) {
          status = 'active';
          update.status = 'active';
          update.activatedAt = FieldValue.serverTimestamp();
        }

        // Standings (needed both to display and for the end announcement).
        let standings: Awaited<ReturnType<typeof computeEventStandings>> | null = null;
        if (started) {
          standings = await computeEventStandings(ev.metric as EventMetric, startAt, endAt);
          update.guildStandings = standings.guilds;
          update.soloStandings = standings.solo;
          update.lastComputedAt = FieldValue.serverTimestamp();
        }

        // Start push: once, while the event is genuinely live.
        if (ev.notifyOnStart && !ev.startNotifiedAt && started && !finished && standings) {
          const what = ev.metric === 'volume' ? 'meeste volume' : 'meeste biertjes';
          await announceToMembers(
            standings.memberUids,
            `🏆 ${ev.title}`,
            `${ev.description || `Strijd om het ${what}!`} Doe mee met je guild.`,
            { id: doc.id, createdByUid: ev.createdByUid, createdByEmail: ev.createdByEmail },
          );
          update.startNotifiedAt = FieldValue.serverTimestamp();
        }

        if (finished && status !== 'ended') {
          status = 'ended';
          update.status = 'ended';
          update.endedAt = FieldValue.serverTimestamp();
        }

        // End push with the winner.
        if (finished && ev.notifyOnEnd && !ev.endNotifiedAt && standings) {
          const scope = (ev.scope === 'solo' ? 'solo' : 'guild') as EventScope;
          let line: string;
          if (scope === 'solo') {
            const top = standings.solo[0];
            line = top
              ? `🥇 ${top.username} wint met ${metricPhrase(ev.metric as EventMetric, top.value)}!`
              : 'Het event is afgelopen.';
          } else {
            const top = standings.guilds[0];
            line = top
              ? `🥇 ${top.name} wint met ${metricPhrase(ev.metric as EventMetric, top.value)}!`
              : 'Het event is afgelopen.';
          }
          await announceToMembers(
            standings.memberUids,
            `🏁 ${ev.title} — uitslag`,
            line,
            { id: doc.id, createdByUid: ev.createdByUid, createdByEmail: ev.createdByEmail },
          );
          update.endNotifiedAt = FieldValue.serverTimestamp();
        }

        if (Object.keys(update).length) await doc.ref.update(update);
      } catch (err) {
        logger.error('runGuildEvents failed for event', { id: doc.id, err });
      }
    }
  },
);
