import { useEffect, useState } from 'react';
import { Linking, ScrollView, Switch, Text, View } from 'react-native';
import { GoogleSheetCard } from '@/components/GoogleSheetCard';
import { Button, Card, Chip, ErrorBox, Muted, Row, styles } from '@/components/ui';
import { exportCsv, exportXlsx, pickAndImport } from '@/db/exchange';
import { requestSync } from '@/db/sync';
import { installedCode, loadApkChecksOff, saveApkChecksOff } from '@/lib/apkUpdate';
import buildInfo from '@/lib/buildInfo.json';
import { DAY_ENDS, DAY_STARTS, setDisplayMode, useDisplayMode, useThemeName, type DisplayMode } from '@/lib/displayMode';
import { REPO_URL, SUPPORT_EMAIL } from '@/lib/links';
import { colors } from '@/lib/theme';
import { NARROW_PAGE, page } from '@/lib/useLayout';
import { setWelcomeSeen } from '@/lib/welcome';

const DISPLAY_MODES: [DisplayMode, string][] = [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Light by day, dark at night']];
const SUPPORT_MAIL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Recommendation Journal feedback (build ${buildInfo.build})`)}`;
const hour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

export default function SettingsScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<'xlsx' | 'csv' | 'import' | null>(null);
  const display = useDisplayMode();
  const [apkChecks, setApkChecks] = useState(true);
  useEffect(() => { loadApkChecksOff().then((off) => setApkChecks(!off), () => {}); }, []);

  const run = async (what: 'xlsx' | 'csv' | 'import', fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const importFile = () => run('import', async () => {
    setImportMsg(null);
    const r = await pickAndImport();
    if (!r) return;
    requestSync();
    setImportMsg(
      `Added ${r.added} recommendation${r.added === 1 ? '' : 's'}` +
      (r.skipped ? ` · ${r.skipped} already on your list (kept as is)` : '') +
      (r.categoriesAdded.length ? ` · new categories: ${r.categoriesAdded.join(', ')}` : '') +
      (r.added + r.skipped === 0 ? '. No rows with a Title (or Name) column were found.' : '.'),
    );
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, page(NARROW_PAGE)]}>
      {error && <ErrorBox message={error} />}

      <Card title="Display">
        <View style={styles.chips}>
          {DISPLAY_MODES.map(([m, label]) => (
            <Chip key={m} label={label} selected={display === m} onPress={() => setDisplayMode(m).catch((e) => setError((e as Error).message))} />
          ))}
        </View>
        <Muted>
          {display === 'auto'
            ? `Light from ${hour(DAY_STARTS)} to ${hour(DAY_ENDS)}, dark the rest of the time.`
            : display === 'light' ? 'Light all the time.' : 'Dark all the time, easy on the eyes.'}
        </Muted>
      </Card>

      <GoogleSheetCard />

      <Card title="Your data">
        <Muted>Everything is stored only on this device.</Muted>
        <Muted>
          Export as a spreadsheet (.xlsx) with one tab per category, for Google Sheets / Excel, or as one .csv
          file for backups and moving to a new device.
        </Muted>
        {/* Side by side when there's room, one above the other on a phone. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexGrow: 1, flexBasis: 220 }}><Button title="Export .xlsx (recommended)" onPress={() => run('xlsx', exportXlsx)} busy={busy === 'xlsx'} small /></View>
          <View style={{ flexGrow: 1, flexBasis: 220 }}><Button title="Export .csv" onPress={() => run('csv', exportCsv)} busy={busy === 'csv'} small /></View>
        </View>
        <Muted>
          Import an .xlsx or .csv: an export from this app, or your own list. Columns are found by name (Title or
          Name, Status, Rating, Recommended by, Why or Notes…), each tab becomes a category, and things already on
          your list are skipped.
        </Muted>
        <Button title="Import .xlsx or .csv" onPress={importFile} busy={busy === 'import'} small color={colors.chip} textColor={colors.text} />
        {importMsg && <Text style={{ color: colors.success }}>{importMsg}</Text>}
      </Card>

      <Card title="Welcome screen">
        <Muted>The short overview of what the app is for, shown the first time you opened it.</Muted>
        <Button title="Show the welcome again" onPress={() => setWelcomeSeen(false)} small
          color={colors.chip} textColor={colors.text} />
      </Card>

      <Card title="Help">
        <Muted>Found a problem, or have an idea for a feature?</Muted>
        <Muted>
          Email{' '}
          <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} accessibilityRole="link" selectable
            onPress={() => Linking.openURL(SUPPORT_MAIL).catch(() => {})}>{SUPPORT_EMAIL}</Text>
          {' '}with what happened. You can attach your recommendations as a spreadsheet: it helps with problems.
          Look it over first and remove anything you’d rather keep private, like your notes.
        </Muted>
        <Button title="Export your recommendations to attach (.xlsx)" onPress={() => run('xlsx', exportXlsx)} busy={busy === 'xlsx'}
          small color={colors.chip} textColor={colors.text} />
        <Muted>
          Or create a public issue on{' '}
          <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} accessibilityRole="link"
            onPress={() => Linking.openURL(`${REPO_URL}/issues`).catch(() => {})}>
            {REPO_URL.replace('https://', '')}/issues
          </Text>
          . Don’t attach your spreadsheet there: everyone can see it.
        </Muted>
      </Card>

      <Card title="About">
        {/* The build number goes up with every release (scripts/release.js): compare it between devices. */}
        <Text style={{ color: colors.text }} selectable>
          Recommendation Journal {buildInfo.version} · build {buildInfo.build}
        </Text>
        <Muted>Published {buildInfo.date || 'from a development copy'}</Muted>
        {installedCode() !== null && (
          <>
            <Row label="Check for new Android versions">
              <Switch value={apkChecks} trackColor={{ true: colors.accent }}
                onValueChange={(v) => { setApkChecks(v); saveApkChecksOff(!v).catch(() => {}); }} />
            </Row>
            <Muted>Asks GitHub once a day. GitHub can see your internet address, but nothing about you or your list is sent.</Muted>
          </>
        )}
        <Muted>
          Project page and source code:{' '}
          <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} accessibilityRole="link"
            onPress={() => Linking.openURL(REPO_URL).catch(() => {})}>
            {REPO_URL.replace('https://', '')}
          </Text>
        </Muted>
      </Card>
    </ScrollView>
  );
}
