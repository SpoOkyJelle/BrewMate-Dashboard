import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useData, type Beer, type UserStats } from '../data';
import { checkQuality, QUALITY_LIMITS } from '../quality';
import { Avatar, Card, ConfirmButton } from '../components/ui';
import { IconTrash } from '../components/icons';
import { deleteBeer, functionErrorMessage } from '../moderation';
import { displayName, fmtDateTime, fmtNum, fmtVolume } from '../utils';

const SHOW = 25;

async function removeBeer(id: string) {
  try {
    await deleteBeer(id);
  } catch (err) {
    throw new Error(functionErrorMessage(err, 'deleteBeer'));
  }
}

export default function Quality() {
  const { data, today } = useData();
  // `today` in plaats van `now`: de controle draait niet elke 15 s opnieuw, wel bij elke wijziging in de data.
  const report = useMemo(() => checkQuality(data!, new Date()), [data, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = QUALITY_LIMITS.burstWindowMs / 60_000;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Datakwaliteit</h1>
          <p className="muted">
            Dingen die niet kloppen of verdacht zijn: nep- of dubbel gelogde biertjes, onmogelijke waarden en losse eindjes.
            Verwijderen gaat via een Cloud Function en wordt bijgehouden in het moderatielogboek.
          </p>
        </div>
      </header>

      <dl className="facts">
        <div><dt>Gevonden</dt><dd>{fmtNum(report.total)}</dd></div>
        <div><dt>Verdachte reeksen</dt><dd>{fmtNum(report.bursts.length)}</dd></div>
        <div><dt>Dubbel gelogd</dt><dd>{fmtNum(report.duplicates.length)}</dd></div>
        <div><dt>Zonder gebruiker</dt><dd>{fmtNum(report.orphanBeers.length)}</dd></div>
      </dl>

      {report.total === 0 && (
        <Card><p className="muted">Alles ziet er goed uit. Er zijn geen problemen gevonden.</p></Card>
      )}

      <Section
        title="Veel biertjes in korte tijd"
        hint={`${QUALITY_LIMITS.burstCount} of meer biertjes binnen ${minutes} minuten. Kan echt zijn (feestje), maar ook nep.`}
        count={report.bursts.length}
      >
        <ul className="q-list">
          {report.bursts.slice(0, SHOW).map((b) => {
            const u = data!.usersById.get(b.uid);
            return (
              <li key={b.uid}>
                <UserLink user={u} uid={b.uid} />
                <span><strong>{fmtNum(b.count)}</strong> biertjes</span>
                <span className="muted small">{fmtDateTime(b.from)} – {b.to.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <BeerSection
        title="Waarschijnlijk dubbel gelogd"
        hint={`Dezelfde maat binnen ${QUALITY_LIMITS.duplicateMs / 1000} seconden na het vorige biertje. Alleen de tweede staat hier.`}
        beers={report.duplicates}
        usersById={data!.usersById}
      />
      <BeerSection
        title="Onmogelijke hoeveelheid"
        hint={`0 cl of minder, of meer dan ${fmtVolume(QUALITY_LIMITS.maxCl)} in één keer.`}
        beers={report.oddVolumes}
        usersById={data!.usersById}
      />
      <BeerSection
        title="Tijdstip in de toekomst"
        hint="Meestal een verkeerd ingestelde klok op de telefoon."
        beers={report.futureBeers}
        usersById={data!.usersById}
      />
      <BeerSection
        title="Biertjes zonder tijdstip"
        hint="Tellen niet mee in grafieken per dag."
        beers={report.undatedBeers}
        usersById={data!.usersById}
      />
      <BeerSection
        title="Biertjes van onbekende gebruikers"
        hint="Het account bestaat niet meer. Deze biertjes tellen wel mee in totalen."
        beers={report.orphanBeers}
        usersById={data!.usersById}
      />

      <Section title="Gebruikers zonder gebruikersnaam" hint="Nog niet ingesteld in de app." count={report.usersWithoutName.length}>
        <UserChips users={report.usersWithoutName} />
      </Section>
      <Section title="Gebruikers zonder aanmelddatum" hint="Tellen niet mee bij Behoud en Groei." count={report.usersWithoutCreatedAt.length}>
        <UserChips users={report.usersWithoutCreatedAt} />
      </Section>
    </div>
  );
}

function Section({ title, hint, count, children }: { title: string; hint: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return (
    <Card title={<>{title} <span className="chip-count">{fmtNum(count)}</span></>} hint={hint}>
      {children}
      {count > SHOW && <p className="muted small q-more">En nog {fmtNum(count - SHOW)} meer.</p>}
    </Card>
  );
}

function BeerSection({ title, hint, beers, usersById }: {
  title: string;
  hint: string;
  beers: Beer[];
  usersById: Map<string, UserStats>;
}) {
  // Na verwijderen verdwijnt de rij vanzelf, omdat de live data bijwerkt.
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? beers : beers.slice(0, SHOW);
  if (!beers.length) return null;
  return (
    <Card title={<>{title} <span className="chip-count">{fmtNum(beers.length)}</span></>} hint={hint}>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr><th>Gebruiker</th><th>Wanneer</th><th className="num">Maat</th><th aria-label="Acties" /></tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className="no-hover">
                <td><UserLink user={usersById.get(b.userId)} uid={b.userId} /></td>
                <td>{fmtDateTime(b.date)}</td>
                <td className="num">{fmtVolume(b.volume)}</td>
                <td className="row-actions">
                  <ConfirmButton
                    label={<IconTrash width={15} height={15} />}
                    title="Biertje verwijderen"
                    confirmLabel="Verwijder"
                    className="btn xs"
                    onConfirm={() => removeBeer(b.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {beers.length > SHOW && (
        <button className="link-btn q-more" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Minder tonen' : `Alle ${fmtNum(beers.length)} tonen`}
        </button>
      )}
    </Card>
  );
}

function UserLink({ user, uid }: { user: UserStats | undefined; uid: string }) {
  if (!user) return <code className="muted">{uid.slice(0, 10) || 'onbekend'}</code>;
  return (
    <Link to={`/users/${uid}`} className="lb-user">
      <Avatar url={user.photoUrl} name={displayName(user)} size={26} />
      <span className="lb-name">{displayName(user)}</span>
    </Link>
  );
}

function UserChips({ users }: { users: UserStats[] }) {
  return (
    <div className="q-chips">
      {users.slice(0, SHOW).map((u) => (
        <Link key={u.uid} to={`/users/${u.uid}`} className="cmp-chip">
          <Avatar url={u.photoUrl} name={displayName(u)} size={22} />
          <span>{displayName(u)}</span>
        </Link>
      ))}
    </div>
  );
}
