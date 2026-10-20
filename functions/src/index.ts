import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

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

/**
 * Stuurt een pushbericht naar BrewMate-gebruikers. Alleen voor beheerders (admins/{uid}).
 * Gebruikers met pushmeldingen uit (notifyPushEnabled === false) worden overgeslagen.
 */
export const sendPush = onCall({ region: 'europe-west1', maxInstances: 2, timeoutSeconds: 120 }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Log eerst in.');
  const adminDoc = await db.doc(`admins/${uid}`).get();
  if (!adminDoc.exists) throw new HttpsError('permission-denied', 'Alleen beheerders kunnen berichten sturen.');

  const data = (req.data ?? {}) as Partial<SendPushRequest>;
  const title = String(data.title ?? '').trim();
  const body = String(data.body ?? '').trim();
  const uids = Array.isArray(data.uids) ? [...new Set(data.uids.filter((x): x is string => typeof x === 'string' && !!x))] : [];
  if (!title || title.length > TITLE_MAX) throw new HttpsError('invalid-argument', `De titel moet 1 tot ${TITLE_MAX} tekens zijn.`);
  if (!body || body.length > BODY_MAX) throw new HttpsError('invalid-argument', `Het bericht moet 1 tot ${BODY_MAX} tekens zijn.`);
  if (!uids.length) throw new HttpsError('invalid-argument', 'Kies minstens één ontvanger.');
  if (uids.length > MAX_RECIPIENTS) throw new HttpsError('invalid-argument', `Maximaal ${MAX_RECIPIENTS} ontvangers per bericht.`);

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
    audienceLabel: String(data.audienceLabel ?? '').slice(0, 80),
    sentByUid: uid,
    sentByEmail: req.auth?.token.email ?? '',
    sentAt: FieldValue.serverTimestamp(),
    ...summary,
  });

  return summary;
});
